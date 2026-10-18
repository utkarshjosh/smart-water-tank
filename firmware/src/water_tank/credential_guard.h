/**
 * ============================================================================
 * Credential Guard
 * ============================================================================
 * Notices when the server keeps refusing this device's token and turns that
 * into something a person can act on: pairing mode.
 *
 * The backend revokes device tokens (admin re-issue, admin revoke-all, a
 * re-claim) and refuses decommissioned devices. A provisioned device never
 * re-enters the pairing portal on its own, so without this a refused device
 * retries forever and looks merely offline.
 *
 * What counts:
 *   refused  - MQTT CONNACK 4 (bad username or password) or 5 (not
 *              authorized), or HTTP 401 from the device API.
 *   accepted - MQTT CONNACK 0, or any HTTP 2xx from the device API.
 *   Everything else - DNS, TCP, TLS, timeouts, 5xx - is neither. It says
 *   nothing about the token.
 *
 * The streak grows by at most one per backoff window: the first refusal in a
 * wake, or on an always-on build in a PowerManager::failureBackoffMs() window,
 * adds one; later refusals in the same window only record which transport
 * refused. Any acceptance clears it. It lives in RTC memory so deep sleep does
 * not reset it; a real power loss does, which only restarts the count.
 *
 * The device is un-provisioned only after CREDENTIAL_REFUSALS_BEFORE_REPAIR
 * windows in a row AND a refusal from every transport this build uses.
 * Neither signal is trusted alone: the broker refuses everyone if its auth
 * hook is misconfigured, and the device API's deviceAuth middleware answers
 * 401 when its database lookup throws. Both refusing the same token across
 * roughly fifteen minutes of backed-off retries is a token that is gone.
 */
#ifndef CREDENTIAL_GUARD_H
#define CREDENTIAL_GUARD_H

#include <Arduino.h>

namespace CredentialGuard {
    enum class Transport : uint8_t { Mqtt = 0, Http = 1 };

    // The server accepted the token: clears the streak.
    void accepted();

    // The server refused the token. When the streak and the cross-check say
    // the refusal is real, shows "Re-pair needed", clears
    // Config::mqttProvisioned, saves and restarts into pairing mode - in that
    // case it does not return.
    void refused(Transport transport);

    // Classify the result of an authenticated device-API request. Negative
    // HTTPClient codes are transport errors and are ignored like any non-401
    // failure.
    void noteHttpStatus(int httpCode);

    // True while `transport` was refused earlier in this boot and the backoff
    // that refusal earned has not elapsed. Callers that would otherwise retry
    // on a short timer skip the attempt.
    bool holdOff(Transport transport);
}

#endif // CREDENTIAL_GUARD_H
