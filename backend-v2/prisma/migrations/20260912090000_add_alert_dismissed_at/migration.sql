-- Dismissing an alert hides it from the default feed without deleting the
-- record. Nullable and additive, so it is safe to apply to a live database.
ALTER TABLE `alerts` ADD COLUMN `dismissed_at` DATETIME(3) NULL;

-- The tenant-wide and fleet-wide alert feeds filter on dismissal alongside
-- the existing (tenant_id, created_at) and (device_id, created_at) indexes.
CREATE INDEX `alerts_dismissed_at_idx` ON `alerts`(`dismissed_at`);
