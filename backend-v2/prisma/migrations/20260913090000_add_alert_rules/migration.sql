-- Per-device alert rules (issue #13).
--
-- Thresholds could be set but never cleared, and no alert type could be
-- switched off on its own: leak detection was always on and the offline
-- timeout was one server-wide env var. `alert_rules` holds per-type on/off
-- switches ({ "<type>": { "enabled": false } }; an absent type is enabled) and
-- `offline_threshold_min` is a per-device override of the offline timeout.
--
-- Both columns are nullable and additive, so existing rows keep alerting
-- exactly as before.
ALTER TABLE `device_configs` ADD COLUMN `alert_rules` JSON NULL;
ALTER TABLE `device_configs` ADD COLUMN `offline_threshold_min` INTEGER NULL;
