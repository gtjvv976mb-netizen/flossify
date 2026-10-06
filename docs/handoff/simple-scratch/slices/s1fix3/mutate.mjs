// Mutation test of scripts/dev/record-tabs-check.mjs on a copy of the tree (never the worktree).
// Each mutation makes one name wrong; the check must exit 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const M = process.env.MUT_TREE;
const P = 'src/pages/c/[clinic]/patients/[patient].astro';
const R = 'src/pages/c/[clinic]/patients/_record';
const MUT = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const run = () => spawnSync('node', ['--experimental-strip-types', '--no-warnings', '--import', './scripts/ts-register.mjs', 'scripts/dev/record-tabs-check.mjs'], { cwd: M, encoding: 'utf8' });
let caught = 0, missed = 0, bad = 0;
for (const [id, file0, from, to, note] of MUT) {
  const file = file0.replace('$P', P).replace('$R', R);
  const path = `${M}/${file}`;
  const orig = readFileSync(path, 'utf8');
  if (!orig.includes(from)) { console.log(`?? ${id}: pattern not found in ${file}`); bad++; continue; }
  const n = orig.split(from).length - 1;
  writeFileSync(path, orig.replace(from, to));
  const r = run();
  writeFileSync(path, orig);
  const fails = (r.stdout.match(/✗ .*/g) ?? []).map((s) => s.slice(0, 160));
  if (r.status === 1) { caught++; console.log(`caught ${id} (${n} occurrence${n > 1 ? 's, first changed' : ''}): ${fails[0] ?? ''}`); }
  else { missed++; console.log(`MISSED ${id}: exit ${r.status} — ${note ?? ''}\n   ${file}: ${JSON.stringify(from)} → ${JSON.stringify(to)}${r.stderr ? '\n   stderr: ' + r.stderr.slice(0, 300) : ''}`); }
}
console.log(`\n${caught} caught, ${missed} missed, ${bad} not applied`);
const check = run(); console.log('clean tree after:', check.status === 0 ? 'passes' : 'FAILS');
