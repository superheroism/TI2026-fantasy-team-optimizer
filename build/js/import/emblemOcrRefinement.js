import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import { matchActionText, matchStatLines, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';
import { otsuWhitenessRgba } from './ocrImagePreprocess.js';
import { recognizeWithBudget, remainingOcrBudgetMs, validateOcrRect } from './ocrRecognition.js';
import { acceptsStatEvidence, shouldRetryStat, shouldRetryTier } from './ocrRetryPolicy.js';
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
async function resetWorker() { const pending = workerPromise; workerPromise = undefined; if (!pending)
    return; try {
    const w = await pending;
    await w.terminate?.();
}
catch { /* best-effort reset after timeout */ } }
async function recognize(w, c, budget, stage, psm, crop) { return await recognizeWithBudget(w, c, budget, { stage, psm, crop, canvasWidth: c.width, canvasHeight: c.height }, { tessedit_pageseg_mode: String(psm) }, { tsv: true }, resetWorker); }
async function image(file) { return await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error('Could not decode screenshot for refinement.')); }; i.src = u; }); }
function canvas(i, r) { const left = Math.max(0, Math.floor(r.left)), top = Math.max(0, Math.floor(r.top)), right = Math.min(i.naturalWidth, Math.ceil(r.left + r.width)), bottom = Math.min(i.naturalHeight, Math.ceil(r.top + r.height)), clipped = { left, top, width: right - left, height: bottom - top }, c = document.createElement('canvas'); if (validateOcrRect(clipped, i.naturalWidth, i.naturalHeight)) {
    c.width = 0;
    c.height = 0;
    return c;
} c.width = clipped.width; c.height = clipped.height; const x = c.getContext('2d'); if (!x)
    throw new Error('Canvas unavailable.'); x.drawImage(i, left, top, c.width, c.height, 0, 0, c.width, c.height); return c; }
function otsuCanvas(source) { const c = document.createElement('canvas'); c.width = source.width; c.height = source.height; if (source.width <= 0 || source.height <= 0)
    return c; const x = c.getContext('2d'); if (!x)
    throw new Error('Canvas unavailable.'); x.drawImage(source, 0, 0); const image = x.getImageData(0, 0, c.width, c.height), processed = otsuWhitenessRgba(image.data); image.data.set(processed.rgba); x.putImageData(image, 0, 0); return c; }
function confidenceFor(raw, path) { return raw.fieldConfidence?.find(x => x.path === path)?.confidence ?? 0; }
function setConfidence(raw, path, confidence) { raw.fieldConfidence ??= []; const old = raw.fieldConfidence.find(x => x.path === path); if (old)
    old.confidence = Math.max(old.confidence, confidence);
else
    raw.fieldConfidence.push({ path, confidence }); }
function replaceConfidence(raw, path, confidence) { raw.fieldConfidence ??= []; const old = raw.fieldConfidence.find(x => x.path === path); if (old)
    old.confidence = Math.max(0, Math.min(1, confidence));
else
    raw.fieldConfidence.push({ path, confidence: Math.max(0, Math.min(1, confidence)) }); }
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
function directTier(line) { const raw = line.words.map(w => w.text.replace(/[“”'`]/g, '').toUpperCase()), tierIndex = line.words.findIndex(w => ocrSimilarity(w.text, 'TIER') >= .62); if (tierIndex >= 0) {
    for (const value of raw.slice(tierIndex + 1, tierIndex + 3)) {
        const token = value.replace(/[^A-Z0-9\]|]/g, '');
        const roman = token.match(/^(I|II|III|IV|V)$/)?.[1];
        if (roman)
            return { value: { I: 1, II: 2, III: 3, IV: 4, V: 5 }[roman], score: .97 };
        const confused = token.replace(/[1L|]/g, 'I').replace(/]/g, 'I');
        if (confused === 'I')
            return { value: 1, score: .8 };
        if (confused === 'II' || confused === 'III')
            return { value: confused.length, score: .8 };
    }
} return undefined; }
function bestTierLine(ls) { let best = { match: { value: 1, score: .2 }, direct: false }; for (const line of ls) {
    const exact = directTier(line);
    if (exact && exact.score > best.match.score)
        best = { match: exact, line, direct: true };
    else if (!best.direct) {
        const match = matchTierText(line.text), hasTier = line.words.some(w => ocrSimilarity(w.text, 'TIER') >= .62), score = Math.min(.85, match.score + (hasTier ? .08 : 0));
        if (score > best.match.score)
            best = { match: { value: match.value, score }, line, direct: false };
    }
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
function actionFamily(id) { return id.replace(/-(?:all|first|last|random)$/, ''); }
function isScopedAction(id) { return /-(?:first|last|random)$/.test(id); }
function hasScopeEvidence(text) { const words = text.toUpperCase().match(/[A-Z0-9]+/g) ?? []; return ['FIRST', 'LAST', 'RANDOM'].some(scope => words.some(word => ocrSimilarity(word, scope) >= .72)); }
/** Retry only unresolved structured fields from native-resolution regions derived from observed geometry. */
export async function refineUncertainScreenshotFields(file, data, raw, metrics) {
    const started = performance.now(), budget = metrics.ocrExecution, layout = BOARD_LAYOUTS[raw.layoutId];
    let retries = 0, emblemRetries = 0, teamRetries = 0, footerRetries = 0;
    if (budget.exhausted || remainingOcrBudgetMs(budget) <= 0) {
        budget.exhausted = true;
        if (!raw.warnings?.some(warning => warning.includes('OCR execution budget')))
            raw.warnings = [...(raw.warnings ?? []), 'OCR execution budget was exhausted; unresolved fields require review.'];
        return { result: raw, elapsedMs: performance.now() - started, retries };
    }
    const src = await image(file), w = await worker();
    const diagnostics = new Map(metrics.diagnostic.emblems.map(e => [`${e.role}:${e.rowIndex}`, e]));
    for (const role of ROLES) {
        for (let i = 0; i < layout.roles[role].length; i++) {
            const sp = `banners.${role}.emblems.${i}.stat`, qp = `banners.${role}.emblems.${i}.qualityTier`, tp = `banners.${role}.emblems.${i}.trait`, d = diagnostics.get(`${role}:${i}`);
            if (!d)
                continue;
            if (!shouldRetryStat(confidenceFor(raw, sp)) && confidenceFor(raw, qp) >= .9 && confidenceFor(raw, tp) >= .9)
                continue;
            const roleBand = metrics.diagnostic.columnBands[role], rr = extractionToSource({ left: Math.max(0, d.roi.left - d.roi.width * .05), top: Math.max(0, d.roi.top - d.roi.height * .08), width: d.roi.width * 1.08, height: d.roi.height * 1.16 }, metrics), emblemCanvas = canvas(src, rr), rec = await recognize(w, emblemCanvas, budget, `emblem:${role}:${i + 1}:psm6`, 6, rr), words = parse(rec.data.tsv), ls = lines(words);
            retries++;
            emblemRetries++;
            let strongSupplementalTier = false;
            if (shouldRetryStat(confidenceFor(raw, sp)) && !budget.exhausted) {
                const cardAlignedStat = metrics.diagnostic.extractionColumnMethod === 'role-labels', statLeft = cardAlignedStat ? Math.max(roleBand.left, d.roi.left - d.roi.width * .08) : roleBand.left, statWidth = cardAlignedStat ? Math.max(1, roleBand.right - statLeft) : (roleBand.right - roleBand.left) * .78, nameRoi = { left: statLeft, top: d.roi.top, width: statWidth, height: d.roi.height }, statStrip = extractionToSource(nameRoi, metrics), statCanvas = canvas(src, statStrip), statRec = await recognize(w, statCanvas, budget, `stat:${role}:${i + 1}:psm6`, 6, statStrip), statWords = parse(statRec.data.tsv), statLines = lines(statWords), statTier = bestTierLine(statLines), sm = matchStatLines(statLines.map(line => line.text), LEGAL_STAT_POOLS[layout.roles[role][i].color]), evidenceWords = sm.lineIndices.flatMap(index => statLines[index]?.words ?? []), sc = combined(sm.score, evidenceWords);
                retries++;
                emblemRetries++;
                if (acceptsStatEvidence(sm.score, sc, sm.score - sm.runnerUpScore) && sc > confidenceFor(raw, sp)) {
                    raw.banners[role].emblems[i].stat = sm.value;
                    setConfidence(raw, sp, sc);
                    d.normalizedStat = sm.value;
                    d.statMatchScore = sm.score;
                }
                if (statTier.direct) {
                    const stc = combined(statTier.match.score, statTier.line?.words ?? statWords);
                    if (stc > confidenceFor(raw, qp)) {
                        raw.banners[role].emblems[i].qualityTier = statTier.match.value;
                        replaceConfidence(raw, qp, Math.min(.84, stc));
                        d.normalizedTier = statTier.match.value;
                        d.tierMatchScore = statTier.match.score;
                    }
                    if (statTier.match.score >= .9 && statTier.match.value !== 1)
                        strongSupplementalTier = true;
                }
            }
            if (!budget.exhausted && confidenceFor(raw, sp) < .7 && metrics.diagnostic.extractionColumnMethod === 'card-anchor-clustering' && Object.values(metrics.diagnostic.tierRowsByColumn).some(rs => rs.length > 0)) {
                const fallbackLeft = Math.max(roleBand.left, d.roi.left - d.roi.width * .08), fallbackRoi = { left: fallbackLeft, top: d.roi.top, width: Math.max(1, roleBand.right - fallbackLeft), height: d.roi.height }, fallbackStrip = extractionToSource(fallbackRoi, metrics), fallbackCanvas = canvas(src, fallbackStrip), fallbackRec = await recognize(w, fallbackCanvas, budget, `stat:${role}:${i + 1}:card-psm6`, 6, fallbackStrip), fallbackWords = parse(fallbackRec.data.tsv), fallbackLines = lines(fallbackWords), fallbackMatch = matchStatLines(fallbackLines.map(line => line.text), LEGAL_STAT_POOLS[layout.roles[role][i].color]), fallbackEvidence = fallbackMatch.lineIndices.flatMap(index => fallbackLines[index]?.words ?? []), fallbackConfidence = combined(fallbackMatch.score, fallbackEvidence);
                retries++;
                emblemRetries++;
                if (acceptsStatEvidence(fallbackMatch.score, fallbackConfidence, fallbackMatch.score - fallbackMatch.runnerUpScore) && fallbackConfidence > confidenceFor(raw, sp)) {
                    raw.banners[role].emblems[i].stat = fallbackMatch.value;
                    setConfidence(raw, sp, fallbackConfidence);
                    d.normalizedStat = fallbackMatch.value;
                    d.statMatchScore = fallbackMatch.score;
                }
            }
            ;
            const tier = bestTierLine(ls), tierConfidence = combined(tier.match.score, tier.line?.words ?? words);
            if (tier.direct && tierConfidence > confidenceFor(raw, qp)) {
                raw.banners[role].emblems[i].qualityTier = tier.match.value;
                replaceConfidence(raw, qp, Math.min(.84, tierConfidence));
                d.normalizedTier = tier.match.value;
                d.tierMatchScore = tier.match.score;
            }
            if (!budget.exhausted && !tier.direct && !strongSupplementalTier && shouldRetryTier(confidenceFor(raw, qp))) {
                const base = extractionToSource(d.roi, metrics), strip = { left: base.left + base.width * .02, top: base.top + base.height * .27, width: base.width * .74, height: base.height * .42 }, rawTierCanvas = canvas(src, strip), rawTierRec = await recognize(w, rawTierCanvas, budget, `tier:${role}:${i + 1}:raw`, 7, strip), rawTierWords = parse(rawTierRec.data.tsv), rawTier = bestTierLine(lines(rawTierWords)), processedTierCanvas = otsuCanvas(rawTierCanvas), otsuTierRec = await recognize(w, processedTierCanvas, budget, `tier:${role}:${i + 1}:otsu`, 7, strip), otsuTierWords = parse(otsuTierRec.data.tsv), otsuTier = bestTierLine(lines(otsuTierWords));
                retries += 2;
                emblemRetries += 2;
                const direct = [tier, rawTier, otsuTier].filter(candidate => candidate.direct), counts = new Map();
                for (const candidate of direct)
                    counts.set(candidate.match.value, (counts.get(candidate.match.value) ?? 0) + 1);
                const consensus = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
                if (consensus && consensus[1] >= 2) {
                    const value = consensus[0], support = direct.filter(candidate => candidate.match.value === value), confidence = Math.min(.99, Math.max(...support.map(candidate => combined(candidate.match.score, candidate.line?.words ?? []))));
                    raw.banners[role].emblems[i].qualityTier = value;
                    replaceConfidence(raw, qp, confidence);
                    d.normalizedTier = value;
                    d.tierMatchScore = Math.max(...support.map(candidate => candidate.match.score));
                }
                else if (new Set(direct.map(candidate => candidate.match.value)).size > 1) {
                    replaceConfidence(raw, qp, Math.min(confidenceFor(raw, qp), .72));
                }
                else if (direct.length === 1) {
                    const lone = direct[0], confidence = Math.min(.84, combined(lone.match.score, lone.line?.words ?? []));
                    raw.banners[role].emblems[i].qualityTier = lone.match.value;
                    replaceConfidence(raw, qp, confidence);
                    d.normalizedTier = lone.match.value;
                    d.tierMatchScore = lone.match.score;
                }
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
        if (budget.exhausted || confidenceFor(raw, path) >= .9)
            continue;
        const band = metrics.diagnostic.columnBands[role], bw = band.right - band.left, rect = extractionToSource({ left: Math.max(0, band.left - bw * .08), top: 0, width: bw * .55, height: Math.min(metrics.extractionHeight, first + pitch * .75) }, metrics), teamCanvas = canvas(src, rect), rec = await recognize(w, teamCanvas, budget, `team:${role}`, 6, rect), words = parse(rec.data.tsv), s = orderedText(words), match = teamMatch(s, role, data), confidence = combined(match.score, words);
        retries++;
        teamRetries++;
        metrics.diagnostic.teamEvidence[role] = { rawText: s, normalizedTeam: match.team, matchScore: match.score };
        if (match.score >= .62 && confidence > confidenceFor(raw, path)) {
            raw.banners[role].selectedTeam = match.team;
            setConfidence(raw, path, confidence);
        }
    }
    if (!budget.exhausted && (raw.operationIds.some(x => x === null) || raw.tokensRemaining === undefined)) {
        const last = rows.at(-1) ?? metrics.extractionHeight * .58, footerTop = Math.min(metrics.extractionHeight * .82, last + pitch * .72), footerRect = extractionToSource({ left: metrics.extractionWidth * .22, top: footerTop, width: metrics.extractionWidth * .72, height: metrics.extractionHeight - footerTop }, metrics), footerCanvas = canvas(src, footerRect), rec = await recognize(w, footerCanvas, budget, 'footer', 6, footerRect), words = parse(rec.data.tsv), all = orderedText(words);
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
        const groupedActions = [undefined, undefined, undefined], actionGroups = cluster3(words);
        if (actionGroups?.length === 3) {
            for (let i = 0; i < 3; i++) {
                const groupText = orderedText(actionGroups[i]), match = matchActionText(groupText);
                if (match && match.score >= .58)
                    groupedActions[i] = match;
            }
        }
        const centers = metrics.diagnostic.extractionColumnCenters, buttonCenters = [(centers.core + centers.mid) / 2, centers.mid, (centers.mid + centers.support) / 2], spacing = Math.min(buttonCenters[1] - buttonCenters[0], buttonCenters[2] - buttonCenters[1]), sx = metrics.diagnostic.sourceCrop.width / metrics.extractionWidth, tokenAnchors = words.filter(x => ocrSimilarity(x.text, 'TOKENS') >= .62), tokenY = tokenAnchors.length ? tokenAnchors.reduce((sum, x) => sum + x.top + x.height / 2, 0) / tokenAnchors.length : footerRect.height * .88, expandedActionCrop = metrics.diagnostic.extractionColumnMethod === 'card-anchor-clustering', buttonTop = Math.max(0, tokenY - footerRect.height * (expandedActionCrop ? .40 : .34)), buttonHeight = Math.min(footerRect.height - buttonTop, footerRect.height * (expandedActionCrop ? .30 : .24)), buttonWidth = spacing * sx * (expandedActionCrop ? 1.22 : 1.08), resolved = [null, null, null], cardTexts = [];
        for (let i = 0; i < 3; i++) {
            const centerSource = metrics.diagnostic.sourceCrop.left + buttonCenters[i] * sx, rect = { left: centerSource - buttonWidth / 2, top: footerRect.top + buttonTop, width: buttonWidth, height: buttonHeight }, buttonCanvas = canvas(src, rect), buttonRec = await recognize(w, buttonCanvas, budget, `action:${i + 1}`, 6, rect), buttonWords = parse(buttonRec.data.tsv), buttonText = orderedText(buttonWords), match = matchActionText(buttonText);
            retries++;
            footerRetries++;
            cardTexts.push(buttonText);
            if (match && match.score >= .58) {
                const grouped = groupedActions[i], preferScopedGroup = grouped && grouped.score >= .68 && isScopedAction(grouped.id) && /-all$/.test(match.id) && actionFamily(grouped.id) === actionFamily(match.id) && !hasScopeEvidence(buttonText);
                if (preferScopedGroup) {
                    raw.operationIds[i] = grouped.id;
                    replaceConfidence(raw, `operationIds.${i}`, grouped.score);
                }
                else {
                    raw.operationIds[i] = match.id;
                    replaceConfidence(raw, `operationIds.${i}`, match.score);
                }
            }
            else {
                const fallback = groupedActions[i];
                if (raw.operationIds[i] === null && fallback && fallback.score >= .58) {
                    raw.operationIds[i] = fallback.id;
                    replaceConfidence(raw, `operationIds.${i}`, fallback.score);
                }
            }
            resolved[i] = raw.operationIds[i] ?? null;
        }
        metrics.diagnostic.actionEvidence = { resolved, reason: resolved.every(Boolean) ? 'resolved-by-native-button-crops' : 'native-button-crops-partial', cardTexts };
    }
    if (budget.exhausted && !raw.warnings?.some(warning => warning.includes('OCR execution budget')))
        raw.warnings = [...(raw.warnings ?? []), 'OCR execution budget was exhausted; unresolved fields require review.'];
    const elapsedMs = performance.now() - started;
    const diagnostic = metrics.diagnostic;
    diagnostic.refinementEvidence = { attempted: true, emblemRetries, teamRetries, footerRetries, elapsedMs };
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