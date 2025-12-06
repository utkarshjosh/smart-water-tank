# Water Tank Monitoring System - Full Stack

Complete IoT water tank monitoring system with ESP8266 firmware, Node.js backend, Next.js admin panel, and React Native mobile app.

## Architecture

- **Firmware**: ESP8266 device sending sensor data via HTTPS
- **Backend API**: Node.js/TypeScript + PostgreSQL with multi-tenant support
- **Admin Panel**: Next.js web application for device management and OTA
- **Mobile App**: React Native app with GlueStackUI for end users

## Project Structure

```
WATER_TANK/
├── firmware/          # ESP8266 firmware (existing)
├── backend/           # Node.js API server
├── admin-panel/       # Next.js admin web app
├── mobile-app/        # React Native mobile app
└── docs/              # Documentation and plans
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Firebase project with Auth and Cloud Messaging enabled
- ESP8266 device with firmware flashed

### 1. Backend Setup

```bash
cd backend
npm install

# Create .env file (copy from .env.example)
# Set DATABASE_URL, Firebase credentials, etc.

# Run database migrations
npm run build
npm run migrate

# Start development server
npm run dev
```

Backend will run on `http://localhost:3000`

### 2. Admin Panel Setup

```bash
cd admin-panel
npm install

# Create .env.local file with:
# NEXT_PUBLIC_API_URL=http://localhost:3000
# NEXT_PUBLIC_FIREBASE_API_KEY=...
# NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
# NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

# Start development server
npm run dev
```

Admin panel will run on `http://localhost:3001`

### 3. Mobile App Setup

```bash
cd mobile-app
npm install

# Configure Firebase in app.json or environment variables
# EXPO_PUBLIC_FIREBASE_API_KEY=...
# EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
# EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
# EXPO_PUBLIC_API_URL=http://localhost:3000

# Start Expo
npm start
```

## Database Schema

The PostgreSQL database includes:

- `tenants` - Multi-tenant organizations
- `users` - User accounts (Firebase UID linked)
- `devices` - ESP8266 devices
- `measurements` - Raw sensor data
- `daily_summaries` - Aggregated statistics
- `alerts` - Alert history
- `device_configs` - Per-device configuration
- `firmware_binaries` - OTA firmware storage
- `user_device_mappings` - User-device access

## API Endpoints

### Device Endpoints (Device Token Auth)
- `POST /api/v1/measurements` - Send sensor data
- `GET /api/v1/devices/:deviceId/config` - Get device config
- `GET /api/v1/devices/:deviceId/ota/latest` - Check for OTA updates

### User Endpoints (Firebase Auth)
- `GET /api/v1/user/devices` - List user's devices
- `GET /api/v1/user/devices/:deviceId/current` - Latest measurement
- `GET /api/v1/user/devices/:deviceId/history` - Historical data
- `GET /api/v1/user/devices/:deviceId/alerts` - Alert history
- `POST /api/v1/user/devices/:deviceId/alerts/:alertId/acknowledge` - Acknowledge alert
- `POST /api/v1/user/fcm-token` - Update FCM token

### Admin Endpoints (Admin Role Required)
- `GET /api/v1/admin/devices` - List all devices
- `GET /api/v1/admin/devices/:deviceId` - Device details
- `POST /api/v1/admin/devices/:deviceId/config` - Update device config
- `POST /api/v1/admin/firmware/upload` - Upload firmware
- `GET /api/v1/admin/firmware` - List firmware versions
- `POST /api/v1/admin/firmware/:version/rollout` - Rollout firmware
- `GET /api/v1/admin/analytics/summary` - System analytics
- `GET /api/v1/admin/tenants` - List tenants
- `POST /api/v1/admin/devices/:deviceId/token` - Generate device token

## Features

### Backend
- Multi-tenant architecture
- Device authentication via tokens
- Firebase Auth integration
- FCM push notifications
- Daily aggregation and leak detection
- OTA firmware management
- Alert processing

### Admin Panel
- Device management dashboard
- Real-time device monitoring
- Firmware upload and rollout
- Analytics and reporting
- Tenant management
- AI batch processing placeholder

### Mobile App
- User authentication (Firebase)
- Real-time tank status
- Historical charts
- Alert notifications (FCM)
- Device management
- Settings and preferences

## Multi-Tenant Architecture

- Users belong to tenants (organizations/households)
- Devices are assigned to tenants
- All data queries are tenant-scoped
- Admin users can manage multiple tenants

## Alert Types

- `tank_full` - Tank volume exceeds threshold
- `tank_low` - Tank volume below threshold
- `battery_low` - Device battery voltage low
- `device_offline` - Device hasn't reported in X minutes
- `leak_detected` - Unusual consumption pattern detected
- `sensor_fault` - Sensor readings appear stuck

## OTA Updates

1. Admin uploads firmware binary via admin panel
2. Admin assigns firmware to devices/tenants
3. Device checks `/api/v1/devices/:deviceId/ota/latest` endpoint
4. If update available, device downloads and installs

## Development

### Backend
```bash
cd backend
npm run dev        # Development with hot reload
npm run build      # Build TypeScript
npm start          # Production mode
npm run migrate    # Run database migrations
```

### Admin Panel
```bash
cd admin-panel
npm run dev        # Development server
npm run build      # Production build
npm start          # Production server
```

### Mobile App
```bash
cd mobile-app
npm start          # Start Expo dev server
npm run android    # Run on Android
npm run ios        # Run on iOS
```

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/water_tank_db
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
PORT=3000
CORS_ORIGIN=http://localhost:3001
FIRMWARE_STORAGE_PATH=./storage/firmware
```

### Admin Panel (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
```

### Mobile App (app.json or environment)
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
```

## License

MIT







