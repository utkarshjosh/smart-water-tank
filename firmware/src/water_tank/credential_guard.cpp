#include "credential_guard.h"
#include "config.h"
#include "power_manager.h"
#include "progress.h"

namespace {
    constexpr uint32_t RTC_MAGIC = 0x41514347; // "AQCG"
    // WifiManager uses block 0 and PowerManager block 16. The core rewrites
    // blocks 0-31 during an OTA install, so this sits above them.
    constexpr uint16_t RTC_SLOT = 32;

    constexpr int HTTP_UNAUTHORIZED = 401;

    #if MQTT_ENABLED
    // Both the broker and the device API must have refused during the streak.
    constexpr uint8_t REQUIRED_REFUSERS = 0x03;
    #else
    constexpr uint8_t REQUIRED_REFUSERS = 0x02;
    #endif

    struct RtcState {
        uint32_t magic;
        uint8_t streak;     // refusal windows in a row since the last acceptance
        uint8_t refusedBy;  // one bit per Transport that refused during the streak
        uint16_t reserved;
        uint32_t checksum;
    };

    RtcState state{};
    bool loaded = false;

    // Per boot and deliberately not persisted: a deep-sleep wake always opens
    // a fresh window, because the sleep was the wait.
    bool countedThisBoot = false;
    unsigned long countedAt = 0;
    bool refusedThisBoot[2] = {false, false};
    unsigned long refusedAt[2] = {0, 0};

    uint8_t indexOf(CredentialGuard::Transport transport) {
        return static_cast<uint8_t>(transport);
    }

    const char* nameOf(CredentialGuard::Transport transport) {
        return transport == CredentialGuard::Transport::Mqtt ? "MQTT broker" : "device API";
    }

    uint32_t checksum(const RtcState& value) {
        return value.magic ^ value.streak ^ (static_cast<uint32_t>(value.refusedBy) << 8) ^
            (static_cast<uint32_t>(value.reserved) << 16) ^ 0x7F4A7C15U;
    }

    void save() {
        state.checksum = checksum(state);
        ESP.rtcUserMemoryWrite(RTC_SLOT, reinterpret_cast<uint32_t*>(&state), sizeof(state));
    }

    void load() {
        if (loaded) return;
        loaded = true;
        RtcState stored{};
        if (ESP.rtcUserMemoryRead(RTC_SLOT, reinterpret_cast<uint32_t*>(&stored), sizeof(stored)) &&
            stored.magic == RTC_MAGIC && stored.checksum == checksum(stored)) {
            state = stored;
            return;
        }
        state = RtcState{};
        state.magic = RTC_MAGIC;
        save();
    }

    unsigned long backoffMs() {
        return PowerManager::failureBackoffMs(state.streak);
    }

    void requireRepair() {
        Serial.println(F("[Auth] Server keeps refusing this device's token; clearing MQTT provisioning and restarting into pairing mode"));
        #if DISPLAY_ENABLED
        // The message is the whole point, and the backlight has usually timed
        // out by the time a backed-off retry gets here.
        Display::backlightOn();
        #endif
        Progress::note("Re-pair needed", "access revoked", 5000);

        // Whatever token the next pairing brings starts with a clean history.
        state.streak = 0;
        state.refusedBy = 0;
        save();

        // Only provisioning is cleared. Wi-Fi credentials stay so the next
        // boot can get online before setup() sends it into the portal, and
        // `claimed` stays so that screen can say why.
        Config::mqttProvisioned = false;
        Config::save();
        delay(100);
        ESP.restart();
    }
}

namespace CredentialGuard {
    void accepted() {
        load();
        countedThisBoot = false;
        refusedThisBoot[0] = refusedThisBoot[1] = false;
        // Every healthy connect lands here; skip the RTC write unless there
        // is a streak to clear.
        if (state.streak == 0 && state.refusedBy == 0) return;
        Serial.println(F("[Auth] Token accepted; refusal streak cleared"));
        state.streak = 0;
        state.refusedBy = 0;
        save();
    }

    void refused(Transport transport) {
        load();
        const unsigned long now = millis();
        refusedThisBoot[indexOf(transport)] = true;
        refusedAt[indexOf(transport)] = now;

        if (!countedThisBoot || now - countedAt >= backoffMs()) {
            if (state.streak < 255) state.streak++;
            countedThisBoot = true;
            countedAt = now;
        }
        state.refusedBy |= static_cast<uint8_t>(1u << indexOf(transport));
        save();

        Serial.printf("[Auth] %s refused the device token (streak %u/%u, broker %s, API %s); retrying in %lus\n",
            nameOf(transport), state.streak, CREDENTIAL_REFUSALS_BEFORE_REPAIR,
            (state.refusedBy & 0x01) ? "refused" : "not seen",
            (state.refusedBy & 0x02) ? "refused" : "not seen",
            backoffMs() / 1000);

        if (state.streak >= CREDENTIAL_REFUSALS_BEFORE_REPAIR &&
            (state.refusedBy & REQUIRED_REFUSERS) == REQUIRED_REFUSERS) {
            requireRepair();
        }
    }

    void noteHttpStatus(int httpCode) {
        if (httpCode >= 200 && httpCode < 300) {
            accepted();
        } else if (httpCode == HTTP_UNAUTHORIZED) {
            refused(Transport::Http);
        }
    }

    bool holdOff(Transport transport) {
        load();
        const uint8_t index = indexOf(transport);
        return refusedThisBoot[index] && state.streak > 0 && millis() - refusedAt[index] < backoffMs();
    }
}
