/**
 * How a sensor reading turns into water in the tank.
 *
 * levelCm everywhere is the distance from the sensor face down to the water,
 * so a smaller number means more water. Three distances describe an install:
 *
 *   emptyCm  the reading when the tank is empty: the tank's height plus how
 *            far the sensor sits above the top of the tank. The offset is
 *            negative when the sensor hangs inside the tank.
 *   fullCm   the reading when the tank is full, where the water stops rising.
 *            100% is here.
 *   blindCm  the nearest the sensor can measure. Water closer than this comes
 *            back as blindCm, or as a wrong number.
 *
 * "Where full is" and "where the sensor goes blind" are separate facts. They
 * used to be one number: full was taken to be the blind-zone edge, and the
 * whole nameplate capacity was spread over what was left, so every centimetre
 * counted for more litres than the tank holds in a centimetre (16.4 instead
 * of 12.7 on the first tank in the field, which overstated all usage by 29%).
 *
 * Pure, so the rules are covered by tests without a database.
 */

export interface LevelGeometry {
  heightCm: number;
  sensorOffsetCm: number;
  deadZoneCm: number;
  /**
   * Measured distance to the water when the tank is full. Unknown (null) on
   * installs set up before this was asked; full is then assumed to be the
   * nearest the sensor can see, which keeps their percentages as they were.
   */
  fullDistanceCm?: number | null;
}

export interface LevelModel {
  emptyCm: number;
  fullCm: number;
  blindCm: number;
  /** The nearest reading that counts: the full line, or the blind-zone edge if that is further. */
  topCm: number;
  /** Depth of water between empty and full. Zero or less means nothing is measurable. */
  spanCm: number;
}

export function levelModel(g: LevelGeometry): LevelModel {
  const emptyCm = g.sensorOffsetCm + g.heightCm;
  const blindCm = g.deadZoneCm;
  const fullCm = g.fullDistanceCm ?? Math.max(g.sensorOffsetCm, g.deadZoneCm);
  return { emptyCm, fullCm, blindCm, topCm: Math.max(fullCm, blindCm), spanCm: emptyCm - fullCm };
}

/**
 * Depth of water the reading proves is there, in cm above the tank bottom.
 * A reading nearer than the top line is held at the top line: the water may
 * be higher, but the sensor cannot say by how much.
 */
export function waterDepthCm(levelCm: number, g: LevelGeometry): number {
  const m = levelModel(g);
  if (m.spanCm <= 0 || m.topCm >= m.emptyCm) return 0;
  return m.emptyCm - Math.min(m.emptyCm, Math.max(m.topCm, levelCm));
}

/** Null when the sensor could not be read - unknown, never 0%. */
export function levelPercent(levelCm: number | null, g: LevelGeometry): number | null {
  if (levelCm == null) return null;
  const { spanCm } = levelModel(g);
  if (spanCm <= 0) return 0;
  return Math.min(100, Math.max(0, (100 * waterDepthCm(levelCm, g)) / spanCm));
}

/**
 * Whether the water is too close for the sensor to measure. The level shown
 * for such a reading is the least it can be, not a measurement.
 *
 * The edge itself counts: a sensor never reports nearer than its own minimum,
 * so a reading equal to it is how "closer than I can see" arrives.
 */
export function isTooClose(levelCm: number, g: LevelGeometry): boolean {
  return levelCm <= levelModel(g).blindCm;
}

/**
 * Whether the tank fills to a point the sensor cannot see, so the top of
 * every fill goes unmeasured. The cure is physical: raise the sensor or lower
 * the full line by at least the returned number of cm. Null when the full
 * line is unknown or already clear of the blind zone.
 */
export function fullLineShortfallCm(g: LevelGeometry): number | null {
  if (g.fullDistanceCm == null) return null;
  const shortfall = g.deadZoneCm - g.fullDistanceCm;
  return shortfall > 0 ? shortfall : null;
}
