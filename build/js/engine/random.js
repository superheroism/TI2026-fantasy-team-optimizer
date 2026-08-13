export class SeededRandom {
    state;
    spare = null;
    constructor(seed) { this.state = (seed >>> 0) || 1; }
    uniform() {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x >>> 0;
        return (this.state + 0.5) / 4294967296;
    }
    normal() {
        if (this.spare !== null) {
            const z = this.spare;
            this.spare = null;
            return z;
        }
        const u1 = Math.max(1e-12, this.uniform());
        const u2 = this.uniform();
        const r = Math.sqrt(-2 * Math.log(u1));
        const theta = 2 * Math.PI * u2;
        this.spare = r * Math.sin(theta);
        return r * Math.cos(theta);
    }
}
export function normalCdf(x) {
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * erf);
}
export function cholesky3(matrix) {
    const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j <= i; j++) {
            let sum = matrix[i]?.[j] ?? (i === j ? 1 : 0);
            for (let k = 0; k < j; k++)
                sum -= (L[i]?.[k] ?? 0) * (L[j]?.[k] ?? 0);
            if (i === j)
                L[i][j] = Math.sqrt(Math.max(sum, 1e-9));
            else
                L[i][j] = sum / Math.max(L[j]?.[j] ?? 1, 1e-9);
        }
    }
    return L;
}
export function correlatedUniforms(rng, correlation) {
    const L = cholesky3(correlation);
    const z = [rng.normal(), rng.normal(), rng.normal()];
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
        out[i] = (L[i]?.[0] ?? 0) * z[0] + (L[i]?.[1] ?? 0) * z[1] + (L[i]?.[2] ?? 0) * z[2];
    }
    return [normalCdf(out[0]), normalCdf(out[1]), normalCdf(out[2])];
}
//# sourceMappingURL=random.js.map