import { Device, TankProfile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/http-error';

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

// levelCm is the raw ultrasonic distance `d` from the sensor face down to the
// water surface - shape-independent. The calibration is derived from the tank
// profile alone (not firmware's compile-time constants):
//   levelEmptyCm     = sensorOffset + height   (reading when the tank is empty)
//   levelFullEffCm   = max(sensorOffset, deadZone)  (closest we can measure -
//                      the sensor is blind inside its dead zone)
//   measurableSpanCm = levelEmptyCm - levelFullEffCm
// Clamp-to-full model: once the surface enters the top dead-zone band
// (d <= deadZone) the reading pins to 100% / nameplate-full; d >= levelEmpty
// gives 0%.
export function computeLevelPercent(
  levelCm: number | null,
  profile: { heightCm: number; sensorOffsetCm: number; deadZoneCm: number }
): number | null {
  // No reading this cycle (sensor disconnected/no echo) - unknown, not 0%.
  if (levelCm == null) return null;

  const levelEmptyCm = profile.sensorOffsetCm + profile.heightCm;
  const levelFullEffCm = Math.max(profile.sensorOffsetCm, profile.deadZoneCm);
  const measurableSpanCm = levelEmptyCm - levelFullEffCm;
  if (measurableSpanCm <= 0) return 0;

  const clampedD = Math.min(levelEmptyCm, Math.max(levelFullEffCm, levelCm));
  const percent = (100 * (levelEmptyCm - clampedD)) / measurableSpanCm;
  return Math.min(100, Math.max(0, percent));
}

// Server-side canonical volume: percentage of measured fill applied to the
// nameplate capacity (area * height). Self-consistent with computeLevelPercent
// so the dashboard's liters and percent can never disagree. Returns null when
// the level is unreadable (never 0), mirroring computeLevelPercent.
export function computeVolumeL(
  profile: {
    shape: string;
    parallelUnitCount: number;
    heightCm: number;
    diameterCm?: number | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    nominalUnitVolumeL?: number | null;
    sensorOffsetCm: number;
    deadZoneCm: number;
  },
  levelCm: number | null
): number | null {
  const percent = computeLevelPercent(levelCm, profile);
  if (percent == null) return null;
  return (percent / 100) * computeTotalCapacityL(profile);
}

export function toTankProfileDto(profile: TankProfile) {
  const plain = {
    shape: profile.shape,
    parallelUnitCount: profile.parallelUnitCount,
    heightCm: profile.heightCm.toNumber(),
    diameterCm: profile.diameterCm?.toNumber() ?? null,
    lengthCm: profile.lengthCm?.toNumber() ?? null,
    widthCm: profile.widthCm?.toNumber() ?? null,
    nominalUnitVolumeL: profile.nominalUnitVolumeL?.toNumber() ?? null,
  };

  return {
    shape: profile.shape,
    parallel_unit_count: profile.parallelUnitCount,
    height_cm: plain.heightCm,
    diameter_cm: plain.diameterCm,
    length_cm: plain.lengthCm,
    width_cm: plain.widthCm,
    nominal_unit_volume_l: plain.nominalUnitVolumeL,
    sensor_offset_cm: profile.sensorOffsetCm.toNumber(),
    dead_zone_cm: profile.deadZoneCm.toNumber(),
    unit_capacity_l: computeUnitCapacityL(plain),
    total_capacity_l: computeTotalCapacityL({ ...plain, parallelUnitCount: profile.parallelUnitCount }),
  };
}

export async function getTankProfile(device: Device): Promise<ReturnType<typeof toTankProfileDto> | null> {
  const profile = await prisma.tankProfile.findUnique({ where: { deviceId: device.id } });
  return profile ? toTankProfileDto(profile) : null;
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

export async function upsertTankProfile(device: Device, input: TankProfileInput) {
  validateShapeFields(input);

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
  };

  const profile = await prisma.tankProfile.upsert({
    where: { deviceId: device.id },
    create: { deviceId: device.id, ...data },
    update: data,
  });

  return toTankProfileDto(profile);
}
