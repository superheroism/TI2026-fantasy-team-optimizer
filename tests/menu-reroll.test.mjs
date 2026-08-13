import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { demoData } from '../docs/js/data/demo.js';
import { recommendNextAction } from '../docs/js/engine/optimizer.js';

test('menu reroll remains a legal one-token action with one token remaining',()=>{
  const data={...demoData,simulation:{...demoData.simulation,iterations:10,optimizerIterations:10,rankingIterations:10,maxLookaheadTokens:1}};
  const result=recommendNextAction({board:structuredClone(defaultBoard),tokensRemaining:1,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'Tester',objective:'expected_score'},data,true);
  const row=result.ranking.find(r=>r.action.kind==='menu_reroll');
  assert.ok(row);
  assert.equal(row.status,'evaluated');
  assert.equal(row.tokensAfter,0);
  assert.match(row.note,/cannot be acted on/i);
});

test('visible stat, quality, and trait actions all have V1 transition models',()=>{
  const data={...demoData,simulation:{...demoData.simulation,iterations:6,optimizerIterations:6,rankingIterations:6,maxLookaheadTokens:1}};
  const result=recommendNextAction({board:structuredClone(defaultBoard),tokensRemaining:1,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'Tester',objective:'expected_score'},data,true);
  const boardRows=result.ranking.filter(r=>r.action.kind==='board_action');
  assert.ok(boardRows.length>0);
  assert.ok(boardRows.every(r=>r.status==='evaluated'));
  assert.ok(boardRows.some(r=>r.action.kind==='board_action'&&r.action.operationId==='red-quality-all'));
  assert.ok(boardRows.some(r=>r.action.kind==='board_action'&&r.action.operationId==='blue-trait-all'));
});
