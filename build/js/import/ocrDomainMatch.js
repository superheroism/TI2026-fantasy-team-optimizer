import { ACTION_CATALOG } from '../data/actionCatalog.js';
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const ALIASES = {
    'Creep Score': ['CREEP SCORE', 'CREEP'], GPM: ['GPM'], Deaths: ['DEATHS'], 'Tower Kills': ['TOWER KILLS', 'TOWER'],
    Madstone: ['MADSTONE COLLECTED', 'MADSTONE'], Kills: ['KILLS'], 'Teamfight Participation': ['TEAMFIGHT PARTICIPATION', 'TEAMFIGHT'],
    'Tormentor Kills': ['TORMENTOR KILLS', 'TORMENTOR'], 'Roshan Kills': ['ROSHAN KILLS', 'ROSHAN'], Stuns: ['STUNS'],
    'Courier Kills': ['COURIER KILLS', 'COURIER'], 'First Blood': ['FIRST BLOOD'], Runes: ['RUNES GRABBED', 'RUNES', 'GRABBED'],
    Watchers: ['WATCHERS', 'TAKEN'], 'Wards Placed': ['WARDS PLACED', 'WARDS', 'PLANTED'], 'Smokes Used': ['SMOKES USED', 'SMOKES', 'USED'],
    'Camps Stacked': ['CAMPS STACKED', 'CAMPS', 'STACKED'], Lotuses: ['LOTUSES', 'GAINED'],
};
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
function distance(a, b) {
    const p = Array.from({ length: b.length + 1 }, (_, i) => i), n = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        n[0] = i;
        for (let j = 1; j <= b.length; j++)
            n[j] = Math.min(n[j - 1] + 1, p[j] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        for (let j = 0; j <= b.length; j++)
            p[j] = n[j];
    }
    return p[b.length];
}
export function ocrSimilarity(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y)
        return 0;
    if (x.includes(y) || y.includes(x))
        return Math.min(x.length, y.length) / Math.max(x.length, y.length);
    return 1 - distance(x, y) / Math.max(x.length, y.length);
}
function tokens(s) { return s.toUpperCase().match(/[A-Z0-9]+%?/g) ?? []; }
function phrases(s, maxWords = 4) {
    const ts = tokens(s), out = [...ts];
    for (let n = 2; n <= Math.min(maxWords, ts.length); n++)
        for (let i = 0; i <= ts.length - n; i++)
            out.push(ts.slice(i, i + n).join(' '));
    return out;
}
function bestPhraseSimilarity(s, target) {
    return Math.max(0, ...phrases(s, Math.max(2, target.trim().split(/\s+/).length + 1)).map(p => ocrSimilarity(p, target)));
}
export function matchStatTextWithMargin(s, legal) {
    let best = { value: legal[0], score: -1 }, runnerUpScore = -1;
    for (const value of legal) {
        const score = Math.max(...ALIASES[value].map(alias => bestPhraseSimilarity(s, alias)));
        if (score > best.score) {
            runnerUpScore = best.score;
            best = { value, score };
        }
        else if (score > runnerUpScore)
            runnerUpScore = score;
    }
    const runner = Math.max(0, runnerUpScore);
    return { ...best, runnerUpScore: runner, margin: Math.max(0, best.score - runner) };
}
export function matchStatText(s, legal) {
    const { value, score } = matchStatTextWithMargin(s, legal);
    return { value, score };
}
function statLineText(s) { return tokens(s).filter(token => !/^\d+%$/.test(token)).join(' '); }
/** Match a stat across OCR line breaks without treating the displayed percentage as part of the stat name. */
export function matchStatLines(lines, legal) {
    let best = { value: legal[0], score: -1, lineIndices: [], text: '' };
    const bestByStat = new Map(legal.map(stat => [stat, -1]));
    const cleaned = lines.map(statLineText);
    const consider = (text, lineIndices) => {
        if (!text.trim())
            return;
        for (const stat of legal) {
            const match = matchStatText(text, [stat]);
            if (match.score > (bestByStat.get(stat) ?? -1))
                bestByStat.set(stat, match.score);
            if (match.score > best.score)
                best = { ...match, lineIndices, text };
        }
    };
    cleaned.forEach((text, index) => consider(text, [index]));
    for (let index = 0; index + 1 < cleaned.length; index++) {
        if (cleaned[index] && cleaned[index + 1])
            consider(cleaned[index] + ' ' + cleaned[index + 1], [index, index + 1]);
    }
    const nonempty = cleaned.map((text, index) => ({ text, index })).filter(row => row.text);
    if (nonempty.length > 1)
        consider(nonempty.map(row => row.text).join(' '), nonempty.map(row => row.index));
    const ranked = [...bestByStat.entries()].sort((a, b) => b[1] - a[1]);
    return { ...best, runnerUpScore: ranked.find(([stat]) => stat !== best.value)?.[1] ?? 0 };
}
export function matchTraitText(s) {
    let best = { value: TRAITS[0], score: -1 };
    for (const value of TRAITS) {
        const score = bestPhraseSimilarity(s, value);
        if (score > best.score)
            best = { value, score };
    }
    return best;
}
export function matchTierText(s) {
    const ts = tokens(s);
    const byRoman = { I: 1, II: 2, III: 3, IV: 4, V: 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
    for (let i = 0; i < ts.length; i++) {
        const token = ts[i] ?? '';
        const fused = token.match(/^TIER(I|II|III|IV|V|[1-5])$/);
        if (fused) {
            const value = byRoman[fused[1]];
            return { value, score: /^[1-5]$/.test(fused[1]) ? .72 : .86 };
        }
        if (ocrSimilarity(token, 'TIER') < .65)
            continue;
        const next = ts[i + 1];
        if (next && byRoman[next])
            return { value: byRoman[next], score: /^[1-5]$/.test(next) ? .72 : .86 };
        const separated = ts.slice(i + 1, i + 6).filter(candidate => /^(II|III|IV|V)$/.test(candidate));
        if (separated.length === 1)
            return { value: byRoman[separated[0]], score: .84 };
    }
    return { value: 1, score: .2 };
}
const STOPWORDS = new Set(['FOR', 'THE', 'AND', 'OF']);
const SCOPE_WORDS = ['FIRST', 'LAST', 'RANDOM'];
const COLOR_WORDS = ['GREEN', 'RED', 'BLUE'];
const KIND_WORDS = ['STAT', 'QUALITY', 'TRAIT'];
function actionTokens(s) { return tokens(s).filter(t => !STOPWORDS.has(t)); }
function observedMatch(ocr, target) {
    const fuzzy = Math.max(0, ...ocr.map(t => ocrSimilarity(t, target)));
    const stems = { INCREASE: ['INC'], QUALITY: ['QUAL', 'QUA', 'QU'], RANDOM: ['RANDOM'], GREEN: ['GRE'], RED: ['RED'], BLUE: ['BLU'], FIRST: ['FIR', 'RST'], LAST: ['LAS'], TRAIT: ['TRA', 'TRAT'], STAT: ['STA'] };
    const stemHit = (stems[target] ?? []).some(stem => ocr.some(token => token.startsWith(stem)));
    return stemHit ? Math.max(fuzzy, .78) : fuzzy;
}
function hasObserved(ocr, target) { return observedMatch(ocr, target) >= .72; }
export function matchActionText(s) {
    const ocr = actionTokens(s);
    if (!ocr.length)
        return undefined;
    const ranked = ACTION_CATALOG.map(action => {
        const label = actionTokens(action.label);
        let score = label.reduce((sum, t) => sum + observedMatch(ocr, t), 0) / Math.max(1, label.length);
        for (const discriminator of SCOPE_WORDS) {
            const expected = label.includes(discriminator), observed = hasObserved(ocr, discriminator);
            if (expected !== observed && observed)
                score -= .18;
            else if (expected && !observed)
                score -= .12;
        }
        for (const discriminator of COLOR_WORDS) {
            const expected = label.includes(discriminator), observed = hasObserved(ocr, discriminator);
            if (!expected && observed)
                score -= .18;
            else if (expected && !observed)
                score -= .08;
        }
        for (const discriminator of KIND_WORDS) {
            const expected = label.includes(discriminator), observed = hasObserved(ocr, discriminator);
            if (!expected && observed)
                score -= .2;
            else if (expected && !observed)
                score -= .1;
        }
        return { id: action.id, score: Math.max(0, Math.min(.99, score)) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best)
        return undefined;
    const runnerUpScore = ranked[1]?.score ?? 0;
    return { ...best, runnerUpScore, margin: best.score - runnerUpScore };
}
//# sourceMappingURL=ocrDomainMatch.js.map