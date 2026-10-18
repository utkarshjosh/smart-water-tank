-- Tank state: what the server last concluded about each tank.
--
-- Alerts used to re-check "level >= threshold" on every reading, held back
-- only by a one-hour window that acknowledging an alert cleared. A full tank
-- therefore alerted hourly, and sooner once acknowledged. With the last band
-- stored, an alert fires once when the tank enters full/low and re-arms only
-- after it moves back past a margin.
--
-- New table, no backfill: each device's first reading after deploy seeds its
-- row without alerting.
CREATE TABLE `tank_states` (
    `device_id` CHAR(36) NOT NULL,
    `band` ENUM('low', 'normal', 'full') NOT NULL,
    `in_blind_zone` BOOLEAN NOT NULL DEFAULT false,
    `level_percent` DECIMAL(5, 2) NULL,
    `battery_low` BOOLEAN NOT NULL DEFAULT false,
    `band_changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`device_id`),
    CONSTRAINT `tank_states_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
