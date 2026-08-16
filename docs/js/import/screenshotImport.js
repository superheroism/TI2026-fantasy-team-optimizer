import { BOARD_LAYOUTS, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../data/actionCatalog.js';
const ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const REVIEW_THRESHOLD = 0.9;
function assertRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`${label} is missing or invalid.`);
}
function asLayoutId(value) {
    if (value !== 'legacy_3' && value !== 'expanded_5')
        throw new Error('Screenshot parser returned an unsupported board layout.');
    return value;
}
function asTeam(value, role, data) {
    if (typeof value !== 'string')
        throw new Error(`Screenshot parser did not return a ${role} team.`);
    const legal = new Set(data.players.filter(player => player.role === role).map(player => player.team));
    if (!legal.has(value))
        throw new Error(`Screenshot parser returned unknown ${role} team: ${value}.`);
    return value;
}
function asQualityTier(value, path) {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5)
        throw new Error(`${path} has an invalid quality tier.`);
    return Number(value);
}
function asTrait(value, path) {
    if (typeof value !== 'string' || !TRAITS.includes(value))
        throw new Error(`${path} has an invalid trait.`);
    return value;
}
function asConfidence(value) {
    if (!Array.isArray(value))
        return [];
    const fields = [];
    for (const row of value) {
        if (!row || typeof row !== 'object')
            continue;
        const candidate = row;
        if (typeof candidate.path !== 'string' || typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence))
            continue;
        fields.push({ path: candidate.path, confidence: Math.max(0, Math.min(1, candidate.confidence)) });
    }
    return fields;
}
export function screenshotImportRequest(fileDataUrl, data) {
    const teamsByRole = Object.fromEntries(ROLES.map(role => [role, [...new Set(data.players.filter(player => player.role === role).map(player => player.team))].sort()]));
    return { imageDataUrl: fileDataUrl, teamsByRole, actions: ACTION_CATALOG.map(action => ({ id: action.id, label: action.label })) };
}
export function validateScreenshotImport(raw, data, currentBoard, currentMenu) {
    assertRecord(raw, 'Screenshot import');
    const layoutId = asLayoutId(raw.layoutId);
    assertRecord(raw.banners, 'Screenshot banners');
    const layout = BOARD_LAYOUTS[layoutId];
    const board = {};
    for (const role of ROLES) {
        const rawBanner = raw.banners[role];
        assertRecord(rawBanner, `${role} banner`);
        const selectedTeam = asTeam(rawBanner.selectedTeam, role, data);
        const rawEmblems = rawBanner.emblems;
        if (!Array.isArray(rawEmblems))
            throw new Error(`${role} emblems are missing.`);
        const slots = layout.roles[role];
        if (rawEmblems.length !== slots.length)
            throw new Error(`${role} has ${rawEmblems.length} parsed emblems but ${layoutId} requires ${slots.length}.`);
        const emblems = slots.map((slot, index) => {
            const candidate = rawEmblems[index];
            assertRecord(candidate, `${role} emblem ${index + 1}`);
            if (candidate.position !== slot.index)
                throw new Error(`${role} emblem ${index + 1} has the wrong position.`);
            if (candidate.color !== slot.color)
                throw new Error(`${role} emblem ${index + 1} color conflicts with the ${layoutId} layout.`);
            if (typeof candidate.stat !== 'string' || !isLegalStat(slot.color, candidate.stat))
                throw new Error(`${role} emblem ${index + 1} returned an illegal ${slot.color} stat.`);
            return { id: `${role}-${slot.index}`, position: slot.index, color: slot.color, stat: candidate.stat, qualityTier: asQualityTier(candidate.qualityTier, `${role} emblem ${index + 1}`), trait: asTrait(candidate.trait, `${role} emblem ${index + 1}`) };
        });
        board[role] = { role, selectedTeam, expectedSeries: currentBoard[role].expectedSeries, emblems };
    }
    if (layoutId !== 'legacy_3')
        board.layoutId = layoutId;
    if (!Array.isArray(raw.operationIds) || raw.operationIds.length !== 3)
        throw new Error('Screenshot parser must return exactly three offered-action slots.');
    const fieldConfidence = asConfidence(raw.fieldConfidence);
    const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((warning) => typeof warning === 'string' && warning.trim().length > 0) : [];
    const resolvedIds = [];
    raw.operationIds.forEach((value, index) => {
        if (value === null) {
            resolvedIds.push(currentMenu[index].id);
            if (!fieldConfidence.some(field => field.path === `operationIds.${index}`))
                fieldConfidence.push({ path: `operationIds.${index}`, confidence: 0 });
            warnings.push(`Action ${index + 1} was not visible; existing action preserved until reviewed.`);
            return;
        }
        if (typeof value !== 'string' || !ACTION_BY_ID.has(value))
            throw new Error(`Screenshot parser returned unknown action: ${String(value)}.`);
        resolvedIds.push(value);
    });
    const visibleIds = raw.operationIds.filter((value) => typeof value === 'string');
    if (new Set(visibleIds).size !== visibleIds.length)
        throw new Error('Screenshot parser returned duplicate offered actions.');
    const menu = resolvedIds.map(id => cloneAction(ACTION_BY_ID.get(id)));
    let tokensRemaining;
    if (raw.tokensRemaining !== undefined) {
        if (!Number.isInteger(raw.tokensRemaining) || Number(raw.tokensRemaining) < 0)
            throw new Error('Screenshot parser returned an invalid token count.');
        tokensRemaining = Number(raw.tokensRemaining);
    }
    const lowConfidenceFields = fieldConfidence.filter(field => field.confidence < REVIEW_THRESHOLD);
    const result = { board, menu, warnings, lowConfidenceFields, requiresReview: warnings.length > 0 || lowConfidenceFields.length > 0 };
    if (tokensRemaining !== undefined)
        result.tokensRemaining = tokensRemaining;
    return result;
}
export async function fileToScreenshotDataUrl(file, maxDimension = 1800) {
    if (!file.type.startsWith('image/'))
        throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).');
    const source = await new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected screenshot could not be decoded.')); };
        image.src = url;
    });
    const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context)
        throw new Error('Canvas image processing is unavailable in this browser.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
}
export async function requestScreenshotImport(file, data) {
    const endpoint = document.querySelector('meta[name="screenshot-import-endpoint"]')?.content || '/api/screenshot-import';
    const imageDataUrl = await fileToScreenshotDataUrl(file);
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(screenshotImportRequest(imageDataUrl, data)) });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(response.status === 404 ? 'Screenshot recognition endpoint is not deployed for this site.' : `Screenshot recognition failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : '.'}`);
    }
    return await response.json();
}
//# sourceMappingURL=screenshotImport.js.map