# Water Tank Monitoring System - Major Large-Scale Plan

## Goal (One Sentence)

> A robust, low-maintenance, long-lived water-level monitoring & alert system for an overhead tank that logs precise volume/temperature/time-series data, pushes alerts to a custom mobile app, supports OTA updates, and enables rich long-term analytics.

---

## 1) Overview & High-Level Architecture

### Edge Device (at tank)

- **Waterproof ultrasonic** (or alternative) sensor + microcontroller module inside a weatherproof enclosure
- **Local speaker + PAM amp** for audible alerts

### Local Comms

- **Wi-Fi** (ESP8266/ESP32) or for long cable runs place MCU at sensor and use Wi-Fi
- ⚠️ **Avoid running raw sensor wires long distances**

### Cloud Ingestion

- **MQTT** or **HTTPS endpoint** to an ingestion service

### Storage

- **Time-series DB** (InfluxDB / TimescaleDB) for raw samples
- **Cold storage** (S3/Glacier) for long-term archival
- **Aggregated summaries** in a relational DB

### Analytics & Dashboards

- **Grafana** + scheduled analytics jobs (daily/monthly) + ML forecasts/anomaly detection

### Mobile App

- **FCM push notifications** (Firebase), user rules, device management

### Admin UI

- Device management, config, firmware rollout, logs

---

## 2) Sensor Choice & Trade-offs

### Options and Tradeoffs (Short Summary)

#### Waterproof Ultrasonic (Non-contact)

**Pros:**
- ✅ Non-invasive, easy to install on top
- ✅ Measures level directly

**Cons:**
- ❌ Affected by foam/condensation
- ❌ Needs clear path to surface
- ❌ Orientation matters

**Use-case:** Easy retrofit; good if you can mount near surface

---

#### Submersible Pressure Transducer

**Pros:**
- ✅ Extremely stable for long-term
- ✅ Unaffected by surface conditions
- ✅ High accuracy

**Cons:**
- ❌ Requires immersion and safe cable routing through tank
- ❌ Analog output needs ADC or 4–20 mA loop

**Use-case:** Best reliability and long-term drift behavior

---

#### 4–20 mA Level Sensors

**Pros:**
- ✅ Made for long cable runs and industrial reliability
- ✅ Noise-robust

**Cons:**
- ❌ More expensive
- ❌ Need current-to-voltage stage or ADC

---

#### Float Switch / Reed Sensors

**Pros:**
- ✅ Cheap, simple for binary full/empty

**Cons:**
- ❌ Only binary, mechanical points of failure

---

### Recommendation

> **For a robust long-term system:** Prefer a submersible pressure transducer or an industrial-grade 4–20 mA level sensor.  
> **If you want simpler DIY and no tank penetration:** A waterproof ultrasonic (good brand / echo-filtering) is acceptable.  
> **For a single-family home retrofit:** Ultrasonic + MCU at sensor is easiest to prototype  
> **For reliable multi-year deployment:** Choose pressure transducer

---

## 3) Wiring & Long Cable Concerns

### ⚠️ Important Guidelines

- **Do not run ultrasonic trigger/echo raw lines over meters** — signal integrity fails

### Best Practice

- Put the **MCU right at the sensor head** (inside a small weatherproof box) and run only **power + Wi-Fi**
- The MCU handles sensor FS and sends measurements

### If You Must Run Wired Comms

- Use **differential signaling** (e.g., RS485) or I²C over long runs with proper buffers (not recommended)

### Power to Sensor Box

- Run **12V or 24V DC** to the sensor box and step down locally to 3.3V
- Higher voltage reduces I²R losses on long runs
- Use **shielded twisted pair** for power and analog signals
- Add **ferrites and surge protection** for outdoor runs

---

## 4) Power Design

### Mains Powered (Recommended)

- AC → DC adapter with a **small battery backup** (LiPo + charging/protection)
- Or a **UPS** if constant availability is required

### Off-Grid

- **Solar + LiFePO4 backup** with charge controller
- Include low-power modes and H-bridge for powering amp only when alerts needed

### Always Monitor

- Battery voltage and report to server

---

## 5) Edge Hardware Stack (Recommended)

### MCU

- **ESP32** (preferred) or ESP8266 if constrained
- ESP32 gives better crypto, dual-core, BLE, more RAM

### Sensor

- Industrial-grade submersible pressure or waterproof ultrasonic (DFRobot/etc.) depending on choice

### Power

- DC-in jack (9-24V), on-board buck regulator to 3.3V
- Battery charger IC if backup battery used

### Amplifier & Speaker

- **PAM mono Class-D amp** (e.g., PAM8403 or similar) driving an 8Ω or 4Ω speaker
- Low current standby
- Add MOSFET to power amp only during alerts

### Peripherals

- **RTC** or NTP-based time sync (NTP preferred)
- **Temperature sensor** (DS18B20 or TMP117)
- **Level of battery monitoring** (ADC)

### Enclosure

- **IP67 rated** for electronics
- Sensor itself waterproof per spec

---

## 6) Firmware Architecture & Features

### Core Modules

#### Bootloader + OTA

- Secure — signed images

#### Hardware Abstraction Layer

- Sensor read, ADC, speaker control, power mgmt

#### Measurement Pipeline

- Raw sample → filter (median/trimmed mean) → convert to distance → tank volume using calibration curve → temperature compensation (if needed)

---

### Connectivity

- **Wi-Fi manager** (smartconfig/fallback AP), keepalive, reconnect strategy, reporting intervals
- **Protocol:** MQTT (preferred for efficiency) or HTTPS with JSON

---

### Local Alerts

- Thresholds, debounce, rate-limits
- Scheduled quiet hours
- Speaker alerts (volume and tone)
- Local LED indicator

---

### Health Telemetry

- RSSI, uptime, firmware version, battery voltage

---

### Power Modes

- Sleep between measurements if battery-powered
- Continuous for mains-powered

---

### Security

- **TLS** for HTTPS or MQTT over TLS
- Token-based auth
- Certificate pinning if possible

---

### Diagnostics

- Remote log uploading on demand
- Fallback buffer when offline (circular buffer)
- Retry policy

---

### Calibration Flow

- Provide a device-level calibration utility: record two known level-volume points (empty & full) and compute linear or polynomial mapping
- Store coefficients in NVM

---

### Measurement Cadence

- Example: **every 5–15 minutes** for long-term logs; configurable per deployment
- Provide **event-triggered immediate readings** for certain events (fast fill, usage detected)

---

## 7) Backend & Data Architecture (Long-Term)

### API / Ingestion

- Use an ingestion endpoint with authentication
- Use **MQTT broker** (e.g., Mosquitto with auth) for streaming
- **HTTPS ingestion microservice** for REST clients

---

### Time-Series Storage

- **Primary:** InfluxDB or TimescaleDB for raw time-series (per-sample)
- **Retention policies:** Raw data kept for X years, aggregated hourly/daily summarizations for longer retention

---

### Cold Storage

- Export older raw data to **S3/Glacier** for indefinite archival if you need to preserve decade-long records

---

### Aggregates & Derived

- Pre-compute daily usage, monthly totals, rolling averages
- Store summary rows in RDBMS

---

### Backups

- Automated backups of DB
- Test restoration periodically

---

### Scalability

- Stateless ingestion service + message queue for high-volume scenarios
- Autoscaling ingestion
- Horizontally scalable DBs for many devices

---

### Schema (Example)

#### `measurements`

```
id, device_id, timestamp, level_cm, volume_l, temperature_c, rssi, battery_v
```

#### `daily_summary`

```
device_id, date, total_inflow_l, daily_max_l, daily_min_l, average_temp_c
```

#### `alerts`

```
device_id, timestamp, alert_type, payload
```

---

## 8) Analytics & Dashboards

### Dashboards

- **Grafana** for historical plots, anomaly overlays, and alerts visualization

### Daily Analytics

- Compute daily consumption = difference in tank volume by timestamps (handle pump refilling events)

### Anomaly Detection

- **Rule-based:** Unusual drop per hour
- **Statistical:** Z-score
- **ML:** Seasonal forecasting with Prophet / ARIMA / simple LSTM to forecast consumption and detect leaks or unusual patterns

### Usage Patterns

- Per-day-of-week profiles
- Seasonal trends
- Correlation vs temperature
- Forecast next-day usage and estimated days of water left

### Export & Reports

- Automated weekly/monthly reports emailed or downloadable CSV

---

## 9) Alerts & Mobile App

### Triggers

- ⚠️ Tank full
- ⚠️ Tank low
- ⚠️ Refill started/stopped
- ⚠️ Device offline
- ⚠️ Battery low
- ⚠️ Anomalous consumption (suspected leak)

### Delivery

- **Firebase Cloud Messaging (FCM)** for mobile push
- **SMS or email fallback** (Twilio/SendGrid)

### Mobile App Features

- Register/manage devices
- Customize thresholds/quiet hours
- View historical charts
- Acknowledge alerts
- Remote ping device

### Edge Alert Logic

- Implement local audible alarm with config for duration and tone
- Allow remote mute via app

### Throttle / Duplicate Suppression

- Deduplicate alerts (rate limits)
- Allow user preferences

---

## 10) OTA Updates & Firmware Lifecycle

### Bootloader & Signed Firmware

- Use **dual-partition rollback capable bootloader**
- Sign firmwares
- Validate signature on device

### Rollout

- **Canary rollout** (1–5% devices) → monitor → larger rollout

### Rollbacks

- Automatic rollback on failed boot or health checks

### Security

- Authenticate device to update server before download
- Use TLS

---

## 11) Security & Privacy

### Device Auth

- Unique device token + rotating token or client-cert
- Limit access scope

### Transport

- **TLS 1.2+** (ESP32 supports it)
- MQTT over TLS

### Credentials

- Don't hardcode secrets in firmware
- Use secure provisioning and store secrets in secure NVM

### Server Hardening

- Rate limiting, intrusion detection, logging

### User Privacy

- Delete or anonymize PII
- Allow user to export/delete their data

---

## 12) Testing & Validation Plan

### Unit Tests

- Firmware math conversion and calibration

### Integration Tests

- Sensor in controlled tank to verify accuracy across temps and levels

### Long Soak Test

- Run devices for weeks to observe drift, Wi-Fi reconnections, memory leaks

### Stress Tests

- Power cycle test
- OTA stress test

### Edge Cases

- Bubbles, foam, partial blockages
- Multiple refills per day
- Sensor occlusion

### Field Test

- **3 pilot installs for 3 months** before wider deployment

---

## 13) Metrics & Monitoring (Device Health)

### Monitor and Alert On

- ⚠️ Device heartbeat and last-seen timestamp
- ⚠️ RSSI and Wi-Fi connection quality
- ⚠️ Battery voltage and charging state
- ⚠️ Firmware version drift across fleet
- ⚠️ Error rates (sensor read errors)
- ⚠️ Data ingestion latency and queue backlogs

---

## 14) BOM & Estimated Cost Categories (Rough)

- **MCU board** (ESP32 dev board) — low cost
- **Sensor** (waterproof ultrasonic or pressure transducer) — ultrasonic cheaper, pressure transducer mid/high
- **Power supply & buck converter**
- **Enclosure IP67**
- **PAM amp + speaker**
- **Misc:** Connectors, cables, antenna (if needed), mounting hardware
- **Server costs:** Small VM + DB; scale with number of devices

> *(You'll want to pick specific parts and suppliers when building the prototype; I can make a precise BOM if you want.)*

---

## 15) Deployment & Maintenance Plan

### Pilot

- Build 3 units with different sensors (ultrasonic, pressure, 4–20 mA) and run 3-month comparison

### Iterate

- Pick best sensor & enclosure
- Finalize firmware & OTA

### Scale

- Provision device IDs and per-device config
- Automate provisioning (QR code / pre-shared key)

### Spares & Replacement

- Keep a small stock of sensors and MCUs
- Schedule annual check (or alert on drift)

### Documentation

- Install guides, calibrations steps, troubleshooting

---

## 16) Roadmap / Milestones (Example 6–9 Month Plan)

| Timeline | Activities |
|----------|-----------|
| **Week 0–3** | Requirements & choice of sensor; design mounting & enclosure |
| **Week 4–8** | Prototype hardware (1 ultrasonic + ESP32), basic firmware, Wi-Fi reporting to a test server, local audible alert |
| **Week 9–12** | Integrate backend (MQTT/HTTP), DB, Grafana dashboard. Mobile app skeleton with FCM alerts |
| **Month 4** | Build 3 pilot units (ultrasonic, pressure, 4–20mA), deploy to real tanks |
| **Month 5–6** | Collect data, run analytics, refine calibration, test OTA and rollback, fix bugs |
| **Month 7–9** | Final productize: PCB design, enclosure injection molding/3D print, production BOM, documentation, prepare for wider rollout |

---

## 17) Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Sensor drift/failure** | Choose industry-grade sensor; use calibration and daily sanity checks |
| **Wi-Fi instability** | Implement store-and-forward buffer; offline logging to SD/circular memory |
| **Power outages** | Battery backup or mains + UPS |
| **Data loss long-term** | Backups and cold storage; redundant ingestion |
| **Security vulnerabilities** | Periodic pen-test, signed OTA, rotate secrets |

---

## 18) Devops & Scale Considerations

- Use **IaC (Terraform)** for infra
- **CI/CD pipeline** for firmware builds and signed artifacts
- **Logging and observability** (Prometheus + Grafana)
- **Multi-tenant server** if supporting multiple households

---

## 19) Example Simple Data Flow for a Single Sample

1. Device reads sensor → filters → computes volume
2. Device publishes measurements (`device_id, ts, level_cm, volume_l, temp, rssi`)
3. Ingestion service authenticates, writes to time-series DB and message queue
4. Worker computes incremental daily usage and pushes to summary table
5. Rule engine checks thresholds → sends FCM via Firebase if alert
6. Dashboard updates and user receives push

---

## 20) Small But Critical Implementation Details (Gotchas)

### Computing Consumption

- Handle pump refills as discrete events — use change detection (positive large jumps = refill)

### Hysteresis

- Add hysteresis to avoid flapping alerts (e.g., tank full threshold + 2% hysteresis)

### Temperature Compensation

- Sensor reading vs temperature drift — test in different seasons

### Conversion Function

- Validate the conversion function from level to volume carefully — tank geometry matters (cylindrical vs rectangular)

### Timestamps

- Multiply sample timestamps with timezone normalization on server; use UTC storage

---

## 21) Next Steps I Can Do for You (Pick Any and I'll Produce Immediately)

- ✅ Detailed BOM with part numbers and costs for ultrasonic vs pressure transducer designs
- ✅ Schematic + PCB reference (ESP32 + sensor + power) for prototype
- ✅ Example firmware skeleton (ESP32 Arduino/PlatformIO) with sensor read, MQTT publish, OTA
- ✅ Server API spec + example Python/Node ingestion microservice and DB schema
- ✅ Mobile app wireframe + FCM integration steps
- ✅ Test plan checklist and QA scripts
