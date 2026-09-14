import type uPlot from 'uplot';

export type Range = [number, number];

const clampSpan = (span: number, full: number, minSpan: number) =>
  Math.max(minSpan, Math.min(span, full));

/**
 * Keeps a window inside the data's bounds without changing its width, so
 * panning to the edge stops rather than dragging the series off-screen.
 */
export function clampToBounds([lo, hi]: Range, bounds: Range): Range {
  const span = hi - lo;
  const fullSpan = bounds[1] - bounds[0];
  if (span >= fullSpan) return [bounds[0], bounds[1]];
  if (lo < bounds[0]) return [bounds[0], bounds[0] + span];
  if (hi > bounds[1]) return [bounds[1] - span, bounds[1]];
  return [lo, hi];
}

/** Zoom by `factor` about `anchor` (a data-space x), then clamp. */
export function zoomAbout(
  view: Range,
  anchor: number,
  factor: number,
  bounds: Range,
  minSpan: number
): Range {
  const span = view[1] - view[0];
  const next = clampSpan(span * factor, bounds[1] - bounds[0], minSpan);
  const ratio = span === 0 ? 0.5 : (anchor - view[0]) / span;
  return clampToBounds([anchor - next * ratio, anchor + next * (1 - ratio)], bounds);
}

export function panBy(view: Range, deltaData: number, bounds: Range): Range {
  return clampToBounds([view[0] + deltaData, view[1] + deltaData], bounds);
}

export interface GestureOptions {
  getView: () => Range;
  setView: (range: Range) => void;
  getBounds: () => Range;
  minSpan: number;
  /** Called when the user keeps zooming out past the loaded window. */
  onZoomBeyond?: () => void;
}

/**
 * Drag to pan, Ctrl/Meta + wheel to zoom, two fingers to pinch, double-tap to reset.
 *
 * `touch-action: pan-y` is deliberate: a vertical swipe still scrolls the page
 * (the chart is not a scroll trap on a phone), while horizontal drags and
 * pinches come to us.
 */
export function attachGestures(over: HTMLElement, plot: uPlot, options: GestureOptions) {
  const pointers = new Map<number, { x: number; y: number }>();
  let panStartX = 0;
  let panStartView: Range | null = null;
  let pinchStartDist = 0;
  let pinchStartView: Range | null = null;
  let lastTap = 0;

  over.style.touchAction = 'pan-y';

  /** Pixels-per-datum for the current view, used to convert drags to data. */
  const perPixel = () => {
    const view = options.getView();
    const width = plot.bbox.width / devicePixelRatio;
    return width > 0 ? (view[1] - view[0]) / width : 0;
  };

  const xAt = (clientX: number) => {
    const left = over.getBoundingClientRect().left;
    const view = options.getView();
    const width = over.clientWidth;
    return view[0] + ((clientX - left) / Math.max(1, width)) * (view[1] - view[0]);
  };

  const atFullExtent = () => {
    const [lo, hi] = options.getView();
    const [bLo, bHi] = options.getBounds();
    return hi - lo >= (bHi - bLo) * 0.999;
  };

  const onWheel = (event: WheelEvent) => {
    // Page scrolling must not silently change a chart's date range.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const wasFull = atFullExtent();
    const factor = event.deltaY > 0 ? 1.25 : 0.8;
    options.setView(
      zoomAbout(options.getView(), xAt(event.clientX), factor, options.getBounds(), options.minSpan)
    );
    if (wasFull && factor > 1) options.onZoomBeyond?.();
  };

  const onPointerDown = (event: PointerEvent) => {
    over.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 300) {
        options.setView(options.getBounds());
        lastTap = 0;
        return;
      }
      lastTap = now;
      panStartX = event.clientX;
      panStartView = options.getView();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartView = options.getView();
      panStartView = null;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && pinchStartView) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStartDist > 0 && dist > 0) {
        const wasFull = atFullExtent();
        const anchor = xAt((a.x + b.x) / 2);
        const span = pinchStartView[1] - pinchStartView[0];
        const target = span * (pinchStartDist / dist);
        options.setView(
          zoomAbout(pinchStartView, anchor, target / span, options.getBounds(), options.minSpan)
        );
        if (wasFull && dist < pinchStartDist) options.onZoomBeyond?.();
      }
      return;
    }

    if (pointers.size === 1 && panStartView) {
      const dx = event.clientX - panStartX;
      if (Math.abs(dx) < 2) return;
      options.setView(panBy(panStartView, -dx * perPixel(), options.getBounds()));
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      pinchStartView = null;
      pinchStartDist = 0;
    }
    if (pointers.size === 0) panStartView = null;
  };

  const onDblClick = () => options.setView(options.getBounds());

  over.addEventListener('wheel', onWheel, { passive: false });
  over.addEventListener('pointerdown', onPointerDown);
  over.addEventListener('pointermove', onPointerMove);
  over.addEventListener('pointerup', onPointerUp);
  over.addEventListener('pointercancel', onPointerUp);
  over.addEventListener('dblclick', onDblClick);

  return () => {
    over.removeEventListener('wheel', onWheel);
    over.removeEventListener('pointerdown', onPointerDown);
    over.removeEventListener('pointermove', onPointerMove);
    over.removeEventListener('pointerup', onPointerUp);
    over.removeEventListener('pointercancel', onPointerUp);
    over.removeEventListener('dblclick', onDblClick);
  };
}
