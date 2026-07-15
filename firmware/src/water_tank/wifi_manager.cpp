/**
 * WiFi Manager Module Implementation
 * Uses WiFiManager library for configuration portal
 */

#include "wifi_manager.h"
#include "config.h"
#include "claim_client.h"
#include "mqtt_reporter.h"
#include "power_manager.h"
#include <ESP8266WiFi.h>
#include <WiFiManager.h>

static unsigned long lastReconnectAttempt = 0;
static WiFiManager* wifiManager = nullptr;

// Custom parameter for WiFiManager - the pairing code from the AquaMind app
static WiFiManagerParameter* custom_claim_code = nullptr;

// Callback for when config is saved
void saveConfigCallback() {
    Serial.println(F("[WiFi] Config will be saved"));
}

// Restart-loop detection, stored in RTC memory (a small block of RAM kept
// alive by the RTC domain). It survives a crash, ESP.restart(), or a press
// of the reset button, but is wiped by an actual power cycle. That's exactly
// the signal we want: repeated restarts *without ever losing power* means
// the device is stuck in a loop, while a power cycle - even a quick one -
// always starts the counter back at zero. No wall-clock math needed, so
// there's nothing for millis() resetting on every boot to break.
#define RTC_RESTART_MAGIC 0x57544B31 // "WTK1"
#define RTC_RESTART_SLOT  0

struct RestartData {
    uint32_t magic;
    uint32_t restartCount;
};

static void resetRestartCounter() {
    RestartData data{RTC_RESTART_MAGIC, 0};
    ESP.rtcUserMemoryWrite(RTC_RESTART_SLOT, reinterpret_cast<uint32_t*>(&data), sizeof(data));
}

namespace WifiManager {
    void init() {
        WiFi.mode(WIFI_STA);
        WiFi.setAutoReconnect(true);
        WiFi.persistent(true);
        
        // Initialize WiFiManager
        if (!wifiManager) {
            wifiManager = new WiFiManager();
            wifiManager->setSaveConfigCallback(saveConfigCallback);
            wifiManager->setConfigPortalTimeout(180); // 3 minutes timeout
            wifiManager->setAPStaticIPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
        }
        
        // Load current config values
        Config::load();

        if (!custom_claim_code) {
            custom_claim_code = new WiFiManagerParameter("claim_code", "Pairing Code (from the AquaMind app)", "", 12);
            wifiManager->addParameter(custom_claim_code);
        }
    }

    bool shouldEnterConfigPortal() {
        RestartData data;
        ESP.rtcUserMemoryRead(RTC_RESTART_SLOT, reinterpret_cast<uint32_t*>(&data), sizeof(data));

        // Garbage/uninitialized RTC memory (e.g. this is the first boot after
        // a real power-on) doesn't carry our magic value - start fresh.
        if (data.magic != RTC_RESTART_MAGIC) {
            data.magic = RTC_RESTART_MAGIC;
            data.restartCount = 0;
        }

        data.restartCount++;
        Serial.printf("[WiFi] Restart count since last power-on/successful connect: %d\n", data.restartCount);

        bool enterPortal = data.restartCount >= WIFI_RESTART_THRESHOLD;
        if (enterPortal) {
            Serial.printf("[WiFi] %d restarts without a successful connection - entering config portal...\n", WIFI_RESTART_THRESHOLD);
            data.restartCount = 0;
        }

        ESP.rtcUserMemoryWrite(RTC_RESTART_SLOT, reinterpret_cast<uint32_t*>(&data), sizeof(data));
        return enterPortal;
    }

    bool connect(bool forceConfigPortal) {
        if (!wifiManager) {
            init();
        }
        
        // Check if we should force the config portal open (either the caller
        // asked for it directly, e.g. an unclaimed device, or we've restarted
        // too many times in a row without ever connecting)
        // A successfully MQTT-provisioned device must never turn a temporary
        // Wi-Fi/DNS/broker outage into an unattended access point. It retries
        // and lets the main loop use the bounded recovery policy instead.
        if (forceConfigPortal || (!Config::isMqttProvisioned() && shouldEnterConfigPortal())) {
            startConfigPortal();
            return false; // Will return after portal closes
        }
        
        // Try to connect with saved credentials
        Serial.printf("[WiFi] Connecting to %s...\n", Config::wifiSsid.c_str());
        
        // Set hostname before connecting
        WiFi.hostname(Config::getOtaHostname());
        
        bool connected = false;
        
        // Try autoConnect - will start portal if connection fails
        if (Config::wifiSsid.length() > 0 && Config::wifiPassword.length() > 0) {
            // Pre-fill WiFi credentials
            WiFi.begin(Config::wifiSsid.c_str(), Config::wifiPassword.c_str());
            
            unsigned long startTime = millis();
            while (WiFi.status() != WL_CONNECTED && (millis() - startTime < WIFI_CONNECT_TIMEOUT_MS)) {
                delay(500);
                Serial.print(".");
            }
            Serial.println();
            
            if (WiFi.status() == WL_CONNECTED) {
                connected = true;
            }
        }
        
        if (!connected) {
            if (Config::isMqttProvisioned()) {
                Serial.println(F("[WiFi] Connection failed; staying provisioned for bounded recovery"));
            } else {
                Serial.println(F("[WiFi] Connection failed, starting config portal..."));
                startConfigPortal();
            }
            return false;
        }
        
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());
        
        // Successful connection - the device isn't stuck in a restart loop.
        resetRestartCounter();

        return true;
    }

    bool isConnected() {
        return WiFi.status() == WL_CONNECTED;
    }

    void reconnect() {
        unsigned long now = millis();
        
        // Don't spam reconnect attempts
        if (now - lastReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) {
            return;
        }
        
        lastReconnectAttempt = now;
        
        Serial.println(F("[WiFi] Attempting reconnect..."));
        
        WiFi.disconnect();
        delay(100);
        
        if (Config::wifiSsid.length() > 0 && Config::wifiPassword.length() > 0) {
            WiFi.begin(Config::wifiSsid.c_str(), Config::wifiPassword.c_str());
        }
        
        // Non-blocking: just start the connection attempt
        // Loop will check status later
    }

    void startConfigPortal() {
        if (!wifiManager) {
            init();
        }

        const int MAX_CLAIM_ATTEMPTS = 3;
        String hardwareId = ClaimClient::getHardwareId();

        for (int attempt = 1; attempt <= MAX_CLAIM_ATTEMPTS; attempt++) {
            Serial.println(F("[WiFi] Starting configuration portal..."));
            Serial.printf("[WiFi] AP SSID: %s\n", AP_SSID);
            Serial.printf("[WiFi] AP Password: %s\n", AP_PASSWORD);
            Serial.println(F("[WiFi] Connect to the AP and configure your device"));

            // Start config portal (blocking)
            bool portalStarted = wifiManager->startConfigPortal(AP_SSID, AP_PASSWORD);

            if (!portalStarted) {
                // Never continue into normal telemetry after an unattended
                // portal timeout: the device remains deliberately unconfigured.
                // Battery deployments sleep with the same persisted backoff as
                // a failed network cycle; always-on builds preserve restart
                // behavior for bench setup and USB-powered installations.
                #if ENABLE_DEEP_SLEEP
                Serial.println(F("[WiFi] Config portal timed out; staying unconfigured and sleeping"));
                PowerManager::finishCycle(false);
                PowerManager::sleepUntilNextCycle(Config::reportIntervalMs);
                return; // ESP.deepSleep() does not return; defensive fallback.
                #else
                Serial.println(F("[WiFi] Config portal timed out, restarting..."));
                delay(1000);
                ESP.restart();
                #endif
            }

            // Config portal closed - a network was selected and WiFi connected.
            // WiFiManager already saved the WiFi creds to EEPROM; mirror them
            // into Config for consistency.
            String newWifiSsid = WiFi.SSID();
            String newWifiPassword = WiFi.psk();
            if (newWifiSsid.length() > 0 && newWifiSsid != AP_SSID) {
                Config::wifiSsid = newWifiSsid;
                Serial.printf("[WiFi] Saved SSID: %s\n", newWifiSsid.c_str());
            }
            if (newWifiPassword.length() > 0) {
                Config::wifiPassword = newWifiPassword;
            }

            // Exchange the claim code for a permanent device token now, while
            // we're online (the phone had no internet while joined to our AP,
            // so it could only hand us a short code, not a real token).
            String claimCode = String(custom_claim_code->getValue());
            String newDeviceToken, newDeviceId;
            bool claimedNow = ClaimClient::claim(claimCode, hardwareId, newDeviceToken, newDeviceId);

            if (claimedNow) {
                // Keep the legacy HTTP-era identity in RAM until the fresh
                // credential has proven MQTT/TLS and received retained config.
                const String oldDeviceId = Config::deviceId;
                const String oldDeviceToken = Config::deviceToken;
                const bool oldClaimed = Config::claimed;
                Config::deviceId = newDeviceId;
                Config::deviceToken = newDeviceToken;
                Config::claimed = true;
                Config::mqttProvisioned = false;

                MqttReporter::init();
                if (MqttReporter::verifyProvisioning()) {
                    break;
                }

                Config::deviceId = oldDeviceId;
                Config::deviceToken = oldDeviceToken;
                Config::claimed = oldClaimed;
                Config::mqttProvisioned = false;
                Serial.println(F("[WiFi] MQTT proof failed; keeping legacy credentials"));
            }

            Serial.printf("[WiFi] Pairing failed (attempt %d/%d)\n", attempt, MAX_CLAIM_ATTEMPTS);
            if (attempt < MAX_CLAIM_ATTEMPTS) {
                Serial.println(F("[WiFi] Re-opening config portal to retry the pairing code..."));
            }
        }

        // Save to flash (claimed values if pairing succeeded, otherwise
        // unclaimed - the device will re-enter the portal on next boot).
        Config::save();

        Serial.println(F("[WiFi] Config saved! Restarting..."));
        Serial.println();
        delay(2000);
        ESP.restart();
    }

    int getRssi() {
        if (isConnected()) {
            return WiFi.RSSI();
        }
        return 0;
    }

    String getIpAddress() {
        if (isConnected()) {
            return WiFi.localIP().toString();
        }
        return "0.0.0.0";
    }

    String getMacAddress() {
        return WiFi.macAddress();
    }
}
