export const STAT_MATCH_GATE = .92;
export const STRUCTURED_CONFIDENCE_GATE = .90;
export function acceptsStatEvidence(matchScore, confidence) {
    return matchScore >= STAT_MATCH_GATE && confidence >= STRUCTURED_CONFIDENCE_GATE;
}
export function shouldRetryStat(confidence) {
    return confidence < STRUCTURED_CONFIDENCE_GATE;
}
export function shouldRetryTier(confidence) {
    return confidence < STRUCTURED_CONFIDENCE_GATE;
}
export async function runStatRepresentationFallbacks(confidence, runOtsu, runRaw) {
    if (!shouldRetryStat(confidence()))
        return { usedOtsu: false, usedRaw: false };
    await runOtsu();
    if (!shouldRetryStat(confidence()))
        return { usedOtsu: true, usedRaw: false };
    await runRaw();
    return { usedOtsu: true, usedRaw: true };
}
//# sourceMappingURL=ocrRetryPolicy.js.map