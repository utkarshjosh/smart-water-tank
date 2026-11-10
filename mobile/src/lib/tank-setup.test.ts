import { describe, expect, it } from 'vitest';
import { describeSensor, evaluateTank, formFromProfile, type TankForm } from './tank-setup';

// The first tank in the field: two 90 x 90 cm cylinders joined at the bottom.
const field: TankForm = {
  shape: 'cylindrical',
  units: 2,
  heightCm: '90',
  diameterCm: '90',
  lengthCm: '',
  widthCm: '',
  sensorOffsetCm: '5',
  fullDistanceCm: '',
  deadZoneCm: '25',
};

describe('tank setup form', () => {
  it('matches the server: capacity is the litres between empty and the nearest the sensor sees', () => {
    const result = evaluateTank(field);
    expect(result.problem).toBeNull();
    expect(result.brimL).toBeCloseTo(1145.1, 1);
    expect(result.capacityL).toBeCloseTo(890.6, 1);
    expect(result.shortfallCm).toBeNull();
    expect(result.payload).toMatchObject({ parallel_unit_count: 2, diameter_cm: 90, length_cm: null, full_distance_cm: null });
  });

  it('warns by how far the sensor must rise when the tank fills inside the blind zone', () => {
    const result = evaluateTank({ ...field, fullDistanceCm: '14' });
    expect(result.shortfallCm).toBe(11);
    expect(result.capacityL).toBeCloseTo(81 * 12.723, 0);
    expect(result.payload?.full_distance_cm).toBe(14);
  });

  it('takes a negative height for a sensor that hangs inside the tank', () => {
    const result = evaluateTank({ ...field, sensorOffsetCm: '-5' });
    expect(result.payload?.sensor_offset_cm).toBe(-5);
    expect(result.capacityL).toBeCloseTo(60 * 12.723, 0);
  });

  it('is incomplete, not wrong, until the size is in', () => {
    expect(evaluateTank({ ...field, diameterCm: '' })).toMatchObject({ payload: null, problem: null, capacityL: null });
    expect(evaluateTank({ ...field, shape: 'cuboidal' })).toMatchObject({ payload: null, problem: null });
  });

  it('refuses a setup the sensor could not measure anything in', () => {
    expect(evaluateTank({ ...field, heightCm: '15' }).problem).toMatch(/cannot see any of the tank/);
    expect(evaluateTank({ ...field, fullDistanceCm: '95' }).payload).toBeNull();
    expect(evaluateTank({ ...field, deadZoneCm: 'abc' }).problem).toMatch(/not a number/);
  });

  it('reads a cuboid and a decimal comma', () => {
    const result = evaluateTank({ ...field, shape: 'cuboidal', units: 1, lengthCm: '100', widthCm: '100', heightCm: '90,0', sensorOffsetCm: '30' });
    expect(result.brimL).toBe(900);
    expect(result.capacityL).toBe(900);
  });

  it('starts blank for a new tank and from the stored profile for an existing one', () => {
    expect(formFromProfile(null)).toMatchObject({ shape: 'cylindrical', units: 1, heightCm: '', sensorOffsetCm: '0', deadZoneCm: '25', fullDistanceCm: '' });
    const stored = formFromProfile({
      shape: 'cuboidal', parallel_unit_count: 3, height_cm: 120, diameter_cm: null, length_cm: 100, width_cm: 80,
      nominal_unit_volume_l: null, sensor_offset_cm: -4, dead_zone_cm: 20, full_distance_cm: 30, unit_capacity_l: 1, total_capacity_l: 3,
    });
    expect(stored).toMatchObject({ shape: 'cuboidal', units: 3, lengthCm: '100', sensorOffsetCm: '-4', fullDistanceCm: '30', deadZoneCm: '20' });
  });

  it('sums the sensor position up in one line', () => {
    expect(describeSensor(field)).toBe('5 cm above the tank top · full level not measured');
    expect(describeSensor({ ...field, sensorOffsetCm: '-5', fullDistanceCm: '14' })).toBe('5 cm inside the tank · full at 14 cm');
    expect(describeSensor({ ...field, sensorOffsetCm: '' })).toBe('Level with the tank top · full level not measured');
  });
});
