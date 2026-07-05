/**
 * Timestamped TCP tap — localises latency in the device→hub path.
 *
 * Connects to a device's line-JSON TCP server (Wokwi forward, real board, or
 * the simulator) and prints the INTER-ARRIVAL GAP for every line. Run it with
 * the hub stopped (firmware accepts a single client).
 *
 *   node scripts/tcp-tap.js localhost 3333
 *
 * Reading the output:
 *   - Gaps steady near your sampleMs (e.g. ~100-1000ms)  → firmware/Wokwi fine;
 *     any lag you see in the UI is downstream (hub/UI) — tell me, that's a bug.
 *   - Gaps erratic (100ms … then 30000-60000ms … then a burst of 0ms lines)
 *     → the delay is UPSTREAM of the hub: Wokwi sim throttling (unfocused panel)
 *     or gateway TCP batching. Keep the Wokwi panel focused and re-test.
 */

import net from 'node:net';

const host = process.argv[2] || 'localhost';
const port = parseInt(process.argv[3] || '3333');

let last = Date.now();
let count = 0;
let buf = '';

const s = net.connect(port, host, () => {
  console.log(`tapped ${host}:${port} — Ctrl-C to stop\n`);
  last = Date.now();
});
s.setEncoding('utf8');

s.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const now = Date.now();
    const gap = now - last;
    last = now;
    count++;
    const t = new Date(now).toISOString().slice(11, 23);
    const tag = /telemetry|"dist/.test(line) ? 'TELEM' : line.slice(0, 20);
    const flag = gap > 3000 ? '  <== BIG GAP' : (gap < 20 ? '  <== burst' : '');
    console.log(`${t}  +${String(gap).padStart(6)}ms  #${count}  ${tag}${flag}`);
  }
});

s.on('error', (e) => console.log('error:', e.code, '(is Wokwi/the device running? is the hub still holding the port?)'));
s.on('close', () => console.log('\nclosed.'));
