# Water Tank Monitoring System - Full Stack Implementation Plan

## Overview

Build three main components:

1. **Backend API** - Node.js/TypeScript + PostgreSQL with multi-tenant support
2. **Super Admin Panel** - Next.js web application for device management and OTA
3. **React Native App** - GlueStackUI mobile app for end users

All components will support multi-tenant architecture from the start (tenant per organization/household).

---

## Phase 1: Backend API Foundation

### 1.1 Project Structure Setup

- Create `backend/` directory with TypeScript + Express setup
- Initialize PostgreSQL database with migrations
- Set up environment configuration
- Add Firebase Admin SDK integration

**Files to create:**

- `backend/package.json` - Dependencies (express, pg, firebase-admin, etc.)
- `backend/tsconfig.json` - TypeScript configuration
- `backend/.env.example` - Environment variables template
- `backend/src/index.ts` - Main server entry point
- `backend/src/config/database.ts` - PostgreSQL connection
- `backend/src/config/firebase.ts` - Firebase Admin initialization

### 1.2 Database Schema (PostgreSQL)

**Multi-tenant tables:**

- `tenants` - Organization/household information
- `users` - User accounts (Firebase UID linked)
- `devices` - ESP8266 devices with tenant association
- `measurements` - Raw sensor data (indexed on device_id, timestamp)
- `daily_summaries` - Aggregated daily statistics
- `alerts` - Alert history and status
- `device_configs` - Per-device configuration
- `firmware_binaries` - OTA firmware storage metadata
- `user_device_mappings` - Many-to-many user-device access

**Key indexes:**

- `(device_id, timestamp)` on measurements
- `(tenant_id)` on all tenant-scoped tables
- `(user_id, device_id)` on user_device_mappings

**Files:**

- `backend/src/database/migrations/001_initial_schema.sql`
- `backend/src/database/models/` - TypeORM or Prisma models

### 1.3 Core API Endpoints

**Device Ingestion:**

- `POST /api/v1/measurements` - Device sends sensor data (authenticated via device token)
- `GET /api/v1/devices/:deviceId/config` - Device pulls configuration
- `GET /api/v1/devices/:deviceId/ota/latest` - OTA firmware check

**User API (Firebase Auth):**

- `GET /api/v1/user/devices` - List user's accessible devices
- `GET /api/v1/devices/:deviceId/current` - Latest measurement
- `GET /api/v1/devices/:deviceId/history` - Historical data with time range
- `GET /api/v1/devices/:deviceId/alerts` - Alert history
- `POST /api/v1/devices/:deviceId/alerts/:alertId/acknowledge` - Acknowledge alert

**Admin API (Super Admin role):**

- `GET /api/v1/admin/devices` - List all devices (with tenant filtering)
- `GET /api/v1/admin/devices/:deviceId` - Device details and health
- `POST /api/v1/admin/devices/:deviceId/config` - Update device config
- `POST /api/v1/admin/firmware/upload` - Upload OTA firmware binary
- `GET /api/v1/admin/firmware` - List firmware versions
- `POST /api/v1/admin/firmware/:version/rollout` - Rollout firmware to devices
- `GET /api/v1/admin/analytics/summary` - System-wide analytics
- `GET /api/v1/admin/tenants` - Tenant management

**Files:**

- `backend/src/routes/device.routes.ts`
- `backend/src/routes/user.routes.ts`
- `backend/src/routes/admin.routes.ts`
- `backend/src/middleware/auth.middleware.ts` - Firebase token validation
- `backend/src/middleware/deviceAuth.middleware.ts` - Device token validation
- `backend/src/middleware/tenant.middleware.ts` - Tenant isolation

### 1.4 Background Jobs & Services

**Aggregation Service:**

- Cron job (hourly/daily) to compute daily summaries
- Detect refill events (sudden volume increases)
- Detect leak patterns (unexpected volume drops)
- Update `daily_summaries` table

**Alert Service:**

- Process measurements and trigger alerts:
  - Tank full (volume >= threshold)
  - Tank low (volume <= threshold)
  - Battery low
  - Device offline (no heartbeat for X minutes)
  - Leak detected (from aggregation)
  - Sensor fault (stuck values)
- Send FCM notifications via Firebase Admin SDK
- Store alerts in `alerts` table

**Files:**

- `backend/src/services/aggregation.service.ts`
- `backend/src/services/alert.service.ts`
- `backend/src/jobs/cron.jobs.ts` - Scheduled tasks
- `backend/src/services/fcm.service.ts` - Firebase Cloud Messaging

---

## Phase 2: Super Admin Panel (Next.js)

### 2.1 Project Setup

- Initialize Next.js 14+ with TypeScript
- Set up Firebase Auth for admin login
- Configure API client for backend communication
- Add UI component library (shadcn/ui or similar)

**Files:**

- `admin-panel/package.json`
- `admin-panel/next.config.js`
- `admin-panel/src/app/layout.tsx`
- `admin-panel/src/lib/api.ts` - Backend API client
- `admin-panel/src/lib/firebase.ts` - Firebase client config

### 2.2 Core Pages & Features

**Dashboard (`/dashboard`):**

- System overview metrics
- Active devices count
- Recent alerts
- Data ingestion rate
- Tenant statistics

**Device Management (`/devices`):**

- Table/list of all devices with:
  - Device ID, tenant, status (online/offline)
  - Last seen timestamp
  - Battery level, RSSI, firmware version
  - Current water level/volume
- Device detail page (`/devices/[deviceId]`):
  - Real-time metrics
  - Configuration editor
  - Historical charts (using Chart.js or Recharts)
  - Alert history
  - Health diagnostics

**OTA Management (`/firmware`):**

- Upload firmware binary (drag & drop)
- Version management
- Rollout controls:
  - Select devices/tenants
  - Canary rollout (percentage-based)
  - Rollback capability
- Firmware version history

**Analytics (`/analytics`):**

- System-wide usage statistics
- Per-tenant analytics
- Anomaly detection reports
- Export data (CSV/JSON)
- AI batch processing placeholder (future ML features)

**Tenant Management (`/tenants`):**

- List all tenants
- Create/edit tenants
- Device assignment to tenants
- User management per tenant

**Files:**

- `admin-panel/src/app/dashboard/page.tsx`
- `admin-panel/src/app/devices/page.tsx`
- `admin-panel/src/app/devices/[deviceId]/page.tsx`
- `admin-panel/src/app/firmware/page.tsx`
- `admin-panel/src/app/analytics/page.tsx`
- `admin-panel/src/app/tenants/page.tsx`
- `admin-panel/src/components/DeviceTable.tsx`
- `admin-panel/src/components/FirmwareUpload.tsx`
- `admin-panel/src/components/Charts/` - Chart components

---

## Phase 3: React Native User App (GlueStackUI)

### 3.1 Project Setup

- Initialize React Native project (Expo or bare)
- Install GlueStackUI components
- Set up Firebase Auth and FCM
- Configure navigation (React Navigation)

**Files:**

- `mobile-app/package.json`
- `mobile-app/app.json` (Expo config if using Expo)
- `mobile-app/src/config/firebase.ts`
- `mobile-app/src/config/api.ts` - Backend API client
- `mobile-app/src/navigation/` - Navigation setup

### 3.2 Core Screens

**Authentication:**

- Login screen (Firebase Auth)
- Registration screen
- Device linking (QR code scan or manual token entry)

**Home Screen:**

- Current tank status (volume, level)
- Visual indicator (tank fill animation)
- Last updated timestamp
- Quick actions (refresh, mute alerts)

**Device List (`/devices`):**

- List of user's accessible devices
- Current status for each
- Navigate to device detail

**Device Detail (`/devices/[deviceId]`):**

- Real-time water level display
- Historical chart (last 7 days, 30 days)
- Daily usage statistics
- Alert history
- Settings (thresholds, quiet hours)

**Alerts Screen (`/alerts`):**

- List of recent alerts
- Alert details
- Acknowledge/mute actions
- Alert preferences

**Settings (`/settings`):**

- User profile
- Notification preferences
- Device management
- Logout

**Files:**

- `mobile-app/src/screens/LoginScreen.tsx`
- `mobile-app/src/screens/HomeScreen.tsx`
- `mobile-app/src/screens/DeviceListScreen.tsx`
- `mobile-app/src/screens/DeviceDetailScreen.tsx`
- `mobile-app/src/screens/AlertsScreen.tsx`
- `mobile-app/src/screens/SettingsScreen.tsx`
- `mobile-app/src/components/TankVisualization.tsx`
- `mobile-app/src/components/WaterLevelChart.tsx`
- `mobile-app/src/services/notifications.ts` - FCM handling

### 3.3 Push Notifications

- FCM token registration on login
- Background notification handler
- Foreground notification display
- Deep linking to relevant screens

---

## Phase 4: Multi-Tenant Architecture

### 4.1 Tenant Isolation Strategy

- All database queries filtered by `tenant_id`
- Middleware to extract tenant from user context
- Device-to-tenant mapping enforced
- User-to-tenant association (users belong to one tenant initially)

**Implementation:**

- Row-level security in PostgreSQL (optional, or application-level)
- Middleware to inject tenant context
- API routes validate tenant access

**Files:**

- `backend/src/middleware/tenant.middleware.ts`
- `backend/src/services/tenant.service.ts`
- Database migration for tenant isolation

### 4.2 Device Provisioning

- Device registration flow:

  1. Device sends initial registration with device token
  2. Admin assigns device to tenant
  3. Users in tenant can access device

- QR code generation for easy device linking

---

## Phase 5: Integration & Testing

### 5.1 End-to-End Integration

- Test firmware → backend data flow
- Verify OTA update flow
- Test alert generation and FCM delivery
- Validate multi-tenant isolation

### 5.2 Security Hardening

- Rate limiting on API endpoints
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- CORS configuration
- Environment variable security

---

## Technology Stack Summary

**Backend:**

- Node.js + TypeScript
- Express.js
- PostgreSQL (with Prisma or TypeORM)
- Firebase Admin SDK
- node-cron for scheduled jobs

**Admin Panel:**

- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui or similar component library
- Chart.js/Recharts for visualizations
- Firebase Auth

**Mobile App:**

- React Native (Expo recommended)
- TypeScript
- GlueStackUI components
- React Navigation
- Firebase Auth + FCM
- React Native Chart Kit or Victory Native

**Infrastructure:**

- PostgreSQL database
- Firebase (Auth + FCM)
- File storage for firmware binaries (local or S3)

---

## File Structure Overview

```
WATER_TANK/
├── firmware/              # Existing ESP8266 firmware
├── backend/                # New: Node.js API
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── database/
│   │   └── jobs/
│   └── package.json
├── admin-panel/           # New: Next.js admin app
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── package.json
├── mobile-app/            # New: React Native app
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── navigation/
│   │   └── services/
│   └── package.json
└── docs/                  # Existing plans
```

---

## Implementation Order

1. **Backend API** (Week 1-2)

   - Database schema and migrations
   - Core ingestion endpoints
   - Basic aggregation and alerts

2. **Admin Panel** (Week 2-3)

   - Device management UI
   - OTA upload functionality
   - Basic dashboard

3. **Mobile App** (Week 3-4)

   - Authentication and device linking
   - Home screen with real-time data
   - Alerts and notifications

4. **Multi-tenant & Polish** (Week 4-5)

   - Tenant isolation implementation
   - Security hardening
   - End-to-end testing

---

## Key Considerations

- **Firmware Integration:** Backend must match the data format from `firmware/src/modules/data_reporter.cpp`
- **Firebase Setup:** Requires Firebase project with Auth and Cloud Messaging enabled
- **OTA Storage:** Decide on local file storage vs cloud storage (S3) for firmware binaries
- **Scalability:** Design for future growth (message queues, horizontal scaling)
- **AI/ML Placeholder:** Admin panel should have UI section for future batch processing features
