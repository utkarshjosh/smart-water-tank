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
    void finishCycle(bool deliverySucceeded);
    void sleepUntilNextCycle(unsigned long normalIntervalMs);
}

#endif // POWER_MANAGER_H
