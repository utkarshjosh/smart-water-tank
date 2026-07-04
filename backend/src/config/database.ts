import * as dotenv from 'dotenv';
import { createAdapter, resolveEngine, DatabaseAdapter, PoolClientLike } from '../database/adapters';

dotenv.config();

// The application never touches a driver directly — it goes through the active
// adapter (Postgres or MySQL), selected by DB_CLIENT / DATABASE_URL scheme.
// See src/database/adapters for how to add another engine.
let adapter: DatabaseAdapter | null = null;

function getAdapter(): DatabaseAdapter {
  if (!adapter) {
    adapter = createAdapter();
    console.log(`[DB] Using ${adapter.engine} adapter`);
  }
  return adapter;
}

// Kept for backwards compatibility with existing imports. Returns the active
// engine name rather than a raw pg Pool.
export function getEngine(): string {
  return resolveEngine();
}

export async function query(text: string, params?: any[]): Promise<any> {
  const db = getAdapter();
  const start = Date.now();
  try {
    const res = await db.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error', { text, error });
    throw error;
  }
}

export async function getClient(): Promise<PoolClientLike> {
  return getAdapter().getClient();
}

// Run raw, possibly multi-statement SQL (migration files). Not parameterized.
export async function execSql(sql: string): Promise<void> {
  await getAdapter().exec(sql);
}

export async function closePool(): Promise<void> {
  if (adapter) {
    await adapter.close();
    adapter = null;
  }
}
