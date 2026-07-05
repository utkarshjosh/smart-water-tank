/**
 * Device Simulator Script
 * Sends POST requests to the backend at intervals with a hardcoded device token
 *
 * Usage: npm run simulate-device
 * or: npx ts-node scripts/simulate-device.ts
 */

import * as http from 'http';

// Configuration
const BACKEND_URL = process.env.SIMULATOR_BACKEND_URL || 'http://localhost:3000';
const ENDPOINT = '/api/v1/measurements';
const DEVICE_TOKEN = process.env.SIMULATOR_DEVICE_TOKEN || 'replace-with-your-device-token';
const INTERVAL_MS = 30000; // Send request every 30 seconds (adjust as needed)

// Simulated sensor data ranges
const SENSOR_RANGES = {
  level_cm: { min: 0, max: 200 }, // Tank height in cm
  volume_l: { min: 0, max: 1000 }, // Tank capacity in liters
  temperature_c: { min: 15, max: 35 }, // Ambient temperature
  battery_v: { min: 3.0, max: 4.2 }, // Battery voltage
  rssi: { min: -90, max: -30 }, // WiFi signal strength
};

// Generate random sensor data within ranges. Identity comes from the bearer
// token, not the body - device_id/timestamp are no longer part of the wire
// format (see backend/src/routes/device.routes.ts for the old shape).
function generateSensorData() {
  const level_cm = Math.random() * (SENSOR_RANGES.level_cm.max - SENSOR_RANGES.level_cm.min) + SENSOR_RANGES.level_cm.min;
  const volume_l = Math.random() * (SENSOR_RANGES.volume_l.max - SENSOR_RANGES.volume_l.min) + SENSOR_RANGES.volume_l.min;
  const temperature_c =
    Math.random() * (SENSOR_RANGES.temperature_c.max - SENSOR_RANGES.temperature_c.min) + SENSOR_RANGES.temperature_c.min;
  const battery_v = Math.random() * (SENSOR_RANGES.battery_v.max - SENSOR_RANGES.battery_v.min) + SENSOR_RANGES.battery_v.min;
  const rssi = Math.floor(Math.random() * (SENSOR_RANGES.rssi.max - SENSOR_RANGES.rssi.min) + SENSOR_RANGES.rssi.min);

  return {
    firmware_version: '0.1.0',
    level_cm: Math.round(level_cm * 10) / 10,
    volume_l: Math.round(volume_l * 10) / 10,
    temperature_c: Math.round(temperature_c * 10) / 10,
    battery_v: Math.round(battery_v * 100) / 100,
    rssi,
  };
}

function sendMeasurement(data: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const url = new URL(ENDPOINT, BACKEND_URL);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        Authorization: `Bearer ${DEVICE_TOKEN}`,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        const timestamp = new Date().toISOString();
        if (res.statusCode === 201) {
          console.log(`[${timestamp}] ✓ Success: Measurement sent (Status: ${res.statusCode})`);
          try {
            const response = JSON.parse(responseData);
            if (response.config) {
              console.log(`[${timestamp}]   Config received:`, JSON.stringify(response.config, null, 2));
            }
          } catch (e) {
            // Ignore parse errors
          }
        } else {
          console.error(`[${timestamp}] ✗ Error: Status ${res.statusCode}`);
          console.error(`[${timestamp}]   Response:`, responseData);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] ✗ Request error:`, error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Device Simulator Started');
  console.log('='.repeat(60));
  console.log(`Backend URL: ${BACKEND_URL}${ENDPOINT}`);
  console.log(`Interval: ${INTERVAL_MS / 1000} seconds`);
  console.log(`Device Token: ${DEVICE_TOKEN.substring(0, 20)}...`);
  console.log('='.repeat(60));
  console.log('Press Ctrl+C to stop\n');

  console.log(`[${new Date().toISOString()}] Sending initial measurement...`);
  await sendMeasurement(generateSensorData());

  const intervalId = setInterval(async () => {
    try {
      await sendMeasurement(generateSensorData());
    } catch (error) {
      console.error('Error sending measurement:', error);
    }
  }, INTERVAL_MS);

  const shutdown = () => {
    console.log('\n\nStopping device simulator...');
    clearInterval(intervalId);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
