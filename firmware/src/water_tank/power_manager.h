/**
 * Bounded duty-cycle scheduling for the ESP8266.
 *
 * RTC user memory survives deep sleep and ordinary reset, but not a full power
 * loss. That is intentional: after a complete power loss, checking OTA once
 * early is safe, whereas normal sleep cycles keep the six-hour OTA cadence and
 * network failure backoff without writing flash every five minutes.
 */
#ifndef POWER_MANAGER_H
#define POWER_MANAGER_H

#include <Arduino.h>

namespace PowerManager {
    void init();
    bool awakeBudgetExceeded();
    bool otaCheckDue();
    void markOtaCheckAttempted();
    bool httpRecoveryDue();
    // Retry spacing after `failures` consecutive failures: one minute,
    // doubling, capped at an hour; 0 when there are none. The duty-cycle sleep
    // and CredentialGuard's always-on retry spacing share it.
    unsigned long failureBackoffMs(uint8_t failures);
    bool getWifiBssidAndChannel(uint8_t &channel, uint8_t* bssid);
    void saveWifiBssidAndChannel(uint8_t channel, const uint8_t* bssid);
    void finishCycle(bool deliverySucceeded);
    void sleepUntilNextCycle(unsigned long normalIntervalMs);
    bool shouldPerformKeepAlivePulseOnly(unsigned long normalIntervalMs);
    void executeKeepAlivePulseOnly();
}

#endif // POWER_MANAGER_H
