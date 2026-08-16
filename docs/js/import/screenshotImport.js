import { BOARD_LAYOUTS, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../data/actionCatalog.js';
import { parseScreenshotLocally } from './localScreenshotOcr.js';
import { refineUncertainEmblemStats } from './emblemOcrRefinement.js';
const ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const REVIEW_THRESHOLD = .9;
let lastLocalOcrMetrics;
export function getLastLocalOcrMetrics() { return lastLocalOcrMetrics; }
function assertRecord(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`${label} is missing or invalid.`); }
function asLayoutId(v) { if (v !== 'legacy_3' && v !== 'expanded_5')
    throw new Error('Screenshot parser returned an unsupported board layout.'); return v; }
function asTeam(v, role, data) { if (typeof v !== 'string')
    throw new Error(`Screenshot parser did not return a ${role} team.`); const legal = new Set(data.players.filter(p => p.role === role).map(p => p.team)); if (!legal.has(v))
    throw new Error(`Screenshot parser returned unknown ${role} team: ${v}.`); return v; }
function asTier(v, path) { if (!Number.isInteger(v) || Number(v) < 1 || Number(v) > 5)
    throw new Error(`${path} has an invalid quality tier.`); return Number(v); }
function asTrait(v, path) { if (typeof v !== 'string' || !TRAITS.includes(v))
    throw new Error(`${path} has an invalid trait.`); return v; }
function confidences(v) { if (!Array.isArray(v))
    return []; const out = []; for (const row of v) {
    if (!row || typeof row !== 'object')
        continue;
    const c = row;
    if (typeof c.path === 'string' && typeof c.confidence === 'number' && Number.isFinite(c.confidence))
        out.push({ path: c.path, confidence: Math.max(0, Math.min(1, c.confidence)) });
} return out; }
export function screenshotImportRequest(imageDataUrl, data) { const teamsByRole = Object.fromEntries(ROLES.map(role => [role, [...new Set(data.players.filter(p => p.role === role).map(p => p.team))].sort()])); return { imageDataUrl, teamsByRole, actions: ACTION_CATALOG.map(a => ({ id: a.id, label: a.label })) }; }
export function validateScreenshotImport(raw, data, currentBoard, currentMenu) { assertRecord(raw, 'Screenshot import'); const layoutId = asLayoutId(raw.layoutId); assertRecord(raw.banners, 'Screenshot banners'); const layout = BOARD_LAYOUTS[layoutId], board = {}; for (const role of ROLES) {
    const rb = raw.banners[role];
    assertRecord(rb, `${role} banner`);
    const selectedTeam = asTeam(rb.selectedTeam, role, data), re = rb.emblems;
    if (!Array.isArray(re))
        throw new Error(`${role} emblems are missing.`);
    const slots = layout.roles[role];
    if (re.length !== slots.length)
        throw new Error(`${role} has ${re.length} parsed emblems but ${layoutId} requires ${slots.length}.`);
    const emblems = slots.map((slot, index) => { const c = re[index]; assertRecord(c, `${role} emblem ${index + 1}`); if (c.position !== slot.index)
        throw new Error(`${role} emblem ${index + 1} has the wrong position.`); if (c.color !== slot.color)
        throw new Error(`${role} emblem ${index + 1} color conflicts with the ${layoutId} layout.`); if (typeof c.stat !== 'string' || !isLegalStat(slot.color, c.stat))
        throw new Error(`${role} emblem ${index + 1} returned an illegal ${slot.color} stat.`); return { id: `${role}-${slot.index}`, position: slot.index, color: slot.color, stat: c.stat, qualityTier: asTier(c.qualityTier, `${role} emblem ${index + 1}`), trait: asTrait(c.trait, `${role} emblem ${index + 1}`) }; });
    board[role] = { role, selectedTeam, expectedSeries: currentBoard[role].expectedSeries, emblems };
} if (layoutId !== 'legacy_3')
    board.layoutId = layoutId; if (!Array.isArray(raw.operationIds) || raw.operationIds.length !== 3)
    throw new Error('Screenshot parser must return exactly three offered-action slots.'); const fc = confidences(raw.fieldConfidence), warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((x) => typeof x === 'string' && x.trim().length > 0) : [], resolved = []; raw.operationIds.forEach((v, index) => { if (v === null) {
    resolved.push(currentMenu[index].id);
    if (!fc.some(x => x.path === `operationIds.${index}`))
        fc.push({ path: `operationIds.${index}`, confidence: 0 });
    if (!warnings.some(x => x.includes(`Action ${index + 1}`)))
        warnings.push(`Action ${index + 1} was not visible; existing action preserved until reviewed.`);
    return;
} if (typeof v !== 'string' || !ACTION_BY_ID.has(v))
    throw new Error(`Screenshot parser returned unknown action: ${String(v)}.`); resolved.push(v); }); const visible = raw.operationIds.filter((v) => typeof v === 'string'); if (new Set(visible).size !== visible.length)
    throw new Error('Screenshot parser returned duplicate offered actions.'); const menu = resolved.map(id => cloneAction(ACTION_BY_ID.get(id))); let tokensRemaining; if (raw.tokensRemaining !== undefined) {
    if (!Number.isInteger(raw.tokensRemaining) || Number(raw.tokensRemaining) < 0)
        throw new Error('Screenshot parser returned an invalid token count.');
    tokensRemaining = Number(raw.tokensRemaining);
} const lowConfidenceFields = fc.filter(x => x.confidence < REVIEW_THRESHOLD), result = { board, menu, warnings, lowConfidenceFields, requiresReview: warnings.length > 0 || lowConfidenceFields.length > 0 }; if (tokensRemaining !== undefined)
    result.tokensRemaining = tokensRemaining; return result; }
export async function fileToScreenshotDataUrl(file, maxDimension = 1800) { if (!file.type.startsWith('image/'))
    throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).'); const source = await new Promise((ok, no) => { const image = new Image(), url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); ok(image); }; image.onerror = () => { URL.revokeObjectURL(url); no(new Error('The selected screenshot could not be decoded.')); }; image.src = url; }); const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight)), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(source.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(source.naturalHeight * scale)); const ctx = canvas.getContext('2d'); if (!ctx)
    throw new Error('Canvas image processing is unavailable in this browser.'); ctx.drawImage(source, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', .9); }
async function visionFallback(file, data) { const endpoint = document.querySelector('meta[name="screenshot-import-endpoint"]')?.content; if (!endpoint)
    throw new Error('Local OCR could not confidently reconstruct this screenshot.'); const imageDataUrl = await fileToScreenshotDataUrl(file), response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(screenshotImportRequest(imageDataUrl, data)) }); if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Screenshot recognition failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : '.'}`);
} return await response.json(); }
export async function requestScreenshotImport(file, data) { lastLocalOcrMetrics = undefined; try {
    const local = await parseScreenshotLocally(file, data);
    lastLocalOcrMetrics = local.metrics;
    return await refineUncertainEmblemStats(file, data, local.result);
}
catch (localError) {
    const endpoint = document.querySelector('meta[name="screenshot-import-endpoint"]')?.content;
    if (!endpoint)
        throw localError;
    return await visionFallback(file, data);
} }
//# sourceMappingURL=screenshotImport.js.map