import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDevices, useUsageHistory } from '@/api/queries';
import type { UsageGroup, UsageHistory } from '@/api/schemas';
import { formatLitres } from '@/lib/format';
import {
  MIN_FULL_DAYS_FOR_PATTERNS,
  PRESETS,
  bucketSlots,
  coverageNote,
  hourOfDaySlots,
  weekdaySlots,
  type Preset,
} from '@/lib/usage-history';
import { formatDay, isoDay } from '@/lib/usage-format';
import { Card, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';
import { Chips } from '@/usage/Chips';
import { UsageBarChart } from '@/viz/UsageBarChart';

/**
 * Water used over 7 days to 12 months, by day, week or month - the phone's
 * version of the webapp History tab's "Water used" view.
 */
export default function UsageHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const devices = useDevices();
  const device = devices.data?.find((candidate) => candidate.id === id);
  const [preset, setPreset] = useState<Preset>('30d');
  const [group, setGroup] = useState<UsageGroup | 'auto'>('auto');
  const window = useMemo(() => {
    const days = PRESETS.find((p) => p.value === preset)!.days;
    return { from: isoDay(-(days - 1)), to: isoDay() };
  }, [preset]);
  const history = useUsageHistory(id, window, group);

  return (
    <Screen
      title="Usage history"
      subtitle={device?.name}
      onBack={() => router.back()}
      onRefresh={() => void history.refetch()}
      refreshing={history.isFetching}
    >
      <View style={styles.controls}>
        <Chips
          accessibilityLabel="Range"
          value={preset}
          onChange={setPreset}
          options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <Chips
          accessibilityLabel="Group by"
          value={group}
          onChange={setGroup}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </View>

      {history.isError ? (
        <Card accent="crit">
          <Text variant="body">Couldn’t load usage for these dates. Pull down to try again.</Text>
        </Card>
      ) : !history.data ? (
        <View style={styles.placeholder} />
      ) : (
        <HistoryBody data={history.data} dimmed={history.isFetching} />
      )}
    </Screen>
  );
}

function HistoryBody({ data, dimmed }: { data: UsageHistory; dimmed: boolean }) {
  const t = data.totals;
  const note = coverageNote(data);
  const range = `${formatDay(data.from, { day: 'numeric', month: 'short' })} – ${formatDay(data.to, { day: 'numeric', month: 'short' })}`;

  return (
    <View style={[styles.body, dimmed && styles.dimmed]}>
      <View style={styles.tiles}>
        <Tile label="Water used" value={formatLitres(t.used_l)} hint={range} />
        <Tile
          label="Normal day"
          value={formatLitres(t.daily_average_l)}
          hint={t.full_days ? `Average of ${t.full_days} full day${t.full_days === 1 ? '' : 's'}` : 'No full days of readings yet'}
        />
        <Tile
          label="Busiest day"
          value={t.busiest_day ? formatLitres(t.busiest_day.used_l) : '—'}
          hint={t.busiest_day ? formatDay(t.busiest_day.date, { weekday: 'long', day: 'numeric', month: 'short' }) : '—'}
        />
        <Tile
          label="Tank filled"
          value={`${t.refills} time${t.refills === 1 ? '' : 's'}`}
          hint={t.filled_l ? `${formatLitres(t.filled_l)} added` : 'No fills recorded'}
        />
      </View>

      <Card>
        <Label>{`Water used per ${data.group}`}</Label>
        {t.days_with_data === 0 ? (
          <Text variant="body" color="mutedForeground">
            No readings in these dates.
          </Text>
        ) : (
          <UsageBarChart slots={bucketSlots(data)} height={170} accessibilityLabel={`Water used and added per ${data.group}`} />
        )}
        {note && (
          <Text variant="caption" color="mutedForeground">
            {note}
          </Text>
        )}
      </Card>

      {t.full_days >= MIN_FULL_DAYS_FOR_PATTERNS ? (
        <>
          <Card>
            <Label>An average day</Label>
            <UsageBarChart
              slots={hourOfDaySlots(data)}
              showFills={false}
              height={100}
              tickEvery={6}
              accessibilityLabel="Average water used per hour of the day"
            />
          </Card>
          <Card>
            <Label>By day of the week</Label>
            <UsageBarChart
              slots={weekdaySlots(data)}
              showFills={false}
              height={100}
              tickEvery={1}
              accessibilityLabel="Average water used per day of the week"
            />
          </Card>
        </>
      ) : (
        <Text variant="caption" color="mutedForeground">
          Patterns by hour and weekday appear once there are {MIN_FULL_DAYS_FOR_PATTERNS} full days of readings in the
          range.
        </Text>
      )}
    </View>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card style={styles.tile}>
      <Label>{label}</Label>
      <Text variant="title" numeric numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color="mutedForeground" numberOfLines={2}>
        {hint}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.sm },
  placeholder: { height: 420 },
  body: { gap: space.lg },
  dimmed: { opacity: 0.6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 2 },
});
