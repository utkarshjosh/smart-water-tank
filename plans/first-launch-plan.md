# Plan: First Launch (v1) — Single-Node AquaMind Water Monitor

> **This is our first launch priority.** A single, self-contained sensing node
> that reports live tank data to the AquaMind backend, updates over OTA, is
> debuggable locally with our debug hub, and is provisioned by the end user via a
> push-button + SSO web flow. **No device split, no pump control** — those come
> later ([[split-device-wireless-esp32]] / `plans/split-device-wireless-esp32.md`).

## Goal (one line)
Ship one node a non-technical user can power on, provision from their AquaMind
account, and see live water level + temperature on aquamind.utkarshjoshi.com.

## Scope — explicit

**In v1:**
1. **Backend:** `aquamind.utkarshjoshi.com` hosts the backend (device API + web app).
2. **Single node:** configurable WiFi, push button(s), audio limited to a **buzzer** (no speaker/amp).
3. **Placement:** close to the tank but **under a shed**, **not** near the motor/pump.
4. **Telemetry only:** sends live level + temperature at a cadence. **Does not control the pump** (no relay).
5. **OTA:** receives firmware updates from the backend.
6. **Local debugging:** works with our **debug hub** (`tools/debug-hub`) over the LAN.
7. **Provisioning + reset:** push button clears WiFi creds / device id / account token and enters **WLAN (AP) config mode**; an SSO web flow guides WiFi selection and auto-assigns the account token.

**Out of v1 (deferred):**
- Pump/relay control, device split (tank node + control node), ESP-NOW.
- Local display/LCD (buzzer + status LED only).
- AI analytics on collected data.

## Hardware — single node
- **MCU:** ESP8266 NodeMCU (we own it) for v1. *(ESP32 is the future default — it unlocks BLE provisioning + headroom; note as an upgrade, not a v1 blocker.)*
- **Ultrasonic:** JSN-SR04T waterproof (probe on its cable into the tank). See the wired-extension notes — the 2.5 m analog probe cable reaches from the shed to the tank; splice clean if extending.
- **Temperature:** DS18B20 (1-Wire, 4.7 kΩ pull-up).
- **Buzzer:** passive/active buzzer for full/low alerts (max audio).
- **Buttons:** at least one push button for provisioning/reset (see below). Status LED.
- **Power:** AC adapter to the shed; **100 µF + 100 nF** decoupling at the sensor supply (fixes the transmit-burst sag seen on the breadboard).

## Placement & power
Node lives in a sheltered spot near the tank (under a shed) — reachable-ish, dry,
away from pump electrical noise. Sensor probe drops into the tank; temp probe at
the water. Powered from a local adapter (no long low-voltage sensor runs, no pump
proximity). This is deliberately the *simple* placement that avoids the split.

## Data & cadence
- Measure level + temperature on an interval; report to the backend on an interval.
- Sensible v1 defaults: **measure ~30–60 s, report ~60–300 s**; faster in a
  **debug/test mode**. Both **runtime-configurable and OTA-updatable** (already
  modeled as `measurementIntervalMs` / `reportIntervalMs` in `firmware/src/modules/config.*`).
- Buffer to flash (LittleFS) when offline, flush on reconnect (already in `storage`).

## Backend — `aquamind.utkarshjoshi.com`
Device-facing API (HTTPS). Existing firmware points at `aquamind-api.utkarshjoshi.com`
— **reconcile the hostname** (canonical = `aquamind.utkarshjoshi.com`, API perhaps
under `/api/v1` or an `api.` subbed path). Endpoints:
- `POST /api/v1/measurements` — telemetry ingest (exists).
- `GET  /api/v1/devices/{id}/ota/latest` — OTA manifest/binary (exists).
- **`POST /api/v1/devices/claim`** — **new**: exchange a short-lived claim code
  (see provisioning) for a permanent device token bound to the user's account.

## Provisioning & SSO claim flow  ← the important part

**The core constraint:** while a phone is connected to the device's setup AP, it
has **no internet**, so the setup page can't reach AquaMind to "auto-fill" a token
directly. We solve this with a **short claim code** minted by the logged-in web app
— the device fetches the real token itself once it's online.

**End-user flow:**
1. User logs into their **AquaMind account** (SSO — reuses the existing app auth,
   Firebase-backed) on `aquamind.utkarshjoshi.com`.
2. In the web app → **"Add device"** → backend mints a **short claim code**
   (e.g. 6–8 chars, ~10 min TTL) bound to that user's account. UI shows it (and/or a QR).
3. User **long-presses the button** on the node → it clears creds and enters
   **WLAN/AP config mode** (SoftAP + captive portal; the existing WiFiManager AP
   `WaterTank-Setup` is the seed).
4. User connects to the node's AP; the captive portal **scans and lists nearby
   SSIDs**, user picks their home WiFi + enters the password + pastes the **claim
   code** (short, not a long token).
5. Node connects to home WiFi and calls **`/api/v1/devices/claim`** with
   `{ claimCode, hardwareId }`. Backend validates the code, **binds the device to
   the user's account**, and returns the **permanent device token** + assigned
   **device id**.
6. Node persists WiFi creds + token + id, reboots into normal mode, starts
   reporting. Device now shows up under the user's account. Done.

This satisfies "auto-fills the account token": the user never handles a long
token — they enter a short code and the backend auto-assigns the real, account-
bound token.

**Guided-UX upgrade (post-v1, note it):** to avoid the network-switch dance,
adopt **Improv WiFi** (WebSerial/WebBLE) so the logged-in web app provisions the
device directly — sending WiFi creds **and** the token in one guided flow without
leaving the internet. Natural on **ESP32** (BLE provisioning); Improv-over-Serial
works on ESP8266 over USB.

## Reset button behavior
- **Long-press (hold ~5 s):** factory reset — clear WiFi creds, device id, and
  account token → reboot into **AP config mode**. (Long-press so it can't happen
  by accident.)
- *(Optional short-press:* force an immediate report / WiFi reconnect.)*

## OTA
- On boot after WiFi + periodically, check `/devices/{id}/ota/latest`; download &
  apply if newer. Already implemented in `firmware/src/modules/ota_handler.*`;
  needs the per-device id from claim (not the hardcoded default).

## Local debugging (debug hub integration)
The launch firmware must also be debuggable with `tools/debug-hub` on the LAN:
- Fold the **line-JSON debug transport** from `firmware/prototypes/net_node` into
  the product firmware: a TCP server (port 3333) + UDP announce, **guarded by a
  flag / debug mode** so it's off (or LAN-only) in normal operation.
- Then on the home network the hub **auto-discovers** the real node and shows live
  telemetry, logs, config, and OTA state — same UI used for the simulator/Wokwi.
- Reuse the shared protocol (`tools/debug-hub/src/protocol.js`).

## Reuse map — most of v1 already exists in `firmware/src/`
| Need | Existing module | Work |
|---|---|---|
| Sensing (ultrasonic + temp) | `sensor` | ready |
| Tank math / volume / % | `sensor` | ready |
| WiFi + AP config portal | `wifi_manager` (WiFiManager) | extend: add claim-code field + SSID scan UX |
| Telemetry to backend | `data_reporter` | reconcile host; use claimed token/id |
| Offline buffering | `storage` | ready |
| OTA | `ota_handler` | use claimed device id |
| Buzzer alerts | `alerts` | trim to buzzer-only |
| Runtime/OTA config | `config` | ready |
| **Claim/provision flow** | — | **new**: firmware claim call + backend `/devices/claim` + web "Add device" |
| **Local debug transport** | `prototypes/net_node` | **integrate** behind a debug flag |
| **Unique per-device id** | — | **new**: derive from ESP chip id, not hardcoded default |

## Open decisions
1. **MCU for v1:** ESP8266 (owned, captive-portal claim) vs ESP32 (BLE/Improv, headroom). Recommend ESP8266 for the first units, ESP32 as the provisioning-UX upgrade.
2. **Backend hostname:** confirm `aquamind.utkarshjoshi.com` vs existing `aquamind-api.utkarshjoshi.com`; set the canonical device API base.
3. **Claim code format + TTL**, and whether to also support a QR.
4. **Debug transport exposure:** always-on LAN, or only when a debug button/flag is set (security).
5. **Buttons:** one multi-function button vs separate reset button.

## Definition of done (launch checklist)
- [ ] A fresh node powers on → AP mode → user provisions via account claim code → appears under their AquaMind account.
- [ ] Live level + temperature visible on `aquamind.utkarshjoshi.com` at the configured cadence.
- [ ] Survives WiFi drop (buffers + flushes) and reboot (creds persist).
- [ ] OTA update pushed from backend applies successfully.
- [ ] Long-press reset returns it to AP mode and unbinds locally.
- [ ] Debug hub discovers and reads the real node on the home LAN.
- [ ] Buzzer fires on full/low thresholds.
