import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DIVERGENCE = Object.freeze({
  RAW_OCR_ERROR:'RAW_OCR_ERROR',
  VALIDATION_REJECTED_CORRECT_RAW_VALUE:'VALIDATION_REJECTED_CORRECT_RAW_VALUE',
  VALIDATION_CHANGED_VALUE:'VALIDATION_CHANGED_VALUE',
  APPLY_STATE_ERROR:'APPLY_STATE_ERROR',
  RENDER_MISMATCH:'RENDER_MISMATCH',
  GROUND_TRUTH_UNMAPPABLE:'GROUND_TRUTH_UNMAPPABLE',
});
const ROLES=['core','mid','support'];
const roleLabel=role=>role[0].toUpperCase()+role.slice(1);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const menuIds=menu=>Array.isArray(menu)?menu.map(item=>typeof item==='string'||item==null?item:item.id):menu?.operationIds??menu?.actions?.map(item=>item?.id??item);

export function groundTruthCanonical(gt){
  const actions=gt.operations??gt.actions?.map(item=>item?.id??item)??[];
  const out={layoutId:gt.layoutId,banners:{},operationIds:[...actions],tokensRemaining:gt.tokens??gt.tokensRemaining};
  for(const role of ROLES){
    const label=roleLabel(role),team=gt.selectedTeams?.[role]??gt.selectedTeams?.[label]??null,banner=gt.banners?.[role]??gt.banners?.[label]??{};
    out.banners[role]={selectedTeam:typeof team==='object'?team.expected:team,emblems:(banner.emblems??[]).map((e,i)=>({position:i+1,stat:e.stat,qualityTier:e.qualityTier??e.tier,trait:e.trait}))};
  }
  return out;
}

export function flattenCanonical(value){
  const fields=new Map();fields.set('layoutId',value?.layoutId);
  for(const role of ROLES){
    fields.set(`banners.${role}.selectedTeam`,value?.banners?.[role]?.selectedTeam);
    const emblems=value?.banners?.[role]?.emblems??[];
    for(let i=0;i<emblems.length;i++){
      fields.set(`banners.${role}.emblems.${i}.stat`,emblems[i]?.stat);
      fields.set(`banners.${role}.emblems.${i}.qualityTier`,emblems[i]?.qualityTier);
      fields.set(`banners.${role}.emblems.${i}.trait`,emblems[i]?.trait);
    }
  }
  for(let i=0;i<3;i++)fields.set(`operationIds.${i}`,value?.operationIds?.[i]);
  fields.set('tokensRemaining',value?.tokensRemaining);return fields;
}

export function canonicalFromValidated(value){if(!value)return value;return {layoutId:value.board?.layoutId,banners:value.board?.banners??value.board,operationIds:menuIds(value.menu),tokensRemaining:value.tokensRemaining};}
export const canonicalFromApplied=canonicalFromValidated;
export function confidenceByPath(raw){return new Map((raw?.fieldConfidence??[]).map(item=>[item.path,item.confidence]));}

export function classifyField({expected,raw,validated,applied,rendered,sentinel,unmappable=false}){
  if(unmappable)return DIVERGENCE.GROUND_TRUTH_UNMAPPABLE;
  if(!same(raw,expected))return DIVERGENCE.RAW_OCR_ERROR;
  if(!same(validated,expected))return same(validated,sentinel)?DIVERGENCE.VALIDATION_REJECTED_CORRECT_RAW_VALUE:DIVERGENCE.VALIDATION_CHANGED_VALUE;
  if(!same(applied,expected))return DIVERGENCE.APPLY_STATE_ERROR;
  if(!same(rendered,expected))return DIVERGENCE.RENDER_MISMATCH;
  return null;
}

export function compareStages({groundTruth,raw,validated,applied,rendered,sentinel}){
  const expected=groundTruthCanonical(groundTruth),maps={expected:flattenCanonical(expected),raw:flattenCanonical(raw),validated:flattenCanonical(canonicalFromValidated(validated)),applied:flattenCanonical(canonicalFromApplied(applied)),rendered:flattenCanonical(rendered),sentinel:flattenCanonical(sentinel)};
  const conf=confidenceByPath(raw),mismatches=[];let falseHighConfidenceErrors=0,rawCorrectFinalWrong=0;
  for(const [fieldPath,expectedValue] of maps.expected){
    const teamSpec=fieldPath.endsWith('.selectedTeam')?groundTruth.selectedTeams?.[fieldPath.split('.')[1]]??groundTruth.selectedTeams?.[roleLabel(fieldPath.split('.')[1])]:undefined;
    const unmappable=teamSpec&&typeof teamSpec==='object'&&teamSpec.expectedReview===true;
    const values={expected:expectedValue,raw:maps.raw.get(fieldPath),validated:maps.validated.get(fieldPath),applied:maps.applied.get(fieldPath),rendered:maps.rendered.get(fieldPath),sentinel:maps.sentinel.get(fieldPath)},firstDivergence=classifyField({...values,unmappable});
    if(firstDivergence){const rawConfidence=conf.get(fieldPath);mismatches.push({path:fieldPath,...values,rawConfidence,firstDivergence});if(firstDivergence===DIVERGENCE.RAW_OCR_ERROR&&typeof rawConfidence==='number'&&rawConfidence>=0.9)falseHighConfidenceErrors++;}
    if(same(values.raw,expectedValue)&&!same(values.applied,expectedValue))rawCorrectFinalWrong++;
  }
  const exact=map=>[...maps.expected].every(([k,v])=>same(map.get(k),v));
  return {rawExact:exact(maps.raw),validatedExact:exact(maps.validated),appliedExact:exact(maps.applied),renderExact:exact(maps.rendered),falseHighConfidenceErrors,rawVsFinalDiscrepancyCount:rawCorrectFinalWrong,mismatches};
}

export async function withWatchdog(factory,timeoutMs=30000,label='operation'){
  let timer;try{return await Promise.race([factory(),new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error(`${label} timed out after ${timeoutMs} ms`);e.code='E_WATCHDOG';reject(e);},timeoutMs);})]);}finally{clearTimeout(timer);}
}
function pngDimensions(buf){if(buf.length<24||buf.toString('hex',0,8)!=='89504e470d0a1a0a')return null;return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};}
function webpDimensions(buf){if(buf.length<30||buf.toString('ascii',0,4)!=='RIFF'||buf.toString('ascii',8,12)!=='WEBP')return null;const kind=buf.toString('ascii',12,16);if(kind==='VP8X')return {width:1+buf.readUIntLE(24,3),height:1+buf.readUIntLE(27,3)};if(kind==='VP8L'){const b1=buf[21],b2=buf[22],b3=buf[23],b4=buf[24];return {width:1+b1+((b2&0x3f)<<8),height:1+(b2>>6)+(b3<<2)+((b4&0x0f)<<10)};}if(kind==='VP8 '){const marker=buf.indexOf(Buffer.from([0x9d,0x01,0x2a]),20);if(marker>=0&&marker+7<buf.length)return {width:buf.readUInt16LE(marker+3)&0x3fff,height:buf.readUInt16LE(marker+5)&0x3fff};}return null;}
export function sourceIdentity(filePath){const buf=fs.readFileSync(filePath),ext=path.extname(filePath).toLowerCase(),dimensions=ext==='.png'?pngDimensions(buf):ext==='.webp'?webpDimensions(buf):null;if(!dimensions)throw new Error(`Unsupported or invalid corpus image: ${filePath}`);return {filename:path.basename(filePath),...dimensions,byteSize:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex'),mimeType:ext==='.png'?'image/png':'image/webp'};}
export function summarizeSafety(localOcrMetrics){const text=JSON.stringify(localOcrMetrics??{}).toLowerCase();const num=(...names)=>{for(const n of names){const v=localOcrMetrics?.[n];if(Number.isFinite(v))return v;}return 0;};return {timeouts:num('timeoutCount','ocrTimeoutCount'),invalidGeometry:num('invalidRoiCount','invalidGeometryCount'),diagnosticMentionsTimeout:text.includes('timeout')};}
