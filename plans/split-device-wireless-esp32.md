# Plan: Split-Device Wireless Architecture (ESP-NOW + ESP32)

> Status: **Planned / deferred.** Not being built yet. First we validate the
> sensors we already own on ESP8266 (see `firmware/prototypes/sensor_sanity/`).
> This document captures the target architecture so we don't lose the decision.

## Why split the device

Indian rooftop-tank layout: pump on the ground floor, Sintex tank on the roof.
On the breadboard prototype we hit three problems, all caused by trying to run a
fragile ultrasonic timing signal and 5 V power over a long cable:

1. **Signal integrity** — ultrasonic echo pulses are microsecond-precise and
   degrade / pick up noise over long wires.
2. **Power delivery** — 5 V droops badly over distance.
3. **Reachability** — controls, display, and reset button need to be at
   human height, but the sensor must be at the tank.

**Core principle:** *digitize the reading at the tank and send digital/wireless
data over the distance — never extend the analog signal or 5 V rail.*

## Chosen approach: two nodes, wireless link (ESP-NOW)

We chose **Option B (wireless)** over a wired RS-485 link because running a
4-core cable through the slab is impractical for us, and we're upgrading the
core module to **ESP32** anyway (more RAM/GPIO, dual core, first-class ESP-NOW,
better for config-heavy, test-friendly firmware).

```
   ROOFTOP (near tank)                 GROUND FLOOR (human-reachable)
 ┌────────────────────────┐          ┌───────────────────────────────┐
 │ TANK NODE              │          │ CONTROL NODE                  │
 │  ESP32                 │  ESP-NOW │  ESP32                        │
 │  JSN-SR04T / SR04M     │ ───────► │  OLED / LCD + buttons + reset │
 │  DS18B20 (temp)        │  (peer   │  config web UI + OTA          │
 │  buck 12V→5V, IP65 box │   to     │  WiFi uplink → our server     │
 │  minimal: sense + send │   peer)  │  (HTTP/MQTT to AquaMind API)  │
 └────────────────────────┘          └───────────────────────────────┘
            ▲                                       │
            └──── 12V DC up a 2-core wire ──────────┘
                  (buck to 5V/3.3V at the tank node)
```

### Node responsibilities
- **Tank node (roof):** dumb and rugged. Reads level + temperature, transmits
  via ESP-NOW. No display, no buttons. Sealed IP65 enclosure. Powered by a buck
  converter fed from a 12 V line run up from downstairs (send 12 V, regulate
  locally → negligible voltage drop).
- **Control node (downstairs):** display, buttons, reset, the config portal, OTA,
  and the only WiFi uplink to the AquaMind server. Receives ESP-NOW packets and
  does all the tank-height / volume / percentage math and alerting.

### Why ESP-NOW (not WiFi/MQTT for the local link)
- Peer-to-peer, no router needed — roof WiFi coverage is unreliable.
- ~100 m line-of-sight, works through a slab in most homes; very low power.
- No cloud, no Blynk, free.
- Control node still owns the single WiFi/MQTT connection to our own server, so
  the tank node never needs WiFi credentials or internet.

### Power strategy
- One 12 V 2 A AC adapter downstairs.
- 2-core wire up to the roof carrying **12 V** (not 5 V).
- Buck converter (MP1584 / LM2596, ~₹50) at the tank node steps 12 V → 5 V.
- This alone fixes the "power not enough" problem from the breadboard build.

## Target bill of materials (India — Robu.in / Robocraze)
| Part | Role | ~Price |
|---|---|---|
| ESP32 DevKit ×2 | tank + control nodes | ₹350 ea |
| JSN-SR04T / SR04M waterproof ultrasonic | tank level (already own extender) | ₹300 |
| DS18B20 (1-Wire, waterproof probe) | water temperature | ₹120 |
| MP1584 / LM2596 buck | 12V→5V at tank node | ₹50 |
| 0.96" I2C OLED (SSD1306) or I2C 16×2 LCD | control node display | ₹150–300 |
| Push buttons / rotary encoder (HW-040) | menu + reset | ₹80 |
| 12 V 2 A AC adapter | single downstairs supply | ₹200 |
| IP65 junction box | weatherproof tank node | ₹150 |
| 2-core cable | 12 V up to roof | per metre |

## Firmware direction (when we build this)
- Migrate core module to **ESP32** (`config.mk` already has the ESP32 FQBN block
  commented in, ready to switch).
- Config-driven: pin maps, tank dimensions, calibration, thresholds, and a
  **test-mode / live-mode** flag all live in a flash-persisted config struct
  (LittleFS / Preferences), not hardcoded.
- Feature flags to enable/disable modules (relay, sensor type, temp).
- **Test/simulation mode** that injects synthetic sensor values so the whole
  pipeline (ESP-NOW → control node → server) can be developed without the tank.
- Split firmware = two small sketches:
  - `tank_node`: sense + ESP-NOW send. Tiny, stable, rarely reflashed.
  - `control_node`: ESP-NOW receive + math + display + WiFi uplink + OTA.
    Almost all iteration happens here.
- Reuse the existing modular structure in `firmware/src/modules/` where possible
  (sensor, config, data_reporter, ota_handler map cleanly onto the two nodes).

## Debug / testing kit (built — runnable today)
The whole-stack testing kit for this plan already exists and runs without any
hardware:
- **`tools/debug-hub/`** — a local Node hub (zero npm deps) + web dashboard that
  bridges devices over **WiFi/LAN (TCP + UDP discovery)** and **USB serial** into
  one UI (live cards, charts, command buttons, config editor, unified log). Ships
  a **device simulator** (fake tank + control nodes) so the entire stack is
  debuggable on the local network today. Run: `node src/index.js` → open
  `http://localhost:7070`.
- **`firmware/prototypes/net_node/`** — the device side of the same line-JSON
  protocol for real hardware: WiFi + TCP server + UDP announce + telemetry +
  commands. Compiles on the ESP8266 we own *and* on ESP32. Flashing this makes a
  real board appear in the hub over WiFi, exactly like the simulator.
- One protocol (`tools/debug-hub/src/protocol.js`) is spoken by the simulator,
  the ESP firmware, and the serial `sensor_sanity` sketch — so the same UI and
  hub serve all three. This is the "configurable, test-friendly, live/test mode"
  goal, made concrete.

## What we are NOT doing right now
- Relay / pump control (de-prioritized — removes distance dependency for now).
- Blynk (paid, cloud) — we run our own admin panel + server.
- Buying new modules before the ESP8266 sensor-sanity prototype passes.

## Decision log
- **2026-07-02** — Chose wireless (ESP-NOW) split over wired RS-485 due to
  cabling difficulty; agreed to move core module to ESP32; agreed to first
  validate SR04M + DS18B20 on the existing ESP8266 before spending.
