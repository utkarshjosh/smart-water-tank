/**
 * TCP transport — connects to a device's line-JSON TCP server (WiFi / LAN).
 * The device (ESP32/ESP8266 WiFiServer, or the simulator) is the server; the
 * hub is the client.
 *
 * Dedup + backoff (important): a linkKey is guarded by hub.links (connected) and
 * hub.connecting (attempt in flight), so repeated UDP announces for the same
 * address can't spawn parallel retry loops.
 *   - Manually-added devices retry forever (opts.retry, default true).
 *   - Discovered devices do NOT auto-retry on refusal (opts.retry === false) —
 *     the next announce will trigger a fresh single attempt. This stops the
 *     "connect to everything" storm when a broadcast address isn't reachable.
 */

import net from 'node:net';
import { createLineParser, encodeLine, MSG } from '../protocol.js';

export function connectTcp(hub, host, port, meta = {}, opts = {}) {
  const linkKey = `tcp:${host}:${port}`;
  const retry = opts.retry !== false;   // default: manual add → keep retrying
  if (hub.links.has(linkKey) || hub.connecting.has(linkKey)) return linkKey;
  hub.connecting.add(linkKey);

  let socket = null;
  let alive = true;
  let registered = false;
  let reconnectTimer = null;

  const done = () => { hub.connecting.delete(linkKey); };

  const link = {
    send(obj) { if (socket && !socket.destroyed) socket.write(encodeLine(obj)); },
    close() {
      alive = false;
      clearTimeout(reconnectTimer);
      if (socket) socket.destroy();
      if (registered) hub.removeLink(linkKey);
      done();
    },
  };

  const parse = createLineParser(
    (msg) => hub.onMessage(linkKey, msg),
    (raw) => hub.onRaw(linkKey, raw),
  );

  function open() {
    if (!alive) return;
    socket = net.createConnection({ host, port }, () => {
      hub.addLink(linkKey, link, {
        transport: 'tcp', address: `${host}:${port}`,
        name: meta.name || `${host}:${port}`, role: meta.role, fw: meta.fw,
      });
      registered = true;
      link.send({ type: MSG.PING });
      link.send({ type: MSG.GET_CONFIG });
    });

    socket.setEncoding('utf8');
    socket.on('data', parse);
    socket.on('error', () => {});   // handled in 'close' (avoid per-retry log spam)
    socket.on('close', () => {
      if (registered) { hub.removeLink(linkKey); registered = false; }
      if (alive && retry) {
        reconnectTimer = setTimeout(open, 2000);   // manual devices: keep trying
      } else {
        if (!registered) hub.log('debug', `no device at ${host}:${port}`);
        done();   // discovered/refused: give up; next announce re-triggers
      }
    });
  }

  open();
  return linkKey;
}
