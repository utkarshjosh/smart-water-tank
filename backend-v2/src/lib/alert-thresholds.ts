import { z } from 'zod';

/**
 * A threshold a caller can switch off.
 *
 * `undefined` (key absent) keeps the stored value; `null` - and an empty
 * string, which is what a cleared form field sends - clears it. A null
 * threshold is what every alert rule reads as "this alert is off", so this is
 * the whole mechanism for turning a single alert type off per device.
 *
 * The preprocess is what makes that possible. `z.coerce.number()` runs
 * `Number(value)` before validating, so it silently turned both `null` and
 * `''` into 0 rather than rejecting them. Clearing "tank full" therefore
 * stored 0%, and a 0% full threshold matches every reading at or above 0% -
 * which is every reading. Trying to turn that alert off armed it permanently.
 */
export const clearableThreshold = (inner: z.ZodTypeAny) =>
  z.preprocess(
    (value) => (value === '' || value === null ? null : value),
    inner.nullable().optional()
  );

export const alertThresholdsSchema = z.object({
  tank_low_threshold_pct: clearableThreshold(z.coerce.number().min(0).max(100)),
  tank_full_threshold_pct: clearableThreshold(z.coerce.number().min(0).max(100)),
  battery_low_threshold_v: clearableThreshold(z.coerce.number().min(0)),
});
