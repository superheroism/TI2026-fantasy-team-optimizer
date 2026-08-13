import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTION_CATALOG, allUniformMenus } from '../docs/js/data/actionCatalog.js';
import {
  MenuModel,
  expectedExplicitMenuSamples,
  expectedUniformBestOfThree,
} from '../docs/js/engine/menuModel.js';

function explicitCombinations(values,baseline){
  let sum=0,count=0;
  for(let i=0;i<values.length-2;i++)for(let j=i+1;j<values.length-1;j++)for(let k=j+1;k<values.length;k++){
    sum+=Math.max(baseline,values[i].value,values[j].value,values[k].value);count++;
  }
  return count?sum/count:baseline;
}
function close(a,b,tolerance=1e-12){
  if(Object.is(a,b))return;
  assert.ok(Math.abs(a-b)<=tolerance,`${a} vs ${b}`);
}
function vector(numbers){return numbers.map((value,index)=>({id:`op-${index}`,value}));}

const cases=[
  ['increasing',Array.from({length:20},(_,i)=>i-7),-3],
  ['decreasing',Array.from({length:20},(_,i)=>12-i),0],
  ['all equal',Array(20).fill(4.25),1],
  ['many ties',Array.from({length:20},(_,i)=>Math.floor(i/4)-2),-1],
  ['stop dominates',Array.from({length:20},(_,i)=>i),100],
  ['one extreme high',[...Array(19).fill(-2),1_000],0],
  ['several unavailable',Array.from({length:20},(_,i)=>i%4===0?-Infinity:i-10),-3],
  ['negative values',Array.from({length:20},(_,i)=>-30+i),-40],
];

for(const [name,numbers,baseline] of cases){
  test(`analytic uniform menu operator matches 1,140-menu enumeration: ${name}`,()=>{
    const values=vector(numbers);
    close(expectedUniformBestOfThree(values,baseline),explicitCombinations(values,baseline));
  });
}

test('analytic operator matches explicit enumeration on deterministic random vectors',()=>{
  let state=0x12345678;
  const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/2**32;};
  for(let trial=0;trial<100;trial++){
    const values=vector(Array.from({length:20},()=>next()*200-100));
    const baseline=next()*80-40;
    close(expectedUniformBestOfThree(values,baseline),explicitCombinations(values,baseline),1e-10);
  }
});

test('equal values remain distinct operation identities under rank weighting',()=>{
  const values=ACTION_CATALOG.map((operation,index)=>({id:operation.id,value:index<10?7:11}));
  close(expectedUniformBestOfThree(values,5),expectedExplicitMenuSamples(values,5,allUniformMenus()));
});

test('override menu samples preserve explicit supplied-sample semantics',()=>{
  const samples=[
    [ACTION_CATALOG[0],ACTION_CATALOG[1],ACTION_CATALOG[2]],
    [ACTION_CATALOG[0],ACTION_CATALOG[10],ACTION_CATALOG[19]],
    [ACTION_CATALOG[4],ACTION_CATALOG[5],ACTION_CATALOG[6]],
  ];
  const values=ACTION_CATALOG.map((operation,index)=>({id:operation.id,value:index-9.5}));
  const model=new MenuModel(samples);
  const expected=expectedExplicitMenuSamples(values,-2,samples);
  close(model.expectedFreshMenuUtility(values,-2),expected);
  const diagnostics=model.getDiagnostics();
  assert.equal(model.mode,'override_samples');
  assert.equal(diagnostics.overrideCalls,1);
  assert.equal(diagnostics.explicitMenusScanned,samples.length);
});

test('normal MenuModel path is analytic and scans no explicit menus',()=>{
  const values=ACTION_CATALOG.map((operation,index)=>({id:operation.id,value:index}));
  const model=new MenuModel();
  close(model.expectedFreshMenuUtility(values,3),expectedExplicitMenuSamples(values,3,allUniformMenus()));
  const diagnostics=model.getDiagnostics();
  assert.equal(model.mode,'known_uniform');
  assert.equal(diagnostics.uniformCalls,1);
  assert.equal(diagnostics.explicitMenusScanned,0);
});
