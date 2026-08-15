export type Role = 'core' | 'mid' | 'support';
export type BoardLayoutId = 'legacy_3' | 'expanded_5';
/** Physical emblem color. Purple uses the existing blue-stat pool; it is a geometry/color distinction, not a new stat pool. */
export type SlotColor = 'red' | 'green' | 'blue' | 'purple';
export type QualityTier = 1 | 2 | 3 | 4 | 5;
export type Confidence = 'high' | 'medium' | 'low';
export type ModelingMode = 'full_simulation' | 'distribution_aware_proxy' | 'average_proxy' | 'heuristic';
export type Objective = 'expected_score' | 'target_probability';

export type StatName =
  | 'Creep Score' | 'GPM' | 'Deaths' | 'Tower Kills' | 'Madstone' | 'Kills'
  | 'Teamfight Participation' | 'Tormentor Kills' | 'Roshan Kills' | 'Stuns' | 'Courier Kills' | 'First Blood'
  | 'Runes' | 'Watchers' | 'Wards Placed' | 'Smokes Used' | 'Camps Stacked' | 'Lotuses';

export type TraitName = 'Fractal' | 'Friendly' | 'Vampiric' | 'Unique' | 'Benevolent';

export interface EmblemState {
  id: string;
  position: number;
  color: SlotColor;
  stat: StatName;
  qualityTier: QualityTier;
  trait: TraitName;
}

export type BannerEmblems =
  | [EmblemState, EmblemState, EmblemState]
  | [EmblemState, EmblemState, EmblemState, EmblemState, EmblemState];

export interface BannerState {
  role: Role;
  /** User-selectable Fantasy roster unit. Core/Support resolve to a fixed same-team pair; Mid to one player. */
  selectedTeam: string;
  emblems: BannerEmblems;
  expectedSeries: number;
}

/**
 * Descriptive/UI board state. Pre-M6A persisted boards omit layoutId and therefore
 * load as legacy_3 at the adapter/persistence boundary.
 */
export type BoardState = Record<Role, BannerState> & { layoutId?: BoardLayoutId };

export interface QuantilePoint { q: number; value: number; }
export type StatQuantiles = Partial<Record<StatName, QuantilePoint[]>>;

/**
 * V1 uses one team-role profile as the atomic roster candidate.
 * - core profile = fixed position 1 + position 3 pair, already represented by the bundled role distribution
 * - mid profile = fixed position 2 player
 * - support profile = fixed position 4 + position 5 pair, already represented by the bundled role distribution
 */
export interface PlayerProfile {
  id: string;
  name: string;
  team: string;
  role: Role;
  attachedPlayers: string[];
  statQuantiles: StatQuantiles;
  /** Effective sample support for each stat when available. */
  effectiveGamesByStat?: Partial<Record<StatName, number>>;
  titleTriggerRates?: Record<string, number>;
}

export interface PrefixTitle { id: string; label: string; }
export interface SuffixTitle { id: string; label: string; }
export interface TitleCatalog {
  prefixes: PrefixTitle[];
  suffixes: SuffixTitle[];
  /** Expected prefix boost as % of that role's pre-title banner points, keyed by canonical team then prefix id. */
  prefixBoostPctByRoleTeam: Record<Role, Record<string, Record<string, number>>>;
  fixedSuffixId: string;
  suffixExplainer: string;
}

export interface RoleCorrelationModel {
  stats: StatName[];
  /** Spearman rank-correlation matrix from the bundled statistical model. */
  spearman: number[][];
}

export interface ScoringRules {
  retainedGamesPerSeries: number;
  retainedSeries: number;
  /** Probability a Bo3 reaches a third game. */
  thirdGameProbability: number;
}

export interface SimulationSettings {
  /** Main selected-setup Monte Carlo distribution. */
  iterations: number;
  /** Lower-cost simulation used inside stochastic action enumeration. */
  optimizerIterations: number;
  /** Per-team iterations for the role comparison boards. */
  rankingIterations: number;
  seed: number;
  scoring: ScoringRules;
  maxLookaheadTokens?: number;
  /** Max deterministic probability strata per stochastic outcome set on the second lookahead step. */
  continuationOutcomeStrata?: number;
  /** Max probability strata used when integrating first-step outcomes into second-step continuation. */
  continuationEntryStrata?: number;
}

export interface DataBundle {
  label: string;
  isDemo: boolean;
  sourceUrl?: string;
  players: PlayerProfile[];
  titles: TitleCatalog;
  simulation: SimulationSettings;
  roleCorrelations: Record<Role, RoleCorrelationModel>;
  /** Optional override. V1 otherwise uses the known uniform 20-action catalogue. */
  menuSamples?: MenuState[];
}

export type OperationKind = 'stat_reroll' | 'quality_reroll' | 'quality_increase' | 'quality_redistribution' | 'trait_reroll';
export type MatchingScope = 'all_matching' | 'first_matching' | 'last_matching' | 'random_matching';

export interface StatRerollOperation {
  id: string;
  label: string;
  kind: 'stat_reroll';
  color: SlotColor;
  scope: MatchingScope;
  excludeCurrent: boolean;
  outcomeWeights?: Partial<Record<StatName, number>>;
}

export interface ColoredRerollOperation {
  id: string;
  label: string;
  kind: 'quality_reroll' | 'trait_reroll';
  color: SlotColor;
  scope: MatchingScope;
}

export interface GlobalQualityOperation {
  id: string;
  label: string;
  kind: 'quality_increase' | 'quality_redistribution';
}

export type OfferedOperation = StatRerollOperation | ColoredRerollOperation | GlobalQualityOperation;
export type MenuState = [OfferedOperation, OfferedOperation, OfferedOperation];

export interface OptimizerState {
  board: BoardState;
  tokensRemaining: number;
  menu: MenuState;
  menuRerollAvailable: boolean;
  username: string;
  objective: Objective;
  targetScore?: number;
}

export interface RosterSelection {
  core: PlayerScore[];
  mid: PlayerScore[];
  support: PlayerScore[];
}

export interface PlayerScore {
  playerId: string;
  name: string;
  team: string;
  attachedPlayers: string[];
  expected: number;
  samples: number[];
  effectiveGames?: number;
}

export interface TitleRecommendation {
  prefix: PrefixTitle | null;
  suffix: SuffixTitle | null;
  expectedBonus: number;
  display: string;
  confidence: Confidence;
  roleBoostPct: Record<Role, number>;
  roleExpectedGain: Record<Role, number>;
  suffixExplainer?: string;
  note?: string;
}

export interface BoardEvaluation {
  expected: number;
  median: number;
  p10: number;
  p90: number;
  targetProbability?: number;
  samples: number[];
  roster: RosterSelection;
  title: TitleRecommendation;
  modelingMode: ModelingMode;
  confidence: Confidence;
}

export type DecisionAction =
  | { kind: 'stop' }
  | { kind: 'menu_reroll' }
  | { kind: 'board_action'; operationId: string; banner: Role };

export interface ActionEvaluation {
  action: DecisionAction;
  expectedFinalUtility: number;
  expectedFinalScore: number;
  pImprove?: number;
  /** Weighted quantiles of terminal utility across the modeled reroll/continuation outcomes. */
  outcomeP10Utility?: number;
  outcomeMedianUtility?: number;
  outcomeP90Utility?: number;
  downside?: number;
  tokensAfter: number;
  assetAtRisk: string;
  confidence: Confidence;
  status: 'evaluated' | 'needs_transition_model' | 'needs_menu_model';
  note?: string;
}

export interface RecommendationResult {
  current: BoardEvaluation;
  ranking: ActionEvaluation[];
  recommendation: ActionEvaluation;
  futureMenuMode: 'known_uniform' | 'override_samples';
}
