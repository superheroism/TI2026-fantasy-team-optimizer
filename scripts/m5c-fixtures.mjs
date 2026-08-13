export const M5C_EXPECTED_FIXTURES=[
  {name:'default',menu:['green-stat-all','red-quality-all','blue-trait-all'],mutations:[]},
  {name:'quality-heavy',menu:['quality-redistribution','red-quality-all','blue-trait-all'],mutations:[]},
  {name:'stat-heavy',menu:['green-stat-all','red-stat-all','blue-stat-all'],mutations:[]},
  {name:'trait-heavy',menu:['green-trait-all','red-trait-all','blue-trait-all'],mutations:[]},
  {name:'global-quality',menu:['quality-increase-one','quality-redistribution','green-quality-all'],mutations:[]},
  {name:'reachable-core-stat',menu:['red-stat-all','quality-increase-one','blue-trait-all'],mutations:[['core','red-stat-all',0.25]]},
  {name:'reachable-support-trait',menu:['green-stat-all','quality-redistribution','blue-quality-all'],mutations:[['support','blue-trait-all',0.75]]},
  {name:'reachable-mid-quality',menu:['red-quality-all','green-trait-all','blue-stat-all'],mutations:[['mid','quality-redistribution',0.50]]},
  {name:'reachable-global-quality',menu:['quality-increase-one','green-stat-all','red-trait-all'],mutations:[['core','quality-increase-one',0.80]]},
  {name:'reachable-two-step-a',menu:['quality-redistribution','red-stat-all','blue-trait-all'],mutations:[['core','red-stat-all',0.20],['support','blue-trait-all',0.60]]},
  {name:'reachable-two-step-b',menu:['green-quality-all','red-trait-all','blue-stat-all'],mutations:[['mid','quality-redistribution',0.30],['mid','red-quality-all',0.70]]},
  {name:'reachable-two-step-c',menu:['quality-increase-one','green-trait-all','red-quality-all'],mutations:[['support','blue-trait-all',0.40],['core','quality-increase-one',0.55]]},
];
export const M5C_FIDELITY_IDS=['current','high','medium','aggressive'];
