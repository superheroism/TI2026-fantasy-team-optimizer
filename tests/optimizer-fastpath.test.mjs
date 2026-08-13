import test from 'node:test';
import assert from 'node:assert/strict';
import { testData } from './test-data.mjs';
import { defaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { evaluateBoard, evaluateBoardExpectedFast } from '../docs/js/engine/scoring.js';
import {
  evaluateBoardTarget,
  evaluateBoardTargetProbabilityFast,
} from '../docs/js/engine/targetProbability.js';
import { recommendNextAction, formatAction } from '../docs/js/engine/optimizer.js';

function bundle(iterations=16,entry=12,outcomes=8){
  return testData({
    optimizerIterations: iterations,
    continuationEntryStrata: entry,
    continuationOutcomeStrata: outcomes,
    maxLookaheadTokens: 2,
  });
}

test('fast expected-score board composition matches full expected board evaluation',()=>{
  const data=bundle(16);
  const full=evaluateBoard(structuredClone(defaultBoard),'Tester',data);
  const fast=evaluateBoardExpectedFast(structuredClone(defaultBoard),data,16);
  assert.ok(Math.abs(full.expected-fast)<1e-6,`${full.expected} vs ${fast}`);
});


test('fast target-probability board composition matches the full target-objective evaluator',()=>{
  const data=bundle(32);
  const board=structuredClone(defaultBoard);

  const fast=evaluateBoardTargetProbabilityFast(
    board,
    data,
    55_000,
    32,
  );

  const full=evaluateBoardTarget(
    board,
    'Test',
    data,
    55_000,
    32,
  );

  assert.ok(
    Math.abs(fast-full.targetProbability)<1e-12,
    `${fast} vs ${full.targetProbability}`,
  );
});

test('stratified two-step continuation preserves the exact-transition top action on default fixture',()=>{
  const state={board:structuredClone(defaultBoard),tokensRemaining:10,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'Tester',objective:'expected_score'};
  const fast=recommendNextAction(state,bundle(16,12,8),true);
  const exact=recommendNextAction(state,bundle(16,9999,9999),true);
  assert.equal(formatAction(fast.recommendation.action,state),formatAction(exact.recommendation.action,state));
  const exactByAction=new Map(exact.ranking.map(r=>[formatAction(r.action,state),r]));
  // Immediate score EV is still fully enumerated and should not depend on continuation compression.
  for(const row of fast.ranking){
    const peer=exactByAction.get(formatAction(row.action,state));if(!peer)continue;
    assert.ok(Math.abs(row.expectedFinalScore-peer.expectedFinalScore)<1e-6);
  }
});

test('board-action evaluations expose ordered terminal-utility outcome quantiles',()=>{
  const data=testData();
  const state={board:structuredClone(defaultBoard),tokensRemaining:10,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'Quantiles',objective:'expected_score'};
  const result=recommendNextAction(state,data,true);
  const rows=result.ranking.filter(r=>r.action.kind==='board_action');
  assert.ok(rows.length>0);
  for(const row of rows){
    assert.equal(typeof row.outcomeP10Utility,'number');
    assert.equal(typeof row.outcomeMedianUtility,'number');
    assert.equal(typeof row.outcomeP90Utility,'number');
    assert.ok(row.outcomeP10Utility<=row.outcomeMedianUtility);
    assert.ok(row.outcomeMedianUtility<=row.outcomeP90Utility);
  }
});
