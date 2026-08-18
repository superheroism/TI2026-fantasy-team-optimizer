import type { BoardLayoutId, BoardState, MenuState, OfferedOperation, OptimizerState, Role, StatisticalDatasetId } from '../domain/types.js';
import { DEFAULT_EXPECTED_SERIES_BY_LAYOUT, convertBoardLayout, createDefaultBoard, defaultBoard, defaultMenu, resolvedLayoutId } from '../data/defaultState.js';

export interface OptimizerStateInvalidation {
  preserveComparison: boolean;
}

export type OptimizerStateInvalidator = (event: OptimizerStateInvalidation) => void;

export interface ControlStatePatch {
  tokensRemaining?: number;
  username?: string;
  targetScore?: number;
  objective?: OptimizerState['objective'];
}

export class ApplicationState {
  private invalidator: OptimizerStateInvalidator = () => {};
  private expectedSeriesAuto:Record<Role,boolean>={core:true,mid:true,support:true};

  board: BoardState = structuredClone(defaultBoard);
  menu: MenuState = structuredClone(defaultMenu);
  tokensRemaining = 10;
  username = '[Username]';
  targetScore = 0;
  objective: OptimizerState['objective'] = 'expected_score';
  statisticalDatasetId:StatisticalDatasetId='pre-ti2026-correlations';

  comparisonRole: Role = 'core';
  theme: 'dark' | 'light' = 'dark';

  setInvalidator(invalidator: OptimizerStateInvalidator): void {
    this.invalidator = invalidator;
  }

  optimizerState(): OptimizerState {
    const state: OptimizerState = {
      board: this.board,
      tokensRemaining: this.tokensRemaining,
      menu: this.menu,
      menuRerollAvailable: true,
      username: this.username,
      objective: this.objective,
    };
    if (this.targetScore > 0) state.targetScore = this.targetScore;
    return state;
  }

  mutateBoard(mutator: (board: BoardState) => void, preserveComparison = false): void {
    mutator(this.board);
    this.invalidate(preserveComparison);
  }

  setExpectedSeries(role:Role,value:number):void {
    this.board[role].expectedSeries=Math.max(1,value||1);
    this.expectedSeriesAuto[role]=false;
    this.invalidate(false);
  }

  replaceMenuOperation(index: number, operation: OfferedOperation, preserveComparison = true): void {
    this.menu[index] = operation;
    this.invalidate(preserveComparison);
  }

  importScreenshot(board: BoardState, menu: MenuState, tokensRemaining?: number): void {
    const previousLayout=resolvedLayoutId(this.board);
    const importedLayout=resolvedLayoutId(board);
    this.board = structuredClone(board);
    for (const role of ['core', 'mid', 'support'] as const) {
      if(previousLayout!==importedLayout)this.board[role].expectedSeries=DEFAULT_EXPECTED_SERIES_BY_LAYOUT[importedLayout];
      this.expectedSeriesAuto[role]=this.board[role].expectedSeries===DEFAULT_EXPECTED_SERIES_BY_LAYOUT[importedLayout];
    }
    this.menu = structuredClone(menu);
    if (tokensRemaining !== undefined) this.tokensRemaining = Math.max(0, tokensRemaining);
    this.invalidate(false);
  }

  updateControls(patch: ControlStatePatch, preserveComparison = true): void {
    if (patch.tokensRemaining !== undefined) this.tokensRemaining = Math.max(0, patch.tokensRemaining);
    if (patch.username !== undefined) this.username = patch.username || '[Username]';
    if (patch.targetScore !== undefined) this.targetScore = Math.max(0, patch.targetScore);
    if (patch.objective !== undefined) this.objective = patch.objective;
    this.invalidate(preserveComparison);
  }

  setStatisticalDataset(id:StatisticalDatasetId):boolean {
    if(this.statisticalDatasetId===id)return false;
    this.statisticalDatasetId=id;
    this.invalidate(false);
    return true;
  }

  changeLayout(target: BoardLayoutId): boolean {
    if (resolvedLayoutId(this.board) === target) return false;
    const manualExpectedSeries={} as Record<Role,number>;
    for(const role of ['core','mid','support'] as const){
      if(!this.expectedSeriesAuto[role])manualExpectedSeries[role]=this.board[role].expectedSeries;
    }
    this.board = convertBoardLayout(this.board, target);
    for(const role of ['core','mid','support'] as const){
      if(!this.expectedSeriesAuto[role])this.board[role].expectedSeries=manualExpectedSeries[role]!;
    }
    this.invalidate(false);
    return true;
  }

  resetBoard(): void {
    const layoutId = resolvedLayoutId(this.board);
    this.board = createDefaultBoard(layoutId);
    this.expectedSeriesAuto={core:true,mid:true,support:true};
    this.menu = structuredClone(defaultMenu);
    this.tokensRemaining = 10;
    this.invalidate(false);
  }

  advanceRoll(): boolean {
    if (this.tokensRemaining <= 0) return false;
    this.tokensRemaining = Math.max(0, this.tokensRemaining - 1);
    this.invalidate(true);
    return true;
  }

  setComparisonRole(role: Role): void {
    this.comparisonRole = role;
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.theme = theme;
  }

  private invalidate(preserveComparison: boolean): void {
    this.invalidator({ preserveComparison });
  }
}
