# Firmware-First MQTT Deployment and Full Product Plan

**Status:** Part I prioritized for physical deployment; Part II planned

**Last reviewed:** 2026-07-13

**Scope:** ESP8266 firmware, Mosquitto, `backend-v2`, web application, mobile
application, operations, and rollout from the existing HTTP telemetry path

This document supersedes the former Phase A-F MQTT reliability outline and is
the source of truth for the next MQTT migration work. Completed foundation work
recorded in `plans/unified-tank-config-and-mqtt.md` remains historical context.

Delivery is intentionally split into two parts:

- **Part I - Immediate physical deployment:** freeze a small production firmware,
  deploy isolated MQTT/TLS and device authentication, publish normal telemetry,
  apply retained config on each wake, preserve HTTP recovery, and verify that a
  real tank remains visible through the existing application.
- **Part II - Full MQTT-native product development:** add the stronger v2 data
  contract, replay receipts, live/diagnostic sessions, commands, realtime web,
  rich history/admin controls, governed exports, and future learning support.

Part I is the current priority and its exit gate must be met before Part II work
can change the deployed device contract.

## 1. Executive decision

AquaMind will become MQTT-native for device communication while keeping normal
web/mobile application traffic behind the authenticated backend API.

For the immediate deployment, MQTT-native means the device uses authenticated
MQTT/TLS as its primary normal telemetry and retained-config path. It does not
mean waiting for live sessions, SSE, MQTT v2, admin controls, or ML data tooling.

- Devices use MQTT for telemetry, presence, desired configuration, reported
  state, commands, command acknowledgements, and server ingestion receipts.
- Web and mobile clients do **not** connect directly to Mosquitto. They use REST
  for queries and control, plus an authenticated Server-Sent Events (SSE) stream
  for live updates. This preserves tenant authorization and avoids distributing
  broker credentials to browsers.
- HTTP device endpoints remain a feature-flagged fallback during migration. They
  are not a second permanent source of business logic.
- Configuration delivery, telemetry cadence, and transport selection are three
  separate concerns. The current `live | piggyback` `syncMode` must not be
  extended to represent all three.
- Normal mode optimizes battery and bandwidth. Live and diagnostic modes are
  explicit, time-limited leases which always expire automatically.
- In the full Part II target, MQTT QoS is not treated as proof that telemetry
  reached MySQL: the device keeps buffered samples until the backend publishes
  an application-level commit receipt. Part I stops at broker-confirmed QoS 1
  current telemetry plus bounded HTTP recovery and documents that limitation.
- Historical data and live data share one canonical measurement model. UI
  screens merge the initial historical query with newer SSE events without
  gaps or duplicates.
- Live telemetry and admin tables are operational surfaces. The durable,
  versioned, quality-labeled measurement, event, and export APIs are the product
  data plane for future learned hints and model training, even when a current UI
  only needs a summary.

### Architecture boundaries

- MQTT is the device event/control plane, not the historical database or a
  browser authorization layer.
- History, fleet queries, exports, and user/admin mutations remain backend REST
  APIs. A mutation may transactionally enqueue an MQTT desired-state publish.
- Live application delivery uses SSE after backend authorization; it does not
  expose per-device broker topics to clients.
- Provisioning, account/tenant management, and OTA binary download remain HTTP.
  MQTT can announce an OTA assignment, but it should not carry firmware blobs.
- Future learning jobs consume the same governed data contracts and export APIs
  as product/admin clients. They do not scrape charts, consume transient SSE as
  training truth, or depend on one-off production SQL dumps.

## 2. Review of the current implementation

The repository has a useful MQTT foundation, but it is a transport proof rather
than the complete operating model required for production.

### Already available

- `backend-v2/src/gateway/` funnels HTTP and MQTT telemetry through common
  business logic.
- MQTT device authentication reuses `DeviceToken`; broker ACL checks restrict a
  device to its own topic prefix.
- A retained config topic and monotonically increasing `configVersion` exist.
- Firmware publishes telemetry and announce messages and subscribes to config
  and command topics.
- The broker/backend smoke test proves authenticated telemetry ingestion and
  retained config delivery.
- Server-side tank geometry and read-time volume calculation prevent old stored
  volume snapshots from becoming the UI source of truth.

### Gaps that block an MQTT-native release

1. The current `syncMode` only changes config-push behavior. It does not create
   a safe on-demand telemetry session, enforce a TTL, or represent a pending
   request for a sleeping device.
2. Firmware is effectively always awake and services MQTT continuously. It has
   no explicit wake/sample/connect/flush/listen/sleep state machine or battery
   budget.
3. The current firmware waits for broker QoS 1 PUBACK before treating a publish
   as delivered, but it still lacks the end-to-end backend commit receipt needed
   to safely delete local buffered samples. Part I therefore retains only its
   explicit latest-reading HTTP recovery behavior; Part II adds receipts and
   durable replay.
4. Telemetry has no stable `message_id`, `boot_id`, sequence number, sample time
   versus receive time, or database uniqueness constraint. Retries can create
   duplicates and offline replay cannot be ordered confidently.
5. MQTT acknowledgements are log lines only. Commands have no correlation ID,
   persisted lifecycle, expiry, authorization audit, or user-visible result.
6. Presence lacks a retained birth/Last Will contract. `lastSeen` alone cannot
   distinguish healthy deep sleep, unexpected disconnect, stale ingestion, and
   a device that is online but not producing valid sensor readings.
7. The backend MQTT client is one in-process subscriber. Scaling backend
   instances would duplicate ingestion unless shared subscriptions and a
   defined realtime fan-out path are introduced.
8. Broker service credentials currently have `readwrite #`. Ingest and control
   privileges are not separated.
9. Production TLS is documented but disabled, and firmware currently accepts
   any broker certificate.
10. History APIs use `days + limit`; they lack cursor pagination, explicit time
    range, resolution, data-quality flags, and aggregation selection.
11. The web and mobile device pages fetch a small fixed history once. They do
    not offer reliable long-range exploration, connection events, live data,
    export, or stream recovery.
12. Admin screens do not expose MQTT presence, power mode, desired/reported
    config, queue lag, live sessions, commands, protocol errors, or raw telemetry.
13. `tools/debug-hub` still has an older telemetry shape, creating a second
    protocol contract.
14. Historical level-derived values are currently recalculated from the latest
    tank profile. That corrects the present UI after calibration changes, but an
    old export can then change without any raw sensor change. Future learning
    requires immutable observations plus versioned/effective-dated derivation
    context.

The existing dense admin table is a useful inspection foundation and should be
extended rather than discarded. Its query/export path still needs to become
cursor-based, quality-aware, versioned, and shared with future data consumers;
the rendered table itself must not become the data contract.

## 3. Product behavior

This section describes the Part II product target. Part I ships only `normal`
telemetry, retained config on wake, and the fixed power-safe connectivity policy.

### 3.1 Separate operating controls

| Concern | Values | Persistence | Owner |
|---|---|---|---|
| Config delivery | retained desired config + reported version | durable | server |
| Telemetry policy | `normal`, `live`, `diagnostic` | normal is durable; overrides are leases | server with device enforcement |
| Connectivity strategy | `always_on`, `duty_cycled` | durable device capability/config | server + firmware |
| Transport policy | `mqtt_primary`, `http_fallback`, `http_only` | rollout-only durable setting | operations |

Config is always retained and versioned; there is no longer a user-facing
`piggyback` config mode. A duty-cycled device receives the retained desired
state on its next connection. An always-on device receives it immediately.

### 3.2 Telemetry modes

| Mode | Default cadence | Intended use | Default maximum | Persistence |
|---|---:|---|---:|---|
| `normal` | sample every 60 s, publish a batch every 5 min | normal monitoring and battery saving | indefinite | raw + aggregates |
| `live` | publish every 5 s | user/admin watching current tank behavior | 10 min per lease | raw, marked `live` |
| `diagnostic` | publish every 1 s with sensor/system diagnostics | short admin troubleshooting | 2 min per lease | short-retention raw + aggregates |

All values are server-configurable within firmware-enforced minimums and
maximums. A mains-powered device may use `always_on` with the same normal
publish cadence; a battery device should use `duty_cycled` and deep sleep when
the board wiring supports wake from deep sleep.

Normal mode should batch multiple samples in one publish. It should not reduce
the sensing cadence merely to reduce network usage. This preserves useful tank
behavior while avoiding repeated Wi-Fi/TLS handshakes.

### 3.3 On-demand live lease

1. A user presses **Go live**, or an admin starts live/diagnostic mode.
2. The backend authorizes device access, creates a `TelemetrySession`, and
   writes a new desired-state revision containing `lease_id`, mode, interval,
   duration, and expiry.
3. The backend publishes the desired state retained at QoS 1.
4. If the device is online, it applies the lease and reports an acknowledgement;
   the UI normally becomes live within 3 seconds.
5. If the device is asleep, the session is shown as **Pending - waiting for next
   check-in**. MQTT cannot wake a powered-down radio. The lease is applied on
   the next scheduled wake if it has not expired.
6. The device switches to the requested cadence, remains receptive to stop or
   extension changes, and reports `active_lease_id` in state/telemetry.
7. Closing a viewer sends a best-effort detach. The backend stops the lease when
   the last viewer detaches, subject to admin/session policy. The backend TTL and
   the device's monotonic timer are authoritative, so live mode ends even if an
   app crashes without detaching.
8. On stop/expiry the backend clears the lease from desired state and the device
   returns to normal mode and sleep behavior.

Only one effective telemetry lease exists per device. Multiple viewers attach
to it instead of multiplying device traffic. An admin may upgrade a user live
lease to diagnostic mode; every create, extend, upgrade, and stop is audited.

### 3.4 Live-state lifecycle

`requested -> pending_device -> active -> stopping -> completed`

Terminal error states are `expired_before_connect`, `rejected`, and `failed`.
The API and UI expose these states rather than optimistically showing a device
as live.

## 4. Target architecture

```text
ESP8266 devices
  | MQTT/TLS: telemetry, state, presence, ack
  | MQTT/TLS: config, desired policy, command, receipt
  v
Mosquitto
  | shared subscription (one ingest worker receives each device message)
  v
Backend MQTT ingest -> validate -> deduplicate -> MySQL transaction
                                      | after commit
                                      +-> MQTT retained receipt
                                      +-> internal realtime fan-out
                                      +-> alert/aggregation jobs

Web/mobile -> authenticated REST -> query/control services -> MySQL/outbox
Web/mobile <- authenticated SSE  <- realtime gateway <- internal fan-out
```

For the first deployment, ingest and realtime services may run in the existing
`backend-v2` process behind explicit interfaces. Before horizontal scaling,
introduce Redis Streams/PubSub (or an equivalent managed service) between
committed ingestion and SSE instances. Do not make every API replica subscribe
to all device telemetry and write it independently.

## 5. MQTT v2 contract

This is the Part II OTA migration contract. The first physical deployment keeps
the current v1 topics described in Phase I-0 so broker/auth/backend/firmware can
be proven before the wire format expands.

### 5.1 Topic namespace

`{deviceId}` is the immutable hardware ID. Topics do not contain tenant IDs;
tenant ownership is mutable and enforced by the application.

| Topic | Direction | QoS | Retain | Purpose |
|---|---|---:|---:|---|
| `v2/devices/{id}/up/telemetry` | device -> server | 1 | no | sample batch |
| `v2/devices/{id}/up/state` | device -> server | 1 | yes | reported shadow/capabilities |
| `v2/devices/{id}/up/ack` | device -> server | 1 | no | correlated command/lease ack |
| `v2/devices/{id}/status` | device -> server | 1 | yes | birth or Last Will presence |
| `v2/devices/{id}/down/config` | server -> device | 1 | yes | versioned desired config |
| `v2/devices/{id}/down/policy` | server -> device | 1 | yes | normal policy + live lease |
| `v2/devices/{id}/down/command` | server -> device | 1 | no | expiring one-shot command |
| `v2/devices/{id}/down/receipt` | server -> device | 1 | yes | backend commit receipt |

One-shot commands such as reboot are never retained. Desired config and policy
are safe to retain because they carry a monotonic revision and declarative end
state. The device ignores older revisions.

During migration the backend accepts v1 topics and HTTP messages, normalizes
them to the v2 internal model, and records `protocol_version` and `transport`.
Only v2 supports live leases and guaranteed replay receipts.

### 5.2 Common envelope

Every v2 payload contains:

```json
{
  "schema": 2,
  "type": "telemetry",
  "device_id": "tank-001",
  "message_id": "tank-001:8f31:1042",
  "boot_id": "8f31",
  "seq": 1042,
  "sent_at": "2026-07-13T12:00:00Z",
  "uptime_ms": 240102,
  "firmware_version": "2.1.0",
  "config_version": 17,
  "policy_revision": 8
}
```

- `message_id` is stable across retries.
- `boot_id + seq` provides ordering even if wall-clock time is temporarily bad.
- `sent_at` and `sampled_at` may be `null` only when the device cannot establish
  or reconstruct wall time. Each sample also carries its monotonic/relative
  sequence metadata. The backend adds `received_at` and never silently replaces
  device sample time with server receive time.
- Payload IDs must match topic IDs. The broker ACL and backend both enforce it.
- Unknown additive fields are tolerated; unsupported schema major versions are
  rejected into a protocol-error store.

### 5.3 Telemetry batch

```json
{
  "schema": 2,
  "type": "telemetry",
  "device_id": "tank-001",
  "message_id": "tank-001:8f31:1042",
  "boot_id": "8f31",
  "seq": 1042,
  "mode": "normal",
  "samples": [
    {
      "sample_seq": 1038,
      "sampled_at": "2026-07-13T11:56:00Z",
      "level_cm": 41.2,
      "temperature_c": 28.4,
      "battery_v": 3.91,
      "rssi": -67,
      "quality": { "level": "valid", "clock": "synced" }
    }
  ]
}
```

Set a tested payload ceiling and maximum batch count based on ESP8266 heap,
broker limits, and expected offline queue size. Split larger replay into ordered
batches. Invalid sensor values are `null` with a quality/error code, never a
fabricated zero.

For duty-cycled/offline timekeeping, firmware stores the last synchronized epoch
and intended sleep durations, reconstructs timestamps where possible, and marks
them `clock=estimated`. It marks unanchored samples `clock=unknown`. NTP sync on
a later connection must not rewrite timestamps already sent without an explicit,
tested correction event. History and exports expose clock quality.

### 5.4 Backend receipt

After all samples in a message are committed or recognized as duplicates, the
backend publishes:

```json
{
  "schema": 2,
  "type": "receipt",
  "device_id": "tank-001",
  "message_id": "tank-001:8f31:1042",
  "committed_at": "2026-07-13T12:00:01Z",
  "accepted": 5,
  "duplicates": 0
}
```

The device deletes those samples only after this receipt. If the receipt is
lost, it retries the same message; the unique key makes the retry harmless and
the backend emits another receipt. The retained latest receipt helps a device
recover when it reconnects immediately after publishing.

### 5.5 Presence and expected sleep

- Before connect, set a retained QoS 1 Last Will with `connected=false`, reason
  `connection_lost`, and broker timestamp where available.
- On connect, publish retained `connected=true`, `boot_id`, firmware, IP/network
  metadata safe for operations, and capabilities.
- Before intentional sleep, publish `connected=false`, reason `sleeping`, and
  `expected_wake_at`.
- Backend health is derived from presence, last committed telemetry, expected
  wake, recent sensor quality, and active lease state. Do not use a single
  online/offline boolean as the complete device health model.

## 6. Canonical backend data model

This is the Part II durable data target. Part I applies only the migrations
already required by the current MQTT/config implementation.

Add migrations deliberately; do not overload `Measurement.timestamp` or JSON
blobs for indexed operational state.

### Device changes

- `protocolVersion`, `transportPolicy`, `connectivityStrategy`
- `desiredPolicyRevision`, `reportedPolicyRevision`
- `reportedConfigVersion`
- `lastConnectedAt`, `lastDisconnectedAt`, `expectedWakeAt`
- `lastTelemetrySampleAt`, `lastTelemetryReceivedAt`
- `lastTransport`, `lastBootId`, `lastRssi`
- derived health is computed by a service; avoid persisting contradictory flags

### Measurement changes

- `messageId`, `bootId`, `sampleSeq`
- nullable `sampledAt`, mandatory `receivedAt`, plus clock-quality metadata
- `transport`, `telemetryMode`, `protocolVersion`
- device-reported config version and server-resolved profile/config revision at
  ingestion, without copying mutable UI labels into every row
- per-sensor quality flags or a compact `qualityJson`
- unique `(deviceId, bootId, sampleSeq)` and index
  `(deviceId, sampledAt DESC)`

Use `sampledAt` for charts and aggregation and `receivedAt` for ingestion-lag
diagnostics. Preserve out-of-order replay rather than hiding it.

### New durable records

- `DeviceReportedState`: latest capabilities, firmware, config/policy revisions,
  active lease, reset reason, heap, queue depth, and sensor status.
- `DeviceConnectionEvent`: connected, sleeping, unexpected disconnect,
  auth failure when attributable, and expected wake metadata.
- `TelemetrySession`: requester, role, requested/effective mode and interval,
  lifecycle timestamps, expiry, viewer count, and result.
- `DeviceCommand`: `commandId`, type, args, requester, created/expiry/sent/ack
  timestamps, status, result, and error.
- `DeviceProtocolEvent`: bounded payload metadata for malformed, unsupported,
  unauthorized, or rejected messages. Redact secrets.
- `MeasurementAggregate`: device, bucket start, resolution, counts, min/max/avg,
  first/last values, usage/refill indicators, and quality counts.
- `DeviceConfigRevision` and `TankProfileRevision`: immutable version snapshots
  with effective time, author/source, and supersession metadata. Current config
  remains easy to query, while history can resolve the context active at sample
  time.
- `ControlOutbox`: desired state/command publish intent committed in the same DB
  transaction as the API mutation and retried until broker publish succeeds.

### Retention baseline

- Normal raw samples: 13 months.
- Live raw samples: 90 days.
- Diagnostic raw samples and protocol payloads: 14 days.
- 5-minute/hourly aggregates: 5 years.
- Daily summaries, session audit, and command audit: indefinite unless policy
  requires otherwise.

Make these values environment/config driven. Run aggregation before deletion,
record retention job checkpoints, and expose failures in operations metrics.

### Learning-ready data standards

This release does not build AI/ML infrastructure. It does establish the minimum
data controls required so later hints and training do not require a second
ingestion system or a cleanup project.

1. **One canonical row contract.** REST history, SSE telemetry, admin tables,
   CSV/JSON exports, aggregation jobs, and future pipeline readers use the same
   measurement names, units, null semantics, identifiers, and quality enums.
   Transport wrappers may differ; the measurement DTO does not.
2. **Stable identity and time semantics.** Preserve `deviceId`, `messageId`,
   `bootId`, `sampleSeq`, `sampledAt`, `receivedAt`, clock quality, telemetry
   mode, and transport. A model must be able to exclude late, unanchored,
   diagnostic, duplicate, or invalid samples deliberately.
3. **Raw and derived data stay separate.** Raw normalized measurements are
   append-only except for documented correction workflows. Aggregates, usage,
   refill detection, leak labels, and future features identify their algorithm
   version, configuration/profile revision, and source range. Never train from
   points downsampled by a chart. The default export derivation is
   `as_of_sample`; recalculation with the current profile is an explicit query
   mode and is labeled in the result manifest.
4. **Provenance is queryable.** Every exported row or dataset can resolve its
   protocol/schema version, firmware version, applicable tank/config version,
   quality, mode, and derivation version. Config/profile changes remain events
   so a training window can reconstruct device context.
5. **Events and outcomes are first-class.** Alerts, refills, acknowledged hints,
   configuration changes, maintenance, sensor faults, and user/admin actions use
   stable event types and timestamps. These become future labels and feedback;
   they must not exist only as display text or logs.
6. **Exports are reproducible and tenant-scoped.** An export request records
   tenant/device filters, inclusive/exclusive time bounds, quality/mode filters,
   selected columns, units, schema version, resolution, generation time, row
   count, and a dataset/export ID. The same request parameters produce the same
   rows while underlying raw data is unchanged.
7. **Privacy and deletion propagate.** Tenant authorization applies to export
   generation and download. Retention, device deletion, tenant deletion, and
   future consent rules must also cover generated datasets and derived data.

Start with governed cursor queries and synchronous bounded CSV/NDJSON export.
Move large exports to an asynchronous object-storage job only when measured size
or request duration requires it.

Explicitly deferred: feature stores, vector databases, model registries, online
inference, training jobs inside the API process, service-worker/IndexedDB history
caches, and an AI hints UI before history/export semantics are stable.

## 7. Backend interfaces

### Query APIs

- `GET /api/v1/user/devices/:id/current`
  returns latest values plus sample age, receive age, quality, mode, health,
  presence, expected wake, config sync, firmware, and active live session.
- `GET /api/v1/user/devices/:id/history?from=&to=&resolution=auto&metrics=&cursor=&limit=`
  returns ordered points, selected actual resolution, gaps, quality counts, and
  `next_cursor`. The server caps point count and chooses aggregates for long
  ranges.
- `GET /api/v1/user/devices/:id/events?types=&from=&to=&cursor=` returns presence,
  config, alert, lease, command, and firmware events on one timeline.
- `GET /api/v1/user/devices/:id/export?from=&to=&format=csv&quality=&modes=&fields=`
  exports canonical rows plus a schema/provenance manifest. JSON/NDJSON uses the
  same DTO and filters; large asynchronous exports may replace this endpoint
  later without changing dataset semantics.
- Admin variants expose the same canonical DTOs with additional operational
  fields; they do not implement a separate data interpretation.

### Control APIs

- `POST /api/v1/user/devices/:id/telemetry-sessions`
  with `{ mode: "live", duration_s, interval_ms }`.
- `DELETE /api/v1/user/devices/:id/telemetry-sessions/:sessionId`.
- Admin may request `live` or `diagnostic`; normal users may request `live`
  within stricter duration/rate limits.
- `POST /api/v1/admin/devices/:id/commands` with an allow-listed command and expiry.
- `GET /api/v1/admin/devices/:id/commands/:commandId` returns lifecycle and result.

All control endpoints are idempotent via an idempotency key, tenant/role
authorized, rate limited, audited, and backed by `ControlOutbox`.

### Realtime API

`GET /api/v1/user/devices/:id/stream` is an authenticated SSE endpoint emitting:

- `snapshot`
- `telemetry`
- `presence`
- `session_state`
- `reported_state`
- `command_state` for authorized admins

Events carry monotonically increasing stream IDs. Support `Last-Event-ID`, send
heartbeats, and force a snapshot refresh if replay is no longer available. The
frontend deduplicates telemetry by measurement ID and orders by `sampled_at`.
Current/history bootstrap responses include the corresponding stream cursor or
server watermark so opening SSE after REST has no unobservable race window.
Because current authentication uses a Firebase bearer token, the web client uses
a fetch-based SSE reader that can send the `Authorization` header. Do not put a
long-lived token in the stream URL or assume native `EventSource` can set it.

## 8. Firmware architecture

Refactor the main loop into an explicit non-blocking state machine:

```text
BOOT -> LOAD_CONFIG -> SAMPLE -> CONNECT_WIFI -> CONNECT_MQTT
     -> APPLY_RETAINED_STATE -> FLUSH_BUFFER -> RECEIVE_RECEIPT
     -> LIVE_WINDOW or DISCONNECT -> SLEEP/WAIT
```

Required firmware capabilities:

1. A persistent ring buffer with schema version, CRC, stable sample sequence,
   retry metadata, and deterministic overflow policy. Never clear it on broker
   publish alone.
2. Batch encoding and replay oldest-first. New live data must not permanently
   starve older buffered normal data.
3. An MQTT client/library proven on the target ESP8266 build to support QoS 1
   publish acknowledgements, retained messages, Last Will, TLS verification,
   reconnect backoff, and the required packet size. The Part I reporter now
   uses `ArduinoMqttClient` and waits for PUBACK; retain the heap, flash-size,
   and 24-hour soak spike before extending it for Part II receipts and Last
   Will support.
4. Certificate validation using a provisioned CA and valid device time. Remove
   `setInsecure()` from production builds.
5. Desired/reported state reconciliation by revision. Persist applied config
   and policy atomically and report failures without boot-looping.
6. Lease enforcement using monotonic time after acceptance, with absolute expiry
   validation once wall time is synchronized. Firmware maximum duration and
   minimum interval protect the battery if the server sends a bad value.
7. Idempotent command handling keyed by `command_id`; retain a small recent-ID
   cache across reboot where necessary. A retried reboot command must not loop.
8. Presence birth, Last Will, intentional-sleep event, reset reason, buffer depth,
   heap watermark, Wi-Fi/MQTT failure counters, and sensor quality state.
9. Exponential reconnect backoff with jitter and a bounded awake/connect window.
   A broker outage must not drain the battery in a retry loop.
10. A hardware capability flag for deep sleep. Devices without the required
    wake wiring remain `always_on`; the server must not assume every installed
    ESP8266 can wake itself.
11. HTTP fallback uses the same envelope, sequence, buffer, receipt semantics,
    and config application code. It is selected only after a bounded MQTT
    failure policy and is visible in reported state.
12. OTA is deferred during live/diagnostic sessions and while unacknowledged
    telemetry is being flushed, except for an explicit critical admin action.

## 9. Web and mobile experience

### Web client standards

These are implementation rules for the first reliable web release, not a plan
to build a general realtime frontend platform.

1. **One data contract, two delivery paths.** Put versioned TypeScript DTOs such
   as `MeasurementDto`, `PresenceDto`, `TelemetrySessionDto`, `DeviceHealthDto`,
   and `CommandStateDto` in a shared contract module used by backend, web, and
   mobile. REST responses and SSE event `data` use those DTOs unchanged, with
   identical field names, units, null behavior, quality values, and timestamps.
   SSE adds only its event type/ID envelope. Charts and live widgets do not
   define another telemetry shape.
2. **Bootstrap, stream, heal.** A device page first fetches current state and the
   requested history window. Both responses include a stream cursor or server
   watermark; the client starts from the earlier cursor and safely deduplicates
   overlap. The page then opens SSE from that cursor and merges by
   `measurement_id`. On an unavailable cursor, replay miss, or reconnect gap,
   perform one ranged REST heal from the last known sample through the current
   server watermark, merge/deduplicate it, and then resume streaming. Never open
   SSE alone and treat its first event as a complete device snapshot.
3. **One owned connection per device page.** A page-level stream controller
   feeds all charts/widgets; individual components never create their own SSE
   connections. Use heartbeat timeout detection and capped exponential backoff
   with jitter. Abort the fetch stream through `AbortController` on route leave,
   logout, `pagehide`, or unmount. Do not keep a global all-device realtime bus
   or ghost streams after navigation.
4. **Keep connection and device truth separate.** The stream exposes only
   `connecting`, `live`, `reconnecting`, or `offline`. Device presence, sample
   freshness, and telemetry-session state are separate fields. A healthy SSE
   connection does not make stale device data current; always show sample age
   and device health alongside stream state.
5. **Authenticate predictably.** Use fetch-based SSE with the Firebase
   `Authorization` header and no query-string token. On `401`, refresh the token
   once and reopen from the last cursor. If refresh fails, stop and return to the
   authentication flow. Do not retry authorization failures forever; treat
   `403` as terminal for that page.
6. **Model live sessions, do not toggle them.** The UI state machine is
   `idle -> requesting -> pending_wake -> active -> stopping -> idle`, with an
   explicit error/expired result returning to idle. Show active only after the
   device acknowledgement. Pending displays `expected_wake_at`; active displays
   a server-derived countdown. One effective lease exists per device and extra
   viewers attach to it rather than creating another lease.
7. **Keep charts bounded and truthful.** The server selects `auto` resolution
   for long ranges. Target roughly 1,000-2,000 rendered points per series; if a
   response would exceed the configured limit, request a coarser resolution
   instead of client-side heroic downsampling. Break lines across missing,
   invalid, or unanchored samples and never interpolate them as observations.
   Use `sampled_at` on the X-axis; show `received_at`, quality, mode, transport,
   and clock quality in inspection details/tooltips.
8. **Mutations remain REST.** Start/stop live, config changes, and commands use
   authorized REST requests with idempotency keys. SSE reflects resulting
   `session_state`, `reported_state`, and `command_state`. The only optimistic
   session state is `requesting`; the UI waits for server/device truth before
   showing pending, active, stopped, or completed.
9. **Do not prebuild unmeasured complexity.** The first release excludes browser
   MQTT/WebSockets, IndexedDB history caches, service-worker offline charting, a
   global fleet realtime bus, virtualized/WebGL charts, and client-side storage
   as a data source. Add one only after measured page behavior justifies it.

### User device list

Make the list useful for scanning, not only decorative tank previews. Each row
shows current percentage/liters, last sample age, trend, battery, signal,
health, current mode, transport, active alert, and expected next check-in.
Support status/alert/staleness filters and sorting by last sample, level, battery,
or name.

### User device detail

- Persistent current-status strip: level, volume, temperature, battery, RSSI,
  sample age, connection state, normal/live mode, and data-quality state.
- **Go live** control with requested/pending/active countdown/stopping states.
  Explain pending sleep state using actual `expected_wake_at`; do not claim the
  device is live until its acknowledgement arrives.
- Multi-metric history chart for level/volume, temperature, battery, and RSSI.
- Range controls: 1 h, 6 h, 24 h, 7 d, 30 d, 1 y, custom.
- Resolution control: auto, raw, 5 min, hourly, daily where available.
- Gaps are visible and invalid values are not connected as if measured.
- Brush/zoom, point inspection with sample/receive time, quality flags, mode,
  and transport.
- Summary band for min/max/average, consumption, refill events, uptime/data
  completeness, and time spent live.
- Event timeline aligned with history: alerts, refill/leak detection, disconnect,
  config change, live session, and firmware update.
- Paginated raw-data table and CSV export for the selected range.

The page follows the shared bootstrap/stream/heal controller above. It does not
implement chart-specific polling or a second live-data cache.

### Admin fleet view

Use a dense sortable/filterable table with saved filters and pagination. Include:

- tenant, device ID/name, health, MQTT presence, last sample/receive age
- expected wake, current mode/session owner, transport/protocol
- firmware and capability set
- desired/reported config and policy revisions
- battery, RSSI, queue depth, reset reason, sensor quality
- command failure, ingestion lag, and recent protocol/auth error counts

Bulk actions are restricted and audited: push config, request state, assign
firmware, and change normal policy. Do not provide bulk reboot by default.

### Admin device workspace

Tabs: **Overview**, **Live**, **History**, **Connectivity**, **Config & State**,
**Commands**, **Events**, and **Firmware**.

- Live supports normal metrics and a diagnostic view of raw distance, filtered
  level, temperature, battery ADC/voltage, RSSI, heap, loop latency, queue depth,
  and reconnect counters when the firmware capability exists.
- Connectivity shows broker presence, sleep schedule, connection timeline,
  transport changes, ingestion lag, auth errors, and Last Will reason.
- Config compares desired versus reported values and revisions field-by-field.
- Commands show pending/sent/acknowledged/timed-out state with correlation IDs
  and results. Destructive actions require confirmation.
- Events provide searchable protocol metadata without leaking tokens or Wi-Fi
  credentials.

Web is implemented first against the canonical APIs. Mobile then adopts the same
DTOs, history behavior, and live-session states rather than maintaining its
current untyped, fixed-ten-point chart path.

## 10. Security and broker operations

### Production hostname and isolation

Use three explicit service names:

| Hostname | Public protocol | Purpose |
|---|---|---|
| `aquamind.utkarshjoshi.com` | HTTPS/443 | existing web application |
| `aquamind-api.utkarshjoshi.com` | HTTPS/443 | API, device auth hook, provisioning, OTA |
| `aquamind-mqtt.utkarshjoshi.com` | MQTT/TLS/8883 | device broker only |

`aquamind-mqtt.utkarshjoshi.com` is a DNS name and TLS identity for Mosquitto;
it is not another Express application and does not need an HTTP landing page.
Expose raw MQTT/TLS directly on `8883`. Do not put it through an nginx HTTP
reverse-proxy block. An nginx `stream` proxy is optional infrastructure, not a
requirement for the first deployment.

On a single server, bind plaintext broker port `1883` to loopback/private Docker
network only so the backend and local diagnostics can reach it. Public firewall
rules expose `8883` only. The broker calls MQTT auth-hook endpoints over the
private host/container network with `MQTT_AUTH_HOOK_SECRET`; it does not call the
public API hostname unless no private route exists.

Issue a certificate whose SAN includes `aquamind-mqtt.utkarshjoshi.com`, install
its full chain/key for Mosquitto, and add an automated renewal deploy hook that
copies/reloads the broker-readable certificate safely. Firmware trusts the CA
chain and verifies this hostname. Production firmware must not use
`setInsecure()`.

The older optional `mqtt.aquamind.utkarshjoshi.com` WebSocket guidance in
`NGINX_SETUP.md` is not part of this release and should be removed or marked
legacy when deployment documentation is updated. Browser MQTT/WebSockets remain
out of scope.

The v2 ACL split below is the full target. Part I applies the equivalent exact
permissions to its v1 topics as specified in Phase I-1.

- Production exposes only MQTT over TLS. Plain `1883` remains local/LAN test
  only and is not publicly routed.
- Pin the CA, not a leaf certificate, so broker certificates can rotate.
- Split broker accounts and ACLs:
  - ingest reads only `v2/devices/+/up/#` and `v2/devices/+/status`;
  - control writes only `v2/devices/+/down/#`;
  - each device writes its own `up/#` and status and reads its own `down/#`;
  - no normal principal has `readwrite #`.
- Keep auth-hook endpoints on a private network, require the hook secret, rate
  limit failures, and measure latency/error rate. Define broker reconnect
  behavior during backend/auth database outages.
- Device token rotation supports overlap: issue new token, deliver/activate it,
  verify reconnect, then revoke the old token. Never expose token hashes or
  plaintext credentials in logs/UI.
- Broker persistence is enabled and its volume is backed up/test-restored.
  Configure queue, inflight, packet-size, connection, and message-expiry limits.
- Export broker connection/message/drop/auth metrics and backend ingest,
  duplicate, lag, receipt, SSE, session, command, and outbox metrics.

## 11. Full-target service objectives and alerts

Full Part II objectives, measured in production-like soak tests:

- No acknowledged sample loss after a recoverable network/backend outage within
  the device buffer-retention window.
- Duplicate visible measurements: 0; duplicate retries are counted internally.
- Connected-device live lease acknowledgement p95 <= 3 s.
- Duty-cycled live activation <= next scheduled wake + 10 s.
- Committed telemetry to SSE p95 <= 2 s in live mode.
- Current-status API p95 <= 300 ms; 30-day auto-resolution history p95 <= 1 s
  at the agreed fleet/load target.
- Config convergence for connected devices p95 <= 5 s; sleeping devices <= next
  wake + 10 s.
- Command lifecycle and telemetry-session status are never left non-terminal
  after expiry reconciliation runs.

Alert on broker unavailable, auth failure spikes, ingest disconnect/lag, DB or
outbox backlog, receipt latency, duplicate spike, invalid payload spike, SSE
connection/error rate, aggregation lag, retention failure, and unexpected fleet
battery drain after a policy rollout.

## 12. Two-part phased delivery

### Part I - Immediate physical deployment

**Goal:** flash one production firmware, install the device on a real tank, and
reliably see a recent normal-mode measurement in the existing application while
the device operates within a measured power budget. Frontend changes are not a
dependency.

**Immediate contract:** keep the current v1 topics and payload shape for this
deployment. Add only backward-compatible fields needed by the final firmware.
The device authenticates with `username=deviceId` and `password=deviceToken`,
publishes normal telemetry, and reads the retained config topic when it wakes.
The full v2 contract remains Part II and must arrive through OTA compatibility.

**Fresh-firmware provisioning rule:** the backend currently uses the same
`DeviceToken` type for HTTP bearer authentication and the MQTT password; there
is not a second database token type. The firmware still treats MQTT readiness as
a separate persisted provisioning state. A legacy flash containing Wi-Fi and an
HTTP-era `deviceToken`, but no `mqttProvisioned` marker for the production broker,
is **unconfigured for MQTT** and must enter AP onboarding. It must not silently
promote the legacy credential and begin publishing.

The AP claim flow reclaims the same hardware under the same tenant, receives a
fresh `DeviceToken`, connects to `aquamind-mqtt.utkarshjoshi.com:8883`, validates
TLS, authenticates, subscribes, and receives/applies retained config. Only after
that proof succeeds does firmware atomically persist `mqttProvisioned=true`, the
broker hostname, credential/config schema version, device ID, and new token.
Legacy state is retained until this transaction succeeds so a failed onboarding
attempt does not destroy the HTTP rollback path.

After a device is MQTT-provisioned, temporary Wi-Fi/DNS/broker/auth-hook outages
must not clear the marker or force AP mode. A later MQTT `not authorized` result
is treated as credential loss only after a bounded HTTPS authentication check
also returns `401/403`; if HTTPS still accepts the token, remain configured and
use HTTP fallback because the broker/auth hook is the failing component.

**Accepted limitations:** Part I prioritizes a recent trustworthy reading over
lossless historical replay. It does not promise application-level commit
receipts, exact reconstruction of long offline periods, live/diagnostic leases,
commands, SSE, rich exports, or fleet UI. These limitations are visible in the
release notes and removed in Part II.

#### Phase I-0 - Freeze the deployable device scope

**Build**

- Freeze one production board/pin map, sensor type, battery measurement circuit,
  tank mounting geometry, deep-sleep wiring capability, and firmware version.
- Freeze v1 topics:
  - device publishes `devices/{id}/telemetry`, `announce`, and `ack`;
  - device subscribes to retained `devices/{id}/config` and non-retained `cmd`;
  - Part I firmware does not expose user live mode or execute new remote commands.
- Set normal defaults: one sample/report wake every 5 minutes initially, retained
  config applied on every connection, and server-side volume remaining canonical.
  Adjust the cadence only after measuring battery life and tank-change needs.
- Verify the claimed device has a valid `DeviceToken`, tank profile, calibration,
  and current config before producing the release binary.
- Version the on-flash config and add `mqttProvisioned`, `mqttBrokerHost`, and
  credential/config schema metadata. A missing marker on an upgraded legacy
  image is a deliberate AP-onboarding condition even when Wi-Fi and the old HTTP
  token are present.
- Remove all tracked Wi-Fi credentials, test tokens, LAN broker addresses, and
  insecure production defaults. Build-time production values contain only public
  host/port/CA data; claimed credentials remain in device storage.
- Explicitly defer browser/admin/live/ML changes so they cannot delay this gate.

**Exit criteria**

- Hardware and deep-sleep assumptions are recorded for the exact installed unit.
- A tagged production firmware configuration builds reproducibly without local
  secrets and cannot accidentally target `192.168.*` or plaintext MQTT.
- Current HTTP firmware can still be flashed as the physical rollback image.
- A legacy-config fixture with Wi-Fi + HTTP token but no MQTT marker boots into
  AP mode and publishes nothing until MQTT onboarding completes.

#### Phase I-1 - Deploy isolated MQTT/TLS and authentication

**Build**

- Create DNS `A`/`AAAA` as applicable for
  `aquamind-mqtt.utkarshjoshi.com` pointing to the broker host.
- Enable Mosquitto TLS on public `8883` with a certificate for that hostname;
  bind plaintext `1883` to loopback/private container networking only.
- Restrict the public firewall to `8883`; do not expose MQTT WebSockets.
- Enable broker persistence and a restart policy. Set conservative packet,
  inflight, queued-message, connection, and log limits for the initial device.
- Pin the Mosquitto/go-auth container version or image digest; production must
  not depend on a moving `latest` image.
- Configure go-auth to validate device credentials against `DeviceToken` through
  the private backend auth-hook route with `MQTT_AUTH_HOOK_SECRET`.
- Provision a separate backend broker credential. Device ACL permits publish to
  only its own telemetry/announce/ack topics and subscribe to only its own
  config/cmd topics. Backend ACL covers the corresponding service topics.
- Keep broker password/auth-hook secrets outside git with restrictive ownership
  and file permissions; verify logs and container inspection do not expose them.
- Add certificate-renewal and broker-reload instructions and verify the broker
  can read renewed key material without broadening file permissions.

**Exit criteria**

- Valid device token connects on `8883`; wrong, revoked, expired, and other-
  device credentials fail.
- Cross-device publish and subscribe attempts fail.
- Public `1883` is unreachable and hostname/certificate validation succeeds.
- Mosquitto restarts with retained config and persistence intact.

#### Phase I-2 - Enable the production backend MQTT path

**Build**

- Apply the already-created database migrations required by tank profile,
  `configVersion`, and current config sync before enabling MQTT.
- Configure production backend MQTT credentials and connect over the private
  broker address when colocated. Use a stable backend MQTT client identity and a
  persistent QoS 1 subscription/session so short backend restarts can be queued
  by the persistent broker.
- Keep one canonical ingest function for HTTP and MQTT; confirm MQTT telemetry
  updates measurement storage, `lastSeen`, alerts, and existing `/current` and
  `/history` responses exactly as HTTP telemetry does.
- Publish the current merged config retained after claim/config/profile changes
  and when stale telemetry/announce indicates an older `configVersion`.
- Force the deployed device's current `syncMode` to `piggyback`; do not expose a
  live-mode toggle in Part I. Config changes update the retained topic and the
  sleeping device applies them on its next normal wake.
- Treat same-tenant AP reclaim as a credential rotation: mint the fresh token,
  keep the legacy token valid only for a bounded migration overlap, and revoke
  older token generation(s) after the device proves MQTT plus HTTPS fallback
  using the new token. Never revoke the old credential before the new one is
  atomically stored on the device.
- Keep HTTP measurement/config endpoints enabled as recovery. Firmware uses them
  only after its bounded MQTT failure policy, and backend records the transport.
- Add immediate operational checks: broker-connected state, last MQTT message,
  auth-hook errors, malformed-message count, ingest errors, and process/broker
  health commands. Console logs alone are acceptable only if the deployment
  runbook makes them actionable for this single-device stage.
- Run the existing MQTT smoke test against production-like DNS/TLS/auth and verify
  the measurement through both the database and authenticated `/current` API.
- Do not change frontend behavior in Part I; existing pages are acceptance
  clients for the current/history API only.

**Exit criteria**

- A real device identity can publish through MQTT and the existing application
  displays the resulting canonical level/volume without frontend changes.
- Backend restart, broker restart, and retained-config update tests pass.
- Disabling MQTT leaves the existing HTTP recovery path functional.

#### Phase I-3 - Freeze low-power normal-mode firmware

**Build**

- Set production broker defaults to
  `aquamind-mqtt.utkarshjoshi.com:8883`, enable TLS, validate the CA/hostname,
  and remove `setInsecure()` from production builds.
- Use a hardware-tested MQTT client/configuration that can publish at QoS 1 and
  expose delivery completion before sleep. The device must not interpret a local
  socket write alone as broker acceptance.
- The firmware now contains the bounded normal wake path behind an explicit
  deep-sleep build flag: 90-second awake budget, retained-config receive window,
  six-hour RTC-backed OTA schedule, and one HTTPS recovery attempt after two
  failed MQTT wake cycles. Keep the flag off until GPIO16-to-RST wiring and the
  power budget are measured on the exact installed hardware.
- Implement the bounded normal wake cycle:

  ```text
  BOOT -> LOAD -> PROVISIONING GATE -> SAMPLE -> WIFI -> MQTT AUTH
       -> SUBSCRIBE/APPLY RETAINED CONFIG
       -> PUBLISH CURRENT TELEMETRY -> WAIT FOR DELIVERY -> SHORT RECEIVE WINDOW
       -> SCHEDULED OTA CHECK IF DUE -> DISCONNECT -> DEEP SLEEP
  ```

- At the provisioning gate, missing/corrupt device identity, token, config
  schema, production-broker marker, or Wi-Fi state sets
  `unconfigured_mqtt=true`, suppresses telemetry/HTTP fallback, and starts AP
  onboarding. Existing Wi-Fi may be retained for rollback but does not bypass
  this gate.
- Once `mqttProvisioned=true`, failure to associate with the saved Wi-Fi, resolve
  DNS, reach the broker, or reach the auth hook does not automatically start AP
  mode. It follows bounded retry/fallback/sleep. AP is entered only for missing
  provisioning, confirmed token rejection by both MQTT and HTTPS, or the
  documented physical force-portal action.
- Bound the AP portal window so an unattended battery device cannot remain an
  access point indefinitely. On timeout, keep it unconfigured and sleep/retry on
  the documented schedule; a physical reset/button sequence can force the portal
  immediately.
- Use the retained normal report interval as the next wake interval with firmware
  minimum/maximum safety bounds. Do not keep Wi-Fi/MQTT connected between normal
  samples on the battery deployment.
- Bound Wi-Fi, MQTT, DNS, and TLS attempts. After the awake deadline, persist
  only the latest pending current reading/state needed for recovery and sleep;
  never busy-retry until the battery is depleted.
- Do not clear the entire legacy buffer merely because one MQTT publish succeeds.
  Part I may use latest-reading recovery rather than full backlog replay, but its
  behavior must be explicit and must not delete unrelated buffered state.
- Use exponential failure backoff across wake cycles with a maximum interval that
  still permits recovery visibility. After bounded MQTT failures, attempt the
  existing HTTPS telemetry path once, then sleep regardless of outcome.
- Persist enough schedule state that the HTTP OTA check runs at a low-frequency
  interval such as 6-12 hours, not on every 5-minute reboot. Defer OTA while a
  telemetry/config transaction is incomplete.
- Report firmware version, config version, battery voltage, RSSI, and sensor
  validity in every normal telemetry frame. Invalid level is `null`, never zero.
- Keep serial diagnostics useful but ensure production logging cannot expose the
  device token, Wi-Fi credentials, or full secrets.

**Exit criteria**

- Firmware connects only to the production hostname with certificate validation,
  authenticates using the claimed device token, applies retained config, and
  publishes a valid normal reading before sleeping.
- Firmware with only legacy Wi-Fi/HTTP state enters AP mode; successful claim and
  MQTT proof atomically mark it configured, while failed proof leaves legacy
  rollback state intact and sends no telemetry under ambiguous credentials.
- Wi-Fi/broker failure reaches sleep within the awake-time budget and recovers on
  a later wake or through the bounded HTTP fallback.
- Measured average/peak current and projected battery life meet the deployment
  target recorded for the actual battery and wake interval.
- A remotely assigned OTA build downloads, verifies, installs, reboots, reconnects
  to MQTT, and reports the new firmware version in a bench test.

#### Phase I-4 - Bench soak, flash, and real-tank canary

**Build and test**

- Run at least a 48-hour bench soak with the production binary, DNS, certificate,
  auth, backend, and broker. Include Wi-Fi loss, broker restart, backend restart,
  retained config change, token rejection, sensor no-echo, low battery, and HTTP
  fallback.
- Test first boot with: empty flash; legacy Wi-Fi + HTTP token; missing marker;
  corrupt marker/token; successful same-tenant reclaim; different-tenant claim;
  AP timeout; broker auth-hook outage; revoked token; and power loss during the
  provisioning-state write.
- Compare sensor distance and server-derived level/volume against manual tank
  measurements at multiple water levels. Correct calibration before installation.
- Perform one OTA upgrade and one OTA rollback on the exact hardware before it is
  mounted where physical access is difficult.
- Flash the tagged/checksummed production artifact, record device ID, token
  issuance, firmware checksum/version, tank profile, install date, battery,
  wiring, and rollback image in the deployment record.
- Install on the real tank and run a seven-day canary. Check daily that `/current`
  advances near the configured cadence, values are plausible, retained config is
  applied, restarts recover, and battery trend matches the bench estimate.
- Freeze the Part I wire/config compatibility after installation. Part II
  firmware changes arrive only through a tested staged OTA release.

**Part I deployment gate**

- The existing application consistently shows a recent, valid tank reading with
  no frontend work.
- Device authentication, tenant/device ownership, MQTT ACL, TLS hostname, retained
  config, MQTT ingest, HTTP recovery, OTA, and restart recovery are demonstrated.
- The device sleeps/reconnects within measured power limits and never remains in
  an unbounded network retry loop.
- Known Part I limitations are documented; there is a physical rollback image and
  a tested OTA forward/rollback path.

Once this gate passes, the installed firmware is the compatibility baseline for
all Part II work.

### Part II - Full MQTT-native product development

Part II begins after the real-tank canary. Each phase is independently deployable
behind per-device/tenant feature flags for protocol v2, application receipts,
full offline replay, live sessions, SSE, history/admin UX, and governed exports.

#### Phase II-0 - Contract freeze and measurable baseline

**Build**

- Rename the current concept in code/docs to clarify that it only controls
  legacy config delivery; stop adding behavior to `SyncMode`.
- Write versioned JSON Schemas/Zod schemas and golden payload fixtures for every
  v2 message. Generate or manually mirror constrained firmware structs from the
  same fixtures.
- Establish one shared TypeScript DTO contract module for REST, SSE, web, and
  mobile, with contract compatibility tests and explicit units/null semantics.
- Reconcile `tools/debug-hub` and simulator payloads with the v2 contract.
- Use the deployed Part I firmware as the baseline for flash, free heap, awake
  time, average/peak current, reconnect behavior, payload sizes, backend ingest
  throughput, and history API latency.
- Prove the deployed MQTT client can support v2 application receipts, Last Will,
  larger batches, and command correlation within memory limits; otherwise spike
  an OTA-compatible replacement before changing the wire contract.
- Define fleet-size and message-rate load profiles for normal, 10% live, and
  admin diagnostic bursts.

**Exit criteria**

- Protocol fixtures pass in backend, firmware parser tests, simulator, and debug
  hub.
- REST and SSE contract fixtures deserialize to the same shared DTOs in backend,
  web, and mobile contract tests.
- MQTT client choice and maximum payload/batch size are recorded from hardware
  tests.
- Baseline measurements and rollout feature flags are documented.

#### Phase II-1 - Canonical ingestion and reliable history

**Build**

- Add measurement identity, sample/receive timestamps, quality, transport, mode,
  protocol version, and dedupe constraints.
- Normalize HTTP v1 and MQTT v1 into the canonical ingest service.
- Make ingest transactional: dedupe, measurements, latest device state, alert
  evaluation input, and realtime event intent.
- Replace `days + limit` internally with ranged cursor queries while keeping a
  compatibility adapter for current clients.
- Create aggregate tables/jobs, retention checkpoints, and history/current DTOs.
- Correct daily aggregation for out-of-order offline replay.
- Add data completeness, ingestion lag, and gap calculation.
- Add governed cursor-based CSV/NDJSON export with device/time/quality/mode
  filters, schema/provenance manifest, export ID, and tenant authorization.
- Preserve config/profile/firmware versions and stable typed events so future
  datasets can reconstruct context and labels without parsing UI text or logs.
- Add immutable effective-dated config/profile revisions and make
  `as_of_sample` versus `current_profile` derivation explicit in history/export
  requests and response manifests.

**Exit criteria**

- Replaying the same fixture 100 times creates one copy of each measurement.
- Out-of-order samples appear at the correct chart time and update aggregates.
- Current/history endpoints agree on value, unit, quality, and timestamp.
- A repeated export request has documented bounds/schema and yields the same
  ordered canonical rows while source data is unchanged.
- Editing the current tank profile does not silently change an `as_of_sample`
  export; a current-profile recalculation is explicitly labeled and testable.
- Old clients continue working during the migration.

#### Phase II-2 - MQTT v2 broker and backend reliability

**Build**

- Add v2 subscriptions, shared-subscription naming, schema validation, protocol
  error records, and topic/payload identity checks.
- Implement retained config, reported state, birth/Last Will, and commit receipt.
- Add the transactional `ControlOutbox` and a retrying MQTT publisher.
- Split ingest/control broker identities and tighten device ACLs.
- Extend the Part I TLS/persistence baseline with production metrics, tested
  backup/restore, v2 queue/packet limits, and horizontal-ingest health checks.
- Persist broker/adapter connection state instead of relying on console logs.
- Make the ingest subscriber stop/disconnect on DB unavailability and recover
  cleanly; device receipts remain the final protection against processing loss.

**Exit criteria**

- Broker/backend restarts during publish do not lose buffered samples.
- Retried samples dedupe and receive a backend receipt.
- Unauthorized cross-device publish/subscribe tests fail.
- Config written while a device is offline applies after reconnect.
- With two ingest instances, each normal delivery is handled by one shared-
  subscription member; QoS redeliveries remain harmless through deduplication.

#### Phase II-3 - Durable offline replay on deployed firmware

**Build**

- Extend the deployed normal wake state machine with a persistent ring buffer,
  batches, backend commit receipts, full replay, and reported state.
- Generalize the deployed cadence into normal connectivity strategy configuration
  while preserving its hard power-safety bounds.
- Add intentional-sleep presence and expected-wake reporting.
- Verify CA and remove insecure TLS in production builds.
- Make HTTP fallback use the same canonical buffer/config code.
- Add brownout/reset recovery and flash-wear tests.
- Add battery profiling for normal, prolonged outage, replay, live, and
  diagnostic cases.

**Exit criteria**

- A 24-hour Wi-Fi/broker outage replays in order without visible loss or
  duplicates after recovery, within configured buffer capacity.
- Power loss at every buffer/config write boundary leaves recoverable state.
- Broker outage retry behavior stays within the agreed battery budget.
- Firmware reports why it is offline/sleeping and its next expected wake.

#### Phase II-4 - Desired policy, commands, and live leases

**Build**

- Replace config `live/piggyback` with retained desired config plus reported
  config version. Migrate existing rows to the new normal policy defaults.
- Add `TelemetrySession`, desired policy revisions, lease reconciliation, TTL
  cleanup, viewer attachment, authorization, rate limits, and audit.
- Firmware implements normal/live/diagnostic transitions and automatic rollback
  to normal.
- Add correlated, expiring, allow-listed commands and persisted acknowledgements.
- Implement self-test as structured result fields, not a free-form log message.
- Add admin/user APIs and session/command state tests.

**Exit criteria**

- Connected live sessions activate and stream within the SLO.
- Sleeping devices show pending and activate on the next wake or terminate as
  `expired_before_connect`.
- App/server/device crashes cannot leave a device live beyond its maximum TTL.
- Duplicate commands do not repeat a completed destructive action.

#### Phase II-5 - Realtime delivery to applications

**Build**

- Publish an internal event only after database commit.
- Add tenant-authorized SSE snapshot, telemetry, presence, session, state, and
  admin command events.
- Implement stream IDs, heartbeat, bounded replay, `Last-Event-ID`, slow-client
  limits, and reconnect snapshots.
- Return a stream cursor/watermark with REST bootstrap queries and test the
  REST-to-SSE race window and ranged heal path.
- Add Redis fan-out before API horizontal scaling; keep the interface portable
  if deployment initially remains single-process.
- Load test normal subscribers plus concurrent live viewers. One device stream
  is fanned out server-side, not multiplied at the device.

**Exit criteria**

- Disconnecting/reconnecting the browser produces no missing or duplicate chart
  points after reconciliation.
- Telemetry arriving between bootstrap and stream open is replayed or recovered
  by exactly one ranged heal.
- Cross-tenant SSE access is denied and no event leaks after ownership changes.
- Slow clients cannot exhaust backend memory.
- Committed telemetry reaches authorized viewers within the SLO.

#### Phase II-6 - Data-heavy user web experience

**Build**

- Replace fixed/static device detail fetching with typed current/history/event
  query models and one page-owned bootstrap/stream/heal controller.
- Build the status strip, rich history explorer, summaries, event timeline, raw
  table, range/resolution controls, data gaps/quality, and CSV export.
- Add the Go live lifecycle UI with battery/time warning, pending wake state,
  active countdown, extend, and stop.
- Upgrade the user device list for dense operational scanning, filters, and sort.
- Add explicit loading, empty, partial-data, stale, offline, invalid-sensor,
  reconnecting, and permission-loss states.
- Enforce shared REST/SSE DTOs, the live-session UI state machine, bounded chart
  point counts, gap rendering, one-time auth refresh, and stream teardown.
- Verify responsive layouts and chart readability on desktop/mobile widths.

**Exit criteria**

- History supports the defined ranges without silently truncating to a fixed
  point count.
- Live points transition into history without a refresh or duplicate.
- Missing/invalid data is visually distinct from zero.
- Browser tests cover normal, pending sleep, active live, expiry, reconnect,
  old history, and unauthorized access.
- A device page owns at most one stream, closes it on navigation, refreshes auth
  at most once per `401`, heals a forced cursor gap, and respects the configured
  per-series point ceiling.

#### Phase II-7 - Admin fleet and diagnostics workspace

**Build**

- Extend the existing dense fleet table with health derivation/filtering, saved
  views, cursor pagination, operational columns, and canonical export controls.
- Build device Overview/Live/History/Connectivity/Config & State/Commands/Events/
  Firmware tabs against canonical APIs.
- Add diagnostic leases, structured self-test, desired/reported diff, command
  audit, connection timeline, raw export, and protocol/auth error summaries.
- Ensure table, export, and future pipeline access share canonical filters and
  DTOs; no table-only transformations become dataset behavior.
- Add carefully scoped bulk config/policy/firmware actions through the outbox.
- Add broker, ingest, session, receipt, command, SSE, aggregation, retention, and
  battery-policy dashboards/alerts.

**Exit criteria**

- An admin can locate a stale/faulty device, inspect its last valid and raw data,
  start diagnostics, receive self-test results, compare config, and see the
  entire audit trail without reading server logs.
- Role and destructive-action tests cover admin versus super-admin boundaries.
- Fleet queries meet the target at the agreed simulated fleet size.

#### Phase II-8 - Mobile parity, controlled rollout, and HTTP retirement

**Build**

- Move mobile screens to shared typed DTO definitions and add live session,
  reliable history, gap/quality, and reconnect states appropriate for mobile.
- Roll out MQTT v2 by internal devices, canary tenant, battery devices, 10%, 50%,
  then 100%, with automatic stop criteria.
- Compare HTTP and MQTT telemetry for canaries using sample IDs and derived
  values; do not dual-write unidentifiable samples.
- Test broker loss, backend loss, DB loss, auth-hook loss, packet loss, duplicate,
  reordering, clock drift, power loss, token rotation, certificate rotation,
  retained stale state, and rollback.
- Disable HTTP fallback per cohort only after MQTT reliability and battery gates
  pass. Keep recovery/provisioning and OTA download HTTP paths where MQTT is not
  the right data plane.
- Remove v1 topic subscriptions and legacy config `syncMode` only after the last
  supported firmware cohort is upgraded or formally retired.

**Exit criteria**

- MQTT cohorts meet loss, duplicate, latency, config, live-session, and battery
  objectives for at least two normal reporting cycles plus the agreed soak
  period.
- Rollback to HTTP fallback is tested and does not duplicate or lose samples.
- Operations runbooks and support UI cover all expected failure states.

## 13. Cross-phase test matrix

Part I runs the normal-mode, auth/TLS, retained-config, restart, power, fallback,
OTA, and physical-device scenarios explicitly listed in Phases I-1 through I-4.
It is not blocked by tests for features it intentionally does not contain.

As Part II features land, every applicable release candidate runs the growing
matrix below in simulator, real broker, and at least one physical device:

- normal online reporting and normal deep-sleep reporting
- offline buffer fill, overflow policy, reconnect, replay, receipt loss, and
  duplicate receipt
- device reboot and power loss during sample write, publish, config apply, and
  command execution
- broker restart/persistence restore and backend rolling restart
- DB outage and slow DB while devices continue publishing
- invalid JSON, unsupported schema, oversized packet, wrong topic ID, and
  unauthorized cross-device access
- wall-clock absent/drifted and out-of-order samples from multiple boots
- config update online/asleep/offline and rollback to prior valid config
- live request online, live request asleep, concurrent viewers, extend, manual
  stop, expiry, app crash, backend crash, and device reboot during lease
- command duplicate, expiry, late acknowledgement, rejection, and reboot loop
  prevention
- SSE gap/reconnect, multiple tabs, slow consumer, ownership change, and token
  expiry
- history raw/aggregate boundary, retention boundary, invalid sensor gap, CSV,
  NDJSON, reproducible export manifest, tenant scope, and timezone/DST display
- REST/SSE DTO parity, bootstrap-to-stream race, cursor replay miss, one ranged
  heal, duplicate merge, heartbeat timeout, route teardown, and one-time auth
  refresh
- firmware/broker certificate and token rotation with overlap and rollback

## 14. Rollout gates and rollback

Part I promotion is controlled by its dedicated physical deployment gate. For
Part II, promote a cohort only when:

- receipt latency, unreceipted queue depth, duplicate rate, ingest errors, and
  battery use remain inside thresholds;
- desired/reported config and policy converge;
- no unexplained difference exists between canonical HTTP and MQTT values;
- user/admin live sessions terminate correctly; and
- support staff can diagnose failures from the admin workspace.

Automatic rollback triggers include elevated unreceipted samples, unexpected
battery drain, authentication failure spike, config rejection, broker queue
growth, ingest lag, or crash-loop increase. Rollback changes `transportPolicy`
for the cohort, preserves sample identity/buffer state, ends live leases, and
does not downgrade stored config schemas without an explicit compatible path.

## 15. Definition of done

The MQTT migration is complete when MQTT is not merely carrying the same
occasional POST payload. It is complete when:

- normal reporting is demonstrably power-aware and loss-resistant;
- the server can request an expiring live or diagnostic stream and show its true
  pending/active state;
- every accepted sample is deduplicated, queryable, aggregated, and reconciled
  into realtime UI;
- users can explore trustworthy history and live behavior without fixed static
  views;
- admins can inspect fleet health, raw/live telemetry, connectivity, config,
  commands, protocol events, and audit history;
- governed exports reproduce complete, quality-labeled raw data and provenance
  without using chart transformations or one-off database queries;
- future hint/training consumers can use the canonical measurement/event/export
  contracts without changing device ingestion or inventing another data model;
- broker security, persistence, metrics, load, backup, and failure recovery are
  operated as production infrastructure; and
- HTTP device telemetry can be retired without losing provisioning, recovery,
  OTA download, or rollback capability.
