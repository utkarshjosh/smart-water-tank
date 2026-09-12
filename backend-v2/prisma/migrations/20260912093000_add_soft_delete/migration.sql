-- Soft delete for tenants, devices and users.
--
-- A hard delete is unsafe here: Tenant -> User, Tenant -> Device and
-- Device -> (measurements, alerts, config, profile, tokens, assignments,
-- mappings) are all onDelete: Cascade, so deleting one tenant row would
-- silently destroy every reading ever taken under it. Archiving hides the
-- record and blocks access while keeping the history queryable.
--
-- All three columns are nullable and additive, so this is safe to apply to a
-- live database; existing rows read as not archived.
ALTER TABLE `tenants` ADD COLUMN `archived_at` DATETIME(3) NULL;
ALTER TABLE `devices` ADD COLUMN `archived_at` DATETIME(3) NULL;
ALTER TABLE `users` ADD COLUMN `archived_at` DATETIME(3) NULL;

-- Every list endpoint filters on these.
CREATE INDEX `tenants_archived_at_idx` ON `tenants`(`archived_at`);
CREATE INDEX `devices_archived_at_idx` ON `devices`(`archived_at`);
CREATE INDEX `users_archived_at_idx` ON `users`(`archived_at`);
