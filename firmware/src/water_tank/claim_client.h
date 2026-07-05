/**
 * ============================================================================
 * Claim Client Module
 * ============================================================================
 * Exchanges a short-lived claim code (typed into the config portal) for a
 * permanent device token bound to the user's AquaMind account.
 * See plans/first-launch-plan.md for the end-to-end provisioning flow.
 */

#ifndef CLAIM_CLIENT_H
#define CLAIM_CLIENT_H

#include <Arduino.h>

namespace ClaimClient {
    /**
     * Stable per-device identifier derived from the ESP8266 chip id.
     */
    String getHardwareId();

    /**
     * Exchange claimCode for a permanent device token + device id.
     * @return true on success, with outDeviceToken/outDeviceId populated
     */
    bool claim(const String& claimCode, const String& hardwareId,
               String& outDeviceToken, String& outDeviceId);
}

#endif // CLAIM_CLIENT_H
