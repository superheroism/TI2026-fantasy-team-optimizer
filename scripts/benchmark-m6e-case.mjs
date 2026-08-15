import fs from 'node:fs';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { makeState, runSearch, M6E_BASE_SHA } from './m6e-benchmark-lib.mjs';

const corpusPath=process.argv[2],caseId=process.argv[3],mode=process.argv[4];
if(!corpusPath||!caseId||!['exact','production'].includes(mode))throw new Error('usage: benchmark-m6e-case.mjs <corpus> <caseId> <exact|production>');
const corpus=JSON.parse(fs.readFileSync(corpusPath,'utf8')),definition=corpus.cases.find(x=>x.id===caseId);if(!definition)throw new Error(`unknown case ${caseId}`);if(corpus.layoutId!=='expanded_5'||corpus.horizon!==2)throw new Error('M6E corpus must be expanded_5 t=2');
const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8')),titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8')),data=convertStatisticalModel(raw,titles),state=makeState(definition,data),result=runSearch(state,data,mode);
process.stdout.write(`${JSON.stringify({m6eBaseSha:M6E_BASE_SHA,caseId,objective:definition.objective,operationFamily:definition.operationFamily,marginClass:definition.marginClass,mode,result})}\n`);
