import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = resolve(root, 'data/ti2026-statistical-model.json');
const titlePath = resolve(root, 'data/ti2026-title-model.json');

if (!existsSync(modelPath)) {
  throw new Error('Required data/ti2026-statistical-model.json is missing. Refusing to build a zero-data site.');
}
if (!existsSync(titlePath)) {
  throw new Error('Required data/ti2026-title-model.json is missing. Refusing to build without title estimates.');
}

const model = JSON.parse(readFileSync(modelPath, 'utf8'));
for (const key of ['levels', 'roles', 'gcorr']) {
  if (!(key in model)) throw new Error(`Statistical model is missing required top-level key: ${key}`);
}
if (!Array.isArray(model.levels) || model.levels.length !== 104) {
  throw new Error('Statistical model percentile ladder is incomplete.');
}
for (const role of ['Core', 'Mid', 'Support']) {
  const r = model.roles?.[role];
  const c = model.gcorr?.[role];
  if (!r?.teams?.length || !r?.stats?.length || !r?.cells) {
    throw new Error(`Statistical model ${role} data is incomplete.`);
  }
  if (!c?.stats?.length || !Array.isArray(c.m) || c.m.length !== c.stats.length) {
    throw new Error(`Statistical model ${role} correlation matrix is incomplete.`);
  }
  for (const stat of r.stats) {
    const cells = r.cells[stat.k];
    if (!cells) throw new Error(`Statistical model ${role}/${stat.k} cells are missing.`);
    for (const team of r.teams) {
      const cell = cells[team];
      if (!cell || !Array.isArray(cell.q) || cell.q.length !== model.levels.length) {
        throw new Error(`Statistical model ${role}/${stat.k}/${team} quantile ladder is incomplete.`);
      }
    }
  }
}

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
cpSync(resolve(root, 'data'), resolve(root, 'docs/data'), { recursive: true });
writeFileSync(resolve(root, 'docs/.nojekyll'), '');

console.log('Built static site in docs/ from canonical src/, site/, and data/ inputs.');