import type { BannerState, QualityTier, TraitName } from './types.js';
import { QUALITY_BONUS_PCT } from './clientRules.js';

export interface TraitEffect { sourcePosition:number; trait:TraitName; modifierPct:number; reason:string; }
export interface EvaluatedEmblem { position:number; tierBonusPct:number; baseMultiplierPct:number; traitModifierPct:number; effectiveMultiplierPct:number; effects:TraitEffect[]; }
export type EvaluatedBanner =
  | [EvaluatedEmblem,EvaluatedEmblem,EvaluatedEmblem]
  | [EvaluatedEmblem,EvaluatedEmblem,EvaluatedEmblem,EvaluatedEmblem,EvaluatedEmblem];

function adjacent(a:number,b:number):boolean{return Math.abs(a-b)===1;}
function allDifferent<T>(values:T[]):boolean{return new Set(values).size===values.length;}
function qualityBonus(tier:QualityTier):number{return QUALITY_BONUS_PCT[tier];}

/** Evaluate the current verified trait definitions against the complete banner, independent of slot count. */
export function evaluateBanner(banner:BannerState):EvaluatedBanner {
  const positions=banner.emblems.map((_,index)=>index),qualities=banner.emblems.map(e=>e.qualityTier),traits=banner.emblems.map(e=>e.trait);
  const fractalCondition=allDifferent(qualities),uniqueCount=traits.filter(t=>t==='Unique').length,friendlyCount=traits.filter(t=>t==='Friendly').length;
  return positions.map(position=>{
    const emblem=banner.emblems[position]!;const effects:TraitEffect[]=[];
    const add=(sourcePosition:number,trait:TraitName,modifierPct:number,reason:string)=>effects.push({sourcePosition,trait,modifierPct,reason});
    for(const sourcePosition of positions){const source=banner.emblems[sourcePosition]!;switch(source.trait){
      case 'Fractal':if(sourcePosition===position&&fractalCondition)add(sourcePosition,'Fractal',60,'all emblem qualities are different');break;
      case 'Benevolent':if(adjacent(sourcePosition,position))add(sourcePosition,'Benevolent',20,`adjacent to slot ${sourcePosition+1}`);break;
      case 'Vampiric':if(sourcePosition===position)add(sourcePosition,'Vampiric',50,'Vampiric self bonus');else if(adjacent(sourcePosition,position))add(sourcePosition,'Vampiric',-10,`adjacent to Vampiric slot ${sourcePosition+1}`);break;
      case 'Unique':if(sourcePosition===position&&uniqueCount===1)add(sourcePosition,'Unique',30,'only Unique emblem on the War Banner');break;
      case 'Friendly':if(sourcePosition===position&&friendlyCount>=3)add(sourcePosition,'Friendly',50,'at least three Friendly emblems on the War Banner');break;
    }}
    const tierBonusPct=qualityBonus(emblem.qualityTier),baseMultiplierPct=100+tierBonusPct,traitModifierPct=effects.reduce((sum,e)=>sum+e.modifierPct,0);
    return {position,tierBonusPct,baseMultiplierPct,traitModifierPct,effectiveMultiplierPct:baseMultiplierPct+traitModifierPct,effects};
  }) as EvaluatedBanner;
}
export function effectiveMultiplierPct(banner:BannerState,position:number):number { const row=evaluateBanner(banner)[position];if(!row)throw new RangeError(`Banner has no slot ${position}.`);return row.effectiveMultiplierPct; }
