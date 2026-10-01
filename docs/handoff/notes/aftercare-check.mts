import { AFTERCARE, aftercareText, isGsm, kindForCatalog } from '/home/user/flossify/.claude/worktrees/agent-ac72e4ae8b0293a5f/src/lib/aftercare.ts';

const name30 = 'Baguio Pines Family Dental Care'.slice(0, 30);
if (name30.length !== 30) throw new Error(`name is ${name30.length}`);
let bad = 0;
console.log('kind                 hours  len  gsm    link   reply-ask');
for (const [kind, sheet] of Object.entries(AFTERCARE)) {
  const t = aftercareText(kind as any, { name: name30, phone: '0917 000 0000' });
  const t0 = aftercareText(kind as any, { name: name30, phone: null });
  const link = /https?:|www\.|\.(ph|com|net)\b/i.test(t);
  const reply = /\breply\b|\btext back\b|\brespond\b/i.test(t);
  const ok = t.length <= 300 && isGsm(t) && !link && !reply && t0.length <= 300 && isGsm(t0);
  if (!ok) bad++;
  console.log(`${kind.padEnd(20)} ${String(sheet.hours).padEnd(6)} ${String(t.length).padEnd(4)} ${String(isGsm(t)).padEnd(6)} ${String(link).padEnd(6)} ${reply}`);
  for (const lang of ['en', 'fil'] as const) for (const list of ['do', 'avoid', 'call'] as const) {
    const n = sheet[lang][list].length;
    if (n < 4 || n > 8) { bad++; console.log(`  !! ${kind}.${lang}.${list} has ${n} lines`); }
  }
}
console.log('\nno-phone sample:', aftercareText('extraction', { name: 'Session Road Dental', phone: null }));
console.log('curly name:', aftercareText('filling', { name: 'Dr. Tabanao’s Clinic – Baguio', phone: '+639170000000' }));
console.log('isGsm("₱") =', isGsm('₱'), ' isGsm("’") =', isGsm('’'), ' isGsm(plain) =', isGsm('Call 0917 000 0000.'));

const cases: [string | null, string | null, string | null, string | null][] = [
  ['extraction', 'Extraction', 'surgery', 'extraction'],
  ['wisdom', 'Wisdom tooth removal', 'surgery', 'surgical_extraction'],
  ['rootcanal', 'Root canal', 'restore', 'root_canal'],
  ['restoration', 'Filling', 'restore', 'filling'],
  ['prophylaxis', 'Cleaning', 'prevent', 'cleaning'],
  ['crown', 'Crown', 'restore', 'crown'],
  ['bridge', 'Fixed bridge', 'replace', 'crown'],
  ['veneers', 'Veneers', 'cosmetic', 'crown'],
  ['dentures', 'Dentures', 'replace', 'denture'],
  ['braces', 'Braces', 'ortho', 'braces_adjustment'],
  ['whitening', 'Whitening', 'cosmetic', 'whitening'],
  ['consultation', 'Consultation', 'prevent', null],
  ['xray', 'Dental X-ray', 'prevent', null],
  ['fluoride', 'Fluoride varnish', 'prevent', null],
  ['sealant', 'Pit & fissure sealant', 'prevent', null],
  ['EXO-01', 'Bunot (simple)', 'surgery', 'extraction'],
  ['surg1', 'Surgical extraction, impacted', 'surgery', 'surgical_extraction'],
  ['rct2', 'RCT anterior', 'restore', 'root_canal'],
  ['endo', 'Endodontic treatment', 'restore', 'root_canal'],
  ['comp', 'Composite pasta', 'restore', 'filling'],
  ['op', 'Oral prophylaxis', 'prevent', 'cleaning'],
  ['scal', 'Deep scaling', 'prevent', 'cleaning'],
  ['jc', 'Porcelain jacket crown', 'restore', 'crown'],
  ['cv', 'Composite veneer', 'cosmetic', 'crown'],
  ['pd', 'Partial pustiso', 'replace', 'denture'],
  ['dc', 'Denture cleaning', 'replace', 'denture'],
  ['oa', 'Orthodontic adjustment', 'ortho', 'braces_adjustment'],
  ['adj', 'Monthly adjustment', 'ortho', 'braces_adjustment'],
  ['bl', 'Bleaching (in-office)', 'cosmetic', 'whitening'],
  ['imp', 'Implant', 'replace', null],
  ['fren', 'Frenectomy', 'surgery', null],
  [null, null, null, null],
  ['', '', 'restore', null],
];
for (const [code, name, cat, want] of cases) {
  const got = kindForCatalog(code, name, cat);
  if (got !== want) { bad++; console.log(`  !! kindForCatalog(${code}, ${name}, ${cat}) = ${got}, wanted ${want}`); }
}
console.log(`\nkindForCatalog: ${cases.length} cases checked`);
console.log(bad ? `FAIL: ${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);
