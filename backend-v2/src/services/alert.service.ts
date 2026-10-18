import { AlertSeverity, AlertType, TankState } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isUniqueConstraintError as isUniqueViolation } from '../lib/prisma-errors';
import {
  REARM_MARGIN_PCT,
  REARM_MARGIN_V,
  TankBand,
  alertForTransition,
  isInBlindZone,
  nextBand,
} from '../lib/tank-band';
import { PushData, sendNotificationToTenant } from './fcm.service';
import { computeLevelPercent } from './tank-profile.service';
import { effectiveThreshold, isAlertRuleEnabled, severityFor } from './alert-rules.service';

// Android notification channels are created by the app at first launch and
// their sound is immutable afterwards, so the id carries a version. The server
// picks the channel per severity; anything unknown stays quiet.
const CHANNEL_BY_SEVERITY: Record<AlertSeverity, string> = {
  critical: 'aquamind_critical_v1',
  high: 'aquamind_high_v1',
  medium: 'aquamind_info_v1',
  low: 'aquamind_info_v1',
};

// Human titles, so a lock screen says "Tank low" rather than "tank_low".
const TITLE_BY_TYPE: Record<AlertType, string> = {
  tank_full: 'Tank full',
  tank_low: 'Tank low',
  battery_low: 'Battery low',
  device_offline: 'Device offline',
  leak_detected: 'Possible leak',
};

/**
 * Whether a reading crosses a configured threshold.
 *
 * Null is the only way an alert is off, and that is deliberate. The legacy
 * litre and battery rules used a truthy check, which made a stored 0 an
 * accidental disable switch on those rules but not on the percentage ones -
 * the same value meaning two different things depending on which branch ran.
 * Here 0 is always a real threshold and null is always off.
 */
export function thresholdCrossed(
  reading: number | null | undefined,
  threshold: number | null | undefined,
  direction: 'at-or-above' | 'at-or-below' | 'below'
): reading is number {
  if (reading == null || threshold == null) return false;
  if (direction === 'at-or-above') return reading >= threshold;
  if (direction === 'at-or-below') return reading <= threshold;
  return reading < threshold;
}

/** Decimal columns arrive as Prisma Decimal; null stays null. */
const num = (value: { toNumber(): number } | null | undefined): number | null =>
  value == null ? null : value.toNumber();

export async function processAlertsForMeasurement(
  deviceId: string,
  measurement: { levelCm: number | null; volumeL: number | null; batteryV: number | null }
): Promise<void> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { config: true, tankProfile: true, tankState: true },
  });
  if (!device || !device.tenantId) return;

  const config = device.config;
  const profile = device.tankProfile;
  const state = device.tankState;
  const { levelCm, volumeL, batteryV } = measurement;

  // Read once, as plain numbers. null means that threshold is not set, which
  // is one of two ways an alert is off for this device - the other is the
  // rule's enabled flag (issue #13). Both come from the same catalog the
  // settings screen renders, so what the user sees is what fires.
  const fullPct = num(config?.tankFullThresholdPct);
  const lowPct = num(config?.tankLowThresholdPct);
  const fullL = num(config?.tankFullThresholdL);
  const lowL = num(config?.tankLowThresholdL);
  const batteryMinV = effectiveThreshold(config, 'battery_low');

  // Work out the band this reading puts the tank in. Bands are tracked even
  // while a rule is switched off, so turning it back on doesn't alert for a
  // crossing that happened while it was off.
  let band: TankBand | null = null;
  let inBlindZone = false;
  let levelPercent: number | null = null;
  let message: Record<'tank_full' | 'tank_low', string> | null = null;
  let detail: Record<string, unknown> = {};
  let extras: PushData = {};

  // A null reading means the sensor couldn't be read this cycle - there's
  // nothing to decide on, and it must not be treated as "tank is empty". The
  // band stays where it was.
  if (levelCm != null && volumeL != null) {
    // With a tank profile, thresholds are percentage-based (device-agnostic,
    // works for parallel-plumbed tanks). Without one yet, fall back to the
    // legacy liter thresholds so existing devices keep alerting unchanged.
    if (profile && (fullPct != null || lowPct != null)) {
      const geometry = {
        heightCm: profile.heightCm.toNumber(),
        sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
        deadZoneCm: profile.deadZoneCm.toNumber(),
      };
      levelPercent = computeLevelPercent(levelCm, geometry)!;
      inBlindZone = isInBlindZone(levelCm, geometry);
      band = nextBand(state?.band ?? null, {
        value: levelPercent,
        fullAt: fullPct,
        lowAt: lowPct,
        margin: REARM_MARGIN_PCT,
        inBlindZone,
      });
      message = {
        tank_full: `Tank is full (${levelPercent.toFixed(0)}%)`,
        tank_low: `Tank is low (${levelPercent.toFixed(0)}%)`,
      };
      detail = { level_percent: levelPercent, in_blind_zone: inBlindZone, full_pct: fullPct, low_pct: lowPct };
      extras = { level_percent: levelPercent.toFixed(1) };
    } else if (fullL != null || lowL != null) {
      // No capacity to take a percentage of, so the margin is 10% of the
      // larger threshold - about what REARM_MARGIN_PCT is on a profiled tank.
      band = nextBand(state?.band ?? null, {
        value: volumeL,
        fullAt: fullL,
        lowAt: lowL,
        margin: Math.max(fullL ?? 0, lowL ?? 0) * 0.1,
      });
      message = {
        tank_full: `Tank is full (${volumeL.toFixed(1)}L)`,
        tank_low: `Tank is low (${volumeL.toFixed(1)}L)`,
      };
      detail = { volume_l: volumeL, full_l: fullL, low_l: lowL };
    }
  }

  // Battery has one threshold, so it's a flag rather than a band: low below
  // the minimum, and not low again until it recovers past the margin.
  let batteryLow = state?.batteryLow ?? false;
  if (batteryV != null && batteryMinV != null) {
    batteryLow = batteryLow ? batteryV < batteryMinV + REARM_MARGIN_V : batteryV < batteryMinV;
  }

  const won = await saveTankState(deviceId, state, {
    band: band ?? state?.band ?? 'normal',
    inBlindZone: band != null ? inBlindZone : (state?.inBlindZone ?? false),
    levelPercent: levelPercent ?? num(state?.levelPercent),
    batteryLow,
  });
  // Another reading for this device got there first and has already acted on
  // the same change; alerting here too would send it twice.
  if (!won) return;

  const tankAlert = band != null ? alertForTransition(state?.band ?? null, band) : null;
  if (tankAlert && message && isAlertRuleEnabled(config, tankAlert)) {
    await createAndSendAlert(device.id, device.tenantId, tankAlert, message[tankAlert], detail, extras, {
      transition: true,
    });
  }

  // Seeding (no state yet) never alerts, as with the tank bands.
  if (state && !state.batteryLow && batteryLow && isAlertRuleEnabled(config, 'battery_low')) {
    await createAndSendAlert(
      device.id,
      device.tenantId,
      'battery_low',
      `Battery is low (${batteryV!.toFixed(2)}V)`,
      { battery_v: batteryV, threshold: batteryMinV },
      {},
      { transition: true }
    );
  }
}

/**
 * Writes the tank's new state, and reports whether this reading's view of the
 * previous state was still current. Two readings processed at once would
 * otherwise both see "normal -> full" and both alert; the conditional update
 * lets exactly one of them through.
 */
async function saveTankState(
  deviceId: string,
  previous: TankState | null,
  next: { band: TankBand; inBlindZone: boolean; levelPercent: number | null; batteryLow: boolean }
): Promise<boolean> {
  const bandChanged = !previous || previous.band !== next.band;
  const data = { ...next, ...(bandChanged ? { bandChangedAt: new Date() } : {}) };

  if (!previous) {
    try {
      await prisma.tankState.create({ data: { deviceId, ...data } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  const { count } = await prisma.tankState.updateMany({
    where: { deviceId, band: previous.band, batteryLow: previous.batteryLow },
    data,
  });
  return count === 1;
}

export async function checkDeviceOfflineAlerts(): Promise<void> {
  console.log('Checking for offline devices...');

  // The timeout is per device now (a solar node that sleeps overnight wants
  // hours, a mains node wants minutes), so the cut-off is decided per row
  // rather than in the WHERE clause. Only devices currently marked online are
  // candidates, which keeps this small.
  const now = Date.now();
  const candidates = await prisma.device.findMany({
    where: { status: 'online' },
    include: { config: true },
  });

  let flipped = 0;
  for (const device of candidates) {
    const thresholdMinutes = effectiveThreshold(device.config, 'device_offline');
    if (thresholdMinutes == null) continue;
    // Never-seen devices are skipped, as the old `lastSeen < cutoff` query did.
    if (!device.lastSeen || device.lastSeen.getTime() >= now - thresholdMinutes * 60 * 1000) continue;

    // Status flips regardless of the rule - it's a fact, not an alert.
    await prisma.device.update({ where: { id: device.id }, data: { status: 'offline' } });
    flipped += 1;

    if (!device.tenantId) continue;
    if (!isAlertRuleEnabled(device.config, 'device_offline')) continue;

    await createAndSendAlert(
      device.id,
      device.tenantId,
      'device_offline',
      `Device ${device.deviceId} has been offline for ${thresholdMinutes} minutes`,
      { device_id: device.deviceId, last_seen: device.lastSeen, threshold_min: thresholdMinutes }
    );
  }

  console.log(`Found ${flipped} offline devices`);
}

export async function createLeakAlert(deviceId: string, tenantId: string, details: unknown): Promise<void> {
  // Leak detection has no threshold to tune, so the enabled flag is the whole
  // rule - and it used to be impossible to switch off.
  const config = await prisma.deviceConfig.findUnique({ where: { deviceId } });
  if (!isAlertRuleEnabled(config, 'leak_detected')) return;

  await createAndSendAlert(
    deviceId,
    tenantId,
    'leak_detected',
    'Possible leak detected based on unusual consumption pattern',
    details
  );
}

async function createAndSendAlert(
  deviceId: string,
  tenantId: string,
  type: AlertType,
  message: string,
  payload: unknown,
  // Extras the app reads straight off the push: enough to update the
  // home-screen widget without opening a connection.
  extras: PushData = {},
  // transition: the caller already knows this is a new crossing (tank state
  // changed band), so the time window below would only swallow real events -
  // a tank refilled twice in an hour is two refills.
  opts: { transition?: boolean } = {}
): Promise<void> {
  // Everything else - offline, leak - keeps a one-hour guard against repeats.
  // It no longer looks at `acknowledged`: acknowledging used to clear the
  // guard, so the next reading alerted again straight away.
  if (!opts.transition) {
    const existing = await prisma.alert.findFirst({
      where: { deviceId, type, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (existing) return;
  }

  // Severity is owned by the rule catalog, so the alert a user receives and
  // the rule they see in settings can never disagree.
  const severity = severityFor(type);

  const alert = await prisma.alert.create({
    data: { deviceId, tenantId, type, severity, message, payload: payload as any },
  });

  await sendAlertNotification(tenantId, alert.id, deviceId, type, severity, message, extras);
}

/**
 * Shapes one alert into its push envelope. Pure and exported so the contract
 * the app depends on - a lock-screen title, and enough data to repaint the
 * home-screen widget without a request - is covered by tests.
 */
export function buildAlertNotification(input: {
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  deviceName: string;
  hardwareDeviceId: string;
  online?: boolean;
  asOf: Date;
  extras?: PushData;
}): { title: string; body: string; data: PushData } {
  return {
    title: `${TITLE_BY_TYPE[input.type]} · ${input.deviceName}`,
    body: input.message,
    data: {
      alert_id: input.alertId,
      // Hardware id: what /api/v1/user/devices/:deviceId takes. The internal
      // UUID is meaningless to the app.
      device_id: input.hardwareDeviceId,
      device_name: input.deviceName,
      type: input.type,
      severity: input.severity,
      channel_id: CHANNEL_BY_SEVERITY[input.severity],
      online: input.online,
      as_of: input.asOf.toISOString(),
      ...input.extras,
    },
  };
}

async function sendAlertNotification(
  tenantId: string,
  alertId: string,
  deviceId: string,
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  extras: PushData
): Promise<void> {
  // The hardware id is what the app addresses devices by; the internal UUID is
  // meaningless to it, and the name is what the notification should say.
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { deviceId: true, name: true, status: true, archivedAt: true },
  });

  // A decommissioned device keeps its history but must not raise notifications.
  if (device?.archivedAt) {
    console.log(`[alerts] ${type} suppressed: device ${device.deviceId} is archived`);
    return;
  }

  const deviceName = device?.name || device?.deviceId || 'Your tank';

  const envelope = buildAlertNotification({
    alertId,
    type,
    severity,
    message,
    deviceName,
    hardwareDeviceId: device?.deviceId ?? '',
    online: device ? device.status === 'online' : undefined,
    asOf: new Date(),
    extras,
  });

  const sent = await sendNotificationToTenant(tenantId, envelope.title, envelope.body, envelope.data);

  if (sent > 0) {
    await prisma.alert.update({ where: { id: alertId }, data: { deliveredToFirebase: true } });
  }
  console.log(`[alerts] ${type} for ${deviceName}: ${sent} notification(s) sent`);
}
