function newDiagnostics() {
    return { calls: 0, uniformCalls: 0, overrideCalls: 0, explicitMenusScanned: 0, operatorMs: 0 };
}
function choose3(n) {
    return n < 3 ? 0 : (n * (n - 1) * (n - 2)) / 6;
}
/**
 * Exact expectation of max(baseline, best operation in a uniformly sampled
 * 3-without-replacement menu). Every element is a distinct operation identity,
 * even when multiple identities have equal continuation value.
 */
export function expectedUniformBestOfThree(values, baseline) {
    if (values.length < 3)
        return baseline;
    const ranked = values
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.value - b.entry.value || a.index - b.index);
    const denominator = choose3(ranked.length);
    let expected = 0;
    for (let k = 2; k < ranked.length; k++) {
        const weight = ((k * (k - 1)) / 2) / denominator;
        expected += weight * Math.max(baseline, ranked[k].entry.value);
    }
    return expected;
}
/** Exact probability that a uniform fresh menu contains a value above baseline. */
export function probabilityUniformBestOfThreeImproves(values, baseline) {
    const total = choose3(values.length);
    if (total === 0)
        return 0;
    const nonImproving = values.filter(entry => !(entry.value > baseline)).length;
    return 1 - choose3(nonImproving) / total;
}
/** Reference/sample path for arbitrary empirical or non-uniform menu samples. */
export function expectedExplicitMenuSamples(values, baseline, menuSamples) {
    if (!menuSamples.length)
        return baseline;
    const byId = new Map(values.map(entry => [entry.id, entry.value]));
    let sum = 0;
    for (const menu of menuSamples) {
        let best = baseline;
        for (const operation of menu)
            best = Math.max(best, byId.get(operation.id) ?? -Infinity);
        sum += best;
    }
    return sum / menuSamples.length;
}
/** Probability that an explicit sampled menu contains an operation above baseline. */
export function probabilityExplicitMenuSamplesImprove(values, baseline, menuSamples) {
    if (!menuSamples.length)
        return 0;
    const byId = new Map(values.map(entry => [entry.id, entry.value]));
    let improving = 0;
    for (const menu of menuSamples) {
        let best = -Infinity;
        for (const operation of menu)
            best = Math.max(best, byId.get(operation.id) ?? -Infinity);
        if (best > baseline)
            improving++;
    }
    return improving / menuSamples.length;
}
/**
 * Search-facing menu boundary. The normal TI 2026 rule uses the exact analytic
 * operator; supplied menuSamples retain their explicit empirical semantics.
 */
export class MenuModel {
    menuSamples;
    mode;
    diagnostics = newDiagnostics();
    constructor(menuSamples) {
        this.menuSamples = menuSamples;
        this.mode = menuSamples?.length ? 'override_samples' : 'known_uniform';
    }
    expectedFreshMenuUtility(values, baseline) {
        const start = performance.now();
        this.diagnostics.calls++;
        let result;
        if (this.mode === 'override_samples') {
            this.diagnostics.overrideCalls++;
            this.diagnostics.explicitMenusScanned += this.menuSamples?.length ?? 0;
            result = expectedExplicitMenuSamples(values, baseline, this.menuSamples ?? []);
        }
        else {
            this.diagnostics.uniformCalls++;
            result = expectedUniformBestOfThree(values, baseline);
        }
        this.diagnostics.operatorMs += performance.now() - start;
        return result;
    }
    freshMenuImprovementProbability(values, baseline) {
        return this.mode === 'override_samples'
            ? probabilityExplicitMenuSamplesImprove(values, baseline, this.menuSamples ?? [])
            : probabilityUniformBestOfThreeImproves(values, baseline);
    }
    getDiagnostics() { return { ...this.diagnostics }; }
}
//# sourceMappingURL=menuModel.js.map