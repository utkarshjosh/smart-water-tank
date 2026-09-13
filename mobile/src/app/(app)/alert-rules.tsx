import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import {
  formatThreshold,
  formatThresholdValue,
  useAlertRules,
  useUpdateAlertRules,
  type AlertRule,
  type AlertRulesUpdate,
  type AlertThreshold,
} from '@/api/alert-rules';
import { useDevices } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import { Button, Card, Divider, Label, StatusDot, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, type as typeScale, useTheme, type Colors } from '@/ui/theme';

/**
 * Alert rules for one tank — a list of switches, not a form.
 *
 * The rows come from the server's catalogue and are grouped by where each
 * rule gets its evidence. Every change saves the moment it is made: a switch
 * flips, a threshold commits when its editor closes, and the row reverts
 * with a one-line reason if the server says no. There is no Save button to
 * forget.
 */

const SECTIONS: { source: AlertRule['source']; title: string }[] = [
  { source: 'reading', title: 'From readings' },
  { source: 'pattern', title: 'Detected patterns' },
  { source: 'schedule', title: 'Checks' },
];

const SEVERITY_TONE: Record<AlertRule['severity'], keyof Colors> = {
  critical: 'crit',
  high: 'warn',
  medium: 'mutedForeground',
  low: 'mutedForeground',
};

export default function AlertRulesScreen() {
  const router = useRouter();
  const { device: deviceId } = useLocalSearchParams<{ device: string }>();
  const devices = useDevices();
  const device = devices.data?.find((d) => d.id === deviceId);
  const rules = useAlertRules(deviceId);
  const save = useUpdateAlertRules(deviceId ?? '');
  // One failure line per rule, cleared by the next successful save of that rule.
  const [errors, setErrors] = useState<Record<string, string>>({});

  const groups = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        rules: (rules.data ?? []).filter((rule) => rule.source === section.source),
      })).filter((section) => section.rules.length > 0),
    [rules.data]
  );

  function update(type: string, patch: AlertRulesUpdate[string]) {
    save.mutate(
      { [type]: patch },
      {
        onSuccess: () => setErrors((prev) => (type in prev ? omit(prev, type) : prev)),
        onError: (error) => setErrors((prev) => ({ ...prev, [type]: `Couldn’t save — ${error.message}` })),
      }
    );
  }

  return (
    <Screen
      title="Alert rules"
      subtitle={device?.name ?? deviceId}
      onBack={() => router.back()}
      onRefresh={() => void rules.refetch()}
      refreshing={rules.isRefetching}
    >
      {rules.isPending && !rules.data && (
        <Text variant="body" color="mutedForeground">
          Loading…
        </Text>
      )}

      {rules.isError && !rules.data && (
        <Card accent="crit">
          <Text variant="heading">Could not load alert rules</Text>
          <Text variant="body" color="mutedForeground">
            {rules.error.message}
          </Text>
          <Button title="Try again" variant="secondary" onPress={() => void rules.refetch()} />
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.source}>
          <Label>{group.title}</Label>
          {group.rules.map((rule, index) => (
            <View key={rule.type} style={styles.ruleBlock}>
              {index > 0 && <Divider />}
              <RuleRow
                rule={rule}
                error={errors[rule.type] ?? null}
                onToggle={(enabled) => {
                  haptics.selection();
                  update(rule.type, { enabled });
                }}
                onThreshold={(threshold) => update(rule.type, { threshold })}
              />
            </View>
          ))}
        </Card>
      ))}

      {rules.data && (
        <Text variant="caption" color="mutedForeground">
          Rules run on the server, so they work while the app is closed. More rules arrive with server
          updates.
        </Text>
      )}
    </Screen>
  );
}

function omit<T extends Record<string, unknown>>(record: T, key: string): T {
  const { [key]: _dropped, ...rest } = record;
  return rest as T;
}

function RuleRow({
  rule,
  error,
  onToggle,
  onThreshold,
}: {
  rule: AlertRule;
  error: string | null;
  onToggle: (enabled: boolean) => void;
  onThreshold: (value: number | null) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);

  return (
    <View style={styles.rule}>
      <View style={styles.ruleRow}>
        <View style={styles.ruleText}>
          <View style={styles.titleRow}>
            <StatusDot tone={SEVERITY_TONE[rule.severity]} />
            <Text variant="body" color={rule.enabled ? 'foreground' : 'mutedForeground'}>
              {rule.label}
            </Text>
          </View>
          <Text variant="caption" color="mutedForeground">
            {rule.description}
          </Text>
          {rule.threshold && !editing && (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Change ${rule.label} threshold`}
              style={styles.thresholdLine}
            >
              <Text variant="caption" color="primary" numeric style={rule.enabled ? undefined : styles.dimmed}>
                {formatThreshold(rule.threshold)}
              </Text>
            </Pressable>
          )}
        </View>
        <Switch
          value={rule.enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.primary, false: colors.muted }}
          accessibilityLabel={rule.label}
        />
      </View>

      {rule.threshold && editing && (
        <ThresholdEditor
          label={rule.label}
          threshold={rule.threshold}
          onCommit={(value) => {
            setEditing(false);
            onThreshold(value);
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {!!error && (
        <Text variant="caption" color="crit">
          {error}
        </Text>
      )}
    </View>
  );
}

/**
 * Inline number entry for one rule. Mounted only while open, so the draft
 * always starts from the rule's current value. Range comes from the rule
 * itself; the app has no opinion on what a sensible battery voltage is.
 */
function ThresholdEditor({
  label,
  threshold,
  onCommit,
  onCancel,
}: {
  label: string;
  threshold: AlertThreshold;
  onCommit: (value: number | null) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(threshold.value === null ? '' : String(threshold.value));

  const parsed = draft.trim() === '' ? null : Number(draft);
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < threshold.min || parsed > threshold.max);
  const rangeHint = `${formatThresholdValue(threshold.min, threshold.unit)} – ${formatThresholdValue(threshold.max, threshold.unit)}`;

  function commit() {
    if (invalid) return;
    onCommit(parsed);
  }

  return (
    <View style={[styles.editor, { borderColor: colors.border }]}>
      <View style={styles.editorRow}>
        <Text variant="caption" color="mutedForeground" style={styles.editorLabel}>
          {threshold.comparison === 'below' ? 'Alert below' : 'Alert above'}
        </Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: invalid ? colors.crit : colors.border }]}>
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder={threshold.default === null ? '—' : String(threshold.default)}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            style={[styles.input, typeScale.body, { color: colors.foreground }]}
            accessibilityLabel={`${label} threshold`}
          />
          <Text variant="body" color="mutedForeground">
            {threshold.unit}
          </Text>
        </View>
      </View>

      <Text variant="caption" color={invalid ? 'crit' : 'mutedForeground'} numeric>
        {invalid ? `Must be between ${rangeHint}` : `Between ${rangeHint}`}
      </Text>

      <View style={styles.editorActions}>
        {threshold.value !== null && (
          <Pressable onPress={() => onCommit(null)} hitSlop={8} accessibilityRole="button">
            <Text variant="caption" color="primary">
              {threshold.default === null
                ? 'Clear'
                : `Use default (${formatThresholdValue(threshold.default, threshold.unit)})`}
            </Text>
          </Pressable>
        )}
        <View style={styles.spacer} />
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
          <Text variant="caption" color="mutedForeground">
            Cancel
          </Text>
        </Pressable>
        <Pressable onPress={commit} hitSlop={8} accessibilityRole="button" disabled={invalid}>
          <Text variant="heading" color="primary" style={invalid ? styles.dimmed : undefined}>
            Save
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ruleBlock: { gap: space.md },
  rule: { gap: space.sm },
  ruleRow: { alignItems: 'center', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  ruleText: { flex: 1, gap: 2 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  thresholdLine: { alignSelf: 'flex-start', paddingTop: 2 },
  dimmed: { opacity: 0.5 },
  editor: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
    padding: space.md,
  },
  editorRow: { alignItems: 'center', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  editorLabel: { flex: 1 },
  editorActions: { alignItems: 'center', flexDirection: 'row', gap: space.lg },
  spacer: { flex: 1 },
  inputWrap: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  input: { minWidth: 56, paddingVertical: space.sm, textAlign: 'right' },
});
