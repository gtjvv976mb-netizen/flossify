// Compare two snap-record runs as multisets (order ignored), and gather each difference over the pages and roles it
// appears on: "part: - removed / + added   (pages)". node cmp2.mjs a.json b.json
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
const diffs = new Map(); // key "part|sign|value" → [pages]
let orderOnly = 0;
for (const k of Object.keys(a)) {
  const x = a[k], y = b[k];
  if (!y) { console.log('MISSING', k); continue; }
  for (const part of Object.keys(x)) {
    if (JSON.stringify(x[part]) === JSON.stringify(y[part])) continue;
    if (!Array.isArray(x[part])) { const key = `${part}|~|${x[part]} → ${y[part]}`; diffs.set(key, [...(diffs.get(key) ?? []), k]); continue; }
    const cx = count(x[part]), cy = count(y[part]);
    let any = false;
    for (const v of new Set([...cx.keys(), ...cy.keys()])) {
      const d = (cy.get(v) ?? 0) - (cx.get(v) ?? 0);
      if (!d) continue;
      any = true;
      const key = `${part}|${d > 0 ? '+' : '-'}${Math.abs(d) > 1 ? Math.abs(d) + '×' : ''}|${v}`;
      diffs.set(key, [...(diffs.get(key) ?? []), k]);
    }
    if (!any) orderOnly++;
  }
}
const pages = Object.keys(a).length;
const byPart = {};
for (const [key, where] of diffs) { const [part, sign, v] = key.split('|'); (byPart[part] ??= []).push({ sign, v, where }); }
for (const part of Object.keys(byPart)) {
  console.log(`\n== ${part}`);
  for (const d of byPart[part].sort((p, q) => p.v.localeCompare(q.v) || p.sign.localeCompare(q.sign))) {
    const roles = [...new Set(d.where.map((w) => w.split(' ')[0]))];
    const pgs = [...new Set(d.where.map((w) => w.split(' ').slice(2).join(' ')))];
    console.log(`  ${d.sign.padEnd(4)} ${d.v.slice(0, 120).padEnd(120)} ${d.where.length}× [${roles.length === 7 ? 'all roles' : roles.join(',')}] {${pgs.join(',')}}`);
  }
}
console.log(`\n${pages} pages; ${orderOnly} parts differ in order only`);
