/**
 * Storage Module Implementation
 */

#include "storage.h"
#include "config.h"
#include "data_reporter.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

#define BUFFER_DIR      "/buffer"

// Buffer files are named by a monotonically increasing sequence number
// rather than millis() - millis() resets to ~0 every boot, so two
// measurements buffered in different power sessions could collide on the
// same filename or sort in the wrong order. A zero-padded, ever-increasing
// sequence number guarantees "lowest number = oldest" holds across restarts,
// which oldest-first rotation below depends on.
static int bufferCounter = 0;
static uint32_t nextSeq = 0;
static uint32_t oldestSeq = 0;

static String seqFilename(uint32_t seq) {
    char buf[24];
    snprintf(buf, sizeof(buf), "%s/%010lu.json", BUFFER_DIR, (unsigned long)seq);
    return String(buf);
}

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

        // Scan existing buffer files to recover the sequence range
        bool any = false;
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        while (dir.next()) {
            uint32_t seq = (uint32_t)strtoul(dir.fileName().c_str(), nullptr, 10);
            if (!any || seq < oldestSeq) oldestSeq = seq;
            if (!any || seq >= nextSeq) nextSeq = seq + 1;
            any = true;
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
        nextSeq = 0;
        oldestSeq = 0;
        Serial.println(F("[Storage] Format complete"));
    }

    void bufferMeasurement(const SystemState& state) {
        if (bufferCounter >= MAX_BUFFERED_MEASUREMENTS) {
            Serial.println(F("[Storage] Buffer full, dropping oldest"));
            LittleFS.remove(seqFilename(oldestSeq));
            oldestSeq++;
            bufferCounter--;
        }

        // Create JSON for this measurement
        JsonDocument doc;
        doc["device_id"] = Config::deviceId;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["timestamp"] = millis();
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
        doc["buffered"] = true;

        String json;
        serializeJson(doc, json);

        // Save to file, named by sequence number so oldest-first rotation
        // and flush ordering stay correct across restarts
        uint32_t seq = nextSeq++;
        if (bufferCounter == 0) oldestSeq = seq;
        String filename = seqFilename(seq);

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
        // Walk sequence numbers oldest-first so data reaches the server in
        // the order it was recorded, skipping any gaps left by rotation.
        while (bufferCounter > 0) {
            String path = seqFilename(oldestSeq);
            if (!LittleFS.exists(path)) {
                oldestSeq++;
                continue;
            }

            File file = LittleFS.open(path, "r");
            if (!file) {
                oldestSeq++;
                continue;
            }
            String json = file.readString();
            file.close();

            if (!DataReporter::sendBuffered(json.c_str())) {
                // Stop on first failure, try again later
                Serial.println(F("[Storage] Send failed, will retry later"));
                break;
            }

            LittleFS.remove(path);
            oldestSeq++;
            bufferCounter--;
            sent++;

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
        nextSeq = 0;
        oldestSeq = 0;
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


