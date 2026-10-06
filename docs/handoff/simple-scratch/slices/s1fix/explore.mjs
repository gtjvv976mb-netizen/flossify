import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
const ROOT = '/home/user/fl-simple/';
const start = join(ROOT, 'src/pages/c/[clinic]/patients/[patient].astro');
const seen = new Set();
const q = [start];
while (q.length) {
  const f = q.pop(); if (seen.has(f)) continue; seen.add(f);
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    let p = resolve(dirname(f), m[1]);
    const cands = [p, p + '.ts', p + '.astro', p + '/index.ts'];
    const hit = cands.find((c) => existsSync(c) && !c.endsWith('/') && /\.(ts|astro|mjs)$/.test(c));
    if (hit) q.push(hit);
  }
}
const files = [...seen].map((f) => relative(ROOT, f)).sort();
console.log(files.length, 'files'); console.log(files.join('\n'));
for (const rel of files) {
  let src = readFileSync(join(ROOT, rel), 'utf8');
  src = src.replace(/<style[\s\S]*?<\/style>/g, (s) => s.replace(/[^\n]/g, ' '));
  const lines = src.split('\n');
  lines.forEach((l, i) => { for (const m of l.matchAll(/#(?:[a-z]|\$\{)/g)) console.log(`${rel}:${i + 1}: ${l.trim().slice(0, 200)}`); });
}
