import { BOARD_LAYOUTS, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../data/actionCatalog.js';
import { matchActionText, ocrSimilarity } from './ocrDomainMatch.js';
import { parseScreenshotLocally } from './localScreenshotOcr.js';
import { refineUncertainScreenshotFields } from './emblemOcrRefinement.js';
const ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const REVIEW_THRESHOLD = .9;
const clamp = (value) => Math.max(0, Math.min(1, value));
const normalized = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
let lastLocalOcrMetrics;
export function getLastLocalOcrMetrics() { return lastLocalOcrMetrics; }
export function calibrateConfidenceEvidence(path, evidence) {
    const components = {
        geometry: clamp(evidence.components.geometry),
        domainMatch: clamp(evidence.components.domainMatch),
        structuredEvidence: clamp(evidence.components.structuredEvidence),
        targetedRetry: clamp(evidence.components.targetedRetry),
        fieldConsistency: clamp(evidence.components.fieldConsistency),
    };
    if (!evidence.resolved)
        return { path, confidence: 0, reason: 'unresolved', components };
    const structured = Math.max(components.structuredEvidence, components.targetedRetry);
    const fuzzyBlend = clamp(components.domainMatch * .75 + clamp(evidence.rawConfidence) * .25);
    const evidenceStrength = structured >= .95 ? structured : Math.min(.89, Math.max(structured, fuzzyBlend));
    const consistencyCap = components.fieldConsistency < .75 ? .84 : 1;
    return {
        path,
        confidence: clamp(Math.min(components.geometry, consistencyCap, evidenceStrength)),
        reason: components.fieldConsistency < .75 ? 'conflicting-retry' : evidence.reason,
        components,
    };
}
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
function confidenceComponents(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return undefined;
    const row = v;
    const keys = ['geometry', 'domainMatch', 'structuredEvidence', 'targetedRetry', 'fieldConsistency'];
    if (!keys.every(key => typeof row[key] === 'number' && Number.isFinite(row[key])))
        return undefined;
    return {
        geometry: clamp(row.geometry),
        domainMatch: clamp(row.domainMatch),
        structuredEvidence: clamp(row.structuredEvidence),
        targetedRetry: clamp(row.targetedRetry),
        fieldConsistency: clamp(row.fieldConsistency),
    };
}
function confidences(v) {
    if (!Array.isArray(v))
        return [];
    const out = [];
    for (const row of v) {
        if (!row || typeof row !== 'object')
            continue;
        const c = row;
        if (typeof c.path !== 'string' || typeof c.confidence !== 'number' || !Number.isFinite(c.confidence))
            continue;
        const parsed = { path: c.path, confidence: clamp(c.confidence) };
        if (typeof c.reason === 'string')
            parsed.reason = c.reason;
        const components = confidenceComponents(c.components);
        if (components)
            parsed.components = components;
        out.push(parsed);
    }
    return out;
}
function confidenceFor(raw, path) { return raw.fieldConfidence?.find(field => field.path === path)?.confidence ?? 0; }
function averageDiagnosticWordConfidence(words) { return words.length ? clamp(words.reduce((sum, word) => sum + word.confidence, 0) / words.length / 100) : 0; }
export function directTierText(text, tier) {
    const upper = text.toUpperCase().replace(/[“”'`]/g, '');
    const roman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
    return new RegExp(`TIER[^A-Z0-9]{0,8}${roman[tier]}(?:[^IV]|$)`, 'i').test(upper);
}
function geometryConfidence(metrics) {
    const directTierRowCount = Object.values(metrics.diagnostic.tierRowsByColumn).reduce((sum, rows) => sum + rows.length, 0);
    if (directTierRowCount === 0)
        return { value: .84, reason: 'geometry-fallback' };
    if (metrics.diagnostic.extractionColumnMethod === 'fallback')
        return { value: .85, reason: 'geometry-fallback' };
    return { value: 1 };
}
function baseComponents(geometry, domainMatch) {
    return { geometry, domainMatch: clamp(domainMatch), structuredEvidence: 0, targetedRetry: 0, fieldConsistency: 1 };
}
function phraseSimilarity(rawText, target) {
    const rawTokens = rawText.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
    const targetWords = Math.max(1, target.trim().split(/\s+/).length);
    let best = ocrSimilarity(rawText, target);
    for (let words = Math.max(1, targetWords - 1); words <= Math.min(rawTokens.length, targetWords + 1); words++) {
        for (let index = 0; index + words <= rawTokens.length; index++)
            best = Math.max(best, ocrSimilarity(rawTokens.slice(index, index + words).join(' '), target));
    }
    return best;
}
function matchTeamEvidence(rawText, role, data) {
    if (!rawText.trim())
        return undefined;
    const byTeam = new Map();
    for (const profile of data.players.filter(player => player.role === role)) {
        const current = byTeam.get(profile.team) ?? { direct: phraseSimilarity(rawText, profile.team), players: new Map() };
        for (const name of profile.attachedPlayers.filter(playerName => normalized(playerName).length >= 4)) {
            const score = phraseSimilarity(rawText, name);
            current.players.set(name, Math.max(score, current.players.get(name) ?? 0));
        }
        current.direct = Math.max(current.direct, phraseSimilarity(rawText, profile.team));
        byTeam.set(profile.team, current);
    }
    const ranked = [...byTeam.entries()].map(([team, evidence]) => {
        const playerScores = [...evidence.players.values()].sort((a, b) => b - a), bestPlayerScore = playerScores[0] ?? 0, strongPlayerCount = playerScores.filter(score => score >= .82).length;
        const pairScore = ((playerScores[0] ?? 0) + (playerScores[1] ?? 0)) / 2;
        const singleAnchor = bestPlayerScore >= .94 ? bestPlayerScore * .98 : 0;
        const rosterScore = role === 'mid' ? bestPlayerScore : Math.max(pairScore, singleAnchor);
        return { team, score: Math.max(evidence.direct, rosterScore), strongPlayerCount, bestPlayerScore, directTeamScore: evidence.direct };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best)
        return undefined;
    const runnerUpScore = ranked[1]?.score ?? 0;
    return { ...best, runnerUpScore, margin: best.score - runnerUpScore };
}
function trustedTeamEvidence(match, role) {
    const direct = match.directTeamScore >= .9 && match.margin >= .1;
    const singlePlayer = match.bestPlayerScore >= .82 && match.score >= .82 && match.margin >= .18;
    const roster = role === 'mid'
        ? match.bestPlayerScore >= .9 && match.score >= .9 && match.margin >= .1
        : match.strongPlayerCount >= 2 && match.score >= .84 && match.margin >= .08;
    return direct || singlePlayer || roster;
}
/** Re-score already-recognized fields from field-specific evidence. Strong evidence may also repair a team winner. */
export function calibrateScreenshotImportConfidence(raw, metrics, data) {
    const geometry = geometryConfidence(metrics);
    const calibrated = [];
    const byEmblem = new Map(metrics.diagnostic.emblems.map(emblem => [`${emblem.role}:${emblem.rowIndex}`, emblem]));
    const layout = BOARD_LAYOUTS[raw.layoutId];
    for (const role of ROLES) {
        const teamPath = `banners.${role}.selectedTeam`, team = metrics.diagnostic.teamEvidence[role], teamRaw = confidenceFor(raw, teamPath), teamCorpus = [team.rawText, ...metrics.diagnostic.emblems.filter(emblem => emblem.role === role && emblem.rowIndex === 0).map(emblem => emblem.rawText)].filter(Boolean).join(' '), teamMatch = matchTeamEvidence(teamCorpus, role, data);
        const teamDomain = teamMatch?.score ?? team.matchScore, teamComponents = baseComponents(geometry.value, teamDomain);
        let teamReason = 'fuzzy-team', teamResolved = Boolean(raw.banners[role].selectedTeam);
        if (teamMatch && trustedTeamEvidence(teamMatch, role)) {
            if (teamMatch.team !== raw.banners[role].selectedTeam) {
                raw.banners[role].selectedTeam = teamMatch.team;
                team.normalizedTeam = teamMatch.team;
                team.matchScore = teamMatch.score;
            }
            teamComponents.structuredEvidence = .96;
            teamReason = 'roster-team';
            teamResolved = true;
        }
        else if (teamMatch && teamMatch.team !== raw.banners[role].selectedTeam) {
            teamComponents.fieldConsistency = .7;
            teamReason = 'conflicting-retry';
        }
        if (geometry.reason)
            teamReason = geometry.reason;
        calibrated.push(calibrateConfidenceEvidence(teamPath, { resolved: teamResolved, rawConfidence: teamRaw, reason: teamReason, components: teamComponents }));
        for (let index = 0; index < layout.roles[role].length; index++) {
            const emblem = raw.banners[role].emblems[index], diag = byEmblem.get(`${role}:${index}`), slot = layout.roles[role][index];
            if (!diag)
                continue;
            const statPath = `banners.${role}.emblems.${index}.stat`, statRaw = confidenceFor(raw, statPath), statComponents = baseComponents(geometry.value, diag.statMatchScore), initialStat = Math.min(geometry.value, clamp(diag.statMatchScore * .72 + averageDiagnosticWordConfidence(diag.words) * .28));
            const statChanged = diag.normalizedStat !== emblem.stat, statStrengthened = statRaw > initialStat + .03;
            let statReason = 'fuzzy-stat';
            if (!isLegalStat(slot.color, emblem.stat)) {
                statComponents.fieldConsistency = 0;
                statReason = 'unresolved';
            }
            else if (!statChanged && diag.statMatchScore >= .99) {
                statComponents.structuredEvidence = .97;
                statReason = 'exact-domain-stat';
            }
            else if (statRaw >= .9 && (statChanged || statStrengthened)) {
                statComponents.targetedRetry = .95;
                statComponents.fieldConsistency = statChanged ? .9 : 1;
                statReason = 'targeted-native-stat';
            }
            else if (statChanged) {
                statComponents.targetedRetry = statRaw;
                statComponents.fieldConsistency = .7;
                statReason = 'conflicting-retry';
            }
            if (geometry.reason)
                statReason = geometry.reason;
            calibrated.push(calibrateConfidenceEvidence(statPath, { resolved: isLegalStat(slot.color, emblem.stat), rawConfidence: statRaw, reason: statReason, components: statComponents }));
            const tierPath = `banners.${role}.emblems.${index}.qualityTier`, tierRaw = confidenceFor(raw, tierPath), tierComponents = baseComponents(geometry.value, diag.tierMatchScore), tierSame = diag.normalizedTier === emblem.qualityTier;
            let tierReason = 'fuzzy-tier';
            const tierDirect = tierSame && directTierText(diag.rawTierText, emblem.qualityTier);
            if (tierDirect) {
                const corroborated = diag.tierMatchScore >= .95 || tierRaw >= .98;
                const unambiguousNonTierOne = emblem.qualityTier !== 1 && diag.tierMatchScore >= .84;
                if (corroborated || unambiguousNonTierOne)
                    tierComponents.structuredEvidence = corroborated ? .98 : .96;
                else
                    tierComponents.structuredEvidence = .89;
                tierReason = 'direct-native-tier';
            }
            else if (tierSame && diag.tierMatchScore >= .95) {
                tierComponents.targetedRetry = .97;
                tierReason = 'targeted-native-tier';
            }
            else if (!tierSame) {
                tierComponents.fieldConsistency = .7;
                tierReason = 'conflicting-retry';
            }
            if (geometry.reason)
                tierReason = geometry.reason;
            calibrated.push(calibrateConfidenceEvidence(tierPath, { resolved: tierDirect || tierRaw > .2, rawConfidence: tierRaw, reason: (tierDirect || tierRaw > .2) ? tierReason : 'unresolved', components: tierComponents }));
            const traitPath = `banners.${role}.emblems.${index}.trait`, traitRaw = confidenceFor(raw, traitPath), traitComponents = baseComponents(geometry.value, diag.traitMatchScore), traitSame = diag.normalizedTrait === emblem.trait;
            let traitReason = 'fuzzy-trait';
            if (traitSame && (diag.traitMatchScore >= .99 || normalized(diag.rawTraitText).includes(normalized(emblem.trait)))) {
                traitComponents.structuredEvidence = .96;
                traitReason = traitRaw >= .9 ? 'targeted-native-trait' : 'exact-domain-trait';
            }
            else if (!traitSame) {
                traitComponents.fieldConsistency = .7;
                traitReason = 'conflicting-retry';
            }
            if (geometry.reason)
                traitReason = geometry.reason;
            calibrated.push(calibrateConfidenceEvidence(traitPath, { resolved: TRAITS.includes(emblem.trait), rawConfidence: traitRaw, reason: traitReason, components: traitComponents }));
        }
    }
    raw.operationIds.forEach((operationId, index) => {
        const path = `operationIds.${index}`, rawConfidence = confidenceFor(raw, path), actionText = metrics.diagnostic.actionEvidence.cardTexts[index] ?? '', actionMatch = matchActionText(actionText), components = baseComponents(geometry.value, actionMatch?.score ?? rawConfidence);
        const actionEvidence = metrics.diagnostic.actionEvidence;
        const independentAgreement = actionEvidence.independentAgreement?.[index] === true;
        const catalogAgreement = operationId !== null && actionMatch?.id === operationId && actionEvidence.resolved[index] === operationId;
        const decisiveCatalogMatch = Boolean(catalogAgreement && actionMatch && ((actionMatch.score >= .65 && actionMatch.margin >= .05) || (independentAgreement && actionMatch.score >= .5)));
        const actionResolved = operationId !== null && (decisiveCatalogMatch || rawConfidence >= .9);
        let reason = decisiveCatalogMatch ? 'dedicated-action-crop' : (operationId !== null ? 'fuzzy-action' : 'unresolved');
        if (decisiveCatalogMatch)
            components.structuredEvidence = independentAgreement ? .98 : .96;
        else if (operationId !== null && rawConfidence >= .9)
            components.structuredEvidence = .95;
        if (geometry.reason && operationId !== null)
            reason = geometry.reason;
        calibrated.push(calibrateConfidenceEvidence(path, { resolved: actionResolved, rawConfidence, reason, components }));
    });
    const tokenPath = 'tokensRemaining', tokenRaw = confidenceFor(raw, tokenPath), tokenEvidence = metrics.diagnostic.tokenEvidence, tokenComponents = baseComponents(geometry.value, tokenEvidence.confidence);
    let tokenReason = raw.tokensRemaining === undefined ? 'unresolved' : 'fuzzy-token';
    if (raw.tokensRemaining !== undefined && tokenEvidence.value === raw.tokensRemaining && tokenEvidence.confidence >= .9 && /TOKENS?/i.test(tokenEvidence.rawText)) {
        tokenComponents.structuredEvidence = .96;
        tokenReason = 'direct-token';
    }
    if (geometry.reason && raw.tokensRemaining !== undefined)
        tokenReason = geometry.reason;
    calibrated.push(calibrateConfidenceEvidence(tokenPath, { resolved: raw.tokensRemaining !== undefined, rawConfidence: tokenRaw, reason: tokenReason, components: tokenComponents }));
    raw.fieldConfidence = calibrated;
    for (const emblem of metrics.diagnostic.emblems) {
        const prefix = `banners.${emblem.role}.emblems.${emblem.rowIndex}.`;
        const fieldRows = calibrated.filter(field => field.path.startsWith(prefix));
        emblem.finalConfidence = fieldRows.length ? Math.min(...fieldRows.map(field => field.confidence)) : 0;
        emblem.reviewRequired = fieldRows.some(field => field.confidence < REVIEW_THRESHOLD);
    }
    const diagnostic = metrics.diagnostic;
    diagnostic.confidenceModel = 'structured-evidence-v2';
    diagnostic.fieldConfidence = calibrated.map(field => ({ ...field, components: field.components ? { ...field.components } : undefined }));
}
export function screenshotImportRequest(imageDataUrl, data) {
    const teamsByRole = Object.fromEntries(ROLES.map(role => [role, [...new Set(data.players.filter(p => p.role === role).map(p => p.team))].sort()]));
    return { imageDataUrl, teamsByRole, actions: ACTION_CATALOG.map(action => ({ id: action.id, label: action.label })) };
}
export function validateScreenshotImport(raw, data, currentBoard, currentMenu) {
    assertRecord(raw, 'Screenshot import');
    const layoutId = asLayoutId(raw.layoutId);
    assertRecord(raw.banners, 'Screenshot banners');
    const layout = BOARD_LAYOUTS[layoutId], board = {};
    for (const role of ROLES) {
        const rb = raw.banners[role];
        assertRecord(rb, `${role} banner`);
        const selectedTeam = asTeam(rb.selectedTeam, role, data), re = rb.emblems;
        if (!Array.isArray(re))
            throw new Error(`${role} emblems are missing.`);
        const slots = layout.roles[role];
        if (re.length !== slots.length)
            throw new Error(`${role} has ${re.length} parsed emblems but ${layoutId} requires ${slots.length}.`);
        const emblems = slots.map((slot, index) => {
            const c = re[index];
            assertRecord(c, `${role} emblem ${index + 1}`);
            if (c.position !== slot.index)
                throw new Error(`${role} emblem ${index + 1} has the wrong position.`);
            if (c.color !== slot.color)
                throw new Error(`${role} emblem ${index + 1} color conflicts with the ${layoutId} layout.`);
            if (typeof c.stat !== 'string' || !isLegalStat(slot.color, c.stat))
                throw new Error(`${role} emblem ${index + 1} returned an illegal ${slot.color} stat.`);
            return { id: `${role}-${slot.index}`, position: slot.index, color: slot.color, stat: c.stat, qualityTier: asTier(c.qualityTier, `${role} emblem ${index + 1}`), trait: asTrait(c.trait, `${role} emblem ${index + 1}`) };
        });
        board[role] = { role, selectedTeam, expectedSeries: currentBoard[role].expectedSeries, emblems };
    }
    if (layoutId !== 'legacy_3')
        board.layoutId = layoutId;
    if (!Array.isArray(raw.operationIds) || raw.operationIds.length !== 3)
        throw new Error('Screenshot parser must return exactly three offered-action slots.');
    const fc = confidences(raw.fieldConfidence), warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((x) => typeof x === 'string' && x.trim().length > 0) : [], resolved = [];
    raw.operationIds.forEach((v, index) => {
        if (v === null) {
            resolved.push(currentMenu[index].id);
            if (!fc.some(x => x.path === `operationIds.${index}`))
                fc.push({ path: `operationIds.${index}`, confidence: 0, reason: 'unresolved' });
            if (!warnings.some(x => x.includes(`Action ${index + 1}`)))
                warnings.push(`Action ${index + 1} was not visible; existing action preserved until reviewed.`);
            return;
        }
        if (typeof v !== 'string' || !ACTION_BY_ID.has(v))
            throw new Error(`Screenshot parser returned unknown action: ${String(v)}.`);
        const actionConfidence = fc.find(x => x.path === `operationIds.${index}`)?.confidence ?? 0;
        if (actionConfidence < REVIEW_THRESHOLD) {
            resolved.push(currentMenu[index].id);
            warnings.push(`Action ${index + 1} OCR was not strong enough to replace the existing action; preserved until reviewed.`);
            return;
        }
        resolved.push(v);
    });
    const visible = raw.operationIds.filter((v) => typeof v === 'string');
    if (new Set(visible).size !== visible.length)
        throw new Error('Screenshot parser returned duplicate offered actions.');
    const menu = resolved.map(id => cloneAction(ACTION_BY_ID.get(id)));
    let tokensRemaining;
    if (raw.tokensRemaining !== undefined) {
        if (!Number.isInteger(raw.tokensRemaining) || Number(raw.tokensRemaining) < 0)
            throw new Error('Screenshot parser returned an invalid token count.');
        tokensRemaining = Number(raw.tokensRemaining);
    }
    const lowConfidenceFields = fc.filter(field => field.confidence < REVIEW_THRESHOLD);
    const result = { board, menu, warnings, lowConfidenceFields, requiresReview: lowConfidenceFields.length > 0 };
    if (tokensRemaining !== undefined)
        result.tokensRemaining = tokensRemaining;
    return result;
}
export async function fileToScreenshotDataUrl(file, maxDimension = 1800) {
    if (!file.type.startsWith('image/'))
        throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).');
    const source = await new Promise((ok, no) => { const image = new Image(), url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); ok(image); }; image.onerror = () => { URL.revokeObjectURL(url); no(new Error('The selected screenshot could not be decoded.')); }; image.src = url; });
    const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('Canvas image processing is unavailable in this browser.');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9);
}
async function visionFallback(file, data) {
    const endpoint = document.querySelector('meta[name="screenshot-import-endpoint"]')?.content;
    if (!endpoint)
        throw new Error('Local OCR could not confidently reconstruct this screenshot.');
    const imageDataUrl = await fileToScreenshotDataUrl(file), response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(screenshotImportRequest(imageDataUrl, data)) });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Screenshot recognition failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : '.'}`);
    }
    return await response.json();
}
export async function requestScreenshotImport(file, data) {
    lastLocalOcrMetrics = undefined;
    try {
        const local = await parseScreenshotLocally(file, data);
        // Resolve fields from structured evidence before expensive targeted OCR. Refinement now runs only where it can change the decision.
        calibrateScreenshotImportConfidence(local.result, local.metrics, data);
        const refined = await refineUncertainScreenshotFields(file, data, local.result, local.metrics);
        local.metrics.targetedRetryMs += refined.elapsedMs;
        local.metrics.totalMs += refined.elapsedMs;
        calibrateScreenshotImportConfidence(refined.result, local.metrics, data);
        lastLocalOcrMetrics = local.metrics;
        return refined.result;
    }
    catch (localError) {
        const endpoint = document.querySelector('meta[name="screenshot-import-endpoint"]')?.content;
        if (!endpoint)
            throw localError;
        try {
            return await visionFallback(file, data);
        }
        catch (fallbackError) {
            const localMessage = localError instanceof Error ? `${localError.name}: ${localError.message}` : String(localError);
            const fallbackMessage = fallbackError instanceof Error ? `${fallbackError.name}: ${fallbackError.message}` : String(fallbackError);
            const combined = new Error(`Local screenshot OCR failed (${localMessage}); hosted fallback also failed (${fallbackMessage}).`);
            combined.cause = localError;
            throw combined;
        }
    }
}
//# sourceMappingURL=screenshotImport.js.map