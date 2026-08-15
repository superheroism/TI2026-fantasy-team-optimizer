import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const candidates=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/m6d-expanded-adaptive-candidates.json'),'utf8'));
const selection=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/m6d-selection.json'),'utf8'));
if(selection.outcome!=='A'||selection.holdoutPassed!==true||selection.selectedCandidate!=='adaptive-tight')throw new Error('M6E requires certified M6D Outcome A adaptive-tight selection.');
if(candidates.layoutId!=='expanded_5'||candidates.horizon!==2)throw new Error('M6D certification artifact has unexpected layout/horizon.');
const policy=candidates.candidates.find(candidate=>candidate.id===selection.selectedCandidate);
if(!policy)throw new Error('Selected M6D candidate is missing from certification artifact.');
if(JSON.stringify(policy.stages)!=='[2,4,6]'||policy.winnerChangeIsAmbiguous!==true||policy.exactFallback!==true)throw new Error('M6D selected policy structure is invalid for M6E.');
for(const thresholds of [policy.expectedScoreGapThresholds,policy.targetProbabilityGapThresholds])if(!Array.isArray(thresholds)||thresholds.length!==3||thresholds.some(value=>!Number.isFinite(value)||value<0))throw new Error('M6D selected policy thresholds are invalid.');
const tuple=values=>values.map(value=>Number(value)).join(',');
const content=`// GENERATED FROM benchmarks/m6d-expanded-adaptive-candidates.json + benchmarks/m6d-selection.json.\n// scripts/generate-m6e-policy.mjs is the source-of-truth bridge from certification evidence to production.\n\nexport interface ExpandedT2AdaptivePolicy {\n  readonly id:string;\n  readonly layoutId:'expanded_5';\n  readonly horizon:2;\n  readonly stages:readonly [2,4,6];\n  readonly expectedScoreGapThresholds:readonly [number,number,number];\n  readonly targetProbabilityGapThresholds:readonly [number,number,number];\n  readonly winnerChangeIsAmbiguous:true;\n  readonly exactFallback:true;\n  readonly certificationOutcome:'A';\n}\n\nexport const CERTIFIED_EXPANDED_T2_POLICY:ExpandedT2AdaptivePolicy=Object.freeze({\n  id:${JSON.stringify(policy.id)},\n  layoutId:'expanded_5',\n  horizon:2,\n  stages:[${tuple(policy.stages)}],\n  expectedScoreGapThresholds:[${tuple(policy.expectedScoreGapThresholds)}],\n  targetProbabilityGapThresholds:[${tuple(policy.targetProbabilityGapThresholds)}],\n  winnerChangeIsAmbiguous:true,\n  exactFallback:true,\n  certificationOutcome:'A',\n});\n\nexport function isCertifiedExpandedT2PolicyValid(policy:ExpandedT2AdaptivePolicy):boolean {\n  return policy.id==='adaptive-tight'\n    &&policy.layoutId==='expanded_5'\n    &&policy.horizon===2\n    &&policy.certificationOutcome==='A'\n    &&policy.winnerChangeIsAmbiguous===true\n    &&policy.exactFallback===true\n    &&policy.stages.length===3\n    &&policy.stages[0]===2&&policy.stages[1]===4&&policy.stages[2]===6\n    &&policy.expectedScoreGapThresholds.length===3\n    &&policy.expectedScoreGapThresholds.every(Number.isFinite)\n    &&policy.targetProbabilityGapThresholds.length===3\n    &&policy.targetProbabilityGapThresholds.every(Number.isFinite);\n}\n`;
const output=path.join(root,'src/engine/expandedT2AdaptivePolicy.ts');
if(process.argv.includes('--check')){
  if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==content)throw new Error('Committed M6E production policy is stale relative to M6D certification artifacts.');
  console.log('M6E certified production policy matches M6D artifacts.');
}else{
  fs.writeFileSync(output,content);
  console.log('Generated M6E production policy from committed M6D certification artifacts.');
}
