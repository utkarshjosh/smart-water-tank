-- Experimental daily insight: per-user opt-in (off by default) and a log of
-- every insight sent, with its facts and the user's "useful?" answer.
ALTER TABLE `users` ADD COLUMN `daily_insight_enabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `daily_insights` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `local_date` VARCHAR(10) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `facts` JSON NOT NULL,
    `text` TEXT NOT NULL,
    `template` TEXT NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `score` DOUBLE NOT NULL,
    `delivered` INTEGER NOT NULL DEFAULT 0,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `useful` BOOLEAN NULL,
    `feedback_at` DATETIME(3) NULL,

    UNIQUE INDEX `daily_insights_user_id_local_date_key`(`user_id`, `local_date`),
    INDEX `daily_insights_device_id_idx`(`device_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `daily_insights_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `daily_insights_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
