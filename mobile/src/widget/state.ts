import { widgetStore } from '@/storage';

/**
 * The widget's only data source.
 *
 * A widget may be asked to render while the app is not running, so it can never
 * fetch. Instead every path that learns something new about a tank writes this
 * blob — the foreground app after a query settles, and (from phase 3) the FCM
 * background handler and the background task. The renderer only reads it.
 *
 * Consequence, and the rule that matters: the widget always has something to
 * draw. It shows a value with its age, never a spinner and never a blank card.
 */

const KEY = 'widget_state.v1';

export type WidgetTank = {
  deviceId: string;
  name: string;
  levelPercent: number | null;
  volumeL: number | null;
  capacityL: number | null;
  /** ms epoch of the reading itself, not of when we fetched it. */
  asOf: number | null;
  stale: boolean;
  online: boolean;
  alert: 'low' | 'leak' | null;
};

export type WidgetState = {
  tanks: WidgetTank[];
  /** ms epoch of the last successful write, for "could not refresh" copy. */
  updatedAt: number;
};

const EMPTY: WidgetState = { tanks: [], updatedAt: 0 };

export function readWidgetState(): WidgetState {
  const raw = widgetStore.getString(KEY);
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as WidgetState;
    return Array.isArray(parsed?.tanks) ? parsed : EMPTY;
  } catch {
    // Corrupt blob: better an empty-state widget than a crashed render.
    return EMPTY;
  }
}

export function writeWidgetState(tanks: WidgetTank[]): void {
  const state: WidgetState = { tanks, updatedAt: Date.now() };
  widgetStore.set(KEY, JSON.stringify(state));
}

/**
 * Merges what a single push told us into the stored state.
 *
 * A push is a partial truth — it knows this tank's level and status, nothing
 * about the others — so it patches one entry and leaves the rest alone. An
 * unknown device is inserted, because the push may be the first thing this
 * install has heard about a tank paired elsewhere.
 */
export function mergeTank(patch: Partial<WidgetTank> & { deviceId: string }): void {
  const state = readWidgetState();
  const index = state.tanks.findIndex((tank) => tank.deviceId === patch.deviceId);

  const base: WidgetTank =
    index >= 0
      ? state.tanks[index]
      : {
          deviceId: patch.deviceId,
          name: patch.deviceId,
          levelPercent: null,
          volumeL: null,
          capacityL: null,
          asOf: null,
          stale: false,
          online: true,
          alert: null,
        };

  const merged = { ...base, ...patch };
  const tanks = index >= 0 ? state.tanks.map((tank, i) => (i === index ? merged : tank)) : [...state.tanks, merged];
  writeWidgetState(tanks);
}

/**
 * The tank a widget instance should show.
 *
 * Most households have exactly one tank, so an unconfigured widget showing the
 * only tank is right far more often than it is wrong. A widget bound to a
 * device that has since been removed falls back the same way rather than
 * rendering an error.
 */
export function pickTank(state: WidgetState, deviceId?: string): WidgetTank | null {
  if (deviceId) {
    const match = state.tanks.find((tank) => tank.deviceId === deviceId);
    if (match) return match;
  }
  return state.tanks[0] ?? null;
}
