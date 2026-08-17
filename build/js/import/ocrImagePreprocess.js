function histogram(values) {
    const out = new Uint32Array(256);
    for (const value of values)
        out[value] = (out[value] ?? 0) + 1;
    return out;
}
function percentileBin(hist, target) {
    let cumulative = 0;
    for (let i = 0; i < hist.length; i++) {
        cumulative += hist[i] ?? 0;
        if (cumulative >= target)
            return i;
    }
    return 255;
}
export function whitenessValues(rgba) {
    const pixels = Math.floor(rgba.length / 4);
    const values = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
        const offset = i * 4;
        values[i] = Math.min(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0);
    }
    return values;
}
export function contrastStretch(values, lowQuantile = 0.02, highQuantile = 0.98) {
    if (!values.length)
        return { values: new Uint8Array(), low: 0, high: 255 };
    const hist = histogram(values);
    const low = percentileBin(hist, Math.max(1, Math.ceil(values.length * lowQuantile)));
    const high = percentileBin(hist, Math.max(1, Math.ceil(values.length * highQuantile)));
    const span = Math.max(1, high - low);
    const stretched = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i++)
        stretched[i] = Math.max(0, Math.min(255, Math.round(((values[i] - low) * 255) / span)));
    return { values: stretched, low, high };
}
export function otsuThreshold(values) {
    if (!values.length)
        return 127;
    const hist = histogram(values);
    const total = values.length;
    let sum = 0;
    for (let i = 0; i < 256; i++)
        sum += i * (hist[i] ?? 0);
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    let bestThreshold = 127;
    for (let threshold = 0; threshold < 255; threshold++) {
        backgroundWeight += hist[threshold] ?? 0;
        if (!backgroundWeight)
            continue;
        const foregroundWeight = total - backgroundWeight;
        if (!foregroundWeight)
            break;
        backgroundSum += threshold * (hist[threshold] ?? 0);
        const backgroundMean = backgroundSum / backgroundWeight;
        const foregroundMean = (sum - backgroundSum) / foregroundWeight;
        const delta = backgroundMean - foregroundMean;
        const variance = backgroundWeight * foregroundWeight * delta * delta;
        if (variance > bestVariance) {
            bestVariance = variance;
            bestThreshold = threshold;
        }
    }
    return bestThreshold;
}
/**
 * Convert a colored screenshot crop into black glyphs on a white field.
 *
 * The Dota fantasy emblem text is bright and low-saturation while the known
 * red/green/blue card backgrounds have at least one substantially darker RGB
 * channel. min(R,G,B) is therefore a useful color-independent "whiteness"
 * signal once slot color and crop geometry have already been established.
 */
export function otsuWhitenessRgba(rgba) {
    const raw = whitenessValues(rgba);
    const stretched = contrastStretch(raw);
    const threshold = otsuThreshold(stretched.values);
    const output = new Uint8ClampedArray(raw.length * 4);
    for (let i = 0; i < stretched.values.length; i++) {
        const pixel = stretched.values[i] > threshold ? 0 : 255;
        const offset = i * 4;
        output[offset] = pixel;
        output[offset + 1] = pixel;
        output[offset + 2] = pixel;
        output[offset + 3] = 255;
    }
    return { rgba: output, threshold, contrastLow: stretched.low, contrastHigh: stretched.high };
}
//# sourceMappingURL=ocrImagePreprocess.js.map