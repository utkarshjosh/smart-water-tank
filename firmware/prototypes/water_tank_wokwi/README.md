# Water Tank Monitor — Wokwi (virtual ESP32)

Runs the **real modular firmware** (`config`, `claim_client`, `sensor`, `alerts`,
`data_reporter`, `ota_handler`, `storage` — same code as
[`firmware/src/modules`](../../src/modules)) inside the Wokwi simulator, so you
can exercise the **whole claim-code pairing flow** end to end from VS Code,
without a physical board.

```
 Wokwi: virtual ESP32 + HC-SR04 + DS18B20 + buzzer + LED + potentiometer
     │  joins Wokwi-GUEST, serves the pairing page on :80
     │  wokwi.toml forwards localhost:8080 ─► target:80
     ▼
 your browser: http://localhost:8080  (enter the pairing code from the app)
     │
     ▼
 ClaimClient::claim()  ──►  https://aquamind-api.utkarshjoshi.com/api/v1/devices/claim
```

## Why this is an ESP32 build, not ESP8266

The real firmware targets ESP8266 (NodeMCU). Wokwi's currently supported board
catalog has no NodeMCU/ESP8266 devkit part (only the 8-pin `esp-01`, which
doesn't expose enough GPIOs for this sketch) — this repo already established
the same call for `prototypes/net_node_wokwi`. So, like that prototype, this
is an ESP32 "twin": same module logic, ESP32-flavored includes
(`WiFi.h`/`HTTPClient.h`/`WebServer.h`/`Update.h` instead of the `ESP8266*`
headers) and GPIO pin numbers instead of `Dx` macros. `config.h`, `sensor.cpp`
(NewPing → raw trig/echo + `pulseIn`, same reason `net_node_wokwi` avoids
NewPing) and `storage.cpp` (ESP32 LittleFS's `File::openNextFile()` API
instead of ESP8266's `Dir`/`FSInfo`) are the only files with real porting
work. `types.h`, `config.cpp`, `claim_client.h/.cpp`, `alerts.*`,
`data_reporter.h`, `ota_handler.h` are byte-for-byte copies of the real
firmware.

## Why the pairing portal looks different from real hardware

On real hardware, an unpaired device hosts its own `WaterTank-Setup` WiFi
access point; you join it from a phone and a captive portal (the
[WiFiManager](https://github.com/tzapu/WiFiManager) library) asks for the
pairing code. **Wokwi doesn't yet simulate a client actually connecting to a
simulated ESP softAP** (`WiFi.softAP()` runs without erroring, but nothing can
join it — see [wokwi/wokwi-features#304](https://github.com/wokwi/wokwi-features/issues/304),
still open). So there's no way to point a real browser at `192.168.4.1` here.

Workaround (`wifi_manager.cpp` in this folder): the device joins Wokwi's
built-in `Wokwi-GUEST` network directly (there's no real router to configure
from inside a simulator anyway) and serves the *same* pairing form from a
plain web server on that connection, forwarded to `http://localhost:8080` via
`wokwi.toml`. `ClaimClient::claim()`, `Config::save()`, the restart-detection
logic, and the 3-attempt retry loop are unchanged from the real firmware —
only the transport for *reaching* the form is different.

## ⚠️ This points at the real production API

`SERVER_HOST` in `config.h` is `aquamind-api.utkarshjoshi.com` — same as real
hardware. Claim attempts, measurement reports, and OTA checks from this
simulated device will hit **production**, using outgoing internet access via
Wokwi's free Public Gateway (no paid tier needed for this direction). Use a
real pairing code minted for a test tenant/device, not a customer's. If you'd
rather point at a local backend instead:
1. Run the backend locally: `cd backend && npm run dev` (listens on
   `localhost:3000`).
2. In `config.h`, change `SERVER_HOST` to `"host.wokwi.internal"`,
   `SERVER_PORT` to `3000`, and `USE_HTTPS` to `false`.
3. This direction (simulated device → your machine) needs Wokwi's Private
   Gateway, which may require a paid Wokwi Club tier for VS Code — the
   `net.forward` used for the pairing page (below) does not.

## What's here

| File | Purpose |
|---|---|
| `water_tank_wokwi.ino` | Same setup()/loop() as `firmware/src/water_tank.ino`, ESP32 WiFi.h |
| `config.h` | Same as real config.h, but Wokwi-GUEST WiFi defaults + ESP32 GPIO pins |
| `wifi_manager.h/.cpp` | Wokwi-specific: STA-hosted pairing page instead of softAP (see above) |
| `claim_client.*`, `data_reporter.*`, `ota_handler.*`, `storage.*`, `sensor.*`, `alerts.*`, `types.h`, `config.cpp` | Ported/copied from `firmware/src/modules` |
| `diagram.json` | ESP32 devkit + HC-SR04 + DS18B20 + buzzer + LED + potentiometer (battery sim) |
| `wokwi.toml` | firmware paths + pairing-page port-forward (8080 → device :80) |

## Prerequisites

- **arduino-cli** with the ESP32 core:
  ```bash
  arduino-cli core update-index --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  arduino-cli core install esp32:esp32 --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  arduino-cli lib install ArduinoJson OneWire DallasTemperature
  ```
  (`WebServer`, `WiFi`, `HTTPClient`, `WiFiClientSecure`, `LittleFS`,
  `ArduinoOTA`, `Update` ship with the ESP32 core - no separate install.)
- **Wokwi for VS Code** extension (needed for the localhost port-forward; the
  web editor at wokwi.com can't reach *your* localhost). A free Wokwi account
  is required to activate it.

## Build → simulate → pair

1. **Compile** (from this folder) so `wokwi.toml`'s paths resolve:
   ```bash
   arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir build .
   ```
   This produces `build/water_tank_wokwi.ino.merged.bin` and `.elf` — the
   *merged* image is required (not the plain `.ino.bin`) so Wokwi's flash
   image includes the real partition table with the LittleFS partition;
   pointing at the plain `.ino.bin` makes `LittleFS.begin()` fail with
   `partition "spiffs" could not be found`.
2. **Start the sim:** open this folder in VS Code → Command Palette →
   **"Wokwi: Start Simulator"**. The serial monitor should show the firmware
   banner, `[WiFi] Connected!`, then:
   ```
   [WiFi] Device not yet paired, entering config portal...
   [WiFi] Pairing page: http://10.13.37.2/  (forwarded to http://localhost:8080/ via wokwi.toml)
   ```
3. **Get a pairing code:** through the app/self-serve signup flow (device
   pairing onboarding), mint a claim code for a test tenant.
4. **Pair it:** open `http://localhost:8080` in a real browser, enter the
   code, submit. Watch the serial monitor for `[Claim] Device claimed
   successfully` — the device saves `Config::claimed = true` and restarts.
   On the next boot it skips the portal and starts reporting.

## Driving it

- Click the **HC-SR04** and drag its **distance** slider (2–400 cm) — watch
  `[Sensor] Level: ...` in the serial monitor follow it.
- Click the **DS18B20** to change temperature, or the **potentiometer** to
  change the simulated battery voltage.
- Reboot the simulation 3× quickly (stop/start within ~5s each time) to
  exercise the restart-detection path that forces the pairing portal even on
  an already-provisioned device.

## Notes

- If `[Storage] Mount/format failed!` never clears (stays failed every boot,
  not just the very first), the flash image isn't merged correctly — re-run
  the compile step and confirm `wokwi.toml` points at `...merged.bin`.
- Validated with `wokwi-cli lint .` and a headless `wokwi-cli` boot (confirms
  compile, WiFi join, and portal startup) before relying on the VS Code
  extension for the interactive/localhost part `wokwi-cli` doesn't cover.
- This folder targets production (`aquamind-api.utkarshjoshi.com`) by default
  — see the warning above before pairing/reporting repeatedly.
