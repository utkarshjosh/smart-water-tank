/**
 * ============================================================================
 * Wire Protocol  —  the contract shared by hub, devices, and simulator
 * ============================================================================
 * One protocol spoken over BOTH transports:
 *   - TCP: newline-delimited JSON  (device hosts a server; hub connects)
 *   - Serial: newline-delimited JSON  (USB)
 * A "message" is a single JSON object on one line, with a `type` field.
 *
 * An ESP32/ESP8266 implements the device side with WiFiServer + WiFiUDP:
 *   - hosts a TCP server on DEVICE_TCP_PORT, speaks the messages below
 *   - broadcasts an `announce` over UDP so the hub auto-discovers it
 *
 * Backward-compat: a bare telemetry object with no `type` (e.g. the
 * sensor_sanity sketch's `{"dist":..,"temp":..}`) is accepted and normalised
 * to a TELEMETRY message. See normaliseInbound().
 * ============================================================================
 */

export const DEVICE_TCP_PORT = 3333;   // port a device's TCP server listens on
export const DISCOVERY_PORT   = 3334;  // UDP port for announce broadcasts
export const DISCOVERY_MAGIC  = 'AQUAMIND_HUB';

/** Message types (device <-> hub). */
export const MSG = {
  // device -> hub
  ANNOUNCE:  'announce',   // { type, id, role, name, fw, tcpPort, caps:[] }
  TELEMETRY: 'telemetry',  // { type, id, ts, data:{...} }
  LOG:       'log',        // { type, id, level, msg, ts }
  ACK:       'ack',        // { type, id, cmd, ok, msg }
  CONFIG:    'config',     // { type, id, config:{...} }
  // hub -> device
  CMD:       'cmd',        // { type, cmd, args }
  GET_CONFIG:'getConfig',  // { type }
  SET_CONFIG:'setConfig',  // { type, config:{...} }
  PING:      'ping',       // { type }
};

/** Roles a device can play in the split system. */
export const ROLE = { TANK: 'tank', CONTROL: 'control', SENSOR: 'sensor', UNKNOWN: 'unknown' };

/**
 * Shape of a telemetry `data` payload (all optional — a device sends what it has).
 * @typedef {Object} Telemetry
 * @property {number} [distCm]   water-surface distance (cm)
 * @property {number} [tempC]    temperature (C)
 * @property {number} [drops]    no-echo pings in the last burst
 * @property {number} [valid]    valid pings in the last burst
 * @property {number} [minCm]    burst min
 * @property {number} [maxCm]    burst max
 * @property {number} [rawUs]    raw echo time (us)
 * @property {number} [rssi]     WiFi RSSI (dBm)
 * @property {number} [uptimeMs] device uptime
 * @property {number} [heapFree] free heap (bytes)
 * @property {string} [mode]     device mode (e.g. live/test)
 */

/** Build a command message for a device. */
export function cmd(name, args = {}) {
  return { type: MSG.CMD, cmd: name, args };
}

/** Serialise a message to a single newline-terminated line. */
export function encodeLine(obj) {
  return JSON.stringify(obj) + '\n';
}

/**
 * A stateful line splitter — feed it raw chunks, get back complete objects.
 * Tolerates partial lines across chunks and skips blank/garbage lines.
 */
export function createLineParser(onMessage, onGarbage) {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        onMessage(normaliseInbound(JSON.parse(line)), line);
      } catch {
        onGarbage?.(line);   // non-JSON (human log line) — surface as raw log
      }
    }
  };
}

/**
 * Normalise a parsed object into a typed message.
 * A typeless object that looks like telemetry (has dist/temp/etc.) becomes a
 * TELEMETRY message so legacy sketches work unchanged.
 */
export function normaliseInbound(obj) {
  if (obj && typeof obj === 'object' && !obj.type) {
    const t = {};
    if ('dist' in obj) t.distCm = obj.dist;
    if ('temp' in obj) t.tempC = obj.temp;
    if ('drops' in obj) t.drops = obj.drops;
    if ('valid' in obj) t.valid = obj.valid;
    if ('min' in obj) t.minCm = obj.min;
    if ('max' in obj) t.maxCm = obj.max;
    if ('us' in obj) t.rawUs = obj.us;
    if (Object.keys(t).length) return { type: MSG.TELEMETRY, data: t };
  }
  return obj;
}
