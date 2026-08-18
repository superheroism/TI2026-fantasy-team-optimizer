/** Snapshot of the 16 TI 2026 rosters used only to make team-role labels legible. */
export const TI2026_ROSTERS = [
    { canonical: 'Aurora Gaming', aliases: ['Aurora'], positions: ['Nightfall', 'Mikoto', 'Ws', 'Mira', 'kaori'] },
    { canonical: 'BoomBoys', aliases: ['BB', 'BB Team', 'BetBoom Team'], positions: ['Kiritych~', 'gpk~', 'MieRo`', 'Save-', 'Kataomi'] },
    { canonical: 'Team Falcons', aliases: ['Falcons'], positions: ['skiter', 'Malr1ne', 'ATF', 'Cr1t-', 'Sneyking'] },
    { canonical: 'Team Liquid', aliases: ['Liquid'], positions: ['m1CKe', 'Nisha', 'Ace', 'Boxi', 'tOfu'] },
    { canonical: 'Iron Wing', aliases: ['1w', '1w Team', 'Tundra Esports', 'Iron Wling'], positions: ['Pure', 'bzm', '33', 'Ari', 'Whitemon'] },
    { canonical: 'Xtreme Gaming', aliases: ['XG'], positions: ['Ame', 'NothingToSay', 'Xxs', 'fy', 'xNova'] },
    { canonical: 'Team Yandex', aliases: ['team y', 'Team Y', 'Yandex'], positions: ['watson', 'CHIRA_JUNIOR', 'DM', 'Saksa', 'Maladych'] },
    { canonical: 'Team Spirit', aliases: ['Spirit'], positions: ['Yatoro', 'Larl', 'Collapse', 'not me', 'rue'] },
    { canonical: 'Team Vision', aliases: ['TEAM VISION', 'PARIVISION', 'PV'], positions: ['Satanic', 'No[o]ne-', 'Noticed', '9Class', 'Dukalis'] },
    { canonical: 'Nigma Galaxy', aliases: ['Nigma'], positions: ['SumaiL', 'lorenof', 'Davai', 'OmaR', 'GH'] },
    { canonical: 'HULIGANI', aliases: ['huligani'], positions: ['ssnovv1', 'Mirage`', 'Corrupted', 'sayuw', 'RESPECT'] },
    { canonical: 'Team Resilience', aliases: ['Resilience'], positions: ['YSR-04E', 'Echozz', 'niu', 'planet', 'zzq'] },
    { canonical: 'Vici Gaming', aliases: ['Vici', 'VG'], positions: ['shiro', 'Xm', 'Bach', 'XinQ', 'y`'] },
    { canonical: 'OG', aliases: [], positions: ['Natsumi', 'Yopaj-', 'Raven', 'TIMS', 'skem'] },
    { canonical: 'GamerLegion', aliases: ['GL'], positions: ['Ghost', 'RCY', 'Fayde', 'Bignum', 'Speeed'] },
    { canonical: 'LGD Gaming', aliases: ['LGD'], positions: ['Yuma', 'Topson', 'Wisper', 'Thiolicor', 'KJ'] },
];
/** Main Event eligibility is separate from historical statistical-model coverage. */
export const TI2026_MAIN_EVENT_ELIGIBLE_TEAMS = [
    'Team Spirit',
    'Team Vision',
    'Team Falcons',
    'BoomBoys',
    'Iron Wing',
    'Team Yandex',
    'Team Liquid',
    'Nigma Galaxy',
];
function norm(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }
export function rosterForTeam(team) {
    const n = norm(team);
    return TI2026_ROSTERS.find(r => [r.canonical, ...r.aliases].some(x => norm(x) === n));
}
export function isMainEventEligibleTeam(team) {
    const canonical = rosterForTeam(team)?.canonical ?? team;
    return TI2026_MAIN_EVENT_ELIGIBLE_TEAMS.includes(canonical);
}
export function attachedPlayers(team, role) {
    const r = rosterForTeam(team);
    if (!r)
        return [];
    if (role === 'core')
        return [r.positions[0], r.positions[2]];
    if (role === 'mid')
        return [r.positions[1]];
    return [r.positions[3], r.positions[4]];
}
export function displayTeamName(team) {
    return rosterForTeam(team)?.canonical ?? team;
}
export function teamRoleLabel(team, role) {
    const p = attachedPlayers(team, role);
    const label = displayTeamName(team);
    return p.length ? `${label} (${p.join(' + ')})` : label;
}
//# sourceMappingURL=ti2026Rosters.js.map