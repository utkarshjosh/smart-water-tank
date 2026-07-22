/**
 * OTA Handler Module Implementation
 */

#include "ota_handler.h"
#include "config.h"
#include "tls_client.h"
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <Updater.h>
#include <bearssl/bearssl_hash.h>
#include <ctype.h>

namespace OTAHandler {
    constexpr uint16_t OTA_DOWNLOAD_TIMEOUT_MS = 60000;
    constexpr size_t SHA256_BYTES = 32;
    constexpr size_t SHA256_HEX_LENGTH = SHA256_BYTES * 2;

    static bool isValidSha256(const char* checksum) {
        if (!checksum || strlen(checksum) != SHA256_HEX_LENGTH) return false;
        for (size_t i = 0; i < SHA256_HEX_LENGTH; ++i) {
            if (!isxdigit(static_cast<unsigned char>(checksum[i]))) return false;
        }
        return true;
    }

    static String sha256Hex(const uint8_t* digest) {
        static const char HEX_CHARS[] = "0123456789abcdef";
        String result;
        result.reserve(SHA256_HEX_LENGTH);
        for (size_t i = 0; i < SHA256_BYTES; ++i) {
            result += HEX_CHARS[digest[i] >> 4];
            result += HEX_CHARS[digest[i] & 0x0f];
        }
        return result;
    }

    void init() {
        Serial.println(F("[OTA] Authenticated HTTPS OTA enabled"));
    }

    void handle() {
        // Remote OTA is scheduled by the main loop; there is no LAN listener.
    }

    bool checkForUpdate() {
        Serial.println(F("[OTA] Checking for updates..."));
        
        String downloadUrl = "";
        String latestVersion = "";
        String expectedSha256 = "";
        size_t expectedSize = 0;
        bool updateFound = false;
        
        // Scope for the update check components (Client, JSON, etc.)
        // This ensures they are destroyed and memory freed before we try to download
        {
            // Use secure client for HTTPS
            WiFiClientSecure clientSecure;
            if (!TlsClient::configure(clientSecure)) return false;
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
                // Expected: update metadata plus SHA-256 and exact byte size.
                JsonDocument doc;
                if (deserializeJson(doc, response) == DeserializationError::Ok) {
                    if (doc["update_available"] == true) {
                        const char* url = doc["download_url"];
                        const char* ver = doc["latest_version"];
                        const char* checksum = doc["checksum"];
                        expectedSize = doc["file_size"] | 0U;
                        
                        if (url && ver && isValidSha256(checksum) && expectedSize > 0) {
                            downloadUrl = String(url);
                            latestVersion = String(ver);
                            expectedSha256 = String(checksum);
                            updateFound = true;
                        } else {
                            Serial.println(F("[OTA] Rejecting update with incomplete or invalid manifest"));
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
            return updateFromUrl(downloadUrl.c_str(), expectedSha256.c_str(), expectedSize);
        }
        
        Serial.println(F("[OTA] No updates available"));
        return false;
    }

    bool updateFromUrl(const char* url, const char* expectedSha256, size_t expectedSize) {
        Serial.printf("[OTA] Downloading from %s\n", url);

        if (!isValidSha256(expectedSha256) || expectedSize == 0) {
            Serial.println(F("[OTA] Refusing download without valid SHA-256 and size"));
            return false;
        }
        
        // Use secure client for HTTPS URLs
        WiFiClientSecure clientSecure;
        if (!TlsClient::configure(clientSecure)) return false;
        clientSecure.setTimeout(OTA_DOWNLOAD_TIMEOUT_MS);
        HTTPClient http;
        
        http.begin(clientSecure, url);
        http.setTimeout(OTA_DOWNLOAD_TIMEOUT_MS);
        http.addHeader("Authorization", "Bearer " + Config::deviceToken);
        const char* checksumHeaders[] = { "X-Firmware-Checksum" };
        http.collectHeaders(checksumHeaders, 1);
        
        int httpCode = http.GET();
        
        if (httpCode != HTTP_CODE_OK) {
            Serial.printf("[OTA] HTTP error: %d - %s\n", httpCode, http.errorToString(httpCode).c_str());
            http.end();
            return false;
        }

        String responseChecksum = http.header("X-Firmware-Checksum");
        if (!isValidSha256(responseChecksum.c_str()) ||
            !responseChecksum.equalsIgnoreCase(expectedSha256)) {
            Serial.println(F("[OTA] Download checksum header missing or differs from manifest"));
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
        if (contentSize != expectedSize) {
            Serial.printf("[OTA] Size mismatch. Manifest: %u, Download: %u\n",
                static_cast<unsigned>(expectedSize), static_cast<unsigned>(contentSize));
            http.end();
            return false;
        }
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
        br_sha256_context sha256;
        br_sha256_init(&sha256);
        
        uint8_t buff[128] = { 0 };
        // Do not stop merely because the HTTP peer has closed: BearSSL can
        // still have response bytes buffered locally. Wait for the full
        // Content-Length or declare a stalled transfer and abort cleanly.
        unsigned long lastDataAt = millis();
        while (written < totalSize) {
            size_t available = stream->available();
            if (available) {
                size_t c = stream->readBytes(buff, ((available > sizeof(buff)) ? sizeof(buff) : available));
                if (c == 0 || Update.write(buff, c) != c) {
                    Serial.println(F("[OTA] Flash write failed"));
                    http.end();
                    Update.end(false);
                    return false;
                }
                br_sha256_update(&sha256, buff, c);
                written += c;
                lastDataAt = millis();
                
                // Progress indicator
                if (written % 10240 == 0 || written == totalSize) {
                    Serial.printf("[OTA] Progress: %u%% (%u/%u bytes)\r",
                        static_cast<unsigned>((written * 100) / totalSize),
                        static_cast<unsigned>(written), static_cast<unsigned>(totalSize));
                }
                yield();
            } else if (millis() - lastDataAt > 10000) {
                Serial.printf("[OTA] Download stalled at %u/%u bytes\n",
                    static_cast<unsigned>(written), static_cast<unsigned>(totalSize));
                http.end();
                Update.end(false);
                return false;
            }
            delay(1);
        }
        
        Serial.println(); // New line after progress
        
        http.end();
        
        if (written != totalSize) {
            Serial.printf("[OTA] OTA Error: Written %d/%d bytes\n", written, totalSize);
            Update.end(false);
            return false;
        }

        uint8_t digest[SHA256_BYTES];
        br_sha256_out(&sha256, digest);
        String actualSha256 = sha256Hex(digest);
        if (!actualSha256.equalsIgnoreCase(expectedSha256)) {
            Serial.printf("[OTA] SHA-256 mismatch. Expected: %s, Actual: %s\n",
                expectedSha256, actualSha256.c_str());
            Update.end(false);
            return false;
        }
        Serial.println(F("[OTA] SHA-256 verified"));
        
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
