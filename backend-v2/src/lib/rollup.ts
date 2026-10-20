import { localHourStart } from './local-time';

/**
 * Turns a run of tank readings into litres used and filled per local hour,
 * and a day's hours into a daily summary. Pure; rollup.service feeds it rows
 * and stores what comes back.
 */

export interface Reading {
  at: Date;
  litres: number;
}

export interface HourRollup {
  hourStart: Date;
  usedL: number;
  filledL: number;
  minL: number | null;
  maxL: number | null;
  avgL: number | null;
  readings: number;
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
 */
export function removeExcursions(readings: Reading[], noiseL: number, maxMs = 10 * 60 * 1000): Reading[] {
  const out = readings.slice();
  let level: number | null = null;
  let i = 0;
  while (i < out.length) {
    if (level == null) level = out[i].litres;
    if (Math.abs(out[i].litres - level) <= noiseL) {
      i++;
      continue;
    }
    // Left the steady level: look for a return within maxMs.
    const leftAt = out[i].at.getTime();
    let k = i;
    while (k < out.length && out[k].at.getTime() - leftAt <= maxMs && Math.abs(out[k].litres - level) > noiseL) k++;
    if (k < out.length && out[k].at.getTime() - leftAt <= maxMs) {
      for (let j = i; j < k; j++) out[j] = { at: out[j].at, litres: level };
      i = k;
    } else {
      level = out[i].litres;
      i++;
    }
  }
  return out;
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
 * to the hour of the reading that revealed it - after a gap with no readings,
 * the water was used somewhere in the gap, and the hour the device came back
 * is the best we can say.
 */
export function rollupHours(
  readings: Reading[],
  before: Reading | null,
  timeZone: string,
  noiseL: number
): HourRollup[] {
  const hours = new Map<number, HourRollup & { sumL: number }>();
  let reference = before?.litres ?? null;

  for (const r of readings) {
    const start = localHourStart(r.at, timeZone);
    let hour = hours.get(start.getTime());
    if (!hour) {
      hour = { hourStart: start, usedL: 0, filledL: 0, minL: null, maxL: null, avgL: null, readings: 0, sumL: 0 };
      hours.set(start.getTime(), hour);
    }

    hour.readings += 1;
    hour.sumL += r.litres;
    hour.minL = hour.minL == null ? r.litres : Math.min(hour.minL, r.litres);
    hour.maxL = hour.maxL == null ? r.litres : Math.max(hour.maxL, r.litres);

    if (reference == null) {
      reference = r.litres;
    } else if (r.litres < reference - noiseL) {
      hour.usedL += reference - r.litres;
      reference = r.litres;
    } else if (r.litres > reference + noiseL) {
      hour.filledL += r.litres - reference;
      reference = r.litres;
    }
  }

  return [...hours.values()]
    .sort((a, b) => a.hourStart.getTime() - b.hourStart.getTime())
    .map(({ sumL, ...hour }) => ({ ...hour, avgL: hour.readings ? sumL / hour.readings : null }));
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
export function rollupDay(hours: HourRollup[], opts: { fillEvents: number; leakLPerHour: number }): DayRollup {
  const withReadings = hours.filter((h) => h.readings > 0);
  const readings = withReadings.reduce((n, h) => n + h.readings, 0);
  const usedL = hours.reduce((sum, h) => sum + h.usedL, 0);
  const filledL = hours.reduce((sum, h) => sum + h.filledL, 0);
  const refillEvents = opts.fillEvents;

  const mins = withReadings.map((h) => h.minL!).filter((v) => v != null);
  const maxs = withReadings.map((h) => h.maxL!).filter((v) => v != null);
  const avgL = readings ? withReadings.reduce((sum, h) => sum + (h.avgL ?? 0) * h.readings, 0) / readings : null;

  const leakSuspected =
    withReadings.length >= 2 && refillEvents === 0 && usedL / withReadings.length > opts.leakLPerHour;

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
