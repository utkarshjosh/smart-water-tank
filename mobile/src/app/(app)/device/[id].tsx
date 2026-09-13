import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowsOutSimple, CaretRight } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { formatThreshold, levelThresholdLines, useAlertRules } from '@/api/alert-rules';
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
import { BUCKET_LABEL, METRICS, METRIC_BY_VALUE, RANGES, rangeToWindow, type Metric, type RangeKey } from '@/lib/metrics';
import { Card, Divider, Label, Text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { radius, space, useTheme, type Colors } from '@/ui/theme';
import { GlassTank } from '@/viz/GlassTank';
import { CloseButton, LandscapeModal } from '@/viz/LandscapeModal';
import { SeriesChart } from '@/viz/SeriesChart';

/** Chart height in the portrait page; the modal sizes itself to the screen. */
const CHART_HEIGHT = 300;
/** A committed zoom narrower than this fraction of the loaded window refetches at finer resolution. */
const REFINE_BELOW = 0.25;
const REFINE_DEBOUNCE_MS = 300;

type Window = { from: string; to: string };

export default function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [range, setRangeState] = useState<RangeKey>('7d');
  const [metricChoice, setMetricChoice] = useState<Metric | null>(null);
  // The window's "now". Fixed per range change / refresh so the query key is
  // stable across renders instead of a fresh pair of timestamps every frame.
  const [anchor, setAnchor] = useState(() => Date.now());
  const [widened, setWidened] = useState(false);
  // A zoomed-in window fetched at finer resolution, layered over the preset.
  const [refined, setRefined] = useState<Window | null>(null);
  const [expanded, setExpanded] = useState(false);
  const refineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a pinch-out has just widened the window: the same pinch's end
  // still commits a narrow view, and that must not zoom straight back in.
  const skipNextCommit = useRef(false);

  const devices = useDevices();
  const device = devices.data?.find((candidate) => candidate.id === id);
  const reading = useCurrentReading(id);
  const profile = useTankProfile(id);

  // Percent is the hero here too, so the chart opens on it — falling back to
  // litres for a tank with no profile, where percent cannot be computed.
  // The server buckets and marks gaps; an all-null triple stays a gap.
  const metric: Metric = metricChoice ?? (profile.data === null ? 'volume_l' : 'level_percent');
  const rules = useAlertRules(id);
  // Only the percent chart can carry the alert bounds — litres/volts have
  // their own units and the low/full rules are percent-based once a profile exists.
  const thresholdLines = useMemo(() => {
    if (metric !== 'level_percent' || !rules.data) return undefined;
    return levelThresholdLines(rules.data);
  }, [metric, rules.data]);
  const preset = useMemo(() => rangeToWindow(range, anchor), [range, anchor]);
  const window = refined ?? preset;
  const history = useHistorySeries(id, window, metric);

  const fetched = history.data?.series[metric];
  const fetchedHasData = (fetched?.points ?? []).some((p) => p[2] != null);
  // A zoomed-in (refined) window can legitimately come back with 0-1 readings
  // - a raw window narrower than the device's reporting interval, or one that
  // lands on an outage. Swapping the plot out for "no data" there is what made
  // the chart vanish at deep zoom; instead the last response that had data
  // stays on screen. Its points are the same reference the chart was already
  // drawing, so the view does not move either.
  const lastGood = useRef<{ response: NonNullable<typeof history.data>; metric: Metric } | null>(null);
  if (history.data && fetchedHasData) lastGood.current = { response: history.data, metric };
  const shown =
    history.data && (fetchedHasData || !refined || lastGood.current?.metric !== metric)
      ? history.data
      : (lastGood.current?.response ?? history.data);
  const series = shown?.series[metric];
  const points = series?.points ?? [];
  const hasData = points.some((p) => p[2] != null);
  // First load, or a metric switch whose placeholder is the other metric's data.
  const loading = history.isPending || (!series && history.isFetching);

  // What is currently loaded, for the refine decision. A ref so the chart's
  // callback stays stable while data changes underneath it.
  const loaded = useRef<{ from: number; to: number; raw: boolean } | null>(null);
  loaded.current = shown ? { from: shown.from.getTime(), to: shown.to.getTime(), raw: shown.bucket === 'raw' } : null;

  const clearRefine = () => {
    if (refineTimer.current) clearTimeout(refineTimer.current);
    refineTimer.current = null;
  };
  useEffect(() => clearRefine, []);

  const setRange = (next: RangeKey) => {
    clearRefine();
    setRangeState(next);
    setAnchor(Date.now());
    setWidened(false);
    setRefined(null);
  };

  // Pinching out at the full extent asks for more history than is loaded.
  // A refined window first falls back to its preset; the preset then steps
  // up to the next one, as the webapp does.
  const widen = useCallback(() => {
    clearRefine();
    skipNextCommit.current = true;
    if (refined) {
      setRefined(null);
      return;
    }
    const order = RANGES.map((r) => r.value);
    const next = order[Math.min(order.indexOf(range) + 1, order.length - 1)];
    if (next !== range) {
      setRange(next);
      setWidened(true);
    }
    // setRange is a plain closure over state; listing it would re-create this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refined, range]);

  // Zoom changes resolution: once a pan or pinch settles on a window under a
  // quarter of what is loaded, fetch exactly that window with bucket=auto so
  // the server answers with finer buckets (5-minute, then raw). The coarse
  // series stays on screen until the fine one lands.
  const onViewChange = useCallback((lo: number, hi: number) => {
    clearRefine();
    if (skipNextCommit.current) {
      skipNextCommit.current = false;
      return;
    }
    const span = loaded.current;
    // Raw is as fine as the server goes; refining it only risks an empty window.
    if (!span || span.raw || hi - lo >= (span.to - span.from) * REFINE_BELOW) return;
    refineTimer.current = setTimeout(() => {
      setRefined({ from: new Date(lo).toISOString(), to: new Date(hi).toISOString() });
    }, REFINE_DEBOUNCE_MS);
  }, []);

  const refresh = () => {
    void reading.refetch();
    void devices.refetch();
    // A new anchor moves the window up to now; the old key is left to expire.
    clearRefine();
    setRefined(null);
    setAnchor(Date.now());
  };

  const asOf = reading.data?.level_percent_as_of ?? reading.data?.timestamp ?? null;

  const rangeChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      style={styles.chipsRow}
    >
      {RANGES.map((option) => (
        <Segment
          key={option.value}
          label={option.label}
          active={option.value === range && !refined}
          onPress={() => {
            haptics.selection();
            setRange(option.value);
          }}
        />
      ))}
    </ScrollView>
  );

  const metricChips = (
    <View style={styles.segments}>
      {METRICS.map((option) => (
        <Segment
          key={option.value}
          label={option.label}
          swatch={option.color}
          active={option.value === metric}
          onPress={() => {
            haptics.selection();
            setMetricChoice(option.value);
          }}
        />
      ))}
    </View>
  );

  const caption =
    shown && hasData
      ? [
          `${shown.point_count.toLocaleString()} points`,
          BUCKET_LABEL[shown.bucket],
          shown.truncated ? 'window narrowed to the most recent readings' : null,
          refined ? 'zoomed' : widened ? 'widened range' : null,
          'drag to pan, pinch to zoom, double-tap to reset',
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const chart = (size: { width: number; height: number }, accessory: ReactNode, inset: number) =>
    loading ? (
      // Nothing seen yet, not even a cached window: hold the space, no spinner.
      <View style={{ height: size.height }} />
    ) : (
      <SeriesChart
        points={points}
        metric={metric}
        unit={series?.unit ?? METRIC_BY_VALUE[metric].unit}
        width={size.width}
        height={size.height}
        bucketMs={shown?.bucket_seconds != null ? shown.bucket_seconds * 1000 : null}
        window={shown ? [shown.from.getTime(), shown.to.getTime()] : null}
        emptyMessage={
          hasData
            ? undefined
            : `No ${METRIC_BY_VALUE[metric].label.toLowerCase()} readings in this window. Pinch out or pick a longer range.`
        }
        inset={inset}
        accessory={accessory}
        toolbar={rangeChips}
        onZoomBeyond={widen}
        onViewChange={onViewChange}
        thresholds={thresholdLines}
        dimmed={history.isFetching && !history.isPending}
      />
    );

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

      {/* Full-bleed: the plot runs edge to edge, cancelling the Screen's padding. */}
      <View style={styles.chartSection}>
        <View style={styles.chartTitle}>
          <Label>{METRIC_BY_VALUE[metric].label}</Label>
        </View>
        {chart({ width, height: CHART_HEIGHT }, <ExpandButton onPress={() => setExpanded(true)} />, space.lg)}
        <View style={styles.chartFooter}>
          {metricChips}
          {caption && (
            <Text variant="caption" color="mutedForeground">
              {caption}
            </Text>
          )}
        </View>
      </View>

      <LandscapeModal visible={expanded} onClose={() => setExpanded(false)}>
        {(size) => (
          <View style={styles.modalContent}>
            {/* Readout + chips take ~112pt; the plot gets the rest. */}
            {chart({ width: size.width, height: size.height - 112 }, <CloseButton onPress={() => setExpanded(false)} />, space.md)}
          </View>
        )}
      </LandscapeModal>

      <Card>
        <Label>Latest reading</Label>
        <Row label="Temperature" value={formatTemperature(reading.data?.temperature_c ?? null)} />
        <Divider />
        <Row label="Battery" value={formatVolts(reading.data?.battery_v ?? null)} />
        <Divider />
        {/* Raw ultrasonic distance and radio strength: for checking the install, not the tank. */}
        <Label>Diagnostics</Label>
        <Row label="Sensor distance" value={formatCm(reading.data?.level_cm ?? null)} />
        <Divider />
        <Row
          label="Signal"
          value={reading.data?.rssi === null || reading.data?.rssi === undefined ? '—' : `${reading.data.rssi} dBm`}
        />
      </Card>

      <Card>
        <Label>Alerts</Label>
        {rules.data ? (
          rules.data
            .filter((rule) => rule.threshold)
            .map((rule, index) => (
              <View key={rule.type} style={styles.ruleRow}>
                {index > 0 && <Divider />}
                <Row label={rule.label} value={rule.enabled ? formatThreshold(rule.threshold!) : 'Off'} />
              </View>
            ))
        ) : (
          <Text variant="caption" color="mutedForeground">
            {rules.isError ? 'Rules unavailable' : '…'}
          </Text>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/alert-rules', params: { device: id } })}
          hitSlop={8}
          accessibilityRole="link"
          style={styles.link}
        >
          <Text variant="heading" color="primary">
            Alert rules
          </Text>
          <CaretRight size={16} color={colors.primary} />
        </Pressable>
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

function ExpandButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Expand chart"
      style={[styles.iconButton, { borderColor: colors.border }]}
    >
      <ArrowsOutSimple size={18} color={colors.foreground} />
    </Pressable>
  );
}

function Segment({
  label,
  active,
  onPress,
  swatch,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Series colour dot, so the metric picker reads as a legend too. */
  swatch?: keyof Colors;
}) {
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
      {swatch && <View style={[styles.swatch, { backgroundColor: colors[swatch] }]} />}
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
  chartSection: { gap: space.sm, marginHorizontal: -space.lg },
  chartTitle: { paddingHorizontal: space.lg },
  chartFooter: { gap: space.sm, paddingHorizontal: space.lg },
  chipsRow: { flexGrow: 0 },
  chips: { gap: space.xs, paddingHorizontal: space.lg },
  modalContent: { flex: 1, gap: space.sm },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  segment: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  swatch: { borderRadius: 4, height: 8, width: 8 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  ruleRow: { gap: space.md },
  link: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: space.xs },
});
