import { Device, TankProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';
import { bumpConfigVersion } from '../lib/config-version';
import { pushConfigToDevice } from '../gateway/registry';
import { LevelGeometry, levelModel, levelPercent, waterDepthCm } from '../lib/tank-level';

export interface TankProfileInput {
  shape: 'cylindrical' | 'cuboidal';
  parallel_unit_count?: number;
  height_cm: number;
  diameter_cm?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  nominal_unit_volume_l?: number | null;
  sensor_offset_cm?: number;
  dead_zone_cm?: number;
  /** Omitted keeps the stored value; null clears it. */
  full_distance_cm?: number | null;
}

/** Everything the level and volume maths needs, as plain numbers. */
export interface TankGeometry extends LevelGeometry {
  shape: string;
  parallelUnitCount: number;
  diameterCm?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  nominalUnitVolumeL?: number | null;
}

export function computeUnitCapacityL(profile: {
  shape: string;
  heightCm: number;
  diameterCm?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  nominalUnitVolumeL?: number | null;
}): number {
  if (profile.nominalUnitVolumeL != null) return profile.nominalUnitVolumeL;

  if (profile.shape === 'cylindrical') {
    const radiusCm = (profile.diameterCm ?? 0) / 2;
    return (Math.PI * radiusCm * radiusCm * profile.heightCm) / 1000;
  }

  return ((profile.lengthCm ?? 0) * (profile.widthCm ?? 0) * profile.heightCm) / 1000;
}

export function computeTotalCapacityL(profile: {
  shape: string;
  parallelUnitCount: number;
  heightCm: number;
  diameterCm?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  nominalUnitVolumeL?: number | null;
}): number {
  return computeUnitCapacityL(profile) * profile.parallelUnitCount;
}

/** Plain-number geometry from a stored profile row. */
export function geometryOf(profile: TankProfile): TankGeometry {
  return {
    shape: profile.shape,
    parallelUnitCount: profile.parallelUnitCount,
    heightCm: profile.heightCm.toNumber(),
    diameterCm: profile.diameterCm?.toNumber() ?? null,
    lengthCm: profile.lengthCm?.toNumber() ?? null,
    widthCm: profile.widthCm?.toNumber() ?? null,
    nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
    sensorOffsetCm: profile.sensorOffsetCm.toNumber(),
    deadZoneCm: profile.deadZoneCm.toNumber(),
    fullDistanceCm: profile.fullDistanceCm?.toNumber() ?? null,
  };
}

/** Litres held in one centimetre of depth, across all the joined tanks. */
export function litresPerCm(g: TankGeometry): number {
  return g.heightCm > 0 ? computeTotalCapacityL(g) / g.heightCm : 0;
}

/**
 * Litres in the tank at 100%: the water between the empty and full lines.
 * Less than the brim-full figure from computeTotalCapacityL whenever the tank
 * stops filling below its top, which is every tank with a float valve.
 */
export function computeUsableCapacityL(g: TankGeometry): number {
  return Math.max(0, levelModel(g).spanCm) * litresPerCm(g);
}

/** The capacity everything is measured against: litres at 100%. */
export function capacityOf(profile: TankProfile | null): number | null {
  if (!profile) return null;
  return computeUsableCapacityL(geometryOf(profile));
}

// levelCm is the raw ultrasonic distance from the sensor face down to the
// water. The rules for turning it into a level live in lib/tank-level.
export function computeLevelPercent(levelCm: number | null, profile: LevelGeometry): number | null {
  return levelPercent(levelCm, profile);
}

// Server-side canonical volume: the measured depth of water times the tank's
// real cross-section. At 100% it equals computeUsableCapacityL, so litres and
// percent on the dashboard can never disagree. Null when the level is
// unreadable (never 0).
export function computeVolumeL(profile: TankGeometry, levelCm: number | null): number | null {
  if (levelCm == null) return null;
  return waterDepthCm(levelCm, profile) * litresPerCm(profile);
}

// Read-time volume derivation: recompute liters from a raw TankProfile row +
// a measured levelCm, mirroring how level_percent is resolved at read time.
// Returns null when there is no profile (caller falls back to the stored
// snapshot) or when the level is unreadable (never 0).
export function volumeLForProfile(profile: TankProfile | null, levelCm: number | null): number | null {
  if (!profile) return null;
  return computeVolumeL(geometryOf(profile), levelCm);
}

export function toTankProfileDto(profile: TankProfile) {
  const g = geometryOf(profile);
  const usableL = computeUsableCapacityL(g);

  return {
    shape: profile.shape,
    parallel_unit_count: profile.parallelUnitCount,
    height_cm: g.heightCm,
    diameter_cm: g.diameterCm ?? null,
    length_cm: g.lengthCm ?? null,
    width_cm: g.widthCm ?? null,
    nominal_unit_volume_l: g.nominalUnitVolumeL ?? null,
    sensor_offset_cm: g.sensorOffsetCm,
    dead_zone_cm: g.deadZoneCm,
    full_distance_cm: g.fullDistanceCm ?? null,
    // Litres at 100%, so "X L of Y L" on a screen adds up. These two fields
    // used to be the brim-full figure, which the readings could never reach.
    unit_capacity_l: usableL / profile.parallelUnitCount,
    total_capacity_l: usableL,
    /** Filled to the brim, from the dimensions alone. */
    nameplate_capacity_l: computeTotalCapacityL(g),
  };
}

export async function getTankProfile(device: Device): Promise<ReturnType<typeof toTankProfileDto> | null> {
  const profile = await prisma.tankProfile.findUnique({ where: { deviceId: device.id } });
  return profile ? toTankProfileDto(profile) : null;
}

/**
 * Return a device to "no profile" (#9). A wrongly entered profile could be
 * corrected but never removed, and "no profile" is a distinct state: level
 * becomes null and volume falls back to the stored snapshot rather than being
 * derived. Bumps config_version like the upsert path, so the device drops its
 * geometry block on the next check-in.
 */
export async function deleteTankProfile(device: Device): Promise<void> {
  const profile = await prisma.tankProfile.findUnique({ where: { deviceId: device.id } });
  if (!profile) throw new HttpError(404, 'This device has no tank profile');

  await prisma.tankProfile.delete({ where: { deviceId: device.id } });
  await bumpConfigVersion(device.id);
  void pushConfigToDevice(device.id);
}

export async function getTankProfileRaw(deviceId: string): Promise<TankProfile | null> {
  return prisma.tankProfile.findUnique({ where: { deviceId } });
}

function validateShapeFields(input: TankProfileInput): void {
  const hasNominal = input.nominal_unit_volume_l != null;

  if (input.shape === 'cylindrical') {
    if (!hasNominal && input.diameter_cm == null) {
      throw new HttpError(400, 'diameter_cm or nominal_unit_volume_l is required for a cylindrical tank');
    }
  } else {
    if (!hasNominal && (input.length_cm == null || input.width_cm == null)) {
      throw new HttpError(400, 'length_cm and width_cm (or nominal_unit_volume_l) are required for a cuboidal tank');
    }
  }
}

/** Rejects a setup the sensor could not measure anything in. */
function validateLevels(input: TankProfileInput, fullDistanceCm: number | null): void {
  const model = levelModel({
    heightCm: input.height_cm,
    sensorOffsetCm: input.sensor_offset_cm ?? 0,
    deadZoneCm: input.dead_zone_cm ?? 25,
    fullDistanceCm,
  });
  if (model.emptyCm <= 0) {
    throw new HttpError(400, 'sensor_offset_cm puts the sensor below the bottom of the tank');
  }
  if (model.fullCm >= model.emptyCm) {
    throw new HttpError(400, 'full_distance_cm must be less than the distance to the bottom of the tank');
  }
  if (model.blindCm >= model.emptyCm) {
    throw new HttpError(400, 'The whole tank is closer to the sensor than dead_zone_cm, so nothing can be measured');
  }
}

export async function upsertTankProfile(device: Device, input: TankProfileInput) {
  validateShapeFields(input);

  // A client that does not know about the full line must not wipe it.
  const existing =
    input.full_distance_cm === undefined
      ? await prisma.tankProfile.findUnique({ where: { deviceId: device.id }, select: { fullDistanceCm: true } })
      : null;
  const fullDistanceCm =
    input.full_distance_cm === undefined ? (existing?.fullDistanceCm?.toNumber() ?? null) : input.full_distance_cm;
  validateLevels(input, fullDistanceCm);

  const data = {
    shape: input.shape,
    parallelUnitCount: input.parallel_unit_count ?? 1,
    heightCm: input.height_cm,
    diameterCm: input.diameter_cm ?? null,
    lengthCm: input.length_cm ?? null,
    widthCm: input.width_cm ?? null,
    nominalUnitVolumeL: input.nominal_unit_volume_l ?? null,
    sensorOffsetCm: input.sensor_offset_cm ?? 0,
    deadZoneCm: input.dead_zone_cm ?? 25,
    fullDistanceCm,
  };

  const profile = await prisma.tankProfile.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, ...data },
    update: data,
  });

  // Geometry changed -> device is now stale on its next check-in.
  await bumpConfigVersion(device.id);

  // Fire-and-forget MQTT push so a live/subscribed device gets the new geometry
  // immediately. pushConfigToDevice never throws (a down broker is swallowed +
  // logged), so a broker outage can never break this HTTP response.
  void pushConfigToDevice(device.id);

  return toTankProfileDto(profile);
}
