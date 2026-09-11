import {
  Canvas,
  Group,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/ui/theme';

/**
 * The app's hero: a ribbed glass tank with a live water surface.
 *
 * Mirrors frontend/src/components/GlassTank.tsx so the two clients read as the
 * same product. Everything animates in Reanimated shared values consumed by
 * Skia on the UI thread — the JS thread stays free for data, which is the whole
 * point of drawing this in Skia rather than animating SVG props.
 *
 * `level` is the backend's `level_percent`. Null means the sensor could not be
 * read: the tank renders empty-but-dimmed with no surface motion, never 0%
 * pretending to be a real measurement.
 */

type Props = {
  level: number | null;
  /** Drives the water colour: a low tank or a suspected leak is not "fine". */
  alert?: 'low' | 'leak' | null;
  width?: number;
  height?: number;
  /** Wall/rib colour. Defaults to the theme's border. */
  tint?: string;
};

const WAVE_POINTS = 28;

export function GlassTank({ level, alert = null, width = 96, height = 140, tint }: Props) {
  const { colors } = useTheme();

  const fill = useSharedValue(0);
  const phase = useSharedValue(0);
  const amplitude = useSharedValue(0);

  const target = level === null ? 0 : Math.max(0, Math.min(100, level));
  const unknown = level === null;

  useEffect(() => {
    // Spring, not timing: a refill should feel like water arriving, and the
    // slight overshoot reads as momentum rather than a progress bar.
    fill.value = withSpring(target / 100, { damping: 14, stiffness: 90, mass: 0.8 });
  }, [target, fill]);

  useEffect(() => {
    let cancelled = false;

    // Reduce-motion collapses this to a flat surface. The level spring above is
    // a state change rather than decoration, so it is allowed to stay.
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion || unknown) {
        amplitude.value = withTiming(0, { duration: 200 });
        return;
      }
      amplitude.value = withTiming(1, { duration: 600 });
      phase.value = withRepeat(withTiming(Math.PI * 2, { duration: 3400, easing: Easing.linear }), -1, false);
    });

    return () => {
      cancelled = true;
      cancelAnimation(phase);
    };
  }, [unknown, amplitude, phase]);

  const water = useMemo(() => {
    if (alert === 'leak') return [colors.crit, '#7f1d1d'] as const;
    if (alert === 'low') return [colors.warn, '#78350f'] as const;
    return [colors.chart2, colors.chart5] as const;
  }, [alert, colors]);

  const inset = 4;
  const innerWidth = width - inset * 2;
  const innerHeight = height - inset * 2;

  // One path rebuilt per frame on the UI thread: the flat top edge of the
  // water body replaced by two offset sine waves, so the surface reads as
  // liquid rather than a rectangle growing.
  const surfacePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const waterHeight = innerHeight * fill.value;
    const surfaceY = inset + innerHeight - waterHeight;
    const amp = 3.2 * amplitude.value;

    path.moveTo(inset, surfaceY);
    for (let i = 0; i <= WAVE_POINTS; i += 1) {
      const t = i / WAVE_POINTS;
      const x = inset + innerWidth * t;
      const y =
        surfaceY +
        Math.sin(t * Math.PI * 2 + phase.value) * amp +
        Math.sin(t * Math.PI * 3.7 - phase.value * 1.4) * amp * 0.45;
      path.lineTo(x, y);
    }
    path.lineTo(inset + innerWidth, inset + innerHeight);
    path.lineTo(inset, inset + innerHeight);
    path.close();
    return path;
  });

  const ribs = useMemo(() => {
    const path = Skia.Path.Make();
    const step = innerHeight / 5;
    for (let i = 1; i < 5; i += 1) {
      const y = inset + step * i;
      path.moveTo(inset + 1, y);
      path.lineTo(inset + innerWidth - 1, y);
    }
    return path;
  }, [innerHeight, innerWidth]);

  const wallColor = tint ?? colors.border;
  const label =
    level === null ? 'Water level unknown — sensor unreadable' : `Water level ${Math.round(target)} percent`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width, height }}
    >
      <Canvas style={{ width, height }}>
        {/* Back wall */}
        <RoundedRect x={inset} y={inset} width={innerWidth} height={innerHeight} r={14} color={colors.muted} opacity={0.35} />

        {/* Water. Clipped to the inner wall so the wave never spills. */}
        <Group
          clip={Skia.RRectXY(Skia.XYWHRect(inset, inset, innerWidth, innerHeight), 14, 14)}
          opacity={unknown ? 0.25 : 1}
        >
          <Path path={surfacePath}>
            <LinearGradient start={vec(0, inset)} end={vec(0, inset + innerHeight)} colors={[water[0], water[1]]} />
          </Path>
        </Group>

        {/* Ribs + glass wall over the water */}
        <Path path={ribs} style="stroke" strokeWidth={1} color={wallColor} opacity={0.5} />
        <RoundedRect
          x={inset}
          y={inset}
          width={innerWidth}
          height={innerHeight}
          r={14}
          style="stroke"
          strokeWidth={1.5}
          color={wallColor}
        />
      </Canvas>
    </View>
  );
}
