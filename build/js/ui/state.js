import { DEFAULT_EXPECTED_SERIES_BY_LAYOUT, convertBoardLayout, createDefaultBoard, defaultMenu, resolvedLayoutId } from '../data/defaultState.js';
export class ApplicationState {
    invalidator = () => { };
    expectedSeriesAuto = { core: true, mid: true, support: true };
    board = createDefaultBoard('expanded_5');
    menu = structuredClone(defaultMenu);
    tokensRemaining = 30;
    username = '[Username]';
    targetScore = 0;
    objective = 'expected_score';
    statisticalDatasetId = 'group-stage-correlations';
    comparisonRole = 'core';
    theme = 'dark';
    setInvalidator(invalidator) {
        this.invalidator = invalidator;
    }
    optimizerState() {
        const state = {
            board: this.board,
            tokensRemaining: this.tokensRemaining,
            menu: this.menu,
            menuRerollAvailable: true,
            username: this.username,
            objective: this.objective,
        };
        if (this.targetScore > 0)
            state.targetScore = this.targetScore;
        return state;
    }
    mutateBoard(mutator, preserveComparison = false) {
        mutator(this.board);
        this.invalidate(preserveComparison);
    }
    setExpectedSeries(role, value) {
        this.board[role].expectedSeries = Math.max(1, value || 1);
        this.expectedSeriesAuto[role] = false;
        this.invalidate(false);
    }
    replaceMenuOperation(index, operation, preserveComparison = true) {
        this.menu[index] = operation;
        this.invalidate(preserveComparison);
    }
    importScreenshot(board, menu, tokensRemaining) {
        const previousLayout = resolvedLayoutId(this.board);
        const importedLayout = resolvedLayoutId(board);
        this.board = structuredClone(board);
        for (const role of ['core', 'mid', 'support']) {
            if (previousLayout !== importedLayout)
                this.board[role].expectedSeries = DEFAULT_EXPECTED_SERIES_BY_LAYOUT[importedLayout];
            this.expectedSeriesAuto[role] = this.board[role].expectedSeries === DEFAULT_EXPECTED_SERIES_BY_LAYOUT[importedLayout];
        }
        this.menu = structuredClone(menu);
        if (tokensRemaining !== undefined)
            this.tokensRemaining = Math.max(0, tokensRemaining);
        this.invalidate(false);
    }
    updateControls(patch, preserveComparison = true) {
        if (patch.tokensRemaining !== undefined)
            this.tokensRemaining = Math.max(0, patch.tokensRemaining);
        if (patch.username !== undefined)
            this.username = patch.username || '[Username]';
        if (patch.targetScore !== undefined)
            this.targetScore = Math.max(0, patch.targetScore);
        if (patch.objective !== undefined)
            this.objective = patch.objective;
        this.invalidate(preserveComparison);
    }
    setStatisticalDataset(id) {
        if (this.statisticalDatasetId === id)
            return false;
        this.statisticalDatasetId = id;
        this.invalidate(false);
        return true;
    }
    changeLayout(target) {
        if (resolvedLayoutId(this.board) === target)
            return false;
        const manualExpectedSeries = {};
        for (const role of ['core', 'mid', 'support']) {
            if (!this.expectedSeriesAuto[role])
                manualExpectedSeries[role] = this.board[role].expectedSeries;
        }
        this.board = convertBoardLayout(this.board, target);
        for (const role of ['core', 'mid', 'support']) {
            if (!this.expectedSeriesAuto[role])
                this.board[role].expectedSeries = manualExpectedSeries[role];
        }
        this.invalidate(false);
        return true;
    }
    resetBoard() {
        const layoutId = resolvedLayoutId(this.board);
        this.board = createDefaultBoard(layoutId);
        this.expectedSeriesAuto = { core: true, mid: true, support: true };
        this.menu = structuredClone(defaultMenu);
        this.tokensRemaining = 30;
        this.invalidate(false);
    }
    advanceRoll() {
        if (this.tokensRemaining <= 0)
            return false;
        this.tokensRemaining = Math.max(0, this.tokensRemaining - 1);
        this.invalidate(true);
        return true;
    }
    setComparisonRole(role) {
        this.comparisonRole = role;
    }
    setTheme(theme) {
        this.theme = theme;
    }
    invalidate(preserveComparison) {
        this.invalidator({ preserveComparison });
    }
}
//# sourceMappingURL=state.js.map