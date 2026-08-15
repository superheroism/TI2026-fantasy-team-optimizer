import fs from 'node:fs';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { CANDIDATE_SPEC, makeState, runExact, runRootRefinement, M6C_BASE_SHA } from './m6c-benchmark-lib.mjs';

const corpusPath=process.argv[2],caseId=process.argv[3],mode=process.argv[4],candidateId=process.argv[5]??null;
if(!corpusPath||!caseId||!['exact','candidate'].includes(mode))throw new Error('usage: benchmark-m6c-case.mjs <corpus> <caseId> <exact|candidate> [candidateId]');
const corpus=JSON.parse(fs.readFileSync(corpusPath,'utf8')),definition=corpus.cases.find(x=>x.id===caseId);if(!definition)throw new Error(`unknown case ${caseId}`);if(corpus.layoutId!=='expanded_5'||corpus.horizon!==2)throw new Error('M6C corpus must be expanded_5 t=2');
const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8')),titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8')),data=convertStatisticalModel(raw,titles),state=makeState(definition,data);
let result;if(mode==='exact')result=runExact(state,data);else{const policy=CANDIDATE_SPEC.candidates.find(x=>x.id===candidateId);if(!policy)throw new Error(`unknown candidate ${candidateId}`);result=runRootRefinement(state,data,policy);}
process.stdout.write(`${JSON.stringify({m6cBaseSha:M6C_BASE_SHA,caseId,seed:definition.seed,boardVariant:definition.boardVariant,objective:definition.objective,operationFamily:definition.operationFamily,targetScore:definition.targetScore??null,layoutId:'expanded_5',horizon:2,mode,candidateId,result})}\n`);
