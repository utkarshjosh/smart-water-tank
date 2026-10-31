import { localHourStart } from './local-time';

/**
 * Turns a run of tank readings into litres used and filled per local hour,
 * and a day's hours into a daily summary. Pure; rollup.service feeds it rows
 * and stores what comes back.
 */

export interface Reading {
  at: Date;
  litres: number;
  /** First usable reading after missing or invalid telemetry. */
  breakBefore?: boolean;
  /** The sensor became unreadable after this last usable sample. */
  breakAfter?: boolean;
}

/** Sampling continuity is independent of a tank being quiet between draws. */
export const DEFAULT_READING_GAP_MS = 15 * 60_000;
export const COMPLETE_HOUR_SECONDS = 54 * 60;

export function continuityGapMs(
  reportIntervalMs = 300_000,
  offlineThresholdMin?: number | null,
): number {
  const interval =
    Number.isFinite(reportIntervalMs) && reportIntervalMs > 0 ? reportIntervalMs : 300_000;
  const cadenceLimit = Math.max(5 * 60_000, Math.min(30 * 60_000, interval * 3));
  return offlineThresholdMin != null &&
    Number.isFinite(offlineThresholdMin) &&
    offlineThresholdMin > 0
    ? Math.min(cadenceLimit, offlineThresholdMin * 60_000)
    : cadenceLimit;
}

/** Preserve a break when null/invalid samples are removed. Never join an outage. */
export function prepareReadings(
  raw: Array<{ at: Date; litres: number | null; breakBefore?: boolean; breakAfter?: boolean }>,
  maxGapMs = DEFAULT_READING_GAP_MS,
): Reading[] {
  const out: Reading[] = [];
  let broken = false;
  for (const row of raw) {
    const last = out[out.length - 1];
    const at = row.at.getTime();
    if (
      !Number.isFinite(at) ||
      row.litres == null ||
      !Number.isFinite(row.litres) ||
      row.litres < 0
    ) {
      broken = true;
      if (last) out[out.length - 1] = { ...last, breakAfter: true };
      continue;
    }
    // Duplicate or out-of-order timestamps cannot establish a rate or movement.
    if (last && at <= last.at.getTime()) {
      broken = true;
      continue;
    }
    const gap = last && at - last.at.getTime() > maxGapMs;
    out.push({
      at: row.at,
      litres: row.litres,
      ...(broken || gap || row.breakBefore ? { breakBefore: true } : {}),
      ...(row.breakAfter ? { breakAfter: true } : {}),
    });
    broken = false;
  }
  return out;
}

export interface HourRollup {
  hourStart: Date;
  usedL: number;
  filledL: number;
  minL: number | null;
  maxL: number | null;
  avgL: number | null;
  readings: number;
  /** Time bounded by consecutive valid readings, excluding telemetry gaps. */
  observedSeconds: number;
}

/**
 * How far the level must move before it counts as water used or added. The
 * sensor jitters by a centimetre or so; counting every wobble as use would
 * add up to tens of phantom litres a day.
 */
export function noiseFloorL(capacityL: number | null): number {
  // 1.5% of the tank: about 1.5 cm on a 1 m tank, which is what an ultrasonic
  // sensor wobbles by from reading to reading. 0.5% counted that wobble as
  // use and fill.
  return capacityL == null ? 5 : Math.max(2, capacityL * 0.015);
}

/**
 * Removes readings that leave a steady level and come back to it.
 *
 * Near the top of the tank the ultrasonic sensor misreads: with the water in
 * or near its blind zone it reports 26-32 cm for a minute or four, then 20 cm
 * again. Taken at face value each blip books 50-115 L "used" and the same
 * again "filled" - on the live tank, 229 L used and 540 L added in one hour
 * when the only real event was a fill finishing.
 *
 * The signature is the return: water that was really drawn stays drawn until
 * a refill, and a refill isn't back at the exact old level within minutes.
 * So a departure from the steady level by more than the noise floor that
 * returns to within the noise floor inside `maxMs` is replaced by the steady
 * level. A departure that doesn't come back is real, and becomes the new
 * steady level. Filters that look only at how long a blip lasts (a median)
 * can't tell clustered blips from a real move; this one can.
 *
 * A longer departure is also a misreading when the way back is faster than
 * water moves. On the live tank on 31 Oct the sensor drifted from full to
 * 867 L over an hour while the tank was filling, then read 196 L higher 20 s
 * later and was full again within 3 minutes: 278 L "used" and 278 L "added".
 * Real fills there run at 15-50 L/min. That is a second pass, over readings
 * the first has already cleared of blips, so a blip inside a long departure
 * can't pass for its way back. See returnsTooFast.
 */
export function removeExcursions(
  readings: Reading[],
  noiseL: number,
  maxMs = 10 * 60 * 1000,
  opts: { maxRateLPerMin?: number; maxSlowMs?: number } = {},
): Reading[] {
  const maxRateLPerMin = opts.maxRateLPerMin ?? MAX_PLAUSIBLE_RATE_L_PER_MIN;
  const withoutBlips = flattenReturns(readings, noiseL, maxMs, () => true);
  return flattenReturns(withoutBlips, noiseL, opts.maxSlowMs ?? 3 * 60 * 60 * 1000, (out, i, k, level) =>
    returnsTooFast(out, i, k, level, noiseL, maxRateLPerMin),
  );
}

/**
 * Walks the readings against a steady level. A departure past the noise floor
 * that returns within `windowMs`, and that `accept` agrees was a misreading,
 * is replaced by the steady level; otherwise the departure is the new level.
 */
function flattenReturns(
  readings: Reading[],
  noiseL: number,
  windowMs: number,
  accept: (out: Reading[], i: number, k: number, level: number) => boolean,
): Reading[] {
  const out = readings.slice();
  let level: number | null = null;
  let i = 0;
  while (i < out.length) {
    if (level == null || out[i].breakBefore) level = out[i].litres;
    if (Math.abs(out[i].litres - level) <= noiseL) {
      i++;
      continue;
    }
    // Left the steady level: look for a return within windowMs.
    const leftAt = out[i].at.getTime();
    let k = i;
    while (
      k < out.length &&
      (k === i || !out[k].breakBefore) &&
      out[k].at.getTime() - leftAt <= windowMs &&
      Math.abs(out[k].litres - level) > noiseL
    )
      k++;
    if (
      k < out.length &&
      !out[k].breakBefore &&
      out[k].at.getTime() - leftAt <= windowMs &&
      accept(out, i, k, level)
    ) {
      for (let j = i; j < k; j++) out[j] = { ...out[j], litres: level };
      i = k;
    } else {
      level = out[i].litres;
      i++;
    }
  }
  return out;
}

/**
 * Fastest the level of a household tank really moves, in litres a minute.
 * The live tank fills at 15-50 L/min; misreadings snap back at 130-600 L/min.
 */
export const MAX_PLAUSIBLE_RATE_L_PER_MIN = 100;

/**
 * The sensor measures about once a minute and the device repeats the value in
 * between, so a step seen 20 s after the last reading took up to a minute.
 */
const MIN_STEP_MS = 60_000;
/** How long the level must stay back before the departure counts as a misreading. */
const HOLD_MS = 3 * 60_000;

/** Whether `litres` of movement in `ms` is more than any pump or tap moves. */
export function fasterThanWater(
  litres: number,
  ms: number,
  noiseL: number,
  maxRateLPerMin = MAX_PLAUSIBLE_RATE_L_PER_MIN,
): boolean {
  return litres > (maxRateLPerMin * Math.max(MIN_STEP_MS, ms)) / 60_000 + noiseL;
}

/**
 * Whether the departure out[i..k-1] came back to `level` mostly in steps no
 * pump or tap could make, and then stayed there.
 *
 * "Mostly" (fast steps cover at least half the way back from the furthest
 * point) keeps a real draw and refill whose fill happens to end in one sensor
 * blip. A departure that crosses to the other side of `level` is not one
 * misreading, and "stayed" keeps a real fill that blips back to where it
 * started.
 */
function returnsTooFast(
  out: Reading[],
  i: number,
  k: number,
  level: number,
  noiseL: number,
  maxRateLPerMin: number,
): boolean {
  const backAt = out[k].at.getTime();
  let j = k + 1;
  for (; j < out.length && out[j].at.getTime() - backAt < HOLD_MS; j++) {
    if (out[j].breakBefore || Math.abs(out[j].litres - level) > noiseL) return false;
  }
  if (j >= out.length || out[j].breakBefore) return false;

  const side = Math.sign(out[i].litres - level);
  const away = (j: number) => Math.abs(out[j].litres - level);
  let furthestAt = i;
  for (let j = i; j < k; j++) {
    if (Math.sign(out[j].litres - level) !== side && away(j) > noiseL) return false;
    if (away(j) > away(furthestAt)) furthestAt = j;
  }

  let fast = 0;
  for (let j = furthestAt + 1; j <= k; j++) {
    const step = Math.abs(out[j].litres - out[j - 1].litres);
    const ms = out[j].at.getTime() - out[j - 1].at.getTime();
    if (fasterThanWater(step, ms, noiseL, maxRateLPerMin)) fast += Math.max(0, away(j - 1) - away(j));
  }
  return fast >= away(furthestAt) / 2;
}

/**
 * Litres used and filled per local hour.
 *
 * Movement is measured against a reference level that only moves once the
 * reading has drifted past the noise floor. A per-reading threshold would be
 * wrong the other way: a slow draw of half a litre per reading never clears a
 * 2 L threshold and would vanish entirely. With a reference, those half-litres
 * add up and are counted once they pass the floor.
 *
 * `before` is the last reading before the window, so the first change in the
 * window is measured from where the tank actually was. Each change is booked
 * to the hour of the reading that revealed it. The first reading after a gap
 * establishes a new reference: neither the amount nor timing of movement
 * during the outage is known.
 */
export function rollupHours(
  readings: Reading[],
  before: Reading | null,
  timeZone: string,
  noiseL: number,
  opts: { maxGapMs?: number } = {},
): HourRollup[] {
  const maxGapMs = opts.maxGapMs ?? DEFAULT_READING_GAP_MS;
  const hours = new Map<number, HourRollup & { sumL: number }>();
  const getHour = (at: Date) => {
    const start = localHourStart(at, timeZone);
    let h = hours.get(start.getTime());
    if (!h) {
      h = {
        hourStart: start,
        usedL: 0,
        filledL: 0,
        minL: null,
        maxL: null,
        avgL: null,
        readings: 0,
        observedSeconds: 0,
        sumL: 0,
      };
      hours.set(start.getTime(), h);
    }
    return h;
  };
  let reference = before?.litres ?? null;
  let previous = before;
  for (const point of prepareReadings(readings, maxGapMs)) {
    const h = getHour(point.at);
    h.readings++;
    h.sumL += point.litres;
    h.minL = h.minL == null ? point.litres : Math.min(h.minL, point.litres);
    h.maxL = h.maxL == null ? point.litres : Math.max(h.maxL, point.litres);
    const gap = previous ? point.at.getTime() - previous.at.getTime() : 0;
    const continuous =
      previous != null && !previous.breakAfter && !point.breakBefore && gap > 0 && gap <= maxGapMs;
    if (!continuous) reference = point.litres;
    else {
      // Split observed time at local-hour boundaries, including midnight/DST.
      let cursor = previous!.at.getTime();
      while (cursor < point.at.getTime()) {
        const hour = getHour(new Date(cursor));
        const end = Math.min(point.at.getTime(), hour.hourStart.getTime() + 3_600_000);
        hour.observedSeconds += (end - cursor) / 1000;
        cursor = end;
      }
      if (reference != null && point.litres < reference - noiseL) {
        h.usedL += reference - point.litres;
        reference = point.litres;
      } else if (reference != null && point.litres > reference + noiseL) {
        h.filledL += point.litres - reference;
        reference = point.litres;
      }
    }
    previous = point;
  }
  return [...hours.values()]
    .sort((a, b) => a.hourStart.getTime() - b.hourStart.getTime())
    .map(({ sumL, ...h }) => ({
      ...h,
      observedSeconds: Math.min(3600, Math.floor(h.observedSeconds)),
      avgL: h.readings ? sumL / h.readings : null,
    }));
}

export interface DayRollup {
  usedL: number;
  filledL: number;
  minL: number | null;
  maxL: number | null;
  avgL: number | null;
  readings: number;
  refillEvents: number;
  leakSuspected: boolean;
}

/**
 * A day's summary from its hours and the number of fill episodes that started
 * that day (from detectEpisodes - a tank that fills from 6:40 to 7:20 is one
 * refill, not two).
 *
 * The leak rule is the one the nightly job always used: average draw across
 * the hours with readings above `leakLPerHour`, on a day with no refill.
 */
export function rollupDay(
  hours: HourRollup[],
  opts: { fillEvents: number; leakLPerHour: number },
): DayRollup {
  const withReadings = hours.filter((h) => h.readings > 0);
  const readings = withReadings.reduce((n, h) => n + h.readings, 0);
  const usedL = hours.reduce((sum, h) => sum + h.usedL, 0);
  const filledL = hours.reduce((sum, h) => sum + h.filledL, 0);
  const refillEvents = opts.fillEvents;

  const mins = withReadings.map((h) => h.minL!).filter((v) => v != null);
  const maxs = withReadings.map((h) => h.maxL!).filter((v) => v != null);
  const avgL = readings
    ? withReadings.reduce((sum, h) => sum + (h.avgL ?? 0) * h.readings, 0) / readings
    : null;

  const leakSuspected =
    hours.reduce((sum, h) => sum + h.observedSeconds, 0) >= 7200 &&
    refillEvents === 0 &&
    usedL / (hours.reduce((sum, h) => sum + h.observedSeconds, 0) / 3600) > opts.leakLPerHour;

  return {
    usedL,
    filledL,
    minL: mins.length ? Math.min(...mins) : null,
    maxL: maxs.length ? Math.max(...maxs) : null,
    avgL,
    readings,
    refillEvents,
    leakSuspected,
  };
}
