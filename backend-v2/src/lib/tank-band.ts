/**
 * Which band a tank is in - low, normal or full - given the band it was in.
 *
 * Alerts fire on a change of band, not on every reading past a threshold, so
 * a tank that sits full sends one "Tank full" and nothing more. Leaving a band
 * takes moving back past a margin (the re-arm line): a full tank is still
 * full at 89% against a 90% threshold, and only counts as normal again below
 * 80%. Without the margin, a level wobbling around 90% - ripples, the sensor's
 * own noise - would alert on every wobble.
 *
 * Pure, so the rules are covered by tests without a database.
 */

export type TankBand = 'low' | 'normal' | 'full';

/** Re-arm margin for percentage thresholds, in percentage points. */
export const REARM_MARGIN_PCT = 10;
/** Re-arm margin for the battery threshold, in volts. */
export const REARM_MARGIN_V = 0.1;

export interface BandInput {
  /** Current reading, in the same unit as the thresholds. */
  value: number;
  /** null = this rule is off and the band is unreachable. */
  fullAt: number | null;
  lowAt: number | null;
  /** How far back past a threshold the reading must go to leave its band. */
  margin: number;
  /**
   * The water is inside the sensor's blind zone - too close for it to measure.
   * That only happens when the tank is at or past the top, so it reads as full
   * whatever number came back.
   */
  inBlindZone?: boolean;
}

export function nextBand(previous: TankBand | null, input: BandInput): TankBand {
  const { value, fullAt, lowAt, margin, inBlindZone } = input;

  if (inBlindZone && fullAt != null) return 'full';

  // Stay in the current band until the reading clears the re-arm line.
  if (previous === 'full' && fullAt != null && value > fullAt - margin) return 'full';
  if (previous === 'low' && lowAt != null && value < lowAt + margin) return 'low';

  if (fullAt != null && value >= fullAt) return 'full';
  if (lowAt != null && value <= lowAt) return 'low';
  return 'normal';
}

/**
 * Whether the water is inside the blind zone. levelCm is the sensor's
 * distance to the water; the blind zone is anything nearer than the dead-zone
 * edge (or the sensor offset, if that is larger - the same edge
 * computeLevelPercent treats as 100%).
 */
export function isInBlindZone(
  levelCm: number,
  profile: { sensorOffsetCm: number; deadZoneCm: number }
): boolean {
  return levelCm < Math.max(profile.sensorOffsetCm, profile.deadZoneCm);
}

/** The alert to send for a band change, if any. Entering a band alerts; leaving one never does. */
export function alertForTransition(
  previous: TankBand | null,
  next: TankBand
): 'tank_full' | 'tank_low' | null {
  // No previous state: this reading only seeds the tracker. Otherwise every
  // device would alert once on the first reading after deploy.
  if (previous == null || previous === next) return null;
  if (next === 'full') return 'tank_full';
  if (next === 'low') return 'tank_low';
  return null;
}
