# Water Tank Backend API

Node.js/TypeScript backend API for the Water Tank Monitoring System.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp env.example .env
```

3. Configure `.env` with your actual values:
   - PostgreSQL database connection string
   - Firebase Admin SDK credentials
   - Other configuration values

4. Run database migrations:
```bash
npm run build
npm run migrate
```

5. Seed admin user (optional but recommended):
```bash
# Option 1: Create new Firebase user automatically
npm run seed:dev -- --email admin@example.com --name "Admin User" --password "securePassword123" --role super_admin

# Option 2: Use existing Firebase UID
npm run seed:dev -- --email admin@example.com --name "Admin User" --firebaseUid "existing-firebase-uid" --role super_admin

# Option 3: Use environment variables
ADMIN_EMAIL=admin@example.com ADMIN_NAME="Admin User" ADMIN_PASSWORD="securePassword123" npm run seed:dev
```

6. Start development server:
```bash
npm run dev
```

## Environment Variables

See `env.example` for all required environment variables.

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed admin user (production, requires build)
- `npm run seed:dev` - Seed admin user (development, runs directly from TypeScript)

## API Documentation

The API runs on `http://localhost:3000` by default.

### Health Check
- `GET /health` - Check server and database status

### Device Endpoints
- `POST /api/v1/measurements` - Device sends sensor data
- `GET /api/v1/devices/:deviceId/config` - Get device configuration
- `GET /api/v1/devices/:deviceId/ota/latest` - Check for OTA updates

### User Endpoints (Firebase Auth Required)
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


