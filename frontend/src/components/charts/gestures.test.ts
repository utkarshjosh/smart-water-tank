import { describe, expect, it } from 'vitest';
import type uPlot from 'uplot';
import { attachGestures, panBy, zoomAbout, type Range } from './gestures';

describe('history navigation', () => {
  const bounds: Range = [Date.parse('2025-09-01') / 1000, Date.parse('2026-09-01') / 1000];
  const july = Date.parse('2026-07-22T12:00:00Z') / 1000;
  it('can go from a year to one hour around July, then back out', () => {
    let view: Range = bounds;
    for (let i = 0; i < 20; i++) view = zoomAbout(view, july, 0.5, bounds, 3600);
    expect(view[1] - view[0]).toBe(3600);
    expect(view[0]).toBeLessThanOrEqual(july);
    expect(view[1]).toBeGreaterThanOrEqual(july);
    for (let i = 0; i < 20; i++) view = zoomAbout(view, july, 2, bounds, 3600);
    expect(view).toEqual(bounds);
  });
  it('pans an hourly window without changing its duration', () => {
    const view: Range = [july, july + 3600];
    expect(panBy(view, -86400, bounds)).toEqual([july - 86400, july + 3600 - 86400]);
    const edge = panBy(view, -1e10, bounds);
    expect(edge).toEqual([bounds[0], bounds[0] + 3600]);
  });
  it('leaves ordinary scrolling alone and zooms only with a modifier', () => {
    const listeners = new Map<string, EventListener>();
    let view: Range = [...bounds];
    const over = {
      style: {},
      clientWidth: 600,
      getBoundingClientRect: () => ({ left: 0 }),
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as HTMLElement;
    const cleanup = attachGestures(over, {} as uPlot, {
      getView: () => view,
      setView: (next) => {
        view = next;
      },
      getBounds: () => bounds,
      minSpan: 3600,
    });
    const normal = Object.assign(new Event('wheel', { cancelable: true }), {
      deltaY: 100,
      clientX: 300,
      ctrlKey: false,
      metaKey: false,
    });
    listeners.get('wheel')!(normal);
    expect(normal.defaultPrevented).toBe(false);
    expect(view).toEqual(bounds);
    const zoom = Object.assign(new Event('wheel', { cancelable: true }), {
      deltaY: -100,
      clientX: 300,
      ctrlKey: true,
      metaKey: false,
    });
    listeners.get('wheel')!(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(view[1] - view[0]).toBeLessThan(bounds[1] - bounds[0]);
    cleanup();
    expect(listeners.size).toBe(0);
  });
});
