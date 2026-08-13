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
export const defaultBoard:BoardState = Object.fromEntries((['core','mid','support'] as Role[]).map(role=>[role,{role,selectedTeam:teamDefaults[role],expectedSeries:5,emblems:BANNER_COLORS[role].map((c,i)=>emblem(role,i as 0|1|2,c)) as [EmblemState,EmblemState,EmblemState]}])) as BoardState;
const action = (id:string) => cloneAction(ACTION_BY_ID.get(id)!);
export const defaultMenu:MenuState=[action('green-stat-all'),action('red-quality-all'),action('blue-trait-all')];
