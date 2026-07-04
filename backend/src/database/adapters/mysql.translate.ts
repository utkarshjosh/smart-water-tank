// Translates the Postgres-flavored SQL used throughout the codebase into the
// equivalent MySQL 8 dialect. This is deliberately NOT a general-purpose SQL
// transpiler — it targets exactly the finite set of Postgres-isms this project
// emits, and every one of them is covered by unit tests in
// `__tests__/mysql.translate.test.ts`.
//
// Handled:
//   * `$1, $2, ...`      -> `?` positional params (with value expansion for
//                           repeated/reordered placeholders)
//   * `RETURNING ...`    -> emulated by the adapter (see `parseReturning`)
//   * `ON CONFLICT ... DO UPDATE SET ... EXCLUDED.x` -> `ON DUPLICATE KEY UPDATE x = VALUES(x)`
//   * `ON CONFLICT ... DO NOTHING`                   -> `INSERT IGNORE`
//   * `INTERVAL '1 hour'` -> `INTERVAL 1 HOUR`
//   * `ILIKE`             -> `LIKE`
//   * `col::text`         -> `col` (CHAR(36) ids compare directly)

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Placeholder conversion: $N -> ?, expanding params so each `?` gets its value.
// Handles a $N that appears multiple times (e.g. an ILIKE search term reused
// across OR branches) and out-of-order placeholders.
// ---------------------------------------------------------------------------
export function convertPlaceholders(
  sql: string,
  params: any[] = []
): { sql: string; params: any[] } {
  const outParams: any[] = [];
  const outSql = sql.replace(/\$(\d+)/g, (_match, digits) => {
    const index = parseInt(digits, 10) - 1;
    outParams.push(params[index]);
    return '?';
  });
  return { sql: outSql, params: outParams };
}

// ---------------------------------------------------------------------------
// Dialect keyword/operator translations that don't affect parameters.
// ---------------------------------------------------------------------------
export function translateDialect(sql: string): string {
  let out = sql;

  // ON CONFLICT (...) DO UPDATE SET ...  ->  ON DUPLICATE KEY UPDATE ...
  // The conflict-target column list is dropped (MySQL keys off any unique index)
  // and EXCLUDED.col references become VALUES(col).
  out = out.replace(/ON\s+CONFLICT\s*(?:\([^)]*\))?\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
  out = out.replace(/EXCLUDED\.(\w+)/gi, 'VALUES($1)');

  // ON CONFLICT ... DO NOTHING  ->  INSERT IGNORE (clause removed).
  if (/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i.test(out)) {
    out = out.replace(/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/gi, '');
    out = out.replace(/^(\s*)INSERT\s+INTO/i, '$1INSERT IGNORE INTO');
  }

  // INTERVAL '1 hour' / '24 hours' -> INTERVAL 1 HOUR / 24 HOUR
  out = out.replace(/INTERVAL\s+'(\d+)\s+([a-zA-Z]+?)s?'/gi, (_m, n, unit) => {
    return `INTERVAL ${n} ${unit.toUpperCase()}`;
  });

  // ILIKE -> LIKE (MySQL string comparison is case-insensitive by collation).
  out = out.replace(/\bILIKE\b/gi, 'LIKE');

  // col::text (and other ::type casts) -> drop the cast. Ids are CHAR(36) and
  // compare directly; this is the only cast the codebase uses.
  out = out.replace(/::\s*text\b/gi, '');

  return out;
}

// ---------------------------------------------------------------------------
// RETURNING detection. MySQL 8 has no RETURNING, so the adapter emulates it by
// running the write and then SELECTing the affected row(s) back.
// ---------------------------------------------------------------------------
export interface ReturningPlan {
  kind: 'insert' | 'update';
  table: string;
  columns: string; // raw column list from RETURNING, e.g. "*" or "id, name"
  // For INSERT: the generated id we injected, so we can SELECT ... WHERE id = ?
  injectedId?: string;
  // For UPDATE: the WHERE clause text and the params belonging to it.
  whereClause?: string;
  whereParams?: any[];
  // Rewritten write statement (RETURNING stripped, id injected for inserts).
  sql: string;
  params: any[];
}

// Given SQL that still uses `?` placeholders (post-convertPlaceholders) and the
// matching positional params, returns a plan if a RETURNING clause is present.
export function parseReturning(sql: string, params: any[]): ReturningPlan | null {
  const returningMatch = sql.match(/\bRETURNING\s+([\s\S]+?)\s*$/i);
  if (!returningMatch) return null;

  const columns = returningMatch[1].trim().replace(/;\s*$/, '');
  const writeSql = sql.slice(0, returningMatch.index).trimEnd();

  const insertMatch = writeSql.match(/^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?/i);
  if (insertMatch) {
    const table = insertMatch[1];
    const injectedId = randomUUID();
    // Inject an explicit id into the column list and VALUES so we know the PK
    // of the row we just wrote (MySQL can't return a DB-defaulted UUID).
    let rewritten = writeSql.replace(
      /^(\s*INSERT\s+(?:IGNORE\s+)?INTO\s+`?\w+`?\s*)\(/i,
      '$1(id, '
    );
    rewritten = rewritten.replace(/\bVALUES\s*\(/i, 'VALUES (?, ');
    return {
      kind: 'insert',
      table,
      columns,
      injectedId,
      sql: rewritten,
      params: [injectedId, ...params],
    };
  }

  const updateMatch = writeSql.match(/^\s*UPDATE\s+`?(\w+)`?/i);
  if (updateMatch) {
    const table = updateMatch[1];
    const whereMatch = writeSql.match(/\bWHERE\b([\s\S]+)$/i);
    const whereClause = whereMatch ? whereMatch[1].trim() : '';
    // In an UPDATE the SET placeholders come first and the WHERE placeholders
    // last, so the WHERE params are the trailing slice.
    const whereParamCount = (whereClause.match(/\?/g) || []).length;
    const whereParams =
      whereParamCount > 0 ? params.slice(params.length - whereParamCount) : [];
    return {
      kind: 'update',
      table,
      columns,
      whereClause,
      whereParams,
      sql: writeSql,
      params,
    };
  }

  // Unknown RETURNING shape — strip it and hope the write is enough.
  return {
    kind: 'update',
    table: '',
    columns,
    sql: writeSql,
    params,
  };
}

// Full translation pipeline for a normal parameterized query. Returns the
// MySQL SQL, the positional params, and (if present) a RETURNING plan the
// adapter must emulate.
export function translateQuery(
  text: string,
  params: any[] = []
): { sql: string; params: any[]; returning: ReturningPlan | null } {
  const converted = convertPlaceholders(text, params);
  const dialected = translateDialect(converted.sql);
  const returning = parseReturning(dialected, converted.params);
  if (returning) {
    return { sql: returning.sql, params: returning.params, returning };
  }
  return { sql: dialected, params: converted.params, returning: null };
}
