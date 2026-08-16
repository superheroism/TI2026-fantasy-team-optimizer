import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import { matchActionText, matchStatText, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';
const ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
let workerPromise;
function parse(tsv) { if (!tsv)
    return []; const out = []; for (const row of tsv.split(/\r?\n/).slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || c[0] !== '5')
        continue;
    const text = c.slice(11).join('\t').trim();
    if (text)
        out.push({ text, confidence: Number(c[10]) || 0, left: Number(c[6]) || 0, top: Number(c[7]) || 0, width: Number(c[8]) || 0, height: Number(c[9]) || 0, lineKey: `${c[1]}:${c[2]}:${c[3]}:${c[4]}` });
} return out; }
async function worker() { workerPromise ??= (async () => { const T = window.Tesseract; if (!T)
    throw new Error('Local OCR runtime is unavailable for screenshot refinement.'); const w = await T.createWorker('eng'); await w.setParameters({ tessedit_pageseg_mode: '6' }); return w; })(); return workerPromise; }
async function image(file) { return await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('Could not decode screenshot for refinement.')); }; i.src = u; }); }
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
function lines(ws) { const grouped = new Map(); for (const w of ws) {
    const row = grouped.get(w.lineKey) ?? [];
    row.push(w);
    grouped.set(w.lineKey, row);
} return [...grouped.values()].map(words => { const sorted = [...words].sort((a, b) => a.left - b.left); return { words: sorted, text: sorted.map(w => w.text).join(' '), y: sorted.reduce((s, w) => s + w.top + w.height / 2, 0) / sorted.length, x: sorted.reduce((s, w) => s + w.left + w.width / 2, 0) / sorted.length }; }).sort((a, b) => a.y - b.y); }
function phrases(s, maxWords = 3) { const t = s.toUpperCase().match(/[A-Z0-9_-]+/g) ?? [], out = [...t]; for (let n = 2; n <= Math.min(maxWords, t.length); n++)
    for (let i = 0; i <= t.length - n; i++)
        out.push(t.slice(i, i + n).join(' ')); return out; }
function teamMatch(s, role, data) { let best = { team: data.players.find(p => p.role === role)?.team ?? '', score: 0 }; const ps = phrases(s, 3); for (const p of data.players.filter(x => x.role === role)) {
    const names = [p.name, ...p.attachedPlayers], scores = names.map(name => Math.max(0, ...ps.map(x => ocrSimilarity(x, name)))).sort((a, b) => b - a), strong = scores.filter(x => x >= .62), score = strong.length >= 2 ? Math.min(.99, (strong[0] + strong[1]) / 2) : scores[0] ?? 0;
    if (score > best.score)
        best = { team: p.team, score };
} return best; }
function bestTierLine(ls) { let best = { match: { value: 1, score: .2 } }; for (const line of ls) {
    const match = matchTierText(line.text), hasTier = line.words.some(w => ocrSimilarity(w.text, 'TIER') >= .62), bonus = line.words.some(w => /^\+?(10|30|60|100|150)%$/.test(w.text.replace(/[“”'`]/g, ''))), score = Math.min(.99, match.score + (hasTier ? .08 : 0) + (bonus ? .08 : 0));
    if (score > best.match.score)
        best = { match: { value: match.value, score }, line };
} return best; }
function bestTraitLine(ls) { let best = { match: { value: 'Fractal', score: 0 } }; for (const line of ls) {
    const match = matchTraitText(line.text), score = Math.min(.99, match.score + (TRAITS.some(t => line.text.toUpperCase().includes(t.toUpperCase())) ? .08 : 0));
    if (score > best.match.score)
        best = { match: { value: match.value, score }, line };
} return best; }
function actionWordScore(s) { return Math.max(...['REROLL', 'RANDOMLY', 'INCREASE', 'QUALITY', 'TRAIT', 'STAT', 'FIRST', 'LAST', 'RED', 'BLUE', 'GREEN', 'EMBLEM', 'EMBLEMS'].map(x => ocrSimilarity(s, x))); }
function cluster3(words) {
    const candidates = words.filter(w => actionWordScore(w.text) >= .6);
    if (candidates.length < 6)
        return undefined;
    let centers = [...candidates].sort((a, b) => (a.left + a.width / 2) - (b.left + b.width / 2));
    let c = [centers[Math.floor(centers.length * .15)], centers[Math.floor(centers.length * .5)], centers[Math.floor(centers.length * .85)]].map(w => w.left + w.width / 2);
    let groups = [[], [], []];
    for (let iter = 0; iter < 10; iter++) {
        groups = [[], [], []];
        for (const w of candidates) {
            const x = w.left + w.width / 2;
            let k = 0;
            if (Math.abs(x - c[1]) < Math.abs(x - c[k]))
                k = 1;
            if (Math.abs(x - c[2]) < Math.abs(x - c[k]))
                k = 2;
            groups[k].push(w);
        }
        if (groups.some(g => g.length < 2))
            return undefined;
        c = groups.map(g => g.reduce((s, w) => s + w.left + w.width / 2, 0) / g.length);
    }
    return groups.map(g => [...g].sort((a, b) => a.top - b.top || a.left - b.left)).sort((a, b) => a.reduce((s, w) => s + w.left + w.width / 2, 0) / a.length - b.reduce((s, w) => s + w.left + w.width / 2, 0) / b.length);
}
function parseTokens(s) { const m = s.match(/ROLL\s*TOKENS?\s*[:\-]?\s*(\d+)/i) ?? s.match(/TOKENS?\s*[:\-]?\s*(\d+)/i); return m ? Number(m[1]) : undefined; }
/** Retry only unresolved structured fields from native-resolution regions derived from observed geometry. */
export async function refineUncertainScreenshotFields(file, data, raw, metrics) {
    const started = performance.now(), src = await image(file), w = await worker(), layout = BOARD_LAYOUTS[raw.layoutId];
    let retries = 0, emblemRetries = 0, teamRetries = 0, footerRetries = 0;
    const diagnostics = new Map(metrics.diagnostic.emblems.map(e => [`${e.role}:${e.rowIndex}`, e]));
    for (const role of ROLES) {
        for (let i = 0; i < layout.roles[role].length; i++) {
            const sp = `banners.${role}.emblems.${i}.stat`, qp = `banners.${role}.emblems.${i}.qualityTier`, tp = `banners.${role}.emblems.${i}.trait`, d = diagnostics.get(`${role}:${i}`);
            if (!d)
                continue;
            if (confidenceFor(raw, qp) >= .9 && confidenceFor(raw, tp) >= .9)
                continue;
            const rr = extractionToSource({ left: Math.max(0, d.roi.left - d.roi.width * .05), top: Math.max(0, d.roi.top - d.roi.height * .08), width: d.roi.width * 1.08, height: d.roi.height * 1.16 }, metrics), rec = await w.recognize(canvas(src, rr), { tessedit_pageseg_mode: '6' }, { tsv: true }), words = parse(rec.data.tsv), ls = lines(words);
            retries++;
            emblemRetries++;
            // Stats are already the strongest field in live expanded-board evidence. Only replace one on overwhelming legal evidence.
            if (confidenceFor(raw, sp) < .9) {
                const sm = matchStatText(ls[0]?.text ?? orderedText(words), LEGAL_STAT_POOLS[layout.roles[role][i].color]), sc = combined(sm.score, ls[0]?.words ?? words);
                if (sm.score >= .92 && sc >= .9 && sc > confidenceFor(raw, sp)) {
                    raw.banners[role].emblems[i].stat = sm.value;
                    setConfidence(raw, sp, sc);
                }
            }
            const tier = bestTierLine(ls), qc = combined(tier.match.score, tier.line?.words ?? words);
            if (tier.match.score >= .72 && qc > confidenceFor(raw, qp)) {
                raw.banners[role].emblems[i].qualityTier = tier.match.value;
                setConfidence(raw, qp, qc);
                d.normalizedTier = tier.match.value;
                d.tierMatchScore = tier.match.score;
            }
            const trait = bestTraitLine(ls), tc = combined(trait.match.score, trait.line?.words ?? words);
            if (trait.match.score >= .62 && tc > confidenceFor(raw, tp)) {
                raw.banners[role].emblems[i].trait = trait.match.value;
                setConfidence(raw, tp, tc);
                d.normalizedTrait = trait.match.value;
                d.traitMatchScore = trait.match.score;
            }
            d.finalConfidence = Math.min(confidenceFor(raw, sp), confidenceFor(raw, qp), confidenceFor(raw, tp));
            d.reviewRequired = d.finalConfidence < .9;
        }
    }
    const rows = metrics.diagnostic.globalRows, pitch = rows.length > 1 ? rows.slice(1).map((y, i) => y - rows[i]).sort((a, b) => a - b)[Math.floor((rows.length - 1) / 2)] : Math.max(55, metrics.extractionHeight * .08), first = rows[0] ?? metrics.extractionHeight * .12;
    for (const role of ROLES) {
        const path = `banners.${role}.selectedTeam`;
        if (confidenceFor(raw, path) >= .9)
            continue;
        const band = metrics.diagnostic.columnBands[role], bw = band.right - band.left, rect = extractionToSource({ left: Math.max(0, band.left - bw * .08), top: 0, width: bw * .55, height: Math.min(metrics.extractionHeight, first + pitch * .75) }, metrics), rec = await w.recognize(canvas(src, rect), { tessedit_pageseg_mode: '6' }, { tsv: true }), words = parse(rec.data.tsv), s = orderedText(words), match = teamMatch(s, role, data), confidence = combined(match.score, words);
        retries++;
        teamRetries++;
        metrics.diagnostic.teamEvidence[role] = { rawText: s, normalizedTeam: match.team, matchScore: match.score };
        if (match.score >= .62 && confidence > confidenceFor(raw, path)) {
            raw.banners[role].selectedTeam = match.team;
            setConfidence(raw, path, confidence);
        }
    }
    // Footer recovery is independent of the optional "REROLL OPERATIONS" label. The five-row lattice tells us where cards end;
    // OCR one bounded bottom strip, then cluster action vocabulary into three horizontal button groups.
    if (raw.operationIds.some(x => x === null) || raw.tokensRemaining === undefined) {
        const last = rows.at(-1) ?? metrics.extractionHeight * .58, footerTop = Math.min(metrics.extractionHeight * .82, last + pitch * .72), footerRect = extractionToSource({ left: metrics.extractionWidth * .22, top: footerTop, width: metrics.extractionWidth * .72, height: metrics.extractionHeight - footerTop }, metrics), rec = await w.recognize(canvas(src, footerRect), { tessedit_pageseg_mode: '6' }, { tsv: true }), words = parse(rec.data.tsv), all = orderedText(words);
        retries++;
        footerRetries++;
        if (raw.tokensRemaining === undefined) {
            const n = parseTokens(all);
            if (n !== undefined) {
                raw.tokensRemaining = n;
                setConfidence(raw, 'tokensRemaining', .96);
                metrics.diagnostic.tokenEvidence = { rawText: all, value: n, confidence: .96 };
            }
            else
                metrics.diagnostic.tokenEvidence = { rawText: all, value: null, confidence: 0 };
        }
        const groups = cluster3(words);
        if (groups) {
            const cardTexts = groups.map(g => orderedText(g)), resolved = [null, null, null];
            for (let i = 0; i < 3; i++) {
                const match = matchActionText(cardTexts[i] ?? '');
                if (match && match.score >= .58) {
                    resolved[i] = match.id;
                    raw.operationIds[i] = match.id;
                    setConfidence(raw, `operationIds.${i}`, match.score);
                }
            }
            metrics.diagnostic.actionEvidence = { resolved, reason: resolved.every(Boolean) ? 'resolved-by-footer-clustering' : 'footer-clustering-partial', cardTexts };
        }
        else
            metrics.diagnostic.actionEvidence = { resolved: [null, null, null], reason: 'footer-action-clustering-underdetermined', cardTexts: [all] };
    }
    const elapsedMs = performance.now() - started;
    const diagnostic = metrics.diagnostic;
    diagnostic.refinementEvidence = { attempted: true, emblemRetries, teamRetries, footerRetries, elapsedMs };
    // Clear only warnings whose field was actually recovered; unresolved fields remain conservative review items.
    raw.warnings = (raw.warnings ?? []).filter(warning => {
        const action = /Action (\d)/.exec(warning);
        if (action) {
            const i = Number(action[1]) - 1;
            return raw.operationIds[i] === null;
        }
        if (/Roll token count/i.test(warning))
            return raw.tokensRemaining === undefined;
        return true;
    });
    return { result: raw, elapsedMs, retries };
}
export async function refineUncertainEmblemStats(file, data, raw) { void file; void data; return raw; }
//# sourceMappingURL=emblemOcrRefinement.js.map