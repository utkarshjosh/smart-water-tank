/**
 * ============================================================================
 * WATER TANK MONITORING SYSTEM - Wokwi Simulator Build (ESP32)
 * ============================================================================
 *
 * Runs the same modular firmware as firmware/src/water_tank.ino (config,
 * claim_client, sensor, alerts, data_reporter, ota_handler, storage) inside
 * the Wokwi simulator, so the pairing/claim flow can be exercised end to end
 * without hardware. See README.md in this folder for why this is an ESP32
 * build (Wokwi has no NodeMCU/ESP8266 board) and how the pairing portal
 * differs from the real firmware (softAP -> STA-hosted page, forwarded to
 * localhost).
 *
 * Setup/loop logic below is otherwise unchanged from the real firmware.
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>

// Project modules (flattened for arduino-cli, same convention as firmware/src)
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
    Serial.begin(115200);
    delay(100);

    Serial.println();
    Serial.println(F("═══════════════════════════════════════════════════"));
    Serial.println(F("  WATER TANK MONITOR (Wokwi sim)"));
    Serial.print(F("  Version: "));
    Serial.println(FIRMWARE_VERSION);
    Serial.println(F("═══════════════════════════════════════════════════"));
    Serial.println();

    // Initialize modules
    Storage::init();
    Config::load();

    Sensor::init();
    Alerts::init();

    state.lastOtaCheck = 0;  // Will check on first loop after WiFi connects

    Serial.println(F("[WiFi] Connecting..."));
    WifiManager::init();

    if (WifiManager::connect()) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());

        // A device that's connected to WiFi but never completed pairing has
        // no usable device id/token - send it back into the config portal
        // instead of reporting with an empty token forever.
        if (!Config::claimed) {
            Serial.println(F("[WiFi] Device not yet paired, entering config portal..."));
            WifiManager::connect(true); // blocks; restarts the device when done
            return;
        }

        OTAHandler::init();
        DataReporter::init();

        Serial.println(F("[OTA] Checking for updates on startup..."));
        OTAHandler::checkForUpdate();
        state.lastOtaCheck = millis();
    } else {
        Serial.println(F("[WiFi] Connection failed, will retry..."));
        state.wifiConnected = false;
    }

    Alerts::playStartupSound();

    Serial.println(F("[System] Setup complete!"));
    Serial.println();
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
    unsigned long now = millis();

    OTAHandler::handle();

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

    if (now - state.lastMeasurement >= Config::measurementIntervalMs) {
        takeMeasurement();
        state.lastMeasurement = now;
    }

    if (now - state.lastReport >= Config::reportIntervalMs) {
        if (state.wifiConnected) {
            reportData();
        } else {
            Storage::bufferMeasurement(state);
        }
        state.lastReport = now;
    }

    if (state.wifiConnected && (now - state.lastOtaCheck >= OTA_CHECK_INTERVAL_MS)) {
        Serial.println(F("[OTA] Periodic update check..."));
        OTAHandler::checkForUpdate();
        state.lastOtaCheck = now;
    }

    checkAlerts();

    delay(10);
}

// ============================================================================
// Measurement Functions
// ============================================================================

void takeMeasurement() {
    Serial.println(F("[Sensor] Taking measurement..."));

    state.waterLevelCm = Sensor::readWaterLevel();
    state.volumeLiters = Sensor::calculateVolume(state.waterLevelCm);
    state.temperatureC = Sensor::readTemperature();
    state.batteryVoltage = Sensor::readBatteryVoltage();

    if (state.wifiConnected) {
        state.wifiRssi = WiFi.RSSI();
    }

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
        Storage::flushBuffer();
    } else {
        Serial.println(F("[Report] Failed to send, buffering locally"));
        Storage::bufferMeasurement(state);
    }
}

void checkAlerts() {
    if (state.volumeLiters >= Config::tankFullThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Tank is FULL!"));
            Alerts::triggerTankFull();
            state.alertActive = true;
        }
    }
    else if (state.volumeLiters <= Config::tankLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Tank is LOW!"));
            Alerts::triggerTankLow();
            state.alertActive = true;
        }
    }
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
