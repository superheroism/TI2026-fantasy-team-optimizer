import fs from 'node:fs';
const path='tests/ui-contract.test.mjs';
let text=fs.readFileSync(path,'utf8');
const replacements=[
  ["  assert.match(index,/>3 Emblems</button>/);","  assert.ok(index.includes('>3 Emblems</button>'));"],
  ["  assert.match(index,/>5 Emblems</button>/);","  assert.ok(index.includes('>5 Emblems</button>'));"],
  ["  assert.match(app,/convertBoardLayout(board,target)/);","  assert.ok(app.includes('convertBoardLayout(board,target)'));"],
  ["  assert.match(app,/createDefaultBoard(layoutId)/);","  assert.ok(app.includes('createDefaultBoard(layoutId)'));"],
  ["  assert.match(app,/optimizerClient.invalidate()/);","  assert.ok(app.includes('optimizerClient.invalidate()'));"],
  ["  assert.match(app,/optimizerClient.optimize(s)/);","  assert.ok(app.includes('optimizerClient.optimize(s)'));"],
];
for(const [from,to] of replacements)text=text.replaceAll(from,to);
fs.writeFileSync(path,text);
