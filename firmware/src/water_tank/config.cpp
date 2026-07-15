 /**
 * Configuration Module Implementation
 */

#include "config.h"
#include <Arduino.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

#define CONFIG_FILE "/config.json"
#define CONFIG_BACKUP_FILE "/config.backup.json"
#define CONFIG_TEMP_FILE "/config.pending.json"
#define MQTT_CREDENTIAL_SCHEMA_VERSION 1

namespace Config {
    // Runtime configuration with defaults
    unsigned long measurementIntervalMs = MEASUREMENT_INTERVAL_MS;
    unsigned long reportIntervalMs = REPORT_INTERVAL_MS;
    float tankFullThreshold = TANK_FULL_THRESHOLD_L;
    float tankLowThreshold = TANK_LOW_THRESHOLD_L;
    float batteryLowThreshold = BATTERY_LOW_THRESHOLD_V;
    float tankFullThresholdPct = -1;   // <0 = not set (server sends null)
    float tankLowThresholdPct = -1;    // <0 = not set (server sends null)
    float levelEmptyCm = LEVEL_EMPTY_CM;
    float levelFullCm = LEVEL_FULL_CM;

    // Runtime tank geometry, seeded from the compile-time TANK_* defines as a
    // first-boot fallback. Overridden the moment the server pushes a config.
    String tankShape = TANK_IS_CYLINDRICAL ? "cylindrical" : "cuboidal";
    float  diameterCm = TANK_DIAMETER_CM;
    float  lengthCm = TANK_LENGTH_CM;
    float  widthCm = TANK_WIDTH_CM;
    float  heightCm = TANK_HEIGHT_CM;
    float  sensorOffsetCm = SENSOR_OFFSET_CM;
    float  deadZoneCm = TANK_DEAD_ZONE_CM;
    int    parallelUnitCount = TANK_PARALLEL_UNIT_COUNT;
    float  totalCapacityL = 0;   // <=0 => compute locally from geometry

    long   configVersion = -1;   // -1 = never synced
    String syncMode = "piggyback";

    // WiFi credentials (defaults from config.h)
    String wifiSsid = WIFI_SSID_DEFAULT;
    String wifiPassword = WIFI_PASSWORD_DEFAULT;

    // Device identification (defaults from config.h)
    String deviceId = DEVICE_ID_DEFAULT;
    String deviceToken = DEVICE_TOKEN_DEFAULT;
    bool claimed = false;
    bool mqttProvisioned = false;
    String mqttBrokerHost = "";
    int mqttCredentialSchemaVersion = 0;

    void load() {
        Serial.println(F("[Config] Loading from flash..."));

        if (!LittleFS.begin()) {
            Serial.println(F("[Config] Failed to mount filesystem, using defaults"));
            return;
        }

        const char* configPath = CONFIG_FILE;
        bool recoveredBackup = false;
        if (!LittleFS.exists(configPath) && LittleFS.exists(CONFIG_BACKUP_FILE)) {
            Serial.println(F("[Config] Recovering config from interrupted write"));
            configPath = CONFIG_BACKUP_FILE;
            recoveredBackup = true;
        }
        if (!LittleFS.exists(configPath)) {
            Serial.println(F("[Config] No config file, using defaults"));
            return;
        }

        File file = LittleFS.open(configPath, "r");
        if (!file) {
            Serial.println(F("[Config] Failed to open config file"));
            return;
        }

        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, file);
        file.close();

        if (error) {
            Serial.printf("[Config] Parse error: %s\n", error.c_str());
            return;
        }

        if (recoveredBackup) {
            // Complete recovery before any later save can rotate the files.
            LittleFS.rename(CONFIG_BACKUP_FILE, CONFIG_FILE);
        }

        // Operational (accept both new *_ms names and legacy short names)
        measurementIntervalMs = doc["measurement_interval_ms"] | (doc["measurement_interval"] | (uint32_t)MEASUREMENT_INTERVAL_MS);
        reportIntervalMs = doc["report_interval_ms"] | (doc["report_interval"] | (uint32_t)REPORT_INTERVAL_MS);
        tankFullThreshold = doc["tank_full_threshold_l"] | (doc["tank_full_threshold"] | (float)TANK_FULL_THRESHOLD_L);
        tankLowThreshold = doc["tank_low_threshold_l"] | (doc["tank_low_threshold"] | (float)TANK_LOW_THRESHOLD_L);
        batteryLowThreshold = doc["battery_low_threshold_v"] | (doc["battery_low_threshold"] | (float)BATTERY_LOW_THRESHOLD_V);
        tankFullThresholdPct = doc["tank_full_threshold_pct"] | -1.0f;
        tankLowThresholdPct = doc["tank_low_threshold_pct"] | -1.0f;
        levelEmptyCm = doc["level_empty_cm"] | (float)LEVEL_EMPTY_CM;
        levelFullCm = doc["level_full_cm"] | (float)LEVEL_FULL_CM;

        // Geometry
        if (doc["shape"].is<const char*>()) tankShape = doc["shape"].as<String>();
        diameterCm = doc["diameter_cm"] | (float)TANK_DIAMETER_CM;
        lengthCm = doc["length_cm"] | (float)TANK_LENGTH_CM;
        widthCm = doc["width_cm"] | (float)TANK_WIDTH_CM;
        heightCm = doc["height_cm"] | (float)TANK_HEIGHT_CM;
        sensorOffsetCm = doc["sensor_offset_cm"] | (float)SENSOR_OFFSET_CM;
        deadZoneCm = doc["dead_zone_cm"] | (float)TANK_DEAD_ZONE_CM;
        parallelUnitCount = doc["parallel_unit_count"] | (int)TANK_PARALLEL_UNIT_COUNT;
        totalCapacityL = doc["total_capacity_l"] | 0.0f;

        // Versioning / sync
        configVersion = doc["config_version"] | (long)-1;
        if (doc["sync_mode"].is<const char*>()) syncMode = doc["sync_mode"].as<String>();

        // WiFi credentials
        if (doc["wifi_ssid"].is<const char*>()) wifiSsid = doc["wifi_ssid"].as<String>();
        if (doc["wifi_password"].is<const char*>()) wifiPassword = doc["wifi_password"].as<String>();

        // Device identification
        if (doc["device_id"].is<const char*>()) deviceId = doc["device_id"].as<String>();
        if (doc["device_token"].is<const char*>()) deviceToken = doc["device_token"].as<String>();
        claimed = doc["claimed"] | false;
        mqttProvisioned = doc["mqtt_provisioned"] | false;
        if (doc["mqtt_broker_host"].is<const char*>()) mqttBrokerHost = doc["mqtt_broker_host"].as<String>();
        mqttCredentialSchemaVersion = doc["mqtt_credential_schema_version"] | 0;

        Serial.printf("[Config] Loaded (config_version=%ld, shape=%s)\n", configVersion, tankShape.c_str());
    }

    void save() {
        Serial.println(F("[Config] Saving to flash..."));

        if (!LittleFS.begin()) {
            Serial.println(F("[Config] Failed to mount filesystem"));
            return;
        }

        File file = LittleFS.open(CONFIG_TEMP_FILE, "w");
        if (!file) {
            Serial.println(F("[Config] Failed to create config file"));
            return;
        }

        JsonDocument doc;
        doc["measurement_interval_ms"] = measurementIntervalMs;
        doc["report_interval_ms"] = reportIntervalMs;
        doc["tank_full_threshold_l"] = tankFullThreshold;
        doc["tank_low_threshold_l"] = tankLowThreshold;
        doc["battery_low_threshold_v"] = batteryLowThreshold;
        doc["tank_full_threshold_pct"] = tankFullThresholdPct;
        doc["tank_low_threshold_pct"] = tankLowThresholdPct;
        doc["level_empty_cm"] = levelEmptyCm;
        doc["level_full_cm"] = levelFullCm;
        // Geometry
        doc["shape"] = tankShape;
        doc["diameter_cm"] = diameterCm;
        doc["length_cm"] = lengthCm;
        doc["width_cm"] = widthCm;
        doc["height_cm"] = heightCm;
        doc["sensor_offset_cm"] = sensorOffsetCm;
        doc["dead_zone_cm"] = deadZoneCm;
        doc["parallel_unit_count"] = parallelUnitCount;
        doc["total_capacity_l"] = totalCapacityL;
        // Versioning / sync
        doc["config_version"] = configVersion;
        doc["sync_mode"] = syncMode;
        // Identity / WiFi
        doc["wifi_ssid"] = wifiSsid;
        doc["wifi_password"] = wifiPassword;
        doc["device_id"] = deviceId;
        doc["device_token"] = deviceToken;
        doc["claimed"] = claimed;
        doc["mqtt_provisioned"] = mqttProvisioned;
        doc["mqtt_broker_host"] = mqttBrokerHost;
        doc["mqtt_credential_schema_version"] = mqttCredentialSchemaVersion;

        if (serializeJson(doc, file) == 0) {
            file.close();
            LittleFS.remove(CONFIG_TEMP_FILE);
            Serial.println(F("[Config] Failed to serialize config"));
            return;
        }
        file.flush();
        file.close();

        // Keep a recoverable previous copy while replacing the config. If power
        // fails between renames, load() reads the backup rather than treating a
        // partially provisioned device as freshly claimed.
        LittleFS.remove(CONFIG_BACKUP_FILE);
        if (LittleFS.exists(CONFIG_FILE) && !LittleFS.rename(CONFIG_FILE, CONFIG_BACKUP_FILE)) {
            LittleFS.remove(CONFIG_TEMP_FILE);
            Serial.println(F("[Config] Failed to stage previous config"));
            return;
        }
        if (!LittleFS.rename(CONFIG_TEMP_FILE, CONFIG_FILE)) {
            if (LittleFS.exists(CONFIG_BACKUP_FILE)) LittleFS.rename(CONFIG_BACKUP_FILE, CONFIG_FILE);
            Serial.println(F("[Config] Failed to commit config"));
            return;
        }
        LittleFS.remove(CONFIG_BACKUP_FILE);

        Serial.println(F("[Config] Saved successfully"));
    }

    void reset() {
        Serial.println(F("[Config] Resetting to defaults..."));

        measurementIntervalMs = MEASUREMENT_INTERVAL_MS;
        reportIntervalMs = REPORT_INTERVAL_MS;
        tankFullThreshold = TANK_FULL_THRESHOLD_L;
        tankLowThreshold = TANK_LOW_THRESHOLD_L;
        batteryLowThreshold = BATTERY_LOW_THRESHOLD_V;
        tankFullThresholdPct = -1;
        tankLowThresholdPct = -1;
        levelEmptyCm = LEVEL_EMPTY_CM;
        levelFullCm = LEVEL_FULL_CM;
        tankShape = TANK_IS_CYLINDRICAL ? "cylindrical" : "cuboidal";
        diameterCm = TANK_DIAMETER_CM;
        lengthCm = TANK_LENGTH_CM;
        widthCm = TANK_WIDTH_CM;
        heightCm = TANK_HEIGHT_CM;
        sensorOffsetCm = SENSOR_OFFSET_CM;
        deadZoneCm = TANK_DEAD_ZONE_CM;
        parallelUnitCount = TANK_PARALLEL_UNIT_COUNT;
        totalCapacityL = 0;
        configVersion = -1;
        syncMode = "piggyback";
        wifiSsid = WIFI_SSID_DEFAULT;
        wifiPassword = WIFI_PASSWORD_DEFAULT;
        deviceId = DEVICE_ID_DEFAULT;
        deviceToken = DEVICE_TOKEN_DEFAULT;
        claimed = false;
        mqttProvisioned = false;
        mqttBrokerHost = "";
        mqttCredentialSchemaVersion = 0;

        // Delete config file
        if (LittleFS.begin()) {
            LittleFS.remove(CONFIG_FILE);
            LittleFS.remove(CONFIG_BACKUP_FILE);
            LittleFS.remove(CONFIG_TEMP_FILE);
        }

        Serial.println(F("[Config] Reset complete"));
    }

    // Apply an already-parsed server config object (the buildDeviceConfig
    // payload). Only overrides fields that are present, so a partial payload
    // never wipes existing values. Persists to flash.
    bool applyServerConfig(JsonVariantConst c, bool persist) {
        if (c.isNull() || !c.is<JsonObjectConst>()) {
            Serial.println(F("[Config] applyServerConfig: not an object"));
            return false;
        }
        JsonObjectConst o = c.as<JsonObjectConst>();

        // A retained config is delivered on every reconnect. The version is
        // authoritative: if this already-provisioned device has the same
        // version, all fields are already persisted and another flash write
        // only burns endurance. During first provisioning we still accept the
        // delivery as proof even when a legacy default happens to be version 0.
        long incomingVersion = -1;
        if (c["config_version"].is<long>()) incomingVersion = c["config_version"].as<long>();
        else if (c["config_version"].is<int>()) incomingVersion = c["config_version"].as<int>();
        if (isMqttProvisioned() && incomingVersion >= 0 && incomingVersion == configVersion) {
            Serial.printf("[Config] Server config version %ld already applied\n", incomingVersion);
            return true;
        }

        // Operational (accept new *_ms names; fall back to legacy short names)
        if (c["measurement_interval_ms"].is<uint32_t>()) measurementIntervalMs = c["measurement_interval_ms"].as<uint32_t>();
        else if (c["measurement_interval"].is<uint32_t>()) measurementIntervalMs = c["measurement_interval"].as<uint32_t>();
        if (c["report_interval_ms"].is<uint32_t>()) reportIntervalMs = c["report_interval_ms"].as<uint32_t>();
        else if (c["report_interval"].is<uint32_t>()) reportIntervalMs = c["report_interval"].as<uint32_t>();

        if (c["tank_full_threshold_l"].is<float>()) tankFullThreshold = c["tank_full_threshold_l"].as<float>();
        else if (c["tank_full_threshold"].is<float>()) tankFullThreshold = c["tank_full_threshold"].as<float>();
        if (c["tank_low_threshold_l"].is<float>()) tankLowThreshold = c["tank_low_threshold_l"].as<float>();
        else if (c["tank_low_threshold"].is<float>()) tankLowThreshold = c["tank_low_threshold"].as<float>();
        if (c["battery_low_threshold_v"].is<float>()) batteryLowThreshold = c["battery_low_threshold_v"].as<float>();
        else if (c["battery_low_threshold"].is<float>()) batteryLowThreshold = c["battery_low_threshold"].as<float>();

        // Percentage thresholds. Present-and-numeric -> set; present-and-null
        // -> clear (<0). Absent -> leave as-is (partial payload safe).
        if (o.containsKey("tank_full_threshold_pct"))
            tankFullThresholdPct = c["tank_full_threshold_pct"].is<float>() ? c["tank_full_threshold_pct"].as<float>() : -1;
        if (o.containsKey("tank_low_threshold_pct"))
            tankLowThresholdPct = c["tank_low_threshold_pct"].is<float>() ? c["tank_low_threshold_pct"].as<float>() : -1;

        // Derived calibration distances (authoritative from the server).
        if (c["level_empty_cm"].is<float>()) levelEmptyCm = c["level_empty_cm"].as<float>();
        if (c["level_full_cm"].is<float>()) levelFullCm = c["level_full_cm"].as<float>();

        // Geometry -> overrides compile-time TANK_* defines.
        if (c["shape"].is<const char*>()) tankShape = c["shape"].as<String>();
        if (c["diameter_cm"].is<float>()) diameterCm = c["diameter_cm"].as<float>();
        if (c["length_cm"].is<float>()) lengthCm = c["length_cm"].as<float>();
        if (c["width_cm"].is<float>()) widthCm = c["width_cm"].as<float>();
        if (c["height_cm"].is<float>()) heightCm = c["height_cm"].as<float>();
        if (c["sensor_offset_cm"].is<float>()) sensorOffsetCm = c["sensor_offset_cm"].as<float>();
        if (c["dead_zone_cm"].is<float>()) deadZoneCm = c["dead_zone_cm"].as<float>();
        if (c["parallel_unit_count"].is<int>()) parallelUnitCount = c["parallel_unit_count"].as<int>();
        if (c["total_capacity_l"].is<float>()) totalCapacityL = c["total_capacity_l"].as<float>();

        // Sync mode + version.
        if (c["sync_mode"].is<const char*>()) syncMode = c["sync_mode"].as<String>();
        if (incomingVersion >= 0) configVersion = incomingVersion;

        Serial.printf("[Config] Applied server config (config_version=%ld, shape=%s, H=%.1f, offset=%.1f, dead=%.1f, units=%d)\n",
            configVersion, tankShape.c_str(), heightCm, sensorOffsetCm, deadZoneCm, parallelUnitCount);

        if (persist) save();
        return true;
    }

    bool applyFromJson(const char* json) {
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, json);

        if (error) {
            Serial.printf("[Config] JSON parse error: %s\n", error.c_str());
            return false;
        }

        // Accept either a bare config object or a { "config": {...} } envelope.
        if (doc["config"].is<JsonObjectConst>()) {
            return applyServerConfig(doc["config"]);
        }
        return applyServerConfig(doc.as<JsonVariantConst>());
    }

    void adoptConfigVersion(long version, bool persist) {
        if (version < 0 || version == configVersion) return;
        configVersion = version;
        if (persist) save();
    }

    bool isMqttProvisioned() {
        return claimed && mqttProvisioned &&
               mqttBrokerHost == MQTT_BROKER &&
               mqttCredentialSchemaVersion == MQTT_CREDENTIAL_SCHEMA_VERSION &&
               deviceId.length() > 0 && deviceToken.length() > 0;
    }

    void markMqttProvisioned() {
        mqttProvisioned = true;
        mqttBrokerHost = MQTT_BROKER;
        mqttCredentialSchemaVersion = MQTT_CREDENTIAL_SCHEMA_VERSION;
        save();
    }

    String getOtaHostname() {
        return deviceId;
    }
}
