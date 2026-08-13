import test from 'node:test';import assert from 'node:assert/strict';
import { retainRoleScore, spearmanToGaussian } from '../docs/js/engine/scoring.js';

test('TI 2026 retention keeps top 2 games in the single best series',()=>{
  const scoring={retainedGamesPerSeries:2,retainedSeries:1,thirdGameProbability:.407};
  assert.equal(retainRoleScore([[10,9,1],[8,7,6],[20,1]],scoring),21);
});

test('does not sum the two best series',()=>{
  const scoring={retainedGamesPerSeries:2,retainedSeries:1,thirdGameProbability:.407};
  assert.equal(retainRoleScore([[10,9],[8,7]],scoring),19);
});

test('Spearman correlation is converted for Gaussian copula',()=>{
  assert.ok(Math.abs(spearmanToGaussian(.5)-2*Math.sin(Math.PI*.5/6))<1e-12);
});
