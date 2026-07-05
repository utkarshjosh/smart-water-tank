/**
 * ============================================================================
 * Hub  —  central registry + router for all connected devices
 * ============================================================================
 * Transports (TCP, serial, simulator) create a "link" and hand messages to the
 * hub. The hub keeps a device model per link, routes inbound messages, and
 * emits normalised events the web server streams to the UI over SSE.
 *
 * Events emitted:
 *   'device'   (device)            device added or updated
 *   'removed'  (id)                device gone
 *   'telemetry'(id, data, ts)      new telemetry
 *   'log'      ({source,level,msg,ts})  a log line (device or hub)
 * ============================================================================
 */

import { EventEmitter } from 'node:events';
import { MSG, ROLE } from './protocol.js';

export class Hub extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, object>} keyed by linkKey */
    this.devices = new Map();
    /** @type {Map<string, {send:Function, close:Function}>} keyed by linkKey */
    this.links = new Map();
    /** @type {Set<string>} linkKeys with an in-flight connection attempt (dedup) */
    this.connecting = new Set();
  }

  log(level, msg, source = 'hub') {
    this.emit('log', { source, level, msg, ts: Date.now() });
  }

  /** Register a transport link. `meta` seeds the device card before announce. */
  addLink(linkKey, link, meta = {}) {
    this.links.set(linkKey, link);
    const dev = {
      id: meta.id || linkKey,
      linkKey,
      name: meta.name || linkKey,
      role: meta.role || ROLE.UNKNOWN,
      transport: meta.transport || 'tcp',
      address: meta.address || '',
      fw: meta.fw || '',
      caps: meta.caps || [],
      online: true,
      lastSeen: Date.now(),
      telemetry: {},
      config: {},
    };
    this.devices.set(linkKey, dev);
    this.emit('device', dev);
    this.log('info', `link up: ${dev.name} (${dev.transport})`);
  }

  removeLink(linkKey) {
    const dev = this.devices.get(linkKey);
    this.links.delete(linkKey);
    if (dev) {
      dev.online = false;
      dev.lastSeen = Date.now();
      this.emit('device', dev);
      this.log('warn', `link down: ${dev.name}`);
    }
  }

  /** Route a message that arrived on `linkKey`. */
  onMessage(linkKey, msg) {
    const dev = this.devices.get(linkKey);
    if (!dev) return;
    dev.lastSeen = Date.now();
    dev.online = true;

    switch (msg.type) {
      case MSG.ANNOUNCE:
        if (msg.id) dev.id = msg.id;
        if (msg.name) dev.name = msg.name;
        if (msg.role) dev.role = msg.role;
        if (msg.fw) dev.fw = msg.fw;
        if (Array.isArray(msg.caps)) dev.caps = msg.caps;
        this.emit('device', dev);
        break;
      case MSG.TELEMETRY:
        dev.telemetry = { ...dev.telemetry, ...(msg.data || {}) };
        if (typeof msg.data?.rssi === 'number') dev.rssi = msg.data.rssi;
        this.emit('device', dev);
        this.emit('telemetry', dev.id, dev.telemetry, msg.ts || Date.now());
        break;
      case MSG.LOG:
        this.emit('log', { source: dev.name, level: msg.level || 'info', msg: msg.msg, ts: msg.ts || Date.now() });
        break;
      case MSG.ACK:
        this.log(msg.ok ? 'info' : 'error', `ack ${msg.cmd}: ${msg.msg || (msg.ok ? 'ok' : 'failed')}`, dev.name);
        break;
      case MSG.CONFIG:
        dev.config = msg.config || {};
        this.emit('device', dev);
        break;
      default:
        this.log('debug', `unknown msg type: ${msg.type}`, dev.name);
    }
  }

  /** Non-JSON line from a device (human log). */
  onRaw(linkKey, line) {
    const dev = this.devices.get(linkKey);
    this.emit('log', { source: dev?.name || linkKey, level: 'raw', msg: line, ts: Date.now() });
  }

  /** Find a link by the UI-facing device id. */
  linkForDeviceId(id) {
    for (const dev of this.devices.values()) {
      if (dev.id === id) return this.links.get(dev.linkKey);
    }
    return null;
  }

  sendToDevice(id, obj) {
    const link = this.linkForDeviceId(id);
    if (!link) { this.log('error', `no link for device ${id}`); return false; }
    link.send(obj);
    return true;
  }

  snapshot() {
    return { devices: [...this.devices.values()] };
  }
}
