-- AlterTable
ALTER TABLE `device_configs` ADD COLUMN `sync_mode` ENUM('live', 'piggyback') NOT NULL DEFAULT 'piggyback';
