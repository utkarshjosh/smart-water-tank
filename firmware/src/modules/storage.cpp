/**
 * Storage Module Implementation
 */

#include "storage.h"
#include "config.h"
#include "data_reporter.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

#define BUFFER_DIR      "/buffer"
#define MAX_BUFFER_FILES 100

// Counter for buffer files
static int bufferCounter = 0;

namespace Storage {
    void init() {
        Serial.println(F("[Storage] Initializing LittleFS..."));
        
        if (!LittleFS.begin()) {
            Serial.println(F("[Storage] Mount failed, formatting..."));
            LittleFS.format();
            if (!LittleFS.begin()) {
                Serial.println(F("[Storage] Format failed!"));
                return;
            }
        }
        
        // Create buffer directory if needed
        if (!LittleFS.exists(BUFFER_DIR)) {
            LittleFS.mkdir(BUFFER_DIR);
        }
        
        // Count existing buffer files
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        while (dir.next()) {
            bufferCounter++;
        }
        
        size_t total, used;
        getInfo(&total, &used);
        Serial.printf("[Storage] Ready: %d/%d bytes used, %d buffered measurements\n",
            used, total, bufferCounter);
    }

    void format() {
        Serial.println(F("[Storage] Formatting..."));
        LittleFS.format();
        bufferCounter = 0;
        Serial.println(F("[Storage] Format complete"));
    }

    void bufferMeasurement(const SystemState& state) {
        if (bufferCounter >= MAX_BUFFER_FILES) {
            Serial.println(F("[Storage] Buffer full, dropping oldest"));
            // Delete oldest file
            Dir dir = LittleFS.openDir(BUFFER_DIR);
            if (dir.next()) {
                String oldestPath = String(BUFFER_DIR) + "/" + dir.fileName();
                LittleFS.remove(oldestPath);
                bufferCounter--;
            }
        }
        
        // Create JSON for this measurement
        JsonDocument doc;
        doc["device_id"] = OTA_HOSTNAME;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["timestamp"] = millis();
        doc["level_cm"] = state.waterLevelCm;
        doc["volume_l"] = state.volumeLiters;
        doc["temperature_c"] = state.temperatureC;
        doc["battery_v"] = state.batteryVoltage;
        doc["rssi"] = state.wifiRssi;
        doc["buffered"] = true;
        
        String json;
        serializeJson(doc, json);
        
        // Save to file
        String filename = String(BUFFER_DIR) + "/" + String(millis()) + ".json";
        
        File file = LittleFS.open(filename, "w");
        if (file) {
            file.print(json);
            file.close();
            bufferCounter++;
            Serial.printf("[Storage] Buffered measurement (%d total)\n", bufferCounter);
        } else {
            Serial.println(F("[Storage] Failed to buffer measurement"));
        }
    }

    int flushBuffer() {
        if (bufferCounter == 0) {
            return 0;
        }
        
        Serial.printf("[Storage] Flushing %d buffered measurements...\n", bufferCounter);
        
        int sent = 0;
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        
        while (dir.next()) {
            String path = String(BUFFER_DIR) + "/" + dir.fileName();
            
            File file = LittleFS.open(path, "r");
            if (file) {
                String json = file.readString();
                file.close();
                
                if (DataReporter::sendBuffered(json.c_str())) {
                    LittleFS.remove(path);
                    sent++;
                    bufferCounter--;
                } else {
                    // Stop on first failure, try again later
                    Serial.println(F("[Storage] Send failed, will retry later"));
                    break;
                }
            }
            
            // Small delay between sends
            delay(100);
        }
        
        Serial.printf("[Storage] Sent %d buffered measurements\n", sent);
        return sent;
    }

    int getBufferCount() {
        return bufferCounter;
    }

    void clearBuffer() {
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        while (dir.next()) {
            String path = String(BUFFER_DIR) + "/" + dir.fileName();
            LittleFS.remove(path);
        }
        bufferCounter = 0;
        Serial.println(F("[Storage] Buffer cleared"));
    }

    bool writeFile(const char* path, const char* data) {
        File file = LittleFS.open(path, "w");
        if (!file) {
            return false;
        }
        file.print(data);
        file.close();
        return true;
    }

    String readFile(const char* path) {
        File file = LittleFS.open(path, "r");
        if (!file) {
            return "";
        }
        String content = file.readString();
        file.close();
        return content;
    }

    bool deleteFile(const char* path) {
        return LittleFS.remove(path);
    }

    bool exists(const char* path) {
        return LittleFS.exists(path);
    }

    void getInfo(size_t* totalBytes, size_t* usedBytes) {
        FSInfo info;
        LittleFS.info(info);
        *totalBytes = info.totalBytes;
        *usedBytes = info.usedBytes;
    }
}

