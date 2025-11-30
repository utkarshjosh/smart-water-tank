# 🌱 Ultra-Lean, Long-Term Architecture

---

## 1) Components Overview (Minimum Viable System)

### Device (ESP32/8266)

- Sends measurements every X minutes → **HTTPS REST endpoint**
- Receives **OTA update URL**
- **Local alerts** (speaker)
- Simple config pull from server

---

### Cloud Backend (Your Small Backend App)

A single backend service (Go / Node) running on a small VPS.

**Handles:**
- Data ingestion
- Auth + device registration
- Alert generation
- Aggregation cron jobs
- OTA hosting
- Admin API

---

### Databases

#### Raw Timestamped Data → MySQL/Postgres

- Lean + cheap
- Works fine for millions of rows over years
- **Index on** `(device_id, timestamp)`
- Archive old rows to CSV monthly if extremely large

#### Aggregated Data → MySQL/Postgres Summary Tables

- Daily usage
- Monthly summary
- Leak flags
- Volume estimation

---

### Firebase

- **User accounts**
- **Device attachments**
- **Push notifications**

---

### Apps

#### Android App (User)

- Uses Firebase Auth
- Reads aggregated & raw data via API
- Receives alerts (FCM)

#### Web Admin Panel

- OTA upload
- Device config page
- Logs & anomalies
- Manual recalibration

---

## 🧱 Minimal Server Architecture

### Backend Services (3 Simple Modules Inside One Server)

#### A) Ingestion Module

**Endpoint:**
```
POST /api/v1/measurements
```

- Authenticated via device token

**Stores:**
- `timestamp`
- `water level / volume`
- `temperature`
- `battery`
- `Wi-Fi RSSI`

---

#### B) Aggregation Module (Cron / Scheduled Job)

**Runs every hour or day:**
- Compute daily usage (difference between min/max)
- Detect refills
- Detect abnormal drops (possible leak)
- Insert into summary tables

---

#### C) Alerts Module

**Runs after each ingestion:**
- ⚠️ Tank full
- ⚠️ Tank empty
- ⚠️ Leak detection
- ⚠️ Sensor failure
- ⚠️ Device offline (heartbeat timeout)

Uses **Firebase Admin SDK** → Sends push notifications to user tokens

---

#### D) OTA Module

- Stores firmware binaries in `/firmware/` folder
- Device checks: `GET /api/v1/devices/{id}/ota`
- Returns latest version + binary file URL

---

## 🗃 Database Schema (Simple & Effective)

### 1. `measurements`

```
id (pk)
device_id
timestamp (UTC)
raw_level_cm
volume_l
temperature_c
battery_v
rssi
```

### 2. `daily_summary`

```
date
device_id
total_usage_l
min_volume
max_volume
refill_events
leak_suspected (bool)
```

### 3. `alerts`

```
id
device_id
timestamp
type
payload
delivered_to_firebase (bool)
```

### 4. `device_config`

```
device_id
full_level_cm
empty_level_cm
threshold_full
threshold_low
report_interval_sec
ota_version
```

---

## 🚨 Where Does Anomaly Detection Go?

> Keep it **INSIDE the backend server**.  
> Not in Firebase, not in the device.

### Three Simple Anomaly Rules

#### 1. Leak Detection

If volume drops continuously beyond expected usage rate:

```python
if (volume[t] < volume[t-1] - leak_threshold):
    leak_detected = true
```

#### 2. Stuck Sensor

If values don't change for > 12 hours:

```python
if stddev(last_12h) < small_value:
     sensor_fault
```

#### 3. Pump Stuck ON

If tank stays full too long; or refill happens too frequently.

> **These 3 cover 95% of real-world issues.**

---

## ⚙️ ML (Offline)

### Process

1. **Download raw CSV monthly**
2. **Train:**
   - Usage forecasting model
   - Leak classifier
   - Seasonal patterns
3. **Once you compute improved models:**
   - Export simple numeric thresholds or lookup tables
   - Upload them back to device config table → backend uses them

> **No heavy runtime ML needed on server.**

---

## 🔥 Firebase Usage (Super Light)

### Firebase Auth

- Login for users
- Device linking (owner → device)

### Firebase FCM

- Push notifications
- Very low cost
- Works seamlessly with Android app

> **Firebase DB is not used; only auth + push.**

---

## ❇️ System Flow (Super Simple)

### Device → Backend

1. Device reads sensor
2. Device → POST measurement
3. Backend stores
4. Backend runs rules
5. If alert → push to FCM

### Backend → Admin Panel

- Fetch summary stats
- Upload new firmware
- Configure device

### Admin → Device

1. Device checks OTA endpoint
2. Downloads new firmware

---

## 🧭 Ultra Lean Stack Recommendation

### Backend

- **Go** (fast, tiny footprint)
- **or** Node.js (JS ecosystem)

### DB

- **MySQL** (light, reliable, easy)
- **or** Postgres

### Infra

- One small VPS (1GB RAM)
- nginx reverse proxy
- Let's Encrypt SSL

> **Total cost:** ₹200–₹400/month on cheap VPS

---

## 🔍 Self-Awareness Questions (To Keep Your Clarity)

1. **Are you building a reliable tool for your family, or a future scalable product?**  
   *(This determines how simple/complex backend needs to be.)*

2. **Do you value full control or minimal maintenance more?**

3. **For anomalies: do you prefer a simple rule-based approach or are you comfortable committing to maintaining an offline ML workflow?**

4. **If the system breaks at 3 AM — do you want it to fail loudly (alert you) or fail silently (just store logs)?**

5. **Is this project an exercise in engineering mastery, or do you want a clean zero-maintenance consumer-grade device?**

> **Your answer shapes how lean the architecture should be.**
