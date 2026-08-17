import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultBoard,defaultMenu} from '../docs/js/data/defaultState.js';
import {validateScreenshotImport} from '../docs/js/import/screenshotImport.js';
import {DIVERGENCE,canonicalFromValidated,classifyField,compareStages,sourceIdentity,withWatchdog} from '../scripts/screenshot-e2e-lib.mjs';

const roles=['core','mid','support'],team='Team Liquid',data={players:roles.map(role=>({role,team}))};
function rawFromBoard(board,operationIds,tokensRemaining=8){return {layoutId:board.layoutId,banners:Object.fromEntries(roles.map(role=>[role,{selectedTeam:team,emblems:board[role].emblems.map(e=>({position:e.position,color:e.color,stat:e.stat,qualityTier:e.qualityTier,trait:e.trait}))}])),operationIds,tokensRemaining,fieldConfidence:[],warnings:[]};}
function gtFromRaw(raw){return {layoutId:raw.layoutId,selectedTeams:{core:team,mid:team,support:team},banners:Object.fromEntries(roles.map(role=>[role,{emblems:raw.banners[role].emblems.map(e=>({stat:e.stat,qualityTier:e.qualityTier,trait:e.trait}))}])),actions:raw.operationIds.map(id=>({id})),tokensRemaining:raw.tokensRemaining};}

test('low-confidence correct raw action preserves sentinel action and final comparator rejects it',()=>{
  const board=createDefaultBoard('expanded_5'),sentinelMenu=structuredClone(defaultMenu),expectedIds=['red-stat-all','quality-increase-one','blue-trait-first'];
  assert.notEqual(sentinelMenu[0].id,expectedIds[0]);
  const raw=rawFromBoard(board,expectedIds);raw.fieldConfidence=[{path:'operationIds.0',confidence:.85,reason:'action-ocr'}];
  const result=validateScreenshotImport(raw,data,board,sentinelMenu);assert.equal(result.menu[0].id,sentinelMenu[0].id);
  const sentinel={layoutId:board.layoutId,banners:board,operationIds:sentinelMenu.map(x=>x.id),tokensRemaining:8},rendered=canonicalFromValidated(result),comparison=compareStages({groundTruth:gtFromRaw(raw),raw,validated:result,applied:{board:result.board,menu:result.menu,tokensRemaining:result.tokensRemaining},rendered,sentinel});
  assert.equal(comparison.mismatches.find(x=>x.path==='operationIds.0').firstDivergence,DIVERGENCE.VALIDATION_REJECTED_CORRECT_RAW_VALUE);assert.equal(comparison.appliedExact,false);
});

test('wrong selected team prevents exact status',()=>{
  const board=createDefaultBoard('legacy_3'),ids=['green-stat-all','red-quality-all','blue-trait-all'],raw=rawFromBoard(board,ids),groundTruth=gtFromRaw(raw);raw.banners.mid.selectedTeam='Wrong Team';
  const exact={board,menu:ids.map(id=>({id})),tokensRemaining:8},sentinel={layoutId:board.layoutId,banners:board,operationIds:ids,tokensRemaining:8},comparison=compareStages({groundTruth,raw,validated:exact,applied:exact,rendered:canonicalFromValidated(exact),sentinel});
  assert.equal(comparison.rawExact,false);assert.equal(comparison.mismatches.find(x=>x.path==='banners.mid.selectedTeam').firstDivergence,DIVERGENCE.RAW_OCR_ERROR);
});

test('stage classification distinguishes each pipeline boundary',()=>{
  assert.equal(classifyField({expected:'x',raw:'y',validated:'y',applied:'y',rendered:'y',sentinel:'s'}),DIVERGENCE.RAW_OCR_ERROR);
  assert.equal(classifyField({expected:'x',raw:'x',validated:'s',applied:'s',rendered:'s',sentinel:'s'}),DIVERGENCE.VALIDATION_REJECTED_CORRECT_RAW_VALUE);
  assert.equal(classifyField({expected:'x',raw:'x',validated:'z',applied:'z',rendered:'z',sentinel:'s'}),DIVERGENCE.VALIDATION_CHANGED_VALUE);
  assert.equal(classifyField({expected:'x',raw:'x',validated:'x',applied:'z',rendered:'z',sentinel:'s'}),DIVERGENCE.APPLY_STATE_ERROR);
  assert.equal(classifyField({expected:'x',raw:'x',validated:'x',applied:'x',rendered:'z',sentinel:'s'}),DIVERGENCE.RENDER_MISMATCH);
});

test('Board 2 source identity parser reads the committed fixture',()=>{const id=sourceIdentity('tests/test_boards/TI2026 - Board 2.png');assert.equal(id.byteSize,5692486);assert.match(id.sha256,/^[a-f0-9]{64}$/);assert.ok(id.width>0&&id.height>0);assert.equal(id.mimeType,'image/png');});
test('browser watchdog rejects unresolved work',async()=>{await assert.rejects(withWatchdog(()=>new Promise(()=>{}),10,'synthetic import'),error=>error.code==='E_WATCHDOG');});
