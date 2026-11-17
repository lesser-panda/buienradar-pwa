'use strict';
/* Rain – a small PWA. Data: Buienradar (feed + 2-hour rain text) and Open-Meteo (longer rain, layers, search). */

const FEED = 'https://data.buienradar.nl/2.0/feed/json';
const RAINTEXT = 'https://gpsgadget.buienradar.nl/data/raintext';
const OM = 'https://api.open-meteo.com/v1/forecast';
const OM_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OM_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const HOUR = 3600e3, STALE = 10 * 60e3;
const $ = id => document.getElementById(id);
const f1 = (v, n = 1) => v.toFixed(n);

/* ---------- state ---------- */
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const state = {
  place: store.get('place') || { name: 'Haarlem', lat: 52.3874, lon: 4.6462 },
  layer: 'rain', span: 'H2', rain2h: null, outside: false,
  longJson: null, longAt: 0, layerJson: null, layerAt: 0, pollenJson: null, pollenAt: 0,
  gen: 0, loading: false,
};
const SPANS = { H2: { label: '2h', bars: 24, step: 5, hours: 2 }, H6: { label: '6h', bars: 24, step: 15, hours: 6 }, H12: { label: '12h', bars: 48, step: 15, hours: 12 }, H24: { label: '24h', bars: 24, step: 60, hours: 24 }, H48: { label: '48h', bars: 48, step: 60, hours: 48 } };
const LAYERS = {
  rain: { title: 'Rain' }, temp: { title: 'Temperature', key: 'temperature_2m', color: '#ff8a5c' }, feel: { title: 'Feels like', key: 'apparent_temperature', color: '#ffb74d' },
  humidity: { title: 'Humidity', key: 'relative_humidity_2m', color: '#64b5f6' }, wind: { title: 'Wind', key: 'wind_speed_10m', color: '#4db6ac' },
  uv: { title: 'UV index', key: 'uv_index', color: '#ba68c8' }, sun: { title: 'Sunshine', key: 'sunshine_duration', color: '#ffd54f' }, pollen: { title: 'Pollen', color: '#81c784' },
};

/* ---------- network ---------- */
async function getText(url, ms = 12000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
const getJson = async (u, ms) => JSON.parse(await getText(u, ms));
const ll = p => `latitude=${p.lat.toFixed(2)}&longitude=${p.lon.toFixed(2)}`;

/* ---------- Dutch -> English for the feed's small vocabulary ---------- */
const PHRASES = [['mix van opklaringen en middelbare of lage bewolking', 'mix of sunny spells and cloud'], ['mix van opklaringen en hoge bewolking', 'mix of sunny spells and high cloud'], ['(zonnig/helder)', ''], ['vrijwel onbewolkt', 'mostly clear'], ['onbewolkt', 'clear'], ['afwisselend bewolkt', 'partly cloudy'], ['(mogelijk)', '(possibly)'], ['mogelijk', 'possibly'], ['wat', 'some'], ['enkele', 'a few'], ['af en toe', 'at times'], ['sneeuwbuien', 'snow showers'], ['natte sneeuw', 'sleet'], ['onweersbuien', 'thunderstorms'], ['zwaar bewolkt', 'overcast'], ['half bewolkt', 'partly cloudy'], ['licht bewolkt', 'mostly clear'], ['geheel bewolkt', 'overcast'], ['kans op', 'chance of'], ['mix van', 'mix of'], ['lichte regen', 'light rain'], ['motregen', 'drizzle'], ['opklaringen', 'sunny spells'], ['bewolking', 'cloud'], ['bewolkt', 'cloudy'], ['regenbuien', 'rain showers'], ['regenbui', 'rain shower'], ['buien', 'showers'], ['bui', 'shower'], ['regen', 'rain'], ['zonnig', 'sunny'], ['helder', 'clear'], ['onweer', 'thunder'], ['sneeuw', 'snow'], ['hagel', 'hail'], ['mist', 'fog'], ['nevel', 'haze'], ['droog', 'dry'], ['winderig', 'windy'], ['middelbare', 'mid-level'], ['lichte', 'light'], ['zware', 'heavy'], ['en', 'and'], ['of', 'or'], ['met', 'with']];
const PTABLE = new Map(PHRASES);
const W = "\\p{L}\\p{N}'’\\-";
const PRE = new RegExp(`(?<![${W}])(${[...PTABLE.keys()].sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|')})(?![${W}])`, 'giu');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const weatherEn = d => cap((d || '').replace(PRE, m => PTABLE.get(m.toLowerCase())).replace(/\s+/g, ' ').trim());
const windEn = d => { const c = (d || '').trim().toUpperCase(); return /^[NOZW]{1,3}$/.test(c) ? [...c].map(x => x === 'O' ? 'E' : x === 'Z' ? 'S' : x).join('') : (d || '').trim(); };

/* ---------- time ---------- */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = n => String(n).padStart(2, '0');
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function hm(ms, ref = Date.now()) { const d = new Date(ms), t = `${pad(d.getHours())}:${pad(d.getMinutes())}`; return sameDay(d, new Date(ref)) ? t : `${DAYS[d.getDay()]} ${t}`; }

/* ---------- rain ---------- */
const mmOf = raw => raw <= 0 ? 0 : Math.pow(10, (raw - 109) / 32);
function parseRain(text) {
  if (text.includes('inside the Netherlands or Belgium')) throw Object.assign(new Error('outside'), { outside: true });
  return text.split(/\r?\n/).map(l => l.trim().split('|')).filter(p => p.length === 2 && /^\d+$/.test(p[0])).map(p => ({ time: p[1], raw: +p[0] }));
}
function toBars(slots, now = new Date()) {
  if (!slots.length) return [];
  const [h, m] = slots[0].time.split(':').map(Number);
  const t = new Date(now); t.setHours(h, m, 0, 0);
  if (t - now < -12 * HOUR) t.setDate(t.getDate() + 1); else if (t - now > 12 * HOUR) t.setDate(t.getDate() - 1);
  return slots.map((s, i) => ({ start: t.getTime() + i * 5 * 60e3, mm: mmOf(s.raw) }));
}
function barsFromOM(json, span, now) {
  const sp = SPANS[span], blk = json[sp.step === 15 ? 'minutely_15' : 'hourly'];
  if (!blk || !blk.time) return [];
  const stepMs = sp.step * 60e3, per = 60 / sp.step, out = [];
  for (let i = 0; i < blk.time.length; i++) {
    const start = blk.time[i] * 1000 - stepMs;
    if (start + stepMs <= now) continue;
    out.push({ start, mm: (blk.precipitation[i] || 0) * per });
    if (out.length === sp.bars) break;
  }
  return out;
}
const wet = mm => mm >= 0.1;
const amount = mm => mm < 0.1 ? 'dry' : mm < 1 ? `${f1(mm, 2)} mm/h` : `${f1(mm)} mm/h`;
const strength = mm => mm < 0.1 ? '' : mm < 2.5 ? 'light' : mm < 7.5 ? 'moderate' : 'heavy';
function describeRain(bars, step) {
  if (!bars.length) return ['No rain data', 'No forecast for this location'];
  const end = hm(bars[bars.length - 1].start + step * 60e3), at = b => hm(b.start);
  const fw = bars.findIndex(b => wet(b.mm));
  if (fw < 0) return ['No rain expected', `Dry until at least ${end}`];
  const peak = bars.reduce((a, b) => b.mm > a.mm ? b : a);
  const pt = `${strength(peak.mm)}, peak ${f1(peak.mm)} mm/h at ${at(peak)}`;
  if (fw === 0) { const d = bars.findIndex(b => !wet(b.mm)); return [d < 0 ? `Raining through ${end}` : `Raining until ${at(bars[d])}`, cap(pt)]; }
  return [`Dry until ${at(bars[fw])}`, `Then ${pt}`];
}

/* ---------- layers (hourly lines from Open-Meteo) ---------- */
const POLLENS = [['alder_pollen', 'Alder'], ['birch_pollen', 'Birch'], ['grass_pollen', 'Grass'], ['mugwort_pollen', 'Mugwort'], ['olive_pollen', 'Olive'], ['ragweed_pollen', 'Ragweed']];
const windowPts = (all, now, hours) => all.filter(p => p.ms >= Math.floor(now / HOUR) * HOUR).slice(0, hours + 1);
function parseLayer(json, layer, now, hours) {
  const h = json.hourly; if (!h || !h.time) return [];
  const vals = h[LAYERS[layer].key]; if (!vals) return [];
  const all = [];
  h.time.forEach((t, i) => { const v = vals[i]; if (v == null) return; all.push(layer === 'sun' ? { ms: t * 1000 - HOUR, v: v / 60 } : { ms: t * 1000, v }); });
  return windowPts(all, now, hours);
}
function parsePollen(json, now, hours) {
  const h = json.hourly; if (!h || !h.time) return [];
  const all = h.time.map((t, i) => {
    let total = 0, top = 0, note = null;
    for (const [k, n] of POLLENS) { const v = h[k] ? (h[k][i] || 0) : 0; total += v; if (v > top) { top = v; note = n; } }
    return { ms: t * 1000, v: total, note };
  });
  return windowPts(all, now, hours);
}
function ptAt(pts, ms) {
  if (!pts.length) return 0; if (ms <= pts[0].ms) return pts[0].v; const l = pts[pts.length - 1]; if (ms >= l.ms) return l.v;
  let i = 0; while (i < pts.length - 2 && pts[i + 1].ms <= ms) i++;
  const a = pts[i], b = pts[i + 1]; return a.v + (b.v - a.v) * (ms - a.ms) / (b.ms - a.ms);
}
const noteAt = (pts, ms) => pts.reduce((a, b) => Math.abs(b.ms - ms) < Math.abs(a.ms - ms) ? b : a, pts[0]).note;
const bft = k => [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118].findIndex(x => k < x) < 0 ? 12 : [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118].findIndex(x => k < x);
const uvWord = v => v < .5 ? 'none' : v < 3 ? 'low' : v < 6 ? 'moderate' : v < 8 ? 'high' : v < 11 ? 'very high' : 'extreme';
const pollenWord = v => v < .5 ? 'none' : v < 20 ? 'low' : v < 90 ? 'moderate' : v < 200 ? 'high' : 'very high';
function fmtVal(layer, v, note) {
  switch (layer) {
    case 'temp': case 'feel': return `${f1(v)} °C`;
    case 'humidity': return `${Math.round(v)} %`;
    case 'wind': return `${Math.round(v)} km/h · ${bft(v)} Bft`;
    case 'uv': return `UV ${f1(v)} · ${uvWord(v)}`;
    case 'sun': return `${Math.round(v)} min of sun`;
    case 'pollen': return v < .5 ? 'no pollen' : `${Math.round(v)} grains/m³${note ? ' · ' + note : ''} · ${pollenWord(v)}`;
  }
  return '';
}
const axisFmt = (layer, v) => layer === 'temp' || layer === 'feel' ? `${Math.round(v)}°` : layer === 'humidity' ? `${Math.round(v)}%` : layer === 'sun' ? `${Math.round(v)} min` : layer === 'wind' ? `${Math.round(v)} km/h` : `${Math.round(v)}`;
function yRange(layer, pts) {
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  switch (layer) {
    case 'temp': case 'feel': { let a = Math.floor(lo - 1), b = Math.ceil(hi + 1); if (b - a < 6) { const m = Math.floor((a + b) / 2 - 3); a = m; b = m + 6; } return [a, b]; }
    case 'humidity': return [0, 100];
    case 'sun': return [0, 60];
    case 'wind': return [0, Math.max(30, Math.ceil(hi / 10) * 10)];
    case 'uv': return [0, Math.max(6, Math.ceil(hi + 1))];
    default: return [0, Math.max(50, Math.ceil(hi * 1.2 / 10) * 10)];
  }
}
function describeLayer(layer, pts, now, hours) {
  if (!pts.length) return ['No data', 'Could not load this layer'];
  const cur = ptAt(pts, now), hi = pts.reduce((a, b) => b.v > a.v ? b : a), lo = pts.reduce((a, b) => b.v < a.v ? b : a), t = p => hm(p.ms, now);
  switch (layer) {
    case 'temp': return [`${Math.round(cur)}°`, `High ${Math.round(hi.v)}° at ${t(hi)}  ·  Low ${Math.round(lo.v)}° at ${t(lo)}`];
    case 'feel': return [`Feels like ${Math.round(cur)}°`, `High ${Math.round(hi.v)}° at ${t(hi)}  ·  Low ${Math.round(lo.v)}° at ${t(lo)}`];
    case 'humidity': return [`${Math.round(cur)}% humidity`, `Between ${Math.round(lo.v)}% and ${Math.round(hi.v)}% in the next ${hours} hours`];
    case 'wind': return [`${Math.round(cur)} km/h · ${bft(cur)} Bft`, `Strongest: ${Math.round(hi.v)} km/h (${bft(hi.v)} Bft) at ${t(hi)}`];
    case 'uv': return hi.v < .5 ? ['No UV expected', `Nothing in the next ${hours} hours`] : [`UV ${f1(cur)} · ${uvWord(cur)}`, `Peak UV ${f1(hi.v)} (${uvWord(hi.v)}) at ${t(hi)}`];
    case 'sun': { const total = pts.slice(0, hours).reduce((s, p) => s + p.v, 0) / 60; return total < .1 ? ['No sunshine expected', `Nothing in the next ${hours} hours`] : [`${f1(total)} h of sun`, `In the next ${hours} hours; the most around ${t(hi)}`]; }
    case 'pollen': return hi.v < .5 ? ['No pollen expected', `Nothing in the next ${hours} hours`] : [`${cap(pollenWord(Math.max(cur, 0)))} pollen`, `Peak ${Math.round(hi.v)} grains/m³ at ${t(hi)}` + (hi.note ? ` (${hi.note})` : '')];
  }
  return ['', ''];
}

/* ---------- chart (canvas, drag to read) ---------- */
const chart = (() => {
  const cv = $('chart'), ctx = cv.getContext('2d');
  const m = { bars: [], step: 5, pts: [], layer: 'rain', sel: null, clearT: 0, w: 0, h: 0, dpr: 1 };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function size() {
    m.dpr = window.devicePixelRatio || 1; const r = cv.getBoundingClientRect();
    m.w = r.width; m.h = r.height; cv.width = Math.round(r.width * m.dpr); cv.height = Math.round(r.height * m.dpr); draw();
  }
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  function frame() { const rp = m.w < 380 ? 62 : 78; return { left: 0, right: m.w - rp, top: 40, bottom: m.h - 22 }; }
  const hasData = () => m.layer === 'rain' ? m.bars.length > 0 : m.pts.length > 1;
  function xLabels(f, count, textAt, xAt) {
    ctx.fillStyle = css('--muted'); ctx.font = '12px system-ui,sans-serif'; ctx.textBaseline = 'alphabetic';
    let prev = -1e9;
    for (let k = 0; k < count; k++) {
      const text = textAt(k), tw = ctx.measureText(text).width;
      const x = Math.max(f.left, Math.min(xAt(k) - tw / 2, f.right - tw));
      if (x < prev + 10) continue; ctx.fillText(text, x, m.h - 5); prev = x + tw;
    }
  }
  function bubble(x, line1, line2, f) {
    ctx.font = '600 14px system-ui,sans-serif'; const w1 = ctx.measureText(line1).width;
    ctx.font = '12px system-ui,sans-serif'; const w2 = line2 ? ctx.measureText(line2).width : 0;
    const w = Math.max(w1, w2) + 22, h = line2 ? 44 : 30, bx = Math.max(2, Math.min(x - w / 2, m.w - w - 2)), by = 2;
    rr(bx, by, w, h, 10); ctx.fillStyle = 'rgba(11,18,32,.96)'; ctx.fill(); ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = css('--white'); ctx.font = '600 14px system-ui,sans-serif'; ctx.fillText(line1, bx + w / 2, by + 19);
    if (line2) { ctx.fillStyle = css('--muted'); ctx.font = '12px system-ui,sans-serif'; ctx.fillText(line2, bx + w / 2, by + 36); }
    ctx.textAlign = 'left';
  }
  function drawBars(f) {
    const n = m.bars.length, bw = (f.right - f.left) / n, gap = bw * .22, ch = f.bottom - f.top, MAX = 10;
    const y = mm => f.bottom - ch * Math.sqrt(Math.min(mm, MAX) / MAX);
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(143,160,192,.3)'; ctx.fillStyle = css('--muted'); ctx.font = '12px system-ui,sans-serif';
    [[2.5, '2.5 mm/h'], [7.5, '7.5']].forEach(([mm, t]) => { const gy = y(mm); ctx.beginPath(); ctx.moveTo(f.left, gy); ctx.lineTo(f.right, gy); ctx.stroke(); ctx.fillText(t, f.right + 6, gy + 4); });
    ctx.setLineDash([]);
    const selI = m.sel == null ? -1 : Math.min(n - 1, Math.max(0, Math.floor((m.sel - m.bars[0].start) / (m.step * 60e3))));
    m.bars.forEach((b, i) => {
      const x0 = f.left + i * bw + gap / 2, x1 = f.left + (i + 1) * bw - gap / 2;
      ctx.globalAlpha = selI < 0 || i === selI ? 1 : .4;
      if (wet(b.mm)) { ctx.fillStyle = b.mm < 2.5 ? '#4fc3f7' : b.mm < 7.5 ? '#7c8cff' : '#ff7043'; const t = Math.min(y(b.mm), f.bottom - 4); rr(x0, t, x1 - x0, f.bottom - t, 2); ctx.fill(); }
      else { ctx.fillStyle = '#2a3a5c'; ctx.fillRect(x0, f.bottom - 2, x1 - x0, 2); }
    });
    ctx.globalAlpha = 1;
    const marks = [...new Set([0, n >> 2, n >> 1, (3 * n) >> 2, n - 1])];
    xLabels(f, marks.length, k => marks[k] === 0 ? 'now' : hm(m.bars[marks[k]].start), k => f.left + (marks[k] + .5) * bw);
    if (selI >= 0) { const b = m.bars[selI], cx = f.left + (selI + .5) * bw; ctx.strokeStyle = 'rgba(242,246,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, 40); ctx.lineTo(cx, f.bottom); ctx.stroke(); bubble(cx, hm(Math.max(b.start, m.sel)), `${amount(b.mm)}${strength(b.mm) ? ' · ' + strength(b.mm) : ''}`, f); }
  }
  function drawLine(f) {
    const pts = m.pts, [lo, hi] = yRange(m.layer, pts), t0 = pts[0].ms, t1 = pts[pts.length - 1].ms, col = LAYERS[m.layer].color;
    const X = ms => f.left + (ms - t0) / (t1 - t0) * (f.right - f.left), Y = v => f.bottom - (v - lo) / (hi - lo) * (f.bottom - f.top);
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(143,160,192,.3)'; ctx.fillStyle = css('--muted'); ctx.font = '12px system-ui,sans-serif';
    [lo, (lo + hi) / 2, hi].forEach(v => { const gy = Y(v); ctx.beginPath(); ctx.moveTo(f.left, gy); ctx.lineTo(f.right, gy); ctx.stroke(); ctx.fillText(axisFmt(m.layer, v), f.right + 6, gy + 4); });
    ctx.setLineDash([]);
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p.ms), Y(p.v)) : ctx.moveTo(X(p.ms), Y(p.v)));
    ctx.lineTo(X(t1), f.bottom); ctx.lineTo(X(t0), f.bottom); ctx.closePath(); ctx.globalAlpha = .22; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p.ms), Y(p.v)) : ctx.moveTo(X(p.ms), Y(p.v))); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    const marks = [0, .25, .5, .75, 1];
    xLabels(f, marks.length, k => k === 0 ? 'now' : hm(t0 + marks[k] * (t1 - t0)), k => f.left + marks[k] * (f.right - f.left));
    if (m.sel != null) {
      const ms = Math.min(t1, Math.max(t0, m.sel)), v = ptAt(pts, ms), cx = X(ms);
      ctx.strokeStyle = 'rgba(242,246,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, 40); ctx.lineTo(cx, f.bottom); ctx.stroke();
      ctx.fillStyle = css('--white'); ctx.beginPath(); ctx.arc(cx, Y(v), 5, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
      bubble(cx, hm(ms), fmtVal(m.layer, v, m.layer === 'pollen' ? noteAt(pts, ms) : null), f);
    }
  }
  function draw() {
    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0); ctx.clearRect(0, 0, m.w, m.h);
    if (!hasData()) return; const f = frame();
    m.layer === 'rain' ? drawBars(f) : drawLine(f);
  }
  function timeAt(clientX) {
    const f = frame(), r = cv.getBoundingClientRect(), x = clientX - r.left, frac = Math.min(.99999, Math.max(0, (x - f.left) / (f.right - f.left)));
    if (m.layer === 'rain') { const t0 = m.bars[0].start, span = m.bars.length * m.step * 60e3; return t0 + frac * span; }
    const t0 = m.pts[0].ms, t1 = m.pts[m.pts.length - 1].ms; return t0 + frac * (t1 - t0);
  }
  let down = false, sx = 0, sy = 0, lastBucket = null;
  const select = e => { if (!hasData()) return; const ms = timeAt(e.clientX); m.sel = ms; draw(); const b = Math.floor(ms / HOUR); if (b !== lastBucket) { lastBucket = b; if (m.layer !== 'rain' && navigator.vibrate) navigator.vibrate(4); } };
  const clearSoon = ms => { clearTimeout(m.clearT); m.clearT = setTimeout(() => { m.sel = null; draw(); }, ms); };
  cv.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; clearTimeout(m.clearT); try { cv.setPointerCapture(e.pointerId); } catch {} select(e); });
  cv.addEventListener('pointermove', e => { if (down || e.pointerType === 'mouse') { clearTimeout(m.clearT); select(e); } });
  const up = e => { if (!down) return; down = false; clearSoon(e.pointerType === 'mouse' ? 400 : 2000); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { down = false; clearTimeout(m.clearT); m.sel = null; draw(); }); // the page took over for a vertical scroll
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) clearSoon(100); });
  new ResizeObserver(size).observe(cv); matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', draw);
  return { set(p) { Object.assign(m, p, { sel: null }); draw(); }, redraw: draw, clear() { m.sel = null; draw(); } };
})();

/* ---------- rendering ---------- */
function renderChart() {
  const { layer, span } = state, rain = layer === 'rain', now = Date.now();
  $('layerBtn').textContent = LAYERS[layer].title + ' ▾'; $('layerBtn').hidden = false;
  $('chips').hidden = false;
  [...$('chips').children].forEach(c => { c.setAttribute('aria-selected', c.dataset.span === span); if (c.dataset.span === 'H2') c.hidden = !rain; });
  const loading = state.loading, msg = (h, s) => { $('rainHead').textContent = h; $('rainSub').textContent = s; };
  if (!rain) {
    const hours = SPANS[span].hours;
    let pts = null;
    try { const j = layer === 'pollen' ? state.pollenJson : state.layerJson; if (j) pts = layer === 'pollen' ? parsePollen(j, now, hours) : parseLayer(j, layer, now, hours); } catch {}
    if (!pts || pts.length < 2) { chart.set({ layer, pts: [], bars: [] }); return msg(loading ? 'Loading…' : 'No data', loading ? '' : 'Could not load this layer. Try again in a moment.'); }
    chart.set({ layer, pts, bars: [] });
    const [h, s] = describeLayer(layer, pts, now, hours); return msg(h, s);
  }
  const bars = span === 'H2' ? state.rain2h : state.longJson ? barsFromOM(state.longJson, span, now) : null;
  if (!bars || !bars.length) { chart.set({ layer, bars: [], pts: [] }); return msg(loading ? 'Loading…' : 'No forecast', loading ? '' : 'Could not load this time scale. Try again in a moment.'); }
  chart.set({ layer, bars, step: SPANS[span].step, pts: [] });
  const [h, s] = describeRain(bars, SPANS[span].step); msg(h, s);
}
const ready = () => { const n = Date.now(); return state.layer === 'rain' ? state.span === 'H2' || (state.longJson && n - state.longAt < STALE) : state.layer === 'pollen' ? state.pollenJson && n - state.pollenAt < STALE : state.layerJson && n - state.layerAt < STALE; };
async function fetchNeeded(force) {
  if (!force && ready()) return renderChart();
  const gen = state.gen, p = state.place; state.loading = true; renderChart();
  try {
    if (state.layer === 'rain' && state.span !== 'H2') { const j = await getJson(`${OM}?${ll(p)}&minutely_15=precipitation&hourly=precipitation&timeformat=unixtime&forecast_days=4`); if (gen === state.gen) { state.longJson = j; state.longAt = Date.now(); } }
    else if (state.layer === 'pollen') { const j = await getJson(`${OM_AIR}?${ll(p)}&hourly=${POLLENS.map(x => x[0]).join(',')}&timeformat=unixtime&forecast_days=4`); if (gen === state.gen) { state.pollenJson = j; state.pollenAt = Date.now(); } }
    else if (state.layer !== 'rain') { const j = await getJson(`${OM}?${ll(p)}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index,sunshine_duration&timeformat=unixtime&forecast_days=4`); if (gen === state.gen) { state.layerJson = j; state.layerAt = Date.now(); } }
  } catch {}
  if (gen === state.gen) { state.loading = false; renderChart(); }
}

/* ---------- Buienradar feed ---------- */
const km = (a, b, c, d) => { const r = 6371, q = x => x * Math.PI / 180, dl = q(c - a), dn = q(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(q(a)) * Math.cos(q(c)) * Math.sin(dn / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };
const range = (a, b) => a === b ? `${a}°` : `${a}–${b}°`;
const WMO = { 0: ['A', 'clear'], 1: ['J', 'mostly clear'], 2: ['B', 'partly cloudy'], 3: ['C', 'overcast'], 45: ['O', 'fog'], 48: ['O', 'fog'], 51: ['M', 'drizzle'], 53: ['M', 'drizzle'], 55: ['M', 'drizzle'], 56: ['W', 'freezing drizzle'], 57: ['W', 'freezing drizzle'], 61: ['K', 'light rain'], 63: ['Q', 'rain'], 65: ['Q', 'heavy rain'], 66: ['W', 'freezing rain'], 67: ['W', 'freezing rain'], 71: ['T', 'light snow'], 73: ['T', 'snow'], 75: ['T', 'heavy snow'], 77: ['T', 'snow grains'], 80: ['F', 'a few showers'], 81: ['E', 'showers'], 82: ['H', 'heavy showers'], 85: ['I', 'snow showers'], 86: ['I', 'snow showers'], 95: ['S', 'thunderstorms'], 96: ['S', 'thunderstorms'], 99: ['S', 'thunderstorms'] };
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
async function loadFeed(p) {
  const j = await getJson(FEED, 15000), st = j.actual.stationmeasurements;
  let best = null, bd = 1e9; for (const o of st) { if (o.temperature == null || o.lat == null) continue; const d = km(p.lat, p.lon, o.lat, o.lon); if (d < bd) { bd = d; best = o; } }
  const now = best && { icon: best.fullIconUrl, temp: best.temperature, feels: best.feeltemperature, desc: weatherEn(best.weatherdescription), wind: `${windEn(best.winddirection)} ${best.windspeedBft} Bft`, hum: best.humidity, region: best.regio };
  const outlook = j.forecast?.shortterm?.forecast || '';
  const today = localDate(), days = [];
  for (const o of j.forecast.fivedayforecast) { const date = o.day.slice(0, 10); if (date < today) continue; days.push({ date, desc: weatherEn(o.weatherdescription), icon: o.fullIconUrl, high: range(o.maxtemperatureMin, o.maxtemperatureMax), low: range(o.mintemperatureMin, o.mintemperatureMax), rain: o.rainChance, mmMin: o.mmRainMin || 0, mmMax: o.mmRainMax || 0 }); }
  // Buienradar's list starts yesterday, leaving 4 days: top up to 5 from Open-Meteo's daily forecast.
  if (days.length < 5) {
    try {
      const d = (await getJson(`${OM}?${ll(p)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=7`)).daily, last = days.length ? days[days.length - 1].date : today;
      for (let i = 0; i < d.time.length && days.length < 5; i++) {
        if (d.time[i] <= last) continue; const [letter, text] = WMO[d.weather_code[i]] || ['C', 'cloudy'], mm = d.precipitation_sum[i] || 0;
        days.push({ date: d.time[i], desc: cap(text), icon: `https://cdn.buienradar.nl/resources/images/icons/weather/96x96/${letter}.png`, high: `${Math.round(d.temperature_2m_max[i])}°`, low: `${Math.round(d.temperature_2m_min[i])}°`, rain: d.precipitation_probability_max[i] || 0, mmMin: mm, mmMax: mm });
      }
    } catch {}
  }
  return { now, outlook, days };
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeIcon = u => /^https:\/\/[a-z0-9.-]*buienradar\.nl\//.test(u || '') ? u : '';
function showFeed(f) {
  if (f.now) {
    const n = f.now; $('nowCard').hidden = false; $('nowIcon').src = safeIcon(n.icon); $('nowTemp').textContent = n.temp != null ? `${Math.round(n.temp)}°` : '–'; $('nowDesc').textContent = n.desc;
    const det = [n.feels != null ? `Feels ${Math.round(n.feels)}°` : '', n.hum != null ? `Humidity ${n.hum}%` : ''].filter(Boolean).join('  ·  ');
    $('nowSub').textContent = [[n.region ? `Station ${n.region}` : '', n.wind].filter(Boolean).join('  ·  '), det].filter(Boolean).join('\n'); $('nowSub').style.whiteSpace = 'pre-line';
  }
  $('outlook').textContent = f.outlook; $('outlookCard').hidden = !f.outlook;
  const dc = $('daysCard'); dc.hidden = !f.days.length; if (!f.days.length) return;
  const today = localDate();
  dc.innerHTML = `<div class="label">${f.days.length}-DAY FORECAST</div>` + f.days.map(d => {
    const dt = new Date(d.date + 'T12:00:00'), name = d.date === today ? 'Today' : dt.toLocaleDateString('en-GB', { weekday: 'long' }), sub = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const mm = d.mmMax > 0 ? (d.mmMin === d.mmMax ? `${f1(d.mmMax)} mm` : `${f1(d.mmMin)}–${f1(d.mmMax)} mm`) : '';
    return `<div class="day"><div class="d"><b>${esc(name)}</b><span>${esc(sub)}</span></div><img src="${esc(safeIcon(d.icon))}" alt="" width="40" height="40"><div class="m">${esc(d.desc)}<i>${esc(['Rain ' + d.rain + '%', mm].filter(Boolean).join(' · '))}</i></div><div class="t"><b>${esc(d.high)}</b><span>${esc(d.low)}</span></div></div>`;
  }).join('');
}

/* ---------- refresh ---------- */
let refreshing = false, lastRun = 0;
async function refresh(force = true) {
  if (refreshing) return; refreshing = true; lastRun = Date.now(); const gen = state.gen, p = state.place;
  $('refresh').classList.add('spin'); $('placeName').textContent = p.name;
  const [rain, feed] = await Promise.allSettled([getText(`${RAINTEXT}?lat=${p.lat.toFixed(2)}&lon=${p.lon.toFixed(2)}`).then(parseRain), loadFeed(p)]);
  refreshing = false; $('refresh').classList.remove('spin'); if (gen !== state.gen) return;
  if (rain.status === 'rejected' && rain.reason.outside) {
    state.outside = true; chart.set({ bars: [], pts: [] }); $('layerBtn').hidden = true; $('chips').hidden = true; $('nowCard').hidden = true; $('outlookCard').hidden = true; $('daysCard').hidden = true;
    $('rainHead').textContent = "Outside Buienradar's area"; $('rainSub').textContent = 'Rain forecasts cover the Netherlands and Belgium. Choose another place.'; $('updated').textContent = ''; return;
  }
  state.outside = false;
  if (rain.status === 'fulfilled') { state.rain2h = toBars(rain.value); }
  else if (!state.rain2h) { $('rainHead').textContent = 'Offline'; $('rainSub').textContent = 'Could not load the rain forecast. Tap ⟳ to retry.'; $('layerBtn').hidden = true; $('chips').hidden = true; }
  if (feed.status === 'fulfilled') showFeed(feed.value);
  if (rain.status === 'fulfilled') { $('updated').textContent = `Updated ${hm(Date.now())}`; await fetchNeeded(force); }
}

/* ---------- controls ---------- */
function buildChips() {
  $('chips').innerHTML = Object.entries(SPANS).map(([k, s]) => `<button class="chip" role="tab" data-span="${k}">+${s.label}</button>`).join('');
  $('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; state.span = b.dataset.span; chart.clear(); fetchNeeded(false); });
}
function layerMenu() {
  const menu = $('layerMenu'), btn = $('layerBtn');
  menu.innerHTML = Object.entries(LAYERS).map(([k, l]) => `<button role="option" data-k="${k}" aria-selected="${k === state.layer}">${l.title}</button>`).join('');
  const r = btn.getBoundingClientRect(); menu.hidden = false;
  const w = menu.offsetWidth; menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; menu.style.top = Math.min(r.bottom + 6, innerHeight - menu.offsetHeight - 8) + 'px';
}
function choose(k) {
  state.layer = k; $('layerMenu').hidden = true; chart.clear();
  if (k !== 'rain' && state.span === 'H2') state.span = 'H24'; else if (k === 'rain' && state.span === 'H24') state.span = 'H2';
  fetchNeeded(false);
}
function setPlace(p) { state.place = p; store.set('place', p); state.gen++; state.longJson = state.layerJson = state.pollenJson = null; state.longAt = state.layerAt = state.pollenAt = 0; state.rain2h = null; state.loading = false; refreshing = false; chart.set({ bars: [], pts: [] }); $('rainHead').textContent = 'Loading…'; $('rainSub').textContent = ''; $('placeName').textContent = p.name; refresh(true); }
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3500); }

/* ---------- search ---------- */
const dlg = $('search'); let searchSeq = 0, searchTimer = 0;
async function doSearch(q) {
  const my = ++searchSeq, res = $('results'), msg = $('searchMsg');
  if (q.trim().length < 2) { res.innerHTML = ''; msg.textContent = ''; return; }
  msg.textContent = 'Searching…';
  try {
    const parts = await Promise.allSettled(['NL', 'BE'].map(cc => getJson(`${OM_GEO}?name=${encodeURIComponent(q.trim())}&count=10&language=en&format=json&countryCode=${cc}`)));
    if (my !== searchSeq) return;
    if (parts.every(p => p.status === 'rejected')) throw 0;
    const hits = parts.flatMap(p => p.status === 'fulfilled' ? (p.value.results || []) : []).filter(o => o.latitude != null).sort((a, b) => (b.population || 0) - (a.population || 0)).slice(0, 15);
    res.innerHTML = hits.map((o, i) => `<li><button data-i="${i}"><b>${esc(o.name)}</b><span>${esc([o.admin2, o.admin1, o.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(', '))}</span></button></li>`).join('');
    res._hits = hits; msg.textContent = hits.length ? '' : 'No places found in the Netherlands or Belgium.';
  } catch { if (my === searchSeq) msg.textContent = 'Search failed. Check your connection.'; }
}
$('placeBtn').onclick = () => { $('q').value = ''; $('results').innerHTML = ''; $('searchMsg').textContent = ''; dlg.showModal(); setTimeout(() => $('q').focus(), 50); };
$('q').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value), 250); });
$('results').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const o = $('results')._hits[+b.dataset.i]; dlg.close(); setPlace({ name: o.name, lat: o.latitude, lon: o.longitude }); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
$('gps').onclick = () => {
  if (!navigator.geolocation) return toast('Location is not available in this browser.');
  $('searchMsg').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude; let name = 'My location';
    try { const r = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, 5000); name = r.city || r.locality || name; } catch {}
    dlg.close(); setPlace({ name, lat, lon, gps: true });
  }, err => { $('searchMsg').textContent = err.code === 1 ? 'Location permission was denied.' : 'Could not get your location.'; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
};

/* ---------- wiring ---------- */
$('refresh').onclick = () => refresh(true);
$('layerBtn').onclick = e => { e.stopPropagation(); $('layerMenu').hidden ? layerMenu() : $('layerMenu').hidden = true; };
$('layerMenu').addEventListener('click', e => { const b = e.target.closest('button'); if (b) choose(b.dataset.k); });
document.addEventListener('click', e => { if (!e.target.closest('#layerMenu')) $('layerMenu').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') $('layerMenu').hidden = true; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastRun > 5 * 60e3) refresh(false); });
buildChips(); refresh(true);
setInterval(() => { if (!document.hidden && Date.now() - lastRun > 5 * 60e3) refresh(false); }, 60e3);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
