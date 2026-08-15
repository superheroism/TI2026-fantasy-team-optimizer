import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { evaluateM5EGate, rankedTablesEquivalent } from '../scripts/m5e-benchmark-lib.mjs';

const MENU=['green-stat-all','red-quality-all','blue-trait-all'];
const OPS=Array.from({length:20},(_,i)=>`op-${i}`);
function ranking(best='board_action|green-stat-all|core',second='board_action|red-quality-all|core',gap=.04){return[
  {rank:1,key:best,utility:.60,expectedScore:60_000},
  {rank:2,key:second,utility:.60-gap,expectedScore:61_000},
  {rank:3,key:'stop',utility:.50,expectedScore:55_000},
  {rank:4,key:'menu_reroll',utility:.49,expectedScore:55_000},
];}
function diagnostics(fidelity='current',widening='none'){
  return {
    continuationFidelity:{id:fidelity,freshMenuOutcomeStrataByDepth:fidelity==='aggressive'?[4,2,1]:[8,8,8]},
    actionWidening:widening==='wide'?{enabled:true,policyId:'wide',deepOperationCapsByDepth:[12,8,4]}:{enabled:false,policyId:'none',deepOperationCapsByDepth:[]},
  };
}
function run(id,horizon,fidelityId,wideningId,runtimeMs=20_000,best=undefined){
  const rows=ranking(best);
  return {id,status:'completed',horizon,fidelityId,wideningId,runtimeMs,targetScore:55_000,menuIds:MENU,recommendationKey:rows[0].key,utility:rows[0].utility,ranking:rows,
    memory:{end:{rss:100},maxRssEndKb:100},engineDiagnostics:diagnostics(fidelityId,wideningId),futureOperationIds:OPS};
}
function passingReport(){
  const runs=[
    run('t2-current',2,'current','none',10_000),
    run('t2-aggressive-wide',2,'current','none',10_000),
    run('t3-current-oracle',3,'current','none',100_000),
    run('t3-aggressive-only',3,'aggressive','none',70_000),
    run('t3-aggressive-wide',3,'aggressive','wide',50_000),
  ];
  return {preflightPassed:true,productionHorizon:2,runs};
}

test('M5E batch CLI plan is frozen and does not execute cases',()=>{
  const child=spawnSync(process.execPath,['scripts/benchmark-m5e-target.mjs','--plan'],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  const plan=JSON.parse(child.stdout);
  assert.equal(plan.objective,'target_probability');assert.equal(plan.targetScore,55_000);assert.deepEqual(plan.menuIds,MENU);
  assert.deepEqual(plan.continuationSchedule,[4,2,1]);assert.deepEqual(plan.wideningSchedule,[12,8,4]);assert.equal(plan.materialRuntimeImprovementRatioCeiling,.8);
  assert.deepEqual(plan.cases.map(row=>row.id),['t2-current','t2-aggressive-wide','t3-current-oracle','t3-aggressive-only','t3-aggressive-wide']);
  assert.deepEqual(plan.cases.map(row=>row.timeoutMs),[120_000,120_000,600_000,600_000,60_000]);
});

test('ranked table equality includes target utility and expected-score diagnostic',()=>{
  const a=ranking(),b=structuredClone(a);assert.equal(rankedTablesEquivalent(a,b),true);
  b[0].expectedScore+=1;assert.equal(rankedTablesEquivalent(a,b),false);
});

test('frozen M5E gate accepts an exact winner with sufficient same-runner speedup',()=>{
  const report=passingReport(),gate=evaluateM5EGate(report);assert.equal(gate.passed,true);assert.equal(gate.outcome,'A');assert.equal(gate.comparison.oracleRegret,0);
});

test('M5E Outcome A requires exact root winner agreement',()=>{
  const report=passingReport(),candidate=report.runs.find(row=>row.id==='t3-aggressive-wide');
  const rows=ranking('board_action|red-quality-all|core','board_action|green-stat-all|core');candidate.ranking=rows;candidate.recommendationKey=rows[0].key;candidate.utility=rows[0].utility;
  const gate=evaluateM5EGate(report);assert.equal(gate.passed,false);assert.equal(gate.checks.candidateWinnerMatchesOracle,false);assert.equal(gate.outcome,'B');
});

test('candidate runtime gate is strict and frozen at both 60s and 0.80 oracle ratio',()=>{
  const report=passingReport(),candidate=report.runs.find(row=>row.id==='t3-aggressive-wide');candidate.runtimeMs=60_000;
  let gate=evaluateM5EGate(report);assert.equal(gate.checks.candidateCompletedUnder60s,false);
  candidate.runtimeMs=59_000;report.runs.find(row=>row.id==='t3-current-oracle').runtimeMs=70_000;
  gate=evaluateM5EGate(report);assert.equal(gate.checks.candidateCompletedUnder60s,true);assert.equal(gate.checks.candidateMateriallyFaster,false);
});

test('candidate memory gate reads the worker maxRssEndKb field',()=>{
  const report=passingReport(),candidate=report.runs.find(row=>row.id==='t3-aggressive-wide');
  assert.equal(evaluateM5EGate(report).checks.candidateMemoryHealthy,true);
  delete candidate.memory.maxRssEndKb;
  assert.equal(evaluateM5EGate(report).checks.candidateMemoryHealthy,false);
});

test('t=2 experimental options must resolve to current/no widening diagnostics',()=>{
  const report=passingReport(),row=report.runs.find(run=>run.id==='t2-aggressive-wide');row.engineDiagnostics=diagnostics('aggressive','wide');
  const gate=evaluateM5EGate(report);assert.equal(gate.checks.t2ExperimentalOptionsIgnored,false);assert.equal(gate.passed,false);
});