# Net Node — Wokwi (virtual ESP32)

Runs the **real `net_node` firmware** on a simulated ESP32 (with virtual HC-SR04
+ DS18B20) and feeds the [debug hub](../../../tools/debug-hub/) over WiFi — so you
can exercise the whole Plan-2 stack end to end **without buying a board**.

```
 Wokwi: virtual ESP32 + HC-SR04 + DS18B20
     │  hosts TCP :3333  (line-JSON protocol)
     │  wokwi.toml forwards localhost:3333 ─► target:3333
     ▼
 tools/debug-hub  ──►  http://localhost:7070 dashboard
```

## What's here
| File | Purpose |
|---|---|
| `net_node_wokwi.ino` | ESP32 firmware (Wokwi WiFi, raw trig/echo ultrasonic, no NewPing) |
| `diagram.json` | virtual circuit: ESP32 + HC-SR04 + DS18B20 + 4.7k pull-up |
| `wokwi.toml` | firmware paths + TCP port-forward (3333 → host) |

## Prerequisites
- **arduino-cli** with the ESP32 core:
  ```bash
  arduino-cli core update-index --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  arduino-cli core install esp32:esp32 --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  arduino-cli lib install OneWire DallasTemperature ArduinoJson
  ```
- **Wokwi for VS Code** extension (needed for the localhost port-forward; the
  web editor at wokwi.com can't reach *your* localhost). A free Wokwi account is
  required to activate it; note that some advanced/private-gateway networking is
  a paid Wokwi Club tier — the basic `net.forward` used here works with the
  extension.

## Build → simulate → connect
1. **Compile** (from this folder) so `wokwi.toml`'s paths resolve:
   ```bash
   arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir build .
   ```
   This produces `build/net_node_wokwi.ino.bin` and `.elf`.
2. **Start the sim:** open this folder in VS Code → Command Palette →
   **“Wokwi: Start Simulator”**. The serial monitor should print an IP and
   `TCP 3333`.
3. **Run the hub** (in another terminal):
   ```bash
   cd ../../../tools/debug-hub && node src/index.js
   ```
4. **Connect:** open `http://localhost:7070` → sidebar **Network device** →
   host `localhost`, port `3333` → **Connect**. The virtual ESP32 appears as a
   device card streaming telemetry.

## Driving it
- In Wokwi, click the **HC-SR04** and drag its **distance** slider (2–400 cm) —
  watch the hub's Distance card and chart follow.
- Click the **DS18B20** to change temperature.
- From the hub card: **Self-test**, **Mode live/test**, **Save config**,
  **Reboot** — all round-trip to the real firmware.

## Notes
- **Auto-discovery (UDP) won't traverse** the Wokwi gateway — that's why you add
  the device manually by `localhost:3333`. (On real hardware on your LAN, the
  UDP announce makes it appear automatically.)
- Pins here (GPIO5/18/4) are the ESP32 build; the USB/ESP8266 sibling
  (`../net_node/`) uses the ESP8266 `Dx` pins. Same protocol, same hub.
- For a **control node**, copy this folder and set `DEVICE_ROLE "control"` +
  a distinct `DEVICE_ID`/`TCP_PORT`, add a second `[[net.forward]]`, and connect
  it in the hub too.
