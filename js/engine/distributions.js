const preparedCache = new WeakMap();
export function prepareQuantiles(points) {
    if (!points?.length)
        return undefined;
    const cached = preparedCache.get(points);
    if (cached)
        return cached;
    // Source quantiles are already ordered, but validate once and sort only if necessary.
    let ordered = true;
    for (let i = 1; i < points.length; i++)
        if (points[i].q < points[i - 1].q) {
            ordered = false;
            break;
        }
    const src = ordered ? points : [...points].sort((a, b) => a.q - b.q);
    const prepared = { qs: src.map(x => x.q), values: src.map(x => x.value) };
    preparedCache.set(points, prepared);
    return prepared;
}
export function quantileValuePrepared(prepared, u) {
    if (!prepared?.qs.length)
        return 0;
    const { qs, values } = prepared, n = qs.length;
    if (u <= qs[0])
        return values[0];
    if (u >= qs[n - 1])
        return values[n - 1];
    // 104 points: binary search is materially cheaper than a fresh sort + linear scan per draw.
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (u <= qs[mid])
            hi = mid;
        else
            lo = mid;
    }
    const q0 = qs[lo], q1 = qs[hi], v0 = values[lo], v1 = values[hi];
    const t = (u - q0) / Math.max(q1 - q0, 1e-12);
    return v0 + t * (v1 - v0);
}
export function quantileValue(points, u) {
    return quantileValuePrepared(prepareQuantiles(points), u);
}
export function percentile(samples, p) {
    if (!samples.length)
        return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[idx];
}
export function mean(samples) {
    return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
}
//# sourceMappingURL=distributions.js.map