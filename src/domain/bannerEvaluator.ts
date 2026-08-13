import type { BannerState, QualityTier, TraitName } from './types.js';
import { QUALITY_BONUS_PCT } from './clientRules.js';

export interface TraitEffect {
  sourcePosition: 0 | 1 | 2;
  trait: TraitName;
  modifierPct: number;
  reason: string;
}

export interface EvaluatedEmblem {
  position: 0 | 1 | 2;
  tierBonusPct: number;
  baseMultiplierPct: number;
  traitModifierPct: number;
  effectiveMultiplierPct: number;
  effects: TraitEffect[];
}

export type EvaluatedBanner = [EvaluatedEmblem, EvaluatedEmblem, EvaluatedEmblem];

const POSITIONS = [0,1,2] as const;

function adjacent(a:number,b:number):boolean { return Math.abs(a-b)===1; }
function allDifferent<T>(values:T[]):boolean { return new Set(values).size===values.length; }
function qualityBonus(tier:QualityTier):number { return QUALITY_BONUS_PCT[tier]; }

/**
 * Deterministically derives all three effective emblem multipliers from the current
 * TI 2026 client quality and trait rules.
 *
 * Percentage bonuses are additive percentage points to the emblem's 100% base rate.
 * All traits are evaluated against the same complete banner state, then stacked.
 */
export function evaluateBanner(banner: BannerState): EvaluatedBanner {
  const qualities=banner.emblems.map(e=>e.qualityTier);
  const traits=banner.emblems.map(e=>e.trait);
  const fractalCondition=allDifferent(qualities);
  const uniqueCount=traits.filter(t=>t==='Unique').length;
  const friendlyCount=traits.filter(t=>t==='Friendly').length;

  const out=POSITIONS.map(position=>{
    const emblem=banner.emblems[position];
    const effects:TraitEffect[]=[];
    const add=(sourcePosition:0|1|2,trait:TraitName,modifierPct:number,reason:string)=>effects.push({sourcePosition,trait,modifierPct,reason});

    for(const sourcePosition of POSITIONS){
      const source=banner.emblems[sourcePosition];
      switch(source.trait){
        case 'Fractal':
          if(sourcePosition===position && fractalCondition) add(sourcePosition,'Fractal',60,'all three emblem qualities are different');
          break;
        case 'Benevolent':
          if(adjacent(sourcePosition,position)) add(sourcePosition,'Benevolent',20,`adjacent to slot ${sourcePosition+1}`);
          break;
        case 'Vampiric':
          if(sourcePosition===position) add(sourcePosition,'Vampiric',50,'Vampiric self bonus');
          else if(adjacent(sourcePosition,position)) add(sourcePosition,'Vampiric',-10,`adjacent to Vampiric slot ${sourcePosition+1}`);
          break;
        case 'Unique':
          if(sourcePosition===position && uniqueCount===1) add(sourcePosition,'Unique',30,'only Unique emblem on the War Banner');
          break;
        case 'Friendly':
          if(sourcePosition===position && friendlyCount>=3) add(sourcePosition,'Friendly',50,'at least three Friendly emblems on the War Banner');
          break;
      }
    }

    const tierBonusPct=qualityBonus(emblem.qualityTier);
    const baseMultiplierPct=100+tierBonusPct;
    const traitModifierPct=effects.reduce((sum,e)=>sum+e.modifierPct,0);
    return {position,tierBonusPct,baseMultiplierPct,traitModifierPct,effectiveMultiplierPct:baseMultiplierPct+traitModifierPct,effects};
  });
  return out as EvaluatedBanner;
}

export function effectiveMultiplierPct(banner:BannerState,position:0|1|2):number {
  return evaluateBanner(banner)[position].effectiveMultiplierPct;
}
