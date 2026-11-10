import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLevelPercent,
  computeUsableCapacityL,
  computeVolumeL,
  toTankProfileDto,
  volumeLForProfile,
} from '../services/tank-profile.service';

// User's real tank: sensor flush at the full line (s=0), 90 cm column (H=90),
// 20 cm ultrasonic dead zone (z=20) => levelEmpty=90, levelFullEff=20, span=70.
const cal = { heightCm: 90, sensorOffsetCm: 0, deadZoneCm: 20 };

test('computeLevelPercent: empty tank (d = levelEmpty) reads 0%', () => {
  assert.equal(computeLevelPercent(90, cal), 0);
});

test('computeLevelPercent: below empty (d > levelEmpty) clamps to 0%', () => {
  assert.equal(computeLevelPercent(120, cal), 0);
});

test('computeLevelPercent: mid value maps linearly across the span', () => {
  // (90 - 50) / 70 * 100 = 57.142857...
  assert.ok(Math.abs(computeLevelPercent(50, cal)! - 57.142857) < 1e-4);
});

test('computeLevelPercent: at the dead zone (d = z) reads 100%', () => {
  assert.equal(computeLevelPercent(20, cal), 100);
});

test('computeLevelPercent: inside the dead zone (d < z) clamps to 100%', () => {
  assert.equal(computeLevelPercent(10, cal), 100);
});

test('computeLevelPercent: null level (sensor unreadable) stays null, never 0', () => {
  assert.equal(computeLevelPercent(null, cal), null);
});

test('computeLevelPercent: non-positive measurable span yields 0%', () => {
  // deadZone deeper than the whole column => nothing measurable.
  assert.equal(computeLevelPercent(5, { heightCm: 10, sensorOffsetCm: 0, deadZoneCm: 20 }), 0);
});

// 100 x 100 x 90 cm cuboid: 10 L in every cm of depth, 900 L to the brim.
// The sensor sees from 20 cm, so 70 cm of it - 700 L - is what counts as full.
const volProfile = {
  shape: 'cuboidal',
  parallelUnitCount: 1,
  heightCm: 90,
  lengthCm: 100,
  widthCm: 100,
  sensorOffsetCm: 0,
  deadZoneCm: 20,
};

test('computeVolumeL: empty (d = levelEmpty) is 0 L', () => {
  assert.equal(computeVolumeL(volProfile, 90), 0);
});

test('computeVolumeL: a reading at or inside the dead zone holds at the litres the sensor can prove', () => {
  assert.equal(computeVolumeL(volProfile, 20), 700);
  assert.equal(computeVolumeL(volProfile, 5), 700);
});

test('computeVolumeL: each cm of level is the litres the tank really holds in a cm', () => {
  assert.equal(computeVolumeL(volProfile, 50), 400);
  assert.equal(computeVolumeL(volProfile, 50)! - computeVolumeL(volProfile, 51)!, 10);
});

test('computeVolumeL: null level stays null, never 0', () => {
  assert.equal(computeVolumeL(volProfile, null), null);
});

test('computeVolumeL: honours parallel unit count', () => {
  assert.equal(computeVolumeL({ ...volProfile, parallelUnitCount: 2 }, 20), 1400);
});

test('computeVolumeL: litres at 100% equal the usable capacity, so percent and litres agree', () => {
  for (const profile of [volProfile, { ...volProfile, fullDistanceCm: 30 }, { ...volProfile, sensorOffsetCm: -5 }]) {
    const capacity = computeUsableCapacityL(profile);
    for (const d of [10, 20, 33, 60, 85, 100]) {
      const fromPercent = (computeLevelPercent(d, profile)! / 100) * capacity;
      assert.ok(Math.abs(computeVolumeL(profile, d)! - fromPercent) < 1e-9);
    }
  }
});

// The first tank in the field: two 90 x 90 cm cylinders joined at the bottom.
const fieldTank = {
  shape: 'cylindrical',
  parallelUnitCount: 2,
  heightCm: 90,
  diameterCm: 90,
  sensorOffsetCm: 5,
  deadZoneCm: 25,
};

test('field tank: one cm of level is 12.7 L, not the 16.4 L the old model charged', () => {
  const perCm = computeVolumeL(fieldTank, 40)! - computeVolumeL(fieldTank, 41)!;
  assert.ok(Math.abs(perCm - 12.723) < 0.01);
  // The "250 L in an hour" morning (25 -> 42 cm) at the real scale.
  assert.ok(Math.abs(computeVolumeL(fieldTank, 25)! - computeVolumeL(fieldTank, 42)! - 216.3) < 0.1);
});

test('field tank: percentages are unchanged while the full line is unmeasured', () => {
  // Old model: (95 - d) / 70.
  assert.equal(computeLevelPercent(25, fieldTank), 100);
  assert.equal(computeLevelPercent(60, fieldTank), 50);
  assert.equal(computeLevelPercent(95, fieldTank), 0);
});

test('a measured full line inside the blind zone caps what the sensor can show', () => {
  const profile = { ...fieldTank, fullDistanceCm: 14 };
  // 81 cm of water at full, of which the sensor can see 70.
  assert.ok(Math.abs(computeUsableCapacityL(profile) - 81 * 12.723) < 0.1);
  assert.ok(Math.abs(computeLevelPercent(25, profile)! - (100 * 70) / 81) < 1e-9);
  // Nearer readings add nothing: the sensor cannot tell 20 cm from 14.
  assert.equal(computeLevelPercent(20, profile), computeLevelPercent(25, profile));
  assert.equal(computeVolumeL(profile, 20), computeVolumeL(profile, 25));
});

test('a measured full line clear of the blind zone is 100%', () => {
  const profile = { ...fieldTank, sensorOffsetCm: 20, fullDistanceCm: 30 };
  assert.equal(computeLevelPercent(30, profile), 100);
  assert.equal(computeLevelPercent(28, profile), 100);
  assert.ok(Math.abs(computeUsableCapacityL(profile) - 80 * 12.723) < 0.1);
  assert.ok(computeLevelPercent(31, profile)! < 100);
});

test('a sensor hanging inside the tank has a negative offset and a nearer empty line', () => {
  const profile = { ...fieldTank, sensorOffsetCm: -5 };
  assert.equal(computeLevelPercent(85, profile), 0);
  assert.equal(computeVolumeL(profile, 85), 0);
  assert.equal(computeLevelPercent(25, profile), 100);
});

// Read-time derivation: volumeLForProfile takes a raw TankProfile row (Decimal
// fields expose .toNumber()) and a measured level. Mirror the same cuboid,
// but as a DB-shaped row.
const dec = (n: number) => ({ toNumber: () => n });
const rawProfile = {
  shape: 'cuboidal',
  parallelUnitCount: 1,
  heightCm: dec(90),
  diameterCm: null,
  lengthCm: dec(100),
  widthCm: dec(100),
  nominalUnitVolumeL: null,
  sensorOffsetCm: dec(0),
  deadZoneCm: dec(20),
} as unknown as import('@prisma/client').TankProfile;

test('volumeLForProfile: derives liters from a raw profile row + level', () => {
  assert.equal(volumeLForProfile(rawProfile, 50), 400);
  assert.equal(volumeLForProfile(rawProfile, 20), 700);
});

test('volumeLForProfile: null level stays null, never 0', () => {
  assert.equal(volumeLForProfile(rawProfile, null), null);
});

test('volumeLForProfile: no profile returns null (caller falls back to stored)', () => {
  assert.equal(volumeLForProfile(null, 50), null);
});

test('toTankProfileDto: capacity is the litres at 100%, with the brim-full figure alongside', () => {
  const dto = toTankProfileDto(rawProfile);
  assert.equal(dto.total_capacity_l, 700);
  assert.equal(dto.unit_capacity_l, 700);
  assert.equal(dto.nameplate_capacity_l, 900);
  assert.equal(dto.full_distance_cm, null);
});
