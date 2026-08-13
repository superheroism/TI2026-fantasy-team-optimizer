import type { BannerState, BoardState, EmblemState, QualityTier, Role, StatName, TraitName } from '../domain/types.js';
import { BANNER_COLORS, LEGAL_STAT_POOLS } from '../domain/rules.js';

export type EmblemStateID = number;
export type BannerStateID = number;
export type BoardStateID = bigint;

export interface EngineState {
  readonly core: BannerStateID;
  readonly mid: BannerStateID;
  readonly support: BannerStateID;
  readonly id: BoardStateID;
}

export interface BannerAdapterContext {
  readonly selectedTeam: string;
  readonly expectedSeries: number;
}

export type BoardAdapterContext = Readonly<Record<Role, BannerAdapterContext>>;

export const TRAIT_ORDER: readonly TraitName[] = ['Fractal','Friendly','Vampiric','Unique','Benevolent'];
export const QUALITY_COUNT = 5;
export const TRAIT_COUNT = TRAIT_ORDER.length;
export const STATS_PER_COLOR = 6;
export const EMBLEM_STATE_COUNT = STATS_PER_COLOR * QUALITY_COUNT * TRAIT_COUNT;
export const BANNER_STATE_COUNT = EMBLEM_STATE_COUNT ** 3;

const BOARD_RADIX = BigInt(BANNER_STATE_COUNT);

function integerInRange(value:number,min:number,max:number,label:string):void {
  if(!Number.isInteger(value)||value<min||value>max) throw new RangeError(`${label} must be an integer in [${min}, ${max}], got ${value}.`);
}

function assertSlot(role:Role, position:0|1|2, emblem:EmblemState):void {
  if(emblem.position!==position) throw new Error(`Expected ${role} slot ${position} position ${position}, got ${emblem.position}.`);
  const color=BANNER_COLORS[role][position];
  if(emblem.color!==color) throw new Error(`Expected ${role} slot ${position} color ${color}, got ${emblem.color}.`);
}

export function encodeEmblemComponents(statIndex:number, qualityTier:QualityTier, traitIndex:number):EmblemStateID {
  integerInRange(statIndex,0,STATS_PER_COLOR-1,'stat index');
  integerInRange(qualityTier,1,QUALITY_COUNT,'quality tier');
  integerInRange(traitIndex,0,TRAIT_COUNT-1,'trait index');
  return ((statIndex*QUALITY_COUNT+(qualityTier-1))*TRAIT_COUNT)+traitIndex;
}

export function emblemStatIndex(id:EmblemStateID):number {
  integerInRange(id,0,EMBLEM_STATE_COUNT-1,'emblem state ID');
  return Math.floor(id/(TRAIT_COUNT*QUALITY_COUNT));
}

export function emblemQualityTier(id:EmblemStateID):QualityTier {
  integerInRange(id,0,EMBLEM_STATE_COUNT-1,'emblem state ID');
  return (Math.floor(id/TRAIT_COUNT)%QUALITY_COUNT+1) as QualityTier;
}

export function emblemTraitIndex(id:EmblemStateID):number {
  integerInRange(id,0,EMBLEM_STATE_COUNT-1,'emblem state ID');
  return id%TRAIT_COUNT;
}

export function encodeEmblemState(role:Role, position:0|1|2, emblem:EmblemState):EmblemStateID {
  assertSlot(role,position,emblem);
  const pool=LEGAL_STAT_POOLS[emblem.color];
  const statIndex=pool.indexOf(emblem.stat);
  if(statIndex<0) throw new Error(`${emblem.stat} is not legal for ${emblem.color} slot ${role}/${position}.`);
  const traitIndex=TRAIT_ORDER.indexOf(emblem.trait);
  if(traitIndex<0) throw new Error(`Unknown trait ${emblem.trait}.`);
  integerInRange(emblem.qualityTier,1,5,'qualityTier');
  return encodeEmblemComponents(statIndex,emblem.qualityTier,traitIndex);
}

export function decodeEmblemState(role:Role, position:0|1|2, id:EmblemStateID):EmblemState {
  const statIndex=emblemStatIndex(id);
  const qualityTier=emblemQualityTier(id);
  const traitIndex=emblemTraitIndex(id);
  const color=BANNER_COLORS[role][position];
  return {
    id:`${role}-${position}`,
    position,
    color,
    stat:LEGAL_STAT_POOLS[color][statIndex] as StatName,
    qualityTier,
    trait:TRAIT_ORDER[traitIndex]!,
  };
}

export function decodeBannerEmblemIds(id:BannerStateID):readonly [EmblemStateID,EmblemStateID,EmblemStateID] {
  integerInRange(id,0,BANNER_STATE_COUNT-1,'banner state ID');
  let config=id;
  const e0=config%EMBLEM_STATE_COUNT; config=Math.floor(config/EMBLEM_STATE_COUNT);
  const e1=config%EMBLEM_STATE_COUNT; config=Math.floor(config/EMBLEM_STATE_COUNT);
  const e2=config;
  return [e0,e1,e2];
}

export function encodeBannerEmblemIds(e0:EmblemStateID,e1:EmblemStateID,e2:EmblemStateID):BannerStateID {
  integerInRange(e0,0,EMBLEM_STATE_COUNT-1,'slot 0 emblem state ID');
  integerInRange(e1,0,EMBLEM_STATE_COUNT-1,'slot 1 emblem state ID');
  integerInRange(e2,0,EMBLEM_STATE_COUNT-1,'slot 2 emblem state ID');
  return e0+EMBLEM_STATE_COUNT*(e1+EMBLEM_STATE_COUNT*e2);
}

/** Role-local ID containing only reroll-variable banner mechanics. */
export function encodeBannerState(banner:BannerState):BannerStateID {
  const e0=encodeEmblemState(banner.role,0,banner.emblems[0]);
  const e1=encodeEmblemState(banner.role,1,banner.emblems[1]);
  const e2=encodeEmblemState(banner.role,2,banner.emblems[2]);
  return encodeBannerEmblemIds(e0,e1,e2);
}

export function decodeBannerState(role:Role, id:BannerStateID, context:BannerAdapterContext):BannerState {
  const [e0,e1,e2]=decodeBannerEmblemIds(id);
  return {
    role,
    selectedTeam:context.selectedTeam,
    expectedSeries:context.expectedSeries,
    emblems:[decodeEmblemState(role,0,e0),decodeEmblemState(role,1,e1),decodeEmblemState(role,2,e2)],
  };
}

export function encodeBoardStateIds(core:BannerStateID,mid:BannerStateID,support:BannerStateID):BoardStateID {
  for(const [role,id] of [['core',core],['mid',mid],['support',support]] as const) integerInRange(id,0,BANNER_STATE_COUNT-1,`${role} banner state ID`);
  return BigInt(core)+BOARD_RADIX*(BigInt(mid)+BOARD_RADIX*BigInt(support));
}

export function decodeBoardStateId(id:BoardStateID):readonly [BannerStateID,BannerStateID,BannerStateID] {
  if(id<0n||id>=BOARD_RADIX**3n) throw new RangeError(`board state ID is outside the canonical range: ${id}.`);
  let value=id;
  const core=Number(value%BOARD_RADIX); value/=BOARD_RADIX;
  const mid=Number(value%BOARD_RADIX); value/=BOARD_RADIX;
  const support=Number(value);
  return [core,mid,support];
}

export function replaceEngineBanner(state:EngineState,role:Role,banner:BannerStateID):EngineState {
  integerInRange(banner,0,BANNER_STATE_COUNT-1,`${role} banner state ID`);
  const core=role==='core'?banner:state.core;
  const mid=role==='mid'?banner:state.mid;
  const support=role==='support'?banner:state.support;
  return {core,mid,support,id:encodeBoardStateIds(core,mid,support)};
}

export function boardAdapterContext(board:BoardState):BoardAdapterContext {
  return {
    core:{selectedTeam:board.core.selectedTeam,expectedSeries:board.core.expectedSeries},
    mid:{selectedTeam:board.mid.selectedTeam,expectedSeries:board.mid.expectedSeries},
    support:{selectedTeam:board.support.selectedTeam,expectedSeries:board.support.expectedSeries},
  };
}

export function encodeBoardState(board:BoardState):BoardStateID {
  return encodeBoardStateIds(encodeBannerState(board.core),encodeBannerState(board.mid),encodeBannerState(board.support));
}

export function boardToEngineState(board:BoardState):EngineState {
  const core=encodeBannerState(board.core),mid=encodeBannerState(board.mid),support=encodeBannerState(board.support);
  return {core,mid,support,id:encodeBoardStateIds(core,mid,support)};
}

export function engineStateToBoard(state:EngineState, context:BoardAdapterContext):BoardState {
  const decoded=decodeBoardStateId(state.id);
  if(decoded[0]!==state.core||decoded[1]!==state.mid||decoded[2]!==state.support) throw new Error('EngineState banner IDs do not match its board ID.');
  return {
    core:decodeBannerState('core',state.core,context.core),
    mid:decodeBannerState('mid',state.mid,context.mid),
    support:decodeBannerState('support',state.support,context.support),
  };
}
