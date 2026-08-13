import { displayTeamName } from '../data/ti2026Rosters.js';
const ROLES = ['core', 'mid', 'support'];
export function titlePrefixBoostPct(catalog, role, team, prefixId) {
    const canonical = displayTeamName(team);
    return catalog.prefixBoostPctByRoleTeam[role]?.[canonical]?.[prefixId] ?? 0;
}
function fixedSuffix(catalog) {
    return catalog.suffixes.find(s => s.id === catalog.fixedSuffixId) ?? catalog.suffixes[0] ?? null;
}
export function evaluatePrefixForRoster(prefix, roster, catalog) {
    const roleBoostPct = { core: 0, mid: 0, support: 0 };
    const roleExpectedGain = { core: 0, mid: 0, support: 0 };
    let expectedBonus = 0;
    for (const role of ROLES) {
        const row = roster[role][0];
        if (!row)
            continue;
        const pct = titlePrefixBoostPct(catalog, role, row.team, prefix.id);
        const gain = row.expected * pct / 100;
        roleBoostPct[role] = pct;
        roleExpectedGain[role] = gain;
        expectedBonus += gain;
    }
    return { expectedBonus, roleBoostPct, roleExpectedGain };
}
export function recommendTitle(username, roster, catalog, forcedPrefixId) {
    const suffix = fixedSuffix(catalog);
    const available = catalog.prefixes.filter(prefix => forcedPrefixId === undefined || prefix.id === forcedPrefixId);
    let bestPrefix = null;
    let best = null;
    for (const prefix of available) {
        const evaluated = evaluatePrefixForRoster(prefix, roster, catalog);
        if (best === null || evaluated.expectedBonus > best.expectedBonus) {
            best = evaluated;
            bestPrefix = prefix;
        }
    }
    if (!bestPrefix || !best) {
        return {
            prefix: null, suffix, expectedBonus: 0,
            display: `— ${username || '[Username]'} the ${suffix?.label ?? '—'}`,
            confidence: 'low', roleBoostPct: { core: 0, mid: 0, support: 0 }, roleExpectedGain: { core: 0, mid: 0, support: 0 },
            suffixExplainer: catalog.suffixExplainer, note: 'No prefix boost data matched the selected team configuration.'
        };
    }
    const display = `${bestPrefix.label} ${username || '[Username]'} the ${suffix?.label ?? '—'}`;
    return {
        prefix: bestPrefix, suffix, expectedBonus: best.expectedBonus, display, confidence: 'medium',
        roleBoostPct: best.roleBoostPct, roleExpectedGain: best.roleExpectedGain, suffixExplainer: catalog.suffixExplainer,
        note: `Expected prefix gain: Core +${best.roleBoostPct.core.toFixed(1)}% · Mid +${best.roleBoostPct.mid.toFixed(1)}% · Support +${best.roleBoostPct.support.toFixed(1)}%.`
    };
}
//# sourceMappingURL=title.js.map