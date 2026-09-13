import type { TestContext } from 'node:test';
import request from 'supertest';
import type { Device, User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import * as firebase from '../../config/firebase';
import { createApp } from '../../app';

// One app for the whole test process. createApp() has no side effects beyond
// wiring middleware, so sharing it between files is safe.
export const app = createApp();
export const http = () => request(app);

// The bearer value that signInAs() teaches the Firebase stub to accept.
export const GOOD_TOKEN = 'test-id-token';

// Prisma model delegates are proxies with no own methods, so t.mock.method
// cannot patch `prisma.device.findUnique`; the whole delegate is swapped for
// the duration of one test instead.
export function stubModel(t: TestContext, model: keyof typeof prisma, impl: Record<string, unknown>): void {
  const original = prisma[model];
  Object.defineProperty(prisma, model, { value: impl, configurable: true, writable: true });
  t.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true, writable: true }));
}

export function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    firebaseUid: 'uid-1',
    email: 'user@example.com',
    name: 'Test User',
    tenantId: 'tenant-1',
    role: 'user',
    fcmToken: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

export function deviceRow(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-uuid',
    deviceId: 'AQM-0042',
    tenantId: 'tenant-1',
    name: 'Roof tank',
    firmwareVersion: null,
    lastSeen: new Date('2026-01-01T00:00:00Z'),
    status: 'online',
    lastOtaCheckAt: null,
    configVersion: 3,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Device;
}

// Makes `Authorization: Bearer GOOD_TOKEN` resolve to `user` for one test:
// Firebase verifies the token to `user.firebaseUid`, and the users table lookup
// returns the row. Pass `null` to simulate a Firebase account with no user row
// yet (the auto-provision path).
export function signInAs(t: TestContext, user: User | null, opts: { uid?: string } = {}): Record<string, string> {
  const uid = opts.uid ?? user?.firebaseUid ?? 'uid-unknown';
  t.mock.method(firebase, 'getAuth', () => ({
    verifyIdToken: async (token: string) => {
      if (token !== GOOD_TOKEN) throw new Error('auth/invalid-id-token');
      return { uid };
    },
    getUser: async () => ({ uid, displayName: 'New Person', email: 'new@example.com' }),
  }) as unknown as ReturnType<typeof firebase.getAuth>);
  stubModel(t, 'user', { findUnique: async () => user });
  return { Authorization: `Bearer ${GOOD_TOKEN}` };
}

// Makes `Authorization: Bearer <anything>` resolve to `device` (or reject when
// null) for one test, by stubbing the device_tokens lookup deviceAuth uses.
export function deviceTokenResolvesTo(t: TestContext, device: Device | null): Record<string, string> {
  stubModel(t, 'deviceToken', {
    findFirst: async () => (device ? { device } : null),
  });
  return { Authorization: 'Bearer any-device-token' };
}

// requireDeviceAccess looks the device up by hardware id, then falls back to a
// user_device_mappings grant when the tenant does not match.
export function deviceLookupReturns(t: TestContext, device: Device | null, mapping: unknown = null): void {
  stubModel(t, 'device', { findUnique: async () => device });
  stubModel(t, 'userDeviceMapping', { findFirst: async () => mapping });
}

// Arguments of the n-th call to a t.mock.method() spy. Throws a readable
// error instead of an "undefined" property access when the call never
// happened. The spy is typed by its stub implementation, which usually takes
// no parameters, so name the real function to get typed arguments back:
//   callArgs<typeof deviceService.recordMeasurement>(spy)[1].levelCm
export function callArgs<F extends (...args: any[]) => unknown = (...args: any[]) => unknown>(
  spy: { mock: { calls: ReadonlyArray<{ arguments: unknown[] }> } },
  n = 0
): Parameters<F> {
  const call = spy.mock.calls[n];
  if (!call) throw new Error(`expected call #${n} but the mock was called ${spy.mock.calls.length} time(s)`);
  return call.arguments as Parameters<F>;
}
