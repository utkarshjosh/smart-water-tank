/**
 * Sends ONE measurement as a device, so alert thresholds can be crossed on
 * purpose. `simulate-device.ts` sends random levels on a loop, which is fine
 * for watching a chart fill but useless for "make a low-tank alert happen now".
 *
 * Usage:
 *   SIMULATOR_DEVICE_TOKEN=... npx ts-node --transpile-only scripts/send-measurement.ts --level 85
 *   ... --level 20 --battery 3.1          # also trips battery_low
 *   ... --url https://aquamind.example.com --level 85
 *
 * --level is the raw ultrasonic distance in cm from the sensor face DOWN to
 * the water, which is what the firmware reports. A BIGGER number means a
 * FULLER-looking tank is further away, i.e. emptier. With a tank profile of
 * height H and sensor offset s, an empty tank reads (s + H).
 */

import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';

type Args = Record<string, string | undefined>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? next : 'true';
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.url || process.env.SIMULATOR_BACKEND_URL || 'http://localhost:3000';
const token = process.env.SIMULATOR_DEVICE_TOKEN;

if (!token) {
  console.error('SIMULATOR_DEVICE_TOKEN is required (the device token from claiming, not a Firebase token).');
  process.exit(1);
}

if (!args.level && args.level !== '0') {
  console.error('--level <cm> is required. It is the sensor-to-water distance, not a percentage.');
  process.exit(1);
}

const body = JSON.stringify({
  firmware_version: args['firmware-version'] || '1.1.3',
  level_cm: Number(args.level),
  // Server-side volume is derived from level + tank profile, so this stays
  // null rather than inventing a number the backend would ignore.
  volume_l: null,
  temperature_c: args.temp ? Number(args.temp) : 24.5,
  battery_v: args.battery ? Number(args.battery) : 4.05,
  rssi: args.rssi ? Number(args.rssi) : -62,
});

const url = new URL('/api/v1/measurements', baseUrl);
const send = url.protocol === 'https:' ? httpsRequest : httpRequest;

const req = send(
  {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Authorization: `Bearer ${token}`,
    },
  },
  (res) => {
    let payload = '';
    res.on('data', (chunk) => (payload += chunk));
    res.on('end', () => {
      console.log(`${res.statusCode} ${payload}`);
      process.exit(res.statusCode && res.statusCode < 400 ? 0 : 1);
    });
  }
);

req.on('error', (error) => {
  console.error('Request failed:', error.message);
  process.exit(1);
});

req.write(body);
req.end();
