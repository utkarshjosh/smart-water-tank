/**
 * ============================================================================
 * AquaMind Debug Hub  —  entry point
 * ============================================================================
 * Wires the hub, transports, discovery, simulator, and web server together.
 *
 *   node src/index.js                 # hub + web UI + 2 simulated devices
 *   node src/index.js --sim 0         # no simulator (real devices only)
 *   node src/index.js --sim 3         # 3 simulated devices
 *   node src/index.js --port 8080     # web UI on a different port
 *   node src/index.js --no-serial     # skip serial port scanning
 *
 * Then open http://localhost:7070
 * ============================================================================
 */

import { Hub } from './hub.js';
import { startServer } from './server.js';
import { startDiscovery } from './discovery.js';
import { startSimulator } from './simulator.js';
import { connectTcp } from './transports/tcp.js';
import { listPorts, openPort, closePort } from './transports/serial.js';

const argv = process.argv;
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };

const httpPort = parseInt(opt('port', '7070'));
const simCount = parseInt(opt('sim', '2'));
const noSerial = flag('no-serial');

const hub = new Hub();
let sim = null;

// Actions the web server calls in response to UI requests.
const actions = {
  connectTcp: (host, port) => connectTcp(hub, host, port),
  disconnect: (id) => { const l = hub.linkForDeviceId(id); l?.close(); },
  openPort:   (path, baud) => openPort(hub, path, baud),
  closePort:  (path) => closePort(hub, path),
  listPorts:  () => (noSerial ? Promise.resolve([]) : listPorts()),
  startSim:   (count) => { sim?.stop(); sim = startSimulator({ count, log: (m) => hub.log('info', m, 'sim') }); },
  stopSim:    () => { sim?.stop(); sim = null; },
};

startServer(hub, actions, httpPort);

// Auto-discover devices announcing over UDP and connect to them.
// retry:false — a discovered address that refuses is retried on the next
// announce, not in a tight loop (prevents connect storms on unreachable IPs).
startDiscovery(hub, (host, port, meta) => connectTcp(hub, host, port, meta, { retry: false }));

// Start simulated devices unless disabled.
if (simCount > 0) {
  sim = startSimulator({ count: simCount, log: (m) => hub.log('info', m, 'sim') });
}

hub.log('info', `debug hub ready → http://localhost:${httpPort}  (sim devices: ${simCount}, serial: ${!noSerial})`);
console.log(`\n  AquaMind Debug Hub → http://localhost:${httpPort}\n  simulated devices: ${simCount}   serial: ${noSerial ? 'off' : 'on'}\n  Ctrl-C to stop.\n`);

process.on('SIGINT', () => { sim?.stop(); process.exit(0); });
