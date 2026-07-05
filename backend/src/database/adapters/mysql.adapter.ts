import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { DatabaseAdapter, PoolClientLike, QueryResult } from './types';
import { translateQuery, ReturningPlan } from './mysql.translate';

// Postgres unique-violation SQLSTATE. Route/service code catches this exact
// string, so we remap MySQL's ER_DUP_ENTRY onto it to keep that code portable.
const PG_UNIQUE_VIOLATION = '23505';

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  // Convert TINYINT(1) (our BOOLEAN columns) into real JS booleans so callers
  // see true/false exactly like they did with Postgres.
  const typeCast = (field: any, next: () => any) => {
    if (field.type === 'TINY' && field.length === 1) {
      const val = field.string();
      return val === null ? null : val === '1';
    }
    return next();
  };

  const sslEnabled = process.env.DB_SSL === 'true';

  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 20,
    waitForConnections: true,
    // Required only for the migration runner (multi-statement .sql files); all
    // runtime queries go through prepared `execute()` which ignores this.
    multipleStatements: true,
    typeCast,
    // Without this, Date params (e.g. claim-code expires_at) are written using
    // the Node process's local wall-clock, while `NOW()` in SQL is evaluated in
    // the MySQL session's timezone - if those two differ, naive DATETIME
    // comparisons like `expires_at > NOW()` can be wrong by the offset between
    // them. Pin both sides to UTC instead.
    timezone: 'Z',
    ...(sslEnabled ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // `timezone: 'Z'` above only controls client-side Date encoding; it doesn't
  // touch the server's session time_zone, so NOW()/CURRENT_TIMESTAMP would
  // still use whatever the DB defaults to. Force every pooled connection to
  // UTC too so both sides of a comparison agree.
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });

  return pool;
}

function remapError(error: any): never {
  if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
    error.code = PG_UNIQUE_VIOLATION;
  }
  throw error;
}

// Runs a translated write and emulates Postgres RETURNING by SELECTing the
// affected row(s) back.
async function runReturning(
  exec: (sql: string, params: any[]) => Promise<[any, any]>,
  plan: ReturningPlan
): Promise<QueryResult> {
  await exec(plan.sql, plan.params);

  const selectCols = plan.columns === '*' ? '*' : plan.columns;
  let selectSql: string;
  let selectParams: any[];

  if (plan.kind === 'insert') {
    selectSql = `SELECT ${selectCols} FROM \`${plan.table}\` WHERE id = ?`;
    selectParams = [plan.injectedId];
  } else if (plan.table && plan.whereClause) {
    selectSql = `SELECT ${selectCols} FROM \`${plan.table}\` WHERE ${plan.whereClause}`;
    selectParams = plan.whereParams || [];
  } else {
    // Nothing we can select back; report the write as succeeded with no rows.
    return { rows: [], rowCount: 0 };
  }

  const [rows] = await exec(selectSql, selectParams);
  const rowArray = rows as RowDataPacket[];
  return { rows: rowArray, rowCount: rowArray.length };
}

function normalizeResult(rows: any): QueryResult {
  if (Array.isArray(rows)) {
    return { rows, rowCount: rows.length };
  }
  // ResultSetHeader for INSERT/UPDATE/DELETE without RETURNING.
  const header = rows as ResultSetHeader;
  return { rows: [], rowCount: header?.affectedRows ?? 0 };
}

export class MysqlAdapter implements DatabaseAdapter {
  readonly engine = 'mysql' as const;
  private pool: Pool | null = null;

  private getPool(): Pool {
    if (!this.pool) this.pool = buildPool();
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const pool = this.getPool();
    const { sql, params: mysqlParams, returning } = translateQuery(text, params);
    const exec = (s: string, p: any[]) => pool.execute(s, p);
    try {
      if (returning) {
        return (await runReturning(exec, returning)) as QueryResult<T>;
      }
      const [rows] = await exec(sql, mysqlParams);
      return normalizeResult(rows) as QueryResult<T>;
    } catch (error) {
      remapError(error);
    }
  }

  async getClient(): Promise<PoolClientLike> {
    const pool = this.getPool();
    const conn: PoolConnection = await pool.getConnection();
    return {
      query: async <T = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
        const { sql, params: mysqlParams, returning } = translateQuery(text, params);
        const exec = (s: string, p: any[]) => conn.execute(s, p);
        try {
          if (returning) {
            return (await runReturning(exec, returning)) as QueryResult<T>;
          }
          const [rows] = await exec(sql, mysqlParams);
          return normalizeResult(rows) as QueryResult<T>;
        } catch (error) {
          remapError(error);
        }
      },
      release: () => conn.release(),
    };
  }

  async exec(sql: string): Promise<void> {
    const pool = this.getPool();
    // Multi-statement DDL uses query(), not the prepared execute() path.
    await pool.query(sql);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
