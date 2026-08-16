import fs from 'node:fs';
const path='tests/ui-contract.test.mjs';
let text=fs.readFileSync(path,'utf8');
text=text.replace("  assert.match(index,/>3 Emblems</button>/);","  assert.ok(index.includes('>3 Emblems</button>'));\n");
text=text.replaceAll("  assert.match(index,/>5 Emblems</button>/);","  assert.ok(index.includes('>5 Emblems</button>'));\n");
fs.writeFileSync(path,text);
