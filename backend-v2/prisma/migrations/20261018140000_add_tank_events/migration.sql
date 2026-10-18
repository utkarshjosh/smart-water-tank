-- Fill and draw episodes.
--
-- Hourly totals say how much water moved; they can't say "the tank filled
-- from 06:10 to 06:42" or "someone ran 60 L at 07:00". Each row here is one
-- such episode, detected from measurements and rebuilt with the day's
-- rollups. Daily refill counts now come from these instead of a per-hour
-- guess.
CREATE TABLE `tank_events` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `kind` ENUM('fill', 'draw') NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `ended_at` DATETIME(3) NOT NULL,
    `start_l` DECIMAL(10, 2) NOT NULL,
    `end_l` DECIMAL(10, 2) NOT NULL,
    `volume_l` DECIMAL(10, 2) NOT NULL,
    `rate_l_per_min` DECIMAL(10, 2) NOT NULL,
    `readings` INTEGER NOT NULL,
    `ongoing` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tank_events_device_id_started_at_idx`(`device_id`, `started_at` DESC),
    PRIMARY KEY (`id`),
    CONSTRAINT `tank_events_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
