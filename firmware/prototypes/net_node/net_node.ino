/**
 * ============================================================================
 * Net Node  —  device side of the AquaMind debug protocol (WiFi / LAN)
 * ============================================================================
 * The firmware counterpart to tools/debug-hub. It makes a real board appear in
 * the debug dashboard over WiFi, exactly like the simulator does:
 *   - connects to WiFi
 *   - hosts a TCP server on port 3333 speaking line-delimited JSON
 *   - broadcasts a UDP "announce" so the hub auto-discovers it on the LAN
 *   - streams telemetry (SR04M ultrasonic + DS18B20 temp)
 *   - handles commands: ping / getConfig / setConfig / cmd(selftest|setMode|reboot)
 *
 * Compiles for BOTH the ESP8266 you already own AND a future ESP32 (Plan 2).
 * This is the bridge from the sensor_sanity prototype to the split-device build.
 *
 * Libraries (all already in firmware/libraries.txt): NewPing, OneWire,
 * DallasTemperature, ArduinoJson.
 *
 * FLASH (from firmware/, ESP8266):
 *   arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 prototypes/net_node
 *   arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 -p <port> prototypes/net_node
 * Then run the hub (tools/debug-hub) on the same LAN — the board appears
 * automatically. No IP config needed.
 * ============================================================================
 */

#if defined(ESP32)
  #include <WiFi.h>
#else
  #include <ESP8266WiFi.h>
#endif
#include <WiFiUdp.h>
#include <NewPing.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------------------
// Configuration (edit these)
// ---------------------------------------------------------------------------
#define WIFI_SSID     "Champs"
#define WIFI_PASS     "@susChamps@11"

#define DEVICE_ID     "tank-01"
#define DEVICE_ROLE   "tank"        // "tank" or "control"
#define DEVICE_NAME   "Tank Node 01"
#define FW_VERSION    "net-0.1.0"

#define TCP_PORT        3333
#define DISCOVERY_PORT  3334
#define DISCOVERY_MAGIC "AQUAMIND_HUB"

// Pins (match sensor_sanity)
#define TRIG_PIN   D1
#define ECHO_PIN   D2
#define TEMP_PIN   D3
#define MAX_DISTANCE_CM 400
#define BURST 10

// ---------------------------------------------------------------------------
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE_CM);
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

WiFiServer server(TCP_PORT);
WiFiClient client;
WiFiUDP udp;

// Runtime config (mutable via setConfig)
uint32_t sampleMs = 1000;
char mode[8] = "live";
uint16_t tankHeightCm = 150;

unsigned long lastSample = 0, lastAnnounce = 0, startMs = 0;
String rxBuf;

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------
struct Ultra { float median, mn, mx; unsigned int us; int drops, valid; };

Ultra readUltra() {
  float v[BURST]; unsigned int u[BURST]; Ultra r = {0,0,0,0,0,0};
  int n = 0;
  for (int i = 0; i < BURST; i++) {
    unsigned int t = sonar.ping();
    if (t == 0) { r.drops++; } else { v[n] = sonar.convert_cm(t); u[n] = t; n++; }
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
// Messaging
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
  if (deserializeJson(d, line)) return;             // ignore malformed
  const char* type = d["type"] | "";

  if (!strcmp(type, "ping"))          sendAnnounce(client);
  else if (!strcmp(type, "getConfig")) sendConfig();
  else if (!strcmp(type, "setConfig")) {
    if (d["config"]["sampleMs"].is<uint32_t>())    sampleMs = d["config"]["sampleMs"];
    if (d["config"]["tankHeightCm"].is<uint16_t>()) tankHeightCm = d["config"]["tankHeightCm"];
    if (d["config"]["mode"].is<const char*>())     strlcpy(mode, d["config"]["mode"], sizeof(mode));
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
  tempSensor.begin();

  Serial.printf("\n[net_node] %s (%s) connecting to WiFi '%s'...\n", DEVICE_NAME, DEVICE_ID, WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print('.'); }
  Serial.printf("\n[net_node] IP %s  TCP %d\n", WiFi.localIP().toString().c_str(), TCP_PORT);

  server.begin();
  udp.begin(DISCOVERY_PORT);
}

void loop() {
  // Accept a single hub connection.
  if (!client || !client.connected()) {
    WiFiClient c = server.available();
    if (c) { client = c; client.setNoDelay(true); sendAnnounce(client); sendConfig(); }
  }

  // Read newline-delimited commands from the hub.
  while (client && client.available()) {
    char ch = client.read();
    if (ch == '\n') { handleMessage(rxBuf); rxBuf = ""; }
    else if (ch != '\r' && rxBuf.length() < 512) rxBuf += ch;
  }

  unsigned long now = millis();
  if (now - lastSample >= sampleMs) { lastSample = now; if (client && client.connected()) sendTelemetry(); }

  // UDP announce broadcast so the hub auto-discovers us.
  if (now - lastAnnounce >= 3000) {
    lastAnnounce = now;
    IPAddress bcast(255, 255, 255, 255);
    JsonDocument d;
    d["magic"] = DISCOVERY_MAGIC; d["id"] = DEVICE_ID; d["role"] = DEVICE_ROLE;
    d["name"] = DEVICE_NAME; d["fw"] = FW_VERSION; d["tcpPort"] = TCP_PORT;
    udp.beginPacket(bcast, DISCOVERY_PORT);
    serializeJson(d, udp);
    udp.endPacket();
  }
}
