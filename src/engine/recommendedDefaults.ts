import type { BoardLayoutId, BoardState, DataBundle, QuantilePoint, Role, SlotColor, StatName } from '../domain/types.js';
import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import { createDefaultBoard } from '../data/defaultState.js';
import { rankTeamsForRole } from './scoring.js';

const ROLES:readonly Role[]=['core','mid','support'];
const COLORS:readonly SlotColor[]=['red','green','blue'];

function mean(values:readonly number[]):number {
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:-Infinity;
}

/**
 * Lightweight retained-game-aware proxy for choosing startup stats before the full board is scored.
 * We blend the mean with upper quantiles, then average the three strongest role profiles so a single
 * noisy team does not determine the default. The completed banner is still passed through the normal
 * role ranking model to choose its team.
 */
function statStrength(role:Role,stat:StatName,data:DataBundle):number {
  const profileScores=data.players
    .filter(profile=>profile.role===role)
    .map(profile=>profile.statQuantiles[stat])
    .filter((points):points is QuantilePoint[]=>Array.isArray(points)&&points.length>0)
    .map(points=>{
      const sorted=[...points].sort((a,b)=>a.q-b.q);
      const values=sorted.map(point=>point.value);
      const at=(p:number)=>sorted.reduce((best,point)=>Math.abs(point.q-p)<Math.abs(best.q-p)?point:best,sorted[0]!).value;
      return .5*mean(values)+.25*at(.75)+.25*at(.9);
    })
    .sort((a,b)=>b-a)
    .slice(0,3);
  return mean(profileScores);
}

function rankedStats(role:Role,color:SlotColor,count:number,data:DataBundle):StatName[] {
  return [...LEGAL_STAT_POOLS[color]]
    .map(stat=>({stat,score:statStrength(role,stat,data)}))
    .sort((a,b)=>b.score-a.score||a.stat.localeCompare(b.stat))
    .slice(0,count)
    .map(row=>row.stat);
}

/**
 * Build the model-backed starter board used as an implicit recommendation guide.
 * All qualities intentionally begin at Tier III. Friendly is optimal under that uniform-quality
 * constraint because Fractal is inactive when qualities match, while 3+ Friendly emblems activate
 * the verified +50% self bonus on every Friendly emblem.
 */
export function createRecommendedDefaultBoard(layoutId:BoardLayoutId,data:DataBundle):BoardState {
  const board=createDefaultBoard(layoutId);
  const layout=BOARD_LAYOUTS[layoutId];
  for(const role of ROLES){
    const slots=layout.roles[role];
    const needed=new Map<SlotColor,number>();
    for(const slot of slots)needed.set(slot.color,(needed.get(slot.color)??0)+1);
    const choices=new Map<SlotColor,StatName[]>();
    for(const color of COLORS){
      const count=needed.get(color)??0;
      if(count)choices.set(color,rankedStats(role,color,count,data));
    }
    const used=new Map<SlotColor,number>();
    for(const slot of slots){
      const index=used.get(slot.color)??0;
      used.set(slot.color,index+1);
      const emblem=board[role].emblems[slot.index];
      const stat=choices.get(slot.color)?.[index];
      if(!emblem||!stat)continue;
      emblem.stat=stat;
      emblem.qualityTier=3;
      emblem.trait='Friendly';
    }
    const bestTeam=rankTeamsForRole(role,board,data)[0]?.team;
    if(bestTeam)board[role].selectedTeam=bestTeam;
  }
  return board;
}
