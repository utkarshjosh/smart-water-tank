-- Hourly usage rollups and per-device timezone.
--
-- Days were cut in the server's timezone (UTC), so "yesterday" ran 05:30 to
-- 05:30 for a tank in India, and nothing finer than a day was stored.
-- `devices.timezone` says where the tank's days and hours begin;
-- `hourly_usage` holds litres used and filled per local hour, and
-- `daily_summaries` is now built from it.
--
-- All additive. Existing devices take the server default zone; rollups are
-- filled by the 5-minute job for active devices and can be backfilled with
-- `npm run rollups:rebuild`.
ALTER TABLE `devices` ADD COLUMN `timezone` VARCHAR(64) NULL;

ALTER TABLE `daily_summaries` ADD COLUMN `total_filled_l` DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE `daily_summaries` ADD COLUMN `readings` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `hourly_usage` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `hour_start` DATETIME(3) NOT NULL,
    `used_l` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `filled_l` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `min_l` DECIMAL(10, 2) NULL,
    `max_l` DECIMAL(10, 2) NULL,
    `avg_l` DECIMAL(10, 2) NULL,
    `readings` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hourly_usage_device_id_hour_start_key`(`device_id`, `hour_start`),
    PRIMARY KEY (`id`),
    CONSTRAINT `hourly_usage_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
