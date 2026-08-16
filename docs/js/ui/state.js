import { convertBoardLayout, createDefaultBoard, defaultBoard, defaultMenu, resolvedLayoutId } from '../data/defaultState.js';
export class ApplicationState {
    invalidator = () => { };
    board = structuredClone(defaultBoard);
    menu = structuredClone(defaultMenu);
    tokensRemaining = 10;
    username = '[Username]';
    targetScore = 0;
    objective = 'expected_score';
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
    replaceMenuOperation(index, operation, preserveComparison = true) {
        this.menu[index] = operation;
        this.invalidate(preserveComparison);
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
    changeLayout(target) {
        if (resolvedLayoutId(this.board) === target)
            return false;
        this.board = convertBoardLayout(this.board, target);
        this.invalidate(false);
        return true;
    }
    resetBoard() {
        const layoutId = resolvedLayoutId(this.board);
        this.board = createDefaultBoard(layoutId);
        this.menu = structuredClone(defaultMenu);
        this.tokensRemaining = 10;
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