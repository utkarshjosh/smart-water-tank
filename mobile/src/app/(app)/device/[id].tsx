import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useCurrentReading, useDevices, useHistorySeries, useTankProfile } from '@/api/queries';
import { haptics } from '@/feedback/haptics';
import {
  formatAge,
  formatCapacity,
  formatCm,
  formatPercent,
  formatTemperature,
  formatVolts,
} from '@/lib/format';
import { Card, Divider, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, useTheme } from '@/ui/theme';
import { GlassTank } from '@/viz/GlassTank';
import { SeriesChart, type SeriesPoint } from '@/viz/SeriesChart';

const RANGES = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
] as const;

export default function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [rangeIndex, setRangeIndex] = useState(0);

  const devices = useDevices();
  const device = devices.data?.find((candidate) => candidate.id === id);
  const reading = useCurrentReading(id);
  const profile = useTankProfile(id);
  const history = useHistorySeries(id, RANGES[rangeIndex].days);

  // Percent is the hero here too, so the chart plots it — falling back to
  // litres for a tank with no profile, where percent cannot be computed.
  // The server buckets and marks gaps; an all-null triple stays a gap.
  const hasPercent = history.data?.has_tank_profile ?? !!profile.data;
  const metric = hasPercent ? 'level_percent' : 'volume_l';
  const points: SeriesPoint[] = (history.data?.series[metric]?.points ?? []).map(([t, , avg]) => ({
    t,
    v: avg,
  }));

  const refresh = () => {
    void reading.refetch();
    void history.refetch();
    void devices.refetch();
  };

  const asOf = reading.data?.level_percent_as_of ?? reading.data?.timestamp ?? null;

  return (
    <Screen
      title={device?.name ?? 'Tank'}
      subtitle={device ? `${device.status === 'online' ? 'Online' : 'Offline'} · ${formatAge(device.last_seen)}` : undefined}
      onBack={() => router.back()}
      onRefresh={refresh}
      refreshing={reading.isFetching || history.isFetching}
    >
      <Card>
        <View style={styles.heroRow}>
          <GlassTank
            level={reading.data?.level_percent ?? null}
            alert={device?.active_alert ?? null}
            width={88}
            height={140}
          />
          <View style={styles.heroText}>
            <Text variant="display" numeric>
              {formatPercent(reading.data?.level_percent ?? null)}
            </Text>
            <Text variant="body" color="mutedForeground" numeric>
              {formatCapacity(reading.data?.volume_l ?? null, profile.data?.total_capacity_l ?? null)}
            </Text>
            <Text variant="caption" color="mutedForeground">
              {reading.data?.level_percent_stale ? `last good reading ${formatAge(asOf)}` : formatAge(asOf)}
            </Text>
          </View>
        </View>

        {!reading.data && !reading.isPending && (
          <Text variant="body" color="mutedForeground">
            This tank has not reported a measurement yet.
          </Text>
        )}
      </Card>

      <Card>
        <View style={styles.chartHeader}>
          <Label>{hasPercent ? 'Level' : 'Volume'}</Label>
          <View style={styles.segments}>
            {RANGES.map((range, index) => (
              <Segment
                key={range.label}
                label={range.label}
                active={index === rangeIndex}
                onPress={() => {
                  haptics.selection();
                  setRangeIndex(index);
                }}
              />
            ))}
          </View>
        </View>

        <SeriesChart
          points={points}
          // Card padding is space.lg on each side.
          width={width - space.lg * 2 - space.lg * 2}
          unit={hasPercent ? '%' : ' L'}
        />
      </Card>

      <Card>
        <Label>Latest reading</Label>
        <Row label="Sensor distance" value={formatCm(reading.data?.level_cm ?? null)} />
        <Divider />
        <Row label="Temperature" value={formatTemperature(reading.data?.temperature_c ?? null)} />
        <Divider />
        <Row label="Battery" value={formatVolts(reading.data?.battery_v ?? null)} />
        <Divider />
        <Row
          label="Signal"
          value={reading.data?.rssi === null || reading.data?.rssi === undefined ? '—' : `${reading.data.rssi} dBm`}
        />
      </Card>

      {profile.data ? (
        <Card>
          <Label>Tank</Label>
          <Row
            label="Shape"
            value={profile.data.shape === 'cylindrical' ? 'Cylindrical' : 'Cuboidal'}
          />
          <Divider />
          <Row label="Height" value={formatCm(profile.data.height_cm)} />
          <Divider />
          <Row label="Capacity" value={`${Math.round(profile.data.total_capacity_l).toLocaleString()} L`} />
          {profile.data.parallel_unit_count > 1 && (
            <>
              <Divider />
              <Row label="Tanks plumbed together" value={String(profile.data.parallel_unit_count)} />
            </>
          )}
          <Divider />
          <Row label="Sensor offset" value={formatCm(profile.data.sensor_offset_cm)} />
          <Divider />
          <Row label="Dead zone" value={formatCm(profile.data.dead_zone_cm)} />
        </Card>
      ) : (
        <Card accent="warn">
          <Text variant="heading">No tank dimensions yet</Text>
          <Text variant="body" color="mutedForeground">
            Level percentage and volume are both derived from the tank&rsquo;s geometry. Until it is set,
            only the raw sensor distance is meaningful.
          </Text>
          <Text variant="caption" color="mutedForeground">
            The setup wizard lands in the next phase; the web app can set it in the meantime.
          </Text>
        </Card>
      )}

      {!!device?.firmware_version && (
        <Text variant="caption" color="mutedForeground">
          Firmware {device.firmware_version} · {device.id}
        </Text>
      )}
    </Screen>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        styles.segment,
        { backgroundColor: active ? colors.primary : 'transparent', borderColor: active ? colors.primary : colors.border },
      ]}
    >
      <Text variant="caption" color={active ? 'primaryForeground' : 'mutedForeground'}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="body" color="mutedForeground">
        {label}
      </Text>
      <Text variant="body" numeric>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: { alignItems: 'center', flexDirection: 'row', gap: space.lg },
  heroText: { flex: 1, gap: space.xs },
  chartHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  segments: { flexDirection: 'row', gap: space.xs },
  segment: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
