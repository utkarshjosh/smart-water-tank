import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPlaceholders,
  translateDialect,
  parseReturning,
  translateQuery,
} from '../mysql.translate';

// ---------------------------------------------------------------------------
// Placeholder conversion
// ---------------------------------------------------------------------------
test('converts $N placeholders to ? in order', () => {
  const { sql, params } = convertPlaceholders(
    'SELECT * FROM users WHERE id = $1 AND role = $2',
    ['abc', 'admin']
  );
  assert.equal(sql, 'SELECT * FROM users WHERE id = ? AND role = ?');
  assert.deepEqual(params, ['abc', 'admin']);
});

test('expands a repeated $N into multiple ? with the value duplicated (ILIKE case)', () => {
  // Mirrors admin.routes.ts search: one param reused across three OR branches.
  const { sql, params } = convertPlaceholders(
    'AND (u.email ILIKE $8 OR u.name ILIKE $8 OR u.firebase_uid ILIKE $8)',
    [null, null, null, null, null, null, null, '%bob%']
  );
  assert.equal(
    sql,
    'AND (u.email ILIKE ? OR u.name ILIKE ? OR u.firebase_uid ILIKE ?)'
  );
  assert.deepEqual(params, ['%bob%', '%bob%', '%bob%']);
});

test('handles out-of-order placeholders', () => {
  const { sql, params } = convertPlaceholders('SET a = $2 WHERE id = $1', ['id1', 'v2']);
  assert.equal(sql, 'SET a = ? WHERE id = ?');
  assert.deepEqual(params, ['v2', 'id1']);
});

// ---------------------------------------------------------------------------
// Dialect translation
// ---------------------------------------------------------------------------
test('ON CONFLICT DO UPDATE + EXCLUDED becomes ON DUPLICATE KEY UPDATE + VALUES()', () => {
  const input = `INSERT INTO daily_summaries (device_id, date, total_usage_l)
     VALUES (?, ?, ?)
     ON CONFLICT (device_id, date)
     DO UPDATE SET
       total_usage_l = EXCLUDED.total_usage_l,
       updated_at = NOW()`;
  const out = translateDialect(input);
  assert.match(out, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(out, /ON CONFLICT/);
  assert.doesNotMatch(out, /EXCLUDED/);
  assert.match(out, /total_usage_l = VALUES\(total_usage_l\)/);
});

test('ON CONFLICT (col) DO UPDATE without EXCLUDED still translates', () => {
  const input = `INSERT INTO device_firmware_assignments (device_id, firmware_id, status)
     VALUES (?, ?, 'pending')
     ON CONFLICT (device_id, firmware_id)
     DO UPDATE SET status = 'pending', assigned_at = NOW()`;
  const out = translateDialect(input);
  assert.match(out, /ON DUPLICATE KEY UPDATE status = 'pending'/);
  assert.doesNotMatch(out, /ON CONFLICT/);
});

test('ON CONFLICT DO NOTHING becomes INSERT IGNORE with the clause removed', () => {
  const input = `INSERT INTO device_tokens (device_id, token_hash)
     VALUES (?, ?)
     ON CONFLICT DO NOTHING`;
  const out = translateDialect(input);
  assert.match(out, /^\s*INSERT IGNORE INTO device_tokens/);
  assert.doesNotMatch(out, /ON CONFLICT/);
  assert.doesNotMatch(out, /DO NOTHING/);
});

test('ON CONFLICT (col) DO NOTHING becomes INSERT IGNORE', () => {
  const input = `INSERT INTO users (firebase_uid) VALUES (?) ON CONFLICT (firebase_uid) DO NOTHING`;
  const out = translateDialect(input);
  assert.match(out, /INSERT IGNORE INTO users/);
  assert.doesNotMatch(out, /ON CONFLICT/);
});

test('INTERVAL literals lose quotes and singularize the unit', () => {
  assert.match(translateDialect(`created_at > NOW() - INTERVAL '1 hour'`), /INTERVAL 1 HOUR/);
  assert.match(translateDialect(`created_at > NOW() - INTERVAL '24 hours'`), /INTERVAL 24 HOUR/);
});

test('ILIKE becomes LIKE', () => {
  assert.equal(translateDialect('WHERE name ILIKE ?'), 'WHERE name LIKE ?');
});

test('::text cast is dropped', () => {
  assert.equal(translateDialect('WHERE id::text = ? OR firebase_uid = ?'), 'WHERE id = ? OR firebase_uid = ?');
});

// ---------------------------------------------------------------------------
// RETURNING emulation planning
// ---------------------------------------------------------------------------
test('INSERT ... RETURNING * injects an id and plans a select-back by id', () => {
  const plan = parseReturning(
    `INSERT INTO users (firebase_uid, email, name, tenant_id, role)
     VALUES (?, ?, ?, NULL, 'user')
     RETURNING *`,
    ['uid', 'e@x.com', 'Bob']
  );
  assert.ok(plan);
  assert.equal(plan!.kind, 'insert');
  assert.equal(plan!.table, 'users');
  assert.equal(plan!.columns, '*');
  assert.ok(plan!.injectedId);
  // id column injected first, and a leading ? added to VALUES.
  assert.match(plan!.sql, /INSERT INTO users \(id, firebase_uid/);
  assert.match(plan!.sql, /VALUES \(\?, \?, \?, \?, NULL, 'user'\)/);
  assert.doesNotMatch(plan!.sql, /RETURNING/);
  // Params get the generated id prepended.
  assert.equal(plan!.params.length, 4);
  assert.equal(plan!.params[0], plan!.injectedId);
  assert.deepEqual(plan!.params.slice(1), ['uid', 'e@x.com', 'Bob']);
});

test('INSERT with NOW() literal in VALUES aligns injected id correctly', () => {
  const plan = parseReturning(
    `INSERT INTO measurements (device_id, timestamp, level_cm, volume_l)
     VALUES (?, NOW(), ?, ?)
     RETURNING *`,
    ['dev1', 12.5, 300]
  );
  assert.ok(plan);
  assert.match(plan!.sql, /INSERT INTO measurements \(id, device_id, timestamp/);
  assert.match(plan!.sql, /VALUES \(\?, \?, NOW\(\), \?, \?\)/);
  assert.deepEqual(plan!.params.slice(1), ['dev1', 12.5, 300]);
});

test('INSERT ... RETURNING with explicit column list preserves those columns', () => {
  const plan = parseReturning(
    `INSERT INTO devices (device_id, tenant_id, name, status)
     VALUES (?, ?, ?, 'offline')
     RETURNING id, device_id, tenant_id, name, status, created_at`,
    ['d1', 't1', 'Tank']
  );
  assert.ok(plan);
  assert.equal(plan!.kind, 'insert');
  assert.equal(plan!.columns, 'id, device_id, tenant_id, name, status, created_at');
});

test('UPDATE ... RETURNING plans a select-back using the WHERE clause and its params', () => {
  const plan = parseReturning(
    `UPDATE tenants SET name = ?, updated_at = NOW() WHERE id = ? RETURNING id, name, created_at, updated_at`,
    ['NewName', 'tenant-123']
  );
  assert.ok(plan);
  assert.equal(plan!.kind, 'update');
  assert.equal(plan!.table, 'tenants');
  assert.equal(plan!.whereClause, 'id = ?');
  assert.deepEqual(plan!.whereParams, ['tenant-123']);
  assert.doesNotMatch(plan!.sql, /RETURNING/);
  // The UPDATE itself still runs with all params.
  assert.deepEqual(plan!.params, ['NewName', 'tenant-123']);
});

test('non-RETURNING SQL yields no plan', () => {
  assert.equal(parseReturning('UPDATE users SET name = ? WHERE id = ?', ['a', 'b']), null);
});

// ---------------------------------------------------------------------------
// End-to-end pipeline
// ---------------------------------------------------------------------------
test('translateQuery runs the whole pipeline for an upsert', () => {
  const { sql, params, returning } = translateQuery(
    `INSERT INTO device_configs (device_id, config_json)
     VALUES ($1, $2)
     ON CONFLICT (device_id)
     DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
    ['dev1', '{}']
  );
  assert.equal(returning, null);
  assert.match(sql, /VALUES \(\?, \?\)/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE config_json = VALUES\(config_json\)/);
  assert.deepEqual(params, ['dev1', '{}']);
});

test('translateQuery surfaces the RETURNING plan for an insert', () => {
  const { returning } = translateQuery(
    `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
    ['Acme']
  );
  assert.ok(returning);
  assert.equal(returning!.kind, 'insert');
  assert.equal(returning!.columns, 'id');
  assert.equal(returning!.params[0], returning!.injectedId);
});

test('translateQuery leaves a plain SELECT untouched except placeholders', () => {
  const { sql, params, returning } = translateQuery(
    'SELECT id FROM tenants WHERE name = $1',
    ['Acme']
  );
  assert.equal(sql, 'SELECT id FROM tenants WHERE name = ?');
  assert.deepEqual(params, ['Acme']);
  assert.equal(returning, null);
});
