/**
 * Data Reporter Module Implementation
 */

#include "data_reporter.h"
#include "config.h"
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

static String serverHost = SERVER_HOST;
static int serverPort = SERVER_PORT;
static String serverEndpoint = SERVER_ENDPOINT;

// WiFi clients
static WiFiClient wifiClient;
static WiFiClientSecure wifiClientSecure;

namespace DataReporter {
    void init() {
        Serial.println(F("[Reporter] Initializing..."));
        
        #if USE_HTTPS
        // For testing, accept any certificate
        // In production, use certificate fingerprint or CA cert
        wifiClientSecure.setInsecure();
        #endif
        
        Serial.printf("[Reporter] Endpoint: %s://%s:%d%s\n",
            USE_HTTPS ? "https" : "http",
            serverHost.c_str(),
            serverPort,
            serverEndpoint.c_str()
        );
    }

    bool send(float levelCm, float volumeL, float tempC, float batteryV, int rssi) {
        HTTPClient http;
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + serverEndpoint;
        
        // Build JSON payload
        JsonDocument doc;
        doc["device_id"] = OTA_HOSTNAME;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["timestamp"] = millis();  // Server should use its own timestamp
        doc["level_cm"] = levelCm;
        doc["volume_l"] = volumeL;
        doc["temperature_c"] = tempC;
        doc["battery_v"] = batteryV;
        doc["rssi"] = rssi;
        
        String payload;
        serializeJson(doc, payload);
        
        Serial.printf("[Reporter] Sending to %s\n", url.c_str());
        Serial.printf("[Reporter] Payload: %s\n", payload.c_str());
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        
        int httpCode = http.POST(payload);
        
        if (httpCode > 0) {
            Serial.printf("[Reporter] Response: %d\n", httpCode);
            
            if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
                String response = http.getString();
                Serial.printf("[Reporter] Body: %s\n", response.c_str());
                
                // Check for config updates in response
                JsonDocument respDoc;
                if (deserializeJson(respDoc, response) == DeserializationError::Ok) {
                    if (respDoc.containsKey("config")) {
                        String configJson;
                        serializeJson(respDoc["config"], configJson);
                        Config::applyFromJson(configJson.c_str());
                    }
                }
                
                http.end();
                return true;
            }
        } else {
            Serial.printf("[Reporter] Error: %s\n", http.errorToString(httpCode).c_str());
        }
        
        http.end();
        return false;
    }

    bool sendBuffered(const char* jsonData) {
        HTTPClient http;
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + serverEndpoint;
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        http.addHeader("X-Buffered", "true");
        
        int httpCode = http.POST(jsonData);
        http.end();
        
        return (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED);
    }

    bool checkConfigUpdate() {
        HTTPClient http;
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + 
                     "/api/v1/devices/" + OTA_HOSTNAME + "/config";
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        
        int httpCode = http.GET();
        
        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            bool result = Config::applyFromJson(response.c_str());
            http.end();
            return result;
        }
        
        http.end();
        return false;
    }

    void setEndpoint(const char* host, int port, const char* path) {
        serverHost = host;
        serverPort = port;
        serverEndpoint = path;
    }
}


