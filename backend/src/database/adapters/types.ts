// Database adapter abstraction.
//
// The rest of the application only ever talks to the `query()` / `getClient()`
// helpers in `config/database.ts`, which in turn delegate to whichever adapter
// is active. To support a new database engine you implement this interface and
// register it in `index.ts` — no route or service code has to change.

export type DbEngine = 'postgres' | 'mysql';

// Normalized result shape. Both adapters return this so callers can keep using
// `result.rows` / `result.rowCount` exactly like node-postgres.
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// A single connection checked out of the pool (used for transactions).
export interface PoolClientLike {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface DatabaseAdapter {
  readonly engine: DbEngine;

  // Parameterized query. Placeholders are written in the portable Postgres
  // style (`$1`, `$2`, ...) everywhere in the codebase; adapters translate as
  // needed for their driver.
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;

  // Check out a dedicated connection (for transactions).
  getClient(): Promise<PoolClientLike>;

  // Run raw SQL that may contain multiple statements (used only by the
  // migration runner). Not parameterized — never pass user input here.
  exec(sql: string): Promise<void>;

  // Close the underlying pool.
  close(): Promise<void>;
}
