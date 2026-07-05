-- AlterTable
ALTER TABLE `device_configs` ADD COLUMN `tank_full_threshold_pct` DECIMAL(5, 2) NULL,
    ADD COLUMN `tank_low_threshold_pct` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `devices` ADD COLUMN `last_ota_check_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `tank_profiles` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `shape` ENUM('cylindrical', 'cuboidal') NOT NULL,
    `parallel_unit_count` INTEGER NOT NULL DEFAULT 1,
    `height_cm` DECIMAL(10, 2) NOT NULL,
    `diameter_cm` DECIMAL(10, 2) NULL,
    `length_cm` DECIMAL(10, 2) NULL,
    `width_cm` DECIMAL(10, 2) NULL,
    `nominal_unit_volume_l` DECIMAL(10, 2) NULL,
    `sensor_offset_cm` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tank_profiles_device_id_key`(`device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tank_profiles` ADD CONSTRAINT `tank_profiles_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
