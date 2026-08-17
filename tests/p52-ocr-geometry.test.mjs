import assert from 'node:assert/strict';
import test from 'node:test';
import { selectBalancedCardColumns, selectRoleColumnConsensus } from '../build/js/import/roleColumnGeometry.js';
import { createOcrExecutionBudget, recognizeWithBudget, validateOcrRect } from '../build/js/import/ocrRecognition.js';
import { directTierText } from '../build/js/import/screenshotImport.js';

const candidate=(role,x,y=100,confidence=95,similarity=1)=>({role,x,y,confidence,similarity});

test('partial role consensus preserves strong Core + Support and ignores footer Mid decoy',()=>{
  const result=selectRoleColumnConsensus([
    candidate('core',180,100),candidate('support',820,102),candidate('mid',500,760,99,1),
  ],1000,900);
  assert.ok(result);
  assert.deepEqual(result.inferred,['mid']);
  assert.equal(result.centers.core,180);
  assert.equal(result.centers.mid,500);
  assert.equal(result.centers.support,820);
});

test('partial role consensus can infer either outer column from adjacent aligned headings',()=>{
  const left=selectRoleColumnConsensus([candidate('core',180),candidate('mid',500,102)],1000,900);
  assert.ok(left);assert.deepEqual(left.inferred,['support']);assert.equal(left.centers.support,820);
  const right=selectRoleColumnConsensus([candidate('mid',500),candidate('support',820,102)],1000,900);
  assert.ok(right);assert.deepEqual(right.inferred,['core']);assert.equal(right.centers.core,180);
});

test('ROI validation rejects non-finite, zero, negative, and out-of-bounds geometry',()=>{
  assert.equal(validateOcrRect({left:0,top:0,width:10,height:10},100,100),undefined);
  assert.equal(validateOcrRect({left:0,top:0,width:0,height:10},100,100),'non-positive-area');
  assert.equal(validateOcrRect({left:0,top:0,width:10,height:-1},100,100),'non-positive-area');
  assert.equal(validateOcrRect({left:Number.NaN,top:0,width:10,height:10},100,100),'non-finite');
  assert.equal(validateOcrRect({left:0,top:0,width:Number.POSITIVE_INFINITY,height:10},100,100),'non-finite');
  assert.equal(validateOcrRect({left:95,top:0,width:10,height:10},100,100),'out-of-bounds');
});

test('invalid geometry never reaches worker.recognize',async()=>{
  let calls=0;
  const worker={recognize:async()=>{calls++;return{data:{text:'bad',tsv:''}};},setParameters:async()=>{}};
  const budget=createOcrExecutionBudget(1000,500);
  const result=await recognizeWithBudget(worker,{},budget,{stage:'invalid-test',psm:6,crop:{left:0,top:0,width:0,height:20},canvasWidth:1,canvasHeight:20,sourceWidth:100,sourceHeight:100});
  assert.equal(calls,0);
  assert.equal(result.data.text,'');
  assert.equal(budget.calls.at(-1).outcome,'invalid-geometry');
  assert.equal(budget.exhausted,false);
});

test('percentage bonuses are not direct tier evidence',()=>{
  assert.equal(directTierText('+10%',1),false);
  assert.equal(directTierText('+30%',2),false);
  assert.equal(directTierText('+60%',3),false);
  assert.equal(directTierText('+100%',4),false);
  assert.equal(directTierText('+150%',5),false);
  assert.equal(directTierText('TIER I',1),true);
  assert.equal(directTierText('TIER V',5),true);
});


test('balanced card columns give each coherent row one vote per column',()=>{
  const anchors=[];
  for(const y of [100,200,300,400]){
    anchors.push({x:180,y},{x:190,y},{x:500,y},{x:505,y},{x:510,y},{x:820,y});
  }
  const result=selectBalancedCardColumns(anchors,1000,700);
  assert.ok(result);
  assert.ok(Math.abs(result[0]-185)<=5);
  assert.ok(Math.abs(result[1]-505)<=5);
  assert.ok(Math.abs(result[2]-820)<=5);
});

test('balanced card columns reject a one-row left-UI decoy',()=>{
  const anchors=[];
  for(const y of [100,200,300,400])anchors.push({x:190,y},{x:500,y},{x:810,y});
  anchors.push({x:20,y:50},{x:70,y:50},{x:130,y:50},{x:190,y:50},{x:500,y:50},{x:810,y:50});
  const result=selectBalancedCardColumns(anchors,1000,700);
  assert.ok(result);
  assert.ok(Math.abs(result[0]-190)<=5);
  assert.ok(Math.abs(result[1]-500)<=5);
  assert.ok(Math.abs(result[2]-810)<=5);
});
