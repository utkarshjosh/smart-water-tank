-- When the stored level was read, so alerts can tell a jump from a slow move.
ALTER TABLE `tank_states` ADD COLUMN `level_at` DATETIME(3) NULL;
