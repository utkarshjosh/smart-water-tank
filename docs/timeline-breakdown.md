# Water Tank Monitoring System - Timeline Breakdown

---

## 🌱 Phase 0 — Prepare Hardware + Desk Setup (1–2 days)

### What You Need

- **ESP32** or **ESP8266** (prefer ESP32 if possible)
- **Waterproof ultrasonic sensor module** with UART
- **PAM amp + speaker** (optional for now)
- **Breadboard + jumper wires**
- **A small power adapter** (5V/12V)

### Goal

- ✅ You can read distances reliably in a loop
- ✅ Your firmware compiles, uploads, and prints output

---

## 🛠 Phase 1 — Firmware MVP (1–2 weeks)

### Milestone 1 — Sensor + WiFi + Basic Loop

**Features:**
- UART read from ultrasonic module
- Convert reading → cm → volume
- Hardcode calibration
- Log to serial

**Deliverables:**
- `read_sensor()` function
- Serial logs like:
  ```
  level: 172cm, volume: 821L, temp: 30C
  ```

---

### Milestone 2 — Push to Server (HTTPS)

**Features:**
- Add WiFi connection logic + reconnection
- Add HTTPS POST to `/measurements`
- Use device token for simple auth
- Add retry logic
- Timestamps via NTP

**Deliverables:**
- Data reaching your server (e.g., Postman screenshot)
- Graceful failure handling (offline → buffer → retry)

---

### Milestone 3 — Local Alerts (On Device)

**Features:**
- Simple threshold config
- Trigger buzzer/speaker via PAM amp
- Debouncing (e.g., full tank for 30 seconds → alert)

**Deliverables:**
- Speaker alert when tank reading > threshold
- User-configurable alert values stored in NVS

---

### Milestone 4 — OTA

**Features:**
- Use ESP32 OTA HTTP update
- Device checks `GET /device/{id}/ota/latest`
- If version mismatch → download → update

**Deliverables:**
- ✅ Working OTA update
- Version stored in firmware
- Success/fail messages in logs

---

## 🌐 Phase 2 — Backend + Databases (2 weeks)

> **Philosophy:** We keep it minimal and lean

### Tech Stack

- **Backend:** Go / Node.js
- **DB:** MySQL/Postgres
- **Firebase:** Auth + FCM

---

### Milestone 5 — Basic Backend

**Endpoints:**
- `POST /measurements`
- `GET /device/{id}/config`
- `GET /device/{id}/ota/latest`

**Backend Features:**
- Validate device token
- Insert measurement into measurements table
- Return config in JSON
- Serve OTA binaries

**Deliverables:**
- ✅ Your server receives real data
- ✅ Data is visible with a simple SQL query

---

### Milestone 6 — Aggregation & Anomaly Cron Jobs

**Cron Jobs (every hour/day):**
- Calculate daily usage
- Detect refill events
- Detect leak-like behavior
- Insert into `daily_summary`

**Alerts (Server-side):**
- Send FCM notification to user

**Alert Types:**
- `tank_full`
- `tank_low`
- `leak_detected`
- `sensor_fault`
- `device_offline`

**Deliverables:**
- ✅ Alerts show up on your Android phone via Firebase
- ✅ Summary tables update daily

---

## 📱 Phase 3 — Android App (User App) (1.5–2 weeks)

### Tech Stack

- **Kotlin**
- **Jetpack Compose**
- **Firebase Auth**
- **Firebase FCM**
- **Retrofit** for your backend

---

### Milestone 7 — App Basic

**Features:**
- Login (Firebase)
- Register device using token or QR code
- **"My Tank" home screen:**
  - Current volume
  - Full/low status
  - Last updated time

**Deliverables:**
- ✅ Users attach device
- ✅ App shows real-time latest reading

---

### Milestone 8 — History & Graphs

**API:** `GET /device/{id}/history?days=7`

**Features:**
- Show tank history graph
- Show daily usage graph (line chart)

**Deliverables:**
- ✅ Beautiful chart of last 7 days
- ✅ Daily consumption display

---

### Milestone 9 — Alerts

**Features:**
- Push notifications using FCM
- Alert center in app
- **"Mute alerts for X hours"** button

**Deliverables:**
- ✅ Alerts appear instantly
- ✅ User can mute/unmute alerts

---

## 🕸 Phase 4 — Admin Web App (1 week)

### Tech Stack

- **React** (or simple HTML + JS)
- **Firebase Auth** (admin role)
- **Backend APIs** via fetch

### Admin App Features

- Device list
- Last online time
- Health metrics (battery, RSSI, version)
- Upload new firmware
- Change config
- Download raw CSV
- Manual recalibration tools
- Simple anomaly reports

**Deliverables:**
- ✅ Admin can manage everything
- ✅ OTA firmware upload working fully

---

## 🚀 Phase 5 — Field Testing (1–2 weeks)

### Test in Real Tank Environment

- ☀️ Sunlight/condensation
- 🌡️ Seasonal temperature
- 💧 Actual water turbulence
- 📶 Constant WiFi drop/reconnect
- 🔄 Multiple fill cycles

### Goals

- Adjust filtering
- Adjust thresholds
- Validate anomaly detection
- Tune server-side rules
- Improve OTA reliability

---

## 🧭 Phase 6 — Polishing & Packaging (1 week)

### Hardware

- Final waterproof enclosure
- Proper cable glands
- Shielded cable
- Mounting hardware
- Stable power supply

### Software Cleanup

- Error logs
- Retry strategies
- Security keys rotation
- Documentation

---

## 🗂 Summary Timeline (Realistic)

| Week | What Happens |
|------|-------------|
| **1** | Firmware MVP |
| **2** | Server MVP running |
| **3** | Firmware → Server integration |
| **4** | Alerts + OTA |
| **5** | Android app basic |
| **6** | Android graphs + alerts + admin app |
| **7** | Field testing |
| **8** | Final packaging & polish |
