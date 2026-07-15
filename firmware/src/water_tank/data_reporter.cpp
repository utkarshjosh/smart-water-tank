/**
 * Data Reporter Module Implementation
 */

#include "data_reporter.h"
#include "config.h"
#include "tls_client.h"
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

static String serverHost = SERVER_HOST;
static int serverPort = SERVER_PORT;
static String serverEndpoint = SERVER_ENDPOINT;

// WiFi clients
static WiFiClient wifiClient;
static WiFiClientSecure wifiClientSecure;
static bool secureReady = false;

namespace DataReporter {
    void init() {
        Serial.println(F("[Reporter] Initializing..."));
        
        #if USE_HTTPS
        secureReady = TlsClient::configure(wifiClientSecure);
        #endif
        
        Serial.printf("[Reporter] Endpoint: %s://%s:%d%s\n",
            USE_HTTPS ? "https" : "http",
            serverHost.c_str(),
            serverPort,
            serverEndpoint.c_str()
        );
    }

    bool send(const SystemState &state) {
        HTTPClient http;

        #if USE_HTTPS
        if (!secureReady) secureReady = TlsClient::configure(wifiClientSecure);
        if (!secureReady) return false;
        #endif

        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + serverEndpoint;

        // Build JSON payload. A sensor that couldn't be read sends null,
        // not a placeholder number - the server must never mistake "no
        // reading" for a real 0cm/-127°C measurement.
        JsonDocument doc;
        doc["device_id"] = Config::deviceId;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["timestamp"] = millis();  // Server should use its own timestamp
        if (state.waterLevelValid) {
            doc["level_cm"] = state.waterLevelCm;
            doc["volume_l"] = state.volumeLiters;
        } else {
            doc["level_cm"] = nullptr;
            doc["volume_l"] = nullptr;
        }
        if (state.temperatureValid) {
            doc["temperature_c"] = state.temperatureC;
        } else {
            doc["temperature_c"] = nullptr;
        }
        doc["battery_v"] = state.batteryVoltage;
        doc["rssi"] = state.wifiRssi;
        // Report the config version we currently hold so the server can
        // piggyback the full config on the response only when we're stale.
        if (Config::configVersion >= 0) {
            doc["config_version"] = Config::configVersion;
        }

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
        http.addHeader("Authorization", "Bearer " + Config::deviceToken);
        
        int httpCode = http.POST(payload);
        
        if (httpCode > 0) {
            Serial.printf("[Reporter] Response: %d\n", httpCode);
            
            if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
                String response = http.getString();
                Serial.printf("[Reporter] Body: %s\n", response.c_str());
                
                // Check for config updates in response. The server always
                // echoes config_version and includes the full "config" object
                // only when we're stale (piggyback).
                JsonDocument respDoc;
                if (deserializeJson(respDoc, response) == DeserializationError::Ok) {
                    if (respDoc["config"].is<JsonObjectConst>()) {
                        Config::applyServerConfig(respDoc["config"]);
                    } else if (respDoc["config_version"].is<long>()) {
                        // Up to date: adopt the echoed version (in-memory).
                        Config::adoptConfigVersion(respDoc["config_version"].as<long>(), false);
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
        #if USE_HTTPS
        if (!secureReady) secureReady = TlsClient::configure(wifiClientSecure);
        if (!secureReady) return false;
        #endif
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + serverEndpoint;
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " + Config::deviceToken);
        http.addHeader("X-Buffered", "true");
        
        int httpCode = http.POST(jsonData);
        http.end();
        
        return (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED);
    }

    bool checkConfigUpdate() {
        HTTPClient http;
        #if USE_HTTPS
        if (!secureReady) secureReady = TlsClient::configure(wifiClientSecure);
        if (!secureReady) return false;
        #endif
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + 
                     "/api/v1/devices/" + Config::deviceId + "/config";
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Authorization", "Bearer " + Config::deviceToken);
        
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

