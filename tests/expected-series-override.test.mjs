import assert from 'node:assert/strict';
import test from 'node:test';

import { ApplicationState } from '../docs/js/ui/state.js';

const roles=['core','mid','support'];
const series=state=>roles.map(role=>state.board[role].expectedSeries);

test('manual Expected Series overrides survive later layout changes while untouched roles follow layout defaults',()=>{
  const state=new ApplicationState();
  assert.deepEqual(series(state),[5,5,5]);
  state.setExpectedSeries('core',7);
  state.changeLayout('expanded_5');
  assert.deepEqual(series(state),[7,3,3]);
  state.setExpectedSeries('support',6);
  state.changeLayout('legacy_3');
  assert.deepEqual(series(state),[7,5,6]);
  state.changeLayout('expanded_5');
  assert.deepEqual(series(state),[7,3,6]);
});

test('reset clears Expected Series overrides and restores the active layout default',()=>{
  const state=new ApplicationState();
  state.setExpectedSeries('mid',9);
  state.changeLayout('expanded_5');
  assert.deepEqual(series(state),[3,9,3]);
  state.resetBoard();
  assert.deepEqual(series(state),[3,3,3]);
});
