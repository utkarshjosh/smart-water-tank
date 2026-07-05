/**
 * ============================================================================
 * Sensor Sanity Prototype  —  ESP8266 (NodeMCU v2)
 * ============================================================================
 * PURPOSE
 *   A throwaway bench sketch to validate the RAW signals from the two sensors
 *   we already own, BEFORE building the real split-device system:
 *     - SR04M / JSN-SR04T waterproof ultrasonic (NewPing, trig/echo mode)
 *     - DS18B20 1-Wire temperature sensor
 *
 *   This is deliberately NOT the product firmware. There is:
 *     - NO tank height / volume / percentage math
 *     - NO WiFi, server, OTA, alerts, or config persistence
 *   Just: is each sensor wired right, and are the signals clean and stable?
 *   That is the exact question the breadboard build failed on.
 *
 * WHAT IT MEASURES (the diagnostics that matter)
 *   Ultrasonic:  raw echo time (µs), distance (cm), min/max/median over a burst,
 *                jitter (spread), and DROPOUT count (pings that got no echo).
 *                Dropouts + high jitter == the "signal not arriving" symptom.
 *   Temperature: bus device count, ROM address, resolution, and °C each read,
 *                flagging the two failure sentinels (-127 = disconnected,
 *                85.00 = power-on default / brown-out, never converted).
 *
 * SERIAL MENU (115200 baud, send a single char)
 *   b = both sensors (default, continuous)
 *   u = ultrasonic only
 *   t = temperature only
 *   c = CSV mode (for Arduino Serial Plotter: dist_cm, temp_c)
 *   j = JSON telemetry mode (machine-readable; used by the Web UI)
 *   s = one-shot self-test / summary
 *   h = help
 *
 * WEB UI
 *   Open webui/index.html in Chrome/Edge and click Connect for a clean
 *   dashboard (live cards, chart, buttons) instead of the serial console.
 *   The Web UI auto-sends 'j' on connect to start JSON telemetry.
 *
 * WIRING (NodeMCU v2 — matches firmware/src/modules/config.h where safe)
 *   SR04M / JSN-SR04T:
 *     VCC  -> 5V (VIN)        (5V gives the transmitter enough power — a
 *                              common breadboard failure was under-powering it)
 *     GND  -> GND
 *     TRIG -> D1 (GPIO5)
 *     ECHO -> D2 (GPIO4)
 *     Use the module in HC-SR04-compatible trig/echo mode (default, R19 open).
 *     Min reliable range is ~20-25 cm (dead zone) — readings below that lie.
 *
 *   DS18B20 (1-Wire):
 *     VCC  -> 3V3
 *     GND  -> GND
 *     DATA -> D3 (GPIO0)      + a 4.7k pull-up resistor between DATA and 3V3
 *                              (REQUIRED — without it you get -127 / garbage)
 *     NOTE: GPIO0 is a boot strapping pin. The 4.7k pull-up holds it HIGH at
 *     boot so the ESP boots normally. If you ever see boot loops, move DATA to
 *     D5 (GPIO14) and change TEMP_PIN below.
 *
 * FLASH IT (from firmware/ )
 *   arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 \
 *       prototypes/sensor_sanity
 *   arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 \
 *       -p /dev/tty.usbserial-XXXX prototypes/sensor_sanity
 *   arduino-cli monitor -p /dev/tty.usbserial-XXXX -c baudrate=115200
 *   (All 3 libs — NewPing, OneWire, DallasTemperature — are already installed
 *    per firmware/libraries.txt, so no extra setup.)
 * ============================================================================
 */

#include <NewPing.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------------------------------------------------------------------------
// Pin configuration  (change here if you rewire)
// ---------------------------------------------------------------------------
#define TRIG_PIN    5 //D1      // GPIO5  -> SR04M TRIG
#define ECHO_PIN    0//D3      // GPIO0  -> SR04M ECHO
#define TEMP_PIN    4 //D2      // GPIO4  -> DS18B20 DATA (needs 4.7k pull-up to 3V3)

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
#define MAX_DISTANCE_CM   400   // NewPing ceiling; echoes beyond this = 0 (dropout)
#define BURST_SAMPLES     10    // pings per ultrasonic reading (to see jitter)
#define PING_GAP_MS       40    // gap between pings in a burst
#define LOOP_INTERVAL_MS  1000  // how often to print a reading in continuous modes

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE_CM);
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

// Runtime mode
enum Mode { MODE_BOTH, MODE_ULTRA, MODE_TEMP, MODE_CSV, MODE_JSON };
Mode mode = MODE_BOTH;

uint8_t dsCount = 0;                 // number of DS18B20 devices found
DeviceAddress dsAddr;                // ROM address of first DS18B20
unsigned long lastLoopMs = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Result of an ultrasonic burst
struct UltraResult {
  float medianCm;
  float minCm;
  float maxCm;
  unsigned int rawMedianUs;
  int dropouts;   // pings that returned no echo (0)
  int valid;      // pings with a real echo
};

// Take a burst of pings and summarise it. This is the key diagnostic:
// a clean sensor gives tight, consistent readings with 0 dropouts.
UltraResult readUltraBurst() {
  float cm[BURST_SAMPLES];
  unsigned int us[BURST_SAMPLES];
  UltraResult r = {0, 0, 0, 0, 0, 0};

  for (int i = 0; i < BURST_SAMPLES; i++) {
    unsigned int t = sonar.ping();          // echo time in µs (0 = no echo)
    us[i] = t;
    if (t == 0) {
      cm[i] = -1;                            // mark dropout
      r.dropouts++;
    } else {
      cm[i] = sonar.convert_cm(t);
      r.valid++;
    }
    delay(PING_GAP_MS);
  }

  if (r.valid == 0) return r;                // all dropped out

  // Collect only valid readings, sort for median + min/max
  float v[BURST_SAMPLES];
  unsigned int vu[BURST_SAMPLES];
  int n = 0;
  for (int i = 0; i < BURST_SAMPLES; i++) {
    if (cm[i] >= 0) { v[n] = cm[i]; vu[n] = us[i]; n++; }
  }
  for (int i = 0; i < n - 1; i++) {
    for (int j = i + 1; j < n; j++) {
      if (v[j] < v[i]) {
        float tf = v[i]; v[i] = v[j]; v[j] = tf;
        unsigned int tu = vu[i]; vu[i] = vu[j]; vu[j] = tu;
      }
    }
  }
  r.minCm = v[0];
  r.maxCm = v[n - 1];
  r.medianCm = v[n / 2];
  r.rawMedianUs = vu[n / 2];
  return r;
}

float readTempC() {
  tempSensor.requestTemperatures();
  return tempSensor.getTempCByIndex(0);
}

void printAddr(const DeviceAddress a) {
  for (uint8_t i = 0; i < 8; i++) {
    if (a[i] < 16) Serial.print('0');
    Serial.print(a[i], HEX);
    if (i < 7) Serial.print(':');
  }
}

void printHelp() {
  Serial.println(F("\n--- Sensor Sanity ---"));
  Serial.println(F("  b = both (default)     u = ultrasonic only"));
  Serial.println(F("  t = temperature only   c = CSV (Serial Plotter)"));
  Serial.println(F("  j = JSON telemetry     s = self-test"));
  Serial.println(F("  h = this help"));
  Serial.println(F("---------------------\n"));
}

// One-shot summary: are the sensors present and sane?
void selfTest() {
  Serial.println(F("\n=== SELF-TEST ==="));

  // Ultrasonic
  UltraResult u = readUltraBurst();
  Serial.printf("Ultrasonic: %d/%d valid, %d dropouts\n",
                u.valid, BURST_SAMPLES, u.dropouts);
  if (u.valid == 0) {
    Serial.println(F("  FAIL: no echoes. Check 5V power, TRIG/ECHO wiring, "
                     "and that the target is > ~20cm away."));
  } else {
    Serial.printf("  median %.1f cm (%u us), spread %.1f cm\n",
                  u.medianCm, u.rawMedianUs, u.maxCm - u.minCm);
    if (u.dropouts > BURST_SAMPLES / 3)
      Serial.println(F("  WARN: many dropouts -> weak power or noisy/long cable."));
    if (u.maxCm - u.minCm > 3.0)
      Serial.println(F("  WARN: high jitter -> unstable mounting or reflections."));
    if (u.valid > 0 && u.dropouts == 0 && (u.maxCm - u.minCm) <= 3.0)
      Serial.println(F("  OK: stable ultrasonic signal."));
  }

  // Temperature
  Serial.printf("DS18B20 devices on bus: %d\n", dsCount);
  if (dsCount == 0) {
    Serial.println(F("  FAIL: none found. Check DATA wiring and 4.7k pull-up to 3V3."));
  } else {
    float t = readTempC();
    Serial.printf("  temp: %.2f C  (addr ", t);
    printAddr(dsAddr);
    Serial.println(")");
    if (t == DEVICE_DISCONNECTED_C)
      Serial.println(F("  FAIL: -127 -> disconnected mid-read / no pull-up."));
    else if (t == 85.0)
      Serial.println(F("  WARN: 85.00 is the power-on default -> brown-out or "
                       "never converted. Check power."));
    else
      Serial.println(F("  OK: plausible temperature."));
  }
  Serial.println(F("=================\n"));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n\nSensor Sanity Prototype (ESP8266)"));
  Serial.printf("Pins  TRIG=%d ECHO=%d TEMP=%d\n", TRIG_PIN, ECHO_PIN, TEMP_PIN);

  tempSensor.begin();
  dsCount = tempSensor.getDeviceCount();
  if (dsCount > 0) {
    tempSensor.getAddress(dsAddr, 0);
    tempSensor.setResolution(dsAddr, 12);   // 12-bit = 0.0625 C, ~750ms/read
  }

  printHelp();
  selfTest();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
void loop() {
  // Handle menu input
  if (Serial.available()) {
    char c = Serial.read();
    switch (c) {
      case 'b': mode = MODE_BOTH;  Serial.println(F(">> both"));            break;
      case 'u': mode = MODE_ULTRA; Serial.println(F(">> ultrasonic only")); break;
      case 't': mode = MODE_TEMP;  Serial.println(F(">> temperature only")); break;
      case 'c': mode = MODE_CSV;
                Serial.println(F("dist_cm,temp_c"));                        break;
      case 'j': mode = MODE_JSON;                                          break;
      case 's': selfTest();                                                break;
      case 'h': printHelp();                                               break;
      default: break;   // ignore newlines etc.
    }
  }

  if (millis() - lastLoopMs < LOOP_INTERVAL_MS) return;
  lastLoopMs = millis();

  switch (mode) {
    case MODE_ULTRA: {
      UltraResult u = readUltraBurst();
      if (u.valid == 0) {
        Serial.println(F("[US] no echo (dropout)"));
      } else {
        Serial.printf("[US] %.1f cm  (raw %u us)  min %.1f / max %.1f  "
                      "drops %d/%d\n",
                      u.medianCm, u.rawMedianUs, u.minCm, u.maxCm,
                      u.dropouts, BURST_SAMPLES);
      }
      break;
    }
    case MODE_TEMP: {
      float t = readTempC();
      if (t == DEVICE_DISCONNECTED_C) Serial.println(F("[T] disconnected (-127)"));
      else                            Serial.printf("[T] %.2f C\n", t);
      break;
    }
    case MODE_CSV: {
      UltraResult u = readUltraBurst();
      float t = readTempC();
      Serial.printf("%.1f,%.2f\n", u.valid ? u.medianCm : 0.0, t);
      break;
    }
    case MODE_JSON: {
      // Compact machine-readable line for the Web UI. Fields are self-describing;
      // null means "no valid reading". Keep this on ONE line (UI splits on \n).
      UltraResult u = readUltraBurst();
      float t = readTempC();
      Serial.print(F("{"));
      if (u.valid) {
        Serial.printf("\"dist\":%.1f,\"us\":%u,\"min\":%.1f,\"max\":%.1f,",
                      u.medianCm, u.rawMedianUs, u.minCm, u.maxCm);
      } else {
        Serial.print(F("\"dist\":null,\"us\":0,\"min\":null,\"max\":null,"));
      }
      Serial.printf("\"drops\":%d,\"valid\":%d,", u.dropouts, u.valid);
      if (t == DEVICE_DISCONNECTED_C) Serial.print(F("\"temp\":null}"));
      else                            Serial.printf("\"temp\":%.2f}", t);
      Serial.println();
      break;
    }
    case MODE_BOTH:
    default: {
      UltraResult u = readUltraBurst();
      float t = readTempC();
      Serial.printf("[US] %s  drops %d/%d   [T] ",
                    u.valid ? "" : "NO ECHO", u.dropouts, BURST_SAMPLES);
      if (u.valid) Serial.printf("%.1f cm  ", u.medianCm);
      else         Serial.print(F("--    "));
      if (t == DEVICE_DISCONNECTED_C) Serial.println(F("temp: disconnected"));
      else                            Serial.printf("temp: %.2f C\n", t);
      break;
    }
  }
}
