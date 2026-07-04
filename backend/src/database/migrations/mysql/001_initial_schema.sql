-- Water Tank Monitoring System - Initial Database Schema (MySQL 8)
-- Multi-tenant architecture. Mirrors the Postgres schema in ../postgres.
--
-- Notes on the Postgres -> MySQL mapping:
--   * UUID PKs          -> CHAR(36) with a DEFAULT (UUID()) expression default.
--                          Writes that need the new id back (Postgres RETURNING)
--                          get an app-generated UUID injected by the MySQL
--                          adapter; the default covers every other insert.
--   * TIMESTAMPTZ       -> DATETIME storing UTC.
--   * updated_at trigger-> `ON UPDATE CURRENT_TIMESTAMP` column attribute.
--   * JSONB             -> JSON.
--   * BOOLEAN           -> BOOLEAN (TINYINT(1)); the adapter casts it back to a
--                          JS boolean on read.

SET NAMES utf8mb4;

-- Tenants table (organizations/households)
CREATE TABLE tenants (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Users table (linked to Firebase UID)
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    tenant_id CHAR(36),
    role VARCHAR(50) DEFAULT 'user', -- 'user', 'admin', 'super_admin'
    fcm_token TEXT, -- Firebase Cloud Messaging token
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Devices table (ESP8266 devices)
CREATE TABLE devices (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id VARCHAR(255) UNIQUE NOT NULL, -- Device identifier from firmware (OTA_HOSTNAME)
    tenant_id CHAR(36),
    name VARCHAR(255),
    firmware_version VARCHAR(50),
    last_seen DATETIME,
    status VARCHAR(50) DEFAULT 'offline', -- 'online', 'offline'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_devices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Device tokens for authentication
CREATE TABLE device_tokens (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36),
    token_hash VARCHAR(255) NOT NULL, -- Hashed device token
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    CONSTRAINT fk_device_tokens_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Measurements table (raw sensor data)
CREATE TABLE measurements (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    level_cm DECIMAL(10, 2) NOT NULL,
    volume_l DECIMAL(10, 2) NOT NULL,
    temperature_c DECIMAL(5, 2),
    battery_v DECIMAL(5, 2),
    rssi INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_measurements_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Daily summaries (aggregated data)
CREATE TABLE daily_summaries (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36),
    date DATE NOT NULL,
    total_usage_l DECIMAL(10, 2) DEFAULT 0,
    min_volume_l DECIMAL(10, 2),
    max_volume_l DECIMAL(10, 2),
    avg_volume_l DECIMAL(10, 2),
    refill_events INT DEFAULT 0,
    leak_suspected BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_daily_summaries_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY uq_daily_summaries_device_date (device_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Alerts table
CREATE TABLE alerts (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36),
    tenant_id CHAR(36),
    type VARCHAR(50) NOT NULL, -- 'tank_full', 'tank_low', 'battery_low', 'device_offline', 'leak_detected', 'sensor_fault'
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    message TEXT,
    payload JSON, -- Additional alert data
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by CHAR(36),
    acknowledged_at DATETIME,
    delivered_to_firebase BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_alerts_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_ack_by FOREIGN KEY (acknowledged_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Device configurations
CREATE TABLE device_configs (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36) UNIQUE,
    measurement_interval_ms INT DEFAULT 60000,
    report_interval_ms INT DEFAULT 300000,
    tank_full_threshold_l DECIMAL(10, 2),
    tank_low_threshold_l DECIMAL(10, 2),
    battery_low_threshold_v DECIMAL(5, 2),
    level_empty_cm DECIMAL(10, 2),
    level_full_cm DECIMAL(10, 2),
    config_json JSON, -- Additional flexible config
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_device_configs_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Firmware binaries metadata
CREATE TABLE firmware_binaries (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    version VARCHAR(50) UNIQUE NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    checksum VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    rollout_percentage INT DEFAULT 0, -- 0-100
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Device firmware assignments (which devices should get which firmware)
CREATE TABLE device_firmware_assignments (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    device_id CHAR(36),
    firmware_id CHAR(36),
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    installed_at DATETIME,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'installing', 'installed', 'failed'
    CONSTRAINT fk_dfa_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_dfa_firmware FOREIGN KEY (firmware_id) REFERENCES firmware_binaries(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dfa_device_firmware (device_id, firmware_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User-device mappings (many-to-many)
CREATE TABLE user_device_mappings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36),
    device_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_udm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_udm_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY uq_udm_user_device (user_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indexes for performance
CREATE INDEX idx_measurements_device_timestamp ON measurements(device_id, timestamp DESC);
CREATE INDEX idx_measurements_timestamp ON measurements(timestamp DESC);
CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_alerts_device ON alerts(device_id, created_at DESC);
CREATE INDEX idx_alerts_tenant ON alerts(tenant_id, created_at DESC);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged, created_at DESC);
CREATE INDEX idx_daily_summaries_device_date ON daily_summaries(device_id, date DESC);
CREATE INDEX idx_user_device_mappings_user ON user_device_mappings(user_id);
CREATE INDEX idx_user_device_mappings_device ON user_device_mappings(device_id);
