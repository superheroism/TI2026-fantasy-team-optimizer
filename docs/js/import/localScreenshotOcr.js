import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import { ACTION_CATALOG } from '../data/actionCatalog.js';
const ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const OCR_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
const LOCALIZE_MAX = 1100, EXTRACT_MAX = 1440, DIRECT_NATIVE_MAX_PIXELS = 2_000_000;
let workerPromise;
const ALIASES = { 'Creep Score': ['CREEP SCORE', 'CREEP'], GPM: ['GPM'], Deaths: ['DEATHS'], 'Tower Kills': ['TOWER KILLS', 'TOWER'], Madstone: ['MADSTONE COLLECTED', 'MADSTONE'], Kills: ['KILLS'], 'Teamfight Participation': ['TEAMFIGHT PARTICIPATION', 'TEAMFIGHT'], 'Tormentor Kills': ['TORMENTOR KILLS', 'TORMENTOR'], 'Roshan Kills': ['ROSHAN KILLS', 'ROSHAN'], Stuns: ['STUNS'], 'Courier Kills': ['COURIER KILLS', 'COURIER'], 'First Blood': ['FIRST BLOOD'], Runes: ['RUNES GRABBED', 'RUNES'], Watchers: ['WATCHERS'], 'Wards Placed': ['WARDS PLACED', 'WARDS'], 'Smokes Used': ['SMOKES USED', 'SMOKES'], 'Camps Stacked': ['CAMPS STACKED', 'CAMPS'], Lotuses: ['LOTUSES'] };
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
function distance(a, b) { const p = Array.from({ length: b.length + 1 }, (_, i) => i), n = new Array(b.length + 1); for (let i = 1; i <= a.length; i++) {
    n[0] = i;
    for (let j = 1; j <= b.length; j++)
        n[j] = Math.min(n[j - 1] + 1, p[j] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j++)
        p[j] = n[j];
} return p[b.length]; }
function sim(a, b) { const x = norm(a), y = norm(b); if (!x || !y)
    return 0; if (x.includes(y) || y.includes(x))
    return Math.min(x.length, y.length) / Math.max(x.length, y.length); return 1 - distance(x, y) / Math.max(x.length, y.length); }
const cx = (w) => w.left + w.width / 2, cy = (w) => w.top + w.height / 2, text = (ws) => [...ws].sort((a, b) => a.left - b.left).map(w => w.text).join(' ');
function groups(ws) { const m = new Map(); for (const w of ws) {
    const r = m.get(w.lineKey) ?? [];
    r.push(w);
    m.set(w.lineKey, r);
} return m; }
async function runtime() { if (window.Tesseract)
    return window.Tesseract; await new Promise((ok, no) => { const old = document.querySelector('script[data-local-ocr]'); if (old) {
    old.addEventListener('load', () => ok(), { once: true });
    old.addEventListener('error', () => no(new Error('Local OCR failed to load.')), { once: true });
    return;
} const s = document.createElement('script'); s.src = OCR_CDN; s.async = true; s.dataset.localOcr = '1'; s.onload = () => ok(); s.onerror = () => no(new Error('Local OCR failed to load.')); document.head.appendChild(s); }); if (!window.Tesseract)
    throw new Error('Local OCR runtime is unavailable.'); return window.Tesseract; }
async function getWorker() { workerPromise ??= (async () => { const T = await runtime(); return await T.createWorker('eng'); })(); return await workerPromise; }
export async function warmLocalScreenshotOcr() { await getWorker(); }
async function decode(file) { if (!file.type.startsWith('image/'))
    throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).'); return await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('The selected screenshot could not be decoded.')); }; i.src = u; }); }
function canvas(i, max, c) { const s = c ?? { left: 0, top: 0, width: i.naturalWidth, height: i.naturalHeight }, k = Math.min(1, max / Math.max(s.width, s.height)), o = document.createElement('canvas'); o.width = Math.max(1, Math.round(s.width * k)); o.height = Math.max(1, Math.round(s.height * k)); const x = o.getContext('2d'); if (!x)
    throw new Error('Canvas image processing is unavailable.'); x.drawImage(i, s.left, s.top, s.width, s.height, 0, 0, o.width, o.height); return o; }
function parse(tsv) { if (!tsv)
    return []; const out = []; for (const row of tsv.split(/\r?\n/).slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || c[0] !== '5')
        continue;
    const t = c.slice(11).join('\t').trim();
    if (t)
        out.push({ text: t, confidence: Number(c[10]) || 0, left: Number(c[6]) || 0, top: Number(c[7]) || 0, width: Number(c[8]) || 0, height: Number(c[9]) || 0, lineKey: `${c[1]}:${c[2]}:${c[3]}:${c[4]}` });
} return out; }
async function run(w, c) { const t = performance.now(), r = await w.recognize(c, {}, { tsv: true }); return { words: parse(r.data.tsv), elapsedMs: performance.now() - t, width: c.width, height: c.height }; }
function cropRecognizedPass(p, c) { const words = p.words.filter(w => cx(w) >= c.left && cx(w) < c.left + c.width && cy(w) >= c.top && cy(w) < c.top + c.height).map(w => ({ ...w, left: w.left - c.left, top: w.top - c.top })); return { words, elapsedMs: 0, width: c.width, height: c.height }; }
function centers(ws, width) { const f = {}; for (const r of ROLES) {
    const a = ws.filter(w => sim(w.text, r.toUpperCase()) >= .72).sort((x, y) => y.confidence - x.confidence);
    if (a[0])
        f[r] = cx(a[0]);
} return Object.keys(f).length === 3 ? f : { core: width / 6, mid: width / 2, support: width * 5 / 6 }; }
function cropBox(p, sw, sh) { const c = centers(p.words, p.width), d = Math.min(c.mid - c.core, c.support - c.mid), l = Math.max(0, c.core - d * .58), r = Math.min(p.width, c.support + d * .58), h = p.words.filter(w => ROLES.some(x => sim(w.text, x.toUpperCase()) >= .72)), t = h.length ? Math.max(0, Math.min(...h.map(w => w.top)) - Math.max(20, p.height * .05)) : 0, sx = sw / p.width, sy = sh / p.height; return { left: Math.floor(l * sx), top: Math.floor(t * sy), width: Math.ceil((r - l) * sx), height: Math.ceil(sh - t * sy) }; }
function bands(ws, width) { const c = centers(ws, width), a = (c.core + c.mid) / 2, b = (c.mid + c.support) / 2; return { core: { left: 0, right: a }, mid: { left: a, right: b }, support: { left: b, right: width } }; }
function tiers(ws, b) { const ys = ws.filter(w => cx(w) >= b.left && cx(w) < b.right && sim(w.text, 'TIER') >= .65).map(cy).sort((a, z) => a - z), g = []; for (const y of ys) {
    if (!g.length || Math.abs(y - g.at(-1)) > 14)
        g.push(y);
    else
        g[g.length - 1] = (g.at(-1) + y) / 2;
} return g; }
function layoutOf(r) { const n = ROLES.map(x => r[x].length); if (n.filter(x => x >= 5).length >= 2)
    return 'expanded_5'; if (n.filter(x => x >= 3).length >= 2)
    return 'legacy_3'; return Math.max(...n) >= 5 ? 'expanded_5' : 'legacy_3'; }
const within = (ws, l, r, t, b) => ws.filter(w => cx(w) >= l && cx(w) < r && cy(w) >= t && cy(w) < b);
function statMatch(s, legal) { let best = { value: legal[0], score: -1 }; for (const v of legal) {
    const score = Math.max(...ALIASES[v].map(a => sim(s, a)));
    if (score > best.score)
        best = { value: v, score };
} return best; }
function traitMatch(s) { let best = { value: TRAITS[0], score: -1 }; for (const v of TRAITS) {
    const score = sim(s, v);
    if (score > best.score)
        best = { value: v, score };
} return best; }
function tierMatch(s) { const bonuses = [...s.matchAll(/([+-]?)(10|30|60|100|150)%/g)].map(m => Number(m[2])), bonus = bonuses.find(v => [10, 30, 60, 100, 150].includes(v)), byBonus = { 10: 1, 30: 2, 60: 3, 100: 4, 150: 5 }; if (bonus && byBonus[bonus])
    return { value: byBonus[bonus], score: .99 }; const m = s.toUpperCase().match(/(?:III|IV|II|V|I)/g) ?? [], v = m.find(x => x !== 'I') ?? m[0], map = { I: 1, II: 2, III: 3, IV: 4, V: 5 }; return v && map[v] ? { value: map[v], score: .82 } : { value: 1, score: .2 }; }
function conf(score, ws) { const o = ws.length ? ws.reduce((s, w) => s + w.confidence, 0) / ws.length / 100 : 0; return Math.max(0, Math.min(.99, score * .72 + o * .28)); }
function teamMatch(ws, role, data) { const s = text(ws); let best = { team: data.players.find(p => p.role === role)?.team ?? '', score: -1 }; for (const p of data.players.filter(x => x.role === role)) {
    const q = [p.name, ...p.attachedPlayers].map(n => sim(s, n)), strong = q.filter(x => x > .62), score = strong.length ? Math.min(.99, strong.reduce((a, b) => a + b, 0) / Math.min(2, strong.length)) : Math.max(...q, 0);
    if (score > best.score)
        best = { team: p.team, score };
} return best; }
function rowWindow(rows, i, height) { const y = rows[i] ?? height * (.18 + i * .14), prev = i ? rows[i - 1] : Math.max(0, y - 55), next = i < rows.length - 1 ? rows[i + 1] : Math.min(height, y + 65); return { top: i ? (prev + y) / 2 : Math.max(0, y - (next - y) * .55), bottom: i < rows.length - 1 ? (y + next) / 2 : Math.min(height, y + (y - prev) * .65) }; }
export async function parseScreenshotLocally(file, data) { const start = performance.now(), img = await decode(file), worker = await getWorker(), nativePixels = img.naturalWidth * img.naturalHeight; let local, ex, crop; if (nativePixels <= DIRECT_NATIVE_MAX_PIXELS) {
    const native = canvas(img, Number.POSITIVE_INFINITY);
    local = await run(worker, native);
    crop = cropBox(local, img.naturalWidth, img.naturalHeight);
    ex = cropRecognizedPass(local, crop);
}
else {
    const lc = canvas(img, LOCALIZE_MAX);
    local = await run(worker, lc);
    crop = cropBox(local, img.naturalWidth, img.naturalHeight);
    const ec = canvas(img, EXTRACT_MAX, crop);
    ex = await run(worker, ec);
} const bs = bands(ex.words, ex.width), rows = Object.fromEntries(ROLES.map(r => [r, tiers(ex.words, bs[r])])), layoutId = layoutOf(rows), layout = BOARD_LAYOUTS[layoutId], fc = [], warnings = [], banners = {}; for (const role of ROLES) {
    const b = bs[role], rs = rows[role], first = rs[0] ?? ex.height * .2, tw = within(ex.words, b.left, b.left + (b.right - b.left) * .58, 0, Math.max(first - 5, ex.height * .24)), tm = teamMatch(tw, role, data);
    fc.push({ path: `banners.${role}.selectedTeam`, confidence: tm.score });
    if (tm.score < .9)
        warnings.push(`${role} team OCR should be reviewed.`);
    const emblems = layout.roles[role].map((slot, i) => { const rw = rowWindow(rs, i, ex.height), ww = within(ex.words, b.left + (b.right - b.left) * .46, b.right, rw.top, rw.bottom), s = text(ww), sm = statMatch(s, LEGAL_STAT_POOLS[slot.color]), tr = traitMatch(s), qt = tierMatch(s), sc = conf(sm.score, ww), tc = conf(tr.score, ww); fc.push({ path: `banners.${role}.emblems.${i}.stat`, confidence: sc }, { path: `banners.${role}.emblems.${i}.qualityTier`, confidence: qt.score }, { path: `banners.${role}.emblems.${i}.trait`, confidence: tc }); if (Math.min(sc, qt.score, tc) < .9)
        warnings.push(`${role} emblem ${i + 1} OCR should be reviewed.`); return { position: slot.index, color: slot.color, stat: sm.value, qualityTier: qt.value, trait: tr.value }; });
    banners[role] = { selectedTeam: tm.team, emblems };
} const last = Math.max(...ROLES.flatMap(r => rows[r]), 0), lines = [...groups(ex.words.filter(w => cy(w) > last + 25)).values()].map(text), ops = [null, null, null], used = new Set(); let oi = 0; for (const line of lines) {
    if (oi >= 3)
        break;
    const m = ACTION_CATALOG.map(a => ({ id: a.id, score: sim(line, a.label) })).sort((a, b) => b.score - a.score)[0];
    if (m && m.score >= .62 && !used.has(m.id)) {
        ops[oi] = m.id;
        used.add(m.id);
        fc.push({ path: `operationIds.${oi}`, confidence: m.score });
        oi++;
    }
} while (oi < 3) {
    fc.push({ path: `operationIds.${oi}`, confidence: 0 });
    warnings.push(`Action ${oi + 1} is missing or unreadable.`);
    oi++;
} return { result: { layoutId, banners, operationIds: ops, fieldConfidence: fc, warnings }, metrics: { sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight, localizationWidth: local.width, localizationHeight: local.height, extractionWidth: ex.width, extractionHeight: ex.height, localizationMs: local.elapsedMs, extractionMs: ex.elapsedMs, totalMs: performance.now() - start, croppedPixelFraction: (crop.width * crop.height) / (img.naturalWidth * img.naturalHeight) } }; }
//# sourceMappingURL=localScreenshotOcr.js.map