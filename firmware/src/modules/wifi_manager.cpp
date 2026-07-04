/**
 * WiFi Manager Module Implementation
 * Uses WiFiManager library for configuration portal
 */

#include "wifi_manager.h"
#include "config.h"
#include "claim_client.h"
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

// Restart detection file path
#define RESTART_DETECT_FILE "/restart_detect.json"

static unsigned long lastReconnectAttempt = 0;
static WiFiManager* wifiManager = nullptr;

// Custom parameter for WiFiManager - the pairing code from the AquaMind app
static WiFiManagerParameter* custom_claim_code = nullptr;

// Callback for when config is saved
void saveConfigCallback() {
    Serial.println(F("[WiFi] Config will be saved"));
}

// Restart detection structure
struct RestartData {
    uint32_t restartCount;
    unsigned long lastRestartTime;
};

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
        // Use LittleFS to persist restart data across full resets
        // Strategy: Write a marker file with timestamp on each boot
        // If file exists and was written recently (within 5 seconds), increment counter
        // Since we can't get real time between boots, we use a simpler approach:
        // - Write marker file on each boot
        // - If file exists, increment counter (assumes rapid restarts)
        // - Reset counter after successful connection or config portal
        
        uint32_t restartCount = 0;
        unsigned long currentTime = millis();
        bool fileExisted = false;
        
        // Try to read existing restart data
        if (LittleFS.begin()) {
            if (LittleFS.exists(RESTART_DETECT_FILE)) {
                fileExisted = true;
                File file = LittleFS.open(RESTART_DETECT_FILE, "r");
                if (file) {
                    StaticJsonDocument<512> doc;
                    DeserializationError error = deserializeJson(doc, file);
                    if (error == DeserializationError::Ok) {
                        restartCount = doc["restart_count"] | 0;
                        unsigned long lastTime = doc["last_restart_time"] | 0;
                        
                        // Check if last restart was "recent" (within 5 seconds)
                        // Since millis() resets, we check if the time difference is small
                        // If currentTime < lastTime, it means we wrapped around or restarted
                        // In that case, assume it's a recent restart if time is small
                        unsigned long timeDiff = (currentTime >= lastTime) ? 
                            (currentTime - lastTime) : (currentTime + (ULONG_MAX - lastTime));
                        
                        if (timeDiff <= 5000) {
                            // Recent restart, increment counter
                            restartCount++;
                            Serial.printf("[WiFi] Recent restart detected, count: %d\n", restartCount);
                        } else {
                            // Not recent, reset counter
                            restartCount = 1;
                            Serial.println(F("[WiFi] Restart after delay, resetting count"));
                        }
                    }
                    file.close();
                }
            } else {
                // First boot or file was deleted
                restartCount = 1;
            }
        }
        
        // Save restart data with current timestamp
        if (LittleFS.begin()) {
            File file = LittleFS.open(RESTART_DETECT_FILE, "w");
            if (file) {
                StaticJsonDocument<512> doc;
                doc["restart_count"] = restartCount;
                doc["last_restart_time"] = currentTime;
                serializeJson(doc, file);
                file.close();
            }
        }
        
        // Check if 3 or more restarts within 5 seconds
        if (restartCount >= 3) {
            Serial.println(F("[WiFi] 3 restarts within 5 seconds detected! Entering config portal..."));
            
            // Reset restart count
            if (LittleFS.begin()) {
                File file = LittleFS.open(RESTART_DETECT_FILE, "w");
                if (file) {
                    StaticJsonDocument<512> doc;
                    doc["restart_count"] = 0;
                    doc["last_restart_time"] = currentTime;
                    serializeJson(doc, file);
                    file.close();
                }
            }
            
            return true;
        }
        
        return false;
    }

    bool connect(bool forceConfigPortal) {
        if (!wifiManager) {
            init();
        }
        
        // Check if we should force config portal (3 restarts within 5 seconds)
        if (forceConfigPortal || shouldEnterConfigPortal()) {
            Serial.println(F("[WiFi] Starting configuration portal..."));
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
            // Connection failed, start config portal
            Serial.println(F("[WiFi] Connection failed, starting config portal..."));
            startConfigPortal();
            return false;
        }
        
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());
        
        // Reset restart count on successful connection
        if (LittleFS.begin()) {
            if (LittleFS.exists(RESTART_DETECT_FILE)) {
                File file = LittleFS.open(RESTART_DETECT_FILE, "w");
                if (file) {
                    StaticJsonDocument<512> doc;
                    doc["restart_count"] = 0;
                    doc["last_restart_time"] = millis();
                    serializeJson(doc, file);
                    file.close();
                }
            }
        }
        
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
                Serial.println(F("[WiFi] Config portal timeout"));
                return;
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
                Config::deviceId = newDeviceId;
                Config::deviceToken = newDeviceToken;
                Config::claimed = true;
                break;
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
