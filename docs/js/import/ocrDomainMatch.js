import { ACTION_CATALOG } from '../data/actionCatalog.js';
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const ALIASES = {
    'Creep Score': ['CREEP SCORE', 'CREEP'], GPM: ['GPM'], Deaths: ['DEATHS'], 'Tower Kills': ['TOWER KILLS', 'TOWER'],
    Madstone: ['MADSTONE COLLECTED', 'MADSTONE'], Kills: ['KILLS'], 'Teamfight Participation': ['TEAMFIGHT PARTICIPATION', 'TEAMFIGHT'],
    'Tormentor Kills': ['TORMENTOR KILLS', 'TORMENTOR'], 'Roshan Kills': ['ROSHAN KILLS', 'ROSHAN'], Stuns: ['STUNS'],
    'Courier Kills': ['COURIER KILLS', 'COURIER'], 'First Blood': ['FIRST BLOOD'], Runes: ['RUNES GRABBED', 'RUNES'],
    Watchers: ['WATCHERS'], 'Wards Placed': ['WARDS PLACED', 'WARDS'], 'Smokes Used': ['SMOKES USED', 'SMOKES'],
    'Camps Stacked': ['CAMPS STACKED', 'CAMPS'], Lotuses: ['LOTUSES'],
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
export function matchStatText(s, legal) {
    let best = { value: legal[0], score: -1 };
    for (const value of legal) {
        const score = Math.max(...ALIASES[value].map(alias => bestPhraseSimilarity(s, alias)));
        if (score > best.score)
            best = { value, score };
    }
    return best;
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
    const byBonus = { '10%': 1, '30%': 2, '60%': 3, '100%': 4, '150%': 5 };
    for (const token of ts) {
        const value = byBonus[token];
        if (value)
            return { value, score: .99 };
    }
    const byRoman = { I: 1, II: 2, III: 3, IV: 4, V: 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
    for (let i = 0; i < ts.length; i++) {
        if (ocrSimilarity(ts[i] ?? '', 'TIER') < .65)
            continue;
        const next = ts[i + 1];
        if (next && byRoman[next])
            return { value: byRoman[next], score: /^[1-5]$/.test(next) ? .72 : .86 };
    }
    return { value: 1, score: .2 };
}
const STOPWORDS = new Set(['FOR', 'THE', 'ONE', 'AND', 'OF']);
const SCOPE_WORDS = ['FIRST', 'LAST', 'RANDOM'];
const COLOR_WORDS = ['GREEN', 'RED', 'BLUE'];
const KIND_WORDS = ['STAT', 'QUALITY', 'TRAIT'];
function actionTokens(s) { return tokens(s).filter(t => !STOPWORDS.has(t)); }
function observedMatch(ocr, target) {
    const fuzzy = Math.max(0, ...ocr.map(t => ocrSimilarity(t, target)));
    const stems = { INCREASE: ['INC'], QUALITY: ['QUAL'], RANDOM: ['RANDOM'], GREEN: ['GRE'], RED: ['RED'], BLUE: ['BLU'] };
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
    return ranked[0];
}
//# sourceMappingURL=ocrDomainMatch.js.map