const strength = (candidate) => Math.max(0, Math.min(1, candidate.confidence / 100)) * Math.max(0, Math.min(1, candidate.similarity));
export function selectCoherentRoleTriplet(candidates, width, height) {
    const byRole = { core: [], mid: [], support: [] };
    for (const candidate of candidates)
        byRole[candidate.role].push(candidate);
    for (const role of ['core', 'mid', 'support']) {
        byRole[role].sort((a, b) => (b.confidence * b.similarity) - (a.confidence * a.similarity));
        byRole[role] = byRole[role].slice(0, 8);
    }
    const yTolerance = Math.max(18, height * .055);
    let best = null;
    for (const core of byRole.core)
        for (const mid of byRole.mid)
            for (const support of byRole.support) {
                if (!(core.x < mid.x && mid.x < support.x))
                    continue;
                const separation = support.x - core.x;
                if (separation < width * .35)
                    continue;
                const leftGap = mid.x - core.x, rightGap = support.x - mid.x;
                if (Math.min(leftGap, rightGap) / Math.max(leftGap, rightGap) < .55)
                    continue;
                const minY = Math.min(core.y, mid.y, support.y), maxY = Math.max(core.y, mid.y, support.y), ySpread = maxY - minY;
                if (ySpread > yTolerance)
                    continue;
                const evidence = [core, mid, support];
                const confidence = evidence.reduce((sum, x) => sum + Math.max(0, Math.min(1, x.confidence / 100)), 0) / 3;
                const similarity = evidence.reduce((sum, x) => sum + Math.max(0, Math.min(1, x.similarity)), 0) / 3;
                const alignment = 1 - ySpread / yTolerance;
                const balance = 1 - Math.abs(leftGap - rightGap) / (leftGap + rightGap);
                const span = Math.min(1, separation / (width * .6));
                const score = confidence * .34 + similarity * .34 + alignment * .16 + balance * .10 + span * .06;
                if (!best || score > best.score)
                    best = { core, mid, support, score };
            }
    return best;
}
/**
 * Recover a coherent three-column lattice from two strong aligned headings when
 * one role label is absent or contaminated. A valid three-label triplet always
 * wins; partial consensus never overrides it.
 */
export function selectRoleColumnConsensus(candidates, width, height) {
    const triplet = selectCoherentRoleTriplet(candidates, width, height);
    if (triplet)
        return {
            centers: { core: triplet.core.x, mid: triplet.mid.x, support: triplet.support.x },
            observed: { core: triplet.core, mid: triplet.mid, support: triplet.support },
            inferred: [], score: triplet.score,
        };
    const byRole = { core: [], mid: [], support: [] };
    for (const candidate of candidates) {
        if (strength(candidate) >= .42)
            byRole[candidate.role].push(candidate);
    }
    for (const role of ['core', 'mid', 'support']) {
        byRole[role].sort((a, b) => strength(b) - strength(a));
        byRole[role] = byRole[role].slice(0, 6);
    }
    const yTolerance = Math.max(18, height * .055), minGap = width * .15;
    let best = null;
    const consider = (a, b) => {
        if (a.x >= b.x)
            return;
        const ySpread = Math.abs(a.y - b.y);
        if (ySpread > yTolerance)
            return;
        const gap = b.x - a.x;
        if (gap < minGap)
            return;
        const centers = { core: 0, mid: 0, support: 0 };
        const observed = { [a.role]: a, [b.role]: b };
        let inferred = [];
        if (a.role === 'core' && b.role === 'support') {
            if (gap < width * .35)
                return;
            centers.core = a.x;
            centers.support = b.x;
            centers.mid = (a.x + b.x) / 2;
            inferred = ['mid'];
        }
        else if (a.role === 'core' && b.role === 'mid') {
            const support = b.x + gap;
            if (support > width * 1.03)
                return;
            centers.core = a.x;
            centers.mid = b.x;
            centers.support = support;
            inferred = ['support'];
        }
        else if (a.role === 'mid' && b.role === 'support') {
            const core = a.x - gap;
            if (core < width * -.03)
                return;
            centers.core = core;
            centers.mid = a.x;
            centers.support = b.x;
            inferred = ['core'];
        }
        else
            return;
        if (!(centers.core < centers.mid && centers.mid < centers.support))
            return;
        const fullSpan = centers.support - centers.core;
        if (fullSpan < width * .34)
            return;
        const evidence = (strength(a) + strength(b)) / 2, alignment = 1 - ySpread / yTolerance, span = Math.min(1, fullSpan / (width * .6));
        const outerBonus = a.role === 'core' && b.role === 'support' ? .05 : 0;
        const score = evidence * .68 + alignment * .20 + span * .12 + outerBonus;
        if (!best || score > best.score)
            best = { centers, observed, inferred, score };
    };
    for (const core of byRole.core)
        for (const mid of byRole.mid)
            consider(core, mid);
    for (const core of byRole.core)
        for (const support of byRole.support)
            consider(core, support);
    for (const mid of byRole.mid)
        for (const support of byRole.support)
            consider(mid, support);
    return best;
}
const median = (values) => {
    const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
/**
 * Estimate three card-column centers without letting verbose OCR lines carry
 * more weight than short ones. Each coherent visual row contributes at most
 * one x vote per column; repeated rows then vote for the final lattice.
 */
export function selectBalancedCardColumns(anchors, width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || anchors.length < 9)
        return null;
    const yTolerance = Math.max(12, height * .025), ordered = [...anchors].filter(anchor => Number.isFinite(anchor.x) && Number.isFinite(anchor.y)).sort((a, b) => a.y - b.y), rows = [];
    for (const anchor of ordered) {
        const row = rows.at(-1), rowY = row?.length ? median(row.map(item => item.y)) : Number.NaN;
        if (!row || Math.abs(anchor.y - rowY) > yTolerance)
            rows.push([anchor]);
        else
            row.push(anchor);
    }
    const rowTriples = [];
    for (const row of rows) {
        const xs = row.map(item => item.x).sort((a, b) => a - b);
        if (xs.length < 3 || xs.at(-1) - xs[0] < width * .34)
            continue;
        let best = null;
        for (let first = 1; first <= xs.length - 2; first++)
            for (let second = first + 1; second <= xs.length - 1; second++) {
                const groups = [xs.slice(0, first), xs.slice(first, second), xs.slice(second)], centers = groups.map(group => median(group));
                const leftGap = centers[1] - centers[0], rightGap = centers[2] - centers[1], span = centers[2] - centers[0];
                if (leftGap < width * .12 || rightGap < width * .12 || span < width * .34)
                    continue;
                const balance = Math.min(leftGap, rightGap) / Math.max(leftGap, rightGap);
                if (balance < .48)
                    continue;
                const residual = groups.reduce((sum, group, index) => sum + group.reduce((inner, x) => inner + Math.abs(x - centers[index]), 0), 0) / (xs.length * width);
                const imbalance = Math.abs(leftGap - rightGap) / span;
                const cost = residual + imbalance * .18;
                if (!best || cost < best.cost)
                    best = { centers, cost };
            }
        if (best)
            rowTriples.push(best.centers);
    }
    if (rowTriples.length < 3)
        return null;
    const supportTolerance = width * .075;
    let seed = null, bestSupport = [];
    for (const candidate of rowTriples) {
        const support = rowTriples.filter(row => row.every((x, index) => Math.abs(x - candidate[index]) <= supportTolerance));
        if (support.length > bestSupport.length) {
            seed = candidate;
            bestSupport = support;
        }
    }
    if (!seed || bestSupport.length < 3)
        return null;
    const centers = [0, 1, 2].map(index => median(bestSupport.map(row => row[index])));
    const leftGap = centers[1] - centers[0], rightGap = centers[2] - centers[1], span = centers[2] - centers[0];
    if (span < width * .35 || Math.min(leftGap, rightGap) / Math.max(leftGap, rightGap) < .55)
        return null;
    return centers;
}
//# sourceMappingURL=roleColumnGeometry.js.map