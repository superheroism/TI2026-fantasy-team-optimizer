import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkCommitted = process.argv.includes('--check-committed');

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function snapshotTree(base) {
  if (!existsSync(base)) return null;
  const out = new Map();
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) out.set(relative(base, child).replaceAll('\\', '/'), hashFile(child));
    }
  };
  walk(base);
  return out;
}

function diffSnapshots(a, b) {
  if (a === null || b === null) return ['tree missing'];
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = [];
  for (const key of keys) {
    if (!a.has(key)) changes.push(`+ ${key}`);
    else if (!b.has(key)) changes.push(`- ${key}`);
    else if (a.get(key) !== b.get(key)) changes.push(`~ ${key}`);
    if (changes.length >= 20) break;
  }
  return changes;
}

function assertTreesEqual(label, a, b) {
  const diff = diffSnapshots(a, b);
  if (diff.length) {
    throw new Error(`${label} differs:\n${diff.join('\n')}`);
  }
}

function assertFileEqual(source, generated) {
  if (!existsSync(source) || !existsSync(generated)) {
    throw new Error(`Missing source/generated file pair: ${source} -> ${generated}`);
  }
  if (hashFile(source) !== hashFile(generated)) {
    throw new Error(`Generated file is not identical to canonical input: ${generated}`);
  }
}

const legacyRootJsPath = resolve(root, 'js');
if (existsSync(legacyRootJsPath)) {
  throw new Error('Unsupported root-level js/ tree exists. TypeScript output belongs only in build/js; remove root js/.');
}

const buildPath = resolve(root, 'build');
const docsPath = resolve(root, 'docs');
const beforeBuild = checkCommitted ? snapshotTree(buildPath) : null;
const beforeDocs = checkCommitted ? snapshotTree(docsPath) : null;

if (checkCommitted && (beforeBuild === null || beforeDocs === null)) {
  throw new Error('Committed build/ and docs/ trees are required for reproducibility verification. Run npm run build and commit them.');
}

execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], { cwd: root, stdio: 'inherit' });

if (existsSync(legacyRootJsPath)) {
  throw new Error('Build unexpectedly created unsupported root-level js/ output.');
}

const afterBuild = snapshotTree(buildPath);
const afterDocs = snapshotTree(docsPath);

assertTreesEqual('build/js and docs/js', snapshotTree(resolve(root, 'build/js')), snapshotTree(resolve(root, 'docs/js')));
assertTreesEqual('data and docs/data', snapshotTree(resolve(root, 'data')), snapshotTree(resolve(root, 'docs/data')));
assertFileEqual(resolve(root, 'site/index.html'), resolve(root, 'docs/index.html'));
assertFileEqual(resolve(root, 'site/styles.css'), resolve(root, 'docs/styles.css'));

const noJekyll = resolve(root, 'docs/.nojekyll');
if (!existsSync(noJekyll) || !statSync(noJekyll).isFile()) {
  throw new Error('docs/.nojekyll is missing from generated deployment output.');
}

if (checkCommitted) {
  const buildDiff = diffSnapshots(beforeBuild, afterBuild);
  const docsDiff = diffSnapshots(beforeDocs, afterDocs);
  if (buildDiff.length || docsDiff.length) {
    const details = [
      ...(buildDiff.length ? ['build/:', ...buildDiff] : []),
      ...(docsDiff.length ? ['docs/:', ...docsDiff] : []),
    ];
    throw new Error(
      `Generated artifacts were stale before the build. Re-run npm run build and commit the generated output.\n${details.join('\n')}`,
    );
  }
}

console.log('Generated artifacts are reproducible from canonical src/, site/, and data/ inputs.');
