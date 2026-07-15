/**
 * MQTT Reporter Module Implementation
 */

#include "mqtt_reporter.h"
#include "config.h"
#include "tls_client.h"
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>

// TLS on 8883 is the production transport. Plain MQTT is available only via
// an explicit local-development build override.
static WiFiClientSecure secureClient;
static WiFiClient plainClient;
static MqttClient mqtt(plainClient);

// The merged retained config must fit in this bounded buffer. Rejecting an
// oversize server frame is safer than exhausting ESP8266 heap.
#define MQTT_BUFFER_SIZE 1024
static char inboundPayload[MQTT_BUFFER_SIZE + 1];

// ArduinoMqttClient waits for PUBACK in endMessage() for QoS 1. This timeout
// bounds the delivery proof window.
#define MQTT_CONNECTION_TIMEOUT_MS 8000
#define MQTT_KEEP_ALIVE_MS 60000
#define MQTT_RECONNECT_INTERVAL_MS 5000

static unsigned long lastConnectAttempt = 0;
static bool tlsReady = false;
static bool receivedRetainedConfig = false;
static bool provisioningAttempt = false;

static String topicBase() { return String(MQTT_TOPIC_BASE) + "/" + Config::deviceId; }
static String topicTelemetry() { return topicBase() + "/telemetry"; }
static String topicAnnounce() { return topicBase() + "/announce"; }
static String topicAck() { return topicBase() + "/ack"; }
static String topicConfig() { return topicBase() + "/config"; }
static String topicCmd() { return topicBase() + "/cmd"; }

static bool publishJson(const String& topic, const String& payload, bool retain = false) {
    if (!mqtt.connected() || !mqtt.beginMessage(topic, retain, 1)) return false;
    if (mqtt.print(payload) != payload.length()) {
        mqtt.stop();
        return false;
    }

    // QoS 1 succeeds only after the broker has returned the matching PUBACK.
    const bool acknowledged = mqtt.endMessage();
    if (!acknowledged) Serial.printf("[MQTT] publish not acknowledged: %s\n", topic.c_str());
    return acknowledged;
}

static bool publishAnnounce() {
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
    const bool ok = publishJson(topicAnnounce(), payload);
    Serial.printf("[MQTT] announce -> %s (%s)\n", topicAnnounce().c_str(), ok ? "PUBACK" : "failed");
    return ok;
}

static bool publishAck(const char* cmd, bool ok, const char* msg) {
    JsonDocument d;
    d["type"] = "ack";
    d["id"] = Config::deviceId;
    d["cmd"] = cmd;
    d["ok"] = ok;
    d["msg"] = msg;

    String payload;
    serializeJson(d, payload);
    return publishJson(topicAck(), payload);
}

static void handleCmd(JsonVariantConst d) {
    const char* cmd = d["cmd"] | "";
    Serial.printf("[MQTT] cmd: %s\n", cmd);

    if (!strcmp(cmd, "getConfig")) {
        char msg[32];
        snprintf(msg, sizeof(msg), "config_version=%ld", Config::configVersion);
        publishAck("getConfig", true, msg);
    } else {
        // Part I intentionally does not run remotely executable commands.
        publishAck(cmd, false, "commands disabled in Part I");
    }
}

static void onMessage(int messageSize) {
    const String topic = mqtt.messageTopic();
    if (messageSize < 0 || messageSize > MQTT_BUFFER_SIZE) {
        Serial.printf("[MQTT] drop oversized frame on %s (%d bytes)\n", topic.c_str(), messageSize);
        while (mqtt.available()) mqtt.read();
        return;
    }

    const size_t expected = static_cast<size_t>(messageSize);
    const size_t read = mqtt.read(reinterpret_cast<uint8_t*>(inboundPayload), expected);
    if (read != expected) {
        Serial.printf("[MQTT] drop incomplete frame on %s (%u/%u bytes)\n",
            topic.c_str(), static_cast<unsigned>(read), static_cast<unsigned>(expected));
        while (mqtt.available()) mqtt.read();
        return;
    }
    inboundPayload[read] = '\0';

    JsonDocument d;
    DeserializationError err = deserializeJson(d, inboundPayload, read);
    if (err) {
        Serial.printf("[MQTT] drop malformed frame on %s: %s\n", topic.c_str(), err.c_str());
        return;
    }

    const char* type = d["type"] | "";
    if (topic == topicConfig() || !strcmp(type, "config")) {
        if (d["config"].is<JsonObjectConst>()) {
            receivedRetainedConfig = Config::applyServerConfig(d["config"], !provisioningAttempt);
        } else {
            receivedRetainedConfig = Config::applyServerConfig(d.as<JsonVariantConst>(), !provisioningAttempt);
        }
    } else if (!strcmp(type, "cmd")) {
        handleCmd(d.as<JsonVariantConst>());
    } else {
        Serial.printf("[MQTT] ignoring frame type '%s' on %s\n", type, topic.c_str());
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
            tlsReady = true;
        }
        mqtt.setConnectionTimeout(MQTT_CONNECTION_TIMEOUT_MS);
        mqtt.setKeepAliveInterval(MQTT_KEEP_ALIVE_MS);
        mqtt.setTxPayloadSize(MQTT_BUFFER_SIZE);
        mqtt.onMessage(onMessage);
        Serial.printf("[MQTT] Broker: %s:%d (TLS=%d)\n", MQTT_BROKER, MQTT_PORT, MQTT_USE_TLS);
    }

    bool connect(bool publishPresence) {
        if (mqtt.connected()) return true;
        if (Config::deviceId.length() == 0) return false;
        if (MQTT_USE_TLS && !tlsReady) {
            // NTP/DNS may recover after a transient boot-time failure.
            tlsReady = TlsClient::configure(secureClient);
            if (!tlsReady) return false;
        }

        lastConnectAttempt = millis();
        Serial.printf("[MQTT] Connecting as '%s'...\n", Config::deviceId.c_str());
        mqtt.setId(Config::deviceId);
        mqtt.setUsernamePassword(Config::deviceId, Config::deviceToken);
        mqtt.setCleanSession(true);

        const bool ok = mqtt.connect(MQTT_BROKER, MQTT_PORT);
        if (!ok) {
            Serial.printf("[MQTT] Connect failed, state=%d\n", mqtt.connectError());
            if (MQTT_USE_TLS) {
                char error[128] = {0};
                const int code = secureClient.getLastSSLError(error, sizeof(error));
                Serial.printf("[TLS] connect error=%d: %s\n", code, error);
            }
            return false;
        }

        Serial.println(F("[MQTT] Connected"));
        // subscribe() waits for SUBACK. Retained config may be handled before
        // it returns, which is precisely what provisioning needs.
        if (!mqtt.subscribe(topicConfig(), 1) || !mqtt.subscribe(topicCmd(), 1)) {
            Serial.println(F("[MQTT] Subscribe failed"));
            mqtt.stop();
            return false;
        }
        return publishPresence ? publishAnnounce() : true;
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
            mqtt.poll();
            delay(10);
        }
        if (!receivedRetainedConfig) {
            Serial.println(F("[MQTT] No retained config received during provisioning"));
            mqtt.stop();
            provisioningAttempt = false;
            return false;
        }
        provisioningAttempt = false;
        Config::markMqttProvisioned();
        return publishAnnounce();
    }

    void loop() {
        if (!mqtt.connected()) {
            if (millis() - lastConnectAttempt >= MQTT_RECONNECT_INTERVAL_MS) connect();
            return;
        }
        mqtt.poll();
    }

    bool connected() { return mqtt.connected(); }

    void disconnect() {
        if (mqtt.connected()) mqtt.stop();
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
        // The server computes canonical volume from the raw level and geometry.
        if (state.waterLevelValid) data["level_cm"] = state.waterLevelCm;
        else data["level_cm"] = nullptr;
        if (state.temperatureValid) data["temperature_c"] = state.temperatureC;
        else data["temperature_c"] = nullptr;
        data["battery_v"] = state.batteryVoltage;
        data["rssi"] = state.wifiRssi;

        String payload;
        serializeJson(d, payload);
        const bool ok = publishJson(topicTelemetry(), payload);
        Serial.printf("[MQTT] telemetry -> %s (%s)\n", topicTelemetry().c_str(), ok ? "PUBACK" : "failed");
        return ok;
    }
}
