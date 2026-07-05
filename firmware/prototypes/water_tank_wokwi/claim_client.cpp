/**
 * Claim Client Module Implementation (Wokwi / ESP32 build)
 * Same claim logic as firmware/src/modules/claim_client.cpp - only the
 * platform includes and hardware-id derivation are ESP32-specific.
 */

#include "claim_client.h"
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

static WiFiClient wifiClient;
static WiFiClientSecure wifiClientSecure;

namespace ClaimClient {
    String getHardwareId() {
        uint64_t mac = ESP.getEfuseMac();
        char buf[13];
        snprintf(buf, sizeof(buf), "%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
        return "esp32-" + String(buf);
    }

    bool claim(const String& claimCode, const String& hardwareId,
               String& outDeviceToken, String& outDeviceId) {
        if (claimCode.length() == 0) {
            Serial.println(F("[Claim] No claim code entered, skipping"));
            return false;
        }

        HTTPClient http;
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     SERVER_HOST + ":" + String(SERVER_PORT) + "/api/v1/devices/claim";

        JsonDocument doc;
        doc["claim_code"] = claimCode;
        doc["hardware_id"] = hardwareId;

        String payload;
        serializeJson(doc, payload);

        Serial.printf("[Claim] Claiming device at %s\n", url.c_str());

        #if USE_HTTPS
        wifiClientSecure.setInsecure();
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif

        http.addHeader("Content-Type", "application/json");
        int httpCode = http.POST(payload);

        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            JsonDocument respDoc;
            if (deserializeJson(respDoc, response) == DeserializationError::Ok) {
                outDeviceToken = respDoc["device_token"].as<String>();
                outDeviceId = respDoc["device_id"].as<String>();
                http.end();
                Serial.println(F("[Claim] Device claimed successfully"));
                return true;
            }
            Serial.println(F("[Claim] Failed to parse claim response"));
        } else {
            Serial.printf("[Claim] Claim failed, HTTP %d: %s\n", httpCode, http.getString().c_str());
        }

        http.end();
        return false;
    }
}
