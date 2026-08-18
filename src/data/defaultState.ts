import type { BannerEmblems, BoardLayoutId, BoardState, EmblemState, MenuState, Role, SlotColor, StatName } from '../domain/types.js';
import { BOARD_LAYOUTS, DEFAULT_LAYOUT_ID, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, cloneAction } from './actionCatalog.js';

/** Deterministic legal fallbacks for every canonical slot in both supported layouts. */
export const DEFAULT_STATS_BY_ROLE:Readonly<Record<Role,readonly StatName[]>> = {
  core:['Creep Score','Teamfight Participation','GPM','Stuns','Deaths'],
  mid:['Creep Score','Runes','Teamfight Participation','GPM','Stuns'],
  support:['Watchers','Teamfight Participation','Wards Placed','Stuns','Smokes Used'],
};
const teamDefaults:Record<Role,string>={core:'LGD Gaming',mid:'Team Liquid',support:'LGD Gaming'};

/** Product defaults for retained-series opportunity under each physical board layout. */
export const DEFAULT_EXPECTED_SERIES_BY_LAYOUT:Readonly<Record<BoardLayoutId,number>> = {
  legacy_3:5,
  expanded_5:3,
};

function defaultEmblem(role:Role,position:number,color:SlotColor):EmblemState {
  const stat=DEFAULT_STATS_BY_ROLE[role][position];
  if(!stat||!isLegalStat(color,stat))throw new Error(`Missing legal default for ${role} slot ${position+1} (${color}).`);
  return {id:`${role}-${position}`,position,color,stat,qualityTier:3,trait:'Fractal'};
}

export function resolvedLayoutId(board:Pick<BoardState,'layoutId'>):BoardLayoutId {
  return board.layoutId??DEFAULT_LAYOUT_ID;
}

export function createDefaultBoard(layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):BoardState {
  const layout=BOARD_LAYOUTS[layoutId];
  const roleBanner=(role:Role)=>({
    role,
    selectedTeam:teamDefaults[role],
    expectedSeries:DEFAULT_EXPECTED_SERIES_BY_LAYOUT[layoutId],
    emblems:layout.roles[role].map(slot=>defaultEmblem(role,slot.index,slot.color)) as BannerEmblems,
  });
  const board:BoardState={core:roleBanner('core'),mid:roleBanner('mid'),support:roleBanner('support')};
  // Preserve the pre-M6A descriptive legacy shape while expanded boards carry explicit identity.
  if(layoutId!=='legacy_3')board.layoutId=layoutId;
  return board;
}

export function convertBoardLayout(source:BoardState,targetLayoutId:BoardLayoutId):BoardState {
  if(resolvedLayoutId(source)===targetLayoutId)return structuredClone(source);
  const layout=BOARD_LAYOUTS[targetLayoutId];
  const convertRole=(role:Role)=>{
    const current=source[role];
    const emblems=layout.roles[role].map(slot=>{
      const existing=current.emblems[slot.index];
      if(existing){
        if(existing.color!==slot.color)throw new Error(`Canonical color mismatch at ${role} slot ${slot.index+1}.`);
        return structuredClone(existing);
      }
      return defaultEmblem(role,slot.index,slot.color);
    }) as BannerEmblems;
    return {role,selectedTeam:current.selectedTeam,expectedSeries:DEFAULT_EXPECTED_SERIES_BY_LAYOUT[targetLayoutId],emblems};
  };
  const converted:BoardState={core:convertRole('core'),mid:convertRole('mid'),support:convertRole('support')};
  if(targetLayoutId!=='legacy_3')converted.layoutId=targetLayoutId;
  return converted;
}

export const defaultBoard:BoardState=createDefaultBoard();
const action = (id:string) => cloneAction(ACTION_BY_ID.get(id)!);
export const defaultMenu:MenuState=[action('green-stat-all'),action('red-quality-all'),action('blue-trait-all')];
