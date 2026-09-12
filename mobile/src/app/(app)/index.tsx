import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAlertFeed, useCurrentReading, useDevices, useTankProfile } from '@/api/queries';
import type { DeviceSummary } from '@/api/schemas';
import {
  formatAge,
  formatCapacity,
  formatPercent,
  formatTemperature,
  formatVolts,
} from '@/lib/format';
import { Button, Card, Label, Pill, StatusDot, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, useTheme } from '@/ui/theme';
import { GlassTank } from '@/viz/GlassTank';
import { syncWidgets } from '@/widget/sync';

/**
 * Tanks — the home screen, built single-tank-first.
 *
 * One tank gets the whole screen: a large tank, the percentage as the hero
 * figure, litres as its subtitle. A second tank adds a selector row above it
 * rather than demoting everything into a list.
 */
export default function TanksScreen() {
  const router = useRouter();
  const devices = useDevices();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = devices.data ?? [];
  const selected = useMemo(
    () => list.find((device) => device.id === selectedId) ?? list[0] ?? null,
    [list, selectedId]
  );

  const profile = useTankProfile(selected?.id);
  const reading = useCurrentReading(selected?.id);
  const feed = useAlertFeed();
  const unacknowledged = feed.data?.pages[0]?.unacknowledged ?? 0;

  // Keep the home-screen widget in step with whatever the app just learned.
  useEffect(() => {
    if (!devices.data) return;
    const capacities = selected && profile.data ? { [selected.id]: profile.data.total_capacity_l } : {};
    void syncWidgets(devices.data, capacities);
  }, [devices.data, profile.data, selected]);

  const refresh = () => {
    void devices.refetch();
    void reading.refetch();
  };

  if (devices.isPending && !devices.data) {
    return <Screen title="Tanks"><Text variant="body" color="mutedForeground">Loading…</Text></Screen>;
  }

  if (devices.isError && !devices.data) {
    return (
      <Screen title="Tanks" onRefresh={refresh} refreshing={devices.isFetching}>
        <Card accent="crit">
          <Text variant="heading">Could not reach AquaMind</Text>
          <Text variant="body" color="mutedForeground">
            {devices.error.message}
          </Text>
          <Button title="Try again" variant="secondary" onPress={refresh} />
        </Card>
      </Screen>
    );
  }

  if (!selected) {
    return (
      <Screen title="Tanks" onRefresh={refresh} refreshing={devices.isFetching}>
        <Card>
          <Text variant="heading">No tank yet</Text>
          <Text variant="body" color="mutedForeground">
            Power up your AquaMind node, then pair it with this account. It takes about a minute.
          </Text>
          <Button title="Pair a tank" onPress={() => router.push('/pair')} feedback="selection" />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Tanks"
      action={
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Text variant="heading" color="mutedForeground">
            ⚙
          </Text>
        </Pressable>
      }
      onRefresh={refresh}
      refreshing={devices.isFetching || reading.isFetching}
    >
      {list.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector}>
          {list.map((device) => (
            <TankChip
              key={device.id}
              device={device}
              active={device.id === selected.id}
              onPress={() => setSelectedId(device.id)}
            />
          ))}
        </ScrollView>
      )}

      <TankHero
        device={selected}
        capacityL={profile.data?.total_capacity_l ?? null}
        onOpen={() => router.push(`/device/${selected.id}`)}
      />

      {!selected.has_tank_profile && (
        <Card accent="warn">
          <Text variant="heading">Tank setup needed</Text>
          <Text variant="body" color="mutedForeground">
            Without your tank&rsquo;s dimensions we can only report the raw sensor distance — not a
            percentage or a volume. It takes two measurements.
          </Text>
          <Button
            title="Set up tank"
            onPress={() => router.push(`/device/${selected.id}`)}
            feedback="selection"
          />
        </Card>
      )}

      <Pressable onPress={() => router.push('/alerts')} accessibilityRole="button">
        <Card accent={unacknowledged > 0 ? 'warn' : undefined}>
          <View style={styles.activityRow}>
            <View>
              <Text variant="heading">Activity</Text>
              <Text variant="caption" color="mutedForeground">
                {unacknowledged > 0
                  ? `${unacknowledged} alert${unacknowledged === 1 ? '' : 's'} need attention`
                  : 'Nothing needs attention'}
              </Text>
            </View>
            <Text variant="heading" color="mutedForeground">
              ›
            </Text>
          </View>
        </Card>
      </Pressable>

      {reading.data && (
        <Card>
          <Label>Sensor</Label>
          <View style={styles.metrics}>
            <Metric label="Temperature" value={formatTemperature(reading.data.temperature_c)} />
            <Metric label="Battery" value={formatVolts(reading.data.battery_v)} />
            <Metric
              label="Signal"
              value={reading.data.rssi === null ? '—' : `${reading.data.rssi} dBm`}
            />
          </View>
        </Card>
      )}
    </Screen>
  );
}

function TankHero({
  device,
  capacityL,
  onOpen,
}: {
  device: DeviceSummary;
  capacityL: number | null;
  onOpen: () => void;
}) {
  const offline = device.status !== 'online';
  const asOf = device.level_percent_as_of ?? device.last_measurement;

  return (
    <Card accent={device.active_alert === 'leak' ? 'crit' : device.active_alert === 'low' ? 'warn' : undefined}>
      <View style={styles.heroRow}>
        <GlassTank level={device.level_percent} alert={device.active_alert} width={104} height={168} />
        <View style={styles.heroText}>
          <View style={styles.statusRow}>
            <StatusDot tone={offline ? 'offline' : device.active_alert ? 'warn' : 'ok'} />
            <Text variant="caption" color="mutedForeground">
              {device.name}
            </Text>
          </View>

          <Text variant="hero" numeric>
            {formatPercent(device.level_percent)}
          </Text>

          <Text variant="body" color="mutedForeground" numeric>
            {formatCapacity(device.current_volume, capacityL)}
          </Text>

          <Text variant="caption" color="mutedForeground">
            {device.level_percent_stale ? `last good reading ${formatAge(asOf)}` : formatAge(asOf)}
          </Text>

          {offline && <Pill tone="offline">Offline</Pill>}
          {device.active_alert === 'low' && <Pill tone="warn">Running low</Pill>}
          {device.active_alert === 'leak' && <Pill tone="crit">Possible leak</Pill>}
          {device.level_percent === null && device.has_tank_profile && (
            <Pill tone="offline">Sensor unreadable</Pill>
          )}
        </View>
      </View>

      <Button title="History & details" variant="secondary" onPress={onOpen} />
    </Card>
  );
}

function TankChip({
  device,
  active,
  onPress,
}: {
  device: DeviceSummary;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.secondary : 'transparent',
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <StatusDot tone={device.status === 'online' ? 'ok' : 'offline'} />
      <Text variant="caption" color={active ? 'foreground' : 'mutedForeground'}>
        {device.name}
      </Text>
      <Text variant="caption" color="mutedForeground" numeric>
        {formatPercent(device.level_percent)}
      </Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text variant="heading" numeric>
        {value}
      </Text>
      <Label>{label}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { gap: space.sm, paddingVertical: 2 },
  chip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  heroRow: { alignItems: 'center', flexDirection: 'row', gap: space.lg },
  heroText: { flex: 1, gap: space.xs },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  activityRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  metric: { gap: 2 },
});
