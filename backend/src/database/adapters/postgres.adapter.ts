import { Pool } from 'pg';
import { DatabaseAdapter, PoolClientLike, QueryResult } from './types';

// Thin wrapper around node-postgres. The SQL used across the codebase is already
// written in Postgres dialect, so this adapter passes queries straight through
// and only normalizes the result to the shared { rows, rowCount } shape.
export class PostgresAdapter implements DatabaseAdapter {
  readonly engine = 'postgres' as const;
  private pool: Pool | null = null;

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      this.pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
      });
    }
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.getPool().query(text, params);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  }

  async getClient(): Promise<PoolClientLike> {
    const client = await this.getPool().connect();
    return {
      query: async <T = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
        const res = await client.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? 0 };
      },
      release: () => client.release(),
    };
  }

  async exec(sql: string): Promise<void> {
    await this.getPool().query(sql);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
