export const STAT_MATCH_GATE = .92;
export const STRUCTURED_CONFIDENCE_GATE = .90;
export const EXACT_STAT_CONFIDENCE_GATE = .82;
export const FUZZY_STAT_MATCH_GATE = .70;
export const FUZZY_STAT_MARGIN_GATE = .25;
export const FUZZY_STAT_CONFIDENCE_GATE = .68;
/**
 * Accept stat evidence in three cases: exact legal text, the historical strong
 * fuzzy gate, or a lower-confidence fuzzy read that wins decisively over every
 * other stat in the same legal color pool. The measured confidence is retained;
 * this function never promotes a review-required value to high confidence.
 */
export function acceptsStatEvidence(matchScore, confidence, runnerUpMargin = 0) {
    if (matchScore >= .999 && confidence >= EXACT_STAT_CONFIDENCE_GATE)
        return true;
    if (matchScore >= FUZZY_STAT_MATCH_GATE && runnerUpMargin >= FUZZY_STAT_MARGIN_GATE && confidence >= FUZZY_STAT_CONFIDENCE_GATE)
        return true;
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