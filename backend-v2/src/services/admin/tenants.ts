import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { toTenantDto } from './shared';

// Tenant administration. A tenant is a customer organisation; archiving one
// takes its devices and users with it.

// Counts exclude archived children, so an archived device does not inflate a
// tenant's device count.
const liveCounts = {
  _count: {
    select: { devices: { where: { archivedAt: null } }, users: { where: { archivedAt: null } } },
  },
} as const;

function toTenantWithCounts(t: { _count: { devices: number; users: number } } & Parameters<typeof toTenantDto>[0]) {
  return {
    id: t.id,
    name: t.name,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    device_count: t._count.devices,
    user_count: t._count.users,
    archived_at: t.archivedAt,
  };
}

export async function listTenants(opts: { includeArchived?: boolean } = {}) {
  const tenants = await prisma.tenant.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    include: liveCounts,
    orderBy: { createdAt: 'desc' },
  });
  return tenants.map(toTenantWithCounts);
}

/**
 * One tenant with its live device and user counts (#9). The console used to
 * find a tenant inside the list response, loading every tenant to show one.
 */
export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: liveCounts });
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  return toTenantWithCounts(tenant);
}

export async function createTenant(name: string) {
  const existing = await prisma.tenant.findFirst({ where: { name } });
  if (existing) throw new HttpError(409, 'Tenant name already exists');
  return toTenantDto(await prisma.tenant.create({ data: { name } }));
}

export async function updateTenant(tenantId: string, name: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const nameTaken = await prisma.tenant.findFirst({ where: { name, NOT: { id: tenantId } } });
  if (nameTaken) throw new HttpError(409, 'Tenant name already exists');

  return toTenantDto(await prisma.tenant.update({ where: { id: tenantId }, data: { name } }));
}

// --- Soft delete -----------------------------------------------------------
// Tenant -> User and Tenant -> Device are onDelete: Cascade, so a real DELETE
// on a tenant row would destroy every reading ever taken under it. Archiving
// blocks access (see firebaseAuth and getAccessibleDeviceOrThrow) while
// keeping history.

export interface ArchiveSummary {
  tenants: number;
  devices: number;
  users: number;
  measurements: number;
}

/** What a tenant archive would take with it, for a confirmation prompt. */
export async function previewTenantArchive(tenantId: string): Promise<ArchiveSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const devices = await prisma.device.findMany({ where: { tenantId }, select: { id: true } });
  const [users, measurements] = await Promise.all([
    prisma.user.count({ where: { tenantId, archivedAt: null } }),
    devices.length
      ? prisma.measurement.count({ where: { deviceId: { in: devices.map((d) => d.id) } } })
      : Promise.resolve(0),
  ]);

  return { tenants: 1, devices: devices.length, users, measurements };
}

/**
 * Archive a tenant together with its devices and users, so no orphan keeps
 * access. One timestamp for the whole set makes the group obvious in the data.
 */
export async function archiveTenant(tenantId: string): Promise<ArchiveSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.archivedAt) throw new HttpError(409, 'Tenant is already archived');

  const summary = await previewTenantArchive(tenantId);
  const archivedAt = new Date();

  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { archivedAt } }),
    prisma.device.updateMany({ where: { tenantId, archivedAt: null }, data: { archivedAt } }),
    prisma.user.updateMany({ where: { tenantId, archivedAt: null }, data: { archivedAt } }),
  ]);

  return summary;
}

/** Bring a tenant back, along with everything archived under it. */
export async function restoreTenant(tenantId: string): Promise<ArchiveSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (!tenant.archivedAt) throw new HttpError(409, 'Tenant is not archived');

  const [devices, users] = await prisma.$transaction([
    prisma.device.updateMany({ where: { tenantId }, data: { archivedAt: null } }),
    prisma.user.updateMany({ where: { tenantId }, data: { archivedAt: null } }),
  ]);
  await prisma.tenant.update({ where: { id: tenantId }, data: { archivedAt: null } });

  return { tenants: 1, devices: devices.count, users: users.count, measurements: 0 };
}
