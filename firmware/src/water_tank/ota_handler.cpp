/**
 * OTA Handler Module Implementation
 */

#include "ota_handler.h"
#include "config.h"
#include <ArduinoOTA.h>
#include <ESP8266httpUpdate.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <Updater.h>

namespace OTAHandler {
    void init() {
        Serial.println(F("[OTA] Initializing..."));
        
        // Set hostname
        ArduinoOTA.setHostname(Config::getOtaHostname().c_str());
        
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
        Serial.printf("[OTA] Ready at %s.local:%d\n", Config::getOtaHostname().c_str(), OTA_PORT);
    }

    void handle() {
        ArduinoOTA.handle();
    }

    bool checkForUpdate() {
        Serial.println(F("[OTA] Checking for updates..."));
        
        String downloadUrl = "";
        String latestVersion = "";
        bool updateFound = false;
        
        // Scope for the update check components (Client, JSON, etc.)
        // This ensures they are destroyed and memory freed before we try to download
        {
            // Use secure client for HTTPS
            WiFiClientSecure clientSecure;
            clientSecure.setInsecure();  // Accept any certificate (for now)
            HTTPClient http;
            
            // Construct URL: /api/v1/devices/{deviceId}/ota/latest
            String url = String(OTA_UPDATE_URL_BASE) + "/" + Config::deviceId + "/ota/latest";
            
            http.begin(clientSecure, url);
            http.addHeader("Authorization", "Bearer " + Config::deviceToken);
            http.addHeader("X-Firmware-Version", FIRMWARE_VERSION);
            
            int httpCode = http.GET();
            
            if (httpCode == HTTP_CODE_OK) {
                String response = http.getString();
                
                // Parse response for update info
                // Expected: {"update_available": true, "download_url": "...", "latest_version": "..."}
                JsonDocument doc;
                if (deserializeJson(doc, response) == DeserializationError::Ok) {
                    if (doc["update_available"] == true) {
                        const char* url = doc["download_url"];
                        const char* ver = doc["latest_version"];
                        
                        if (url && ver) {
                            downloadUrl = String(url);
                            latestVersion = String(ver);
                            updateFound = true;
                        } else {
                            Serial.println(F("[OTA] Update available but missing URL or version"));
                        }
                    }
                } else {
                    Serial.println(F("[OTA] Failed to parse response JSON"));
                }
            } else {
                Serial.printf("[OTA] HTTP error: %d\n", httpCode);
            }
            
            http.end();
            // End of scope: clientSecure, http, and doc are destroyed here
        }
        
        if (updateFound) {
            Serial.printf("[OTA] Update available: v%s\n", latestVersion.c_str());
            Serial.printf("[OTA] URL: %s\n", downloadUrl.c_str());
            
            // Now we can safely start the download with freed memory
            return updateFromUrl(downloadUrl.c_str());
        }
        
        Serial.println(F("[OTA] No updates available"));
        return false;
    }

    bool updateFromUrl(const char* url) {
        Serial.printf("[OTA] Downloading from %s\n", url);
        
        // Use secure client for HTTPS URLs
        WiFiClientSecure clientSecure;
        clientSecure.setInsecure();  // Accept any certificate (for now)
        HTTPClient http;
        
        http.begin(clientSecure, url);
        http.addHeader("Authorization", "Bearer " + Config::deviceToken);
        
        int httpCode = http.GET();
        
        if (httpCode != HTTP_CODE_OK) {
            Serial.printf("[OTA] HTTP error: %d - %s\n", httpCode, http.errorToString(httpCode).c_str());
            http.end();
            return false;
        }
        
        // Get content length
        int contentLength = http.getSize();
        if (contentLength <= 0) {
            Serial.println(F("[OTA] Invalid content length"));
            http.end();
            return false;
        }
        
        Serial.printf("[OTA] Firmware size: %d bytes\n", contentLength);
        
        // Check if enough space is available
        size_t contentSize = (size_t)contentLength;
        if (contentSize > (ESP.getFreeSketchSpace() - 0x1000)) {
            Serial.printf("[OTA] Not enough space. Available: %d, Required: %d\n",
                ESP.getFreeSketchSpace() - 0x1000, contentLength);
            http.end();
            return false;
        }
        
        // Start update
        if (!Update.begin(contentSize)) {
            Serial.printf("[OTA] Not enough space to begin OTA. Available: %d\n", ESP.getFreeSketchSpace());
            http.end();
            return false;
        }
        
        Serial.println(F("[OTA] Writing firmware..."));
        
        // Get stream and write to Update
        WiFiClient* stream = http.getStreamPtr();
        size_t written = 0;
        size_t totalSize = contentSize;
        
        uint8_t buff[128] = { 0 };
        while (http.connected() && (written < totalSize)) {
            size_t available = stream->available();
            if (available) {
                int c = stream->readBytes(buff, ((available > sizeof(buff)) ? sizeof(buff) : available));
                Update.write(buff, c);
                written += c;
                
                // Progress indicator
                if (written % 10240 == 0 || written == totalSize) {
                    Serial.printf("[OTA] Progress: %d%% (%d/%d bytes)\r", 
                        (written * 100) / totalSize, written, totalSize);
                }
            }
            delay(1);
        }
        
        Serial.println(); // New line after progress
        
        http.end();
        
        if (written != totalSize) {
            Serial.printf("[OTA] OTA Error: Written %d/%d bytes\n", written, totalSize);
            // Update will be cleaned up automatically
            return false;
        }
        
        if (!Update.end()) {
            Serial.printf("[OTA] Update end failed: %s\n", Update.getErrorString().c_str());
            return false;
        }
        
        if (!Update.isFinished()) {
            Serial.println(F("[OTA] Update not finished"));
            return false;
        }
        
        Serial.println(F("[OTA] Update successful! Rebooting..."));
        delay(1000);
        ESP.restart();
        
        return true;
    }
}

