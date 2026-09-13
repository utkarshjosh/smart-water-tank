import { AlertSeverity, AlertType, Device, DeviceConfig, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { env } from '../config/env';
import { bumpConfigVersion } from '../lib/config-version';
import { pushConfigToDevice } from '../gateway/registry';

// ---------------------------------------------------------------------------
// Per-device alert rules (issue #13)
//
// One server-owned catalog of every alert type: what it is, how severe, where
// it comes from, and - for the tunable ones - which DeviceConfig column holds
// the per-device override and what it falls back to. The API exposes the
// catalog resolved against one device's config so the app renders a settings
// screen without hard-coding any rule, and a new type only needs an entry here.
// ---------------------------------------------------------------------------

// Where a rule's signal comes from: a raw threshold on one reading, a pattern
// derived analytically from many, or a periodic server-side check.
export type AlertRuleSource = 'reading' | 'pattern' | 'schedule';
export type AlertThresholdUnit = '%' | 'V' | 'min';
export type AlertComparison = 'below' | 'above';

export interface AlertRuleThreshold {
  // The stored per-device override; null = not set.
  value: number | null;
  // What the rule falls back to when no override is set; null = the rule
  // cannot fire until the user sets one.
  default: number | null;
  unit: AlertThresholdUnit;
  min: number;
  max: number;
  comparison: AlertComparison;
}

export interface AlertRule {
  type: AlertType;
  label: string;
  description: string;
  severity: AlertSeverity;
  source: AlertRuleSource;
  enabled: boolean;
  // null for rules with no tunable number (leak detection).
  threshold: AlertRuleThreshold | null;
}

export interface AlertRuleUpdate {
  enabled?: boolean;
  // null clears the per-device override so the rule falls back to its default.
  threshold?: number | null;
}

// Shape of DeviceConfig.alertRules. Only the switch lives in JSON; tunable
// numbers stay in their typed columns so the device-facing config and the
// legacy /alert-thresholds route keep reading the same values.
type StoredAlertRules = Partial<Record<AlertType, { enabled: boolean }>>;

// Lives here rather than in device.service so the catalog has no import cycle
// through alert.service; device.service's DEFAULT_OPERATIONAL reads it.
export const DEFAULT_BATTERY_LOW_THRESHOLD_V = 3.3;

// The columns a threshold override can be written to.
type ThresholdColumn = 'tankLowThresholdPct' | 'tankFullThresholdPct' | 'batteryLowThresholdV' | 'offlineThresholdMin';

interface ThresholdDefinition {
  column: ThresholdColumn;
  unit: AlertThresholdUnit;
  min: number;
  max: number;
  comparison: AlertComparison;
  // Read lazily: the offline default comes from env and must reflect the
  // process that is answering, not the one that loaded this module.
  default: () => number | null;
}

interface AlertRuleDefinition {
  type: AlertType;
  label: string;
  description: string;
  severity: AlertSeverity;
  source: AlertRuleSource;
  threshold: ThresholdDefinition | null;
}

// Catalog order is display order.
const CATALOG: AlertRuleDefinition[] = [
  {
    type: 'tank_low',
    label: 'Tank low',
    description: 'Fires when the water level drops to or below the threshold.',
    severity: 'critical',
    source: 'reading',
    threshold: { column: 'tankLowThresholdPct', unit: '%', min: 0, max: 100, comparison: 'below', default: () => null },
  },
  {
    type: 'tank_full',
    label: 'Tank full',
    description: 'Fires when the water level rises to or above the threshold.',
    severity: 'high',
    source: 'reading',
    threshold: { column: 'tankFullThresholdPct', unit: '%', min: 0, max: 100, comparison: 'above', default: () => null },
  },
  {
    type: 'battery_low',
    label: 'Battery low',
    description: 'Fires when the sensor battery voltage drops below the threshold.',
    severity: 'medium',
    source: 'reading',
    threshold: {
      column: 'batteryLowThresholdV',
      unit: 'V',
      min: 0,
      max: 12,
      comparison: 'below',
      default: () => DEFAULT_BATTERY_LOW_THRESHOLD_V,
    },
  },
  {
    type: 'leak_detected',
    label: 'Possible leak',
    description: 'Fires when the nightly usage summary finds water draining steadily with no refill.',
    severity: 'high',
    source: 'pattern',
    threshold: null,
  },
  {
    type: 'device_offline',
    label: 'Device offline',
    description: 'Fires when the device has not reported for longer than the threshold.',
    severity: 'high',
    source: 'schedule',
    threshold: {
      column: 'offlineThresholdMin',
      unit: 'min',
      min: 1,
      // A week - anything longer is "never", and a sensor that quiet is a
      // decommissioned one, not an offline one.
      max: 10080,
      comparison: 'above',
      default: () => env.alertOfflineThresholdMinutes,
    },
  },
];

const BY_TYPE = new Map(CATALOG.map((d) => [d.type, d]));

function definitionOrThrow(type: string): AlertRuleDefinition {
  const def = BY_TYPE.get(type as AlertType);
  if (!def) throw new HttpError(400, `Unknown alert rule type: ${type}`);
  return def;
}

function storedRules(config: Pick<DeviceConfig, 'alertRules'> | null): StoredAlertRules {
  const raw = config?.alertRules;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as StoredAlertRules) : {};
}

function storedThreshold(config: DeviceConfig | null, column: ThresholdColumn): number | null {
  const raw = config?.[column];
  if (raw == null) return null;
  return typeof raw === 'number' ? raw : raw.toNumber();
}

/** Whether a rule may fire for this device. Absent from storage = enabled. */
export function isAlertRuleEnabled(config: Pick<DeviceConfig, 'alertRules'> | null, type: AlertType): boolean {
  return storedRules(config)[type]?.enabled !== false;
}

/**
 * The number a rule actually compares against: the per-device override if
 * set, else the catalog default. Null means the rule cannot fire.
 */
export function effectiveThreshold(config: DeviceConfig | null, type: AlertType): number | null {
  const def = BY_TYPE.get(type);
  if (!def?.threshold) return null;
  return storedThreshold(config, def.threshold.column) ?? def.threshold.default();
}

/** Catalog severity, so a raised alert and its rule never disagree. */
export function severityFor(type: AlertType): AlertSeverity {
  return definitionOrThrow(type).severity;
}

/** The catalog resolved against one device's stored config. Pure. */
export function resolveAlertRules(config: DeviceConfig | null): AlertRule[] {
  return CATALOG.map((def) => ({
    type: def.type,
    label: def.label,
    description: def.description,
    severity: def.severity,
    source: def.source,
    enabled: isAlertRuleEnabled(config, def.type),
    threshold: def.threshold
      ? {
          value: storedThreshold(config, def.threshold.column),
          default: def.threshold.default(),
          unit: def.threshold.unit,
          min: def.threshold.min,
          max: def.threshold.max,
          comparison: def.threshold.comparison,
        }
      : null,
  }));
}

/**
 * Validate a partial update and turn it into the DeviceConfig write it
 * implies. Pure and exported so the 400s are covered by tests without a DB.
 */
export function buildAlertRulesWrite(
  config: DeviceConfig | null,
  updates: Record<string, AlertRuleUpdate>
): Prisma.DeviceConfigUncheckedUpdateInput {
  const rules: StoredAlertRules = { ...storedRules(config) };
  const data: Prisma.DeviceConfigUncheckedUpdateInput = {};

  for (const [type, update] of Object.entries(updates)) {
    const def = definitionOrThrow(type);

    if (update.enabled !== undefined) {
      rules[def.type] = { enabled: update.enabled };
    }

    if (update.threshold !== undefined) {
      if (!def.threshold) {
        throw new HttpError(400, `${def.label} has no threshold to set`);
      }
      const { min, max, unit, column } = def.threshold;
      if (update.threshold !== null && (update.threshold < min || update.threshold > max)) {
        throw new HttpError(400, `${def.label} threshold must be between ${min} and ${max} ${unit}`);
      }
      data[column] = update.threshold;
    }
  }

  data.alertRules = rules as Prisma.InputJsonObject;
  return data;
}

export async function getAlertRules(device: Device): Promise<{ rules: AlertRule[] }> {
  const config = await prisma.deviceConfig.findUnique({ where: { deviceId: device.id } });
  return { rules: resolveAlertRules(config) };
}

export async function updateAlertRules(
  device: Device,
  updates: Record<string, AlertRuleUpdate>
): Promise<{ rules: AlertRule[] }> {
  const existing = await prisma.deviceConfig.findUnique({ where: { deviceId: device.id } });
  const data = buildAlertRulesWrite(existing, updates);

  const config = await prisma.deviceConfig.upsert({
    where: { deviceId: device.id },
    // Only plain values are ever put in `data` (no `{ set }` wrappers), so the
    // same object is valid as a create input.
    create: { ...(data as Omit<Prisma.DeviceConfigUncheckedCreateInput, 'deviceId'>), deviceId: device.id },
    update: data,
  });

  // The tank and battery thresholds ride along in the device-facing config,
  // so the device is stale on its next check-in. Same fire-and-forget push as
  // updateAlertThresholds: a down broker never breaks this response.
  await bumpConfigVersion(device.id);
  void pushConfigToDevice(device.id);

  return { rules: resolveAlertRules(config) };
}
