import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLevelPercent, computeVolumeL, volumeLForProfile } from '../services/tank-profile.service';

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

// 100 x 100 x 90 cm cuboid => area 10000 cm^2 * 90 cm / 1000 = 900 L nameplate.
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

test('computeVolumeL: dead-zone clamp (d <= z) is nameplate-full', () => {
  assert.equal(computeVolumeL(volProfile, 20), 900);
  assert.equal(computeVolumeL(volProfile, 5), 900);
});

test('computeVolumeL: mid value is percent-scaled nameplate capacity', () => {
  // 57.142857% of 900 L
  assert.ok(Math.abs(computeVolumeL(volProfile, 50)! - 514.2857) < 1e-3);
});

test('computeVolumeL: null level stays null, never 0', () => {
  assert.equal(computeVolumeL(volProfile, null), null);
});

test('computeVolumeL: honours parallel unit count', () => {
  assert.equal(computeVolumeL({ ...volProfile, parallelUnitCount: 2 }, 20), 1800);
});

// Read-time derivation: volumeLForProfile takes a raw TankProfile row (Decimal
// fields expose .toNumber()) and a measured level. Mirror the same 900 L
// nameplate cuboid, but as a DB-shaped row.
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
  assert.ok(Math.abs(volumeLForProfile(rawProfile, 50)! - 514.2857) < 1e-3);
  assert.equal(volumeLForProfile(rawProfile, 20), 900);
});

test('volumeLForProfile: null level stays null, never 0', () => {
  assert.equal(volumeLForProfile(rawProfile, null), null);
});

test('volumeLForProfile: no profile returns null (caller falls back to stored)', () => {
  assert.equal(volumeLForProfile(null, 50), null);
});
