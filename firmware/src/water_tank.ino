/**
 * ============================================================================
 * WATER TANK MONITORING SYSTEM - Main Firmware
 * ============================================================================
 * 
 * A modular, low-power water level monitoring system for ESP8266.
 * 
 * Features:
 *   - Ultrasonic water level sensing
 *   - WiFi connectivity with auto-reconnect
 *   - HTTPS/MQTT data reporting
 *   - OTA firmware updates
 *   - Local audio alerts
 *   - Temperature monitoring
 *   - Battery level tracking
 * 
 * Author: Your Name
 * License: MIT
 * ============================================================================
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>

// Project modules (flattened for arduino-cli)
#include "types.h"
#include "config.h"
#include "wifi_manager.h"
#include "sensor.h"
#include "alerts.h"
#include "data_reporter.h"
#include "ota_handler.h"
#include "storage.h"

// ============================================================================
// Global State
// ============================================================================

SystemState state;

// ============================================================================
// Setup
// ============================================================================

void setup() {
    // Initialize serial for debugging
    Serial.begin(115200);
    delay(100);
    
    Serial.println();
    Serial.println(F("═══════════════════════════════════════════════════"));
    Serial.println(F("  WATER TANK MONITOR"));
    Serial.print(F("  Version: "));
    Serial.println(FIRMWARE_VERSION);
    Serial.println(F("═══════════════════════════════════════════════════"));
    Serial.println();

    // Initialize modules
    Storage::init();
    Config::load();
    
    Sensor::init();
    Alerts::init();
    
    // Initialize state timers
    state.lastOtaCheck = 0;  // Will check on first loop after WiFi connects
    
    // Connect to WiFi (will check for 3 restarts and start config portal if needed)
    Serial.println(F("[WiFi] Connecting..."));
    WifiManager::init();
    
    // Connect (will automatically check for 3 restarts and start config portal if needed)
    if (WifiManager::connect()) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());
        
        // Initialize OTA after WiFi is connected
        OTAHandler::init();
        
        // Initialize data reporter
        DataReporter::init();
        
        // Check for OTA updates immediately after connecting
        // (will also check periodically in loop)
        Serial.println(F("[OTA] Checking for updates on startup..."));
        OTAHandler::checkForUpdate();
        state.lastOtaCheck = millis();
    } else {
        // If connect() returns false, it might have started config portal
        // Config portal will restart the device when done, so we won't reach here
        Serial.println(F("[WiFi] Connection failed, will retry..."));
        state.wifiConnected = false;
    }
    
    // Play startup sound
    Alerts::playStartupSound();
    
    Serial.println(F("[System] Setup complete!"));
    Serial.println();
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
    unsigned long now = millis();
    
    // Handle OTA updates
    OTAHandler::handle();
    
    // Check WiFi connection
    if (!WifiManager::isConnected()) {
        if (state.wifiConnected) {
            Serial.println(F("[WiFi] Connection lost, reconnecting..."));
            state.wifiConnected = false;
        }
        WifiManager::reconnect();
    } else if (!state.wifiConnected) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        Serial.println(F("[WiFi] Reconnected!"));
    }
    
    // Take measurements at configured interval
    if (now - state.lastMeasurement >= Config::measurementIntervalMs) {
        takeMeasurement();
        state.lastMeasurement = now;
    }
    
    // Report data at configured interval
    if (now - state.lastReport >= Config::reportIntervalMs) {
        if (state.wifiConnected) {
            reportData();
        } else {
            // Store locally for later upload
            Storage::bufferMeasurement(state);
        }
        state.lastReport = now;
    }
    
    // Check for OTA updates at configured interval
    if (state.wifiConnected && (now - state.lastOtaCheck >= OTA_CHECK_INTERVAL_MS)) {
        Serial.println(F("[OTA] Periodic update check..."));
        OTAHandler::checkForUpdate();
        state.lastOtaCheck = now;
    }
    
    // Check alert conditions
    checkAlerts();
    
    // Small delay to prevent tight loop
    delay(10);
}

// ============================================================================
// Measurement Functions
// ============================================================================

void takeMeasurement() {
    Serial.println(F("[Sensor] Taking measurement..."));
    
    // Read water level
    state.waterLevelCm = Sensor::readWaterLevel();
    state.volumeLiters = Sensor::calculateVolume(state.waterLevelCm);
    
    // Read temperature
    state.temperatureC = Sensor::readTemperature();
    
    // Read battery voltage
    state.batteryVoltage = Sensor::readBatteryVoltage();
    
    // Get WiFi signal strength
    if (state.wifiConnected) {
        state.wifiRssi = WiFi.RSSI();
    }
    
    // Log measurement
    Serial.printf("[Sensor] Level: %.1f cm, Volume: %.1f L, Temp: %.1f°C, Battery: %.2fV\n",
        state.waterLevelCm,
        state.volumeLiters,
        state.temperatureC,
        state.batteryVoltage
    );
}

void reportData() {
    Serial.println(F("[Report] Sending data..."));
    
    bool success = DataReporter::send(
        state.waterLevelCm,
        state.volumeLiters,
        state.temperatureC,
        state.batteryVoltage,
        state.wifiRssi
    );
    
    if (success) {
        Serial.println(F("[Report] Data sent successfully"));
        // Try to send any buffered data
        Storage::flushBuffer();
    } else {
        Serial.println(F("[Report] Failed to send, buffering locally"));
        Storage::bufferMeasurement(state);
    }
}

void checkAlerts() {
    // Check for tank full
    if (state.volumeLiters >= Config::tankFullThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Tank is FULL!"));
            Alerts::triggerTankFull();
            state.alertActive = true;
        }
    }
    // Check for tank low
    else if (state.volumeLiters <= Config::tankLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Tank is LOW!"));
            Alerts::triggerTankLow();
            state.alertActive = true;
        }
    }
    // Check for battery low
    else if (state.batteryVoltage < Config::batteryLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Battery LOW!"));
            Alerts::triggerBatteryLow();
            state.alertActive = true;
        }
    }
    else {
        state.alertActive = false;
    }
}

