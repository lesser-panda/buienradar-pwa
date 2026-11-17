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
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- state ---------- */
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- language ---------- */
const I = {
  en: {
    loading: 'Loading…', now: 'now', today: 'Today', noForecast: 'No forecast', scaleFail: 'Could not load this time scale. Try again in a moment.',
    noData: 'No data', layerFail: 'Could not load this layer. Try again in a moment.', noRainData: 'No rain data', noForecastLoc: 'No forecast for this location',
    noRain: 'No rain expected', dryAtLeast: e => `Dry until at least ${e}`, rainThrough: e => `Raining through ${e}`, rainUntil: x => `Raining until ${x}`, dryUntil: x => `Dry until ${x}`, then: p => `Then ${p}`,
    peak: (s, v, x) => `${s}, peak ${v} mm/h at ${x}`, light: 'light', moderate: 'moderate', heavy: 'heavy', dry: 'dry', mmh: 'mm/h',
    L_rain: 'Rain', L_temp: 'Temperature', L_feel: 'Feels like', L_humidity: 'Humidity', L_wind: 'Wind', L_uv: 'UV index', L_sun: 'Sunshine', L_pollen: 'Pollen',
    uv: ['none', 'low', 'moderate', 'high', 'very high', 'extreme'], pw: ['none', 'low', 'moderate', 'high', 'very high'],
    minSun: n => `${n} min of sun`, grains: 'grains/m³', noPollen: 'no pollen',
    pollenNames: { alder_pollen: 'Alder', birch_pollen: 'Birch', grass_pollen: 'Grass', mugwort_pollen: 'Mugwort', olive_pollen: 'Olive', ragweed_pollen: 'Ragweed' },
    hiLo: (a, b, c, d) => `High ${a}° at ${b}  ·  Low ${c}° at ${d}`, feelsLike: n => `Feels like ${n}°`, humHead: n => `${n}% humidity`, humSub: (a, b, h) => `Between ${a}% and ${b}% in the next ${h} hours`,
    windSub: (a, b, x) => `Strongest: ${a} km/h (${b} Bft) at ${x}`, noUV: 'No UV expected', nothing: h => `Nothing in the next ${h} hours`, uvPeak: (a, w, x) => `Peak UV ${a} (${w}) at ${x}`,
    noSun: 'No sunshine expected', sunHead: x => `${x} h of sun`, sunSub: (h, x) => `In the next ${h} hours; the most around ${x}`, noPollenHead: 'No pollen expected', pollenHead: w => `${cap(w)} pollen`, pollenSub: (n, x) => `Peak ${n} grains/m³ at ${x}`,
    station: r => `Station ${r}`, feels: n => `Feels ${n}°`, hum: n => `Humidity ${n}%`, outlook: 'OUTLOOK', outlookNote: '(Buienradar, in Dutch)', days: n => `${n}-DAY FORECAST`, rainPct: n => `Rain ${n}%`, updated: x => `Updated ${x}`,
    outside: "Outside Buienradar's area", outsideSub: 'Rain forecasts cover the Netherlands and Belgium. Choose another place.', offline: 'Offline', offlineSub: 'Could not load the rain forecast. Tap ⟳ to retry.',
    searchPh: 'Search a town in NL or BE', gps: '◎ Use my location', searching: 'Searching…', noPlaces: 'No places found in the Netherlands or Belgium.', searchFail: 'Search failed. Check your connection.', finding: 'Finding you…', denied: 'Location permission was denied.', noFix: 'Could not get your location.', noGeo: 'Location is not available in this browser.', myLoc: 'My location',
    radar: 'RADAR', radarEnds: x => `Radar forecast ends at ${x}`, radarFail: 'Radar unavailable', radarLoading: 'Loading radar…',
    footer: 'Weather data: <a href="https://www.buienradar.nl" target="_blank" rel="noopener">buienradar.nl</a><br>Longer rain forecasts, temperature, wind, UV, sun and pollen: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)<br>Unofficial, personal-use app. Not affiliated with Buienradar.',
    title: 'Rain – Buienradar forecast', other: 'NL', chartAria: 'Forecast chart. Drag across it for a reading.',
  },
  nl: {
    loading: 'Laden…', now: 'nu', today: 'Vandaag', noForecast: 'Geen verwachting', scaleFail: 'Kon deze tijdschaal niet laden. Probeer het zo nog eens.',
    noData: 'Geen gegevens', layerFail: 'Kon deze laag niet laden. Probeer het zo nog eens.', noRainData: 'Geen regengegevens', noForecastLoc: 'Geen verwachting voor deze locatie',
    noRain: 'Geen regen verwacht', dryAtLeast: e => `Droog tot minstens ${e}`, rainThrough: e => `Regen tot ${e} en langer`, rainUntil: x => `Regen tot ${x}`, dryUntil: x => `Droog tot ${x}`, then: p => `Daarna ${p}`,
    peak: (s, v, x) => `${s}, piek ${v} mm/u om ${x}`, light: 'licht', moderate: 'matig', heavy: 'zwaar', dry: 'droog', mmh: 'mm/u',
    L_rain: 'Regen', L_temp: 'Temperatuur', L_feel: 'Gevoelstemperatuur', L_humidity: 'Luchtvochtigheid', L_wind: 'Wind', L_uv: 'UV-index', L_sun: 'Zonneschijn', L_pollen: 'Pollen',
    uv: ['geen', 'laag', 'matig', 'hoog', 'zeer hoog', 'extreem'], pw: ['geen', 'laag', 'matig', 'hoog', 'zeer hoog'],
    minSun: n => `${n} min zon`, grains: 'korrels/m³', noPollen: 'geen pollen',
    pollenNames: { alder_pollen: 'Els', birch_pollen: 'Berk', grass_pollen: 'Gras', mugwort_pollen: 'Bijvoet', olive_pollen: 'Olijf', ragweed_pollen: 'Ambrosia' },
    hiLo: (a, b, c, d) => `Max ${a}° om ${b}  ·  Min ${c}° om ${d}`, feelsLike: n => `Voelt als ${n}°`, humHead: n => `${n}% luchtvochtigheid`, humSub: (a, b, h) => `Tussen ${a}% en ${b}% in de komende ${h} uur`,
    windSub: (a, b, x) => `Hardst: ${a} km/h (${b} Bft) om ${x}`, noUV: 'Geen UV verwacht', nothing: h => `Niets in de komende ${h} uur`, uvPeak: (a, w, x) => `Piek-UV ${a} (${w}) om ${x}`,
    noSun: 'Geen zon verwacht', sunHead: x => `${x} uur zon`, sunSub: (h, x) => `In de komende ${h} uur; het meest rond ${x}`, noPollenHead: 'Geen pollen verwacht', pollenHead: w => `Pollen: ${w}`, pollenSub: (n, x) => `Piek ${n} korrels/m³ om ${x}`,
    station: r => `Station ${r}`, feels: n => `Voelt als ${n}°`, hum: n => `Vochtigheid ${n}%`, outlook: 'VERWACHTING', outlookNote: '', days: n => `${n}-DAAGSE VERWACHTING`, rainPct: n => `Regen ${n}%`, updated: x => `Bijgewerkt ${x}`,
    outside: 'Buiten het dekkingsgebied van Buienradar', outsideSub: 'Regenverwachtingen gelden voor Nederland en België. Kies een andere plaats.', offline: 'Geen verbinding', offlineSub: 'Kon de regenverwachting niet laden. Tik op ⟳ om het opnieuw te proberen.',
    searchPh: 'Zoek een plaats in NL of BE', gps: '◎ Gebruik mijn locatie', searching: 'Zoeken…', noPlaces: 'Geen plaatsen gevonden in Nederland of België.', searchFail: 'Zoeken mislukt. Controleer je verbinding.', finding: 'Locatie zoeken…', denied: 'Toegang tot locatie is geweigerd.', noFix: 'Kon je locatie niet bepalen.', noGeo: 'Locatie is niet beschikbaar in deze browser.', myLoc: 'Mijn locatie',
    radar: 'RADAR', radarEnds: x => `Radarverwachting loopt tot ${x}`, radarFail: 'Radar niet beschikbaar', radarLoading: 'Radar laden…',
    footer: 'Weergegevens: <a href="https://www.buienradar.nl" target="_blank" rel="noopener">buienradar.nl</a><br>Langere regenverwachtingen, temperatuur, wind, UV, zon en pollen: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)<br>Onofficiële app voor persoonlijk gebruik. Niet verbonden aan Buienradar.',
    title: 'Regen – Buienradar-verwachting', other: 'EN', chartAria: 'Verwachtingsgrafiek. Sleep eroverheen voor een uitlezing.',
  },
};
let lang = store.get('lang') || ((navigator.language || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en');
const t = (k, ...a) => { const v = I[lang][k] ?? I.en[k]; return typeof v === 'function' ? v(...a) : v; };
const locale = () => lang === 'nl' ? 'nl-NL' : 'en-GB';

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
const weatherEn = d => cap((d || '').replace(PRE, m => PTABLE.get(m.toLowerCase())).replace(/\s+/g, ' ').trim());
const windEn = d => { const c = (d || '').trim().toUpperCase(); return /^[NOZW]{1,3}$/.test(c) ? [...c].map(x => x === 'O' ? 'E' : x === 'Z' ? 'S' : x).join('') : (d || '').trim(); };

/* ---------- time ---------- */
const pad = n => String(n).padStart(2, '0');
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function hm(ms, ref = Date.now()) { const d = new Date(ms), tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`; return sameDay(d, new Date(ref)) ? tm : `${d.toLocaleDateString(locale(), { weekday: 'short' })} ${tm}`; }

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
const amount = mm => mm < 0.1 ? t('dry') : mm < 1 ? `${f1(mm, 2)} ${t('mmh')}` : `${f1(mm)} ${t('mmh')}`;
const strength = mm => mm < 0.1 ? '' : mm < 2.5 ? t('light') : mm < 7.5 ? t('moderate') : t('heavy');
function describeRain(bars, step) {
  if (!bars.length) return [t('noRainData'), t('noForecastLoc')];
  const end = hm(bars[bars.length - 1].start + step * 60e3), at = b => hm(b.start);
  const fw = bars.findIndex(b => wet(b.mm));
  if (fw < 0) return [t('noRain'), t('dryAtLeast', end)];
  const peak = bars.reduce((a, b) => b.mm > a.mm ? b : a);
  const pt = t('peak', strength(peak.mm), f1(peak.mm), at(peak));
  if (fw === 0) { const d = bars.findIndex(b => !wet(b.mm)); return [d < 0 ? t('rainThrough', end) : t('rainUntil', at(bars[d])), cap(pt)]; }
  return [t('dryUntil', at(bars[fw])), t('then', pt)];
}

/* ---------- layers (hourly lines from Open-Meteo) ---------- */
const POLLENS = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'];
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
    for (const k of POLLENS) { const v = h[k] ? (h[k][i] || 0) : 0; total += v; if (v > top) { top = v; note = k; } }
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
const uvWord = v => t('uv')[v < .5 ? 0 : v < 3 ? 1 : v < 6 ? 2 : v < 8 ? 3 : v < 11 ? 4 : 5];
const pollenWord = v => t('pw')[v < .5 ? 0 : v < 20 ? 1 : v < 90 ? 2 : v < 200 ? 3 : 4];
const pname = k => k ? I[lang].pollenNames[k] : null;
function fmtVal(layer, v, note) {
  switch (layer) {
    case 'temp': case 'feel': return `${f1(v)} °C`;
    case 'humidity': return `${Math.round(v)} %`;
    case 'wind': return `${Math.round(v)} km/h · ${bft(v)} Bft`;
    case 'uv': return `UV ${f1(v)} · ${uvWord(v)}`;
    case 'sun': return t('minSun', Math.round(v));
    case 'pollen': return v < .5 ? t('noPollen') : `${Math.round(v)} ${t('grains')}${note ? ' · ' + pname(note) : ''} · ${pollenWord(v)}`;
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
  if (!pts.length) return [t('noData'), t('layerFail')];
  const cur = ptAt(pts, now), hi = pts.reduce((a, b) => b.v > a.v ? b : a), lo = pts.reduce((a, b) => b.v < a.v ? b : a), tm = p => hm(p.ms, now), r = Math.round;
  switch (layer) {
    case 'temp': return [`${r(cur)}°`, t('hiLo', r(hi.v), tm(hi), r(lo.v), tm(lo))];
    case 'feel': return [t('feelsLike', r(cur)), t('hiLo', r(hi.v), tm(hi), r(lo.v), tm(lo))];
    case 'humidity': return [t('humHead', r(cur)), t('humSub', r(lo.v), r(hi.v), hours)];
    case 'wind': return [`${r(cur)} km/h · ${bft(cur)} Bft`, t('windSub', r(hi.v), bft(hi.v), tm(hi))];
    case 'uv': return hi.v < .5 ? [t('noUV'), t('nothing', hours)] : [`UV ${f1(cur)} · ${uvWord(cur)}`, t('uvPeak', f1(hi.v), uvWord(hi.v), tm(hi))];
    case 'sun': { const total = pts.slice(0, hours).reduce((s, p) => s + p.v, 0) / 60; return total < .1 ? [t('noSun'), t('nothing', hours)] : [t('sunHead', f1(total)), t('sunSub', hours, tm(hi))]; }
    case 'pollen': return hi.v < .5 ? [t('noPollenHead'), t('nothing', hours)] : [t('pollenHead', pollenWord(Math.max(cur, 0))), t('pollenSub', r(hi.v), tm(hi)) + (hi.note ? ` (${pname(hi.note)})` : '')];
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
  function yLabels() {
    if (m.layer === 'rain') return [`2.5 ${t('mmh')}`, '7.5'];
    if (m.pts.length < 2) return [];
    const [lo, hi] = yRange(m.layer, m.pts); return [lo, (lo + hi) / 2, hi].map(v => axisFmt(m.layer, v));
  }
  function frame() {
    ctx.font = '12px system-ui,sans-serif'; const rp = Math.ceil(Math.max(30, ...yLabels().map(x => ctx.measureText(x).width))) + 8;
    return { left: 0, right: m.w - rp, top: 40, bottom: m.h - 22 };
  }
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
    [[2.5, `2.5 ${t('mmh')}`], [7.5, '7.5']].forEach(([mm, txt]) => { const gy = y(mm); ctx.beginPath(); ctx.moveTo(f.left, gy); ctx.lineTo(f.right, gy); ctx.stroke(); ctx.fillText(txt, f.right + 6, gy + 4); });
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
    xLabels(f, marks.length, k => marks[k] === 0 ? t('now') : hm(m.bars[marks[k]].start), k => f.left + (marks[k] + .5) * bw);
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
    xLabels(f, marks.length, k => k === 0 ? t('now') : hm(t0 + marks[k] * (t1 - t0)), k => f.left + marks[k] * (f.right - f.left));
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
  const select = e => { if (!hasData()) return; const ms = timeAt(e.clientX); m.sel = ms; draw(); if (m.layer === 'rain' && api.onScrub) api.onScrub(ms); const b = Math.floor(ms / HOUR); if (b !== lastBucket) { lastBucket = b; if (m.layer !== 'rain' && navigator.vibrate) navigator.vibrate(4); } };
  const clearSoon = ms => { clearTimeout(m.clearT); m.clearT = setTimeout(() => { m.sel = null; draw(); api.onScrub && api.onScrub(null); }, ms); };
  cv.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; clearTimeout(m.clearT); try { cv.setPointerCapture(e.pointerId); } catch {} select(e); });
  cv.addEventListener('pointermove', e => { if (down || e.pointerType === 'mouse') { clearTimeout(m.clearT); select(e); } });
  const up = e => { if (!down) return; down = false; clearSoon(e.pointerType === 'mouse' ? 400 : 2000); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { down = false; clearTimeout(m.clearT); m.sel = null; draw(); api.onScrub && api.onScrub(null); }); // the page took over for a vertical scroll
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) clearSoon(100); });
  new ResizeObserver(size).observe(cv); matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', draw);
  const api = { onScrub: null, set(p) { Object.assign(m, p, { sel: null }); draw(); }, redraw: draw, clear() { m.sel = null; draw(); api.onScrub && api.onScrub(null); } };
  return api;
})();

/* ---------- rendering ---------- */
function renderChart() {
  const { layer, span } = state, rain = layer === 'rain', now = Date.now();
  $('layerBtn').textContent = t('L_' + layer) + ' ▾'; $('layerBtn').hidden = false;
  $('chips').hidden = false;
  [...$('chips').children].forEach(c => { c.setAttribute('aria-selected', c.dataset.span === span); if (c.dataset.span === 'H2') c.hidden = !rain; });
  const loading = state.loading, msg = (h, s) => { $('rainHead').textContent = h; $('rainSub').textContent = s; };
  if (!rain) {
    const hours = SPANS[span].hours;
    let pts = null;
    try { const j = layer === 'pollen' ? state.pollenJson : state.layerJson; if (j) pts = layer === 'pollen' ? parsePollen(j, now, hours) : parseLayer(j, layer, now, hours); } catch {}
    if (!pts || pts.length < 2) { chart.set({ layer, pts: [], bars: [] }); return msg(loading ? t('loading') : t('noData'), loading ? '' : t('layerFail')); }
    chart.set({ layer, pts, bars: [] });
    const [h, s] = describeLayer(layer, pts, now, hours); return msg(h, s);
  }
  const bars = span === 'H2' ? state.rain2h : state.longJson ? barsFromOM(state.longJson, span, now) : null;
  if (!bars || !bars.length) { chart.set({ layer, bars: [], pts: [] }); return msg(loading ? t('loading') : t('noForecast'), loading ? '' : t('scaleFail')); }
  chart.set({ layer, bars, step: SPANS[span].step, pts: [] });
  const [h, s] = describeRain(bars, SPANS[span].step); msg(h, s);
}
const ready = () => { const n = Date.now(); return state.layer === 'rain' ? state.span === 'H2' || (state.longJson && n - state.longAt < STALE) : state.layer === 'pollen' ? state.pollenJson && n - state.pollenAt < STALE : state.layerJson && n - state.layerAt < STALE; };
async function fetchNeeded(force) {
  if (!force && ready()) return renderChart();
  const gen = state.gen, p = state.place; state.loading = true; renderChart();
  try {
    if (state.layer === 'rain' && state.span !== 'H2') { const j = await getJson(`${OM}?${ll(p)}&minutely_15=precipitation&hourly=precipitation&timeformat=unixtime&forecast_days=4`); if (gen === state.gen) { state.longJson = j; state.longAt = Date.now(); } }
    else if (state.layer === 'pollen') { const j = await getJson(`${OM_AIR}?${ll(p)}&hourly=${POLLENS.join(',')}&timeformat=unixtime&forecast_days=4`); if (gen === state.gen) { state.pollenJson = j; state.pollenAt = Date.now(); } }
    else if (state.layer !== 'rain') { const j = await getJson(`${OM}?${ll(p)}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index,sunshine_duration&timeformat=unixtime&forecast_days=4`); if (gen === state.gen) { state.layerJson = j; state.layerAt = Date.now(); } }
  } catch {}
  if (gen === state.gen) { state.loading = false; renderChart(); }
}

/* ---------- Buienradar feed ---------- */
const km = (a, b, c, d) => { const r = 6371, q = x => x * Math.PI / 180, dl = q(c - a), dn = q(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(q(a)) * Math.cos(q(c)) * Math.sin(dn / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };
const range = (a, b) => a === b ? `${a}°` : `${a}–${b}°`;
const WMO = { 0: ['A', 'clear', 'helder'], 1: ['J', 'mostly clear', 'overwegend helder'], 2: ['B', 'partly cloudy', 'half bewolkt'], 3: ['C', 'overcast', 'bewolkt'], 45: ['O', 'fog', 'mist'], 48: ['O', 'fog', 'mist'], 51: ['M', 'drizzle', 'motregen'], 53: ['M', 'drizzle', 'motregen'], 55: ['M', 'drizzle', 'motregen'], 56: ['W', 'freezing drizzle', 'aanvriezende motregen'], 57: ['W', 'freezing drizzle', 'aanvriezende motregen'], 61: ['K', 'light rain', 'lichte regen'], 63: ['Q', 'rain', 'regen'], 65: ['Q', 'heavy rain', 'zware regen'], 66: ['W', 'freezing rain', 'aanvriezende regen'], 67: ['W', 'freezing rain', 'aanvriezende regen'], 71: ['T', 'light snow', 'lichte sneeuw'], 73: ['T', 'snow', 'sneeuw'], 75: ['T', 'heavy snow', 'zware sneeuw'], 77: ['T', 'snow grains', 'korrelsneeuw'], 80: ['F', 'a few showers', 'enkele buien'], 81: ['E', 'showers', 'buien'], 82: ['H', 'heavy showers', 'zware buien'], 85: ['I', 'snow showers', 'sneeuwbuien'], 86: ['I', 'snow showers', 'sneeuwbuien'], 95: ['S', 'thunderstorms', 'onweer'], 96: ['S', 'thunderstorms', 'onweer'], 99: ['S', 'thunderstorms', 'onweer'] };
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The feed is kept in its original (Dutch) wording and translated when it is shown, so the language can change without a reload.
async function loadFeed(p) {
  const j = await getJson(FEED, 15000), st = j.actual.stationmeasurements;
  let best = null, bd = 1e9; for (const o of st) { if (o.temperature == null || o.lat == null) continue; const d = km(p.lat, p.lon, o.lat, o.lon); if (d < bd) { bd = d; best = o; } }
  const now = best && { icon: best.fullIconUrl, temp: best.temperature, feels: best.feeltemperature, raw: best.weatherdescription, dir: best.winddirection, bft: best.windspeedBft, hum: best.humidity, region: best.regio };
  const outlook = j.forecast?.shortterm?.forecast || '';
  const radarUrl = j.actual?.actualradarurl || null;
  const today = localDate(), days = [];
  for (const o of j.forecast.fivedayforecast) { const date = o.day.slice(0, 10); if (date < today) continue; days.push({ date, raw: o.weatherdescription, icon: o.fullIconUrl, high: range(o.maxtemperatureMin, o.maxtemperatureMax), low: range(o.mintemperatureMin, o.mintemperatureMax), rain: o.rainChance, mmMin: o.mmRainMin || 0, mmMax: o.mmRainMax || 0 }); }
  // Buienradar's list starts yesterday, leaving 4 days: top up to 5 from Open-Meteo's daily forecast.
  if (days.length < 5) {
    try {
      const d = (await getJson(`${OM}?${ll(p)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=7`)).daily, last = days.length ? days[days.length - 1].date : today;
      for (let i = 0; i < d.time.length && days.length < 5; i++) {
        if (d.time[i] <= last) continue; const w = WMO[d.weather_code[i]] || ['C', 'cloudy', 'bewolkt'], mm = d.precipitation_sum[i] || 0;
        days.push({ date: d.time[i], code: w, icon: `https://cdn.buienradar.nl/resources/images/icons/weather/96x96/${w[0]}.png`, high: `${Math.round(d.temperature_2m_max[i])}°`, low: `${Math.round(d.temperature_2m_min[i])}°`, rain: d.precipitation_probability_max[i] || 0, mmMin: mm, mmMax: mm });
      }
    } catch {}
  }
  return { now, outlook, days, radarUrl };
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeIcon = u => /^https:\/\/[a-z0-9.-]*buienradar\.nl\//.test(u || '') ? u : '';
const descOf = o => o.code ? o.code[lang === 'nl' ? 2 : 1] : lang === 'nl' ? (o.raw || '').trim() : weatherEn(o.raw);
let lastFeed = null;
function showFeed(f) {
  lastFeed = f;
  if (f.now) {
    const n = f.now; $('nowCard').hidden = false; $('nowIcon').src = safeIcon(n.icon); $('nowTemp').textContent = n.temp != null ? `${Math.round(n.temp)}°` : '–'; $('nowDesc').textContent = cap(descOf(n));
    const det = [n.feels != null ? t('feels', Math.round(n.feels)) : '', n.hum != null ? t('hum', n.hum) : ''].filter(Boolean).join('  ·  '), wind = `${lang === 'nl' ? (n.dir || '').trim() : windEn(n.dir)} ${n.bft} Bft`;
    $('nowSub').textContent = [[n.region ? t('station', n.region) : '', wind].filter(Boolean).join('  ·  '), det].filter(Boolean).join('\n'); $('nowSub').style.whiteSpace = 'pre-line';
  }
  $('outlook').textContent = f.outlook; $('outlookCard').hidden = !f.outlook;
  $('outlookLabel').innerHTML = `${t('outlook')} <span class="muted">${esc(t('outlookNote'))}</span>`;
  const dc = $('daysCard'); dc.hidden = !f.days.length; if (!f.days.length) return;
  const today = localDate();
  dc.innerHTML = `<div class="label">${esc(t('days', f.days.length))}</div>` + f.days.map(d => {
    const dt = new Date(d.date + 'T12:00:00'), name = d.date === today ? t('today') : cap(dt.toLocaleDateString(locale(), { weekday: 'long' })), sub = dt.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    const mm = d.mmMax > 0 ? (d.mmMin === d.mmMax ? `${f1(d.mmMax)} mm` : `${f1(d.mmMin)}–${f1(d.mmMax)} mm`) : '';
    return `<div class="day"><div class="d"><b>${esc(name)}</b><span>${esc(sub)}</span></div><img src="${esc(safeIcon(d.icon))}" alt="" width="40" height="40"><div class="m">${esc(cap(descOf(d)))}<i>${esc([t('rainPct', d.rain), mm].filter(Boolean).join(' · '))}</i></div><div class="t"><b>${esc(d.high)}</b><span>${esc(d.low)}</span></div></div>`;
  }).join('');
}

/* ---------- radar (Buienradar pictures, cached) ---------- */
// Each picture is fetched once and kept: in memory for this visit and in the Cache API across visits.
// A picture of the past never changes, so it is kept for good; one for the future is replaced after 10 minutes.
const radar = (() => {
  const BASE = 'https://image.buienradar.nl/2.0/image/', Q = 'RadarMapRainNL?width=550&height=512&renderText=True';
  const ANIM = `${BASE}animation/${Q}`, single = st => `${BASE}single/${Q}&timestamp=${st}`;
  const AHEAD = 165 * 60e3, STEP = 300e3, FUTURE_TTL = 10 * 60e3, ANIM_TTL = 5 * 60e3, KEEP = 3 * HOUR;
  const img = $('radarImg'), note = $('radarNote'), status = $('radarStatus'), mem = new Map(); // key -> { url, at }
  let cache = null, scrubKey = null, wanted = null, animOk = false;
  const stamp = ms => { const d = new Date(Math.floor(ms / STEP) * STEP); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`; };
  const stampMs = st => Date.UTC(+st.slice(0, 4), +st.slice(4, 6) - 1, +st.slice(6, 8), +st.slice(8, 10), +st.slice(10, 12));
  const fresh = (key, at) => key === 'anim' ? Date.now() - at < ANIM_TTL : stampMs(key) < Date.now() - 10 * 60e3 || Date.now() - at < FUTURE_TTL;
  async function open() { if (cache) return cache; try { cache = await caches.open('radar-v1'); } catch { cache = false; } return cache; }
  async function load(key) {                                  // -> object URL, or null
    const hit = mem.get(key); if (hit && fresh(key, hit.at)) return hit.url;
    const url = key === 'anim' ? ANIM : single(key), c = await open();
    if (c) { try { const r = await c.match(url); if (r) { const at = +r.headers.get('x-fetched') || 0; if (fresh(key, at)) { const o = URL.createObjectURL(await r.blob()); put(key, o, at); return o; } } } catch {} }
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(tm); if (!r.ok) return null;
      const blob = await r.blob(); if (!/^image\//.test(blob.type)) return null;
      const at = Date.now(), o = URL.createObjectURL(blob); put(key, o, at);
      if (c) { try { await c.put(url, new Response(blob, { headers: { 'content-type': blob.type, 'x-fetched': String(at) } })); } catch {} }
      return o;
    } catch { return null; }
  }
  function put(key, url, at) { const old = mem.get(key); if (old && old.url !== url) URL.revokeObjectURL(old.url); mem.set(key, { url, at }); if (mem.size > 40) { const k = [...mem.keys()].find(x => x !== 'anim' && x !== scrubKey); if (k) { URL.revokeObjectURL(mem.get(k).url); mem.delete(k); } } }
  async function prune() { const c = await open(); if (!c) return; try { for (const rq of await c.keys()) { const r = await c.match(rq); if (!r || Date.now() - (+r.headers.get('x-fetched') || 0) > KEEP) await c.delete(rq); } } catch {} }
  const show = url => { if (url && img.src !== url) img.src = url; img.hidden = !url; };
  const nearest = key => { let best = null, bd = 1e18; for (const [k, v] of mem) { if (k === 'anim') continue; const d = Math.abs(stampMs(k) - stampMs(key)); if (d < bd) { bd = d; best = v.url; } } return best; };
  async function showAnim() { const u = await load('anim'); animOk = !!u; if (scrubKey == null) { show(u); status.hidden = !!u; status.textContent = u ? '' : t('radarFail'); } }
  async function prefetch() {                                  // every 15 minutes from now to the end of the range, three at a time
    const now = Date.now(), keys = []; for (let d = 0; d <= AHEAD; d += 15 * 60e3) keys.push(stamp(now + d));
    let i = 0; await Promise.all([0, 1, 2].map(async () => { while (i < keys.length) await load(keys[i++]); }));
  }
  return {
    async refresh() { status.hidden = false; status.textContent = img.src ? '' : t('radarLoading'); await showAnim(); prune(); prefetch(); },
    async scrub(ms) {
      if (ms == null) { scrubKey = null; wanted = null; note.hidden = true; if (animOk) { const h = mem.get('anim'); if (h) show(h.url); } return; }
      const now = Date.now(), limit = now + AHEAD; let key = stamp(Math.min(ms, limit));
      if (ms > limit) { note.textContent = t('radarEnds', hm(Math.floor(limit / STEP) * STEP)); note.hidden = false; } else note.hidden = true;
      if (key === scrubKey) return; scrubKey = key; wanted = key;
      const have = mem.get(key); if (have && fresh(key, have.at)) return show(have.url);
      show(nearest(key) || (mem.get('anim') || {}).url);       // something right away, the exact picture when it arrives
      let u = await load(key);
      if (!u && wanted === key) u = await load(stamp(stampMs(key) - STEP));   // the newest picture can lag a few minutes
      if (u && wanted === key) show(u);
    },
    hide(on) { $('radarCard').hidden = on; },
  };
})();

/* ---------- refresh ---------- */
let refreshing = false, lastRun = 0;
async function refresh(force = true) {
  if (refreshing) return; refreshing = true; lastRun = Date.now(); const gen = state.gen, p = state.place;
  $('refresh').classList.add('spin'); $('placeName').textContent = p.name;
  const [rain, feed] = await Promise.allSettled([getText(`${RAINTEXT}?lat=${p.lat.toFixed(2)}&lon=${p.lon.toFixed(2)}`).then(parseRain), loadFeed(p)]);
  refreshing = false; $('refresh').classList.remove('spin'); if (gen !== state.gen) return;
  if (rain.status === 'rejected' && rain.reason.outside) {
    state.outside = true; chart.set({ bars: [], pts: [] }); $('layerBtn').hidden = true; $('chips').hidden = true; $('nowCard').hidden = true; $('outlookCard').hidden = true; $('daysCard').hidden = true; radar.hide(true);
    $('rainHead').textContent = t('outside'); $('rainSub').textContent = t('outsideSub'); $('updated').textContent = ''; return;
  }
  state.outside = false; radar.hide(false);
  if (rain.status === 'fulfilled') { state.rain2h = toBars(rain.value); }
  else if (!state.rain2h) { $('rainHead').textContent = t('offline'); $('rainSub').textContent = t('offlineSub'); $('layerBtn').hidden = true; $('chips').hidden = true; }
  if (feed.status === 'fulfilled') showFeed(feed.value);
  if (rain.status === 'fulfilled') { state.updatedAt = Date.now(); $('updated').textContent = t('updated', hm(state.updatedAt)); radar.refresh(); await fetchNeeded(force); }
}
chart.onScrub = ms => radar.scrub(ms);

/* ---------- language ---------- */
function applyLang() {
  document.documentElement.lang = lang; document.title = t('title');
  $('langBtn').textContent = t('other'); $('langBtn').setAttribute('aria-label', lang === 'nl' ? 'Switch to English' : 'Schakel over naar Nederlands');
  $('q').placeholder = t('searchPh'); $('gps').textContent = t('gps'); $('footer').innerHTML = t('footer'); $('radarLabel').textContent = t('radar'); $('chart').setAttribute('aria-label', t('chartAria'));
  if (state.updatedAt) $('updated').textContent = t('updated', hm(state.updatedAt));
  $('placeName').textContent = state.place.name;
  if (state.outside) { $('rainHead').textContent = t('outside'); $('rainSub').textContent = t('outsideSub'); }
  else { if (lastFeed) showFeed(lastFeed); if (state.rain2h || state.longJson || state.layerJson) renderChart(); }
}
$('langBtn').onclick = () => { lang = lang === 'nl' ? 'en' : 'nl'; store.set('lang', lang); chart.redraw(); applyLang(); };

/* ---------- controls ---------- */
function buildChips() {
  $('chips').innerHTML = Object.entries(SPANS).map(([k, s]) => `<button class="chip" role="tab" data-span="${k}">+${s.label}</button>`).join('');
  $('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; state.span = b.dataset.span; chart.clear(); fetchNeeded(false); });
}
function layerMenu() {
  const menu = $('layerMenu'), btn = $('layerBtn');
  menu.innerHTML = Object.entries(LAYERS).map(([k, l]) => `<button role="option" data-k="${k}" aria-selected="${k === state.layer}">${t('L_' + k)}</button>`).join('');
  const r = btn.getBoundingClientRect(); menu.hidden = false;
  const w = menu.offsetWidth; menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; menu.style.top = Math.min(r.bottom + 6, innerHeight - menu.offsetHeight - 8) + 'px';
}
function choose(k) {
  state.layer = k; $('layerMenu').hidden = true; chart.clear();
  if (k !== 'rain' && state.span === 'H2') state.span = 'H24'; else if (k === 'rain' && state.span === 'H24') state.span = 'H2';
  fetchNeeded(false);
}
function setPlace(p) { state.place = p; store.set('place', p); state.gen++; state.longJson = state.layerJson = state.pollenJson = null; state.longAt = state.layerAt = state.pollenAt = 0; state.rain2h = null; state.loading = false; refreshing = false; chart.set({ bars: [], pts: [] }); $('rainHead').textContent = t('loading'); $('rainSub').textContent = ''; $('placeName').textContent = p.name; refresh(true); }
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3500); }

/* ---------- search ---------- */
const dlg = $('search'); let searchSeq = 0, searchTimer = 0;
async function doSearch(q) {
  const my = ++searchSeq, res = $('results'), msg = $('searchMsg');
  if (q.trim().length < 2) { res.innerHTML = ''; msg.textContent = ''; return; }
  msg.textContent = t('searching');
  try {
    const parts = await Promise.allSettled(['NL', 'BE'].map(cc => getJson(`${OM_GEO}?name=${encodeURIComponent(q.trim())}&count=10&language=${lang}&format=json&countryCode=${cc}`)));
    if (my !== searchSeq) return;
    if (parts.every(p => p.status === 'rejected')) throw 0;
    const hits = parts.flatMap(p => p.status === 'fulfilled' ? (p.value.results || []) : []).filter(o => o.latitude != null).sort((a, b) => (b.population || 0) - (a.population || 0)).slice(0, 15);
    res.innerHTML = hits.map((o, i) => `<li><button data-i="${i}"><b>${esc(o.name)}</b><span>${esc([o.admin2, o.admin1, o.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(', '))}</span></button></li>`).join('');
    res._hits = hits; msg.textContent = hits.length ? '' : t('noPlaces');
  } catch { if (my === searchSeq) msg.textContent = t('searchFail'); }
}
$('placeBtn').onclick = () => { $('q').value = ''; $('results').innerHTML = ''; $('searchMsg').textContent = ''; dlg.showModal(); setTimeout(() => $('q').focus(), 50); };
$('q').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value), 250); });
$('results').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const o = $('results')._hits[+b.dataset.i]; dlg.close(); setPlace({ name: o.name, lat: o.latitude, lon: o.longitude }); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
$('gps').onclick = () => {
  if (!navigator.geolocation) return toast(t('noGeo'));
  $('searchMsg').textContent = t('finding');
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude; let name = t('myLoc');
    try { const r = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`, 5000); name = r.city || r.locality || name; } catch {}
    dlg.close(); setPlace({ name, lat, lon, gps: true });
  }, err => { $('searchMsg').textContent = err.code === 1 ? t('denied') : t('noFix'); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
};

/* ---------- wiring ---------- */
$('refresh').onclick = () => refresh(true);
$('layerBtn').onclick = e => { e.stopPropagation(); $('layerMenu').hidden ? layerMenu() : $('layerMenu').hidden = true; };
$('layerMenu').addEventListener('click', e => { const b = e.target.closest('button'); if (b) choose(b.dataset.k); });
document.addEventListener('click', e => { if (!e.target.closest('#layerMenu')) $('layerMenu').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') $('layerMenu').hidden = true; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastRun > 5 * 60e3) refresh(false); });
buildChips(); applyLang(); refresh(true);
setInterval(() => { if (!document.hidden && Date.now() - lastRun > 5 * 60e3) refresh(false); }, 60e3);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
