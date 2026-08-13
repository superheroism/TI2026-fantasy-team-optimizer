export function quantileValue(points, u) {
    if (!points?.length)
        return 0;
    const sorted = [...points].sort((a, b) => a.q - b.q);
    if (u <= sorted[0].q)
        return sorted[0].value;
    if (u >= sorted[sorted.length - 1].q)
        return sorted[sorted.length - 1].value;
    for (let i = 1; i < sorted.length; i++) {
        const lo = sorted[i - 1];
        const hi = sorted[i];
        if (u <= hi.q) {
            const t = (u - lo.q) / Math.max(hi.q - lo.q, 1e-9);
            return lo.value + t * (hi.value - lo.value);
        }
    }
    return sorted[sorted.length - 1].value;
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