import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import { matchStatText, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';
const ROLES = ['core', 'mid', 'support'];
let workerPromise;
function parse(tsv) { if (!tsv)
    return []; const out = []; for (const row of tsv.split(/\r?\n/).slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || c[0] !== '5')
        continue;
    const text = c.slice(11).join('\t').trim();
    if (text)
        out.push({ text, confidence: Number(c[10]) || 0, left: Number(c[6]) || 0, top: Number(c[7]) || 0, width: Number(c[8]) || 0, height: Number(c[9]) || 0 });
} return out; }
async function worker() { workerPromise ??= (async () => { const T = window.Tesseract; if (!T)
    throw new Error('Local OCR runtime is unavailable for emblem refinement.'); const w = await T.createWorker('eng'); await w.setParameters({ tessedit_pageseg_mode: '6' }); return w; })(); return workerPromise; }
async function image(file) { return await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('Could not decode screenshot for emblem refinement.')); }; i.src = u; }); }
function canvas(i, r) { const left = Math.max(0, Math.floor(r.left)), top = Math.max(0, Math.floor(r.top)), right = Math.min(i.naturalWidth, Math.ceil(r.left + r.width)), bottom = Math.min(i.naturalHeight, Math.ceil(r.top + r.height)), c = document.createElement('canvas'); c.width = Math.max(1, right - left); c.height = Math.max(1, bottom - top); const x = c.getContext('2d'); if (!x)
    throw new Error('Canvas unavailable.'); x.drawImage(i, left, top, c.width, c.height, 0, 0, c.width, c.height); return c; }
function confidenceFor(raw, path) { return raw.fieldConfidence?.find(x => x.path === path)?.confidence ?? 0; }
function setConfidence(raw, path, confidence) { raw.fieldConfidence ??= []; const old = raw.fieldConfidence.find(x => x.path === path); if (old)
    old.confidence = Math.max(old.confidence, confidence);
else
    raw.fieldConfidence.push({ path, confidence }); }
function extractionToSource(r, m) { const c = m.diagnostic.sourceCrop, sx = c.width / m.extractionWidth, sy = c.height / m.extractionHeight; return { left: c.left + r.left * sx, top: c.top + r.top * sy, width: r.width * sx, height: r.height * sy }; }
function orderedText(ws) { return [...ws].sort((a, b) => a.top - b.top || a.left - b.left).map(w => w.text).join(' '); }
function ocrConfidence(ws) { return ws.length ? ws.reduce((sum, w) => sum + w.confidence, 0) / ws.length / 100 : 0; }
function combined(match, ws) { return Math.max(0, Math.min(.99, match * .82 + ocrConfidence(ws) * .18)); }
function phrases(s, maxWords = 3) { const t = s.toUpperCase().match(/[A-Z0-9_-]+/g) ?? [], out = [...t]; for (let n = 2; n <= Math.min(maxWords, t.length); n++)
    for (let i = 0; i <= t.length - n; i++)
        out.push(t.slice(i, i + n).join(' ')); return out; }
function teamMatch(s, role, data) { let best = { team: data.players.find(p => p.role === role)?.team ?? '', score: 0 }; const ps = phrases(s, 3); for (const p of data.players.filter(x => x.role === role)) {
    const names = [p.name, ...p.attachedPlayers], scores = names.map(name => Math.max(0, ...ps.map(x => ocrSimilarity(x, name)))).sort((a, b) => b - a), strong = scores.filter(x => x >= .62), score = strong.length >= 2 ? Math.min(.99, (strong[0] + strong[1]) / 2) : scores[0] ?? 0;
    if (score > best.score)
        best = { team: p.team, score };
} return best; }
/**
 * Retry only unresolved structured fields from small native-resolution regions derived
 * from the extraction lattice. This deliberately avoids a second whole-image OCR pass.
 */
export async function refineUncertainScreenshotFields(file, data, raw, metrics) {
    const started = performance.now(), src = await image(file), w = await worker(), layout = BOARD_LAYOUTS[raw.layoutId];
    let retries = 0;
    const diagnostics = new Map(metrics.diagnostic.emblems.map(e => [`${e.role}:${e.rowIndex}`, e]));
    for (const role of ROLES) {
        for (let i = 0; i < layout.roles[role].length; i++) {
            const sp = `banners.${role}.emblems.${i}.stat`, qp = `banners.${role}.emblems.${i}.qualityTier`, tp = `banners.${role}.emblems.${i}.trait`;
            if (Math.min(confidenceFor(raw, sp), confidenceFor(raw, qp), confidenceFor(raw, tp)) >= .9)
                continue;
            const d = diagnostics.get(`${role}:${i}`);
            if (!d)
                continue;
            const rr = extractionToSource({ left: Math.max(0, d.roi.left - d.roi.width * .08), top: Math.max(0, d.roi.top - d.roi.height * .08), width: d.roi.width * 1.13, height: d.roi.height * 1.16 }, metrics);
            const rec = await w.recognize(canvas(src, rr), { tessedit_pageseg_mode: '6' }, { tsv: true }), words = parse(rec.data.tsv), s = orderedText(words);
            retries++;
            const slot = layout.roles[role][i], sm = matchStatText(s, LEGAL_STAT_POOLS[slot.color]), tm = matchTraitText(s), qm = matchTierText(s), sc = combined(sm.score, words), tc = combined(tm.score, words), qc = combined(qm.score, words);
            if (sm.score >= .58 && sc > confidenceFor(raw, sp)) {
                raw.banners[role].emblems[i].stat = sm.value;
                setConfidence(raw, sp, sc);
            }
            if (tm.score >= .62 && tc > confidenceFor(raw, tp)) {
                raw.banners[role].emblems[i].trait = tm.value;
                setConfidence(raw, tp, tc);
            }
            if (qm.score >= .72 && qc > confidenceFor(raw, qp)) {
                raw.banners[role].emblems[i].qualityTier = qm.value;
                setConfidence(raw, qp, qc);
            }
        }
    }
    // Team/player text is smaller than emblem text. Retry only roles whose initial evidence
    // was weak, using the non-emblem side of the recovered banner band at native pixels.
    const rows = metrics.diagnostic.globalRows, pitch = rows.length > 1 ? rows[1] - rows[0] : Math.max(55, metrics.extractionHeight * .08), first = rows[0] ?? metrics.extractionHeight * .12;
    for (const role of ROLES) {
        const path = `banners.${role}.selectedTeam`;
        if (confidenceFor(raw, path) >= .9)
            continue;
        const band = metrics.diagnostic.columnBands[role], bw = band.right - band.left, rect = extractionToSource({ left: Math.max(0, band.left - bw * .05), top: 0, width: bw * .48, height: Math.min(metrics.extractionHeight, first + pitch * .9) }, metrics), rec = await w.recognize(canvas(src, rect), { tessedit_pageseg_mode: '6' }, { tsv: true }), words = parse(rec.data.tsv), match = teamMatch(orderedText(words), role, data), confidence = combined(match.score, words);
        retries++;
        if (match.score >= .62 && confidence > confidenceFor(raw, path)) {
            raw.banners[role].selectedTeam = match.team;
            setConfidence(raw, path, confidence);
        }
    }
    return { result: raw, elapsedMs: performance.now() - started, retries };
}
// Compatibility export for older callers; the production path now supplies geometry metrics.
export async function refineUncertainEmblemStats(file, data, raw) { void file; void data; return raw; }
//# sourceMappingURL=emblemOcrRefinement.js.map