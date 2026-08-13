import type { MenuState, OfferedOperation } from '../domain/types.js';

/**
 * TI 2026 client action catalogue supplied from the in-client reroll table.
 * Each entry is a distinct menu action even when two actions happen to have
 * the same realized scope on a banner containing only one emblem of that color.
 */
export const ACTION_CATALOG: readonly OfferedOperation[] = [
  { id:'green-stat-all', label:'Reroll Stat for Green Emblems', kind:'stat_reroll', color:'green', scope:'all_matching', excludeCurrent:true },
  { id:'green-stat-first', label:'Reroll Stat for the first Green Emblem', kind:'stat_reroll', color:'green', scope:'first_matching', excludeCurrent:true },
  { id:'green-stat-last', label:'Reroll Stat for the last Green Emblem', kind:'stat_reroll', color:'green', scope:'last_matching', excludeCurrent:true },
  { id:'green-stat-random', label:'Reroll Stat for one random Green Emblem', kind:'stat_reroll', color:'green', scope:'random_matching', excludeCurrent:true },
  { id:'green-quality-all', label:'Reroll Quality for Green Emblems', kind:'quality_reroll', color:'green', scope:'all_matching' },
  { id:'green-trait-all', label:'Reroll Trait for Green Emblems', kind:'trait_reroll', color:'green', scope:'all_matching' },

  { id:'red-stat-all', label:'Reroll Stat for Red Emblems', kind:'stat_reroll', color:'red', scope:'all_matching', excludeCurrent:true },
  { id:'red-quality-all', label:'Reroll Quality for Red Emblems', kind:'quality_reroll', color:'red', scope:'all_matching' },
  { id:'red-quality-first', label:'Reroll Quality for the first Red Emblem', kind:'quality_reroll', color:'red', scope:'first_matching' },
  { id:'red-quality-last', label:'Reroll Quality for the last Red Emblem', kind:'quality_reroll', color:'red', scope:'last_matching' },
  { id:'red-quality-random', label:'Reroll Quality for one random Red Emblem', kind:'quality_reroll', color:'red', scope:'random_matching' },
  { id:'red-trait-all', label:'Reroll Trait for Red Emblems', kind:'trait_reroll', color:'red', scope:'all_matching' },

  { id:'blue-stat-all', label:'Reroll Stat for Blue Emblems', kind:'stat_reroll', color:'blue', scope:'all_matching', excludeCurrent:true },
  { id:'blue-quality-all', label:'Reroll Quality for Blue Emblems', kind:'quality_reroll', color:'blue', scope:'all_matching' },
  { id:'blue-trait-all', label:'Reroll Trait for Blue Emblems', kind:'trait_reroll', color:'blue', scope:'all_matching' },
  { id:'blue-trait-first', label:'Reroll Trait for the first Blue Emblem', kind:'trait_reroll', color:'blue', scope:'first_matching' },
  { id:'blue-trait-last', label:'Reroll Trait for the last Blue Emblem', kind:'trait_reroll', color:'blue', scope:'last_matching' },
  { id:'blue-trait-random', label:'Reroll Trait for one random Blue Emblem', kind:'trait_reroll', color:'blue', scope:'random_matching' },

  { id:'quality-increase-one', label:'Randomly increase one Quality', kind:'quality_increase' },
  { id:'quality-redistribution', label:'Randomly increase two Qualities and reduce one', kind:'quality_redistribution' },
] as const;

export const ACTION_BY_ID = new Map(ACTION_CATALOG.map(action => [action.id, action] as const));

export function cloneAction(action: OfferedOperation): OfferedOperation {
  return structuredClone(action);
}

/** 20 choose 3 = 1,140 equally likely unordered menus. */
export function allUniformMenus(): MenuState[] {
  const menus: MenuState[] = [];
  for (let i=0;i<ACTION_CATALOG.length-2;i++) {
    for (let j=i+1;j<ACTION_CATALOG.length-1;j++) {
      for (let k=j+1;k<ACTION_CATALOG.length;k++) {
        menus.push([
          cloneAction(ACTION_CATALOG[i]!),
          cloneAction(ACTION_CATALOG[j]!),
          cloneAction(ACTION_CATALOG[k]!),
        ]);
      }
    }
  }
  return menus;
}

export const TOTAL_UNIFORM_MENUS = 1140;
export const ACTION_APPEARANCE_PROBABILITY = 3 / ACTION_CATALOG.length;
