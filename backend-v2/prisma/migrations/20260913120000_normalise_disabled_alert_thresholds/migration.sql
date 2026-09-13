-- Data-only migration. No schema change: these columns are already nullable.
--
-- The alert rules used to guard the legacy litre and battery thresholds with a
-- truthy check, so a stored 0 meant "this alert is off". Those guards are now
-- `!= null`, matching the percentage rules, which would silently re-arm every
-- device sitting at 0. Rewriting those zeroes to NULL keeps their behaviour
-- exactly as it is today, and makes NULL the single way to say "off".
UPDATE `device_configs` SET `tank_full_threshold_l` = NULL WHERE `tank_full_threshold_l` = 0;
UPDATE `device_configs` SET `tank_low_threshold_l` = NULL WHERE `tank_low_threshold_l` = 0;
UPDATE `device_configs` SET `battery_low_threshold_v` = NULL WHERE `battery_low_threshold_v` = 0;

-- Separately: a 0% full threshold fires "tank is full" on every reading at or
-- above 0%, which is every reading. Nobody sets that on purpose - it is what
-- the API stored when a client tried to clear the field, because
-- `z.coerce.number()` turned null and '' into 0. Clear those too.
UPDATE `device_configs` SET `tank_full_threshold_pct` = NULL WHERE `tank_full_threshold_pct` = 0;

-- `tank_low_threshold_pct` = 0 is deliberately left alone: "alert when the tank
-- reaches 0%" is a coherent setting, and its guard was already `!= null`, so
-- nothing about it changes here.
