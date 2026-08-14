import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns, evaluateCalibrationGate, evaluateCombinedHoldoutGate, marginBin, selectWidestPassing } from '../scripts/m5d-benchmark-lib.mjs';

function run(fixture,key='board_action|green-stat-all|core',runnerUp='board_action|red-quality-all|core',gap=400,runtimeMs=100){return{fixture,recommendationKey:key,utility:10_000,runtimeMs,ranking:[{key,utility:10_000},{key:runnerUp,utility:10_000-gap},{key:'stop',utility:9_000},{key:'menu_reroll',utility:8_900}]};}
function exactComparisons(count=12){return Array.from({length:count},(_,i)=>compareRuns(run(`f${i}`,undefined,undefined,400,200),run(`f${i}`,undefined,undefined,400,100),{runtimeRatioVsAggressive:.5}));}

test('margin bins match frozen M5D reporting boundaries',()=>{assert.equal(marginBin(500),'<=500');assert.equal(marginBin(501),'500-1500');assert.equal(marginBin(1500),'500-1500');assert.equal(marginBin(1501),'>1500');});

test('calibration gate accepts 12 exact winners with required runtime',()=>{const gate=evaluateCalibrationGate(exactComparisons());assert.equal(gate.passed,true);assert.equal(gate.summary.agreements,12);assert.equal(gate.checks.runtime,true);});

test('calibration gate rejects a disagreement outside the permitted near-tie band',()=>{const rows=exactComparisons();const oracle=run('f0','board_action|green-stat-all|core','board_action|red-quality-all|core',1200,200),approx=run('f0','board_action|red-quality-all|core','board_action|green-stat-all|core',1200,100);rows[0]=compareRuns(oracle,approx,{runtimeRatioVsAggressive:.5});const gate=evaluateCalibrationGate(rows);assert.equal(gate.passed,false);assert.equal(gate.checks.disagreementsOnlyNearTie,false);assert.equal(gate.checks.zeroLargeGapDisagreement,false);});

test('calibration gate treats stop/menu recommendation reversals as pathological',()=>{const rows=exactComparisons(),oracle=run('f0','stop','board_action|green-stat-all|core',100,200),approx=run('f0','board_action|green-stat-all|core','stop',100,100);rows[0]=compareRuns(oracle,approx,{runtimeRatioVsAggressive:.5});const gate=evaluateCalibrationGate(rows);assert.equal(gate.passed,false);assert.equal(gate.checks.noPathologicalStopMenuReversal,false);});

test('policy selection chooses the widest passing schedule rather than the fastest',()=>{assert.equal(selectWidestPassing({wide:{passed:true},medium:{passed:true},narrow:{passed:true}}),'wide');assert.equal(selectWidestPassing({wide:{passed:false},medium:{passed:true},narrow:{passed:true}}),'medium');assert.equal(selectWidestPassing({wide:{passed:false},medium:{passed:false},narrow:{passed:false}}),null);});

test('combined 20-case gate permits at most one small near-tie disagreement when normalized regret stays low',()=>{const rows=exactComparisons(20),oracle=run('f0','board_action|green-stat-all|core','board_action|red-quality-all|core',400,200),approx=run('f0','board_action|red-quality-all|core','board_action|green-stat-all|core',400,100);approx.ranking[0].utility=9_900;approx.ranking[1].utility=10_000;rows[0]=compareRuns(oracle,approx,{runtimeRatioVsAggressive:.5});const gate=evaluateCombinedHoldoutGate(rows);assert.equal(gate.passed,true);assert.equal(gate.summary.agreements,19);});
