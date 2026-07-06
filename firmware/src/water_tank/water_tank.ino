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

    // Take a real measurement now, before any WiFi/report timer can fire.
    // Without this, state.waterLevelCm stays at its zero-initialized value
    // until the first MEASUREMENT_INTERVAL_MS elapses (60s) - but reports
    // can go out after just FAST_REPORT_INTERVAL_MS (20s), which sent a
    // fabricated "0cm" reading (read as tank-full) on every boot/reconnect.
    takeMeasurement();
    state.lastMeasurement = millis();

    // Initialize state timers
    state.lastOtaCheck = 0;  // Will check on first loop after WiFi connects
    
    // Connect to WiFi (will open the config portal after WIFI_RESTART_THRESHOLD
    // restarts in a row with no successful connection)
    Serial.println(F("[WiFi] Connecting..."));
    WifiManager::init();

    if (WifiManager::connect()) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        state.fastReportMode = true;
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());

        // A device that's connected to WiFi but never completed pairing has
        // no usable device id/token - send it back into the config portal
        // instead of reporting with an empty token forever.
        if (!Config::claimed) {
            Serial.println(F("[WiFi] Device not yet paired, entering config portal..."));
            WifiManager::connect(true); // blocks; always restarts the device when it returns
            return;
        }

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
        state.fastReportMode = true;
        state.lastReport = 0; // report soon instead of waiting out the old interval
        Serial.println(F("[WiFi] Reconnected!"));
    }

    // Take measurements at configured interval
    if (now - state.lastMeasurement >= Config::measurementIntervalMs) {
        takeMeasurement();
        state.lastMeasurement = now;
    }

    // A device that hasn't completed the claim-code pairing flow has no
    // device id/token to report under - never send or buffer telemetry
    // until it's claimed, even if it's technically connected to WiFi.
    if (Config::claimed) {
        unsigned long reportInterval = state.fastReportMode ? FAST_REPORT_INTERVAL_MS : Config::reportIntervalMs;
        if (now - state.lastReport >= reportInterval) {
            if (state.wifiConnected) {
                reportData();
            } else {
                // Store locally for later upload
                Storage::bufferMeasurement(state);
            }
            state.lastReport = now;
        }
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
    state.waterLevelCm = Sensor::readWaterLevel(state.waterLevelValid);
    state.volumeLiters = state.waterLevelValid ? Sensor::calculateVolume(state.waterLevelCm) : 0;

    // Read temperature
    state.temperatureC = Sensor::readTemperature(state.temperatureValid);
    
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

    bool success = DataReporter::send(state);

    if (success) {
        Serial.println(F("[Report] Data sent successfully"));
        // Try to send any buffered data
        Storage::flushBuffer();

        // Caught up - back off to the normal, slower report cadence
        if (state.fastReportMode && Storage::getBufferCount() == 0) {
            Serial.println(F("[Report] Caught up, returning to normal report interval"));
            state.fastReportMode = false;
        }
    } else {
        Serial.println(F("[Report] Failed to send, buffering locally"));
        Storage::bufferMeasurement(state);
    }
}

void checkAlerts() {
    bool alertTriggered = false;

    // Tank full/low checks need a real water level reading - a disconnected
    // sensor's placeholder volume (0L) must never be read as "tank LOW".
    if (state.waterLevelValid) {
        if (state.volumeLiters >= Config::tankFullThreshold) {
            if (!state.alertActive) {
                Serial.println(F("[Alert] Tank is FULL!"));
                Alerts::triggerTankFull();
            }
            alertTriggered = true;
        } else if (state.volumeLiters <= Config::tankLowThreshold) {
            if (!state.alertActive) {
                Serial.println(F("[Alert] Tank is LOW!"));
                Alerts::triggerTankLow();
            }
            alertTriggered = true;
        }
    }

    // Check for battery low
    if (!alertTriggered && state.batteryVoltage < Config::batteryLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Battery LOW!"));
            Alerts::triggerBatteryLow();
        }
        alertTriggered = true;
    }

    state.alertActive = alertTriggered;
}

