/**
 * ============================================================================
 * MQTT Reporter Module (Phase 2 transport)
 * ============================================================================
 * PubSubClient-based MQTT transport implementing the Phase 2 wire contract:
 *
 *   device -> server : devices/{id}/telemetry | announce | ack
 *   server -> device : devices/{id}/config (retained, QoS1) | cmd
 *
 * Auth: username = Config::deviceId, password = Config::deviceToken (the same
 * bearer token used for HTTP). TLS on port 8883 in production.
 *
 * Compiled and linked unconditionally; only invoked from the sketch when
 * MQTT_ENABLED is true, so both build variants stay green.
 */

#ifndef MQTT_REPORTER_H
#define MQTT_REPORTER_H

#include <Arduino.h>
#include "types.h"

namespace MqttReporter {
    // Set up the MQTT client (broker, TLS, buffer size, callback). Call once
    // after WiFi is up.
    void init();

    // Ensure a live broker connection. On (re)connect, publishes `announce`
    // and (re)subscribes to the config + cmd topics. Returns true if connected.
    bool connect(bool publishPresence = true);

    // Used only from AP onboarding. It proves TLS/authentication and waits for
    // the retained config before Config::markMqttProvisioned() is allowed.
    bool verifyProvisioning();

    // Service the client and reconnect if the link dropped. Call every loop().
    void loop();

    // True when connected to the broker.
    bool connected();

    // Publish a telemetry frame for the current state. Never sends liters
    // (the server computes canonical volume). Returns true on publish success.
    bool publishTelemetry(const SystemState &state);
}

#endif // MQTT_REPORTER_H
