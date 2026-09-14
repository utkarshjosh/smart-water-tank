import { AlertSeverity } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { toAdminAlertDto } from './shared';

// Fleet-wide read models for the admin dashboard.

export async function analyticsSummary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalDevices, onlineDevices, totalTenants, recentAlerts, todayMeasurements] = await Promise.all([
    prisma.device.count({ where: { archivedAt: null } }),
    prisma.device.count({ where: { status: 'online', archivedAt: null } }),
    prisma.tenant.count({ where: { archivedAt: null } }),
    prisma.alert.count({ where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.measurement.count({ where: { timestamp: { gte: startOfToday } } }),
  ]);

  return {
    total_devices: totalDevices,
    online_devices: onlineDevices,
    offline_devices: totalDevices - onlineDevices,
    total_tenants: totalTenants,
    recent_alerts_24h: recentAlerts,
    measurements_today: todayMeasurements,
  };
}

/**
 * Fleet-wide alert feed. The admin dashboard showed a 24-hour alert count with
 * nothing to drill into, because no endpoint listed alerts across devices.
 */
export async function listAlerts(opts: {
  limit: number;
  tenantId?: string;
  deviceId?: string;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  includeDismissed: boolean;
  since?: Date;
}) {
  const where = {
    ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    ...(opts.deviceId ? { device: { deviceId: opts.deviceId } } : {}),
    ...(opts.severity ? { severity: opts.severity } : {}),
    ...(opts.acknowledged !== undefined ? { acknowledged: opts.acknowledged } : {}),
    ...(opts.includeDismissed ? {} : { dismissedAt: null }),
    ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      include: {
        device: { select: { deviceId: true, name: true } },
        tenant: { select: { id: true, name: true } },
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return {
    total,
    alerts: alerts.map((a) => ({
      ...toAdminAlertDto(a),
      device_id: a.device.deviceId,
      device_name: a.device.name || a.device.deviceId,
      tenant_id: a.tenant.id,
      tenant_name: a.tenant.name,
    })),
  };
}
