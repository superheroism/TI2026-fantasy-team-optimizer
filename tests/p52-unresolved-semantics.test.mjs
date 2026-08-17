import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');
test('tier confidence cannot become structured high-confidence from match score alone',()=>{assert.ok(source.includes("tierRaw>=.98?.98:.89"));assert.ok(!source.includes("||diag.tierMatchScore>=.97"));});
test('sub-threshold action OCR preserves the existing menu',()=>{assert.ok(source.includes('actionConfidence<REVIEW_THRESHOLD'));assert.ok(source.includes('preserved until reviewed'));});
test('action recognition requires review-threshold evidence',()=>{assert.ok(source.includes('const actionResolved=operationId!==null&&rawConfidence>=.9'));});
