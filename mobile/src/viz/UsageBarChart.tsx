import { useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { haptics } from '@/feedback/haptics';
import { formatLitres } from '@/lib/format';
import {
  chartGeometry,
  defaultSelection,
  detailText,
  fillRuns,
  showsNumber,
  type UsageSlot,
} from '@/lib/usage-chart';
import { Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export type { UsageSlot } from '@/lib/usage-chart';

const LABEL_PAD = 14; // room above (and, for fills, below) the bars for numbers
const GAP = 2;

/**
 * Litres per slot as bars - used above the line, added below it, on one
 * scale - with the rules in lib/usage-chart.ts (shared with the webapp).
 *
 * Touch or drag across the plot to select a slot; the line under the chart
 * spells it out. There are no tooltips: they hide under a finger, and the
 * detail line is readable while the thumb is still on the bar.
 */
export function UsageBarChart({
  slots,
  height = 140,
  showFills = true,
  tickEvery,
  accessibilityLabel,
}: {
  slots: UsageSlot[];
  height?: number;
  showFills?: boolean;
  /** Label every nth slot on the axis; default fits about six labels. */
  tickEvery?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  // A selection belongs to the window it was made in: after Today vs 24h or
  // another range, the old index would point at a different slot.
  const slotsKey = slots.map((s) => s.key).join();
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const selected = selection?.key === slotsKey ? selection.index : null;
  const setSelected = (index: number) => setSelection({ key: slotsKey, index });

  const geo = useMemo(() => chartGeometry(slots, height, showFills), [slots, height, showFills]);
  const runs = useMemo(() => (geo.layout === 'markers' ? fillRuns(slots) : []), [geo.layout, slots]);
  if (slots.length === 0) return null;

  const active = selected ?? defaultSelection(slots);
  const current = slots[active];
  const withFills = geo.layout !== 'used-only';
  const every = tickEvery ?? Math.max(1, Math.ceil(slots.length / 6));

  const pick = (event: GestureResponderEvent) => {
    if (width <= 0) return;
    const i = Math.min(slots.length - 1, Math.max(0, Math.floor((event.nativeEvent.locationX / width) * slots.length)));
    if (i !== selected) {
      haptics.selection();
      setSelected(i);
    }
  };

  return (
    <View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        // A vertical scroll that starts on the chart still scrolls the page.
        onResponderTerminationRequest={() => true}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: current ? detailText(current, withFills, formatLitres) : undefined }}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') setSelected(Math.min(slots.length - 1, active + 1));
          if (e.nativeEvent.actionName === 'decrement') setSelected(Math.max(0, active - 1));
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        style={[styles.plot, { height: height + LABEL_PAD * (geo.layout === 'shared' ? 2 : 1) }]}
      >
        {slots.map((slot, i) => {
          const up = slot.usedL == null ? null : slot.usedL / geo.maxUp;
          const down = (slot.filledL ?? 0) / geo.maxDown;
          const isActive = i === active;
          return (
            <View key={slot.key} style={styles.column} pointerEvents="none">
              {isActive && <View style={[styles.highlight, { backgroundColor: colors.muted }]} />}
              <View style={[styles.upArea, { height: geo.upHeight + LABEL_PAD }]}>
                {up == null ? (
                  <View style={[styles.empty, { height: geo.upHeight, borderColor: colors.border }]} />
                ) : (
                  <View
                    style={[
                      styles.upBar,
                      {
                        height: Math.max(slot.usedL ? 2 : 1, up * geo.upHeight),
                        backgroundColor: slot.alert ? colors.crit : colors.seriesVolume,
                      },
                    ]}
                  >
                    {(showsNumber(up, slots.length) || isActive) && slot.usedL ? (
                      <Text variant="label" color="mutedForeground" numberOfLines={1} style={styles.numberAbove}>
                        {Math.round(slot.usedL)}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
              {geo.layout === 'shared' && (
                <View style={[styles.downArea, { height: geo.downHeight, borderTopColor: colors.border }]}>
                  {down > 0 && (
                    <View style={[styles.downBar, { height: Math.max(2, down * geo.downHeight), backgroundColor: colors.seriesLevel }]}>
                      {(showsNumber(down, slots.length) || isActive) && (
                        <Text variant="label" color="mutedForeground" numberOfLines={1} style={styles.numberBelow}>
                          {Math.round(slot.filledL!)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {geo.layout === 'markers' && (
        // Fills as markers: a line under the slots the tank was filling, with
        // the litres added. Not a bar - its length is time, not volume.
        <View style={styles.markers} pointerEvents="none">
          {runs.map((run) => (
            <View
              key={run.from}
              style={[
                styles.marker,
                {
                  left: `${(run.from / slots.length) * 100}%`,
                  width: `${((run.to - run.from + 1) / slots.length) * 100}%`,
                },
              ]}
            >
              <View style={[styles.markerLine, { backgroundColor: colors.seriesLevel }]} />
              <Text variant="label" numberOfLines={1} style={[styles.markerText, { color: colors.seriesLevel }]}>
                +{Math.round(run.litres)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.ticks} pointerEvents="none">
        {slots.map((slot, i) => (
          <View key={slot.key} style={styles.tick}>
            {i % every === 0 && (
              <Text variant="label" color="mutedForeground" numberOfLines={1} style={styles.tickText}>
                {slot.tick}
              </Text>
            )}
          </View>
        ))}
      </View>

      <View style={[styles.detail, { borderTopColor: colors.border }]}>
        <Text variant="caption" accessibilityLiveRegion="polite">
          {current ? detailText(current, withFills, formatLitres) : ''}
        </Text>
        <View style={styles.legend}>
          <Swatch color={colors.seriesVolume} label="Used" />
          {geo.layout === 'shared' && <Swatch color={colors.seriesLevel} label="Added (tank filling)" />}
          {geo.layout === 'markers' && <Swatch color={colors.seriesLevel} label="Tank filling, litres added" line />}
        </View>
      </View>
    </View>
  );
}

function Swatch({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <View style={styles.swatchRow}>
      <View style={[line ? styles.swatchLine : styles.swatchBox, { backgroundColor: color }]} />
      <Text variant="caption" color="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', gap: GAP, overflow: 'visible' },
  column: { flex: 1, overflow: 'visible' },
  highlight: { borderRadius: 3, bottom: 0, left: -1, position: 'absolute', right: -1, top: 0 },
  upArea: { justifyContent: 'flex-end', overflow: 'visible' },
  empty: { borderRadius: 3, borderStyle: 'dashed', borderWidth: 1 },
  upBar: { borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: 'visible' },
  downArea: { borderTopWidth: StyleSheet.hairlineWidth, overflow: 'visible' },
  downBar: { borderBottomLeftRadius: 3, borderBottomRightRadius: 3, overflow: 'visible' },
  numberAbove: { left: -12, letterSpacing: 0, position: 'absolute', right: -12, textAlign: 'center', top: -14 },
  numberBelow: { bottom: -14, left: -12, letterSpacing: 0, position: 'absolute', right: -12, textAlign: 'center' },
  markers: { height: 22, marginTop: space.xs },
  marker: { alignItems: 'center', position: 'absolute', top: 0 },
  markerLine: { borderRadius: 2, height: 3, width: '100%' },
  markerText: { letterSpacing: 0, marginTop: 2 },
  ticks: { flexDirection: 'row', gap: GAP, marginTop: space.xs },
  tick: { flex: 1, overflow: 'visible' },
  tickText: { letterSpacing: 0, width: 56 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, gap: space.xs, marginTop: space.md, paddingTop: space.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatchRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  swatchBox: { borderRadius: 2, height: 10, width: 10 },
  swatchLine: { borderRadius: 2, height: 3, width: 12 },
});
