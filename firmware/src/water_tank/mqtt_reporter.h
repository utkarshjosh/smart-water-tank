/**
 * ============================================================================
 * MQTT Reporter Module (Phase 2 transport)
 * ============================================================================
 * ArduinoMqttClient-based MQTT transport implementing the Phase 1 wire
 * contract. Outbound QoS 1 publishing waits for Mosquitto PUBACK.
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
    // Set up the MQTT client (broker, TLS, QoS1 buffer, callback). Call once
    // after WiFi is up.
    void init();

    // Ensure a live broker connection. On (re)connect, publishes `announce`
    // and (re)subscribes to config + cmd. Returns true only after PUBACK.
    bool connect(bool publishPresence = true);

    // Used only from AP onboarding. It proves TLS/authentication and waits for
    // the retained config before Config::markMqttProvisioned() is allowed.
    bool verifyProvisioning();

    // Service the client and reconnect if the link dropped. Call every loop().
    void loop();

    // True when connected to the broker.
    bool connected();

    // End the current session before an intentional duty-cycle sleep.
    void disconnect();

    // Publish a telemetry frame for the current state. Never sends liters
    // (the server computes canonical volume). Returns true only after PUBACK.
    bool publishTelemetry(const SystemState &state);
}

#endif // MQTT_REPORTER_H
