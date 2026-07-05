-- CreateTable
CREATE TABLE `tenants` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `firebase_uid` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NULL,
    `tenant_id` CHAR(36) NULL,
    `role` ENUM('user', 'tenant_owner', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
    `fcm_token` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_firebase_uid_key`(`firebase_uid`),
    INDEX `users_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `devices` (
    `id` CHAR(36) NOT NULL,
    `device_id` VARCHAR(255) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `name` VARCHAR(255) NULL,
    `firmware_version` VARCHAR(50) NULL,
    `last_seen` DATETIME(3) NULL,
    `status` ENUM('online', 'offline') NOT NULL DEFAULT 'offline',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `devices_device_id_key`(`device_id`),
    INDEX `devices_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_tokens` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `device_tokens_token_hash_key`(`token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `measurements` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `level_cm` DECIMAL(10, 2) NOT NULL,
    `volume_l` DECIMAL(10, 2) NOT NULL,
    `temperature_c` DECIMAL(5, 2) NULL,
    `battery_v` DECIMAL(5, 2) NULL,
    `rssi` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `measurements_device_id_timestamp_idx`(`device_id`, `timestamp` DESC),
    INDEX `measurements_timestamp_idx`(`timestamp` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_summaries` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `total_usage_l` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `min_volume_l` DECIMAL(10, 2) NULL,
    `max_volume_l` DECIMAL(10, 2) NULL,
    `avg_volume_l` DECIMAL(10, 2) NULL,
    `refill_events` INTEGER NOT NULL DEFAULT 0,
    `leak_suspected` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `daily_summaries_device_id_date_idx`(`device_id`, `date` DESC),
    UNIQUE INDEX `daily_summaries_device_id_date_key`(`device_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `type` ENUM('tank_full', 'tank_low', 'battery_low', 'device_offline', 'leak_detected') NOT NULL,
    `severity` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    `message` TEXT NULL,
    `payload` JSON NULL,
    `acknowledged` BOOLEAN NOT NULL DEFAULT false,
    `acknowledged_by` CHAR(36) NULL,
    `acknowledged_at` DATETIME(3) NULL,
    `delivered_to_firebase` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `alerts_device_id_created_at_idx`(`device_id`, `created_at` DESC),
    INDEX `alerts_tenant_id_created_at_idx`(`tenant_id`, `created_at` DESC),
    INDEX `alerts_acknowledged_created_at_idx`(`acknowledged`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_configs` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `measurement_interval_ms` INTEGER NOT NULL DEFAULT 60000,
    `report_interval_ms` INTEGER NOT NULL DEFAULT 300000,
    `tank_full_threshold_l` DECIMAL(10, 2) NULL,
    `tank_low_threshold_l` DECIMAL(10, 2) NULL,
    `battery_low_threshold_v` DECIMAL(5, 2) NULL,
    `level_empty_cm` DECIMAL(10, 2) NULL,
    `level_full_cm` DECIMAL(10, 2) NULL,
    `config_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `device_configs_device_id_key`(`device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `firmware_binaries` (
    `id` CHAR(36) NOT NULL,
    `version` VARCHAR(50) NOT NULL,
    `file_path` TEXT NOT NULL,
    `file_size` INTEGER NULL,
    `checksum` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `rollout_percentage` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `firmware_binaries_version_key`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_firmware_assignments` (
    `id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `firmware_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `installed_at` DATETIME(3) NULL,
    `status` ENUM('pending', 'downloading', 'installing', 'installed', 'failed') NOT NULL DEFAULT 'pending',

    UNIQUE INDEX `device_firmware_assignments_device_id_firmware_id_key`(`device_id`, `firmware_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_device_mappings` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `device_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_device_mappings_user_id_device_id_key`(`user_id`, `device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_claim_codes` (
    `id` CHAR(36) NOT NULL,
    `code_hash` VARCHAR(255) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `created_by_user_id` CHAR(36) NULL,
    `device_id` CHAR(36) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `device_claim_codes_code_hash_idx`(`code_hash`),
    INDEX `device_claim_codes_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `devices` ADD CONSTRAINT `devices_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_tokens` ADD CONSTRAINT `device_tokens_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `measurements` ADD CONSTRAINT `measurements_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_summaries` ADD CONSTRAINT `daily_summaries_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_acknowledged_by_fkey` FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_configs` ADD CONSTRAINT `device_configs_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_firmware_assignments` ADD CONSTRAINT `device_firmware_assignments_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_firmware_assignments` ADD CONSTRAINT `device_firmware_assignments_firmware_id_fkey` FOREIGN KEY (`firmware_id`) REFERENCES `firmware_binaries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_device_mappings` ADD CONSTRAINT `user_device_mappings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_device_mappings` ADD CONSTRAINT `user_device_mappings_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_claim_codes` ADD CONSTRAINT `device_claim_codes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_claim_codes` ADD CONSTRAINT `device_claim_codes_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_claim_codes` ADD CONSTRAINT `device_claim_codes_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
