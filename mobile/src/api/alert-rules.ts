import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';

import { request } from '@/api/client';
import { alertSeveritySchema } from '@/api/schemas';
import { learnAlertLabels } from '@/lib/format';

/**
 * Per-tank alert rules — the catalogue of everything the server can raise for
 * one device, with the two things a user may change about each: whether it is
 * on, and (for rules that compare a reading) the number it compares against.
 *
 * The screen is driven by this list, not by a hard-coded set of fields, so a
 * new server-side rule appears in the app without a release. Nothing here
 * knows a rule type by name.
 */

const BASE = '/api/v1/user';

export const thresholdUnitSchema = z.enum(['%', 'V', 'min']);

export const alertRuleSchema = z.object({
  type: z.string(),
  label: z.string(),
  description: z.string(),
  severity: alertSeveritySchema,
  /** Which section the rule sits under: compares a reading, watches a trend, or runs on a timer. */
  source: z.enum(['reading', 'pattern', 'schedule']),
  enabled: z.boolean(),
  /** Null for rules with nothing to tune (leak, offline). `value` null means "use `default`". */
  threshold: z
    .object({
      value: z.number().nullable(),
      default: z.number().nullable(),
      unit: thresholdUnitSchema,
      min: z.number(),
      max: z.number(),
      comparison: z.enum(['below', 'above']),
    })
    .nullable(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;
export type AlertThreshold = NonNullable<AlertRule['threshold']>;

export const alertRulesSchema = z.object({ rules: z.array(alertRuleSchema) });

/** PUT body: only the rules being changed, only the fields changing. `threshold: null` restores the default. */
export type AlertRulesUpdate = Record<string, { enabled?: boolean; threshold?: number | null }>;

const id = (value: string) => encodeURIComponent(value);

export const alertRulesApi = {
  list: (deviceId: string) =>
    request(`${BASE}/devices/${id(deviceId)}/alert-rules`, alertRulesSchema).then((r) => r.rules),
  update: (deviceId: string, rules: AlertRulesUpdate) =>
    request(`${BASE}/devices/${id(deviceId)}/alert-rules`, alertRulesSchema, {
      method: 'PUT',
      body: { rules },
    }).then((r) => r.rules),
};

export const alertRulesKey = (deviceId: string) => ['device', deviceId, 'alert-rules'] as const;

export function useAlertRules(deviceId: string | undefined) {
  const query = useQuery({
    queryKey: alertRulesKey(deviceId ?? ''),
    enabled: !!deviceId,
    queryFn: () => alertRulesApi.list(deviceId!),
    // Rules change when a person edits them, not on a cadence.
    staleTime: 5 * 60_000,
  });

  // The server's labels are the truth for alert types everywhere else in the
  // app (the Activity feed, notifications), so teach the formatter each time.
  useEffect(() => {
    if (query.data) learnAlertLabels(query.data);
  }, [query.data]);

  return query;
}

/**
 * Apply a PUT body to a cached rule list — what the screen shows in the gap
 * between the tap and the server's answer.
 */
export function applyRulesUpdate(rules: AlertRule[], update: AlertRulesUpdate): AlertRule[] {
  return rules.map((rule) => {
    const patch = update[rule.type];
    if (!patch) return rule;
    return {
      ...rule,
      enabled: patch.enabled ?? rule.enabled,
      threshold:
        rule.threshold && patch.threshold !== undefined
          ? { ...rule.threshold, value: patch.threshold }
          : rule.threshold,
    };
  });
}

/**
 * Every change saves immediately and optimistically: the switch flips on the
 * tap, the threshold line updates as the editor closes, and either reverts if
 * the server refuses. The server's reply replaces the cache wholesale so a
 * clamped or normalised value shows as the server stored it.
 */
export function useUpdateAlertRules(deviceId: string) {
  const client = useQueryClient();
  const key = alertRulesKey(deviceId);
  return useMutation({
    mutationFn: (update: AlertRulesUpdate) => alertRulesApi.update(deviceId, update),
    onMutate: async (update) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<AlertRule[]>(key);
      if (previous) client.setQueryData(key, applyRulesUpdate(previous, update));
      return { previous };
    },
    onError: (_error, _update, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (saved) => {
      client.setQueryData(key, saved);
      // The Tanks screen derives "running low" from the same numbers.
      void client.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

/** The number a rule currently compares against: the user's, else the server default. */
export function effectiveThreshold(threshold: AlertThreshold): number | null {
  return threshold.value ?? threshold.default;
}

/**
 * "20%", "3.3 V", "30 min" — percent hugs the number, everything else gets a
 * space. A threshold is a number someone typed, so it is shown as typed (to
 * two places), not padded like a reading.
 */
export function formatThresholdValue(value: number, unit: AlertThreshold['unit']): string {
  const number = String(Math.round(value * 100) / 100);
  return unit === '%' ? `${number}%` : `${number} ${unit}`;
}

/** The secondary line under a rule: "Below 20%", "Above 95%", "Default 3.3 V", or "Not set". */
export function formatThreshold(threshold: AlertThreshold): string {
  if (threshold.value === null) {
    return threshold.default === null
      ? 'Not set'
      : `Default ${formatThresholdValue(threshold.default, threshold.unit)}`;
  }
  const word = threshold.comparison === 'below' ? 'Below' : 'Above';
  return `${word} ${formatThresholdValue(threshold.value, threshold.unit)}`;
}

/**
 * "Tank low" reads as "Low" once it sits next to the tank's name; other labels
 * are left alone. Purely a display trim for one-line summaries.
 */
function shortLabel(rule: AlertRule): string {
  const trimmed = rule.label.replace(/^tank\s+/i, '');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Settings-row summary: "4 of 5 on · Low 20% · Full 95% · Battery low 3.3 V". */
export function summariseRules(rules: AlertRule[]): string {
  const on = rules.filter((rule) => rule.enabled).length;
  const parts = [`${on} of ${rules.length} on`];
  for (const rule of rules) {
    if (!rule.enabled || !rule.threshold) continue;
    const value = effectiveThreshold(rule.threshold);
    if (value === null) continue;
    parts.push(`${shortLabel(rule)} ${formatThresholdValue(value, rule.threshold.unit)}`);
  }
  return parts.join(' · ');
}

/** Percent-based bounds for the level chart: every enabled rule with a % threshold. */
export function levelThresholdLines(rules: AlertRule[]): { value: number; label: string }[] {
  const lines: { value: number; label: string }[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.threshold?.unit !== '%') continue;
    const value = effectiveThreshold(rule.threshold);
    if (value !== null) lines.push({ value, label: shortLabel(rule) });
  }
  return lines;
}
