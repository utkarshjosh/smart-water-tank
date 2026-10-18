import type { Reading } from './rollup';

/**
 * Finds fill and draw episodes in a run of readings: stretches where the level
 * moves one way, steadily, with no long pause. "Filled 480 L from 06:10 to
 * 06:42" and "used 60 L around 07:00" are what a person can act on; hourly
 * totals alone can't say either.
 *
 * Movement uses the same reference-level rule as the hourly rollup, so jitter
 * inside the noise floor neither starts nor breaks an episode, and the litres
 * here agree with the litres there. An episode ends when the level turns the
 * other way, or when it stops moving for longer than `maxGapMs`.
 *
 * Pure; rollup.service feeds it rows and stores what comes back.
 */

export type EpisodeKind = 'fill' | 'draw';

export interface Episode {
  kind: EpisodeKind;
  startedAt: Date;
  endedAt: Date;
  startL: number;
  endL: number;
  /** Litres moved, always positive. */
  volumeL: number;
  rateLPerMin: number;
  readings: number;
  /** The newest reading was part of it, and it may still be going. */
  ongoing: boolean;
}

export interface EpisodeOptions {
  noiseL: number;
  /** A pause longer than this ends the episode. */
  maxGapMs: number;
  /** Smaller episodes are dropped: a 3 L draw is a glass of water, not an event. */
  minDrawL: number;
  minFillL: number;
}

/** Thresholds scaled to the tank, like the noise floor. */
export function episodeOptions(capacityL: number | null, noiseL: number): EpisodeOptions {
  return {
    noiseL,
    maxGapMs: 30 * 60 * 1000,
    minDrawL: Math.max(5, (capacityL ?? 0) * 0.01),
    minFillL: Math.max(20, (capacityL ?? 0) * 0.03),
  };
}

interface Open {
  kind: EpisodeKind;
  startedAt: Date;
  startL: number;
  endL: number;
  endedAt: Date;
  firstIndex: number;
  lastIndex: number;
}

export function detectEpisodes(
  readings: Reading[],
  before: Reading | null,
  opts: EpisodeOptions,
  now: Date = new Date()
): Episode[] {
  const closed: Open[] = [];
  let open = null as Open | null;
  let reference = before?.litres ?? null;
  let previous: Reading | null = before;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    if (open && r.at.getTime() - open.endedAt.getTime() > opts.maxGapMs) {
      closed.push(open);
      open = null;
    }

    let kind: EpisodeKind | null = null;
    if (reference != null && r.litres < reference - opts.noiseL) kind = 'draw';
    else if (reference != null && r.litres > reference + opts.noiseL) kind = 'fill';

    if (kind) {
      if (open && open.kind !== kind) {
        closed.push(open);
        open = null;
      }
      if (!open) {
        // It started after the last reading that was still at the old level.
        open = {
          kind,
          startedAt: previous?.at ?? r.at,
          startL: reference!,
          endL: r.litres,
          endedAt: r.at,
          firstIndex: previous === before ? i : i - 1,
          lastIndex: i,
        };
      }
      open.endL = r.litres;
      open.endedAt = r.at;
      open.lastIndex = i;
      reference = r.litres;
    } else if (reference == null) {
      reference = r.litres;
    }
    previous = r;
  }
  const stillOpen: Open | null = open;
  if (stillOpen) closed.push(stillOpen);

  return closed
    .map((e): Episode => {
      const volumeL = Math.abs(e.endL - e.startL);
      const minutes = Math.max(1, (e.endedAt.getTime() - e.startedAt.getTime()) / 60_000);
      return {
        kind: e.kind,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        startL: e.startL,
        endL: e.endL,
        volumeL,
        rateLPerMin: volumeL / minutes,
        readings: e.lastIndex - e.firstIndex + 1,
        ongoing: e === stillOpen && now.getTime() - e.endedAt.getTime() <= opts.maxGapMs,
      };
    })
    .filter((e) => e.volumeL >= (e.kind === 'draw' ? opts.minDrawL : opts.minFillL));
}
