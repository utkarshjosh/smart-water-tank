/**
 * OTA Handler Module Implementation
 */

#include "ota_handler.h"
#include "config.h"
#include <ArduinoOTA.h>
#include <ESP8266httpUpdate.h>
#include <ArduinoJson.h>

namespace OTAHandler {
    void init() {
        Serial.println(F("[OTA] Initializing..."));
        
        // Set hostname
        ArduinoOTA.setHostname(OTA_HOSTNAME);
        
        // Set password if configured
        #ifdef OTA_PASSWORD
        if (strlen(OTA_PASSWORD) > 0) {
            ArduinoOTA.setPassword(OTA_PASSWORD);
        }
        #endif
        
        // Set port
        ArduinoOTA.setPort(OTA_PORT);
        
        // Callbacks
        ArduinoOTA.onStart([]() {
            String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
            Serial.printf("[OTA] Start updating %s\n", type.c_str());
        });
        
        ArduinoOTA.onEnd([]() {
            Serial.println(F("\n[OTA] Update complete!"));
        });
        
        ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
            Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
        });
        
        ArduinoOTA.onError([](ota_error_t error) {
            Serial.printf("[OTA] Error[%u]: ", error);
            switch (error) {
                case OTA_AUTH_ERROR:
                    Serial.println(F("Auth Failed"));
                    break;
                case OTA_BEGIN_ERROR:
                    Serial.println(F("Begin Failed"));
                    break;
                case OTA_CONNECT_ERROR:
                    Serial.println(F("Connect Failed"));
                    break;
                case OTA_RECEIVE_ERROR:
                    Serial.println(F("Receive Failed"));
                    break;
                case OTA_END_ERROR:
                    Serial.println(F("End Failed"));
                    break;
            }
        });
        
        ArduinoOTA.begin();
        Serial.printf("[OTA] Ready at %s.local:%d\n", OTA_HOSTNAME, OTA_PORT);
    }

    void handle() {
        ArduinoOTA.handle();
    }

    bool checkForUpdate() {
        Serial.println(F("[OTA] Checking for updates..."));
        
        WiFiClient client;
        HTTPClient http;
        
        String url = String(OTA_UPDATE_URL) + "?device=" + OTA_HOSTNAME + 
                     "&version=" + FIRMWARE_VERSION;
        
        http.begin(client, url);
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        
        int httpCode = http.GET();
        
        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            
            // Parse response for update info
            // Expected: {"update_available": true, "url": "...", "version": "..."}
            JsonDocument doc;
            if (deserializeJson(doc, response) == DeserializationError::Ok) {
                if (doc["update_available"] == true) {
                    const char* updateUrl = doc["url"];
                    const char* newVersion = doc["version"];
                    
                    Serial.printf("[OTA] Update available: v%s\n", newVersion);
                    Serial.printf("[OTA] URL: %s\n", updateUrl);
                    
                    http.end();
                    return updateFromUrl(updateUrl);
                }
            }
        }
        
        http.end();
        Serial.println(F("[OTA] No updates available"));
        return false;
    }

    bool updateFromUrl(const char* url) {
        Serial.printf("[OTA] Downloading from %s\n", url);
        
        WiFiClient client;
        
        // Configure LED indicator
        ESPhttpUpdate.setLedPin(PIN_STATUS_LED, LOW);
        
        // Reboot after update
        ESPhttpUpdate.rebootOnUpdate(true);
        
        t_httpUpdate_return ret = ESPhttpUpdate.update(client, url);
        
        switch (ret) {
            case HTTP_UPDATE_FAILED:
                Serial.printf("[OTA] Update failed (%d): %s\n",
                    ESPhttpUpdate.getLastError(),
                    ESPhttpUpdate.getLastErrorString().c_str()
                );
                return false;
                
            case HTTP_UPDATE_NO_UPDATES:
                Serial.println(F("[OTA] No update needed"));
                return false;
                
            case HTTP_UPDATE_OK:
                Serial.println(F("[OTA] Update OK (will reboot)"));
                return true;
        }
        
        return false;
    }
}

