import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import {
  waterChartModel,
  preferredWaterMetric,
  type WaterChartSlot,
  type WaterChartMetric,
} from '@aquamind/contracts';
import { haptics } from '@/feedback/haptics';
import { formatLitres } from '@/lib/format';
import { Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';
import { Chips } from '@/usage/Chips';

export type UsageSlot = WaterChartSlot;

/** The same positive, labelled litre scale as the web app. */
export function UsageBarChart({
  slots,
  height = 160,
  showFills = true,
  tickEvery,
  accessibilityLabel,
}: {
  slots: UsageSlot[];
  height?: number;
  showFills?: boolean;
  tickEvery?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<WaterChartMetric | null>(null);
  const metric = showFills ? (choice ?? preferredWaterMetric(slots)) : 'used';
  const model = waterChartModel(slots, metric);
  const [width, setWidth] = useState(0);
  const slotsKey = slots.map((s) => s.key).join('|');
  const [selection, setSelection] = useState<{
    key: string;
    index: number;
  } | null>(null);
  const picked = selection?.key === slotsKey;
  const active =
    picked
      ? Math.min(selection.index, slots.length - 1)
      : model.peak >= 0
        ? model.peak
        : model.latest;
  const current = slots[active];
  const amount = model.values[active];
  const select = (index: number) => setSelection({ key: slotsKey, index });
  const unit = metric === 'used' ? 'used' : 'added';
  const barColor = metric === 'used' ? colors.seriesVolume : colors.seriesLevel;
  const pick = (e: GestureResponderEvent) => {
    if (!width || !slots.length) return;
    const i = Math.max(
      0,
      Math.min(slots.length - 1, Math.floor((e.nativeEvent.locationX / width) * slots.length)),
    );
    if (i !== active) {
      haptics.selection();
      select(i);
    }
  };
  const every = tickEvery ?? Math.max(1, Math.ceil(slots.length / 5));
  const detail = current
    ? `${current.title} · ${amount == null ? 'No readings' : `${formatLitres(amount)} ${unit}`}`
    : 'No readings in this period';
  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text variant="caption" color="mutedForeground">
          Litres {unit}
        </Text>
        {showFills && (
          <Chips
            accessibilityLabel={`${accessibilityLabel}: measure`}
            value={metric}
            onChange={(metric) => {
              setChoice(metric);
              setSelection(null);
            }}
            options={[
              { value: 'used', label: 'Water used' },
              { value: 'filled', label: 'Refills' },
            ]}
          />
        )}
      </View>
      {model.recorded === 0 ? (
        <View style={[styles.empty, { minHeight: height }]}>
          <Text variant="heading">No readings in this period</Text>
          <Text variant="caption" color="mutedForeground" style={styles.center}>
            Usage appears after your sensor reports. Missing readings do not mean zero use.
          </Text>
        </View>
      ) : model.total === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.muted, borderRadius: 12 }]}>
          <Text variant="heading">
            {metric === 'used' ? 'No measurable use recorded' : 'No refill recorded'}
          </Text>
          <Text variant="caption" color="mutedForeground" style={styles.center}>
            During the periods with valid readings.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.frame, { height }]}>
            <View style={styles.axis} pointerEvents="none">
              {[model.maximum, model.maximum / 2, 0].map((n) => (
                <Text
                  key={n}
                  variant="label"
                  color="mutedForeground"
                  numeric
                  style={styles.axisText}
                >
                  {n.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </Text>
              ))}
            </View>
            <View
              style={styles.plot}
              onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onResponderGrant={pick}
              onResponderMove={pick}
              onResponderTerminationRequest={() => true}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`${accessibilityLabel}: ${unit}`}
              accessibilityValue={{
                min: 0,
                max: slots.length - 1,
                now: Math.max(0, active),
                text: detail,
              }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'increment')
                  select(Math.min(slots.length - 1, active + 1));
                if (e.nativeEvent.actionName === 'decrement') select(Math.max(0, active - 1));
              }}
            >
              <View style={styles.grid} pointerEvents="none">
                {[0, 1, 2].map((n) => (
                  <View
                    key={n}
                    style={{
                      borderTopColor: colors.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    }}
                  />
                ))}
              </View>
              {slots.map((slot, i) => (
                <View key={slot.key} style={styles.column} pointerEvents="none">
                  {i === active && (
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: colors.muted, borderRadius: 5 },
                      ]}
                    />
                  )}
                  {model.values[i] == null ? (
                    <View style={[styles.gap, { borderColor: colors.mutedForeground }]} />
                  ) : (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(
                            model.values[i]! > 0 ? 2 : 1,
                            (model.values[i]! / model.maximum) * height,
                          ),
                          backgroundColor: slot.alert && metric === 'used' ? colors.crit : barColor,
                          opacity: i === active ? 1 : 0.65,
                        },
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
          <View style={styles.ticks} pointerEvents="none">
            {slots.map((s, i) => (
              <View key={s.key} style={styles.tick}>
                <Text
                  variant="label"
                  color="mutedForeground"
                  numberOfLines={1}
                  style={[
                    styles.tickText,
                    i === slots.length - 1 ? { right: 0, textAlign: 'right' } : { left: 0 },
                  ]}
                >
                  {i % every === 0 ? s.tick : ''}
                </Text>
              </View>
            ))}
          </View>
          <View
            style={[styles.readout, { backgroundColor: colors.muted }]}
            accessibilityLiveRegion="polite"
          >
            <Text variant="caption" color="mutedForeground">
              {current?.title}
            </Text>
            <Text variant="title" numeric>
              {amount == null ? 'No readings' : `${formatLitres(amount)} ${unit}`}
            </Text>
            <Text variant="caption" color="mutedForeground">
              {current?.note || (picked ? '' : 'Highest shown. Touch a bar to compare.')}
            </Text>
          </View>
        </>
      )}
      {model.total !== 0 && model.recorded > 0 && model.recorded < slots.length && (
        <Text variant="caption" color="mutedForeground">
          Gaps show hours or days without readings.
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: space.md },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  frame: { flexDirection: 'row', gap: 10, marginTop: space.sm },
  axis: { width: 34, justifyContent: 'space-between', alignItems: 'flex-end' },
  axisText: { letterSpacing: 0, fontSize: 10 },
  plot: { flex: 1, flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  column: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    maxWidth: 44,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  gap: {
    width: '100%',
    height: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 2,
  },
  ticks: { flexDirection: 'row', gap: 4, marginLeft: 44, height: 16 },
  tick: { flex: 1, overflow: 'visible' },
  tickText: {
    position: 'absolute',
    letterSpacing: 0,
    fontSize: 10,
    width: 56,
    minWidth: 56,
    flexShrink: 0,
  },
  readout: { borderRadius: 12, padding: space.md, gap: 3 },
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
    gap: space.sm,
  },
  center: { textAlign: 'center' },
});
