#include "power_manager.h"
#include "config.h"
#include <ESP8266WiFi.h>
#include <time.h>

namespace {
    constexpr uint32_t RTC_MAGIC = 0x41514D50; // "AQMP"
    constexpr uint16_t RTC_SLOT = 16;          // avoids WifiManager's slot 0
    constexpr time_t MIN_VALID_EPOCH = 1704067200; // 2024-01-01 UTC

    struct RtcState {
        uint32_t magic;
        uint8_t networkFailures;
        uint8_t reserved[3];
        uint32_t nextOtaEpoch;
        uint32_t checksum;
    };

    RtcState state{};
    unsigned long bootStartedAt = 0;

    uint32_t checksum(const RtcState& value) {
        return value.magic ^ value.networkFailures ^ value.nextOtaEpoch ^ 0x9E3779B9U;
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
        RtcState loaded{};
        const bool valid = ESP.rtcUserMemoryRead(RTC_SLOT, reinterpret_cast<uint32_t*>(&loaded), sizeof(loaded)) &&
            loaded.magic == RTC_MAGIC && loaded.checksum == checksum(loaded);
        if (valid) {
            state = loaded;
        } else {
            state.magic = RTC_MAGIC;
            state.networkFailures = 0;
            state.nextOtaEpoch = 0;
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

    void finishCycle(bool deliverySucceeded) {
        if (deliverySucceeded) {
            state.networkFailures = 0;
        } else if (state.networkFailures < 8) {
            state.networkFailures++;
        }
        save();
    }

    void sleepUntilNextCycle(unsigned long normalIntervalMs) {
#if ENABLE_DEEP_SLEEP
        unsigned long delayMs;
        if (state.networkFailures == 0) {
            delayMs = clampSleep(normalIntervalMs);
        } else {
            const uint8_t exponent = state.networkFailures - 1;
            uint64_t backedOff = static_cast<uint64_t>(MIN_SLEEP_INTERVAL_MS) << exponent;
            delayMs = clampSleep(backedOff > MAX_FAILURE_SLEEP_MS ? MAX_FAILURE_SLEEP_MS : static_cast<unsigned long>(backedOff));
        }

        Serial.printf("[Power] Sleeping for %lu ms (network failures=%u)\n", delayMs, state.networkFailures);
        WiFi.disconnect(true);
        delay(100);
        ESP.deepSleep(static_cast<uint64_t>(delayMs) * 1000ULL, WAKE_RF_DEFAULT);
#else
        (void)normalIntervalMs;
        Serial.println(F("[Power] Deep sleep disabled; continuing always-on mode"));
#endif
    }
}
