import type { TankProfile } from '@/api/schemas';

/**
 * The tank setup form, kept as the text the user typed, and what that text
 * means once it is read as numbers.
 *
 * The level rules mirror backend-v2/src/lib/tank-level.ts: the sensor reads
 * `empty` at the bottom of the tank, `full` where the water stops rising, and
 * nothing nearer than its own minimum distance. The server is still the
 * authority; this only lets the screen show the capacity and warn about a bad
 * sensor position before anything is saved.
 */
export type TankForm = {
  shape: 'cylindrical' | 'cuboidal';
  units: number;
  heightCm: string;
  diameterCm: string;
  lengthCm: string;
  widthCm: string;
  /** Height of the sensor face above the tank top. Negative = inside the tank. */
  sensorOffsetCm: string;
  /** Blank = not measured. */
  fullDistanceCm: string;
  deadZoneCm: string;
};

export const MAX_UNITS = 6;
const DEFAULT_DEAD_ZONE_CM = 25;

const text = (value: number | null | undefined) => (value == null ? '' : String(value));

export function formFromProfile(profile: TankProfile | null): TankForm {
  return {
    shape: profile?.shape ?? 'cylindrical',
    units: profile?.parallel_unit_count ?? 1,
    heightCm: text(profile?.height_cm),
    diameterCm: text(profile?.diameter_cm),
    lengthCm: text(profile?.length_cm),
    widthCm: text(profile?.width_cm),
    sensorOffsetCm: text(profile?.sensor_offset_cm ?? 0),
    fullDistanceCm: text(profile?.full_distance_cm),
    deadZoneCm: text(profile?.dead_zone_cm ?? DEFAULT_DEAD_ZONE_CM),
  };
}

/** Blank is 0 for a number that has a natural zero; anything unreadable is NaN. */
function number(value: string, blank = Number.NaN): number {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return blank;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export type TankPayload = {
  shape: TankForm['shape'];
  parallel_unit_count: number;
  height_cm: number;
  diameter_cm: number | null;
  length_cm: number | null;
  width_cm: number | null;
  nominal_unit_volume_l: null;
  sensor_offset_cm: number;
  dead_zone_cm: number;
  full_distance_cm: number | null;
};

export type TankEvaluation = {
  /** Ready to send, or null while the form is incomplete or wrong. */
  payload: TankPayload | null;
  /** Litres at 100%, the figure the app calls capacity. Null until the size is in. */
  capacityL: number | null;
  /** Litres filled to the brim. */
  brimL: number | null;
  /** How many cm the sensor must rise for the full line to be measurable. */
  shortfallCm: number | null;
  /** Why the form cannot be saved, in the user's terms. Null while it is merely incomplete. */
  problem: string | null;
};

export function evaluateTank(form: TankForm): TankEvaluation {
  const height = number(form.heightCm);
  const diameter = number(form.diameterCm);
  const length = number(form.lengthCm);
  const width = number(form.widthCm);
  const offset = number(form.sensorOffsetCm, 0);
  const deadZone = number(form.deadZoneCm, 0);
  const fullDistance = form.fullDistanceCm.trim() === '' ? null : number(form.fullDistanceCm);

  const sized =
    height > 0 && (form.shape === 'cylindrical' ? diameter > 0 : length > 0 && width > 0);
  const none = { payload: null, capacityL: null, brimL: null, shortfallCm: null };
  if (!sized) return { ...none, problem: null };

  const unitL =
    form.shape === 'cylindrical'
      ? (Math.PI * (diameter / 2) ** 2 * height) / 1000
      : (length * width * height) / 1000;
  const brimL = unitL * form.units;

  if (Number.isNaN(offset) || Number.isNaN(deadZone) || (fullDistance !== null && Number.isNaN(fullDistance))) {
    return { ...none, brimL, problem: 'One of the sensor distances is not a number.' };
  }
  if (deadZone < 0 || (fullDistance !== null && fullDistance < 0)) {
    return { ...none, brimL, problem: 'Sensor distances cannot be negative, apart from the height above the tank top.' };
  }

  const emptyCm = height + offset;
  const fullCm = fullDistance ?? Math.max(offset, deadZone);
  if (emptyCm <= Math.max(fullCm, deadZone)) {
    return {
      ...none,
      brimL,
      problem: 'With these numbers the sensor cannot see any of the tank. Check the height and the sensor distances.',
    };
  }

  return {
    payload: {
      shape: form.shape,
      parallel_unit_count: form.units,
      height_cm: height,
      diameter_cm: form.shape === 'cylindrical' ? diameter : null,
      length_cm: form.shape === 'cuboidal' ? length : null,
      width_cm: form.shape === 'cuboidal' ? width : null,
      nominal_unit_volume_l: null,
      sensor_offset_cm: offset,
      dead_zone_cm: deadZone,
      full_distance_cm: fullDistance,
    },
    capacityL: (emptyCm - fullCm) * (brimL / height),
    brimL,
    shortfallCm: fullDistance !== null && fullDistance < deadZone ? deadZone - fullDistance : null,
    problem: null,
  };
}

/** "5 cm above the tank top · full at 14 cm" — the collapsed sensor section in one line. */
export function describeSensor(form: TankForm): string {
  const offset = number(form.sensorOffsetCm, 0);
  const position = Number.isNaN(offset)
    ? 'Position not set'
    : offset === 0
      ? 'Level with the tank top'
      : offset > 0
        ? `${offset} cm above the tank top`
        : `${-offset} cm inside the tank`;
  const full = form.fullDistanceCm.trim();
  return `${position} · ${full === '' ? 'full level not measured' : `full at ${full} cm`}`;
}
