import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
let n = 0;
for (const k of Object.keys(a)) {
  const x = a[k], y = b[k];
  if (!y) { console.log('MISSING', k); n++; continue; }
  for (const part of Object.keys(x)) {
    const s1 = JSON.stringify(x[part]), s2 = JSON.stringify(y[part]);
    if (s1 === s2) continue;
    n++;
    if (Array.isArray(x[part])) {
      const gone = x[part].filter((v) => !y[part].includes(v)), added = y[part].filter((v) => !x[part].includes(v));
      console.log(`${k} · ${part}: ${gone.length ? `- ${JSON.stringify(gone)} ` : ''}${added.length ? `+ ${JSON.stringify(added)}` : ''}${!gone.length && !added.length ? '(order/count differs)' : ''}`);
    } else console.log(`${k} · ${part}: ${s1} → ${s2}`);
  }
}
console.log(`\n${Object.keys(a).length} pages compared, ${n} differences`);
