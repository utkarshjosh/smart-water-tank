/**
 * Discovery — listens for UDP `announce` broadcasts from devices on the LAN.
 * A device (or the simulator) broadcasts a small JSON packet on DISCOVERY_PORT:
 *   { magic:'AQUAMIND_HUB', id, role, name, fw, tcpPort }
 * The hub auto-connects to any new device it hasn't seen. This is what makes it
 * "just work on the local network" — plug in an ESP32 and it appears.
 */

import dgram from 'node:dgram';
import { DISCOVERY_PORT, DISCOVERY_MAGIC } from './protocol.js';

export function startDiscovery(hub, onDevice) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  sock.on('message', (buf, rinfo) => {
    let ann;
    try { ann = JSON.parse(buf.toString()); } catch { return; }
    if (ann.magic !== DISCOVERY_MAGIC) return;
    const host = rinfo.address;
    const port = ann.tcpPort || 3333;
    const linkKey = `tcp:${host}:${port}`;
    if (hub.links.has(linkKey)) return;  // already connected
    hub.log('info', `discovered ${ann.name || ann.id} at ${host}:${port}`);
    onDevice(host, port, { name: ann.name, role: ann.role, fw: ann.fw });
  });

  sock.on('error', (e) => hub.log('warn', `discovery: ${e.message}`));
  sock.bind(DISCOVERY_PORT, () => {
    try { sock.setBroadcast(true); } catch {}
    hub.log('info', `discovery listening on udp/${DISCOVERY_PORT}`);
  });

  return { close: () => sock.close() };
}
