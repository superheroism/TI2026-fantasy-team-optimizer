import assert from 'node:assert/strict';
import test from 'node:test';

import { ApplicationState } from '../docs/js/ui/state.js';

const roles=['core','mid','support'];
const series=state=>roles.map(role=>state.board[role].expectedSeries);

test('Main Event startup defaults to five emblems, three expected series, and 30 roll tokens',()=>{
  const state=new ApplicationState();
  assert.equal(state.board.layoutId,'expanded_5');
  assert.deepEqual(roles.map(role=>state.board[role].emblems.length),[5,5,5]);
  assert.deepEqual(series(state),[3,3,3]);
  assert.equal(state.tokensRemaining,30);
});

test('manual Expected Series overrides survive later layout changes while untouched roles follow layout defaults',()=>{
  const state=new ApplicationState();
  state.setExpectedSeries('core',7);
  state.changeLayout('legacy_3');
  assert.deepEqual(series(state),[7,5,5]);
  state.setExpectedSeries('support',6);
  state.changeLayout('expanded_5');
  assert.deepEqual(series(state),[7,3,6]);
  state.changeLayout('legacy_3');
  assert.deepEqual(series(state),[7,5,6]);
});

test('reset clears Expected Series overrides and restores the active layout and token defaults',()=>{
  const state=new ApplicationState();
  state.setExpectedSeries('mid',9);
  assert.deepEqual(series(state),[3,9,3]);
  state.tokensRemaining=4;
  state.resetBoard();
  assert.deepEqual(series(state),[3,3,3]);
  assert.equal(state.tokensRemaining,30);
});
