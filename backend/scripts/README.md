# Device Simulator Script

This script simulates a water tank monitoring device by sending POST requests to the backend API at regular intervals.

## Setup

1. **Get your device token**: 
   - Register a device through the admin panel or API
   - Generate a device token using the admin API: `POST /api/v1/admin/devices/:deviceId/token`
   - Or check the database for existing device tokens

2. **Update the script**:
   - Open `simulate-device.ts`
   - Replace `DEVICE_TOKEN` with your actual device token
   - Replace `DEVICE_ID` with your registered device_id
   - Adjust `INTERVAL_MS` if needed (default: 30 seconds)

## Usage

### Option 1: Using npm script
```bash
cd backend
npm run simulate-device
```

### Option 2: Using ts-node directly
```bash
cd backend
npx ts-node --transpile-only scripts/simulate-device.ts
```

## Configuration

You can modify these constants in the script:

- `BACKEND_URL`: Backend server URL (default: `http://localhost:3000`)
- `ENDPOINT`: API endpoint (default: `/api/v1/measurements`)
- `DEVICE_TOKEN`: Your device authentication token
- `DEVICE_ID`: Your registered device ID
- `INTERVAL_MS`: Interval between requests in milliseconds (default: 30000 = 30 seconds)

## Example Output

```
============================================================
Device Simulator Started
============================================================
Backend URL: http://localhost:3000/api/v1/measurements
Device ID: device1
Interval: 30 seconds
Device Token: 688bb1924d4a0f43d1a...
============================================================
Press Ctrl+C to stop

[2024-01-15T10:30:00.000Z] Sending initial measurement...
[2024-01-15T10:30:00.123Z] ✓ Success: Measurement sent (Status: 201)
[2024-01-15T10:30:30.456Z] ✓ Success: Measurement sent (Status: 201)
```

## Stopping the Script

Press `Ctrl+C` to gracefully stop the simulator.






