import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLayoutEvidence, fitRowLattice, fitTierAnchoredLattice, rowWindows } from '../build/js/import/rowLattice.js';

const byRole=(core=[],mid=[],support=[])=>({core,mid,support});

test('no or sparse row evidence remains unresolved rather than becoming legacy',()=>{
  assert.equal(classifyLayoutEvidence(byRole(),[]).kind,'unresolved');
  assert.equal(classifyLayoutEvidence(byRole([100],[101],[102]),[101]).kind,'unresolved');
  assert.equal(classifyLayoutEvidence(byRole([100,200],[101,201],[102,202]),[101,201]).kind,'unresolved');
});

test('three-row evidence affirms legacy and four-or-five-row evidence affirms expanded',()=>{
  assert.equal(classifyLayoutEvidence(byRole([100,200,300],[101,201,301],[102,202,302]),[101,201,301]).kind,'legacy_3');
  assert.equal(classifyLayoutEvidence(byRole([100,200,300,400],[101,201,301,401],[102,202,302]),[101,201,301,401]).kind,'expanded_5');
  assert.equal(classifyLayoutEvidence(byRole([100,200,300,400,500],[],[]),[100,200,300,400,500]).kind,'expanded_5');
});

test('five-row lattice recovers a missing middle row coherently',()=>{
  const fit=fitRowLattice([100,200,400,500],5,700);
  assert.ok(fit);
  assert.deepEqual(fit.rows.map(Math.round),[100,200,300,400,500]);
  assert.equal(fit.synthesized,true);
});

test('five-row lattice recovers a missing final row coherently',()=>{
  const fit=fitRowLattice([100,200,300,400],5,700);
  assert.ok(fit);
  assert.deepEqual(fit.rows.map(Math.round),[100,200,300,400,500]);
});

test('generic lattice requires at least three observations',()=>{
  assert.equal(fitRowLattice([],5,700),null);
  assert.equal(fitRowLattice([100],5,700),null);
  assert.equal(fitRowLattice([100,200],5,700),null);
});

test('Tier anchor recovers a five-row lattice from two adjacent late rows using broader reference placement',()=>{
  const fit=fitTierAnchoredLattice([428,494.5],5,700,{origin:247,pitch:66});
  assert.ok(fit);
  assert.deepEqual(fit.rows.map(Math.round),[229,295,362,428,495]);
  assert.equal(fit.synthesized,true);
});

test('Tier anchor recovers sparse row 1/4/5 evidence without inventing an extra row',()=>{
  const fit=fitTierAnchoredLattice([230,428,494.5],5,700,{origin:240,pitch:65});
  assert.ok(fit);
  assert.equal(fit.rows.length,5);
  const expected=[230,296,362,429,495];
  fit.rows.forEach((row,index)=>assert.ok(Math.abs(row-expected[index])<=1,`row ${index+1}: ${row}`));
  assert.ok(fit.rows.every((row,index)=>index===0||row>fit.rows[index-1]));
});

test('Tier anchor preserves an affirmative three-row legacy lattice',()=>{
  const fit=fitTierAnchoredLattice([214.5,301.5,388],3,700,{origin:215,pitch:87});
  assert.ok(fit);
  assert.deepEqual(fit.rows.map(Math.round),[215,301,388]);
});

test('Tier anchor fails closed on one row or non-integral spacing',()=>{
  assert.equal(fitTierAnchoredLattice([100],5,700),null);
  assert.equal(fitTierAnchoredLattice([100,151,238],5,700),null);
});

test('unordered observations still produce strictly ordered finite windows',()=>{
  const fit=fitRowLattice([500,100,300,200,400],5,700);
  assert.ok(fit);
  assert.ok(fit.rows.every((row,index)=>Number.isFinite(row)&&(index===0||row>fit.rows[index-1])));
  const windows=rowWindows(fit.rows,700);
  assert.equal(windows.length,5);
  assert.ok(windows.every(window=>window.bottom>window.top&&window.top>=0&&window.bottom<=700));
});

test('invalid source height and incoherent row geometry fail closed',()=>{
  assert.equal(fitRowLattice([100,200,300],5,Number.NaN),null);
  assert.deepEqual(rowWindows([100,100,200],700),[]);
  assert.deepEqual(rowWindows([100,50,200],700),[]);
});
