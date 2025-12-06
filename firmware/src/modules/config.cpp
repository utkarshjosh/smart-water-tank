/**
 * Configuration Module Implementation
 */

#include "config.h"
#include <Arduino.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

#define CONFIG_FILE "/config.json"

namespace Config {
    // Runtime configuration with defaults
    unsigned long measurementIntervalMs = MEASUREMENT_INTERVAL_MS;
    unsigned long reportIntervalMs = REPORT_INTERVAL_MS;
    float tankFullThreshold = TANK_FULL_THRESHOLD_L;
    float tankLowThreshold = TANK_LOW_THRESHOLD_L;
    float batteryLowThreshold = BATTERY_LOW_THRESHOLD_V;
    float levelEmptyCm = LEVEL_EMPTY_CM;
    float levelFullCm = LEVEL_FULL_CM;
    
    // WiFi credentials (defaults from config.h)
    String wifiSsid = WIFI_SSID_DEFAULT;
    String wifiPassword = WIFI_PASSWORD_DEFAULT;
    
    // Device identification (defaults from config.h)
    String deviceId = DEVICE_ID_DEFAULT;
    String deviceToken = DEVICE_TOKEN_DEFAULT;

    void load() {
        Serial.println(F("[Config] Loading from flash..."));
        
        if (!LittleFS.begin()) {
            Serial.println(F("[Config] Failed to mount filesystem, using defaults"));
            return;
        }
        
        if (!LittleFS.exists(CONFIG_FILE)) {
            Serial.println(F("[Config] No config file, using defaults"));
            return;
        }
        
        File file = LittleFS.open(CONFIG_FILE, "r");
        if (!file) {
            Serial.println(F("[Config] Failed to open config file"));
            return;
        }
        
        StaticJsonDocument<1024> doc;
        DeserializationError error = deserializeJson(doc, file);
        file.close();
        
        if (error) {
            Serial.printf("[Config] Parse error: %s\n", error.c_str());
            return;
        }
        
        // Load values
        measurementIntervalMs = doc["measurement_interval"] | MEASUREMENT_INTERVAL_MS;
        reportIntervalMs = doc["report_interval"] | REPORT_INTERVAL_MS;
        tankFullThreshold = doc["tank_full_threshold"] | TANK_FULL_THRESHOLD_L;
        tankLowThreshold = doc["tank_low_threshold"] | TANK_LOW_THRESHOLD_L;
        batteryLowThreshold = doc["battery_low_threshold"] | BATTERY_LOW_THRESHOLD_V;
        levelEmptyCm = doc["level_empty_cm"] | LEVEL_EMPTY_CM;
        levelFullCm = doc["level_full_cm"] | LEVEL_FULL_CM;
        
        // Load WiFi credentials
        if (doc.containsKey("wifi_ssid")) {
            wifiSsid = doc["wifi_ssid"].as<String>();
        }
        if (doc.containsKey("wifi_password")) {
            wifiPassword = doc["wifi_password"].as<String>();
        }
        
        // Load device identification
        if (doc.containsKey("device_id")) {
            deviceId = doc["device_id"].as<String>();
        }
        if (doc.containsKey("device_token")) {
            deviceToken = doc["device_token"].as<String>();
        }
        
        Serial.println(F("[Config] Loaded successfully"));
    }

    void save() {
        Serial.println(F("[Config] Saving to flash..."));
        
        if (!LittleFS.begin()) {
            Serial.println(F("[Config] Failed to mount filesystem"));
            return;
        }
        
        File file = LittleFS.open(CONFIG_FILE, "w");
        if (!file) {
            Serial.println(F("[Config] Failed to create config file"));
            return;
        }
        
        StaticJsonDocument<1024> doc;
        doc["measurement_interval"] = measurementIntervalMs;
        doc["report_interval"] = reportIntervalMs;
        doc["tank_full_threshold"] = tankFullThreshold;
        doc["tank_low_threshold"] = tankLowThreshold;
        doc["battery_low_threshold"] = batteryLowThreshold;
        doc["level_empty_cm"] = levelEmptyCm;
        doc["level_full_cm"] = levelFullCm;
        doc["wifi_ssid"] = wifiSsid;
        doc["wifi_password"] = wifiPassword;
        doc["device_id"] = deviceId;
        doc["device_token"] = deviceToken;
        
        serializeJson(doc, file);
        file.close();
        
        Serial.println(F("[Config] Saved successfully"));
    }

    void reset() {
        Serial.println(F("[Config] Resetting to defaults..."));
        
        measurementIntervalMs = MEASUREMENT_INTERVAL_MS;
        reportIntervalMs = REPORT_INTERVAL_MS;
        tankFullThreshold = TANK_FULL_THRESHOLD_L;
        tankLowThreshold = TANK_LOW_THRESHOLD_L;
        batteryLowThreshold = BATTERY_LOW_THRESHOLD_V;
        levelEmptyCm = LEVEL_EMPTY_CM;
        levelFullCm = LEVEL_FULL_CM;
        wifiSsid = WIFI_SSID_DEFAULT;
        wifiPassword = WIFI_PASSWORD_DEFAULT;
        deviceId = DEVICE_ID_DEFAULT;
        deviceToken = DEVICE_TOKEN_DEFAULT;
        
        // Delete config file
        if (LittleFS.begin()) {
            LittleFS.remove(CONFIG_FILE);
        }
        
        Serial.println(F("[Config] Reset complete"));
    }

    bool applyFromJson(const char* json) {
        StaticJsonDocument<1024> doc;
        DeserializationError error = deserializeJson(doc, json);
        
        if (error) {
            Serial.printf("[Config] JSON parse error: %s\n", error.c_str());
            return false;
        }
        
        // Apply values (only if present in JSON)
        if (doc.containsKey("measurement_interval")) {
            measurementIntervalMs = doc["measurement_interval"];
        }
        if (doc.containsKey("report_interval")) {
            reportIntervalMs = doc["report_interval"];
        }
        if (doc.containsKey("tank_full_threshold")) {
            tankFullThreshold = doc["tank_full_threshold"];
        }
        if (doc.containsKey("tank_low_threshold")) {
            tankLowThreshold = doc["tank_low_threshold"];
        }
        if (doc.containsKey("battery_low_threshold")) {
            batteryLowThreshold = doc["battery_low_threshold"];
        }
        if (doc.containsKey("level_empty_cm")) {
            levelEmptyCm = doc["level_empty_cm"];
        }
        if (doc.containsKey("level_full_cm")) {
            levelFullCm = doc["level_full_cm"];
        }
        if (doc.containsKey("wifi_ssid")) {
            wifiSsid = doc["wifi_ssid"].as<String>();
        }
        if (doc.containsKey("wifi_password")) {
            wifiPassword = doc["wifi_password"].as<String>();
        }
        if (doc.containsKey("device_id")) {
            deviceId = doc["device_id"].as<String>();
        }
        if (doc.containsKey("device_token")) {
            deviceToken = doc["device_token"].as<String>();
        }
        
        save();
        return true;
    }
    
    String getOtaHostname() {
        return deviceId;
    }
}

