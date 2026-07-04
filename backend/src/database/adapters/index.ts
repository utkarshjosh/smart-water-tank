import { DatabaseAdapter, DbEngine } from './types';
import { PostgresAdapter } from './postgres.adapter';
import { MysqlAdapter } from './mysql.adapter';

export * from './types';

// Resolve the active engine. Explicit DB_CLIENT wins; otherwise it's inferred
// from the DATABASE_URL scheme (mysql:// -> mysql), defaulting to postgres so
// existing deployments are unaffected.
export function resolveEngine(): DbEngine {
  const explicit = (process.env.DB_CLIENT || '').toLowerCase();
  if (explicit === 'mysql' || explicit === 'postgres') {
    return explicit;
  }

  const url = process.env.DATABASE_URL || '';
  if (/^mysql:\/\//i.test(url)) return 'mysql';
  return 'postgres';
}

export function createAdapter(engine: DbEngine = resolveEngine()): DatabaseAdapter {
  switch (engine) {
    case 'mysql':
      return new MysqlAdapter();
    case 'postgres':
      return new PostgresAdapter();
    default:
      throw new Error(`Unsupported DB engine: ${engine}`);
  }
}
