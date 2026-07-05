/**
 * ============================================================================
 * Net Node (Wokwi / ESP32)  —  virtual device for the AquaMind debug hub
 * ============================================================================
 * The ESP32 twin of prototypes/net_node, tuned to run inside the Wokwi
 * simulator so you can debug the WHOLE stack with no physical board:
 *
 *     Wokwi (virtual ESP32 + HC-SR04 + DS18B20)
 *         │  TCP :3333  (forwarded to localhost by wokwi.toml)
 *         ▼
 *     tools/debug-hub   ──►  web dashboard
 *
 * Differences from prototypes/net_node/net_node.ino:
 *   - ESP32 (not ESP8266): real GPIO numbers, WiFi.h
 *   - Wokwi WiFi: SSID "Wokwi-GUEST", no password, channel 6 (fast connect)
 *   - No NewPing dependency — ultrasonic is read with raw trig/echo + pulseIn,
 *     which is portable and works cleanly on ESP32 + Wokwi.
 * Protocol is identical (see tools/debug-hub/src/protocol.js), so it appears in
 * the hub exactly like the Node simulator and a real board.
 *
 * BUILD + RUN: see README.md in this folder.
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
#define WIFI_SSID     "Wokwi-GUEST"   // Wokwi's virtual network
#define WIFI_PASS     ""              // open
#define WIFI_CHANNEL  6               // Wokwi connects fastest on channel 6

#define DEVICE_ID     "tank-wokwi"
#define DEVICE_ROLE   "tank"          // "tank" or "control"
#define DEVICE_NAME   "Tank Node (Wokwi)"
#define FW_VERSION    "wokwi-0.1.0"

#define TCP_PORT        3333
#define DISCOVERY_PORT  3334
#define DISCOVERY_MAGIC "AQUAMIND_HUB"

// Pins (must match diagram.json)
#define TRIG_PIN   5      // GPIO5  -> HC-SR04 TRIG
#define ECHO_PIN   18     // GPIO18 -> HC-SR04 ECHO
#define TEMP_PIN   4      // GPIO4  -> DS18B20 DQ (4.7k pull-up to 3V3)
#define BURST      10
#define ECHO_TIMEOUT_US 30000UL   // ~5 m round trip ceiling

// ---------------------------------------------------------------------------
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

WiFiServer server(TCP_PORT);
WiFiClient client;
WiFiUDP udp;

uint32_t sampleMs = 1000;
char mode[8] = "live";
uint16_t tankHeightCm = 150;

unsigned long lastSample = 0, lastAnnounce = 0, startMs = 0;
String rxBuf;

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------
struct Ultra { float median, mn, mx; unsigned int us; int drops, valid; };

// Single trig/echo ping → distance in cm (0 = no echo).
float pingCm(unsigned int* usOut) {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long dur = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  *usOut = dur;
  if (dur == 0) return 0;
  return dur / 58.0;   // speed of sound → cm (round trip)
}

Ultra readUltra() {
  float v[BURST]; unsigned int u[BURST]; Ultra r = {0, 0, 0, 0, 0, 0};
  int n = 0;
  for (int i = 0; i < BURST; i++) {
    unsigned int us;
    float cm = pingCm(&us);
    if (cm == 0) r.drops++;
    else { v[n] = cm; u[n] = us; n++; }
    delay(30);
  }
  r.valid = n;
  if (n == 0) return r;
  for (int i = 0; i < n - 1; i++) for (int j = i + 1; j < n; j++)
    if (v[j] < v[i]) { float tf=v[i];v[i]=v[j];v[j]=tf; unsigned int tu=u[i];u[i]=u[j];u[j]=tu; }
  r.mn = v[0]; r.mx = v[n-1]; r.median = v[n/2]; r.us = u[n/2];
  return r;
}

// ---------------------------------------------------------------------------
// Messaging (line-delimited JSON — matches the hub protocol)
// ---------------------------------------------------------------------------
void sendLine(JsonDocument& doc) {
  if (!client || !client.connected()) return;
  serializeJson(doc, client);
  client.print('\n');
}

void sendAnnounce(Print& out) {
  JsonDocument d;
  d["type"] = "announce"; d["id"] = DEVICE_ID; d["role"] = DEVICE_ROLE;
  d["name"] = DEVICE_NAME; d["fw"] = FW_VERSION; d["tcpPort"] = TCP_PORT;
  JsonArray caps = d["caps"].to<JsonArray>();
  if (String(DEVICE_ROLE) == "tank") { caps.add("ultrasonic"); caps.add("temp"); }
  else { caps.add("display"); caps.add("wifi-uplink"); }
  serializeJson(d, out); out.print('\n');
}

void sendConfig() {
  JsonDocument d;
  d["type"] = "config"; d["id"] = DEVICE_ID;
  JsonObject c = d["config"].to<JsonObject>();
  c["deviceId"] = DEVICE_ID; c["sampleMs"] = sampleMs; c["mode"] = mode; c["tankHeightCm"] = tankHeightCm;
  sendLine(d);
}

void sendAck(const char* cmd, bool ok, const char* msg) {
  JsonDocument d;
  d["type"] = "ack"; d["id"] = DEVICE_ID; d["cmd"] = cmd; d["ok"] = ok; d["msg"] = msg;
  sendLine(d);
}

void sendTelemetry() {
  JsonDocument d;
  d["type"] = "telemetry"; d["id"] = DEVICE_ID; d["ts"] = millis();
  JsonObject t = d["data"].to<JsonObject>();
  if (String(DEVICE_ROLE) == "tank") {
    Ultra u = readUltra();
    if (u.valid) { t["distCm"] = u.median; t["minCm"] = u.mn; t["maxCm"] = u.mx; t["rawUs"] = u.us; }
    else t["distCm"] = nullptr;
    t["drops"] = u.drops; t["valid"] = u.valid;
    tempSensor.requestTemperatures();
    float c = tempSensor.getTempCByIndex(0);
    if (c == DEVICE_DISCONNECTED_C) t["tempC"] = nullptr; else t["tempC"] = c;
  }
  t["rssi"] = WiFi.RSSI();
  t["uptimeMs"] = millis() - startMs;
  t["heapFree"] = ESP.getFreeHeap();
  t["mode"] = mode;
  sendLine(d);
}

void handleMessage(const String& line) {
  JsonDocument d;
  if (deserializeJson(d, line)) return;
  const char* type = d["type"] | "";

  if (!strcmp(type, "ping"))           sendAnnounce(client);
  else if (!strcmp(type, "getConfig")) sendConfig();
  else if (!strcmp(type, "setConfig")) {
    if (d["config"]["sampleMs"].is<uint32_t>())     sampleMs = d["config"]["sampleMs"];
    if (d["config"]["tankHeightCm"].is<uint16_t>()) tankHeightCm = d["config"]["tankHeightCm"];
    if (d["config"]["mode"].is<const char*>())      strlcpy(mode, d["config"]["mode"], sizeof(mode));
    sendAck("setConfig", true, "applied"); sendConfig();
  }
  else if (!strcmp(type, "cmd")) {
    const char* c = d["cmd"] | "";
    if (!strcmp(c, "selftest")) {
      Ultra u = readUltra();
      char buf[48]; snprintf(buf, sizeof(buf), "%d/%d valid pings", u.valid, BURST);
      sendAck("selftest", u.valid > 0, buf);
    } else if (!strcmp(c, "setMode")) {
      strlcpy(mode, d["args"]["mode"] | "live", sizeof(mode)); sendAck("setMode", true, mode);
    } else if (!strcmp(c, "reboot")) {
      sendAck("reboot", true, "rebooting"); delay(200); ESP.restart();
    } else sendAck(c, false, "unknown cmd");
  }
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  startMs = millis();
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  tempSensor.begin();

  Serial.printf("\n[net_node_wokwi] %s connecting to '%s'...\n", DEVICE_ID, WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS, WIFI_CHANNEL);
  while (WiFi.status() != WL_CONNECTED) { delay(250); Serial.print('.'); }
  Serial.printf("\n[net_node_wokwi] IP %s  TCP %d\n", WiFi.localIP().toString().c_str(), TCP_PORT);

  server.begin();
  udp.begin(DISCOVERY_PORT);
}

void loop() {
  if (!client || !client.connected()) {
    WiFiClient c = server.available();
    if (c) { client = c; client.setNoDelay(true); sendAnnounce(client); sendConfig(); }
  }

  while (client && client.available()) {
    char ch = client.read();
    if (ch == '\n') { handleMessage(rxBuf); rxBuf = ""; }
    else if (ch != '\r' && rxBuf.length() < 512) rxBuf += ch;
  }

  unsigned long now = millis();
  if (now - lastSample >= sampleMs) { lastSample = now; if (client && client.connected()) sendTelemetry(); }

  if (now - lastAnnounce >= 3000) {
    lastAnnounce = now;
    JsonDocument d;
    d["magic"] = DISCOVERY_MAGIC; d["id"] = DEVICE_ID; d["role"] = DEVICE_ROLE;
    d["name"] = DEVICE_NAME; d["fw"] = FW_VERSION; d["tcpPort"] = TCP_PORT;
    udp.beginPacket(IPAddress(255, 255, 255, 255), DISCOVERY_PORT);
    serializeJson(d, udp);
    udp.endPacket();
  }
}
