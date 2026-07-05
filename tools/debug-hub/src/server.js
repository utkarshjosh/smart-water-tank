/**
 * Web server — serves the local UI and bridges the hub to the browser.
 *   GET  /events          Server-Sent Events stream (snapshot, then live updates)
 *   POST /api/command     { id, cmd, args }
 *   POST /api/setConfig   { id, config }
 *   POST /api/connect     { host, port }        connect to a device over TCP/LAN
 *   POST /api/disconnect  { id }
 *   POST /api/serial/open { path, baud }
 *   POST /api/serial/close{ path }
 *   GET  /api/ports       list serial ports
 *   POST /api/sim/start   { count }
 *   POST /api/sim/stop
 * No WebSocket lib, no framework — Node built-ins only (SSE + fetch).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MSG, cmd } from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

export function startServer(hub, actions, httpPort) {
  /** @type {Set<http.ServerResponse>} */
  const sseClients = new Set();

  function push(kind, payload) {
    const line = `data: ${JSON.stringify({ kind, ...payload })}\n\n`;
    for (const res of sseClients) res.write(line);
  }

  hub.on('device', (d) => push('device', { device: publicDevice(d) }));
  hub.on('removed', (id) => push('removed', { id }));
  hub.on('log', (entry) => push('log', { entry }));

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return {}; }
  }
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    // --- SSE stream ---
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      res.write(`data: ${JSON.stringify({ kind: 'snapshot', devices: hub.snapshot().devices.map(publicDevice) })}\n\n`);
      actions.listPorts().then((ports) => res.write(`data: ${JSON.stringify({ kind: 'ports', ports })}\n\n`));
      sseClients.add(res);
      const ka = setInterval(() => res.write(': keepalive\n\n'), 15000);
      req.on('close', () => { clearInterval(ka); sseClients.delete(res); });
      return;
    }

    // --- REST API ---
    if (p.startsWith('/api/')) {
      try {
        if (p === '/api/ports' && req.method === 'GET') return json(res, 200, { ports: await actions.listPorts() });
        const body = await readBody(req);
        switch (p) {
          case '/api/command':     hub.sendToDevice(body.id, cmd(body.cmd, body.args || {})); return json(res, 200, { ok: true });
          case '/api/setConfig':   hub.sendToDevice(body.id, { type: MSG.SET_CONFIG, config: body.config || {} }); return json(res, 200, { ok: true });
          case '/api/connect':     actions.connectTcp(body.host, parseInt(body.port)); return json(res, 200, { ok: true });
          case '/api/disconnect':  actions.disconnect(body.id); return json(res, 200, { ok: true });
          case '/api/serial/open': await actions.openPort(body.path, parseInt(body.baud) || 115200); return json(res, 200, { ok: true });
          case '/api/serial/close':actions.closePort(body.path); return json(res, 200, { ok: true });
          case '/api/sim/start':   actions.startSim(parseInt(body.count) || 2); return json(res, 200, { ok: true });
          case '/api/sim/stop':    actions.stopSim(); return json(res, 200, { ok: true });
          default: return json(res, 404, { error: 'unknown endpoint' });
        }
      } catch (e) { return json(res, 500, { error: e.message }); }
    }

    // --- static files ---
    let file = p === '/' ? 'index.html' : p.slice(1);
    const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  server.listen(httpPort, () => {});
  return { server, refreshPorts: async () => push('ports', { ports: await actions.listPorts() }) };
}

/** Trim internal fields before sending a device to the UI. */
function publicDevice(d) {
  return {
    // `key` is the stable per-connection identity (never changes); the UI keys
    // cards on it. `id` is the display id and MAY change once `announce` lands.
    key: d.linkKey,
    id: d.id, name: d.name, role: d.role, transport: d.transport, address: d.address,
    fw: d.fw, caps: d.caps, online: d.online, lastSeen: d.lastSeen,
    telemetry: d.telemetry, config: d.config, rssi: d.rssi,
  };
}
