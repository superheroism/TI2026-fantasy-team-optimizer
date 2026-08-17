import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, from, to) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Expected pattern not found in ${path}`);
  writeFileSync(path, text.replace(from, to));
}

replaceOnce(
  'src/import/emblemOcrRefinement.ts',
  `    if(confidenceFor(raw,sp)<.9){const sm=matchStatLines(ls.map(line=>line.text),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),statWords=sm.lineIndices.flatMap(index=>ls[index]?.words??[]),sc=combined(sm.score,statWords.length?statWords:words);if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);}}\n`,
  `    if(confidenceFor(raw,sp)<.9){const sm=matchStatLines(ls.map(line=>line.text),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),statWords=sm.lineIndices.flatMap(index=>ls[index]?.words??[]),sc=combined(sm.score,statWords.length?statWords:words);if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);d.normalizedStat=sm.value;d.statMatchScore=sm.score;}}\n    if(confidenceFor(raw,sp)<.9){const base=extractionToSource(d.roi,metrics),statStrip={left:base.left,top:base.top,width:base.width,height:base.height*.38},statRec=await w.recognize(canvas(src,statStrip),{tessedit_pageseg_mode:'7'},{tsv:true}),statRetryWords=parse(statRec.data.tsv),statRetryLines=lines(statRetryWords),sm=matchStatLines(statRetryLines.map(line=>line.text),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),evidenceWords=sm.lineIndices.flatMap(index=>statRetryLines[index]?.words??[]).filter(word=>!/^\\+?\\d+%$/.test(word.text.trim())),sc=combined(sm.score,evidenceWords);retries++;emblemRetries++;if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);d.normalizedStat=sm.value;d.statMatchScore=sm.score;}}\n`
);

replaceOnce(
  'src/ui/boardView.ts',
  `import type { BannerState, BoardState, DataBundle, OfferedOperation, RecommendationResult, Role, TraitName } from '../domain/types.js';`,
  `import type { BannerState, BoardState, DataBundle, OfferedOperation, RecommendationResult, Role, StatName, TraitName } from '../domain/types.js';`
);

replaceOnce(
  'src/ui/boardView.ts',
  `function signedPct(value: number): string {\n  return \`${'${value >= 0 ? \'+' : \'\'}${value}%'}\`;\n}\n`,
  `function signedPct(value: number): string {\n  return \`${'${value >= 0 ? \'+' : \'\'}${value}%'}\`;\n}\n\nfunction statDisplayName(stat: StatName): string {\n  return stat === 'Madstone' ? 'Madstone Collected' : stat;\n}\n`
);

replaceOnce(
  'src/ui/boardView.ts',
  `${'${pool.map(stat => `<option ${stat === emblem.stat ? \'selected\' : \'\'}>${stat}</option>`).join(\'\')}'} `,
  `${'${pool.map(stat => `<option value="${escapeHtml(stat)}" ${stat === emblem.stat ? \'selected\' : \'\'}>${escapeHtml(statDisplayName(stat))}</option>`).join(\'\')}'} `
);

writeFileSync('tests/stat-row-retry-ui.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nconst read=path=>readFileSync(new URL(path,import.meta.url),'utf8');\nconst refinement=read('../src/import/emblemOcrRefinement.ts');\nconst boardView=read('../src/ui/boardView.ts');\n\ntest('low-confidence stat gets a dedicated native-resolution single-line retry',()=>{\n  assert.match(refinement,/statStrip=\\{left:base\\.left,top:base\\.top,width:base\\.width,height:base\\.height\\*\\.38\\}/);\n  assert.match(refinement,/statRec=await w\\.recognize\\(canvas\\(src,statStrip\\),\\{tessedit_pageseg_mode:'7'\\}/);\n  assert.match(refinement,/if\\(confidenceFor\\(raw,sp\\)<\\.9\\)/);\n  assert.match(refinement,/sm\\.score>=\\.92&&sc>=\\.9/);\n});\n\ntest('stat-row retry excludes multiplier percentages from OCR confidence evidence',()=>{\n  assert.match(refinement,/filter\\(word=>!\\\/\\^\\\\\\+\\?\\\\d\\+%\\$\\\/\\.test\\(word\\.text\\.trim\\(\\)\\)\\)/);\n});\n\ntest('successful stat retries synchronize final diagnostic stat values',()=>{\n  assert.match(refinement,/d\\.normalizedStat=sm\\.value;d\\.statMatchScore=sm\\.score/);\n});\n\ntest('Madstone keeps its engine key while displaying the client label',()=>{\n  assert.match(boardView,/stat === 'Madstone' \\? 'Madstone Collected' : stat/);\n  assert.match(boardView,/value="\\$\\{escapeHtml\\(stat\\)\\}"/);\n  assert.match(boardView,/escapeHtml\\(statDisplayName\\(stat\\)\\)/);\n});\n`);
