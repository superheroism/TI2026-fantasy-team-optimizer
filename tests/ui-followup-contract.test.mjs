import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('UI follow-up aligns paired controls and uses consistent role tabs',()=>{
  const index=read('site/index.html');
  assert.match(index,/\.layout-segmented\{height:32px\}/);
  assert.match(index,/#screenshot-import,#screenshot-ocr-diagnostic-copy\{height:32px\}/);
  assert.match(index,/\.op-number,\.op-select\{height:36px\}/);
  assert.match(index,/\.comparison-tabs\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(index,/\.comparison-tabs button\{[^}]*border-radius:4px!important;[^}]*padding:6px 4px;[^}]*font-size:10px/);
});

test('Expected Series helper uses the requested plain-language likelihood copy',()=>{
  const boardView=read('src/ui/boardView.ts');
  assert.match(boardView,/EXPECTED SERIES PLAYED/);
  assert.match(boardView,/most likely: \$\{automaticExpectedSeries\}/);
  assert.doesNotMatch(boardView,/AUTO ASSUMPTION:/);
});
