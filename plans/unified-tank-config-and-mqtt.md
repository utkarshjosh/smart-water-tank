# Unified Tank Config, Server-Side Volume & MQTT Device Sync

## Status (as of 2026-07-12)

| Phase | Scope | State | Notes |
|---|---|---|---|
| **0** | dead-zone calibration + server-side volume at ingest | ✅ done, **committed** on `main` | frontend wizard: diameter always asked; nominal shortcut removed |
| **1** | `Device.configVersion` + merged `buildDeviceConfig` payload + piggyback stale-check | ✅ done, **uncommitted** | version on `Device` (not `DeviceConfig`) |
| **1.5** | read-time volume in `/current`, device list, history, admin | ✅ done, **uncommitted** | fixes stale dashboard volume; mirrors `level_percent` |
| **2 – backend/infra** | `protocol/`, `gateway/` (HTTP+MQTT adapters), `syncMode`, retained-config push, MQTT token auth, Mosquitto config | ✅ done, **uncommitted** | tsc clean, 49/49 tests; MQTT disabled unless `MQTT_URL` set |
| **2 – firmware** | runtime server-geometry override, `mqtt_reporter` (PubSubClient), `config_version` reporting, HTTP fallback | ✅ done, **uncommitted** | both variants compile (arduino-cli): 526968 B off / 531764 B on. HTTP-side (`applyServerConfig`, `config_version`) also landed |
| **2 – firmware build controls** | override-friendly MQTT compile flags + corrected sketch flattening | ✅ done, **uncommitted** | default build 552K; MQTT local build 557K |
| **2 – local MQTT broker** | Mosquitto Docker service for real-broker testing | ✅ up locally, **uncommitted compose/config** | `aquamind-mosquitto` listening on 1883/8883; backend account smoke-tested with retained publish |
| **2 – broker E2E** | backend MQTT adapter + real broker telemetry/config push | ✅ done locally | telemetry recorded through MQTT; stale telemetry published retained config; profile update bumped version and refreshed retained config |
| **2 – broker auth hook** | Mosquitto go-auth files+HTTP backend | ✅ done locally | backend account via files backend; devices auto-auth via backend `DeviceToken` HTTP hook |
| **2 – repeatable MQTT smoke** | `npm run mqtt:smoke` | ✅ done | seeds DB token, connects as device, publishes telemetry, verifies retained config + DB insert |

**Migrations applied to live DB** (`localhost:3307/water_tank_db`): `add_dead_zone_and_config_version`, `add_sync_mode`. The original hand-written `dead_zone` migration was replaced by the Prisma-generated one.

**Not yet done / follow-ups (not blockers):**
- `tools/debug-hub` `protocol.js` still uses the old `distCm`/`tempC` telemetry shape — reconcile to the Phase 2 wire contract.
- Frontend `sync_mode` toggle (`PUT /devices/:id/sync-mode` exists, unused).
- Decide `cmd.cmd` strict enum vs. lenient `z.string()` (currently lenient/forward-compatible).
- **Pre-push blocker:** scrub plaintext WiFi creds from tracked `firmware/prototypes/net_node/net_node.ino` into gitignored `config.h.local`.

**Commit state:** Phase 0 committed on `main`; Phases 1 / 1.5 / 2 (+ firmware, Mosquitto, this doc) all uncommitted, awaiting a review-and-commit pass.

## Current Local MQTT State (2026-07-13)

- Broker is running via `docker compose -f mosquitto/docker-compose.mqtt.yml up -d`.
- Container: `aquamind-mosquitto`.
- Ports: `1883` plain MQTT and `8883` mapped for future TLS listener.
- Local backend broker account exists in ignored `mosquitto/passwd`:
  `MQTT_USERNAME=aquamind-backend`, `MQTT_PASSWORD=change-me`.
- Smoke test passed with authenticated retained publish to
  `devices/smoke-test/config`.
- Real backend/broker E2E passed with local DB smoke device `mqtt-smoke-001`:
  MQTT telemetry inserted a measurement and published retained config; a tank
  profile update bumped `config_version` to `2` and refreshed the retained
  `devices/mqtt-smoke-001/config` payload.
- Firmware can now be compiled for a local plaintext MQTT broker without source
  edits:
  `make build MQTT_BUILD=1 MQTT_HOST=<broker-lan-ip> MQTT_PORT=1883 MQTT_TLS=0`
  from `firmware/`.
- Broker now uses mosquitto-go-auth `files,http` locally:
  - backend service account is authenticated by ignored `mosquitto/passwd`;
  - devices authenticate automatically against backend `DeviceToken` rows via
    `/api/v1/mqtt-auth/user`;
  - device ACL is limited to `devices/{deviceId}/#`.
- Repeatable smoke test:
  `cd backend-v2 && npm run mqtt:smoke`.

## Next Steps

1. Add the frontend `sync_mode` toggle using the existing
   `PUT /devices/:id/sync-mode` endpoint.
2. Add user/admin config sync status: reported version, desired version,
   stale/synced, transport, last MQTT telemetry.
3. Add command API + UI for `selftest`, `reboot`, `getConfig`.
4. Reconcile `tools/debug-hub/src/protocol.js` with the Phase 2 telemetry shape.
5. Before committing, scrub plaintext WiFi credentials from tracked firmware
   prototype files into gitignored local config.
6. Add token lifecycle: revoke/reissue, expiry policy, refresh path.

## Why

Today the dashboard shows contradictory numbers (e.g. `volume_l: 572.56` while
`level_percent: 44%` on a nameplate-1000 L tank). Root cause: **two disconnected
geometry stores.**

- `volume_l` is computed **on the ESP** from compile-time `#define`s in
  `firmware/prototypes/water_tank_wokwi/config.h` (a single 90 cm cylinder). The
  server stores and echoes it verbatim — never recalculates.
  (`device.routes.ts:62`, `device.service.ts:18`)
- `level_percent` is computed **server-side** from the `TankProfile` table the
  Tank Setup wizard writes. (`user.service.ts` → `computeLevelPercent`)
- The wizard writes `TankProfile`; the device pulls `DeviceConfig`. **Nothing
  connects them**, and geometry is never pushed to the device.
- The device's config `diameter` is a compile-time constant — **not remotely
  changeable at all**. `level_empty_cm`/`level_full_cm` *can* ride the device
  config payload but no UI/API ever sets them.

## Goals

1. **One tank config** (shape + geometry) as the single source of truth, synced
   to app + server + device.
2. **Server-side volume** derived from geometry + measured level.
3. Correct **sensor calibration model** for a top-mounted ultrasonic with a dead
   zone.
4. Push config changes to the device, moving the transport to **MQTT** behind a
   **protocol-agnostic adapter** (HTTP kept as fallback; MQTT supports both a
   live-sync mode for debugging and a piggyback mode to save requests).

## Decisions (confirmed with user)

- **Dead-zone model: clamp-to-full (nameplate).** Capacity = full geometry
  (`area × height`). The measurable span maps 0→100 %; once water enters the top
  dead-zone band the reading is clamped to 100 % / full liters.
- **Transport: move to MQTT**, behind an adapter so HTTP still works. MQTT has a
  **live-sync mode** (instant push, debugging) and a **piggyback mode** (retained
  config, device applies on next check-in to save requests/battery).

## Sensor calibration model

The ultrasonic reports **distance `d`** (sensor face → water surface). Params
(single source of truth = extended `TankProfile`):

Note: firmware should eventually account, at least lightly, for tank air
temperature and humidity effects on ultrasonic speed-of-sound distance
calculation. Current temperature telemetry is separate and is not used for
distance correction.

| Param | Meaning | User's tank |
|---|---|---|
| `heightCm` (H) | full water column height → nameplate capacity | 90 |
| `sensorOffsetCm` (s) | gap from sensor to the full-water line | 0 |
| `deadZoneCm` (z) | min measurable distance; below this the sensor is blind | 20 |
| cross-section | `diameterCm` (cyl) or `lengthCm`×`widthCm` (cuboid) | — |
| `parallelUnitCount` | identical tanks plumbed as one | — |

Derived:
```
levelEmptyCm      = s + H                       // reading when empty (=90)
levelFullEffCm    = max(s, z)                   // closest we can measure (=20)
measurableSpanCm  = levelEmptyCm - levelFullEffCm   // (=70)

percent(d) = clamp( 100 * (levelEmptyCm - clamp(d, levelFullEffCm, levelEmptyCm))
                          / measurableSpanCm, 0, 100 )
             // d<=z  -> 100% (clamp-to-full)
             // d>=levelEmpty -> 0%

totalCapacityL = area(shape) * H / 1000 * parallelUnitCount
volumeL        = percent/100 * totalCapacityL   // nameplate-scaled, shape-consistent
```

So volume is `percent × nameplate` — self-consistent with "70 cm measured = full
= area × 90 cm liters", and identical to `area × waterHeight` for prismatic tanks.

## Implementation — staged so the fix ships first

### Phase 0 — Correctness now (HTTP only, no MQTT)  ← fixes the visible bug

1. **DB**: add `TankProfile.deadZoneCm` (Decimal, default e.g. 25). Prisma
   migration.
2. **tank-profile.service.ts**:
   - Add `computeVolumeL(profile, levelCm)` and rework `computeLevelPercent` to
     the model above (dead-zone clamp, measurable span).
   - `TankProfileInput` + `upsertTankProfile` + DTO gain `dead_zone_cm`.
3. **device.service.ts `recordMeasurement`**: compute `volumeL` server-side from
   `levelCm` + `TankProfile`; store that as canonical `volumeL`. Keep the
   device-sent value only for debug (optionally a `deviceVolumeL` column; else
   drop it). Read DTOs already surface `volumeL`.
4. **Frontend wizard** (`TankSetupWizard.tsx`): for cylindrical, always ask
   **diameter + height** (not hidden behind "exact dimensions"); cuboidal already
   asks L+W+H. Add `dead_zone_cm` (advanced, default 20). Keep nominal-size as an
   optional shortcut.
5. Backfill/one-off: recompute volume for existing devices' latest readings, or
   just let it self-heal on next measurement.

**Outcome:** volume and percentage always agree; diameter is user-editable; the
573 L / 44 % contradiction is gone — no firmware or MQTT needed yet.

### Phase 1 — Unified config + versioned sync over HTTP

1. **Merged device config payload** = operational (`DeviceConfig`: intervals,
   thresholds) + calibration/geometry (derived from `TankProfile`) + a monotonic
   `configVersion`. Add `configVersion` (int) on **`Device`** (not
   `DeviceConfig`), bumped on any `TankProfile`/`DeviceConfig` write. It lives on
   `Device` because that row always exists, whereas `DeviceConfig`/`TankProfile`
   rows may not — putting the version on `Device` avoids upsert gymnastics when
   bumping.
2. Device sends its current `config_version` in the measurement POST. Server
   returns the full config **only when the device is stale** (piggyback — saves
   bandwidth vs. today's every-time return).
3. `GET /config` returns the merged payload + version.

### Phase 2 — Protocol adapter + MQTT

1. **Shared protocol module** `backend-v2/src/protocol/` — TS types + Zod schemas
   for the existing line-JSON messages (`announce`, `telemetry`, `config`,
   `getConfig`, `setConfig`, `ack`, `cmd`, `ping`), reused from `net_node.ino` /
   `tools/debug-hub`. Extend `config`/`setConfig` to carry full geometry
   (shape, diameter/length/width, height, deadZone, sensorOffset, version).
2. **DeviceGateway** interface with transport-independent core logic
   (record telemetry, resolve config, bump/push version) and two adapters:
   - `HttpAdapter` — existing REST (POST=telemetry, GET /config=getConfig).
   - `MqttAdapter` — subscribe `devices/{id}/telemetry|announce|ack`, publish
     `devices/{id}/config|cmd`.
3. **Broker**: Mosquitto (add to deploy + `env.ts`: `MQTT_URL`, TLS). Auth:
   MQTT username=`deviceId`, password=device token, validated against
   `DeviceToken`.
4. **Modes** (per-device `sync_mode`):
   - **live-sync**: device stays subscribed; on `upsertTankProfile` /
     `updateAlertThresholds` the server publishes config to
     `devices/{id}/config` instantly ("immediately ping the device").
     Also streams telemetry for the debug dashboard.
   - **piggyback**: server publishes config with `retain=true`; device applies
     on its next connect without a live round-trip. Saves requests/battery.
5. **Config-change hook**: after DB write, bump version and
   `gateway.pushConfig(deviceId)` — MQTT publishes retained config; HTTP adapter
   is a no-op (device picks it up on next poll).
6. **Firmware**: add `PubSubClient` MQTT path alongside HTTP; apply
   server-supplied geometry/calibration instead of compile-time `TANK_*`;
   report `config_version` in telemetry; unify config message with the shared
   protocol. `net_node.ino` already carries `tankHeightCm` — extend to full
   geometry. Device still computes its own volume locally (for OLED/debug); the
   server value stays canonical.

## Files touched (by phase)

- **P0**: `backend-v2/prisma/schema.prisma`, `services/tank-profile.service.ts`,
  `services/device.service.ts`, `services/user.service.ts`,
  `frontend/src/components/tank-setup/TankSetupWizard.tsx`,
  `routes/user.routes.ts` (validation).
- **P1**: `+ Device.configVersion`, `device.routes.ts`,
  `device.service.ts` (config merge + stale check), `lib/config-version.ts`
  (shared `bumpConfigVersion`).
- **P2**: `backend-v2/src/protocol/*`, `src/gateway/*` (Http/Mqtt adapters),
  `index.ts` (start MQTT), `config/env.ts`, deploy (Mosquitto),
  firmware (`water_tank_wokwi`, `net_node`), `tools/debug-hub` (shared protocol).

## Phase 1.5 — Dashboard reads server-computed volume (read-path)

Phase 0 only fixed volume at **ingest** time. The dashboard read paths still echo
the stored `volume_l` column, so old rows and the live `/current` value stay
wrong until the device re-reports. Fix: recompute volume at **read** time from
`levelCm` + the current `TankProfile` (mirroring how `level_percent` already
works via `resolveLevelPercent`), in: `getDeviceCurrent`, `getDeviceHistory`,
`listDevicesForTenant`, and `admin.service` current-status. The stored column
becomes a debug snapshot; profile edits then instantly correct all displayed
volumes with no backfill.

## Phase 2 wire contract (authoritative — backend AND firmware must match)

**MQTT topics** (all JSON payloads; `{id}` = `deviceId`):
| Topic | Dir | Retained | Payload `type` |
|---|---|---|---|
| `devices/{id}/announce`  | device→server | no  | `announce` |
| `devices/{id}/telemetry` | device→server | no  | `telemetry` |
| `devices/{id}/ack`       | device→server | no  | `ack` |
| `devices/{id}/config`    | server→device | **yes** | `config` |
| `devices/{id}/cmd`       | server→device | no  | `cmd` |

**Auth**: MQTT `username` = `deviceId`, `password` = the device bearer token
(same token as HTTP `deviceAuth`), validated against `DeviceToken`. TLS in prod.

**Message shapes** (reuse the existing `net_node.ino` / debug-hub line-JSON):
```
announce  { type:"announce", id, role, name, fw, caps:[], configVersion }
telemetry { type:"telemetry", id, ts, configVersion,
            data:{ level_cm|null, temperature_c|null, battery_v, rssi } }
config    { type:"config", id, config:{ <full merged buildDeviceConfig payload,
            incl config_version + geometry + operational> } }
cmd       { type:"cmd", id, cmd:"getConfig"|"reboot"|"setMode"|"selftest", args:{} }
ack       { type:"ack", id, cmd, ok:bool, msg }
```
Telemetry field names match the HTTP measurement body (`level_cm`,
`temperature_c`, `battery_v`, `rssi`) so the same core `recordMeasurement` logic
handles both transports. `config.config` is exactly the Phase 1 `buildDeviceConfig`
payload — one shape across HTTP and MQTT.

**Sync modes** (per-device `syncMode` on `DeviceConfig`, default `piggyback`):
- `live`   — device stays subscribed; on any config bump the server publishes the
  retained `config` immediately ("ping the device").
- `piggyback` — server only keeps the retained `config` fresh; device applies it
  on its next connect/telemetry. Saves battery/requests.
In BOTH modes the config topic is retained, so a reconnecting device always gets
the latest without a live round-trip.

**Gateway abstraction**: `DeviceGateway` interface with transport-independent core
(`onTelemetry` → `recordMeasurement`; `onAnnounce`; `resolveConfig`;
`pushConfig(deviceId)`). `HttpAdapter` maps REST↔core (POST=telemetry,
GET /config=resolveConfig, `pushConfig`=no-op, device pulls). `MqttAdapter`
maps topics↔core and implements `pushConfig` via a retained publish. Config-change
hooks (`upsertTankProfile`, `updateAlertThresholds`) call `bumpConfigVersion` then
`gateway.pushConfig(deviceId)`.

## Open items

- Keep or drop the device-sent `volume_l` column (debug cross-check vs. remove).
- Default `deadZoneCm` for the SR04M (datasheet ~25 cm; user's unit measured 20).
- Whether cuboidal/cyl "nominal size" shortcut survives once diameter is always
  asked.

---

## Status & progress (updated 2026-07-12)

### Done
- **Phase 0 / 1 / 1.5** — landed (server-side volume, read-time volume in all
  dashboard paths, `Device.configVersion`, `buildDeviceConfig`, piggyback
  stale-check, `lib/config-version.ts`). *(uncommitted in the working tree)*
- **Phase 2 backend + infra — COMPLETE** *(uncommitted working-tree edits)*:
  - `backend-v2/src/protocol/` — TS types + Zod schemas for `announce`,
    `telemetry`, `config`, `cmd`, `ack` (+ `getConfig`/`setConfig`/`ping` for
    `net_node` parity); `parseDeviceMessage` validates + discriminates on `type`.
    Telemetry fields match the HTTP body (`level_cm`, `temperature_c`,
    `battery_v`, `rssi`) and carry `configVersion`.
  - `backend-v2/src/gateway/` — transport-independent `GatewayCore`
    (`handleTelemetry`→existing `recordMeasurement`, `handleAnnounce`,
    `resolveConfig`→`buildDeviceConfig`, `buildConfigMessageForDevice`);
    `HttpAdapter` (pushConfig no-op); `MqttAdapter` (subscribe
    `devices/+/telemetry|announce|ack`; publish retained `devices/{id}/config`
    QoS 1; push on stale **or** `syncMode==live`); `registry.pushConfigToDevice`.
  - `syncMode` enum (`live`|`piggyback`, default `piggyback`) on `DeviceConfig`
    — migration `20260712165622_add_sync_mode`; surfaced as `sync_mode` in
    `buildDeviceConfig`; `PUT /api/v1/user/devices/:id/sync-mode` route.
  - Config-change push hooks in `upsertTankProfile`, `updateAlertThresholds`,
    `setSyncMode` (fire-and-forget, broker-down safe).
  - Env/wiring: `MQTT_URL` (unset ⇒ HTTP-only), `MQTT_USERNAME/PASSWORD`, TLS
    opts, `MQTT_AUTH_HOOK_SECRET`; `MqttAdapter` starts only when `MQTT_URL` set;
    SIGTERM graceful stop; never crashes if broker unreachable.
  - Auth: broker (mosquitto-go-auth HTTP backend) validates device
    `username=deviceId` + `password=deviceToken` via
    `POST /api/v1/mqtt-auth/user` → `verifyDeviceCredentials()` (same
    `hashToken`+`DeviceToken` lookup as HTTP `deviceAuth`); ACL confines each
    device to `devices/{id}/#`. Adapter also drops id/topic mismatches + unknown
    devices.
  - Deploy: `mosquitto/` (`mosquitto.conf`, `conf.d/go-auth.conf.example`,
    `docker-compose.mqtt.yml`) + `DEPLOYMENT.md` Step 11 + `env.example`.
  - Tests: `protocol.test.ts`, `gateway.test.ts` (mock DB/core, no live broker).
    `tsc --noEmit` clean; `npm test` 49/49; boots HTTP-only with no `MQTT_URL`;
    stays up (auto-reconnect) when broker is down.

### Decision — firmware selector (which sketch is "the firmware")
- **`firmware/src/water_tank/` (`water_tank.ino`) is the ONE production firmware.**
  It is the only code that speaks the AquaMind APIs (claim, measurements, config,
  OTA). It is a modular project (`data_reporter`, `claim_client`, `ota_handler`,
  `config`, `sensor`, `storage`, `wifi_manager`, `alerts`).
- **`net_node.ino`, `water_tank_wokwi`, and `tools/debug-hub` are throwaway
  experiments** — net_node streams line-JSON to a LAN debug-hub on localhost and
  never touches the backend. They are NOT deployment targets. We keep them only
  as protocol references; Phase 2 firmware work targets `water_tank.ino` only.
- **Current firmware state:** the HTTP-side Phase 2 is already wired in
  `water_tank.ino` — `data_reporter.cpp` sends `config_version` in telemetry, and
  `config.cpp` implements `applyServerConfig` (operational + geometry + version)
  and `adoptConfigVersion`. `config.h` already declares all MQTT settings +
  runtime geometry/`syncMode`/`configVersion`. The ONLY missing piece is the
  actual MQTT client module (`MQTT_ENABLED=false`, no `mqtt_client.*` on disk).

### Next steps
1. **Firmware MQTT transport (`water_tank.ino`)** — add `mqtt_client.cpp/.h`
   (`PubSubClient` over `WiFiClientSecure`): connect `username=deviceId`/
   `password=deviceToken`; publish `announce`+`telemetry` (reuse the JSON
   `data_reporter` already builds); subscribe retained `devices/{id}/config` →
   `Config::applyServerConfig(...)` (already implemented); subscribe
   `devices/{id}/cmd` → `ack`. Add a loop transport toggle (MQTT vs. HTTP), honor
   `syncMode` (live=stay subscribed, piggyback=read retained + drop off), add
   `PubSubClient` to `firmware/libraries.txt`, flip `MQTT_ENABLED` on after test.
2. **Stand up the broker + end-to-end test** — run `mosquitto/docker-compose.mqtt.yml`,
   set backend `MQTT_URL`, verify: device telemetry → `recordMeasurement`, and a
   tank-profile edit → retained config push → `applyServerConfig` on device; test
   both `live` and `piggyback`.
3. **Deploy to test** — backend can go to `aquamind.utkarshjoshi.com`
   (broker on 8883/TLS); HTTP path already works there today with MQTT unset.
4. **Frontend** — wire the `sync-mode` toggle; optional live telemetry view.
5. **Commit pass** — all of Phases 0–2 are currently uncommitted on `main`; needs
   a review-and-commit sweep (kept out of scope so far — no git touched).
6. **Resolve open items** above (drop `volume_l` column? SR04M default deadZone?
   nominal-size shortcut?).
