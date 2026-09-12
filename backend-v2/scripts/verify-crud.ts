// DB-backed verification for the CRUD endpoints added to close the gaps in
// plans/backend-crud-gaps.md. Exercises the service layer directly against a
// real database:  npm run verify:crud
import { prisma } from '../src/lib/prisma';
import * as userService from '../src/services/user.service';
import * as adminService from '../src/services/admin.service';
import { getAccessibleDeviceOrThrow } from '../src/lib/access';
import { hashClaimCode } from '../src/lib/claim-code';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  ok ? passed++ : failed++;
}

async function expectThrow(name: string, fn: () => Promise<unknown>, status?: number) {
  try {
    await fn();
    check(name, false, 'expected a rejection, got success');
  } catch (err) {
    const got = (err as { status?: number }).status;
    check(name, status == null || got === status, `status ${got}`);
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const tenant = await prisma.tenant.create({ data: { name: `crud-${suffix}` } });
  const other = await prisma.tenant.create({ data: { name: `crud-other-${suffix}` } });
  const user = await prisma.user.create({
    data: {
      firebaseUid: `crud-uid-${suffix}`,
      email: `crud-${suffix}@example.com`,
      name: 'Before Rename',
      tenantId: tenant.id,
      role: 'user',
      fcmToken: 'stale-push-token',
    },
  });

  // --- device rename: the self-claim path, reproduced ------------------------
  // claimDevice inserts only deviceId/tenantId/status, so this is exactly the
  // shape a self-paired device arrives in.
  const device = await prisma.device.create({
    data: { deviceId: `crud-tank-${suffix}`, tenantId: tenant.id, status: 'offline' },
  });
  check('a self-claimed device starts with no name', device.name === null, `name=${device.name}`);

  const renamed = await userService.renameDevice(device, '  Roof tank  ');
  check('rename trims and stores the name', renamed.name === 'Roof tank', `name=${renamed.name}`);

  const cleared = await userService.renameDevice(device, '   ');
  check(
    'a blank name clears back to the hardware ID',
    cleared.name === device.deviceId,
    `name=${cleared.name}`
  );

  const nulled = await userService.renameDevice(device, null);
  check('null clears the name too', nulled.name === device.deviceId);

  // --- admin device update --------------------------------------------------
  const moved = await adminService.updateDevice(device.deviceId, {
    name: 'Ops renamed',
    tenantId: other.id,
  });
  check(
    'admin can rename and move a device in one call',
    moved.name === 'Ops renamed' && moved.tenant_id === other.id,
    `tenant=${moved.tenant_name}`
  );

  await expectThrow('moving to a nonexistent tenant is a 404', () =>
    adminService.updateDevice(device.deviceId, { tenantId: '00000000-0000-0000-0000-000000000000' }), 404
  );
  await expectThrow('updating a nonexistent device is a 404', () =>
    adminService.updateDevice('no-such-device', { name: 'x' }), 404
  );

  // Moving the device away must actually revoke the original tenant's access.
  await expectThrow('a moved device is no longer visible to the old tenant', () =>
    getAccessibleDeviceOrThrow({ deviceId: device.deviceId, user: { id: user.id, role: 'user', tenantId: tenant.id } }), 403
  );
  await adminService.updateDevice(device.deviceId, { tenantId: tenant.id });
  const regained = await getAccessibleDeviceOrThrow({
    deviceId: device.deviceId,
    user: { id: user.id, role: 'user', tenantId: tenant.id },
  });
  check('moving it back restores access', regained.id === device.id);

  // --- profile --------------------------------------------------------------
  const profile = await userService.updateMe(user.id, { name: '  After Rename  ' });
  check('updateMe trims the display name', profile.name === 'After Rename', `name=${profile.name}`);
  await expectThrow('an empty display name is rejected', () =>
    userService.updateMe(user.id, { name: '   ' }), 400
  );
  await expectThrow('an update with no fields is rejected', () =>
    userService.updateMe(user.id, {}), 400
  );
  const unchangedEmail = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  check(
    'updateMe cannot change email or role',
    unchangedEmail.email === `crud-${suffix}@example.com` && unchangedEmail.role === 'user'
  );

  // --- push token -----------------------------------------------------------
  await userService.clearFCMToken(user.id);
  const cleared2 = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  check('clearFCMToken nulls the stored token', cleared2.fcmToken === null);

  // --- claim code revoke ----------------------------------------------------
  const minted = await userService.mintClaimCode(tenant.id, user.id);
  const statusBefore = await userService.getClaimCodeStatus(tenant.id, minted.claim_code);
  check('a fresh code reads as pending', statusBefore.status === 'pending');

  await userService.revokeClaimCode(tenant.id, minted.claim_code);
  const statusAfter = await userService.getClaimCodeStatus(tenant.id, minted.claim_code);
  check('a revoked code reads as expired', statusAfter.status === 'expired', statusAfter.status);

  await expectThrow('revoking an unknown code is a 404', () =>
    userService.revokeClaimCode(tenant.id, 'ZZZZZZ'), 404
  );

  // A consumed code cannot be revoked - it already did its job.
  const consumed = await userService.mintClaimCode(tenant.id, user.id);
  await prisma.deviceClaimCode.updateMany({
    where: { codeHash: hashClaimCode(consumed.claim_code) },
    data: { consumedAt: new Date() },
  });
  await expectThrow('revoking an already-used code is a 409', () =>
    userService.revokeClaimCode(tenant.id, consumed.claim_code), 409
  );

  // Another tenant must not be able to revoke this tenant's code.
  const foreign = await userService.mintClaimCode(tenant.id, user.id);
  await expectThrow("a code cannot be revoked from another tenant", () =>
    userService.revokeClaimCode(other.id, foreign.claim_code), 404
  );

  // --- alert feeds ----------------------------------------------------------
  console.log('');
  const deviceB = await prisma.device.create({
    data: { deviceId: `crud-tank-b-${suffix}`, tenantId: tenant.id, name: 'Sump', status: 'online' },
  });
  const foreignDevice = await prisma.device.create({
    data: { deviceId: `crud-foreign-${suffix}`, tenantId: other.id, name: 'Not yours', status: 'online' },
  });

  const mkAlert = (dev: { id: string }, tenantId: string, over: Record<string, unknown> = {}) =>
    prisma.alert.create({
      data: {
        deviceId: dev.id,
        tenantId,
        type: 'tank_low',
        severity: 'medium',
        message: 'Level low',
        ...over,
      },
    });

  const a1 = await mkAlert(device, tenant.id);
  await mkAlert(deviceB, tenant.id, { severity: 'critical', type: 'leak_detected' });
  await mkAlert(deviceB, tenant.id, { acknowledged: true });
  const foreignAlert = await mkAlert(foreignDevice, other.id);

  const feed = await userService.getUserAlerts(
    { id: user.id, tenantId: tenant.id },
    { limit: 50, includeDismissed: false, onlyUnacknowledged: false }
  );
  check('the tenant inbox spans multiple devices', feed.alerts.length === 3, `${feed.alerts.length} alerts`);
  check(
    'the inbox excludes another tenant\'s alerts',
    !feed.alerts.some((a) => a.id === foreignAlert.id)
  );
  check('each alert carries its device name', feed.alerts.every((a) => 'device_name' in a));
  check('the unacknowledged count ignores acknowledged rows', feed.unacknowledged === 2, `count=${feed.unacknowledged}`);

  const unackOnly = await userService.getUserAlerts(
    { id: user.id, tenantId: tenant.id },
    { limit: 50, includeDismissed: false, onlyUnacknowledged: true }
  );
  check('unacknowledged filter works', unackOnly.alerts.length === 2, `${unackOnly.alerts.length} alerts`);

  // A mapping grant must widen the inbox - this is the path that had no writer.
  await prisma.userDeviceMapping.create({ data: { userId: user.id, deviceId: foreignDevice.id } });
  const widened = await userService.getUserAlerts(
    { id: user.id, tenantId: tenant.id },
    { limit: 50, includeDismissed: false, onlyUnacknowledged: false }
  );
  check(
    'an explicit device grant widens the inbox',
    widened.alerts.some((a) => a.id === foreignAlert.id),
    `${widened.alerts.length} alerts`
  );
  await prisma.userDeviceMapping.deleteMany({ where: { userId: user.id } });

  // --- dismiss / restore ----------------------------------------------------
  await userService.dismissAlert(device, a1.id);
  const afterDismiss = await userService.getUserAlerts(
    { id: user.id, tenantId: tenant.id },
    { limit: 50, includeDismissed: false, onlyUnacknowledged: false }
  );
  check('a dismissed alert leaves the feed', !afterDismiss.alerts.some((a) => a.id === a1.id));

  const stillThere = await prisma.alert.findUnique({ where: { id: a1.id } });
  check('dismissing keeps the row', stillThere != null && stillThere.dismissedAt != null);

  const withDismissed = await userService.getUserAlerts(
    { id: user.id, tenantId: tenant.id },
    { limit: 50, includeDismissed: true, onlyUnacknowledged: false }
  );
  check(
    'include_dismissed brings it back into view',
    withDismissed.alerts.some((a) => a.id === a1.id && a.dismissed === true)
  );

  await userService.dismissAlert(device, a1.id); // second call must not throw
  check('dismissing twice is idempotent', true);

  await userService.restoreAlert(device, a1.id);
  const restored = await userService.getUserAlerts(
    { id: user.id, tenantId: tenant.id },
    { limit: 50, includeDismissed: false, onlyUnacknowledged: false }
  );
  check('restore puts it back in the feed', restored.alerts.some((a) => a.id === a1.id));

  await expectThrow('dismissing an alert on another device is a 404', () =>
    userService.dismissAlert(device, foreignAlert.id), 404
  );

  const perDevice = await userService.getDeviceAlerts(deviceB, 50);
  check('the per-device feed still works', perDevice.alerts.length === 2, `${perDevice.alerts.length} alerts`);

  // --- admin fleet feed -----------------------------------------------------
  const fleet = await adminService.listAlerts({ limit: 200, includeDismissed: false });
  check('the fleet feed sees every tenant', fleet.alerts.some((a) => a.id === foreignAlert.id));
  check('fleet rows carry tenant names', fleet.alerts.every((a) => typeof a.tenant_name === 'string'));

  const byTenant = await adminService.listAlerts({ limit: 200, includeDismissed: false, tenantId: other.id });
  check(
    'the fleet feed filters by tenant',
    byTenant.alerts.length >= 1 && byTenant.alerts.every((a) => a.tenant_id === other.id),
    `${byTenant.alerts.length} alerts`
  );

  const critical = await adminService.listAlerts({ limit: 200, includeDismissed: false, severity: 'critical' });
  // Assert the filter's contract rather than a global count: leftovers from an
  // earlier aborted run would otherwise make this fail for the wrong reason.
  check(
    'the fleet feed filters by severity',
    critical.alerts.length >= 1 && critical.alerts.every((a) => a.severity === 'critical'),
    `${critical.alerts.length} alerts, all critical`
  );
  check(
    'the severity filter includes our own critical alert',
    critical.alerts.some((a) => a.device_id === deviceB.deviceId)
  );

  const unackFleet = await adminService.listAlerts({ limit: 200, includeDismissed: false, acknowledged: false });
  check('the fleet feed filters by acknowledged', unackFleet.alerts.every((a) => !a.acknowledged));

  const future = await adminService.listAlerts({
    limit: 200,
    includeDismissed: false,
    since: new Date(Date.now() + 60_000),
  });
  check('the since filter excludes older alerts', future.alerts.length === 0, `${future.alerts.length} alerts`);

  // --- device sharing: the writers user_device_mappings never had -----------
  console.log('');
  const outsider = await prisma.user.create({
    data: {
      firebaseUid: `crud-out-${suffix}`,
      email: `outsider-${suffix}@example.com`,
      name: 'Outsider',
      tenantId: other.id,
      role: 'user',
    },
  });

  await expectThrow('an outsider cannot reach the device before sharing', () =>
    getAccessibleDeviceOrThrow({
      deviceId: device.deviceId,
      user: { id: outsider.id, role: 'user', tenantId: other.id },
    }), 403
  );

  const shared = await userService.shareDevice(device, `  outsider-${suffix}@example.com  `);
  check('sharing resolves the target by email', shared.user_id === outsider.id);

  const nowVisible = await getAccessibleDeviceOrThrow({
    deviceId: device.deviceId,
    user: { id: outsider.id, role: 'user', tenantId: other.id },
  });
  check('the share grants real access through access control', nowVisible.id === device.id);

  // The share must widen only the shared device, not the whole tenant.
  await expectThrow('a share does not leak sibling devices', () =>
    getAccessibleDeviceOrThrow({
      deviceId: deviceB.deviceId,
      user: { id: outsider.id, role: 'user', tenantId: other.id },
    }), 403
  );

  await userService.shareDevice(device, outsider.email); // again
  const dupCount = await prisma.userDeviceMapping.count({
    where: { deviceId: device.id, userId: outsider.id },
  });
  check('sharing twice does not duplicate the grant', dupCount === 1, `${dupCount} rows`);

  const shares = await userService.listDeviceShares(device);
  check('the share list reports the explicit grant', shares.shares.some((x) => x.user_id === outsider.id));
  check(
    'the share list reports tenant members as non-revocable',
    shares.members.some((m) => m.user_id === user.id && m.revocable === false)
  );

  await expectThrow('sharing with an unknown email is a 404', () =>
    userService.shareDevice(device, 'nobody-at-all@example.com'), 404
  );
  await expectThrow('sharing with an existing tenant member is a 409', () =>
    userService.shareDevice(device, user.email), 409
  );

  await userService.unshareDevice(device, outsider.id);
  await expectThrow('revoking a share removes access again', () =>
    getAccessibleDeviceOrThrow({
      deviceId: device.deviceId,
      user: { id: outsider.id, role: 'user', tenantId: other.id },
    }), 403
  );
  await expectThrow('revoking a share that does not exist is a 404', () =>
    userService.unshareDevice(device, outsider.id), 404
  );

  // --- soft delete ----------------------------------------------------------
  console.log('');

  // Device decommission: history retained, API access gone.
  const beforeCount = await prisma.measurement.count({ where: { deviceId: deviceB.id } });
  await prisma.measurement.create({
    data: { deviceId: deviceB.id, timestamp: new Date(), levelCm: 42, volumeL: 100 },
  });
  const archivedDevice = await adminService.archiveDevice(deviceB.deviceId);
  check(
    'decommission reports the retained reading count',
    archivedDevice.measurements_retained === beforeCount + 1,
    `${archivedDevice.measurements_retained} readings`
  );

  const readingsStillThere = await prisma.measurement.count({ where: { deviceId: deviceB.id } });
  check('decommission keeps the measurement history', readingsStillThere === beforeCount + 1);

  await expectThrow('a decommissioned device is gone from the API (410)', () =>
    getAccessibleDeviceOrThrow({
      deviceId: deviceB.deviceId,
      user: { id: user.id, role: 'user', tenantId: tenant.id },
    }), 410
  );
  await expectThrow('even an admin gets 410 on a decommissioned device', () =>
    getAccessibleDeviceOrThrow({
      deviceId: deviceB.deviceId,
      user: { id: user.id, role: 'super_admin', tenantId: null },
    }), 410
  );

  const tenantList = await userService.listDevicesForTenant(tenant.id, user.id);
  check(
    'a decommissioned device drops out of the tenant list',
    !tenantList.some((d) => d.id === deviceB.deviceId),
    `${tenantList.length} devices`
  );

  const adminDefault = await adminService.listDevices({});
  check(
    'the admin device list hides archived by default',
    !adminDefault.some((d) => d.device_id === deviceB.deviceId)
  );
  const adminAll = await adminService.listDevices({ includeArchived: true });
  check(
    'include_archived brings it back for an admin',
    adminAll.some((d) => d.device_id === deviceB.deviceId)
  );

  await expectThrow('decommissioning twice is a 409', () =>
    adminService.archiveDevice(deviceB.deviceId), 409
  );
  await adminService.restoreDevice(deviceB.deviceId);
  const back = await getAccessibleDeviceOrThrow({
    deviceId: deviceB.deviceId,
    user: { id: user.id, role: 'user', tenantId: tenant.id },
  });
  check('restore makes the device reachable again', back.id === deviceB.id);

  // User deactivation.
  await expectThrow('you cannot deactivate your own account', () =>
    adminService.archiveUser(user.id, user.id), 409
  );

  await prisma.user.update({ where: { id: outsider.id }, data: { fcmToken: 'push-token' } });
  await prisma.userDeviceMapping.create({ data: { userId: outsider.id, deviceId: device.id } });
  await adminService.archiveUser(outsider.id, user.id);
  const deactivated = await prisma.user.findUniqueOrThrow({ where: { id: outsider.id } });
  check('deactivation sets archivedAt', deactivated.archivedAt != null);
  check('deactivation clears the push token', deactivated.fcmToken === null);
  const grantsLeft = await prisma.userDeviceMapping.count({ where: { userId: outsider.id } });
  check('deactivation revokes explicit device grants', grantsLeft === 0, `${grantsLeft} grants`);

  const userListDefault = await adminService.listUsers({});
  check(
    'the admin user list hides deactivated by default',
    !userListDefault.some((u) => u.id === outsider.id)
  );

  await expectThrow('deactivating twice is a 409', () =>
    adminService.archiveUser(outsider.id, user.id), 409
  );
  await adminService.restoreUser(outsider.id);
  check('restore clears archivedAt', (await prisma.user.findUniqueOrThrow({ where: { id: outsider.id } })).archivedAt === null);

  // The last super admin must not be able to lock everyone out.
  const soleAdmin = await prisma.user.create({
    data: {
      firebaseUid: `crud-sa-${suffix}`,
      email: `sa-${suffix}@example.com`,
      name: 'Sole Super',
      role: 'super_admin',
    },
  });
  const otherSupers = await prisma.user.count({
    where: { role: 'super_admin', archivedAt: null, NOT: { id: soleAdmin.id } },
  });
  if (otherSupers === 0) {
    await expectThrow('the last super admin cannot be deactivated', () =>
      adminService.archiveUser(soleAdmin.id, user.id), 409
    );
  } else {
    check('the last super admin cannot be deactivated', true, `skipped - ${otherSupers} others exist`);
  }
  await prisma.user.delete({ where: { id: soleAdmin.id } });

  // Tenant archive: preview, then cascade to devices and users.
  const preview = await adminService.previewTenantArchive(other.id);
  check(
    'the archive preview counts what it would take',
    preview.devices >= 1 && preview.users >= 1,
    `${preview.devices} devices, ${preview.users} users, ${preview.measurements} readings`
  );

  await adminService.archiveTenant(other.id);
  const archivedTenantDevices = await prisma.device.count({
    where: { tenantId: other.id, archivedAt: null },
  });
  const archivedTenantUsers = await prisma.user.count({
    where: { tenantId: other.id, archivedAt: null },
  });
  check('archiving a tenant archives its devices', archivedTenantDevices === 0);
  check('archiving a tenant archives its users', archivedTenantUsers === 0);

  const tenantsVisible = await adminService.listTenants();
  check(
    'an archived tenant drops out of the tenant list',
    !tenantsVisible.some((t) => t.id === other.id)
  );

  await expectThrow('a device in an archived tenant cannot be restored alone', () =>
    adminService.restoreDevice(foreignDevice.deviceId), 409
  );
  await expectThrow('archiving a tenant twice is a 409', () =>
    adminService.archiveTenant(other.id), 409
  );

  const restoredSummary = await adminService.restoreTenant(other.id);
  check(
    'restoring a tenant brings its devices and users back',
    restoredSummary.devices >= 1 && restoredSummary.users >= 1,
    `${restoredSummary.devices} devices, ${restoredSummary.users} users`
  );
  const liveAgain = await prisma.device.count({ where: { tenantId: other.id, archivedAt: null } });
  check('its devices are live again', liveAgain >= 1, `${liveAgain} devices`);

  // Nothing above destroyed data.
  const survivingReadings = await prisma.measurement.count({ where: { deviceId: deviceB.id } });
  check('no readings were destroyed by any archive', survivingReadings === beforeCount + 1);

  await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, other.id] } } });
  await prisma.$disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
