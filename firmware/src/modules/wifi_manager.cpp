/**
 * WiFi Manager Module Implementation
 */

#include "wifi_manager.h"
#include "config.h"
#include <ESP8266WiFi.h>

static unsigned long lastReconnectAttempt = 0;

namespace WifiManager {
    void init() {
        WiFi.mode(WIFI_STA);
        WiFi.hostname(OTA_HOSTNAME);
        WiFi.setAutoReconnect(true);
        WiFi.persistent(true);
    }

    bool connect() {
        Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
        
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        
        unsigned long startTime = millis();
        while (WiFi.status() != WL_CONNECTED) {
            if (millis() - startTime > WIFI_CONNECT_TIMEOUT_MS) {
                Serial.println(F("[WiFi] Connection timeout"));
                return false;
            }
            delay(500);
            Serial.print(".");
        }
        Serial.println();
        
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
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        
        // Non-blocking: just start the connection attempt
        // Loop will check status later
    }

    void startConfigPortal() {
        Serial.println(F("[WiFi] Starting configuration portal..."));
        
        WiFi.mode(WIFI_AP);
        WiFi.softAP(AP_SSID, AP_PASSWORD);
        
        Serial.print(F("[WiFi] AP IP: "));
        Serial.println(WiFi.softAPIP());
        
        // TODO: Start web server for configuration
        // For now, this is a placeholder
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

