import { z } from 'zod';
import { tankShapeSchema } from './primitives';

/** tank-profile.service toTankProfileDto: stored geometry plus derived capacities. */
export const tankProfileSchema = z.object({
  shape: tankShapeSchema,
  parallel_unit_count: z.number(),
  height_cm: z.number(),
  diameter_cm: z.number().nullable(),
  length_cm: z.number().nullable(),
  width_cm: z.number().nullable(),
  nominal_unit_volume_l: z.number().nullable(),
  sensor_offset_cm: z.number(),
  dead_zone_cm: z.number(),
  unit_capacity_l: z.number(),
  total_capacity_l: z.number(),
});
export type TankProfile = z.infer<typeof tankProfileSchema>;

/** GET and PUT /api/v1/user/devices/:id/tank-profile. `profile` is null until one is set. */
export const tankProfileResponseSchema = z.object({ profile: tankProfileSchema.nullable() });
export type TankProfileResponse = z.infer<typeof tankProfileResponseSchema>;
