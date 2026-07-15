/**
 * MQTT Reporter Module Implementation
 */

#include "mqtt_reporter.h"
#include "config.h"
#include "sensor.h"
#include "tls_client.h"
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Transport clients: TLS on 8883 (prod), plain otherwise. Both are declared;
// only the selected one is wired into PubSubClient at init().
static WiFiClientSecure secureClient;
static WiFiClient plainClient;
static PubSubClient mqtt;

// Larger than PubSubClient's 256B default so a full retained config payload
// (operational + geometry + version) fits in a single frame.
#define MQTT_BUFFER_SIZE 1024

// Throttle reconnect attempts so a down broker never busy-loops.
#define MQTT_RECONNECT_INTERVAL_MS 5000
static unsigned long lastConnectAttempt = 0;
static bool tlsReady = false;
static bool receivedRetainedConfig = false;
static bool provisioningAttempt = false;

// ---- topic helpers ---------------------------------------------------------
static String topicBase() {
    return String(MQTT_TOPIC_BASE) + "/" + Config::deviceId;
}
static String topicTelemetry() { return topicBase() + "/telemetry"; }
static String topicAnnounce()  { return topicBase() + "/announce"; }
static String topicAck()       { return topicBase() + "/ack"; }
static String topicConfig()    { return topicBase() + "/config"; }
static String topicCmd()       { return topicBase() + "/cmd"; }

// ---- outbound frames -------------------------------------------------------
static void publishAnnounce() {
    JsonDocument d;
    d["type"] = "announce";
    d["id"] = Config::deviceId;
    d["role"] = "tank";
    d["name"] = Config::deviceId;
    d["fw"] = FIRMWARE_VERSION;
    JsonArray caps = d["caps"].to<JsonArray>();
    caps.add("ultrasonic");
    caps.add("temp");
    caps.add("battery");
    if (Config::configVersion >= 0) d["configVersion"] = Config::configVersion;
    else d["configVersion"] = nullptr;

    String payload;
    serializeJson(d, payload);
    mqtt.publish(topicAnnounce().c_str(), payload.c_str());
    Serial.printf("[MQTT] announce -> %s\n", topicAnnounce().c_str());
}

static void publishAck(const char* cmd, bool ok, const char* msg) {
    JsonDocument d;
    d["type"] = "ack";
    d["id"] = Config::deviceId;
    d["cmd"] = cmd;
    d["ok"] = ok;
    d["msg"] = msg;

    String payload;
    serializeJson(d, payload);
    mqtt.publish(topicAck().c_str(), payload.c_str());
}

// ---- inbound handling ------------------------------------------------------
static void handleCmd(JsonVariantConst d) {
    const char* cmd = d["cmd"] | "";
    Serial.printf("[MQTT] cmd: %s\n", cmd);

    if (!strcmp(cmd, "getConfig")) {
        // The server owns the retained config; we simply confirm our version.
        char msg[32];
        snprintf(msg, sizeof(msg), "config_version=%ld", Config::configVersion);
        publishAck("getConfig", true, msg);
    } else {
        // Part I deliberately has no remotely executable commands. Retaining
        // the acknowledgement makes an accidental command observable without
        // widening the physical device's attack surface.
        publishAck(cmd, false, "commands disabled in Part I");
    }
}

static void onMessage(char* topic, byte* payload, unsigned int length) {
    JsonDocument d;
    DeserializationError err = deserializeJson(d, payload, length);
    if (err) {
        Serial.printf("[MQTT] drop malformed frame on %s: %s\n", topic, err.c_str());
        return;
    }

    const char* type = d["type"] | "";
    String t(topic);

    if (t == topicConfig() || !strcmp(type, "config")) {
        // Retained/live config push: apply the merged buildDeviceConfig payload
        // and adopt its config_version.
        if (d["config"].is<JsonObjectConst>()) {
            receivedRetainedConfig = Config::applyServerConfig(d["config"], !provisioningAttempt);
        } else {
            receivedRetainedConfig = Config::applyServerConfig(d.as<JsonVariantConst>(), !provisioningAttempt);
        }
    } else if (!strcmp(type, "cmd")) {
        handleCmd(d.as<JsonVariantConst>());
    } else {
        Serial.printf("[MQTT] ignoring frame type '%s' on %s\n", type, topic);
    }
}

namespace MqttReporter {
    void init() {
        Serial.println(F("[MQTT] Initializing..."));
        if (MQTT_USE_TLS) {
            tlsReady = TlsClient::configure(secureClient);
            mqtt.setClient(secureClient);
        } else {
            mqtt.setClient(plainClient);
        }
        mqtt.setServer(MQTT_BROKER, MQTT_PORT);
        mqtt.setBufferSize(MQTT_BUFFER_SIZE);
        mqtt.setCallback(onMessage);
        Serial.printf("[MQTT] Broker: %s:%d (TLS=%d)\n", MQTT_BROKER, MQTT_PORT, MQTT_USE_TLS);
    }

    bool connect(bool publishPresence) {
        if (mqtt.connected()) return true;
        if (Config::deviceId.length() == 0) return false;
        if (MQTT_USE_TLS && !tlsReady) return false;

        lastConnectAttempt = millis();
        Serial.printf("[MQTT] Connecting as '%s'...\n", Config::deviceId.c_str());

        // username = deviceId, password = device bearer token.
        bool ok = mqtt.connect(
            Config::deviceId.c_str(),
            Config::deviceId.c_str(),
            Config::deviceToken.c_str()
        );

        if (ok) {
            Serial.println(F("[MQTT] Connected"));
            // Subscribe to our config (retained, QoS1) and cmd topics.
            mqtt.subscribe(topicConfig().c_str(), 1);
            mqtt.subscribe(topicCmd().c_str(), 1);
            if (publishPresence) publishAnnounce();
        } else {
            Serial.printf("[MQTT] Connect failed, state=%d\n", mqtt.state());
            if (MQTT_USE_TLS) {
                char error[128] = {0};
                const int code = secureClient.getLastSSLError(error, sizeof(error));
                Serial.printf("[TLS] connect error=%d: %s\n", code, error);
            }
        }
        return ok;
    }

    bool verifyProvisioning() {
        receivedRetainedConfig = false;
        provisioningAttempt = true;
        if (!connect(false)) {
            provisioningAttempt = false;
            return false;
        }

        const unsigned long started = millis();
        while (!receivedRetainedConfig && millis() - started < 5000) {
            mqtt.loop();
            delay(10);
        }
        if (!receivedRetainedConfig) {
            Serial.println(F("[MQTT] No retained config received during provisioning"));
            mqtt.disconnect();
            provisioningAttempt = false;
            return false;
        }
        provisioningAttempt = false;
        Config::markMqttProvisioned();
        publishAnnounce();
        return true;
    }

    void loop() {
        if (!mqtt.connected()) {
            if (millis() - lastConnectAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
                connect();
            }
            return;
        }
        mqtt.loop();
    }

    bool connected() {
        return mqtt.connected();
    }

    bool publishTelemetry(const SystemState &state) {
        if (!mqtt.connected()) return false;

        JsonDocument d;
        d["type"] = "telemetry";
        d["id"] = Config::deviceId;
        d["ts"] = millis();
        if (Config::configVersion >= 0) d["configVersion"] = Config::configVersion;
        else d["configVersion"] = nullptr;

        JsonObject data = d["data"].to<JsonObject>();
        // Raw ultrasonic distance; null when the sensor got no echo this cycle.
        // NOTE: liters are deliberately NOT sent - the server computes canonical
        // volume from geometry. Device keeps its local volume for display only.
        if (state.waterLevelValid) data["level_cm"] = state.waterLevelCm;
        else data["level_cm"] = nullptr;
        if (state.temperatureValid) data["temperature_c"] = state.temperatureC;
        else data["temperature_c"] = nullptr;
        data["battery_v"] = state.batteryVoltage;
        data["rssi"] = state.wifiRssi;

        String payload;
        serializeJson(d, payload);
        bool ok = mqtt.publish(topicTelemetry().c_str(), payload.c_str());
        Serial.printf("[MQTT] telemetry -> %s (%s)\n", topicTelemetry().c_str(), ok ? "ok" : "fail");
        return ok;
    }
}
