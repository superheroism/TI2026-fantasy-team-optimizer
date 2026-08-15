import type { BannerEmblems, BannerState, BoardLayoutId, BoardState, EmblemState, QualityTier, Role, StatName, TraitName } from '../domain/types.js';
import { DEFAULT_LAYOUT_ID, LEGAL_STAT_POOLS, boardLayout } from '../domain/rules.js';

export type EmblemStateID = number;
export type BannerStateID = number;
export type BoardStateID = bigint;

export interface EngineState {
  readonly layoutId:BoardLayoutId;
  readonly core: BannerStateID;
  readonly mid: BannerStateID;
  readonly support: BannerStateID;
  readonly id: BoardStateID;
}

export interface BannerAdapterContext { readonly selectedTeam:string; readonly expectedSeries:number; }
export type BoardAdapterContext = Readonly<Record<Role, BannerAdapterContext>>;

export const TRAIT_ORDER: readonly TraitName[] = ['Fractal','Friendly','Vampiric','Unique','Benevolent'];
export const QUALITY_COUNT=5, TRAIT_COUNT=TRAIT_ORDER.length, STATS_PER_COLOR=6;
export const EMBLEM_STATE_COUNT=STATS_PER_COLOR*QUALITY_COUNT*TRAIT_COUNT;
export const LEGACY_BANNER_STATE_COUNT=EMBLEM_STATE_COUNT**3;
/** Compatibility export: pre-M6A callers refer to the legacy banner radix by this name. */
export const BANNER_STATE_COUNT=LEGACY_BANNER_STATE_COUNT;
export const EXPANDED_BANNER_STATE_COUNT=EMBLEM_STATE_COUNT**5;
const LEGACY_BOARD_RADIX=BigInt(LEGACY_BANNER_STATE_COUNT);
export const LEGACY_BOARD_STATE_COUNT=LEGACY_BOARD_RADIX**3n;
const EXPANDED_BOARD_RADIX=BigInt(EXPANDED_BANNER_STATE_COUNT);
export const EXPANDED_BOARD_STATE_COUNT=EXPANDED_BOARD_RADIX**3n;

function integerInRange(value:number,min:number,max:number,label:string):void { if(!Number.isSafeInteger(value)||value<min||value>max) throw new RangeError(`${label} must be a safe integer in [${min}, ${max}], got ${value}.`); }
function layoutFromBoard(board:BoardState):BoardLayoutId { return board.layoutId??DEFAULT_LAYOUT_ID; }
function bannerCount(layoutId:BoardLayoutId):number { return layoutId==='legacy_3'?LEGACY_BANNER_STATE_COUNT:EXPANDED_BANNER_STATE_COUNT; }
function boardRadix(layoutId:BoardLayoutId):bigint { return BigInt(bannerCount(layoutId)); }
function boardOffset(layoutId:BoardLayoutId):bigint { return layoutId==='legacy_3'?0n:LEGACY_BOARD_STATE_COUNT; }

function assertSlot(layoutId:BoardLayoutId,role:Role,position:number,emblem:EmblemState):void {
  const slot=boardLayout(layoutId).roles[role][position];
  if(!slot)throw new Error(`Layout ${layoutId} has no ${role} slot ${position}.`);
  if(emblem.position!==position)throw new Error(`Expected ${role} slot ${position} position ${position}, got ${emblem.position}.`);
  if(emblem.color!==slot.color)throw new Error(`Expected ${role} slot ${position} color ${slot.color}, got ${emblem.color}.`);
}

export function encodeEmblemComponents(statIndex:number,qualityTier:QualityTier,traitIndex:number):EmblemStateID {
  integerInRange(statIndex,0,STATS_PER_COLOR-1,'stat index');integerInRange(qualityTier,1,QUALITY_COUNT,'quality tier');integerInRange(traitIndex,0,TRAIT_COUNT-1,'trait index');
  return ((statIndex*QUALITY_COUNT+(qualityTier-1))*TRAIT_COUNT)+traitIndex;
}
export function emblemStatIndex(id:EmblemStateID):number { integerInRange(id,0,EMBLEM_STATE_COUNT-1,'emblem state ID');return Math.floor(id/(TRAIT_COUNT*QUALITY_COUNT)); }
export function emblemQualityTier(id:EmblemStateID):QualityTier { integerInRange(id,0,EMBLEM_STATE_COUNT-1,'emblem state ID');return (Math.floor(id/TRAIT_COUNT)%QUALITY_COUNT+1) as QualityTier; }
export function emblemTraitIndex(id:EmblemStateID):number { integerInRange(id,0,EMBLEM_STATE_COUNT-1,'emblem state ID');return id%TRAIT_COUNT; }

export function encodeEmblemState(role:Role,position:number,emblem:EmblemState,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):EmblemStateID {
  assertSlot(layoutId,role,position,emblem);const pool=LEGAL_STAT_POOLS[emblem.color],statIndex=pool.indexOf(emblem.stat);
  if(statIndex<0)throw new Error(`${emblem.stat} is not legal for ${emblem.color} slot ${layoutId}/${role}/${position}.`);
  const traitIndex=TRAIT_ORDER.indexOf(emblem.trait);if(traitIndex<0)throw new Error(`Unknown trait ${emblem.trait}.`);
  return encodeEmblemComponents(statIndex,emblem.qualityTier,traitIndex);
}
export function decodeEmblemState(role:Role,position:number,id:EmblemStateID,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):EmblemState {
  const slot=boardLayout(layoutId).roles[role][position];if(!slot)throw new Error(`Layout ${layoutId} has no ${role} slot ${position}.`);
  const color=slot.color;
  return {id:`${role}-${position}`,position,color,stat:LEGAL_STAT_POOLS[color][emblemStatIndex(id)] as StatName,qualityTier:emblemQualityTier(id),trait:TRAIT_ORDER[emblemTraitIndex(id)]!};
}

export function decodeBannerEmblemIds(id:BannerStateID,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):readonly EmblemStateID[] {
  const slots=boardLayout(layoutId).roles.core.length;integerInRange(id,0,bannerCount(layoutId)-1,'banner state ID');
  let config=id;const out:number[]=[];for(let i=0;i<slots;i++){out.push(config%EMBLEM_STATE_COUNT);config=Math.floor(config/EMBLEM_STATE_COUNT);}return out;
}
export function encodeBannerEmblemIds(...args:(EmblemStateID|readonly EmblemStateID[]|BoardLayoutId)[]):BannerStateID {
  let layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID;let ids:readonly EmblemStateID[];
  if(typeof args[0]==='string'){layoutId=args[0] as BoardLayoutId;ids=Array.isArray(args[1])?args[1] as readonly EmblemStateID[]:args.slice(1) as EmblemStateID[];}
  else ids=Array.isArray(args[0])?args[0] as readonly EmblemStateID[]:args as EmblemStateID[];
  const expected=boardLayout(layoutId).roles.core.length;if(ids.length!==expected)throw new Error(`Layout ${layoutId} requires ${expected} emblem IDs, got ${ids.length}.`);
  let value=0,multiplier=1;for(let i=0;i<ids.length;i++){const id=ids[i]!;integerInRange(id,0,EMBLEM_STATE_COUNT-1,`slot ${i} emblem state ID`);value+=id*multiplier;multiplier*=EMBLEM_STATE_COUNT;}return value;
}

export function encodeBannerState(banner:BannerState,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):BannerStateID {
  const slots=boardLayout(layoutId).roles[banner.role];if(banner.emblems.length!==slots.length)throw new Error(`${layoutId}/${banner.role} requires ${slots.length} emblems, got ${banner.emblems.length}.`);
  return encodeBannerEmblemIds(layoutId,banner.emblems.map((emblem,index)=>encodeEmblemState(banner.role,index,emblem,layoutId)));
}
export function decodeBannerState(role:Role,id:BannerStateID,context:BannerAdapterContext,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):BannerState {
  const ids=decodeBannerEmblemIds(id,layoutId),emblems=ids.map((emblemId,index)=>decodeEmblemState(role,index,emblemId,layoutId)) as BannerEmblems;
  return {role,selectedTeam:context.selectedTeam,expectedSeries:context.expectedSeries,emblems};
}

export function encodeBoardStateIds(core:BannerStateID,mid:BannerStateID,support:BannerStateID,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):BoardStateID {
  const count=bannerCount(layoutId);for(const [role,id] of [['core',core],['mid',mid],['support',support]] as const)integerInRange(id,0,count-1,`${role} banner state ID`);
  const radix=boardRadix(layoutId);return boardOffset(layoutId)+BigInt(core)+radix*(BigInt(mid)+radix*BigInt(support));
}

/** Version-aware decoder used by the M6A engine boundary. */
export function decodeVersionedBoardStateId(id:BoardStateID):readonly [BoardLayoutId,BannerStateID,BannerStateID,BannerStateID] {
  if(id<0n||id>=LEGACY_BOARD_STATE_COUNT+EXPANDED_BOARD_STATE_COUNT)throw new RangeError(`board state ID is outside the canonical range: ${id}.`);
  const layoutId:BoardLayoutId=id<LEGACY_BOARD_STATE_COUNT?'legacy_3':'expanded_5';let value=id-boardOffset(layoutId),radix=boardRadix(layoutId);
  const core=Number(value%radix);value/=radix;const mid=Number(value%radix);value/=radix;const support=Number(value);return [layoutId,core,mid,support];
}
/**
 * Legacy compatibility decoder. Existing persisted/fixture IDs remain raw legacy IDs
 * and retain the pre-M6A three-tuple API. Expanded IDs require the versioned decoder.
 */
export function decodeBoardStateId(id:BoardStateID):readonly [BannerStateID,BannerStateID,BannerStateID] {
  const [layout,core,mid,support]=decodeVersionedBoardStateId(id);if(layout!=='legacy_3')throw new Error(`Expanded board IDs require decodeVersionedBoardStateId().`);return [core,mid,support];
}

export function replaceEngineBanner(state:EngineState,role:Role,banner:BannerStateID):EngineState {
  integerInRange(banner,0,bannerCount(state.layoutId)-1,`${role} banner state ID`);const core=role==='core'?banner:state.core,mid=role==='mid'?banner:state.mid,support=role==='support'?banner:state.support;
  return {layoutId:state.layoutId,core,mid,support,id:encodeBoardStateIds(core,mid,support,state.layoutId)};
}
export function boardAdapterContext(board:BoardState):BoardAdapterContext { return {core:{selectedTeam:board.core.selectedTeam,expectedSeries:board.core.expectedSeries},mid:{selectedTeam:board.mid.selectedTeam,expectedSeries:board.mid.expectedSeries},support:{selectedTeam:board.support.selectedTeam,expectedSeries:board.support.expectedSeries}}; }
export function encodeBoardState(board:BoardState):BoardStateID { const layoutId=layoutFromBoard(board);return encodeBoardStateIds(encodeBannerState(board.core,layoutId),encodeBannerState(board.mid,layoutId),encodeBannerState(board.support,layoutId),layoutId); }
export function boardToEngineState(board:BoardState):EngineState { const layoutId=layoutFromBoard(board),core=encodeBannerState(board.core,layoutId),mid=encodeBannerState(board.mid,layoutId),support=encodeBannerState(board.support,layoutId);return {layoutId,core,mid,support,id:encodeBoardStateIds(core,mid,support,layoutId)}; }
export function engineStateToBoard(state:EngineState,context:BoardAdapterContext):BoardState {
  const [layoutId,core,mid,support]=decodeVersionedBoardStateId(state.id);if(layoutId!==state.layoutId||core!==state.core||mid!==state.mid||support!==state.support)throw new Error('EngineState banner/layout IDs do not match its board ID.');
  const board={core:decodeBannerState('core',core,context.core,layoutId),mid:decodeBannerState('mid',mid,context.mid,layoutId),support:decodeBannerState('support',support,context.support,layoutId)} as BoardState;
  if(layoutId!=='legacy_3')board.layoutId=layoutId;return board;
}
