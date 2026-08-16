import type {
  BannerEmblems,
  BoardLayoutId,
  BoardState,
  DataBundle,
  EmblemState,
  MenuState,
  QualityTier,
  Role,
  SlotColor,
  StatName,
  TraitName,
} from '../domain/types.js';
import { BOARD_LAYOUTS, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../data/actionCatalog.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];
const TRAITS: readonly TraitName[] = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const REVIEW_THRESHOLD = 0.9;

export interface ScreenshotFieldConfidence {
  path: string;
  confidence: number;
}

export interface RawScreenshotEmblem {
  position: number;
  color: SlotColor;
  stat: StatName;
  qualityTier: QualityTier;
  trait: TraitName;
}

export interface RawScreenshotBanner {
  selectedTeam: string;
  emblems: RawScreenshotEmblem[];
}

export interface RawScreenshotImport {
  layoutId: BoardLayoutId;
  banners: Record<Role, RawScreenshotBanner>;
  operationIds: [string, string, string];
  tokensRemaining?: number;
  fieldConfidence?: ScreenshotFieldConfidence[];
  warnings?: string[];
}

export interface ScreenshotImportRequest {
  imageDataUrl: string;
  teamsByRole: Record<Role, string[]>;
  actions: Array<{ id: string; label: string }>;
}

export interface ValidatedScreenshotImport {
  board: BoardState;
  menu: MenuState;
  tokensRemaining?: number;
  warnings: string[];
  lowConfidenceFields: ScreenshotFieldConfidence[];
  requiresReview: boolean;
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is missing or invalid.`);
}

function asLayoutId(value: unknown): BoardLayoutId {
  if (value !== 'legacy_3' && value !== 'expanded_5') throw new Error('Screenshot parser returned an unsupported board layout.');
  return value;
}

function asTeam(value: unknown, role: Role, data: DataBundle): string {
  if (typeof value !== 'string') throw new Error(`Screenshot parser did not return a ${role} team.`);
  const legal = new Set(data.players.filter(player => player.role === role).map(player => player.team));
  if (!legal.has(value)) throw new Error(`Screenshot parser returned unknown ${role} team: ${value}.`);
  return value;
}

function asQualityTier(value: unknown, path: string): QualityTier {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) throw new Error(`${path} has an invalid quality tier.`);
  return Number(value) as QualityTier;
}

function asTrait(value: unknown, path: string): TraitName {
  if (typeof value !== 'string' || !TRAITS.includes(value as TraitName)) throw new Error(`${path} has an invalid trait.`);
  return value as TraitName;
}

function asConfidence(value: unknown): ScreenshotFieldConfidence[] {
  if (!Array.isArray(value)) return [];
  const fields: ScreenshotFieldConfidence[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const candidate = row as { path?: unknown; confidence?: unknown };
    if (typeof candidate.path !== 'string' || typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence)) continue;
    fields.push({ path: candidate.path, confidence: Math.max(0, Math.min(1, candidate.confidence)) });
  }
  return fields;
}

export function screenshotImportRequest(fileDataUrl: string, data: DataBundle): ScreenshotImportRequest {
  const teamsByRole = Object.fromEntries(ROLES.map(role => [
    role,
    [...new Set(data.players.filter(player => player.role === role).map(player => player.team))].sort(),
  ])) as Record<Role, string[]>;
  return {
    imageDataUrl: fileDataUrl,
    teamsByRole,
    actions: ACTION_CATALOG.map(action => ({ id: action.id, label: action.label })),
  };
}

export function validateScreenshotImport(raw: unknown, data: DataBundle, currentBoard: BoardState): ValidatedScreenshotImport {
  assertRecord(raw, 'Screenshot import');
  const layoutId = asLayoutId(raw.layoutId);
  assertRecord(raw.banners, 'Screenshot banners');
  const layout = BOARD_LAYOUTS[layoutId];

  const board = {} as BoardState;
  for (const role of ROLES) {
    const rawBanner = raw.banners[role];
    assertRecord(rawBanner, `${role} banner`);
    const selectedTeam = asTeam(rawBanner.selectedTeam, role, data);
    const rawEmblems = rawBanner.emblems;
    if (!Array.isArray(rawEmblems)) throw new Error(`${role} emblems are missing.`);
    const slots = layout.roles[role];
    if (rawEmblems.length !== slots.length) {
      throw new Error(`${role} has ${rawEmblems.length} parsed emblems but ${layoutId} requires ${slots.length}.`);
    }
    const emblems = slots.map((slot, index) => {
      const candidate = rawEmblems[index];
      assertRecord(candidate, `${role} emblem ${index + 1}`);
      if (candidate.position !== slot.index) throw new Error(`${role} emblem ${index + 1} has the wrong position.`);
      if (candidate.color !== slot.color) throw new Error(`${role} emblem ${index + 1} color conflicts with the ${layoutId} layout.`);
      if (typeof candidate.stat !== 'string' || !isLegalStat(slot.color, candidate.stat as StatName)) {
        throw new Error(`${role} emblem ${index + 1} returned an illegal ${slot.color} stat.`);
      }
      const emblem: EmblemState = {
        id: `${role}-${slot.index}`,
        position: slot.index,
        color: slot.color,
        stat: candidate.stat as StatName,
        qualityTier: asQualityTier(candidate.qualityTier, `${role} emblem ${index + 1}`),
        trait: asTrait(candidate.trait, `${role} emblem ${index + 1}`),
      };
      return emblem;
    }) as BannerEmblems;
    board[role] = {
      role,
      selectedTeam,
      expectedSeries: currentBoard[role].expectedSeries,
      emblems,
    };
  }
  if (layoutId !== 'legacy_3') board.layoutId = layoutId;

  if (!Array.isArray(raw.operationIds) || raw.operationIds.length !== 3) throw new Error('Screenshot parser must return exactly three offered actions.');
  const ids = raw.operationIds.map(value => {
    if (typeof value !== 'string' || !ACTION_BY_ID.has(value)) throw new Error(`Screenshot parser returned unknown action: ${String(value)}.`);
    return value;
  });
  if (new Set(ids).size !== 3) throw new Error('Screenshot parser returned duplicate offered actions.');
  const menu = ids.map(id => cloneAction(ACTION_BY_ID.get(id)!)) as MenuState;

  let tokensRemaining: number | undefined;
  if (raw.tokensRemaining !== undefined) {
    if (!Number.isInteger(raw.tokensRemaining) || Number(raw.tokensRemaining) < 0) throw new Error('Screenshot parser returned an invalid token count.');
    tokensRemaining = Number(raw.tokensRemaining);
  }

  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0) : [];
  const fieldConfidence = asConfidence(raw.fieldConfidence);
  const lowConfidenceFields = fieldConfidence.filter(field => field.confidence < REVIEW_THRESHOLD);
  const result: ValidatedScreenshotImport = {
    board,
    menu,
    warnings,
    lowConfidenceFields,
    requiresReview: warnings.length > 0 || lowConfidenceFields.length > 0,
  };
  if (tokensRemaining !== undefined) result.tokensRemaining = tokensRemaining;
  return result;
}

export async function fileToScreenshotDataUrl(file: File, maxDimension = 2200): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).');
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected screenshot could not be decoded.')); };
    image.src = url;
  });
  const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function requestScreenshotImport(file: File, data: DataBundle): Promise<RawScreenshotImport> {
  const endpoint = document.querySelector<HTMLMetaElement>('meta[name="screenshot-import-endpoint"]')?.content || '/api/screenshot-import';
  const imageDataUrl = await fileToScreenshotDataUrl(file);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(screenshotImportRequest(imageDataUrl, data)),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(response.status === 404
      ? 'Screenshot recognition endpoint is not deployed for this site.'
      : `Screenshot recognition failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : '.'}`);
  }
  return await response.json() as RawScreenshotImport;
}
