/* AquaMind Debug Hub — browser client (SSE + fetch, no dependencies). */

const state = new Map();     // deviceId -> { dev, distHist, tempHist, el, refs }
const MAXPTS = 80;

const $ = (id) => document.getElementById(id);
const api = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// ---------------------------------------------------------------------------
// SSE connection to the hub
// ---------------------------------------------------------------------------
function connect() {
  const es = new EventSource('/events');
  es.onopen = () => { $('hubDot').classList.add('on'); $('hubStatus').textContent = 'connected'; };
  es.onerror = () => { $('hubDot').classList.remove('on'); $('hubStatus').textContent = 'reconnecting…'; };
  es.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.kind === 'snapshot') { state.clear(); $('devices').innerHTML = ''; m.devices.forEach(upsertDevice); refreshEmpty(); }
    else if (m.kind === 'device') { upsertDevice(m.device); refreshEmpty(); }
    else if (m.kind === 'removed') { removeDevice(m.id); refreshEmpty(); }
    else if (m.kind === 'ports') renderPorts(m.ports);
    else if (m.kind === 'log') logLine(m.entry);
  };
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
function upsertDevice(dev) {
  // Key on the stable linkKey — `dev.id` can change when `announce` arrives,
  // which would otherwise spawn a duplicate card.
  let s = state.get(dev.key);
  if (!s) { s = { dev, distHist: [], tempHist: [], el: null, refs: {} }; state.set(dev.key, s); buildCard(s); }
  s.dev = dev;
  // record history
  const t = dev.telemetry || {};
  if (typeof t.distCm === 'number') pushPt(s.distHist, t.distCm);
  if (typeof t.tempC === 'number') pushPt(s.tempHist, t.tempC);
  renderCard(s);
}

function removeDevice(idOrKey) {
  // Accept either the stable key or the display id (the 'removed' event sends id).
  let key = state.has(idOrKey) ? idOrKey : null;
  if (!key) for (const [k, s] of state) if (s.dev.id === idOrKey) { key = k; break; }
  const s = key && state.get(key);
  if (s) { s.el.remove(); state.delete(key); }
}
function refreshEmpty() { $('empty').style.display = state.size ? 'none' : 'block'; $('devCount').textContent = state.size ? `(${state.size})` : ''; }

function buildCard(s) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="card-head">
      <span class="dot"></span>
      <span class="name"></span>
      <span class="badge role"></span>
      <span class="spacer"></span>
      <span class="badge tp"></span>
    </div>
    <div class="metrics">
      <div class="metric"><div class="k">Distance</div><div class="v md-dist">–</div></div>
      <div class="metric"><div class="k">Temp</div><div class="v md-temp">–</div></div>
      <div class="metric"><div class="k">Signal</div><div class="v"><span class="pill md-sig">–</span></div></div>
      <div class="metric"><div class="k">Dropouts</div><div class="v md-drops">–</div></div>
    </div>
    <canvas class="ch-dist"></canvas>
    <div class="cmds"></div>
    <div class="cfg">
      <textarea class="cfg-text" spellcheck="false" placeholder="{ config }"></textarea>
      <button class="tiny cfg-save" style="margin-top:6px">Save config</button>
    </div>
    <div class="foot"><span class="ft-addr"></span><span class="spacer"></span><span class="ft-seen"></span></div>`;
  $('devices').appendChild(el);
  s.el = el;
  s.refs = {
    dot: el.querySelector('.card-head .dot'), name: el.querySelector('.name'),
    role: el.querySelector('.role'), tp: el.querySelector('.tp'),
    dist: el.querySelector('.md-dist'), temp: el.querySelector('.md-temp'),
    sig: el.querySelector('.md-sig'), drops: el.querySelector('.md-drops'),
    canvas: el.querySelector('.ch-dist'), cmds: el.querySelector('.cmds'),
    cfgText: el.querySelector('.cfg-text'), cfgSave: el.querySelector('.cfg-save'),
    addr: el.querySelector('.ft-addr'), seen: el.querySelector('.ft-seen'),
  };
  buildCommands(s);
  s.refs.cfgSave.onclick = () => {
    try { const cfg = JSON.parse(s.refs.cfgText.value); api('/api/setConfig', { id: s.dev.id, config: cfg }); }
    catch { alert('Config is not valid JSON'); }
  };
}

function buildCommands(s) {
  const c = s.refs.cmds;
  const btn = (label, fn) => { const b = document.createElement('button'); b.className = 'tiny'; b.textContent = label; b.onclick = fn; c.appendChild(b); };
  const send = (cmd, args) => api('/api/command', { id: s.dev.id, cmd, args });
  btn('Self-test', () => send('selftest'));
  btn('Mode: live', () => send('setMode', { mode: 'live' }));
  btn('Mode: test', () => send('setMode', { mode: 'test' }));
  btn('Reboot', () => send('reboot'));
  const isSim = (s.dev.fw || '').includes('sim');
  if (isSim) {
    btn('Inject dropouts', () => send('fault', { type: 'dropouts' }));
    btn('Inject noise', () => send('fault', { type: 'noise' }));
    btn('Disconnect sensor', () => send('fault', { type: 'disconnect' }));
    btn('Clear fault', () => send('fault', { type: 'none' }));
  }
  const disc = document.createElement('button'); disc.className = 'tiny'; disc.textContent = 'Disconnect';
  disc.onclick = () => api('/api/disconnect', { id: s.dev.id }); c.appendChild(disc);
}

function renderCard(s) {
  const d = s.dev, r = s.refs, t = d.telemetry || {};
  s.el.classList.toggle('offline', !d.online);
  r.dot.classList.toggle('on', d.online);
  r.name.textContent = d.name;
  r.role.textContent = d.role; r.role.className = 'badge role ' + d.role;
  r.tp.textContent = d.transport + (d.address ? ' · ' + d.address : '');
  r.dist.innerHTML = t.distCm == null ? (d.role === 'control' ? '—' : 'NO ECHO') : `${t.distCm.toFixed(1)}<span class="u"> cm</span>`;
  r.temp.innerHTML = t.tempC == null ? '—' : `${t.tempC.toFixed(1)}<span class="u"> °C</span>`;
  r.drops.innerHTML = (t.drops == null) ? '—' : `${t.drops}<span class="u"> /${(t.drops || 0) + (t.valid || 0)}</span>`;
  const v = verdict(t);
  r.sig.textContent = v.txt; r.sig.className = 'pill md-sig ' + v.cls; r.sig.title = v.why;
  drawChart(r.canvas, s.distHist, '#3b82f6');
  // don't clobber the textarea while the user is editing it
  if (document.activeElement !== r.cfgText) r.cfgText.value = JSON.stringify(d.config || {}, null, 0).replace(/,/g, ', ');
  r.addr.textContent = d.fw ? 'fw ' + d.fw : '';
  const secs = Math.round((Date.now() - d.lastSeen) / 1000);
  r.seen.textContent = d.online ? (t.rssi != null ? `${t.rssi} dBm` : 'online') : `seen ${secs}s ago`;
}

function verdict(t) {
  if (t.valid == null && t.distCm == null && t.tempC != null) return { cls: '', txt: 'n/a', why: 'no ultrasonic on this node' };
  if (t.valid === 0) return { cls: 'bad', txt: 'NO SIGNAL', why: 'no echoes — check 5V power & wiring' };
  const total = (t.drops || 0) + (t.valid || 0);
  const jit = (t.minCm != null && t.maxCm != null) ? t.maxCm - t.minCm : 0;
  if (total && t.drops > total / 3) return { cls: 'bad', txt: 'POOR', why: 'many dropouts — weak power or long/noisy cable' };
  if (t.drops > 0 || jit > 3) return { cls: 'warn', txt: 'NOISY', why: 'some dropouts/jitter — mounting or reflections' };
  if (t.valid > 0) return { cls: 'good', txt: 'STABLE', why: 'clean, consistent readings' };
  return { cls: '', txt: '–', why: 'waiting' };
}

// ---------------------------------------------------------------------------
// Chart (dependency-free)
// ---------------------------------------------------------------------------
function pushPt(arr, v) { arr.push(v); if (arr.length > MAXPTS) arr.shift(); }
function drawChart(c, data, color) {
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  if (data.length < 2) { ctx.fillStyle = '#586069'; ctx.font = '11px system-ui'; ctx.fillText('waiting…', 8, h / 2); return; }
  let lo = Math.min(...data), hi = Math.max(...data);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pad = 6;
  const X = (i) => pad + (w - 2 * pad) * i / (MAXPTS - 1);
  const Y = (val) => (h - pad) - (h - 2 * pad) * (val - lo) / (hi - lo);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  const off = MAXPTS - data.length;
  data.forEach((val, i) => { const x = X(i + off), y = Y(val); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  const lx = X(MAXPTS - 1), ly = Y(data[data.length - 1]);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, 7); ctx.fill();
}

// ---------------------------------------------------------------------------
// Serial ports
// ---------------------------------------------------------------------------
function renderPorts(ports) {
  const box = $('ports'); box.innerHTML = '';
  $('serialNote').textContent = ports.length ? '' : 'No ports (or serialport not installed — see README).';
  ports.forEach((p) => {
    const row = document.createElement('div'); row.className = 'port';
    row.innerHTML = `<span class="path" title="${p.manufacturer}">${p.path}</span>`;
    const open = document.createElement('button'); open.className = 'tiny primary'; open.textContent = p.guess ? 'Open (ESP?)' : 'Open';
    open.onclick = () => api('/api/serial/open', { path: p.path, baud: parseInt($('baud').value) });
    const close = document.createElement('button'); close.className = 'tiny'; close.textContent = 'Close';
    close.onclick = () => api('/api/serial/close', { path: p.path });
    row.append(open, close); box.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Log console
// ---------------------------------------------------------------------------
function logLine(e) {
  const box = $('log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const time = new Date(e.ts).toLocaleTimeString();
  const div = document.createElement('div'); div.className = 'l';
  div.innerHTML = `<span class="time">${time}</span> <span class="src">${esc(e.source)}</span> <span class="${e.level}">${esc(e.msg)}</span>`;
  box.appendChild(div);
  while (box.childElementCount > 500) box.firstChild.remove();
  if ($('autoscroll').checked && atBottom) box.scrollTop = box.scrollHeight;
}
function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
$('simStart').onclick = () => api('/api/sim/start', { count: parseInt($('simCount').value) });
$('simStop').onclick = () => api('/api/sim/stop');
$('netConnect').onclick = () => { const host = $('netHost').value.trim(); if (host) api('/api/connect', { host, port: parseInt($('netPort').value) }); };
$('portsRefresh').onclick = async () => { const r = await fetch('/api/ports'); renderPorts((await r.json()).ports); };
$('clearLog').onclick = () => { $('log').innerHTML = ''; };
window.addEventListener('resize', () => state.forEach((s) => drawChart(s.refs.canvas, s.distHist, '#3b82f6')));

connect();
