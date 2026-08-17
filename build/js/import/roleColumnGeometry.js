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
//# sourceMappingURL=roleColumnGeometry.js.map