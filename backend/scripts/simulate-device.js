"use strict";
/**
 * Device Simulator Script
 * Sends POST requests to the backend at intervals with a hardcoded device token
 *
 * Usage: npm run simulate-device
 * or: npx ts-node scripts/simulate-device.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http = __importStar(require("http"));
// Configuration
const BACKEND_URL = 'http://localhost:3000';
const ENDPOINT = '/api/v1/measurements';
const DEVICE_TOKEN = '688bb1924d4a0f43d1ace8eaf9d4475d86841761c280fc4bf3650b51a32b8043'; // Replace with your actual device token
const DEVICE_ID = '51565df9-856a-40f7-a689-3b363f40c042'; // Replace with your registered device_id
const INTERVAL_MS = 30000; // Send request every 30 seconds (adjust as needed)
// Simulated sensor data ranges
const SENSOR_RANGES = {
    level_cm: { min: 0, max: 200 }, // Tank height in cm
    volume_l: { min: 0, max: 1000 }, // Tank capacity in liters
    temperature_c: { min: 15, max: 35 }, // Ambient temperature
    battery_v: { min: 3.0, max: 4.2 }, // Battery voltage
    rssi: { min: -90, max: -30 }, // WiFi signal strength
};
// Generate random sensor data within ranges
function generateSensorData() {
    const level_cm = Math.random() * (SENSOR_RANGES.level_cm.max - SENSOR_RANGES.level_cm.min) + SENSOR_RANGES.level_cm.min;
    const volume_l = Math.random() * (SENSOR_RANGES.volume_l.max - SENSOR_RANGES.volume_l.min) + SENSOR_RANGES.volume_l.min;
    const temperature_c = Math.random() * (SENSOR_RANGES.temperature_c.max - SENSOR_RANGES.temperature_c.min) + SENSOR_RANGES.temperature_c.min;
    const battery_v = Math.random() * (SENSOR_RANGES.battery_v.max - SENSOR_RANGES.battery_v.min) + SENSOR_RANGES.battery_v.min;
    const rssi = Math.floor(Math.random() * (SENSOR_RANGES.rssi.max - SENSOR_RANGES.rssi.min) + SENSOR_RANGES.rssi.min);
    return {
        device_id: DEVICE_ID,
        firmware_version: '0.1.0',
        timestamp: Date.now(),
        level_cm: Math.round(level_cm * 10) / 10,
        volume_l: Math.round(volume_l * 10) / 10,
        temperature_c: Math.round(temperature_c * 10) / 10,
        battery_v: Math.round(battery_v * 100) / 100,
        rssi: rssi,
    };
}
// Send POST request to backend
function sendMeasurement(data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const url = new URL(ENDPOINT, BACKEND_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 3000,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': `Bearer ${DEVICE_TOKEN}`,
            },
        };
        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                const timestamp = new Date().toISOString();
                if (res.statusCode === 201) {
                    console.log(`[${timestamp}] ✓ Success: Measurement sent (Status: ${res.statusCode})`);
                    try {
                        const response = JSON.parse(responseData);
                        if (response.config) {
                            console.log(`[${timestamp}]   Config received:`, JSON.stringify(response.config, null, 2));
                        }
                    }
                    catch (e) {
                        // Ignore parse errors
                    }
                }
                else {
                    console.error(`[${timestamp}] ✗ Error: Status ${res.statusCode}`);
                    console.error(`[${timestamp}]   Response:`, responseData);
                }
                resolve();
            });
        });
        req.on('error', (error) => {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}] ✗ Request error:`, error.message);
            reject(error);
        });
        req.write(postData);
        req.end();
    });
}
// Main function
async function main() {
    console.log('='.repeat(60));
    console.log('Device Simulator Started');
    console.log('='.repeat(60));
    console.log(`Backend URL: ${BACKEND_URL}${ENDPOINT}`);
    console.log(`Device ID: ${DEVICE_ID}`);
    console.log(`Interval: ${INTERVAL_MS / 1000} seconds`);
    console.log(`Device Token: ${DEVICE_TOKEN.substring(0, 20)}...`);
    console.log('='.repeat(60));
    console.log('Press Ctrl+C to stop\n');
    // Send initial request
    const initialData = generateSensorData();
    console.log(`[${new Date().toISOString()}] Sending initial measurement...`);
    await sendMeasurement(initialData);
    // Set up interval
    const intervalId = setInterval(async () => {
        try {
            const data = generateSensorData();
            await sendMeasurement(data);
        }
        catch (error) {
            console.error('Error sending measurement:', error);
        }
    }, INTERVAL_MS);
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nStopping device simulator...');
        clearInterval(intervalId);
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        console.log('\n\nStopping device simulator...');
        clearInterval(intervalId);
        process.exit(0);
    });
}
// Run the simulator
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=simulate-device.js.map