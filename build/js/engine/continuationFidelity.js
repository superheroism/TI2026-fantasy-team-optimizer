function normalizedStrata(value) { return Math.max(1, Math.floor(value)); }
export const CONTINUATION_FIDELITY_PRESETS = Object.freeze({
    current: {
        id: 'current',
        description: 'Current-fidelity continuation: retain configured fresh-menu strata at every recursive depth.',
        freshMenuOutcomeStrataByDepth: [],
    },
    high: {
        id: 'high',
        description: 'Preserve the first fresh-menu layer, then reduce deeper continuation outcomes.',
        freshMenuOutcomeStrataByDepth: [8, 6, 4],
    },
    medium: {
        id: 'medium',
        description: 'Moderately compress fresh-menu continuation outcomes from the first future layer onward.',
        freshMenuOutcomeStrataByDepth: [6, 4, 2],
    },
    aggressive: {
        id: 'aggressive',
        description: 'Strongly compress future fresh-menu continuation outcomes while leaving the root decision boundary untouched.',
        freshMenuOutcomeStrataByDepth: [4, 2, 1],
    },
});
export function resolveFreshMenuOutcomeStrata(policy, recursiveDepth, configuredStrata) {
    const base = normalizedStrata(configuredStrata);
    if (!policy || recursiveDepth < 1 || policy.freshMenuOutcomeStrataByDepth.length === 0)
        return base;
    const schedule = policy.freshMenuOutcomeStrataByDepth;
    const scheduled = schedule[Math.min(recursiveDepth - 1, schedule.length - 1)];
    return Math.min(base, normalizedStrata(scheduled ?? base));
}
export function continuationFidelityReport(policy, configuredFreshMenuStrata, rootContinuationEntryStrata) {
    const selected = policy ?? CONTINUATION_FIDELITY_PRESETS.current;
    return {
        id: selected.id,
        description: selected.description,
        freshMenuOutcomeStrataByDepth: [...selected.freshMenuOutcomeStrataByDepth],
        baseFreshMenuOutcomeStrata: normalizedStrata(configuredFreshMenuStrata),
        rootContinuationEntryStrata: normalizedStrata(rootContinuationEntryStrata),
    };
}
//# sourceMappingURL=continuationFidelity.js.map