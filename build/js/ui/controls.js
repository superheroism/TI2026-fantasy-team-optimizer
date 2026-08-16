import { ACTION_BY_ID, cloneAction } from '../data/actionCatalog.js';
const $ = (selector) => document.querySelector(selector);
export function bindDynamicControls(state, callbacks) {
    document.querySelectorAll('.emblem [data-field]').forEach(input => input.addEventListener('change', () => {
        const emblem = input.closest('.emblem');
        if (!emblem)
            return;
        const role = emblem.dataset.role;
        const index = Number(emblem.dataset.index);
        const field = input.dataset.field;
        state.mutateBoard(board => {
            const target = board[role].emblems[index];
            if (!target)
                return;
            if (field === 'stat')
                target.stat = input.value;
            else if (field === 'qualityTier')
                target.qualityTier = Number(input.value);
            else if (field === 'trait')
                target.trait = input.value;
        }, false);
        callbacks.renderStructure();
    }));
    document.querySelectorAll('.series').forEach(input => input.addEventListener('change', () => {
        const role = input.dataset.role;
        state.mutateBoard(board => { board[role].expectedSeries = Math.max(1, Number(input.value) || 1); }, false);
        callbacks.renderStructure();
    }));
    document.querySelectorAll('.team-select').forEach(input => input.addEventListener('change', () => {
        const role = input.dataset.role;
        state.mutateBoard(board => { board[role].selectedTeam = input.value; }, true);
        callbacks.renderStructure();
        callbacks.teamChanged(role);
    }));
    document.querySelectorAll('.op-card').forEach(card => card.querySelectorAll('[data-opfield="action"]').forEach(input => input.addEventListener('change', () => {
        const index = Number(card.dataset.op);
        const next = ACTION_BY_ID.get(input.value);
        if (!next)
            return;
        state.replaceMenuOperation(index, cloneAction(next), true);
        callbacks.renderStructure();
    })));
}
export function bindStaticControls(state, callbacks) {
    $('#tokens').addEventListener('change', input => state.updateControls({ tokensRemaining: Number(input.currentTarget.value) || 0 }, true));
    $('#username').addEventListener('change', input => state.updateControls({ username: input.currentTarget.value }, true));
    $('#target').addEventListener('change', input => state.updateControls({ targetScore: Number(input.currentTarget.value) || 0 }, true));
    $('#objective').addEventListener('change', input => state.updateControls({ objective: input.currentTarget.value }, true));
    $('#optimize').addEventListener('click', callbacks.optimize);
    $('#next-roll').addEventListener('click', callbacks.nextRoll);
    $('#reset').addEventListener('click', callbacks.reset);
    document.querySelectorAll('[data-layout-slots]').forEach(button => button.addEventListener('click', () => {
        const target = button.dataset.layoutSlots === '5' ? 'expanded_5' : 'legacy_3';
        if (state.changeLayout(target))
            callbacks.layoutChanged();
    }));
    $('#theme-toggle').addEventListener('change', event => callbacks.themeChanged(event.currentTarget.checked ? 'dark' : 'light'));
}
export function reflectTokens(tokensRemaining) {
    $('#tokens').value = String(tokensRemaining);
}
export function updateLayoutToggle(state, resolvedLayoutId) {
    const current = resolvedLayoutId(state.board);
    document.querySelectorAll('[data-layout-slots]').forEach(button => {
        const active = (button.dataset.layoutSlots === '5' ? 'expanded_5' : 'legacy_3') === current;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}
//# sourceMappingURL=controls.js.map