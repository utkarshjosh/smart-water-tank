# AquaMind Debug Hub

A local **testing kit + debug dashboard** for the smart water-tank stack. It
bridges devices reached over **WiFi/LAN** *and* **USB serial** into one web UI,
and ships a **device simulator** so you can build and debug the entire stack on
your local network with **zero hardware**.

This is the tooling for [Plan 2 — the wireless ESP32 split device](../../plans/split-device-wireless-esp32.md).

```
   ┌── simulator ──┐   ┌── ESP32 (LAN) ─┐   ┌── ESP8266 (USB) ─┐
   │ tank+control  │   │ WiFiServer      │   │ serial JSON      │
   │ TCP + UDP     │   │ TCP + UDP       │   │                  │
   └───────┬───────┘   └────────┬────────┘   └────────┬─────────┘
           │  line-delimited JSON (one protocol)       │
           └───────────────┬───────────────────────────┘
                       ┌────▼─────┐
                       │   HUB    │  discovery (UDP) · TCP client · serial mgr
                       └────┬─────┘
                     SSE + fetch (no WebSocket lib)
                       ┌────▼─────┐
                       │  Web UI  │  cards · charts · commands · config · logs
                       └──────────┘
```

## Why it's built this way
- **Zero required dependencies.** The hub uses only Node built-ins (`http`,
  `net`, `dgram`). Just `node src/index.js` — no `npm install` needed to start.
- **One wire protocol** (line-delimited JSON) over both TCP (WiFi) and serial,
  so the same messages, the same UI, and the same hub code serve a simulator, a
  real ESP32 over the LAN, and the ESP8266 you already own over USB.
- **SSE + fetch** for the browser (no WebSocket library).
- **`serialport` is optional** — installed → USB boards show up; not installed →
  everything else still works.

## Quick start (no hardware, no install)
```bash
cd tools/debug-hub
node src/index.js          # hub + web UI + 2 simulated devices
# open http://localhost:7070
```
You'll see a Tank Node and a Control Node streaming live telemetry. Try the card
buttons: **Self-test**, **Mode live/test**, **Inject dropouts / noise /
disconnect** (watch the Signal pill go NOISY/POOR/NO SIGNAL and the chart react),
**Reboot**, and edit + **Save config**.

### CLI flags
| Flag | Meaning |
|---|---|
| `--sim N` | start N simulated devices (default 2; `--sim 0` = real devices only) |
| `--port P` | web UI port (default 7070) |
| `--no-serial` | skip serial-port scanning |

## Connecting real devices
- **WiFi / LAN:** a device that broadcasts a UDP `announce` (see the protocol) is
  **auto-discovered** and connected. Or add it by hand in the sidebar
  (host + port). Firmware reference: [`firmware/prototypes/net_node/`](../../firmware/prototypes/net_node/).
- **USB serial (ESP8266 you own):** install the optional serial deps once —
  ```bash
  npm install                       # pulls optionalDependencies
  # or: npm i serialport @serialport/parser-readline
  ```
  then click **Open** next to the port in the sidebar. The hub nudges the
  `sensor_sanity` sketch into JSON mode automatically, so its readings appear as
  a device card.

## The protocol (contract)
Defined in [`src/protocol.js`](src/protocol.js). One JSON object per line.

Device → hub: `announce`, `telemetry`, `log`, `ack`, `config`.
Hub → device: `cmd`, `getConfig`, `setConfig`, `ping`.

A bare telemetry object with no `type` (e.g. the `sensor_sanity` sketch's
`{"dist":..,"temp":..}`) is accepted and normalised — legacy sketches work
unchanged.

## Simulator as a standalone test source
Feed a hub running on another machine (real LAN test):
```bash
node src/simulator.js --count 3 --host 0.0.0.0
```

## Layout
```
tools/debug-hub/
├── src/
│   ├── protocol.js        # the wire contract (shared by all sides)
│   ├── hub.js             # device registry + message router
│   ├── server.js          # http static + SSE + REST control API
│   ├── discovery.js       # UDP announce listener (auto-connect)
│   ├── simulator.js       # fake tank + control nodes (real TCP+UDP)
│   ├── index.js           # entry / wiring / CLI
│   └── transports/
│       ├── tcp.js         # connect to a device's TCP server (WiFi/LAN)
│       └── serial.js      # optional USB serial ("serial port manager")
└── public/                # web UI (index.html, app.js, style.css)
```

## Status
Verified end-to-end against the simulator: UDP discovery, TCP connect, announce,
live telemetry, command round-trip (fault injection), and config set all work.
Not yet exercised against real ESP hardware — that's the `net_node` firmware step.
