/**
 * Serial transport — the "serial port manager".
 * Uses the OPTIONAL `serialport` dependency. If it isn't installed the hub
 * still runs fully (TCP + simulator); serial features just report unavailable.
 * This lets you debug the ESP8266 you already own over USB in the same UI.
 */

let SerialPortMod = null;
let ReadlineMod = null;

async function loadSerial() {
  if (SerialPortMod) return true;
  try {
    SerialPortMod = (await import('serialport')).SerialPort;
    ReadlineMod = (await import('@serialport/parser-readline')).ReadlineParser;
    return true;
  } catch {
    return false;
  }
}

export async function serialAvailable() {
  return await loadSerial();
}

/** List available serial ports (empty array if serialport not installed). */
export async function listPorts() {
  if (!(await loadSerial())) return [];
  try {
    const ports = await SerialPortMod.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || '',
      // ESP boards commonly appear as CP210x (Silabs) or CH340 (wch)
      guess: /wch|silabs|cp210|ch340|usb|slab/i.test(`${p.manufacturer} ${p.vendorId} ${p.productId}`) ? 'esp?' : '',
    }));
  } catch {
    return [];
  }
}

export async function openPort(hub, path, baud = 115200) {
  if (!(await loadSerial())) { hub.log('error', 'serialport not installed — run: npm i serialport @serialport/parser-readline'); return null; }
  const linkKey = `serial:${path}`;
  if (hub.links.has(linkKey)) { hub.log('warn', `already open: ${path}`); return linkKey; }

  const { createLineParser, encodeLine, MSG } = await import('../protocol.js');
  const port = new SerialPortMod({ path, baudRate: baud });
  const parser = port.pipe(new ReadlineMod({ delimiter: '\n' }));

  const link = {
    send(obj) { if (port.isOpen) port.write(encodeLine(obj)); },
    close() { if (port.isOpen) port.close(); },
  };
  const parse = createLineParser(
    (msg) => hub.onMessage(linkKey, msg),
    (raw) => hub.onRaw(linkKey, raw),
  );

  port.on('open', () => {
    hub.addLink(linkKey, link, { transport: 'serial', address: path, name: path.split('/').pop() });
    // Nudge the sensor_sanity sketch into JSON telemetry mode.
    setTimeout(() => port.write('j\n'), 300);
    link.send({ type: MSG.GET_CONFIG });
  });
  parser.on('data', parse);
  port.on('error', (e) => hub.log('error', `serial ${path}: ${e.message}`));
  port.on('close', () => hub.removeLink(linkKey));

  return linkKey;
}

export function closePort(hub, path) {
  hub.links.get(`serial:${path}`)?.close();
}
