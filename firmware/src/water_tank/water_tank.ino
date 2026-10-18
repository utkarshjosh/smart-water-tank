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
#include "credential_guard.h"
#include "wifi_manager.h"
#include "sensor.h"
#include "alerts.h"
#include "data_reporter.h"
#include "mqtt_reporter.h"
#include "ota_handler.h"
#include "power_manager.h"
#include "storage.h"
#include "display.h"
#include "buttons.h"
#include "progress.h"

// ============================================================================
// Global State
// ============================================================================

SystemState state;

#if MQTT_ENABLED
static uint8_t mqttPublishFailures = 0;
constexpr uint8_t MQTT_FAILURES_BEFORE_HTTP_FALLBACK = 3;
#endif

static bool reportData();

#if ENABLE_DEEP_SLEEP
static void runDutyCycle() {
    // We reached this point only after Wi-Fi, config, and transport modules
    // have initialized. One normal wake reports once, keeps a short receive
    // window for retained config/commands, then sleeps regardless of outcome.
    const bool delivered = reportData();

    if (delivered && !PowerManager::awakeBudgetExceeded()) {
        const unsigned long receiveStarted = millis();
        while (millis() - receiveStarted < POST_PUBLISH_RECEIVE_MS && !PowerManager::awakeBudgetExceeded()) {
            OTAHandler::handle();
            #if MQTT_ENABLED
            MqttReporter::loop();
            #endif
            delay(10);
        }

        // OTA is deliberately deferred until after telemetry and config are
        // complete. The RTC scheduler prevents a check on every wake.
        if (PowerManager::otaCheckDue() && !PowerManager::awakeBudgetExceeded()) {
            Serial.println(F("[OTA] Scheduled update check..."));
            PowerManager::markOtaCheckAttempted();
            OTAHandler::checkForUpdate();
        }
    }

    #if MQTT_ENABLED
    MqttReporter::disconnect();
    #endif
    PowerManager::finishCycle(delivered);
    PowerManager::sleepUntilNextCycle(Config::reportIntervalMs);
}
#endif

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
    PowerManager::init();
    
    // Intermediate 8-second keep-alive pulse to reset TP4221B power bank 16s auto-shutdown
    if (PowerManager::shouldPerformKeepAlivePulseOnly(Config::reportIntervalMs)) {
        PowerManager::executeKeepAlivePulseOnly();
        return; // ESP.deepSleep() does not return
    }

    Sensor::init();

    #if DISPLAY_ENABLED
    // Early, so the panel can narrate the boot instead of sitting blank while
    // WiFi negotiates. A missing panel is not fatal - init() returns false and
    // every later call is a no-op.
    Display::init();
    Buttons::init();
    // The version rather than "starting up...": on a device that is now only
    // ever updated over the air, the splash is the one moment you can read
    // which image actually booted without pressing a button twice.
    Display::showMessage("AquaMind", FIRMWARE_VERSION);
    #endif

    #if ENABLE_LOCAL_ALERTS
    Alerts::init();
    #endif

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
    #if DISPLAY_ENABLED
    Display::showMessage("WiFi connecting", Config::wifiSsid.c_str());
    #endif
    WifiManager::init();

    if (WifiManager::connect()) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        state.fastReportMode = true;
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());

        #if ENABLE_WIFI_LIGHT_SLEEP
        // Keeps the association (so the device stays continuously online and
        // MQTT keeps its subscriptions) while the CPU sleeps between DTIM
        // beacons. Buttons still respond because the loop resumes on wake.
        WiFi.setSleepMode(WIFI_LIGHT_SLEEP, WIFI_LIGHT_SLEEP_LISTEN_INTERVAL);
        Serial.println(F("[Power] WiFi light sleep enabled"));
        #endif

        // A device that's connected to WiFi but never completed pairing has
        // no usable device id/token - send it back into the config portal
        // instead of reporting with an empty token forever.
        if (!Config::isMqttProvisioned()) {
            Serial.println(F("[WiFi] MQTT provisioning proof missing, entering config portal..."));
            #if DISPLAY_ENABLED
            // This screen stays up for the whole portal. A device that was
            // paired before is here because the server stopped accepting its
            // token, or it predates MQTT provisioning - either way it needs a
            // fresh pairing code, and the screen should say so.
            Display::showMessage(Config::claimed ? "RE-PAIR NEEDED" : "PAIRING MODE", AP_SSID);
            #endif
            WifiManager::connect(true); // blocks; always restarts the device when it returns
            return;
        }

        // Initialize OTA after WiFi is connected
        OTAHandler::init();
        
        // Initialize data reporter (HTTP path; also used as the buffered-data
        // flush fallback even when MQTT is the primary transport).
        DataReporter::init();

        #if MQTT_ENABLED
        // MQTT transport: connect, announce, and subscribe to config/cmd.
        // init() may spend up to 45 seconds inside NTP, which narrates itself;
        // connect() then blocks in a TLS handshake we cannot tick from, so it
        // gets a static line rather than a bar that would sit still.
        MqttReporter::init();
        Progress::note("Cloud connecting", "TLS handshake");
        MqttReporter::connect();
        #endif

        #if ENABLE_DEEP_SLEEP
        runDutyCycle();
        return; // ESP.deepSleep() does not return; keeps static analysis sane.
        #else
        // RTC scheduling prevents an OTA HTTP request on every reboot.
        if (PowerManager::otaCheckDue()) {
            Serial.println(F("[OTA] Scheduled update check..."));
            PowerManager::markOtaCheckAttempted();
            OTAHandler::checkForUpdate();
            state.lastOtaCheck = millis();
        }
        #endif
    } else {
        // If connect() returns false, it might have started config portal
        // Config portal will restart the device when done, so we won't reach here
        Serial.println(F("[WiFi] Connection failed, will retry..."));
        state.wifiConnected = false;
        #if ENABLE_DEEP_SLEEP
        Storage::bufferMeasurement(state);
        PowerManager::finishCycle(false);
        PowerManager::sleepUntilNextCycle(Config::reportIntervalMs);
        return;
        #endif
    }
    
    #if ENABLE_LOCAL_ALERTS
    // Play startup sound
    Alerts::playStartupSound();
    #endif
    
    // Narration is over; the first loop() pass draws real state. Doing this
    // explicitly (update() would also do it) marks where boot ends.
    Progress::clear();

    Serial.println(F("[System] Setup complete!"));
    Serial.println();
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
    unsigned long now = millis();

    #if DISPLAY_ENABLED
    // Serviced first so a press is never delayed behind network work.
    Buttons::update();

    if (Buttons::takeShortPress(Buttons::NEXT)) {
        Display::nextScreen();
        Display::backlightOn();
    }

    // "Refresh now": re-measure and let the existing report path fire on this
    // pass rather than duplicating the transport logic here.
    if (Buttons::takeShortPress(Buttons::SELECT)) {
        Display::backlightOn();
        takeMeasurement();
        state.lastMeasurement = now;
        state.lastReport = 0;
    }

    // Held: back into pairing. connect(true) blocks and always restarts the
    // device when the portal closes, so nothing after this runs.
    if (Buttons::takeLongPress(Buttons::SELECT)) {
        Serial.println(F("[Buttons] Long press - entering config portal"));
        Display::showMessage("PAIRING MODE", AP_SSID);
        WifiManager::connect(true);
    }

    Display::tick();
    #endif

    // Handle OTA updates
    OTAHandler::handle();

    #if MQTT_ENABLED
    // Service the MQTT link (reconnect + inbound config/cmd) once paired.
    if (Config::isMqttProvisioned() && state.wifiConnected) {
        MqttReporter::loop();
    }
    #endif

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
    if (Config::isMqttProvisioned()) {
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
    
    // RTC scheduling survives reboot/deep sleep, unlike millis().
    if (state.wifiConnected && PowerManager::otaCheckDue()) {
        Serial.println(F("[OTA] Periodic update check..."));
        PowerManager::markOtaCheckAttempted();
        OTAHandler::checkForUpdate();
        state.lastOtaCheck = now;
    }
    
    // Check alert conditions
    checkAlerts();

    #if DISPLAY_ENABLED
    // Last, so the panel shows the state this pass actually produced. update()
    // skips the I2C write when the rendered text is unchanged.
    Display::update(state);
    #endif

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

static bool reportData() {
    Serial.println(F("[Report] Sending data..."));

    // Transport selection: MQTT when enabled (telemetry carries config_version;
    // config arrives via the retained config topic), HTTP otherwise.
#if MQTT_ENABLED
    bool success = MqttReporter::connected() && MqttReporter::publishTelemetry(state);
    if (success) {
        mqttPublishFailures = 0;
    } else if (mqttPublishFailures < MQTT_FAILURES_BEFORE_HTTP_FALLBACK) {
        mqttPublishFailures++;
    }

    // HTTP remains a deliberately bounded recovery transport for Part I. It
    // is attempted once only after repeated normal MQTT failures, never as a
    // second permanently active ingestion path. A token the device API just
    // refused waits out its backoff, as the MQTT reconnect does.
    if (!success && (mqttPublishFailures >= MQTT_FAILURES_BEFORE_HTTP_FALLBACK || PowerManager::httpRecoveryDue()) &&
        !CredentialGuard::holdOff(CredentialGuard::Transport::Http)) {
        Serial.println(F("[Report] MQTT failure threshold reached; trying one HTTP recovery send"));
        success = DataReporter::send(state);
        mqttPublishFailures = 0;
    }
#else
    bool success = !CredentialGuard::holdOff(CredentialGuard::Transport::Http) && DataReporter::send(state);
#endif

    if (success) {
        Serial.println(F("[Report] Data sent successfully"));
#if MQTT_ENABLED
        // A broker write is not an application receipt. Keep legacy buffered
        // readings for the bounded HTTP recovery path; Part II replaces this
        // with message IDs plus backend commit receipts.
#else
        // Try to send any buffered data
        Storage::flushBuffer();
#endif

        // Caught up - back off to the normal, slower report cadence
        if (state.fastReportMode && Storage::getBufferCount() == 0) {
            Serial.println(F("[Report] Caught up, returning to normal report interval"));
            state.fastReportMode = false;
        }
    } else {
        Serial.println(F("[Report] Failed to send, buffering locally"));
        Storage::bufferMeasurement(state);
    }

    return success;
}

void checkAlerts() {
    bool alertTriggered = false;

    // Tank full/low checks need a real water level reading - a disconnected
    // sensor's placeholder volume (0L) must never be read as "tank LOW".
    if (state.waterLevelValid) {
        if (state.volumeLiters >= Config::tankFullThreshold) {
            if (!state.alertActive) {
                Serial.println(F("[Alert] Tank is FULL!"));
                #if ENABLE_LOCAL_ALERTS
                Alerts::triggerTankFull();
                #endif
            }
            alertTriggered = true;
        } else if (state.volumeLiters <= Config::tankLowThreshold) {
            if (!state.alertActive) {
                Serial.println(F("[Alert] Tank is LOW!"));
                #if ENABLE_LOCAL_ALERTS
                Alerts::triggerTankLow();
                #endif
            }
            alertTriggered = true;
        }
    }

    // Check for battery low
    if (!alertTriggered && state.batteryVoltage < Config::batteryLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Battery LOW!"));
            #if ENABLE_LOCAL_ALERTS
            Alerts::triggerBatteryLow();
            #endif
        }
        alertTriggered = true;
    }

    state.alertActive = alertTriggered;
}
