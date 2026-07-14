-- AlterTable
ALTER TABLE `devices` ADD COLUMN `config_version` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `tank_profiles` ADD COLUMN `dead_zone_cm` DECIMAL(10, 2) NOT NULL DEFAULT 25;
