-- Existing cached rows are unverified until rebuilt from measurements.
ALTER TABLE `hourly_usage` ADD COLUMN `observed_seconds` INTEGER NOT NULL DEFAULT 0;
