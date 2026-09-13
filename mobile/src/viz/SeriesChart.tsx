import { Canvas, Circle, DashPathEffect, Group, Path, Skia } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, type ComponentType, type ReactNode, type RefObject } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { SeriesTuple } from '@/api/schemas';
import { haptics } from '@/feedback/haptics';
import { METRIC_BY_VALUE, type Metric } from '@/lib/metrics';
import { useScreenScroll } from '@/ui/Screen';
import { Text } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

/**
 * Line chart for one bucketed series, the phone's counterpart of
 * frontend/src/components/charts/TimeSeriesChart.tsx.
 *
 * Everything that moves under a finger lives on the UI thread. The visible
 * time range and the scrub position are Reanimated shared values; gesture
 * handlers are worklets that write them; Skia paths, tick labels and the
 * readout text are derived values consumed directly by Skia and by animated
 * TextInputs. A pan or pinch frame never touches React: the JS thread hears
 * about a gesture only when it ends (to decide whether to refetch) and for
 * the haptic tick when the cursor crosses onto a new bucket.
 *
 * Labels are React Native text laid over the canvas, not Skia text: Skia's
 * `matchFont` asks Android for a family called "System", gets no typeface,
 * and silently draws nothing. A TextInput's `text` prop can be set from the
 * UI thread, which is what lets the labels follow a pan without a render.
 *
 * Points arrive already bucketed by the server (/history/series) as
 * [epochMs, min, avg, max]; an all-null triple is a gap the server marked,
 * and the pen lifts there. Above ~1500 points the series is min/max-
 * decimated per pixel column once, on data change — never per frame.
 *
 * Gestures: drag to pan (the finger also drives the scrub cursor, as a
 * pointer does on the web), long-press-and-drag to scrub without panning,
 * pinch to zoom about the fingers, double-tap to reset. A vertical swipe is
 * left to the screen's scroll view.
 */

export type Range = [number, number];

export interface ThresholdLine {
  value: number;
  label: string;
}

export interface SeriesChartProps {
  points: SeriesTuple[];
  metric: Metric;
  unit: string;
  width: number;
  height?: number;
  /** Draws the alert bounds on the data itself. */
  thresholds?: ThresholdLine[];
  /** Shows the min/max envelope behind the average line. */
  showBand?: boolean;
  /** The server's bucket width; null for raw readings. Bounds how far one can zoom. */
  bucketMs?: number | null;
  /**
   * The time window that was asked for. The axes span this even when the
   * response is empty, so an outage still draws a chart to pan or widen
   * from rather than a blank.
   */
  window?: Range | null;
  /** Shown inside the plot when there is nothing to draw. */
  emptyMessage?: string;
  /** Fires once per pinch when the user zooms out past the loaded window. */
  onZoomBeyond?: () => void;
  /** The committed visible range after a pan or pinch ends, in epoch ms. */
  onViewChange?: (lo: number, hi: number) => void;
  /** Horizontal inset for the readout row; the plot itself is full-bleed. */
  inset?: number;
  /** Rendered at the right of the readout row (expand / close). */
  accessory?: ReactNode;
  /** Rendered between the readout and the plot: the range chips. */
  toolbar?: ReactNode;
  dimmed?: boolean;
}

// Labels sit inside the plot, so the only reserved space is a strip at the
// top for the highest value label and one at the bottom for the time labels.
const PAD = { top: 16, bottom: 18 } as const;
const LABEL_SIZE = 11;
const LABEL_HEIGHT = 14;
/** Fixed-width boxes so a label can be right- or centre-aligned without measuring it. */
const LABEL_BOX = 84;
const X_SLOTS = 8;
const Y_SLOTS = 7;
const DECIMATE_ABOVE = 1500;
/** Minimum gap between haptic ticks while scrubbing, so it is a tick not a buzz. */
const HAPTIC_GAP_MS = 50;

const NO_THRESHOLDS: ThresholdLine[] = [];

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
/** `text` is a native prop TextInput accepts but does not declare; it is how the readout updates off the JS thread. */
type ReadoutProps = TextInputProps & { text?: string };

// ---------------------------------------------------------------------------
// View arithmetic, ported from the webapp's charts/gestures.ts (ms, not s).
// Every helper below is a worklet so the gesture handlers can call it.

const clampSpan = (span: number, full: number, minSpan: number) => {
  'worklet';
  return Math.max(minSpan, Math.min(span, full));
};

/**
 * Keeps a window inside the data's bounds without changing its width, so
 * panning to the edge stops rather than dragging the series off-screen.
 */
export function clampToBounds(lo: number, hi: number, bLo: number, bHi: number): Range {
  'worklet';
  const span = hi - lo;
  const fullSpan = bHi - bLo;
  if (span >= fullSpan) return [bLo, bHi];
  if (lo < bLo) return [bLo, bLo + span];
  if (hi > bHi) return [bHi - span, bHi];
  return [lo, hi];
}

/** Zoom by `factor` about `anchor` (a data-space time), then clamp. */
export function zoomAbout(
  lo: number,
  hi: number,
  anchor: number,
  factor: number,
  bLo: number,
  bHi: number,
  minSpan: number
): Range {
  'worklet';
  const span = hi - lo;
  const next = clampSpan(span * factor, bHi - bLo, minSpan);
  const ratio = span === 0 ? 0.5 : (anchor - lo) / span;
  return clampToBounds(anchor - next * ratio, anchor + next * (1 - ratio), bLo, bHi);
}

// ---------------------------------------------------------------------------
// Formatting. Hand-rolled rather than toLocaleString: these run on the UI
// runtime, where Intl is not something to depend on.

function pad2(n: number): string {
  'worklet';
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Label by TICK SPACING, not total span: a 7-day window still ticks every
 * couple of days, and a 24-hour one every few hours. Sub-day ticks show the
 * time, and the midnight tick carries the date so the day stays readable.
 */
function formatTimeTick(t: number, gap: number): string {
  'worklet';
  const d = new Date(t);
  if (gap >= 28 * DAY) return `${MONTHS[d.getMonth()]} '${pad2(d.getFullYear() % 100)}`;
  if (gap >= DAY || (d.getHours() === 0 && d.getMinutes() === 0)) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return gap >= HOUR ? `${pad2(d.getHours())}:00` : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatWhen(t: number): string {
  'worklet';
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatValue(n: number): string {
  'worklet';
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function formatTick(n: number): string {
  'worklet';
  return String(Number(n.toFixed(2)));
}

// ---------------------------------------------------------------------------
// Ticks.

const SUB_DAY_STEPS = [
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
];
const DAY_STEPS = [1, 2, 3, 7, 14];
const MONTH_STEPS = [1, 2, 3, 6, 12];

/** Time ticks for a window, aligned to local wall-clock boundaries. */
export function timeTicks(lo: number, hi: number, plotWidth: number): { t: number; label: string }[] {
  'worklet';
  const span = hi - lo;
  // Roughly one label per 72px; fewer on a narrow plot rather than overlapping.
  const target = Math.max(2, Math.floor(plotWidth / 72));
  const ticks: number[] = [];
  let gap = DAY;

  const subDay = SUB_DAY_STEPS.find((step) => span / step <= target);
  if (subDay) {
    gap = subDay;
    // Align to local multiples so a 6-hour step lands on 00:00, 06:00, 12:00.
    const offsetMs = new Date(lo).getTimezoneOffset() * MINUTE;
    for (let t = Math.ceil((lo - offsetMs) / subDay) * subDay + offsetMs; t <= hi; t += subDay) ticks.push(t);
  } else {
    const cursor = new Date(lo);
    cursor.setHours(0, 0, 0, 0);
    const days = DAY_STEPS.find((d) => span / (d * DAY) <= target);
    if (days) {
      gap = days * DAY;
      while (cursor.getTime() < lo) cursor.setDate(cursor.getDate() + days);
      for (; cursor.getTime() <= hi; cursor.setDate(cursor.getDate() + days)) ticks.push(cursor.getTime());
    } else {
      const months = MONTH_STEPS.find((m) => span / (m * 30 * DAY) <= target) ?? 12;
      gap = months * 30 * DAY;
      // Snap to a multiple of the step within the year so quarterly ticks read
      // Jan / Apr / Jul / Oct wherever the window starts.
      cursor.setDate(1);
      cursor.setMonth(Math.floor(cursor.getMonth() / months) * months);
      while (cursor.getTime() < lo) cursor.setMonth(cursor.getMonth() + months);
      for (; cursor.getTime() <= hi; cursor.setMonth(cursor.getMonth() + months)) ticks.push(cursor.getTime());
    }
  }

  const out: { t: number; label: string }[] = [];
  for (let i = 0; i < ticks.length && i < X_SLOTS; i++) out.push({ t: ticks[i], label: formatTimeTick(ticks[i], gap) });
  return out;
}

/**
 * Value axis that ends on round numbers. Percent is fixed at 0–100 with
 * quarter splits, as on the web; everything else follows the visible data.
 */
export function valueTicks(lo: number, hi: number, count = 4): { min: number; max: number; ticks: number[] } {
  'worklet';
  // A dead-flat series would divide by zero and draw on the top edge; give it
  // a little room so the line sits in the middle of the plot.
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const rough = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) * magnitude;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2 && ticks.length < Y_SLOTS; v += step) ticks.push(Number(v.toFixed(6)));
  return { min, max, ticks };
}

/** Index of the time closest to `t`; `times` is sorted ascending. */
function nearestIndex(times: number[], t: number): number {
  'worklet';
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && t - times[lo - 1] < times[lo] - t) return lo - 1;
  return lo;
}

// ---------------------------------------------------------------------------
// Data preparation. Columnar arrays with NaN for null cross to the UI runtime
// once per data change and are cheap to scan in a worklet.

interface SeriesData {
  t: number[];
  lo: number[];
  avg: number[];
  hi: number[];
  bounds: Range;
  minSpan: number;
  hasBand: boolean;
  /** Last real reading, for the resting readout. */
  latest: { t: number; value: number } | null;
  realCount: number;
}

/**
 * Keep at most the lowest and highest reading per pixel column, in time
 * order, so the drawn line still touches every extreme a denser series has.
 * Gap markers are always kept so the line still breaks across an outage.
 */
function decimate(points: SeriesTuple[], columns: number): SeriesTuple[] {
  if (points.length <= DECIMATE_ABOVE) return points;
  const t0 = points[0][0];
  const columnMs = Math.max(1, (points[points.length - 1][0] - t0) / columns);
  const out: SeriesTuple[] = [];
  let column = -1;
  let bucket: SeriesTuple[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    let low = bucket[0];
    let high = bucket[0];
    for (const p of bucket) {
      if ((p[2] as number) < (low[2] as number)) low = p;
      if ((p[2] as number) > (high[2] as number)) high = p;
    }
    if (low === high) out.push(low);
    else if (low[0] < high[0]) out.push(low, high);
    else out.push(high, low);
    bucket = [];
  };

  for (const p of points) {
    if (p[2] == null) {
      flush();
      out.push(p);
      continue;
    }
    const c = Math.floor((p[0] - t0) / columnMs);
    if (c !== column) {
      flush();
      column = c;
    }
    bucket.push(p);
  }
  flush();
  return out;
}

/** Typical spacing between consecutive real readings; the bucket width of a raw series. */
function medianSpacing(points: SeriesTuple[]): number {
  const gaps: number[] = [];
  let previous: number | null = null;
  for (const p of points) {
    if (p[2] == null) {
      previous = null;
      continue;
    }
    if (previous != null) gaps.push(p[0] - previous);
    previous = p[0];
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}

function prepare(points: SeriesTuple[], columns: number, bucketMs: number | null, window: Range | null): SeriesData {
  const kept = decimate(points, columns);
  const n = kept.length;
  const t = new Array<number>(n);
  const lo = new Array<number>(n);
  const avg = new Array<number>(n);
  const hi = new Array<number>(n);
  let latest: SeriesData['latest'] = null;
  let realCount = 0;
  let hasBand = false;
  for (let i = 0; i < n; i++) {
    const p = kept[i];
    t[i] = p[0];
    lo[i] = p[1] ?? NaN;
    avg[i] = p[2] ?? NaN;
    hi[i] = p[3] ?? NaN;
    if (p[2] != null) {
      realCount++;
      latest = { t: p[0], value: p[2] };
    }
    if (p[1] != null && p[3] != null && p[3] - p[1] > 0) hasBand = true;
  }
  // The requested window wins over the data's own extent: a 24h request with
  // three hours of readings still shows 24 hours, and an empty one shows the
  // window it asked for, not [0, 1].
  const windowOk = window != null && Number.isFinite(window[0]) && Number.isFinite(window[1]) && window[1] > window[0];
  const bounds: Range = windowOk ? [window[0], window[1]] : n === 0 ? [Date.now() - DAY, Date.now()] : [t[0], t[n - 1]];
  // Never zoom past two buckets: at that width the view always holds a
  // reading or two plus their neighbours, so there is always a segment to
  // draw. Raw series have no bucket, so their typical spacing stands in.
  const bucket = bucketMs != null && Number.isFinite(bucketMs) && bucketMs > 0 ? bucketMs : medianSpacing(points);
  const minSpan = Math.max(MINUTE, Number.isFinite(bucket) ? bucket * 2 : 0);
  return { t, lo, avg, hi, bounds, minSpan, hasBand, latest, realCount };
}

// ---------------------------------------------------------------------------

interface Frame {
  lo: number;
  hi: number;
  min: number;
  max: number;
  line: ReturnType<typeof Skia.Path.Make>;
  band: ReturnType<typeof Skia.Path.Make>;
  grid: ReturnType<typeof Skia.Path.Make>;
  thresholdPath: ReturnType<typeof Skia.Path.Make>;
  xLabels: Label[];
  yLabels: Label[];
  thresholdLabels: Label[];
}

/** One overlay label: the top-left of its box in plot coordinates. */
interface Label {
  x: number;
  y: number;
  text: string;
}

interface Cursor {
  idx: number;
  x: number;
  y: number;
}

export function SeriesChart({
  points,
  metric,
  unit,
  width,
  height = 300,
  thresholds = NO_THRESHOLDS,
  showBand = true,
  bucketMs = null,
  window = null,
  emptyMessage,
  onZoomBeyond,
  onViewChange,
  inset = space.lg,
  accessory,
  toolbar,
  dimmed = false,
}: SeriesChartProps) {
  const { colors } = useTheme();
  const scroll = useScreenScroll();
  const color = colors[METRIC_BY_VALUE[metric].color];

  const plotTop = PAD.top;
  const plotBottom = Math.max(PAD.top + 1, height - PAD.bottom);
  const plotHeight = plotBottom - plotTop;
  const plotWidth = Math.max(1, width);
  const fixedPercent = metric === 'level_percent';

  const data = useMemo(
    () => prepare(points, Math.max(200, Math.round(width)), bucketMs, window),
    [points, width, bucketMs, window]
  );
  const hasBand = showBand && data.hasBand;

  // --- UI-thread state ----------------------------------------------------
  const viewLo = useSharedValue(data.bounds[0]);
  const viewHi = useSharedValue(data.bounds[1]);
  const boundsLo = useSharedValue(data.bounds[0]);
  const boundsHi = useSharedValue(data.bounds[1]);
  const minSpan = useSharedValue(data.minSpan);
  /** Scrub position in data time; NaN when no finger is down. */
  const cursorT = useSharedValue(NaN);
  const startLo = useSharedValue(0);
  const startHi = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const pinchAnchor = useSharedValue(0);
  const pinchFromFull = useSharedValue(false);
  const zoomBeyondFired = useSharedValue(false);
  const lastHaptic = useSharedValue(0);
  /** The last value-axis domain that came from real data, kept while the view shows only a gap. */
  const lastDomain = useSharedValue<{ min: number; max: number; ticks: number[] } | null>(null);

  // A refetch replaces the series, so the window snaps to the new extent.
  // Refining on zoom returns data whose extent IS the zoomed window, so the
  // view does not visibly move when finer buckets land.
  useEffect(() => {
    boundsLo.value = data.bounds[0];
    boundsHi.value = data.bounds[1];
    viewLo.value = data.bounds[0];
    viewHi.value = data.bounds[1];
    minSpan.value = data.minSpan;
    cursorT.value = NaN;
  }, [data, boundsLo, boundsHi, viewLo, viewHi, minSpan, cursorT]);

  // JS-side callbacks reached through runOnJS. Refs keep the gesture object
  // stable across renders while the props behind it may change.
  const onZoomBeyondRef = useRef(onZoomBeyond);
  const onViewChangeRef = useRef(onViewChange);
  onZoomBeyondRef.current = onZoomBeyond;
  onViewChangeRef.current = onViewChange;
  const zoomBeyond = useCallback(() => onZoomBeyondRef.current?.(), []);
  const commitView = useCallback((lo: number, hi: number) => onViewChangeRef.current?.(lo, hi), []);
  const tick = useCallback(() => haptics.selection(), []);
  const lockScroll = useCallback((locked: boolean) => scroll?.setScrollEnabled(!locked), [scroll]);

  // --- Gestures (worklets) -------------------------------------------------
  const gesture = useMemo(() => {
    const timeAt = (x: number) => {
      'worklet';
      return viewLo.value + (x / plotWidth) * (viewHi.value - viewLo.value);
    };
    const setView = (lo: number, hi: number) => {
      'worklet';
      const clamped = clampToBounds(lo, hi, boundsLo.value, boundsHi.value);
      viewLo.value = clamped[0];
      viewHi.value = clamped[1];
    };

    // activeOffsetX/failOffsetY keep a vertical swipe with the scroll view,
    // like `touch-action: pan-y` on the web.
    const pan = Gesture.Pan()
      .maxPointers(1)
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onStart((e) => {
        'worklet';
        startLo.value = viewLo.value;
        startHi.value = viewHi.value;
        panStartX.value = e.x;
        cursorT.value = timeAt(e.x);
      })
      .onUpdate((e) => {
        'worklet';
        // Delta from `x` rather than `translationX`: `x` is in this view's own
        // frame, so the maths holds inside the rotated full-screen modal too.
        // The span cannot change mid-pan, so ms-per-pixel is fixed at the start.
        const dx = e.x - panStartX.value;
        const perPixel = (startHi.value - startLo.value) / plotWidth;
        setView(startLo.value - dx * perPixel, startHi.value - dx * perPixel);
        cursorT.value = timeAt(e.x);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(commitView)(viewLo.value, viewHi.value);
      })
      .onFinalize(() => {
        'worklet';
        cursorT.value = NaN;
      });

    // Hold, then drag: scrub without moving the window. Moving early fails
    // this one and lets the pan take over, so the two never fight.
    const scrub = Gesture.Pan()
      .maxPointers(1)
      .activateAfterLongPress(250)
      .onStart((e) => {
        'worklet';
        cursorT.value = timeAt(e.x);
      })
      .onUpdate((e) => {
        'worklet';
        cursorT.value = timeAt(e.x);
      })
      .onFinalize(() => {
        'worklet';
        cursorT.value = NaN;
      });

    let pinch = Gesture.Pinch()
      .onStart((e) => {
        'worklet';
        startLo.value = viewLo.value;
        startHi.value = viewHi.value;
        pinchAnchor.value = timeAt(e.focalX);
        pinchFromFull.value = viewHi.value - viewLo.value >= (boundsHi.value - boundsLo.value) * 0.999;
        zoomBeyondFired.value = false;
        cursorT.value = NaN;
        runOnJS(lockScroll)(true);
      })
      .onUpdate((e) => {
        'worklet';
        if (e.scale <= 0) return;
        const next = zoomAbout(
          startLo.value,
          startHi.value,
          pinchAnchor.value,
          1 / e.scale,
          boundsLo.value,
          boundsHi.value,
          minSpan.value
        );
        viewLo.value = next[0];
        viewHi.value = next[1];
        if (pinchFromFull.value && e.scale < 1 && !zoomBeyondFired.value) {
          zoomBeyondFired.value = true;
          runOnJS(zoomBeyond)();
        }
      })
      .onEnd(() => {
        'worklet';
        runOnJS(commitView)(viewLo.value, viewHi.value);
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(lockScroll)(false);
      });
    // The page's scroll view may already own the touch when the second finger
    // lands; letting the pinch run alongside it (and freezing the scroll for
    // its duration above) is what makes two fingers on the chart zoom.
    // gesture-handler's ScrollView exposes its handler tag on the ref; the
    // typing only knows about gesture objects.
    if (scroll) pinch = pinch.simultaneousWithExternalGesture(scroll.scrollRef as unknown as RefObject<ComponentType>);

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(200)
      .onStart(() => {
        'worklet';
        viewLo.value = boundsLo.value;
        viewHi.value = boundsHi.value;
        cursorT.value = NaN;
        runOnJS(commitView)(boundsLo.value, boundsHi.value);
      });

    // Race, not Exclusive: nothing waits on the double-tap, so a drag starts
    // moving the moment it clears the offset.
    return Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, Gesture.Race(scrub, pan)));
  }, [
    plotWidth,
    scroll,
    commitView,
    zoomBeyond,
    lockScroll,
    viewLo,
    viewHi,
    boundsLo,
    boundsHi,
    minSpan,
    cursorT,
    startLo,
    startHi,
    panStartX,
    pinchAnchor,
    pinchFromFull,
    zoomBeyondFired,
  ]);

  // --- Derived geometry (UI thread) ---------------------------------------
  const frame = useDerivedValue<Frame>(() => {
    const [lo, hi] = clampToBounds(viewLo.value, viewHi.value, boundsLo.value, boundsHi.value);
    const span = Math.max(1, hi - lo);
    const times = data.t;
    const n = times.length;
    const xOf = (t: number) => ((t - lo) / span) * plotWidth;

    // Only the visible slice plus one neighbour each side is walked, so a
    // 5000-point year costs the same per frame as a 24-hour window.
    const start = n === 0 ? 0 : Math.max(0, nearestIndex(times, lo) - 1);
    const end = n === 0 ? -1 : Math.min(n - 1, nearestIndex(times, hi) + 1);

    let min = 0;
    let max = 100;
    let ticks = [0, 25, 50, 75, 100];
    if (!fixedPercent) {
      let dataLo = Infinity;
      let dataHi = -Infinity;
      for (let i = start; i <= end; i++) {
        const a = data.avg[i];
        if (!Number.isNaN(a)) {
          if (a < dataLo) dataLo = a;
          if (a > dataHi) dataHi = a;
        }
        if (hasBand) {
          const l = data.lo[i];
          const h = data.hi[i];
          if (!Number.isNaN(l) && l < dataLo) dataLo = l;
          if (!Number.isNaN(h) && h > dataHi) dataHi = h;
        }
      }
      // Nothing visible (an outage fills the window, or the series is empty):
      // keep the scale the user was just looking at rather than jumping.
      let domain = lastDomain.value;
      if (dataLo !== Infinity && Number.isFinite(dataLo) && Number.isFinite(dataHi)) {
        domain = valueTicks(dataLo, dataHi);
        lastDomain.value = domain;
      } else if (!domain) {
        domain = valueTicks(0, 1);
      }
      min = domain.min;
      max = domain.max;
      ticks = domain.ticks;
    }
    const yOf = (v: number) => plotTop + (1 - (v - min) / (max - min)) * plotHeight;

    const line = Skia.Path.Make();
    const band = Skia.Path.Make();
    let penDown = false;
    let runX: number[] = [];
    let runLo: number[] = [];
    let runHi: number[] = [];
    // The band is one closed shape per unbroken run: forward along the highs,
    // back along the lows.
    const flushBand = () => {
      if (runX.length > 1) {
        band.moveTo(runX[0], runHi[0]);
        for (let i = 1; i < runX.length; i++) band.lineTo(runX[i], runHi[i]);
        for (let i = runX.length - 1; i >= 0; i--) band.lineTo(runX[i], runLo[i]);
        band.close();
      }
      runX = [];
      runLo = [];
      runHi = [];
    };

    for (let i = start; i <= end; i++) {
      const a = data.avg[i];
      if (Number.isNaN(a)) {
        // Gap: lift the pen. Nulls stay holes, so the line breaks across an
        // outage instead of interpolating straight through it.
        penDown = false;
        flushBand();
        continue;
      }
      const px = xOf(times[i]);
      const py = yOf(a);
      if (penDown) line.lineTo(px, py);
      else line.moveTo(px, py);
      penDown = true;

      const l = data.lo[i];
      const h = data.hi[i];
      if (hasBand && !Number.isNaN(l) && !Number.isNaN(h)) {
        runX.push(px);
        runLo.push(yOf(l));
        runHi.push(yOf(h));
      } else {
        flushBand();
      }
    }
    flushBand();

    const grid = Skia.Path.Make();
    const yLabels: Frame['yLabels'] = [];
    for (const v of ticks) {
      const y = yOf(v);
      grid.moveTo(0, y);
      grid.lineTo(plotWidth, y);
      // Right-aligned inside the plot, sitting just above its gridline.
      yLabels.push({ x: plotWidth - 4 - LABEL_BOX, y: y - LABEL_HEIGHT - 2, text: `${formatTick(v)}${unit}` });
    }

    const xLabels: Frame['xLabels'] = [];
    for (const t of timeTicks(lo, hi, plotWidth)) {
      const centre = xOf(t.t);
      // Roughly half a label at 11px; one that would run off an edge is dropped, not clipped.
      const half = t.label.length * 3.2;
      if (centre - half >= 2 && centre + half <= plotWidth - 2) {
        xLabels.push({ x: centre - LABEL_BOX / 2, y: plotBottom + 3, text: t.label });
      }
    }

    const thresholdPath = Skia.Path.Make();
    const thresholdLabels: Frame['thresholdLabels'] = [];
    for (const th of thresholds) {
      const y = yOf(th.value);
      if (y < plotTop || y > plotBottom) continue;
      thresholdPath.moveTo(0, y);
      thresholdPath.lineTo(plotWidth, y);
      thresholdLabels.push({ x: 6, y: y - LABEL_HEIGHT - 2, text: th.label });
    }

    return { lo, hi, min, max, line, band, grid, thresholdPath, xLabels, yLabels, thresholdLabels };
  }, [data, plotWidth, plotHeight, plotTop, plotBottom, fixedPercent, hasBand, unit, thresholds, lastDomain]);

  const cursor = useDerivedValue<Cursor | null>(() => {
    const ct = cursorT.value;
    if (Number.isNaN(ct) || data.t.length === 0) return null;
    const f = frame.value;
    const idx = nearestIndex(data.t, ct);
    const v = data.avg[idx];
    // A gap marker or a point scrolled out of view has nothing to say.
    if (Number.isNaN(v)) return null;
    const x = ((data.t[idx] - f.lo) / Math.max(1, f.hi - f.lo)) * plotWidth;
    if (x < 0 || x > plotWidth) return null;
    return { idx, x, y: plotTop + (1 - (v - f.min) / (f.max - f.min)) * plotHeight };
  }, [data, frame, plotWidth, plotHeight, plotTop]);

  const linePath = useDerivedValue(() => frame.value.line, [frame]);
  const bandPath = useDerivedValue(() => frame.value.band, [frame]);
  const gridPath = useDerivedValue(() => frame.value.grid, [frame]);
  const thresholdPath = useDerivedValue(() => frame.value.thresholdPath, [frame]);
  const crosshair = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const c = cursor.value;
    if (c) {
      path.moveTo(c.x, plotTop);
      path.lineTo(c.x, plotBottom);
    }
    return path;
  }, [cursor, plotTop, plotBottom]);
  const dotX = useDerivedValue(() => cursor.value?.x ?? 0, [cursor]);
  const dotY = useDerivedValue(() => cursor.value?.y ?? 0, [cursor]);
  const dotR = useDerivedValue(() => (cursor.value ? 4 : 0), [cursor]);

  // --- Readout ---------------------------------------------------------------
  const latestValue = data.latest ? `${formatValue(data.latest.value)}${unit}` : '—';
  const latestTime = data.latest ? `Latest · ${formatWhen(data.latest.t)}` : 'No readings yet';

  const valueText = useDerivedValue(() => {
    const c = cursor.value;
    return c ? `${formatValue(data.avg[c.idx])}${unit}` : latestValue;
  }, [cursor, data, unit, latestValue]);
  const timeText = useDerivedValue(() => {
    const c = cursor.value;
    if (!c) return latestTime;
    let text = formatWhen(data.t[c.idx]);
    const l = data.lo[c.idx];
    const h = data.hi[c.idx];
    if (!Number.isNaN(l) && !Number.isNaN(h) && h - l > 0.01) {
      text += ` · low ${formatValue(l)}${unit} · high ${formatValue(h)}${unit}`;
    }
    return text;
  }, [cursor, data, unit, latestTime]);
  const valueProps = useAnimatedProps<ReadoutProps>(() => ({ text: valueText.value }), [valueText]);
  const timeProps = useAnimatedProps<ReadoutProps>(() => ({ text: timeText.value }), [timeText]);

  // One tick per bucket crossed while scrubbing; the JS thread is only
  // involved for the haptic itself.
  useAnimatedReaction(
    () => cursor.value?.idx ?? -1,
    (idx, previous) => {
      if (previous == null || previous < 0 || idx < 0 || idx === previous) return;
      const now = Date.now();
      if (now - lastHaptic.value < HAPTIC_GAP_MS) return;
      lastHaptic.value = now;
      runOnJS(tick)();
    },
    [cursor, tick]
  );

  const label = METRIC_BY_VALUE[metric].label;
  const clip = Skia.XYWHRect(0, plotTop - 2, plotWidth, plotHeight + 4);

  return (
    <View style={[styles.root, { opacity: dimmed ? 0.5 : 1 }]}>
      <View style={[styles.readout, { paddingHorizontal: inset }]}>
        <View style={styles.readoutText}>
          <AnimatedTextInput
            animatedProps={valueProps}
            defaultValue={latestValue}
            editable={false}
            underlineColorAndroid="transparent"
            accessibilityLabel={`${label} reading`}
            style={[styles.readoutValue, { color: colors.foreground }]}
          />
          <AnimatedTextInput
            animatedProps={timeProps}
            defaultValue={latestTime}
            editable={false}
            underlineColorAndroid="transparent"
            style={[styles.readoutTime, { color: colors.mutedForeground }]}
          />
        </View>
        {accessory}
      </View>

      {toolbar}

      <GestureDetector gesture={gesture}>
        <View accessible accessibilityRole="image" accessibilityLabel={`${label} over time`} style={{ width, height }}>
          <Canvas style={{ width, height }}>
            <Path path={gridPath} style="stroke" strokeWidth={1} color={colors.border} />

            <Group clip={clip}>
              {hasBand && <Path path={bandPath} color={color} opacity={0.14} />}
              <Path path={linePath} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" color={color} />
            </Group>

            <Path path={thresholdPath} style="stroke" strokeWidth={1} color={colors.mutedForeground}>
              <DashPathEffect intervals={[4, 4]} />
            </Path>

            <Path path={crosshair} style="stroke" strokeWidth={1} color={colors.mutedForeground} opacity={0.7} />
            <Circle cx={dotX} cy={dotY} r={dotR} color={colors.card} />
            <Circle cx={dotX} cy={dotY} r={dotR} style="stroke" strokeWidth={2} color={color} />
          </Canvas>

          {Array.from({ length: Y_SLOTS }, (_, i) => (
            <TickLabel key={`y${i}`} frame={frame} list="yLabels" index={i} align="right" color={colors.mutedForeground} />
          ))}
          {Array.from({ length: X_SLOTS }, (_, i) => (
            <TickLabel key={`x${i}`} frame={frame} list="xLabels" index={i} align="center" color={colors.mutedForeground} />
          ))}
          {thresholds.map((th, i) => (
            <TickLabel
              key={th.label}
              frame={frame}
              list="thresholdLabels"
              index={i}
              align="left"
              color={colors.mutedForeground}
            />
          ))}
          {data.realCount === 0 && !!emptyMessage && (
            <View pointerEvents="none" style={[styles.empty, { top: plotTop, height: plotHeight }]}>
              <Text variant="body" color="mutedForeground" style={styles.emptyText}>
                {emptyMessage}
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

/**
 * One axis label: a TextInput whose position (animated style) and string
 * (animated `text` prop) both come off the frame on the UI thread. The label
 * lists vary in length per frame; a fixed number of slots, hidden when
 * unused, is what lets that happen without a React render.
 */
function TickLabel({
  frame,
  list,
  index,
  align,
  color,
}: {
  frame: SharedValue<Frame>;
  list: 'xLabels' | 'yLabels' | 'thresholdLabels';
  index: number;
  align: 'left' | 'center' | 'right';
  color: string;
}) {
  const position = useAnimatedStyle(() => {
    const entry = frame.value[list][index];
    return {
      opacity: entry ? 1 : 0,
      transform: [{ translateX: entry?.x ?? 0 }, { translateY: entry?.y ?? 0 }],
    };
  }, [frame, list, index]);
  const text = useAnimatedProps<ReadoutProps>(() => ({ text: frame.value[list][index]?.text ?? '' }), [
    frame,
    list,
    index,
  ]);
  return (
    <AnimatedTextInput
      animatedProps={text}
      defaultValue=""
      editable={false}
      pointerEvents="none"
      importantForAccessibility="no"
      underlineColorAndroid="transparent"
      style={[styles.tick, { color, textAlign: align }, position]}
    />
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  readout: { alignItems: 'center', flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  readoutText: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', left: 0, position: 'absolute', right: 0 },
  emptyText: { paddingHorizontal: space.xl, textAlign: 'center' },
  // TextInput, not Text, so the value can change without a React render.
  readoutValue: { fontSize: 32, fontVariant: ['tabular-nums'], fontWeight: '700', lineHeight: 38, margin: 0, padding: 0 },
  readoutTime: { fontSize: 13, fontVariant: ['tabular-nums'], lineHeight: 18, margin: 0, padding: 0 },
  tick: {
    fontSize: LABEL_SIZE,
    fontVariant: ['tabular-nums'],
    height: LABEL_HEIGHT,
    includeFontPadding: false,
    left: 0,
    lineHeight: LABEL_HEIGHT,
    margin: 0,
    padding: 0,
    position: 'absolute',
    top: 0,
    width: LABEL_BOX,
  },
});
