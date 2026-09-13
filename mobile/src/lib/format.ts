/**
 * Display helpers. The rule they all share: a null reading means UNKNOWN and
 * renders as an em dash. It must never render as 0, which would read as an
 * empty tank when the truth is "the sensor did not answer this cycle".
 */

export const UNKNOWN = '—';

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNKNOWN;
  return `${Math.round(value)}%`;
}

export function formatLitres(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNKNOWN;
  // Litres are a supporting figure; a decimal place on 1,840 L is noise.
  return `${Math.round(value).toLocaleString()} L`;
}

export function formatCapacity(used: number | null, total: number | null): string {
  if (used === null || total === null) return formatLitres(used);
  return `${Math.round(used).toLocaleString()} / ${Math.round(total).toLocaleString()} L`;
}

export function formatCm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNKNOWN;
  return `${value.toFixed(1)} cm`;
}

export function formatTemperature(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNKNOWN;
  return `${value.toFixed(1)}°C`;
}

export function formatVolts(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNKNOWN;
  return `${value.toFixed(2)} V`;
}

/**
 * Relative age, the phrase that appears under every reading in the app.
 * Coarse on purpose — "4 min ago" is the useful granularity for a tank that
 * reports every few minutes, and seconds would churn the text pointlessly.
 */
export function formatAge(when: Date | null, now = Date.now()): string {
  if (!when) return 'never';
  const seconds = Math.round((now - when.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return when.toLocaleDateString();
}

/**
 * Fallback labels for the rule types we shipped with. The alert-rules
 * catalogue carries the server's own label for every rule, and once it has
 * been seen that label wins — so a renamed or brand-new rule type reads
 * correctly in the Activity feed without an app update.
 */
const ALERT_LABELS: Record<string, string> = {
  tank_full: 'Tank full',
  tank_low: 'Tank low',
  battery_low: 'Battery low',
  device_offline: 'Device offline',
  leak_detected: 'Possible leak',
};

const serverLabels = new Map<string, string>();

/** Called with each alert-rules response; see useAlertRules. */
export function learnAlertLabels(rules: { type: string; label: string }[]): void {
  for (const rule of rules) serverLabels.set(rule.type, rule.label);
}

export function formatAlertType(type: string): string {
  return serverLabels.get(type) ?? ALERT_LABELS[type] ?? type.replace(/_/g, ' ');
}
