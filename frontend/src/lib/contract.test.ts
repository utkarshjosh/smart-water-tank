import { describe, expect, it } from 'vitest';
import { adminDeviceSchema, meSchema } from '@aquamind/contracts';
import { ContractError, parseResponse } from './contract';

const me = { id: 'u1', email: 'a@b.c', name: null, role: 'user', tenant_id: 't1', tenant_name: 'Home' };

describe('parseResponse', () => {
  it('returns the parsed data when the body matches its contract', () => {
    expect(parseResponse(meSchema, me, '/api/v1/user/me')).toEqual(me);
  });

  it('throws a ContractError naming the url and the offending fields', () => {
    const { email: _dropped, ...withoutEmail } = me;
    let caught: unknown;
    try {
      parseResponse(meSchema, { ...withoutEmail, role: 'owner' }, '/api/v1/user/me');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContractError);
    const err = caught as ContractError;
    expect(err.url).toBe('/api/v1/user/me');
    expect(err.issues.some((i) => i.startsWith('email '))).toBe(true);
    expect(err.issues.some((i) => i.startsWith('role '))).toBe(true);
    expect(err.message).toContain('/api/v1/user/me');
  });

  it('the archived_at regression (#5): a device row without it is rejected, not silently accepted', () => {
    const row = {
      id: 'uuid',
      device_id: 'AQM-1',
      name: null,
      tenant_id: null,
      tenant_name: null,
      status: 'offline',
      firmware_version: null,
      last_seen: null,
      current_volume: null,
      last_measurement: null,
      created_at: '2026-09-14T10:00:00.000Z',
    };
    expect(() => parseResponse(adminDeviceSchema, row, '/api/v1/admin/devices')).toThrow(ContractError);
    expect(parseResponse(adminDeviceSchema, { ...row, archived_at: null }, '/api/v1/admin/devices').archived_at).toBeNull();
  });
});
