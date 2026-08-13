import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

rmSync(resolve(root, 'build'), { recursive: true, force: true });
rmSync(resolve(root, 'docs'), { recursive: true, force: true });
mkdirSync(resolve(root, 'docs'), { recursive: true });

console.log('Removed generated build/ and docs/ output.');
