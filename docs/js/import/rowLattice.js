const ROLES = ['core', 'mid', 'support'];
function finiteRows(values, height) {
    const tolerance = Math.max(5, Math.min(18, height * .012));
    const sorted = values.filter(value => Number.isFinite(value) && value >= 0 && value <= height).sort((a, b) => a - b);
    const clustered = [];
    for (const value of sorted) {
        const last = clustered.at(-1);
        if (last === undefined || value - last > tolerance)
            clustered.push(value);
        else
            clustered[clustered.length - 1] = (last + value) / 2;
    }
    return clustered;
}
export function classifyLayoutEvidence(rowsByRole, globalRows) {
    const counts = ROLES.map(role => rowsByRole[role].filter(Number.isFinite).length);
    const global = globalRows.filter(Number.isFinite).length;
    const rolesAtLeast4 = counts.filter(count => count >= 4).length;
    const rolesAtLeast3 = counts.filter(count => count >= 3).length;
    if (global >= 5 || counts.some(count => count >= 5))
        return { kind: 'expanded_5', confidence: .99 };
    if (global === 4 || rolesAtLeast4 >= 2)
        return { kind: 'expanded_5', confidence: .94 };
    if (rolesAtLeast4 === 1 && rolesAtLeast3 >= 2)
        return { kind: 'expanded_5', confidence: .88 };
    if (global === 3 && rolesAtLeast3 >= 2 && rolesAtLeast4 === 0)
        return { kind: 'legacy_3', confidence: .94 };
    if (global === 3 && rolesAtLeast3 === 1 && Math.max(...counts) <= 3)
        return { kind: 'legacy_3', confidence: .82 };
    return { kind: 'unresolved', confidence: 0 };
}
export function fitRowLattice(observations, rowCount, height) {
    if (!Number.isFinite(height) || height <= 0)
        return null;
    const observed = finiteRows(observations, height);
    const minimumEvidence = 3;
    if (observed.length < minimumEvidence)
        return null;
    const minPitch = Math.max(18, height * .045), maxPitch = height * .26;
    let best = null;
    for (let a = 0; a < observed.length - 1; a++)
        for (let b = a + 1; b < observed.length; b++) {
            const delta = observed[b] - observed[a];
            for (let ia = 0; ia < rowCount - 1; ia++)
                for (let ib = ia + 1; ib < rowCount; ib++) {
                    const pitch = delta / (ib - ia);
                    if (!Number.isFinite(pitch) || pitch < minPitch || pitch > maxPitch)
                        continue;
                    const origin = (observed[a] - pitch * ia + observed[b] - pitch * ib) / 2;
                    const final = origin + pitch * (rowCount - 1);
                    if (origin < 0 || final > height)
                        continue;
                    const tolerance = Math.max(7, Math.min(26, pitch * .22));
                    const used = new Set();
                    let residual = 0, matched = 0, minIndex = rowCount, maxIndex = -1;
                    for (const value of observed) {
                        const index = Math.round((value - origin) / pitch);
                        if (index < 0 || index >= rowCount || used.has(index))
                            continue;
                        const expected = origin + pitch * index, error = Math.abs(value - expected);
                        if (error > tolerance)
                            continue;
                        used.add(index);
                        matched++;
                        residual += error / tolerance;
                        minIndex = Math.min(minIndex, index);
                        maxIndex = Math.max(maxIndex, index);
                    }
                    if (matched < minimumEvidence || maxIndex - minIndex < 2)
                        continue;
                    const normalizedResidual = residual / matched;
                    const score = matched * 2 - normalizedResidual - (Math.abs((final - origin) / height) * .02);
                    if (!best || score > best.score)
                        best = { origin, pitch, matchedRows: matched, residual: normalizedResidual, score };
                }
        }
    if (!best)
        return null;
    const rows = Array.from({ length: rowCount }, (_, index) => best.origin + best.pitch * index);
    if (rows.some((row, index) => !Number.isFinite(row) || row < 0 || row > height || (index > 0 && row <= rows[index - 1])))
        return null;
    const synthesized = best.matchedRows < rowCount;
    const evidence = Math.min(1, best.matchedRows / rowCount);
    const confidence = Math.max(0, Math.min(.99, evidence * .78 + (1 - Math.min(1, best.residual)) * .22 - (synthesized ? .06 : 0)));
    return { rows, origin: best.origin, pitch: best.pitch, matchedRows: best.matchedRows, residual: best.residual, synthesized, confidence };
}
/**
 * Fit a regular row lattice from sparse but high-specificity TIER labels.
 * Missing rows are represented as integer pitch steps rather than as
 * independently synthesized fixed-height guesses.  A broader textual fit may
 * be supplied only to choose among multiple legal placements of the same Tier
 * pattern; Tier spacing remains authoritative for pitch.
 */
export function fitTierAnchoredLattice(observations, rowCount, height, reference) {
    if (!Number.isFinite(height) || height <= 0)
        return null;
    const observed = finiteRows(observations, height);
    if (observed.length < 2)
        return null;
    const gaps = observed.slice(1).map((row, index) => row - observed[index]).filter(gap => gap > 0);
    if (!gaps.length)
        return null;
    const minPitch = Math.max(18, height * .045), maxPitch = height * .26;
    // The smallest observed gap can itself span multiple missing rows. Try each
    // possible integer divisor and keep candidates whose entire Tier pattern is
    // explained by integral row steps.
    const smallest = Math.min(...gaps);
    const pitches = [];
    for (let divisor = 1; divisor < rowCount; divisor++) {
        const pitch = smallest / divisor;
        if (pitch < minPitch || pitch > maxPitch)
            continue;
        if (!pitches.some(existing => Math.abs(existing - pitch) < .5))
            pitches.push(pitch);
    }
    let best = null;
    for (const pitch of pitches) {
        const stepCounts = [];
        let residual = 0, valid = true, totalSteps = 0;
        for (const gap of gaps) {
            const ratio = gap / pitch, steps = Math.max(1, Math.round(ratio));
            const error = Math.abs(ratio - steps);
            if (error > .22) {
                valid = false;
                break;
            }
            stepCounts.push(steps);
            totalSteps += steps;
            residual += error;
        }
        if (!valid || totalSteps > rowCount - 1)
            continue;
        for (let startIndex = 0; startIndex <= rowCount - 1 - totalSteps; startIndex++) {
            const origin = observed[0] - pitch * startIndex, final = origin + pitch * (rowCount - 1);
            if (origin < 0 || final > height)
                continue;
            let predictedIndex = startIndex, fitError = Math.abs(observed[0] - origin - pitch * startIndex);
            for (let i = 1; i < observed.length; i++) {
                predictedIndex += stepCounts[i - 1];
                fitError += Math.abs(observed[i] - (origin + pitch * predictedIndex));
            }
            const normalizedResidual = (fitError / observed.length) / Math.max(1, pitch) + residual / Math.max(1, gaps.length);
            const referencePenalty = reference ?
                Math.abs(origin - reference.origin) / Math.max(pitch, reference.pitch, 1) + Math.abs(pitch - reference.pitch) / Math.max(pitch, reference.pitch, 1) : 0;
            const score = normalizedResidual + referencePenalty * .18;
            if (!best || score < best.score)
                best = { origin, pitch, steps: totalSteps, residual: normalizedResidual, score };
        }
    }
    if (!best)
        return null;
    const rows = Array.from({ length: rowCount }, (_, index) => best.origin + best.pitch * index);
    if (rows.some((row, index) => !Number.isFinite(row) || row < 0 || row > height || (index > 0 && row <= rows[index - 1])))
        return null;
    const synthesized = observed.length < rowCount;
    const evidence = Math.min(1, observed.length / rowCount);
    const confidence = Math.max(0, Math.min(.98, evidence * .7 + (1 - Math.min(1, best.residual)) * .3 - (synthesized ? .08 : 0)));
    return { rows, origin: best.origin, pitch: best.pitch, matchedRows: observed.length, residual: best.residual, synthesized, confidence };
}
export function rowWindows(rows, height) {
    if (!Number.isFinite(height) || height <= 0 || rows.length === 0)
        return [];
    const ordered = rows.every((row, index) => Number.isFinite(row) && row >= 0 && row <= height && (index === 0 || row > rows[index - 1]));
    if (!ordered)
        return [];
    const pitch = rows.length > 1 ? rows.slice(1).reduce((sum, row, index) => sum + (row - rows[index]), 0) / (rows.length - 1) : 0;
    if (rows.length > 1 && (!Number.isFinite(pitch) || pitch <= 0))
        return [];
    return rows.map((row, index) => {
        const previous = index > 0 ? rows[index - 1] : row - (pitch || Math.max(20, height * .08));
        const next = index < rows.length - 1 ? rows[index + 1] : row + (pitch || Math.max(20, height * .08));
        return { top: Math.max(0, (previous + row) / 2), bottom: Math.min(height, (row + next) / 2) };
    }).filter(window => Number.isFinite(window.top) && Number.isFinite(window.bottom) && window.bottom > window.top);
}
//# sourceMappingURL=rowLattice.js.map