export function recommendTitle(username, roster, catalog, triggerRateByPlayer) {
    if (!catalog.prefixes.length && !catalog.suffixes.length) {
        return { prefix: null, suffix: null, expectedBonus: 0, display: `— ${username || '[Username]'} the —`, confidence: 'low', note: 'Title EV not included in V1: ScriptsBits does not provide title-trigger distributions.' };
    }
    const weightedPlayers = ['core', 'mid', 'support'].flatMap(role => roster[role].map(player => ({ player, weight: 1 })));
    const base = weightedPlayers.reduce((sum, x) => sum + x.player.expected * x.weight, 0);
    let bestPrefix = null, bestPrefixBonus = 0;
    for (const prefix of catalog.prefixes) {
        const weightedTrigger = base <= 0 ? 0 : weightedPlayers.reduce((sum, x) => sum + x.player.expected * x.weight * (triggerRateByPlayer.get(x.player.playerId)?.[prefix.id] ?? 0), 0) / base;
        const bonus = base * (prefix.bonusPct / 100) * weightedTrigger;
        if (bonus > bestPrefixBonus) {
            bestPrefixBonus = bonus;
            bestPrefix = prefix;
        }
    }
    let bestSuffix = null, bestSuffixBonus = 0;
    for (const suffix of catalog.suffixes) {
        if (suffix.triggerProbability === undefined)
            continue;
        const bonus = base * (suffix.bonusPct / 100) * suffix.triggerProbability;
        if (bonus > bestSuffixBonus) {
            bestSuffixBonus = bonus;
            bestSuffix = suffix;
        }
    }
    const suffixCalibrated = catalog.suffixes.some(s => s.triggerProbability !== undefined);
    const result = { prefix: bestPrefix, suffix: bestSuffix, expectedBonus: bestPrefixBonus + bestSuffixBonus, display: `${bestPrefix?.label ?? '—'} ${username || '[Username]'} the ${bestSuffix?.label ?? '—'}`, confidence: suffixCalibrated ? 'medium' : 'low' };
    if (!suffixCalibrated)
        result.note = 'Suffix trigger probabilities are not calibrated in this data bundle.';
    return result;
}
//# sourceMappingURL=title.js.map