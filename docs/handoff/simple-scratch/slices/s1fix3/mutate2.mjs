// Like mutate.mjs, but each case is several replacements in one or more files: [id, [[file, from, to], ...], note].
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const M = process.env.MUT_TREE;
const MUT = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const run = () => spawnSync('node', ['--experimental-strip-types', '--no-warnings', '--import', './scripts/ts-register.mjs', 'scripts/dev/record-tabs-check.mjs'], { cwd: M, encoding: 'utf8' });
let caught = 0, missed = 0, bad = 0;
for (const [id, edits, note] of MUT) {
  const origs = new Map();
  let ok = true;
  for (const [file, from, to] of edits) {
    const path = `${M}/${file}`;
    const cur = readFileSync(path, 'utf8');
    if (!origs.has(path)) origs.set(path, cur);
    if (!cur.includes(from)) { console.log(`?? ${id}: pattern not found in ${file}: ${from.slice(0, 60)}`); ok = false; break; }
    writeFileSync(path, cur.replace(from, to));
  }
  const r = ok ? run() : null;
  for (const [p, s] of origs) writeFileSync(p, s);
  if (!ok) { bad++; continue; }
  const fails = (r.stdout.match(/✗ .*/g) ?? []).map((s) => s.slice(0, 170));
  if (r.status === 1) { caught++; console.log(`caught ${id}: ${fails[0] ?? r.stderr.slice(0, 200)}`); }
  else { missed++; console.log(`MISSED ${id}: exit ${r.status} — ${note}${r.stderr ? '\n   stderr: ' + r.stderr.slice(0, 200) : ''}`); }
}
console.log(`\n${caught} caught, ${missed} missed, ${bad} not applied`);
console.log('clean tree after:', run().status === 0 ? 'passes' : 'FAILS');
