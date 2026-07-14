import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeometryBlock,
  mergeDeviceConfig,
  isConfigStale,
  type GeometrySource,
  type OperationalConfig,
} from '../services/device.service';

// User's real tank: 100 x 100 x 90 cm cuboid (900 L nameplate), sensor flush at
// the full line (s=0), 20 cm ultrasonic dead zone.
const geometry: GeometrySource = {
  shape: 'cuboidal',
  parallelUnitCount: 1,
  heightCm: 90,
  diameterCm: null,
  lengthCm: 100,
  widthCm: 100,
  nominalUnitVolumeL: null,
  sensorOffsetCm: 0,
  deadZoneCm: 20,
};

const operational: OperationalConfig = {
  measurement_interval_ms: 60000,
  report_interval_ms: 300000,
  tank_full_threshold_l: 900,
  tank_low_threshold_l: 100,
  tank_full_threshold_pct: null,
  tank_low_threshold_pct: null,
  battery_low_threshold_v: 3.3,
  sync_mode: 'piggyback',
};

// --- geometry derivation -----------------------------------------------------

test('buildGeometryBlock: derives level_empty_cm = sensorOffset + height', () => {
  assert.equal(buildGeometryBlock(geometry).level_empty_cm, 90);
});

test('buildGeometryBlock: derives level_full_cm = max(sensorOffset, deadZone)', () => {
  assert.equal(buildGeometryBlock(geometry).level_full_cm, 20);
  // When the sensor offset exceeds the dead zone, it wins.
  assert.equal(buildGeometryBlock({ ...geometry, sensorOffsetCm: 30 }).level_full_cm, 30);
});

test('buildGeometryBlock: total_capacity_l is nameplate capacity', () => {
  assert.equal(buildGeometryBlock(geometry).total_capacity_l, 900);
  assert.equal(buildGeometryBlock({ ...geometry, parallelUnitCount: 2 }).total_capacity_l, 1800);
});

test('buildGeometryBlock: passes through shape + dimensions', () => {
  const b = buildGeometryBlock(geometry);
  assert.equal(b.shape, 'cuboidal');
  assert.equal(b.length_cm, 100);
  assert.equal(b.width_cm, 100);
  assert.equal(b.diameter_cm, null);
  assert.equal(b.height_cm, 90);
  assert.equal(b.dead_zone_cm, 20);
  assert.equal(b.sensor_offset_cm, 0);
  assert.equal(b.parallel_unit_count, 1);
});

// --- merged builder ----------------------------------------------------------

test('mergeDeviceConfig: with a profile includes operational + geometry + version', () => {
  const payload = mergeDeviceConfig(operational, geometry, 7);
  // operational
  assert.equal(payload.measurement_interval_ms, 60000);
  assert.equal(payload.battery_low_threshold_v, 3.3);
  // geometry
  assert.equal(payload.level_empty_cm, 90);
  assert.equal(payload.level_full_cm, 20);
  assert.equal(payload.total_capacity_l, 900);
  // version
  assert.equal(payload.config_version, 7);
});

test('mergeDeviceConfig: without a profile omits the geometry block but keeps operational + version', () => {
  const payload = mergeDeviceConfig(operational, null, 3);
  assert.equal(payload.measurement_interval_ms, 60000);
  assert.equal(payload.config_version, 3);
  assert.equal(payload.shape, undefined);
  assert.equal(payload.level_empty_cm, undefined);
  assert.equal(payload.total_capacity_l, undefined);
  assert.equal('shape' in payload, false);
});

test('mergeDeviceConfig: cylindrical geometry surfaces diameter, not length/width', () => {
  const cyl: GeometrySource = {
    ...geometry,
    shape: 'cylindrical',
    diameterCm: 100,
    lengthCm: null,
    widthCm: null,
  };
  const payload = mergeDeviceConfig(operational, cyl, 1);
  assert.equal(payload.shape, 'cylindrical');
  assert.equal(payload.diameter_cm, 100);
  assert.equal(payload.length_cm, null);
});

// --- stale-check decision ----------------------------------------------------

test('isConfigStale: device reports no version -> stale (send config)', () => {
  assert.equal(isConfigStale(5, undefined), true);
  assert.equal(isConfigStale(5, null), true);
});

test('isConfigStale: device reports an older version -> stale (send config)', () => {
  assert.equal(isConfigStale(5, 4), true);
  assert.equal(isConfigStale(1, 0), true);
});

test('isConfigStale: device reports the current version -> not stale (withhold)', () => {
  assert.equal(isConfigStale(5, 5), false);
});

test('isConfigStale: device reports a newer version -> not stale (withhold)', () => {
  // Shouldn't normally happen, but a device ahead of the server is not stale.
  assert.equal(isConfigStale(5, 6), false);
});
