import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelPaths = [
  resolve(root, 'data/ti2026-statistical-model.json'),
  resolve(root, 'data/ti2026-group-stage-statistical-model.json'),
];
const titlePath = resolve(root, 'data/ti2026-title-model.json');

for (const modelPath of modelPaths) {
  if (!existsSync(modelPath)) {
    throw new Error(`Required ${modelPath.replace(`${root}/`, '')} is missing. Refusing to build a zero-data site.`);
  }
}
if (!existsSync(titlePath)) {
  throw new Error('Required data/ti2026-title-model.json is missing. Refusing to build without title estimates.');
}

function validateStatisticalModelFile(modelPath) {
  const model = JSON.parse(readFileSync(modelPath, 'utf8'));
  const label = modelPath.replace(`${root}/`, '');
  for (const key of ['levels', 'roles', 'gcorr']) {
    if (!(key in model)) throw new Error(`${label} is missing required top-level key: ${key}`);
  }
  if (!Array.isArray(model.levels) || model.levels.length !== 104 || model.levels.some(x => !Number.isFinite(x))) {
    throw new Error(`${label} percentile ladder is incomplete or non-finite.`);
  }
  if (model.levels.some((x, i) => i > 0 && x <= model.levels[i - 1])) {
    throw new Error(`${label} percentile ladder is not strictly increasing.`);
  }
  for (const role of ['Core', 'Mid', 'Support']) {
    const r = model.roles?.[role];
    const c = model.gcorr?.[role];
    if (!r?.teams?.length || !r?.stats?.length || !r?.cells) {
      throw new Error(`${label} ${role} data is incomplete.`);
    }
    if (!c?.stats?.length || !Array.isArray(c.m) || c.m.length !== c.stats.length) {
      throw new Error(`${label} ${role} correlation matrix is incomplete.`);
    }
    const statKeys = new Set(r.stats.map(stat => stat.k));
    if (c.stats.some(stat => !statKeys.has(stat))) {
      throw new Error(`${label} ${role} correlation matrix references an unknown stat.`);
    }
    for (let i = 0; i < c.m.length; i++) {
      const row = c.m[i];
      if (!Array.isArray(row) || row.length !== c.stats.length || row.some(x => !Number.isFinite(x))) {
        throw new Error(`${label} ${role} correlation matrix is non-square or non-finite.`);
      }
      if (Math.abs(row[i] - 1) > 1e-9) throw new Error(`${label} ${role} correlation diagonal is invalid.`);
      for (let j = 0; j < i; j++) {
        if (Math.abs(row[j] - c.m[j][i]) > 1e-9) throw new Error(`${label} ${role} correlation matrix is not symmetric.`);
      }
    }
    for (const stat of r.stats) {
      const cells = r.cells[stat.k];
      if (!cells) throw new Error(`${label} ${role}/${stat.k} cells are missing.`);
      for (const team of r.teams) {
        const cell = cells[team];
        if (!cell || !Array.isArray(cell.q) || cell.q.length !== model.levels.length || cell.q.some(x => !Number.isFinite(x)) || !Number.isFinite(cell.e)) {
          throw new Error(`${label} ${role}/${stat.k}/${team} quantile ladder/effective sample is incomplete or non-finite.`);
        }
      }
    }
  }
}
for (const modelPath of modelPaths) validateStatisticalModelFile(modelPath);

const titles = JSON.parse(readFileSync(titlePath, 'utf8'));
if (titles.schemaVersion !== 1) throw new Error('Unsupported title model schema version.');
if (!Array.isArray(titles.prefixes) || titles.prefixes.length !== 8) {
  throw new Error('Title model must contain the eight title prefixes.');
}
if (!Array.isArray(titles.suffixes) || !titles.suffixes.some((s) => s.id === titles.fixedSuffixId)) {
  throw new Error('Title model fixed suffix is invalid.');
}
for (const role of ['core', 'mid', 'support']) {
  const byTeam = titles.prefixBoostPctByRoleTeam?.[role];
  if (!byTeam || Object.keys(byTeam).length !== 16) {
    throw new Error(`Title model ${role} table must contain 16 teams.`);
  }
  for (const [team, row] of Object.entries(byTeam)) {
    for (const prefix of titles.prefixes) {
      if (!Number.isFinite(row[prefix.id])) {
        throw new Error(`Title model is missing ${role}/${team}/${prefix.id}.`);
      }
    }
  }
}

// M6E production thresholds are generated from the frozen M6D certification artifacts.
execFileSync(process.execPath, [resolve(root, 'scripts/generate-m6e-policy.mjs')], { cwd: root, stdio: 'inherit' });

rmSync(resolve(root, 'build'), { recursive: true, force: true });
rmSync(resolve(root, 'docs'), { recursive: true, force: true });
mkdirSync(resolve(root, 'docs/js'), { recursive: true });

const tscPath = resolve(root, 'node_modules/typescript/bin/tsc');
execFileSync(process.execPath, [tscPath, '-p', resolve(root, 'tsconfig.json')], {
  stdio: 'inherit',
});

cpSync(resolve(root, 'build/js'), resolve(root, 'docs/js'), { recursive: true });
cpSync(resolve(root, 'site/index.html'), resolve(root, 'docs/index.html'));
cpSync(resolve(root, 'site/styles.css'), resolve(root, 'docs/styles.css'));
cpSync(resolve(root, 'site/screenshot-import.css'), resolve(root, 'docs/screenshot-import.css'));
cpSync(resolve(root, 'data'), resolve(root, 'docs/data'), { recursive: true });
writeFileSync(resolve(root, 'docs/.nojekyll'), '');

console.log('Built static site in docs/ from canonical src/, site/, and data/ inputs.');
