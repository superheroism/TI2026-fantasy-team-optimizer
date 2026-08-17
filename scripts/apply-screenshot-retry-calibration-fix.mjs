import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, from, to) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Expected pattern not found in ${path}: ${from}`);
  writeFileSync(path, text.replace(from, to));
}

replaceOnce(
  'src/import/emblemOcrRefinement.ts',
  'if(confidenceFor(raw,qp)>=.9&&confidenceFor(raw,tp)>=.9)continue;',
  'if(confidenceFor(raw,sp)>=.9&&confidenceFor(raw,qp)>=.9&&confidenceFor(raw,tp)>=.9)continue;',
);

replaceOnce(
  'src/import/screenshotImport.ts',
  "else if(statRaw>=.95&&(statChanged||statStrengthened)){statComponents.targetedRetry=.95;statComponents.fieldConsistency=statChanged?.9:1;statReason='targeted-native-stat';}",
  "else if(statRaw>=.9&&(statChanged||statStrengthened)){statComponents.targetedRetry=.95;statComponents.fieldConsistency=statChanged?.9:1;statReason='targeted-native-stat';}",
);

writeFileSync('tests/screenshot-refinement-contract.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const refinement=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
const calibration=readFileSync(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');

test('low-confidence stat alone triggers native emblem refinement',()=>{
  assert.match(refinement,/confidenceFor\\(raw,sp\\)>=\\.9&&confidenceFor\\(raw,qp\\)>=\\.9&&confidenceFor\\(raw,tp\\)>=\\.9/);
  assert.doesNotMatch(refinement,/if\\(confidenceFor\\(raw,qp\\)>=\\.9&&confidenceFor\\(raw,tp\\)>=\\.9\\)continue/);
});

test('strong native stat retry can supersede weak initial evidence',()=>{
  assert.match(calibration,/statRaw>=\\.9&&\\(statChanged\\|\\|statStrengthened\\)/);
  assert.doesNotMatch(calibration,/statRaw>=\\.95&&\\(statChanged\\|\\|statStrengthened\\)/);
  assert.match(calibration,/statComponents\\.fieldConsistency=statChanged\\?\\.9:1/);
});
`);
