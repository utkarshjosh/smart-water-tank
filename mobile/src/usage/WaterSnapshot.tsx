import { usageCoverageLabel } from '@aquamind/contracts';
import { StyleSheet, View } from 'react-native';
import { useHourlyUsage, useUsageHistory } from '@/api/queries';
import { formatLitres } from '@/lib/format';
import { Card, Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export function WaterSnapshot({ deviceId }: { deviceId: string }) {
  const { colors } = useTheme();
  const today = useHourlyUsage(deviceId, 'today');
  const date = today.data?.today.date ?? new Date().toLocaleDateString('en-CA');
  const shift = (days: number) =>
    new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const baseline = useUsageHistory(deviceId, { from: shift(-14), to: shift(-1) }, 'day');
  const full = baseline.data?.totals.full_days ?? 0;
  const estimated = baseline.data?.totals.estimated_days ?? 0;
  const average = full >= 3 ? baseline.data?.totals.daily_average_l : null;
  return (
    <Card>
      <View style={styles.row}>
        {[
          {
            label: 'Used today',
            value: today.isError ? '—' : formatLitres(today.data?.today.used_l ?? null),
          },
          {
            label: 'Added today',
            value: today.isError ? '—' : formatLitres(today.data?.today.filled_l ?? null),
          },
        ].map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text variant="caption" color="mutedForeground">
              {s.label}
            </Text>
            <Text variant="title" numeric>
              {s.value}
            </Text>
          </View>
        ))}
      </View>
      {today.data && !today.isError && (
        <Text variant="caption" color="mutedForeground">
          {usageCoverageLabel(today.data)}. Estimates cover recorded periods only.
        </Text>
      )}
      <View style={[styles.baseline, { borderColor: colors.border }]}>
        <Text variant="heading">
          {baseline.isError
            ? 'Daily average unavailable'
            : average == null
              ? 'Learning your routine'
              : `${formatLitres(average)} on a usual day`}
        </Text>
        <Text variant="caption" color="mutedForeground">
          {baseline.isError
            ? 'Pull down to try again.'
            : average == null
              ? 'Daily patterns need 3 days with 20+ hours of readings.'
              : estimated
                ? `Average of ${full} days in the past 2 weeks. Short gaps are filled from your usual use at those hours.`
                : `Average of ${full} well-covered days in the past 2 weeks.`}
        </Text>
      </View>
    </Card>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: space.xs },
  baseline: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    gap: space.xs,
  },
});
