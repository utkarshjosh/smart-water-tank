#include "power_manager.h"
#include "config.h"
#include "sensor.h"
#include <ESP8266WiFi.h>
#include <time.h>

namespace {
    constexpr uint32_t RTC_MAGIC = 0x41514D50; // "AQMP"
    constexpr uint16_t RTC_SLOT = 16;          // avoids WifiManager's slot 0
    constexpr time_t MIN_VALID_EPOCH = 1704067200; // 2024-01-01 UTC

    struct RtcState {
        uint32_t magic;
        uint8_t networkFailures;
        uint8_t wifiChannel;
        uint8_t wifiBssid[6];
        uint16_t pulseCount;
        uint32_t nextOtaEpoch;
        uint32_t checksum;
    };

    RtcState state{};
    unsigned long bootStartedAt = 0;

    // True only when this boot is a deep-sleep wake, i.e. a scheduled step of
    // the duty cycle. Power-on, reset button, OTA restart, watchdog and crash
    // reboots are all "the device just started" from the user's point of view
    // and must reach the server immediately, not after a keep-alive pulse train.
    bool deepSleepWake = false;

    uint32_t checksum(const RtcState& value) {
        uint32_t bssidChunk = (value.wifiBssid[0] << 24) | (value.wifiBssid[1] << 16) | (value.wifiBssid[2] << 8) | value.wifiBssid[3];
        return value.magic ^ value.networkFailures ^ value.wifiChannel ^ bssidChunk ^ value.pulseCount ^ value.nextOtaEpoch ^ 0x9E3779B9U;
    }

    void save() {
        state.checksum = checksum(state);
        ESP.rtcUserMemoryWrite(RTC_SLOT, reinterpret_cast<uint32_t*>(&state), sizeof(state));
    }

    #if ENABLE_DEEP_SLEEP
    unsigned long clampSleep(unsigned long value) {
        if (value < MIN_SLEEP_INTERVAL_MS) return MIN_SLEEP_INTERVAL_MS;
        if (value > MAX_FAILURE_SLEEP_MS) return MAX_FAILURE_SLEEP_MS;
        return value;
    }
    #endif
}

namespace PowerManager {
    void init() {
        bootStartedAt = millis();
        const rst_info* resetInfo = ESP.getResetInfoPtr();
        deepSleepWake = resetInfo != nullptr && resetInfo->reason == REASON_DEEP_SLEEP_AWAKE;
        RtcState loaded{};
        const bool valid = ESP.rtcUserMemoryRead(RTC_SLOT, reinterpret_cast<uint32_t*>(&loaded), sizeof(loaded)) &&
            loaded.magic == RTC_MAGIC && loaded.checksum == checksum(loaded);
        if (valid) {
            state = loaded;
        } else {
            state.magic = RTC_MAGIC;
            state.networkFailures = 0;
            state.wifiChannel = 0;
            memset(state.wifiBssid, 0, sizeof(state.wifiBssid));
            state.pulseCount = 0;
            state.nextOtaEpoch = 0;
            save();
        }

        // RTC memory survives an ordinary reset, so a mid-train pulse count can
        // outlive a reboot. On any non-deep-sleep boot, restart the train from
        // zero: this boot runs a full report cycle now, and the 8s keep-alive
        // pulses resume from there.
        if (!deepSleepWake && state.pulseCount != 0) {
            state.pulseCount = 0;
            save();
        }
    }

    bool awakeBudgetExceeded() {
        return millis() - bootStartedAt >= MAX_AWAKE_TIME_MS;
    }

    bool otaCheckDue() {
        const time_t now = time(nullptr);
        return now >= MIN_VALID_EPOCH && (state.nextOtaEpoch == 0 || now >= state.nextOtaEpoch);
    }

    void markOtaCheckAttempted() {
        const time_t now = time(nullptr);
        if (now < MIN_VALID_EPOCH) return;
        state.nextOtaEpoch = static_cast<uint32_t>(now + (OTA_CHECK_INTERVAL_MS / 1000));
        save();
    }

    bool httpRecoveryDue() {
        // MQTT gets two wake cycles to recover. The third tries HTTPS once.
        return state.networkFailures >= 2;
    }

    bool getWifiBssidAndChannel(uint8_t &channel, uint8_t* bssid) {
        if (state.wifiChannel > 0 && state.wifiChannel <= 13 && bssid != nullptr) {
            channel = state.wifiChannel;
            memcpy(bssid, state.wifiBssid, 6);
            return true;
        }
        return false;
    }

    void saveWifiBssidAndChannel(uint8_t channel, const uint8_t* bssid) {
        if (channel > 0 && channel <= 13 && bssid != nullptr) {
            if (state.wifiChannel != channel || memcmp(state.wifiBssid, bssid, 6) != 0) {
                state.wifiChannel = channel;
                memcpy(state.wifiBssid, bssid, 6);
                save();
            }
        }
    }

    bool shouldPerformKeepAlivePulseOnly(unsigned long normalIntervalMs) {
#if ENABLE_DEEP_SLEEP && TP4221B_KEEP_ALIVE_ENABLE
        // A freshly started device reports (and so shows up as online) on this
        // boot. Without this, a cold boot at the default 5-minute interval
        // burned ~37 pulse-only wakes - five to ten minutes of the device
        // looking offline in the app - before its first connect.
        if (!deepSleepWake) return false;
        if (KEEP_ALIVE_PULSE_MS == 0) return false;
        uint16_t requiredPulses = static_cast<uint16_t>(normalIntervalMs / KEEP_ALIVE_PULSE_MS);
        if (requiredPulses <= 1) return false;
        return state.pulseCount < requiredPulses;
#else
        (void)normalIntervalMs;
        return false;
#endif
    }

    void executeKeepAlivePulseOnly() {
#if ENABLE_DEEP_SLEEP && TP4221B_KEEP_ALIVE_ENABLE
        state.pulseCount++;
        save();
        Serial.printf("[Power] TP4221B Keep-Alive pulse #%u. Sleeping 8s...\n", state.pulseCount);
        Sensor::powerOff();
        WiFi.disconnect(true);
        delay(10);
        ESP.deepSleep(static_cast<uint64_t>(KEEP_ALIVE_PULSE_MS) * 1000ULL, WAKE_RF_DISABLED);
#endif
    }

    void finishCycle(bool deliverySucceeded) {
        if (deliverySucceeded) {
            state.networkFailures = 0;
            state.pulseCount = 0;
        } else if (state.networkFailures < 8) {
            state.networkFailures++;
        }
        save();
    }

    void sleepUntilNextCycle(unsigned long normalIntervalMs) {
        Sensor::powerOff();
#if ENABLE_DEEP_SLEEP
        unsigned long delayMs;

#if TP4221B_KEEP_ALIVE_ENABLE
        (void)normalIntervalMs;
        delayMs = KEEP_ALIVE_PULSE_MS;
#else
        float battVolts = Sensor::readBatteryVoltage();
        float intervalMultiplier = 1.0;

        // Adaptive low-battery scaling: increase sleep interval to protect battery reserves
        if (battVolts > 0.5 && battVolts < BATTERY_LOW_THRESHOLD_V) {
            if (battVolts < 3.1) {
                intervalMultiplier = 4.0;
                Serial.printf("[Power] Critical battery (%.2fV < 3.1V)! Quadrupling sleep interval.\n", battVolts);
            } else {
                intervalMultiplier = 2.0;
                Serial.printf("[Power] Low battery (%.2fV < %.2fV)! Doubling sleep interval.\n", battVolts, BATTERY_LOW_THRESHOLD_V);
            }
        }

        if (state.networkFailures == 0) {
            delayMs = clampSleep(static_cast<unsigned long>(normalIntervalMs * intervalMultiplier));
        } else {
            const uint8_t exponent = state.networkFailures - 1;
            uint64_t backedOff = static_cast<uint64_t>(MIN_SLEEP_INTERVAL_MS) << exponent;
            delayMs = clampSleep(backedOff > MAX_FAILURE_SLEEP_MS ? MAX_FAILURE_SLEEP_MS : static_cast<unsigned long>(backedOff));
        }
#endif

        Serial.printf("[Power] Sleeping for %lu ms (failures=%u)\n", delayMs, state.networkFailures);
        WiFi.disconnect(true);
        delay(100);
        ESP.deepSleep(static_cast<uint64_t>(delayMs) * 1000ULL, WAKE_RF_DEFAULT);
#else
        (void)normalIntervalMs;
        Serial.println(F("[Power] Deep sleep disabled; continuing always-on mode"));
#endif
    }
}
