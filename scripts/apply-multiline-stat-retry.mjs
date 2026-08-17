import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, from, to) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Expected pattern not found in ${path}`);
  writeFileSync(path, text.replace(from, to));
}

replaceOnce(
  'src/import/ocrDomainMatch.ts',
  `export function matchStatText(s:string,legal:readonly StatName[]):{value:StatName;score:number}{\n  let best={value:legal[0]!,score:-1};\n  for(const value of legal){\n    const score=Math.max(...ALIASES[value].map(alias=>bestPhraseSimilarity(s,alias)));\n    if(score>best.score) best={value,score};\n  }\n  return best;\n}\n`,
  `export function matchStatText(s:string,legal:readonly StatName[]):{value:StatName;score:number}{\n  let best={value:legal[0]!,score:-1};\n  for(const value of legal){\n    const score=Math.max(...ALIASES[value].map(alias=>bestPhraseSimilarity(s,alias)));\n    if(score>best.score) best={value,score};\n  }\n  return best;\n}\n\nexport interface StatLineMatch { value:StatName;score:number;lineIndices:number[];text:string; }\nfunction statLineText(s:string):string { return tokens(s).filter(token=>!/^\\d+%$/.test(token)).join(' '); }\n/** Match a stat across OCR line breaks without treating the displayed percentage as part of the stat name. */\nexport function matchStatLines(lines:readonly string[],legal:readonly StatName[]):StatLineMatch {\n  let best:StatLineMatch={value:legal[0]!,score:-1,lineIndices:[],text:''};\n  const cleaned=lines.map(statLineText);\n  const consider=(text:string,lineIndices:number[]):void=>{\n    if(!text.trim()) return;\n    const match=matchStatText(text,legal);\n    if(match.score>best.score) best={...match,lineIndices,text};\n  };\n  cleaned.forEach((text,index)=>consider(text,[index]));\n  for(let index=0;index+1<cleaned.length;index++){\n    if(cleaned[index]&&cleaned[index+1]) consider(cleaned[index]+' '+cleaned[index+1],[index,index+1]);\n  }\n  const nonempty=cleaned.map((text,index)=>({text,index})).filter(row=>row.text);\n  if(nonempty.length>1) consider(nonempty.map(row=>row.text).join(' '),nonempty.map(row=>row.index));\n  return best;\n}\n`
);

replaceOnce(
  'src/import/emblemOcrRefinement.ts',
  `import { matchActionText, matchStatText, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';`,
  `import { matchActionText, matchStatLines, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';`
);

replaceOnce(
  'src/import/emblemOcrRefinement.ts',
  `if(confidenceFor(raw,sp)<.9){const sm=matchStatText(ls[0]?.text??orderedText(words),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),sc=combined(sm.score,ls[0]?.words??words);if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);}}`,
  `if(confidenceFor(raw,sp)<.9){const sm=matchStatLines(ls.map(line=>line.text),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),statWords=sm.lineIndices.flatMap(index=>ls[index]?.words??[]),sc=combined(sm.score,statWords.length?statWords:words);if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);}}`
);

writeFileSync('tests/multiline-stat-match.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { matchStatLines } from '../build/js/import/ocrDomainMatch.js';\nimport { LEGAL_STAT_POOLS } from '../build/js/domain/rules.js';\n\ntest('multiline stat matcher joins Madstone Collected across OCR lines',()=>{\n  const result=matchStatLines(['MADSTONE 150%','COLLECTED'],LEGAL_STAT_POOLS.red);\n  assert.equal(result.value,'Madstone');\n  assert.ok(result.score>=.99);\n  assert.deepEqual(result.lineIndices,[0,1]);\n});\n\ntest('multiline stat matcher tolerates percentage on its own OCR line',()=>{\n  const result=matchStatLines(['MADSTONE','150%','COLLECTED'],LEGAL_STAT_POOLS.red);\n  assert.equal(result.value,'Madstone');\n  assert.ok(result.score>=.99);\n});\n\ntest('single-line stats retain normal matching behavior',()=>{\n  const result=matchStatLines(['TOWER KILLS 270%','TIER V 150%','FRIENDLY 20%'],LEGAL_STAT_POOLS.red);\n  assert.equal(result.value,'Tower Kills');\n  assert.ok(result.score>=.99);\n});\n\ntest('weak unrelated multiline OCR does not become a strong Madstone match',()=>{\n  const result=matchStatLines(['lew 150%','TIER II 30%','FRIENDLY 20%'],LEGAL_STAT_POOLS.red);\n  assert.ok(result.score<.92);\n});\n`);
