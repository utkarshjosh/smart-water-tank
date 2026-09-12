import { Canvas, Circle, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Label, Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

/**
 * Area + line chart for one measurement series.
 *
 * Hand-drawn in Skia rather than pulling in a chart library: the shape is a
 * single series, and owning the path means a null reading becomes a real gap
 * instead of a line drawn straight through missing data.
 *
 * Points arrive already bucketed by the server (/history/series), so this only
 * draws: no downsampling, and a null value is a real gap the server marked.
 */

export type SeriesPoint = { t: number; v: number | null };

export function SeriesChart({
  points,
  height = 160,
  width,
  unit = '%',
}: {
  points: SeriesPoint[];
  height?: number;
  width: number;
  unit?: string;
}) {
  const { colors } = useTheme();

  const chart = useMemo(() => {
    const data = [...points].sort((a, b) => a.t - b.t);
    const valid = data.filter((p): p is { t: number; v: number } => p.v !== null);
    if (valid.length < 2) return null;

    const padding = { top: 8, bottom: 8, left: 0, right: 6 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const minT = data[0].t;
    const maxT = data[data.length - 1].t;
    const spanT = Math.max(1, maxT - minT);

    const values = valid.map((p) => p.v);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // A dead-flat series would divide by zero and draw on the top edge; give it
    // a little room so the line sits in the middle of the plot.
    const pad = rawMax - rawMin < 1 ? 1 : (rawMax - rawMin) * 0.12;
    const minV = rawMin - pad;
    const maxV = rawMax + pad;

    const x = (t: number) => padding.left + ((t - minT) / spanT) * plotWidth;
    const y = (v: number) => padding.top + (1 - (v - minV) / (maxV - minV)) * plotHeight;

    const line = Skia.Path.Make();
    const area = Skia.Path.Make();
    let penDown = false;

    for (const point of data) {
      if (point.v === null) {
        // Gap: lift the pen and close the area segment at the baseline.
        if (penDown) area.lineTo(x(point.t), height - padding.bottom);
        penDown = false;
        continue;
      }
      const px = x(point.t);
      const py = y(point.v);
      if (!penDown) {
        line.moveTo(px, py);
        area.moveTo(px, height - padding.bottom);
        area.lineTo(px, py);
        penDown = true;
      } else {
        line.lineTo(px, py);
        area.lineTo(px, py);
      }
    }
    if (penDown) area.lineTo(x(data[data.length - 1].t), height - padding.bottom);

    const last = valid[valid.length - 1];

    return {
      line,
      area,
      top: padding.top,
      last: { x: x(last.t), y: y(last.v), v: last.v },
      min: rawMin,
      max: rawMax,
    };
  }, [points, width, height]);

  if (!chart) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text variant="caption" color="mutedForeground">
          Not enough readings yet to draw a trend.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Canvas style={{ width, height }}>
        <Path path={chart.area}>
          <LinearGradient
            start={vec(0, chart.top)}
            end={vec(0, height)}
            colors={[`${colors.chart2}66`, `${colors.chart2}00`]}
          />
        </Path>
        <Path path={chart.line} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" color={colors.chart2} />
        {/* The latest reading is the one the user came for. */}
        <Circle cx={chart.last.x} cy={chart.last.y} r={3.5} color={colors.chart2} />
      </Canvas>

      <View style={styles.legend}>
        <Label>
          low {Math.round(chart.min)}
          {unit}
        </Label>
        <Label>
          high {Math.round(chart.max)}
          {unit}
        </Label>
        <Label>
          now {Math.round(chart.last.v)}
          {unit}
        </Label>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: space.lg, justifyContent: 'space-between' },
});
