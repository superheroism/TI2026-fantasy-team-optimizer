import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import { matchActionText, matchStatText, matchTierText, matchTraitText } from './ocrDomainMatch.js';
import { createOcrExecutionBudget, recognizeWithBudget, validateOcrRect } from './ocrRecognition.js';
import { selectBalancedCardColumns, selectRoleColumnConsensus } from './roleColumnGeometry.js';
import { classifyLayoutEvidence, fitRowLattice, fitTierAnchoredLattice, rowWindows } from './rowLattice.js';
const ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const ALL_STATS = [...new Set(Object.values(LEGAL_STAT_POOLS).flat())];
const OCR_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
const LOCALIZE_MAX = 1100;
const EXTRACT_MAX = 1440;
const DIRECT_NATIVE_MAX_PIXELS = 2_000_000;
const REVIEW_THRESHOLD = .9;
let workerPromise;
const ALIASES = {
    'Creep Score': ['CREEP SCORE', 'CREEP'], GPM: ['GPM'], Deaths: ['DEATHS'], 'Tower Kills': ['TOWER KILLS', 'TOWER'],
    Madstone: ['MADSTONE COLLECTED', 'MADSTONE'], Kills: ['KILLS'], 'Teamfight Participation': ['TEAMFIGHT PARTICIPATION', 'TEAMFIGHT'],
    'Tormentor Kills': ['TORMENTOR KILLS', 'TORMENTOR'], 'Roshan Kills': ['ROSHAN KILLS', 'ROSHAN'], Stuns: ['STUNS'],
    'Courier Kills': ['COURIER KILLS', 'COURIER'], 'First Blood': ['FIRST BLOOD'], Runes: ['RUNES GRABBED', 'RUNES'],
    Watchers: ['WATCHERS'], 'Wards Placed': ['WARDS PLACED', 'WARDS'], 'Smokes Used': ['SMOKES USED', 'SMOKES'],
    'Camps Stacked': ['CAMPS STACKED', 'CAMPS'], Lotuses: ['LOTUSES'],
};
const CARD_ANCHORS = [...new Set([...TRAITS, 'TIER', ...Object.values(ALIASES).flat().flatMap(x => x.split(/\s+/))])];
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
const cx = (w) => w.left + w.width / 2;
const cy = (w) => w.top + w.height / 2;
const text = (ws) => [...ws].sort((a, b) => a.left - b.left).map(w => w.text).join(' ');
const wordDiagnostic = (w) => ({ text: w.text, confidence: w.confidence, x: cx(w), y: cy(w) });
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
async function getWorker() { workerPromise ??= (async () => { const T = await runtime(), w = await T.createWorker('eng'); await w.setParameters({ tessedit_pageseg_mode: '3' }); return w; })(); return await workerPromise; }
async function resetWorker() { const pending = workerPromise; workerPromise = undefined; if (!pending)
    return; try {
    const w = await pending;
    await w.terminate?.();
}
catch { /* best-effort reset after timeout */ } }
export async function diagnoseLocalScreenshotOcr(file) { const budget = createOcrExecutionBudget(), img = await decode(file), w = await getWorker(), started = performance.now(), crop = { left: 0, top: 0, width: img.naturalWidth, height: img.naturalHeight }; const r = await recognizeWithBudget(w, file, budget, { stage: 'diagnostic', psm: 3, crop, canvasWidth: img.naturalWidth, canvasHeight: img.naturalHeight }, {}, { tsv: true }, resetWorker); const rawText = r.data.text ?? '', rawTsv = r.data.tsv ?? '', words = parse(rawTsv); return { sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight, fileType: file.type, fileBytes: file.size, elapsedMs: performance.now() - started, textLength: rawText.length, tsvLength: rawTsv.length, tsvLines: rawTsv ? rawTsv.split(/\r?\n/).length : 0, parsedWordCount: words.length, sampleText: rawText.replace(/\s+/g, ' ').trim().slice(0, 500), sampleWords: words.slice(0, 30).map(x => x.text), ocrCalls: budget.calls }; }
export async function warmLocalScreenshotOcr() { await getWorker(); }
async function decode(file) { if (!file.type.startsWith('image/'))
    throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).'); return await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('The selected screenshot could not be decoded.')); }; i.src = u; }); }
function canvas(i, max, c) { const s = c ?? { left: 0, top: 0, width: i.naturalWidth, height: i.naturalHeight }, o = document.createElement('canvas'); if (validateOcrRect(s, i.naturalWidth, i.naturalHeight)) {
    o.width = 0;
    o.height = 0;
    return o;
} const k = Math.min(1, max / Math.max(s.width, s.height)); o.width = Math.max(1, Math.round(s.width * k)); o.height = Math.max(1, Math.round(s.height * k)); const x = o.getContext('2d'); if (!x)
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
async function run(w, c, budget, stage, crop) { const t = performance.now(), r = await recognizeWithBudget(w, c, budget, { stage, psm: 3, ...(crop ? { crop } : {}), canvasWidth: c.width, canvasHeight: c.height }, {}, { tsv: true }, resetWorker); return { words: parse(r.data.tsv), elapsedMs: performance.now() - t, width: c.width, height: c.height }; }
async function runPsm(w, c, budget, stage, psm, crop) { const t = performance.now(); await w.setParameters({ tessedit_pageseg_mode: String(psm) }); try {
    const r = await recognizeWithBudget(w, c, budget, { stage, psm, ...(crop ? { crop } : {}), canvasWidth: c.width, canvasHeight: c.height }, {}, { tsv: true }, resetWorker);
    return { words: parse(r.data.tsv), elapsedMs: performance.now() - t, width: c.width, height: c.height };
}
finally {
    if (!budget.exhausted)
        await w.setParameters({ tessedit_pageseg_mode: '3' });
} }
function cropRecognizedPass(p, c) { const words = p.words.filter(w => cx(w) >= c.left && cx(w) < c.left + c.width && cy(w) >= c.top && cy(w) < c.top + c.height).map(w => ({ ...w, left: w.left - c.left, top: w.top - c.top })); return { words, elapsedMs: 0, width: c.width, height: c.height }; }
function cardAnchorScore(w) { return Math.max(...CARD_ANCHORS.map(a => sim(w.text, a))); }
function cardAnchor(w) { return cardAnchorScore(w) >= .72; }
function cluster3(xs, width) { if (xs.length < 6)
    return null; const c = [...xs].sort((a, b) => a - b); let m = [c[Math.floor(c.length * .15)], c[Math.floor(c.length * .5)], c[Math.floor(c.length * .85)]]; for (let it = 0; it < 12; it++) {
    const g = [[], [], []];
    for (const x of c) {
        let j = 0;
        if (Math.abs(x - m[1]) < Math.abs(x - m[j]))
            j = 1;
        if (Math.abs(x - m[2]) < Math.abs(x - m[j]))
            j = 2;
        g[j].push(x);
    }
    if (g.some(x => x.length < 2))
        return null;
    m = g.map((x, i) => x.length ? x.reduce((a, b) => a + b, 0) / x.length : m[i]);
    m.sort((a, b) => a - b);
} if (m[2] - m[0] < width * .35)
    return null; const d1 = m[1] - m[0], d2 = m[2] - m[1]; if (Math.min(d1, d2) / Math.max(d1, d2) < .55)
    return null; return m; }
function centerResult(ws, width, height) { const roleCandidates = []; for (const r of ROLES) {
    const a = ws.map(w => ({ w, similarity: sim(w.text, r.toUpperCase()) })).filter(x => x.similarity >= .72).sort((x, y) => y.w.confidence - x.w.confidence);
    for (const x of a)
        roleCandidates.push({ ...wordDiagnostic(x.w), role: r, similarity: x.similarity });
} const anchors = ws.map(w => ({ w, similarity: cardAnchorScore(w) })).filter(x => x.similarity >= .72).map(x => ({ ...wordDiagnostic(x.w), similarity: x.similarity })); const consensus = selectRoleColumnConsensus(roleCandidates, width, height); if (consensus) {
    const selectedRoleCandidates = Object.values(consensus.observed).filter(Boolean);
    return { centers: consensus.centers, method: 'role-labels', roleCandidates, selectedRoleCandidates, cardAnchors: anchors };
} const balanced = selectBalancedCardColumns(anchors, width, height), clustered = balanced ?? cluster3(anchors.map(x => x.x), width); if (clustered)
    return { centers: { core: clustered[0], mid: clustered[1], support: clustered[2] }, method: 'card-anchor-clustering', roleCandidates, selectedRoleCandidates: [], cardAnchors: anchors }; return { centers: { core: width / 6, mid: width / 2, support: width * 5 / 6 }, method: 'fallback', roleCandidates, selectedRoleCandidates: [], cardAnchors: anchors }; }
function cropBox(p, sw, sh) { const g = centerResult(p.words, p.width, p.height), c = g.centers, d = Math.min(c.mid - c.core, c.support - c.mid), l = Math.max(0, c.core - d * .62), r = Math.min(p.width, c.support + d * .62), card = p.words.filter(cardAnchor), roleTop = g.selectedRoleCandidates.length ? Math.min(...g.selectedRoleCandidates.map(w => w.y)) : undefined, cardTop = card.length ? Math.min(...card.map(w => w.top)) : undefined, topEvidence = g.method === 'fallback' ? undefined : (roleTop ?? cardTop), t = topEvidence === undefined ? 0 : Math.max(0, topEvidence - Math.max(20, p.height * .05)), sx = sw / p.width, sy = sh / p.height, localization = { left: l, top: t, width: r - l, height: p.height - t }, source = { left: Math.floor(l * sx), top: Math.floor(t * sy), width: Math.ceil((r - l) * sx), height: Math.ceil(sh - t * sy) }; return { source, localization, geometry: g }; }
function bandsFromCenters(c, width) { const a = (c.core + c.mid) / 2, b = (c.mid + c.support) / 2; return { core: { left: Math.max(0, c.core - (a - c.core) * 1.05), right: a }, mid: { left: a, right: b }, support: { left: b, right: Math.min(width, c.support + (c.support - b) * 1.05) } }; }
function clusteredYs(ys, tolerance) { const s = [...ys].sort((a, b) => a - b), g = []; for (const y of s) {
    if (!g.length || Math.abs(y - g.at(-1)) > tolerance)
        g.push(y);
    else
        g[g.length - 1] = (g.at(-1) + y) / 2;
} return g; }
function tierWords(ws, b) { return ws.filter(w => cx(w) >= b.left && cx(w) < b.right && sim(w.text, 'TIER') >= .65); }
function tiers(ws, b, height) { const tol = Math.max(10, Math.min(22, height * .018)); return clusteredYs(tierWords(ws, b).map(cy), tol); }
function rowStreams(ws, b, height) { const tolerance = Math.max(10, Math.min(22, height * .018)), actionY = lineRecords(ws).filter(line => norm(line.s).includes('REROLLOPERATIONS') || norm(line.s).includes('ROLLTOKENS')).map(line => line.y).sort((a, b) => a - b)[0] ?? height, lines = lineRecords(ws).filter(line => line.x >= b.left && line.x < b.right && line.y < actionY), tier = tiers(ws.filter(word => cy(word) < actionY), b, height), stat = clusteredYs(lines.filter(line => matchStatText(line.s, ALL_STATS).score >= .58).map(line => line.y), tolerance), trait = clusteredYs(lines.filter(line => matchTraitText(line.s).score >= .62).map(line => line.y), tolerance), card = clusteredYs(ws.filter(word => cx(word) >= b.left && cx(word) < b.right && cy(word) < actionY && cardAnchor(word)).map(cy), tolerance), semantic = clusteredYs([...tier, ...stat, ...trait, ...card], tolerance); return { tier, semantic, stat, trait, card }; }
function sparseExpandedRows(rows) { if (rows.length < 3)
    return false; const sorted = [...rows].sort((a, b) => a - b), diffs = sorted.slice(1).map((value, index) => value - sorted[index]).filter(value => value > 0); if (diffs.length < 2)
    return false; const base = Math.min(...diffs); if (!Number.isFinite(base) || base <= 0)
    return false; let steps = 0; for (const diff of diffs) {
    const n = Math.max(1, Math.round(diff / base));
    if (Math.abs(diff / base - n) > .22)
        return false;
    steps += n;
} return steps >= 4; }
function resolveRows(ws, bs, height) { const perRole = Object.fromEntries(ROLES.map(role => [role, rowStreams(ws, bs[role], height)])), streams = ['tier', 'semantic', 'stat', 'trait', 'card'], global = Object.fromEntries(streams.map(stream => [stream, clusteredYs(ROLES.flatMap(role => perRole[role][stream]), Math.max(10, Math.min(22, height * .018)))])); const evidence = streams.map(stream => ({ stream, evidence: classifyLayoutEvidence(Object.fromEntries(ROLES.map(role => [role, perRole[role][stream]])), global[stream]) })), tierEvidence = evidence.find(row => row.stream === 'tier').evidence, expanded = evidence.filter(row => row.evidence.kind === 'expanded_5').sort((a, b) => b.evidence.confidence - a.evidence.confidence), legacy = evidence.filter(row => row.evidence.kind === 'legacy_3').sort((a, b) => b.evidence.confidence - a.evidence.confidence), sparseExpanded = sparseExpandedRows(global.tier); let layoutId; if (tierEvidence.kind === 'expanded_5' || sparseExpanded)
    layoutId = 'expanded_5';
else if (tierEvidence.kind === 'legacy_3' && tierEvidence.confidence >= .82)
    layoutId = 'legacy_3';
else if (expanded.length)
    layoutId = 'expanded_5';
else if (legacy.length >= 2 || (legacy.length === 1 && legacy[0].evidence.confidence >= .9))
    layoutId = 'legacy_3';
else
    throw new Error('Screenshot layout is unresolved; review is required.'); const rowCount = layoutId === 'expanded_5' ? 5 : 3, fits = streams.map(stream => ({ stream, fit: fitRowLattice(global[stream], rowCount, height) })).filter((row) => row.fit !== null).sort((a, b) => b.fit.matchedRows - a.fit.matchedRows || b.fit.confidence - a.fit.confidence); if (!fits.length)
    throw new Error('Screenshot row geometry is unresolved; review is required.'); const broad = fits[0], tierAnchored = fitTierAnchoredLattice(global.tier, rowCount, height, broad.fit), best = tierAnchored ? { stream: 'tier', fit: tierAnchored } : broad; return { layoutId, rows: best.fit.rows, synthesized: best.fit.synthesized, source: best.stream, confidence: best.fit.confidence, tierRows: Object.fromEntries(ROLES.map(role => [role, perRole[role].tier])) }; }
const within = (ws, l, r, t, b) => ws.filter(w => cx(w) >= l && cx(w) < r && cy(w) >= t && cy(w) < b);
function statMatch(s, legal) { return matchStatText(s, legal); }
function traitMatch(s) { return matchTraitText(s); }
function tierMatch(s) { return matchTierText(s); }
function tierMatchWords(ws) { let best = { value: 1, score: .2 }; for (const line of groups(ws).values()) {
    const match = tierMatch(text(line));
    if (match.score > best.score)
        best = match;
} return best; }
function conf(score, ws) { const o = ws.length ? ws.reduce((s, w) => s + w.confidence, 0) / ws.length / 100 : 0; return Math.max(0, Math.min(.99, score * .72 + o * .28)); }
function teamMatch(ws, role, data) { const s = text(ws); let best = { team: data.players.find(p => p.role === role)?.team ?? '', score: -1 }; for (const p of data.players.filter(x => x.role === role)) {
    const q = [p.name, ...p.attachedPlayers].map(n => sim(s, n)), strong = q.filter(x => x > .62), score = strong.length ? Math.min(.99, strong.reduce((a, b) => a + b, 0) / Math.min(2, strong.length)) : Math.max(...q, 0);
    if (score > best.score)
        best = { team: p.team, score };
} return best; }
function rowWindow(rows, i, height) { const window = rowWindows(rows, height)[i]; return window ? { top: window.top, bottom: window.bottom, synthesized: false } : { top: 0, bottom: 0, synthesized: true }; }
function actionMatch(s) { return matchActionText(s); }
function lineRecords(ws) { return [...groups(ws).values()].map(words => ({ words, s: text(words), y: words.reduce((a, w) => a + cy(w), 0) / words.length, x: words.reduce((a, w) => a + cx(w), 0) / words.length })); }
function tokenCount(ws) { for (const line of lineRecords(ws)) {
    if (!norm(line.s).includes('ROLLTOKENS'))
        continue;
    const m = line.s.match(/ROLL\s*TOKENS?\s*[:\-]?\s*(\d+)/i) ?? line.s.match(/(\d+)\s*$/);
    if (m)
        return { value: Number(m[1]), confidence: .97, rawText: line.s };
} const anchors = ws.filter(w => sim(w.text, 'TOKENS') > .68); for (const a of anchors) {
    const nums = ws.filter(w => cy(w) > a.top - a.height && cy(w) < a.top + a.height * 2 && cx(w) > cx(a) && cx(w) < cx(a) + Math.max(100, a.height * 12) && /^\d+$/.test(w.text));
    if (nums[0])
        return { value: Number(nums[0].text), confidence: Math.min(.95, nums[0].confidence / 100), rawText: `${a.text} ${nums[0].text}` };
} return undefined; }
function actionGeometry(ex, rows) { const lines = lineRecords(ex.words), anchor = lines.filter(l => norm(l.s).includes('REROLLOPERATIONS') || norm(l.s).includes('ROLLTOKENS')).sort((a, b) => b.y - a.y)[0]; if (!anchor)
    return undefined; const c = centerResult(ex.words, ex.width, ex.height).centers, d = Math.min(c.mid - c.core, c.support - c.mid), pitch = rows.length > 1 ? rows.slice(1).map((y, i) => y - rows[i]).sort((a, b) => a - b)[Math.floor((rows.length - 1) / 2)] : Math.max(55, ex.height * .08), total = Math.min(ex.width * .8, d * 1.9), center = norm(anchor.s).includes('REROLLOPERATIONS') ? anchor.x : c.mid, left = Math.max(0, center - total / 2), top = Math.max(0, anchor.y - pitch * 1.15), height = Math.max(32, pitch * .78), gap = Math.max(4, total * .012), cardW = (total - gap * 2) / 3; return { cards: [0, 1, 2].map(i => ({ left: left + i * (cardW + gap), top, width: cardW, height })), anchorY: anchor.y }; }
function sourceRect(r, crop, ex, sw, sh) { const sx = crop.width / ex.width, sy = crop.height / ex.height; const left = Math.max(0, Math.floor(crop.left + r.left * sx)), top = Math.max(0, Math.floor(crop.top + r.top * sy)), right = Math.min(sw, Math.ceil(crop.left + (r.left + r.width) * sx)), bottom = Math.min(sh, Math.ceil(crop.top + (r.top + r.height) * sy)); return { left, top, width: right - left, height: bottom - top }; }
async function parseActions(worker, img, ex, crop, rows, fc, warnings, budget) { const ops = [null, null, null], g = actionGeometry(ex, rows), cardTexts = ['', '', '']; if (!g) {
    for (let i = 0; i < 3; i++) {
        fc.push({ path: `operationIds.${i}`, confidence: 0 });
        warnings.push(`Action ${i + 1} is missing or unreadable.`);
    }
    return { ops, extraMs: 0, cardTexts, reason: 'action-region-anchor-not-found' };
} let extraMs = 0; for (let i = 0; i < 3; i++) {
    const r = g.cards[i], existing = within(ex.words, r.left, r.left + r.width, r.top, r.top + r.height);
    cardTexts[i] = text(existing);
    let best = actionMatch(cardTexts[i]);
    if (!best || best.score < .82) {
        const sr = sourceRect(r, crop, ex, img.naturalWidth, img.naturalHeight), p = await run(worker, canvas(img, Number.POSITIVE_INFINITY, sr), budget, `action:${i + 1}`, sr);
        extraMs += p.elapsedMs;
        cardTexts[i] = text(p.words);
        best = actionMatch(cardTexts[i]);
    }
    if (best && best.score >= .58) {
        ops[i] = best.id;
        fc.push({ path: `operationIds.${i}`, confidence: best.score });
        if (best.score < .9)
            warnings.push(`Action ${i + 1} OCR should be reviewed.`);
    }
    else {
        fc.push({ path: `operationIds.${i}`, confidence: 0 });
        warnings.push(`Action ${i + 1} is missing or unreadable.`);
    }
} if (new Set(ops.filter((x) => x !== null)).size !== ops.filter(x => x !== null).length) {
    for (let i = 0; i < 3; i++) {
        ops[i] = null;
        fc.push({ path: `operationIds.${i}`, confidence: 0 });
    }
    warnings.push('Reroll actions could not be uniquely resolved.');
    return { ops, extraMs, cardTexts, reason: 'action-candidates-not-unique' };
} return { ops, extraMs, cardTexts, reason: ops.every(Boolean) ? 'resolved' : 'one-or-more-actions-unresolved' }; }
export async function parseScreenshotLocally(file, data) {
    const start = performance.now(), budget = createOcrExecutionBudget(), img = await decode(file), worker = await getWorker(), nativePixels = img.naturalWidth * img.naturalHeight;
    let local, ex, crop, localizationCrop, localGeometry;
    if (nativePixels <= DIRECT_NATIVE_MAX_PIXELS) {
        const native = canvas(img, Number.POSITIVE_INFINITY);
        local = await run(worker, native, budget, 'localization', { left: 0, top: 0, width: img.naturalWidth, height: img.naturalHeight });
        const box = cropBox(local, img.naturalWidth, img.naturalHeight);
        crop = box.source;
        localizationCrop = box.localization;
        localGeometry = box.geometry;
        ex = cropRecognizedPass(local, crop);
    }
    else {
        const lc = canvas(img, LOCALIZE_MAX);
        local = await run(worker, lc, budget, 'localization', { left: 0, top: 0, width: img.naturalWidth, height: img.naturalHeight });
        const box = cropBox(local, img.naturalWidth, img.naturalHeight);
        crop = box.source;
        localizationCrop = box.localization;
        localGeometry = box.geometry;
        const ec = canvas(img, EXTRACT_MAX, crop);
        ex = await run(worker, ec, budget, 'extraction', crop);
    }
    let extractionGeometry = centerResult(ex.words, ex.width, ex.height), bs = bandsFromCenters(extractionGeometry.centers, ex.width), resolvedRows;
    try {
        resolvedRows = resolveRows(ex.words, bs, ex.height);
    }
    catch (initialError) {
        if (budget.exhausted)
            throw initialError;
        const recoveryCanvas = canvas(img, EXTRACT_MAX, crop), recovery = await runPsm(worker, recoveryCanvas, budget, 'layout-recovery', 6, crop), recoveryGeometry = centerResult(recovery.words, recovery.width, recovery.height), recoveryBands = bandsFromCenters(recoveryGeometry.centers, recovery.width);
        try {
            const recoveredRows = resolveRows(recovery.words, recoveryBands, recovery.height);
            ex = { ...recovery, elapsedMs: ex.elapsedMs + recovery.elapsedMs };
            extractionGeometry = recoveryGeometry;
            bs = recoveryBands;
            resolvedRows = recoveredRows;
        }
        catch {
            throw initialError;
        }
    }
    const detected = resolvedRows.tierRows, pooledResult = { rows: resolvedRows.rows, synthesized: resolvedRows.synthesized }, pooled = pooledResult.rows, layoutId = resolvedRows.layoutId, layout = BOARD_LAYOUTS[layoutId], rows = Object.fromEntries(ROLES.map(r => [r, [...pooled]]));
    const fc = [], warnings = [], banners = {}, emblemDiagnostics = [], teamEvidence = {};
    const geometryConfidenceCap = extractionGeometry.method === 'fallback' || pooledResult.synthesized ? .85 : 1;
    if (localGeometry.method === 'fallback')
        warnings.push('Board localization used conservative fallback geometry; imported board fields require review.');
    if (extractionGeometry.method === 'fallback')
        warnings.push('Board columns used conservative fallback geometry; imported board fields require review.');
    let synthesizedRows = pooledResult.synthesized;
    for (const role of ROLES) {
        const b = bs[role], rs = rows[role], first = rs[0] ?? ex.height * .2, bandWidth = b.right - b.left, emblemLeft = b.left + bandWidth * .42, pitch = rs.length > 1 ? Math.abs(rs[1] - rs[0]) : Math.max(55, ex.height * .08), tw = within(ex.words, Math.max(0, b.left - bandWidth * .04), Math.min(ex.width, b.right + bandWidth * .04), 0, Math.min(ex.height, first + pitch * .7)), tm = teamMatch(tw, role, data), teamConfidence = Math.min(tm.score, geometryConfidenceCap);
        teamEvidence[role] = { rawText: text(tw), normalizedTeam: tm.team, matchScore: tm.score };
        fc.push({ path: `banners.${role}.selectedTeam`, confidence: teamConfidence });
        if (teamConfidence < .9)
            warnings.push(`${role} team OCR should be reviewed.`);
        const emblems = layout.roles[role].map((slot, i) => { const rw = rowWindow(rs, i, ex.height); synthesizedRows ||= rw.synthesized; const statRoi = { left: b.left, top: rw.top, width: b.right - b.left, height: rw.bottom - rw.top }, roi = { left: b.left + (b.right - b.left) * .42, top: rw.top, width: b.right - (b.left + (b.right - b.left) * .42), height: rw.bottom - rw.top }, ww = within(ex.words, statRoi.left, statRoi.left + statRoi.width, statRoi.top, statRoi.top + statRoi.height), dw = within(ex.words, roi.left, roi.left + roi.width, roi.top, roi.top + roi.height), statText = text(ww), detailText = text(dw), sm = statMatch(statText, LEGAL_STAT_POOLS[slot.color]), tr = traitMatch(detailText), qt = tierMatchWords(dw), sc = Math.min(conf(sm.score, ww), geometryConfidenceCap), tc = Math.min(conf(tr.score, dw), geometryConfidenceCap), qc = Math.min(qt.score, geometryConfidenceCap), finalConfidence = Math.min(sc, qc, tc); fc.push({ path: `banners.${role}.emblems.${i}.stat`, confidence: sc }, { path: `banners.${role}.emblems.${i}.qualityTier`, confidence: qc }, { path: `banners.${role}.emblems.${i}.trait`, confidence: tc }); if (finalConfidence < .9)
            warnings.push(`${role} emblem ${i + 1} OCR should be reviewed.`); emblemDiagnostics.push({ role, rowIndex: i, roi, synthesizedRow: rw.synthesized, words: dw.map(wordDiagnostic), inferredColor: slot.color, rawText: statText, normalizedStat: sm.value, statMatchScore: sm.score, rawTierText: detailText, normalizedTier: qt.value, tierMatchScore: qt.score, rawTraitText: detailText, normalizedTrait: tr.value, traitMatchScore: tr.score, finalConfidence, reviewRequired: finalConfidence < REVIEW_THRESHOLD }); return { position: slot.index, color: slot.color, stat: sm.value, qualityTier: qt.value, trait: tr.value }; });
        banners[role] = { selectedTeam: tm.team, emblems };
    }
    const actionRows = pooled.length ? pooled : ROLES.flatMap(r => rows[r]), actions = await parseActions(worker, img, ex, crop, actionRows, fc, warnings, budget);
    let tokens = tokenCount(ex.words), tokenRetryMs = 0;
    if (!tokens) {
        const ag = actionGeometry(ex, actionRows);
        if (ag) {
            const pitch = actionRows.length > 1 ? actionRows.slice(1).map((y, i) => y - actionRows[i]).sort((a, b) => a - b)[Math.floor((actionRows.length - 1) / 2)] : Math.max(55, ex.height * .08), r = { left: Math.max(0, ag.cards[1].left), top: Math.max(0, ag.anchorY - pitch * .4), width: Math.min(ex.width - ag.cards[1].left, ag.cards[1].width * 2.35), height: Math.min(ex.height - (ag.anchorY - pitch * .4), pitch * .95) }, sr = sourceRect(r, crop, ex, img.naturalWidth, img.naturalHeight), retry = await run(worker, canvas(img, Number.POSITIVE_INFINITY, sr), budget, 'footer', sr);
            tokenRetryMs = retry.elapsedMs;
            tokens = tokenCount(retry.words);
        }
    }
    if (geometryConfidenceCap < 1) {
        for (const field of fc)
            if (field.path.startsWith('operationIds.'))
                field.confidence = Math.min(field.confidence, geometryConfidenceCap);
    }
    const result = { layoutId, banners, operationIds: actions.ops, fieldConfidence: fc, warnings };
    if (tokens) {
        result.tokensRemaining = tokens.value;
        fc.push({ path: 'tokensRemaining', confidence: tokens.confidence });
    }
    else {
        fc.push({ path: 'tokensRemaining', confidence: 0 });
        warnings.push('Roll token count is missing or unreadable.');
    }
    if (budget.exhausted && !warnings.some(warning => warning.includes('OCR execution budget')))
        warnings.push('OCR execution budget was exhausted; unresolved fields require review.');
    const tierCandidates = ROLES.flatMap(role => tierWords(ex.words, bs[role]).map(w => ({ ...wordDiagnostic(w), role, similarity: sim(w.text, 'TIER') })));
    const diagnostic = { localizationWordCount: local.words.length, extractionWordCount: ex.words.length, roleCandidates: localGeometry.roleCandidates, cardAnchors: localGeometry.cardAnchors, columnLocalizationMethod: localGeometry.method, localizationColumnCenters: localGeometry.centers, localizationCrop, sourceCrop: crop, extractionColumnMethod: extractionGeometry.method, extractionColumnCenters: extractionGeometry.centers, columnBands: bs, tierCandidates, tierRowsByColumn: detected, globalRows: pooled, inferredLayout: layoutId, synthesizedRows, emblems: emblemDiagnostics, teamEvidence, actionEvidence: { resolved: actions.ops, reason: actions.reason, cardTexts: actions.cardTexts }, tokenEvidence: { rawText: tokens?.rawText ?? '', value: tokens?.value ?? null, confidence: tokens?.confidence ?? 0 } };
    return { result, metrics: { sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight, localizationWidth: local.width, localizationHeight: local.height, extractionWidth: ex.width, extractionHeight: ex.height, localizationMs: local.elapsedMs, extractionMs: ex.elapsedMs, targetedRetryMs: actions.extraMs + tokenRetryMs, totalMs: performance.now() - start, croppedPixelFraction: (crop.width * crop.height) / (img.naturalWidth * img.naturalHeight), processedPixels: { localization: local.width * local.height, extraction: ex.width * ex.height }, diagnostic, ocrExecution: budget } };
}
//# sourceMappingURL=localScreenshotOcr.js.map