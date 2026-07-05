/**
 * ============================================================================
 * Device Simulator  —  fake tank + control nodes, zero hardware required
 * ============================================================================
 * Each simulated device is a REAL TCP line-JSON server + UDP announcer, so it
 * exercises the exact same hub code path a real ESP32 will. Use it to build and
 * debug the entire stack on your LAN today.
 *
 * Run in-process (default, started by index.js) or standalone to feed a hub on
 * another machine:
 *     node src/simulator.js --count 3 --host 0.0.0.0
 *
 * Emulates the ESP32 contract: announces over UDP, streams telemetry, and
 * responds to ping / getConfig / cmd(selftest|setMode|fault|reboot) / setConfig.
 * ============================================================================
 */

import net from 'node:net';
import dgram from 'node:dgram';
import {
  MSG, ROLE, DEVICE_TCP_PORT, DISCOVERY_PORT, DISCOVERY_MAGIC, encodeLine, createLineParser,
} from './protocol.js';

class SimDevice {
  constructor(index, role, tcpPort, host) {
    this.id = `${role}-sim-${index + 1}`;
    this.role = role;
    this.name = `${role === ROLE.TANK ? 'Tank' : 'Control'} Node ${index + 1} (sim)`;
    this.tcpPort = tcpPort;
    this.host = host;
    this.fw = 'sim-1.0.0';
    this.caps = role === ROLE.TANK ? ['ultrasonic', 'temp'] : ['display', 'wifi-uplink'];
    this.config = { tankHeightCm: 150, sampleMs: 1000, mode: 'live', deviceId: this.id };
    this.clients = new Set();
    this.startedAt = Date.now();
    // simulated physical state
    this.waterHeight = 90 + index * 10;  // cm of water in a 150cm tank
    this.draining = true;
    this.fault = null;                    // null | 'dropouts' | 'disconnect' | 'noise'
    this.tempC = 26 + index;
  }

  announce() { return { type: MSG.ANNOUNCE, id: this.id, role: this.role, name: this.name, fw: this.fw, tcpPort: this.tcpPort, caps: this.caps }; }

  // Produce one telemetry frame with realistic noise / faults.
  telemetry() {
    // Move the water level up/down slowly for a live-looking chart.
    this.waterHeight += (this.draining ? -0.8 : 1.2) + (Math.random() - 0.5) * 0.3;
    if (this.waterHeight < 15) this.draining = false;
    if (this.waterHeight > 135) this.draining = true;
    this.tempC += (Math.random() - 0.5) * 0.15;

    if (this.role === ROLE.CONTROL) {
      // Control node reports link/system health, not raw sensors.
      return { rssi: -55 - Math.round(Math.random() * 10), heapFree: 38000 + Math.round(Math.random() * 4000),
               uptimeMs: Date.now() - this.startedAt, mode: this.config.mode };
    }

    const emptyDist = this.config.tankHeightCm;         // sensor sees this when empty
    let distCm = emptyDist - this.waterHeight;          // closer surface = fuller tank
    const noise = this.fault === 'noise' ? 6 : 0.4;
    const samples = [];
    let drops = 0;
    for (let i = 0; i < 10; i++) {
      const dropChance = this.fault === 'dropouts' ? 0.5 : 0.02;
      if (this.fault === 'disconnect' || Math.random() < dropChance) { drops++; continue; }
      samples.push(distCm + (Math.random() - 0.5) * noise);
    }
    const valid = samples.length;
    samples.sort((a, b) => a - b);
    const median = valid ? samples[valid >> 1] : null;
    return {
      distCm: median == null ? null : +median.toFixed(1),
      minCm: valid ? +samples[0].toFixed(1) : null,
      maxCm: valid ? +samples[valid - 1].toFixed(1) : null,
      rawUs: median == null ? 0 : Math.round(median * 58),
      drops, valid,
      tempC: this.fault === 'disconnect' ? null : +this.tempC.toFixed(2),
      rssi: -60 - Math.round(Math.random() * 8),
      uptimeMs: Date.now() - this.startedAt,
      mode: this.config.mode,
    };
  }

  broadcast(obj) { const line = encodeLine(obj); for (const c of this.clients) if (!c.destroyed) c.write(line); }

  handle(sock, msg, log) {
    switch (msg.type) {
      case MSG.PING: sock.write(encodeLine(this.announce())); break;
      case MSG.GET_CONFIG: sock.write(encodeLine({ type: MSG.CONFIG, id: this.id, config: this.config })); break;
      case MSG.SET_CONFIG:
        this.config = { ...this.config, ...(msg.config || {}) };
        sock.write(encodeLine({ type: MSG.ACK, id: this.id, cmd: 'setConfig', ok: true }));
        sock.write(encodeLine({ type: MSG.CONFIG, id: this.id, config: this.config }));
        break;
      case MSG.CMD: this.command(sock, msg, log); break;
    }
  }

  command(sock, msg, log) {
    const { cmd, args = {} } = msg;
    let ok = true, note = '';
    switch (cmd) {
      case 'selftest':
        this.broadcast({ type: MSG.LOG, id: this.id, level: 'info', msg: 'self-test: running…', ts: Date.now() });
        note = this.fault ? `sensors degraded (${this.fault})` : 'all sensors OK';
        break;
      case 'setMode': this.config.mode = args.mode || 'live'; note = `mode=${this.config.mode}`; break;
      case 'fault':   this.fault = args.type === 'none' ? null : (args.type || 'dropouts'); note = `fault=${this.fault}`; break;
      case 'reboot':
        note = 'rebooting';
        setTimeout(() => { this.startedAt = Date.now(); this.broadcast(this.announce()); }, 400);
        break;
      default: ok = false; note = `unknown cmd ${cmd}`;
    }
    log(`${this.id} <= cmd ${cmd} (${note})`);
    sock.write(encodeLine({ type: MSG.ACK, id: this.id, cmd, ok, msg: note }));
  }

  start(log) {
    this.server = net.createServer((sock) => {
      sock.setEncoding('utf8');
      this.clients.add(sock);
      sock.write(encodeLine(this.announce()));
      const parse = createLineParser((m) => this.handle(sock, m, log), () => {});
      sock.on('data', parse);
      sock.on('error', () => {});
      sock.on('close', () => this.clients.delete(sock));
    });
    // A busy port (e.g. Wokwi's net.forward already holds 3333) must not crash
    // the hub — log and let this sim device sit idle.
    this.server.on('error', (e) => {
      log(`${this.name}: cannot bind tcp/${this.tcpPort} (${e.code}) — skipping. ` +
          `Run the hub with --sim 0 when using Wokwi/real devices on this port.`);
    });
    this.server.listen(this.tcpPort, this.host, () => log(`${this.name} on tcp/${this.tcpPort}`));

    this.timer = setInterval(() => this.broadcast({ type: MSG.TELEMETRY, id: this.id, ts: Date.now(), data: this.telemetry() }), this.config.sampleMs);

    // UDP announce so a hub discovers us (loopback for reliable local dev + broadcast for LAN).
    this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udp.on('error', () => {});
    this.udp.bind(() => { try { this.udp.setBroadcast(true); } catch {} });
    // Announce on loopback only. The sim binds its TCP server to 127.0.0.1, so
    // broadcasting to the LAN would make the hub try to reach it at the host's
    // LAN IP (unreachable) — a connect storm. Real firmware (net_node.ino) does
    // broadcast to 255.255.255.255 for genuine LAN discovery.
    this.announceTimer = setInterval(() => {
      const pkt = Buffer.from(JSON.stringify({ magic: DISCOVERY_MAGIC, ...this.announce() }));
      this.udp.send(pkt, DISCOVERY_PORT, '127.0.0.1', () => {});
    }, 3000);
  }

  stop() {
    clearInterval(this.timer); clearInterval(this.announceTimer);
    for (const c of this.clients) c.destroy();
    this.server?.close(); this.udp?.close();
  }
}

/** Start `count` simulated devices. Returns a handle with .stop(). */
export function startSimulator({ count = 2, host = '127.0.0.1', basePort = DEVICE_TCP_PORT, log = () => {} } = {}) {
  const devices = [];
  for (let i = 0; i < count; i++) {
    const role = i === 1 ? ROLE.CONTROL : ROLE.TANK;   // 2nd device is the control node
    const dev = new SimDevice(i, role, basePort + i, host);
    dev.start(log);
    devices.push(dev);
  }
  return { devices, stop() { devices.forEach((d) => d.stop()); } };
}

// Standalone entry: `node src/simulator.js --count 3 --host 0.0.0.0`
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def; };
  const count = parseInt(arg('count', '2'));
  const host = arg('host', '127.0.0.1');
  startSimulator({ count, host, log: (m) => console.log('[sim]', m) });
  console.log(`[sim] ${count} device(s) up. Ctrl-C to stop.`);
}
