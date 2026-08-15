import type { BoardState, EmblemState, MenuState, Role, SlotColor, StatName } from '../domain/types.js';
import { BANNER_COLORS } from '../domain/rules.js';
import { ACTION_BY_ID, cloneAction } from './actionCatalog.js';

const defaults: Record<Role, StatName[]> = {
  core:['Creep Score','Teamfight Participation','GPM'],
  mid:['Creep Score','Runes','Teamfight Participation'],
  support:['Watchers','Teamfight Participation','Wards Placed']
};
const teamDefaults:Record<Role,string>={core:'LGD Gaming',mid:'Team Liquid',support:'LGD Gaming'};
function emblem(role:Role, position:0|1|2, color:SlotColor):EmblemState { return {id:`${role}-${position}`,position,color,stat:defaults[role][position]!,qualityTier:3,trait:'Fractal'}; }
export const defaultBoard:BoardState = {
  core:{role:'core',selectedTeam:teamDefaults.core,expectedSeries:5,emblems:BANNER_COLORS.core.map((c,i)=>emblem('core',i as 0|1|2,c)) as [EmblemState,EmblemState,EmblemState]},
  mid:{role:'mid',selectedTeam:teamDefaults.mid,expectedSeries:5,emblems:BANNER_COLORS.mid.map((c,i)=>emblem('mid',i as 0|1|2,c)) as [EmblemState,EmblemState,EmblemState]},
  support:{role:'support',selectedTeam:teamDefaults.support,expectedSeries:5,emblems:BANNER_COLORS.support.map((c,i)=>emblem('support',i as 0|1|2,c)) as [EmblemState,EmblemState,EmblemState]},
};
const action = (id:string) => cloneAction(ACTION_BY_ID.get(id)!);
export const defaultMenu:MenuState=[action('green-stat-all'),action('red-quality-all'),action('blue-trait-all')];
