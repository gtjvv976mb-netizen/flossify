// The words check (plan item 1.8; docs/glossary.md, "For the developer: the words check"): reads the words people
// see (extract.mjs), looks for every retired wording in the glossary's rule table (rules.mjs), and compares what it
// finds with the list of places that still have one (known.json): "allowed" (a legitimate other meaning or fixed
// words, with why) and "todo" (still to sweep, with the plan item that will). Anything else fails, and so does a
// listed place that is gone, until it is taken off the list.
//
//   npm run test:words                                the check, with the reader's and the rules' own tests
//   npm run words:prune                               take what is gone off known.json (the same as --prune)
//   node scripts/dev/words/check.mjs                  the check alone: exit 1 on a new match or a stale entry
//   node scripts/dev/words/check.mjs --prune          rewrite known.json without what is gone (never adds)
//   node scripts/dev/words/check.mjs --json           every current match with its classification, as JSON
//   node scripts/dev/words/check.mjs --files a b …    probe files anywhere against the rules, without known.json
//   node scripts/dev/words/check.mjs --rules          the rule table
//   node scripts/dev/words/check.mjs --fixed          the files it never reads (legal, clinical and printed words),
//                                                     each with why: FIXED in extract.mjs, re-exported here
// Exit 2: the check could not run (an option it does not know, a file it cannot read, a known.json it cannot use).
//
// known.json holds two lists of { file, rule, text, count, … }: `text` is the string as the check prints it, and
// `count` how many times it is there (a whole number, at least 1). An allowed entry has a one-line `why`; a todo has
// the plan `item` that sweeps it, and may have a `note` for that sweep. A new retired word: say what the glossary
// says instead. A legitimate other meaning: add it to "allowed" with its why and count, and the test passes. Never
// add a todo to hide a new use.
import { readFileSync, writeFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { relative, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FIXED, listFiles, extract, extractFile } from './extract.mjs';
import { RULES, matches } from './rules.mjs';

export { FIXED };

export const KNOWN_PATH = fileURLToPath(new URL('./known.json', import.meta.url));
const RULE = new Map(RULES.map((r) => [r.id, r]));
/** One order on every machine, whatever its locale. */
export const collate = new Intl.Collator('en').compare;
const collateNumeric = new Intl.Collator('en', { numeric: true }).compare;

/** Every rule match in the given files' visible strings: [{ file, line, rule, kind, text }]. A string read whole
 *  from pieces (a joined text, a way a template or a '+' chain reads: its `covers`) counts only when the same rule
 *  matched none of the pieces it is made of, and none of the ways read before it. */
export function matchItems(file, items) {
  const out = [];
  for (const rule of RULES) {
    if (rule.files && !rule.files.test(file)) continue;
    const hit = items.map((it) => matches(rule, it.text));
    items.forEach((it, i) => {
      if (!hit[i]) return;
      if (it.covers?.some((c) => hit[c])) return;
      out.push({ file, line: it.line, rule: rule.id, kind: it.kind, text: it.text });
    });
  }
  return out;
}

/** Scan the repository (or the given repository paths). */
export function scan(files = listFiles()) {
  let strings = 0;
  const found = [];
  for (const file of files) {
    const items = extractFile(file);
    strings += items.length;
    found.push(...matchItems(file, items));
  }
  found.sort((a, b) => collate(a.file, b.file) || a.line - b.line || collate(a.rule, b.rule));
  return { files: files.length, strings, found };
}

/** What is wrong with known.json's entries, as sentences naming each entry (none: it can be used). */
export function knownProblems(known) {
  const problems = [];
  for (const list of ['allowed', 'todo']) {
    if (!Array.isArray(known?.[list])) { problems.push(`"${list}" is not a list`); continue; }
    known[list].forEach((e, i) => {
      const at = `${list}[${i}] ${e?.file ?? '(no file)'} [${e?.rule ?? '(no rule)'}] ${JSON.stringify(e?.text ?? '')}`;
      for (const k of ['file', 'rule', 'text']) if (typeof e?.[k] !== 'string' || !e[k]) problems.push(`${at}: no ${k}`);
      if (typeof e?.rule === 'string' && !RULE.has(e.rule)) problems.push(`${at}: there is no rule ${e.rule} (node scripts/dev/words/check.mjs --rules)`);
      if (!Number.isInteger(e?.count) || e.count < 1) problems.push(`${at}: "count" must be a whole number of at least 1, how many times the text is there`);
      if (list === 'allowed' && !(typeof e?.why === 'string' && e.why.length > 10)) problems.push(`${at}: an allowed entry needs a one-line "why"`);
      if (list === 'todo' && !(typeof e?.item === 'string' && /^\d+\.\d+$/.test(e.item))) problems.push(`${at}: a todo needs the plan "item" that sweeps it, like "1.29"`);
    });
  }
  return problems;
}

/** known.json, refused with every problem named when an entry cannot be used. */
export function readKnown(path = KNOWN_PATH) {
  if (!existsSync(path)) return { allowed: [], todo: [] };
  let known;
  try { known = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { throw new Error(`words check: ${relative(ROOT, path)} is not JSON (${e.message})`); }
  const problems = knownProblems(known);
  if (problems.length) throw new Error(`words check: ${relative(ROOT, path)} has entries it cannot use:\n  ${problems.join('\n  ')}`);
  return known;
}

const keyOf = (e) => `${e.file}\u0000${e.rule}\u0000${e.text}`;

/** Compare the matches with known.json: what is new, what is stale, and how each current match is classified. */
export function compare(found, known) {
  const listed = new Map(); // key → { allowed, todo, entries }
  for (const [list, entries] of [['allowed', known.allowed ?? []], ['todo', known.todo ?? []]]) {
    for (const e of entries) {
      const k = keyOf(e);
      const l = listed.get(k) ?? { allowed: 0, todo: 0, entries: [] };
      l[list] += e.count; l.entries.push({ list, ...e });
      listed.set(k, l);
    }
  }
  const byKey = new Map();
  for (const m of found) { const k = keyOf(m); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(m); }
  const fresh = [];      // { matches, listed }: more of this text than the list allows
  const stale = [];      // { entries, found }: fewer than listed
  const classified = []; // every match with its list
  for (const [k, ms] of byKey) {
    const l = listed.get(k);
    const allowed = l?.allowed ?? 0, todo = l?.todo ?? 0;
    if (ms.length > allowed + todo) fresh.push({ matches: ms, listed: allowed + todo });
    ms.forEach((m, i) => classified.push({ ...m, as: i < allowed ? 'allowed' : i < allowed + todo ? 'todo' : 'new',
      why: l?.entries.find((e) => e.list === 'allowed')?.why, item: l?.entries.find((e) => e.list === 'todo')?.item }));
  }
  for (const [k, l] of listed) {
    const n = byKey.get(k)?.length ?? 0;
    if (n < l.allowed + l.todo) stale.push({ entries: l.entries, found: n });
  }
  return { fresh, stale, classified };
}

/** known.json without what is gone: counts lowered and empty entries dropped, never anything added. */
export function pruned(known, found) {
  const left = new Map();
  for (const m of found) left.set(keyOf(m), (left.get(keyOf(m)) ?? 0) + 1);
  const take = (entries) => entries.map((e) => {
    const k = keyOf(e), have = left.get(k) ?? 0, count = Math.min(e.count, have);
    left.set(k, have - count);
    return { ...e, count };
  }).filter((e) => e.count > 0);
  // What is still there counts as allowed first, so what went is a todo: a sweep takes away a todo, not a
  // legitimate use.
  const allowed = take(known.allowed ?? []);
  const todo = take(known.todo ?? []);
  return { allowed, todo };
}

export const order = (a, b) => collate(a.file, b.file) || collate(a.rule, b.rule) || collate(a.text, b.text);

/** known.json as written: sorted by file then rule, two-space indented, one entry per line. */
export function formatKnown(known) {
  const line = (e) => '    ' + JSON.stringify(e);
  const list = (entries) => entries.length ? `[\n${[...entries].sort(order).map(line).join(',\n')}\n  ]` : '[]';
  return `{\n  "allowed": ${list(known.allowed ?? [])},\n  "todo": ${list(known.todo ?? [])}\n}\n`;
}

const quote = (t) => `“${t.length > 140 ? `${t.slice(0, 137)}…` : t}”`;
const sayLine = (m) => `${m.file}:${m.line} [${m.rule}] ${quote(m.text)} → say: ${RULE.get(m.rule).say} (docs/glossary.md)`;

/** The report for a failing comparison, as lines. */
export function report({ fresh, stale }) {
  const lines = [];
  for (const f of fresh) {
    for (const m of f.matches) lines.push(sayLine(m) + (f.listed ? ` (${f.matches.length} here, ${f.listed} listed in known.json)` : ''));
  }
  for (const s of stale) {
    const e = s.entries[0];
    const listed = s.entries.reduce((n, x) => n + x.count, 0);
    lines.push(`${e.file} [${e.rule}] ${quote(e.text)}: known.json lists ${listed}, found ${s.found}. If it was swept or `
      + `moved, take it off the list: npm run words:prune`);
  }
  return lines;
}

export function summary({ files, strings }, known, { fresh, stale }) {
  const allowed = (known.allowed ?? []).reduce((n, e) => n + e.count, 0);
  const byItem = new Map();
  for (const e of known.todo ?? []) byItem.set(e.item, (byItem.get(e.item) ?? 0) + e.count);
  const items = [...byItem].sort((a, b) => collateNumeric(String(a[0]), String(b[0])))
    .map(([i, n]) => `${i} ${n}`).join(', ');
  const bad = fresh.reduce((n, f) => n + f.matches.length - f.listed, 0);
  return `words check: ${files} files, ${strings} strings read; ${allowed} allowed; to sweep by plan item: ${items || 'none'}`
    + (bad || stale.length ? `; ${bad} new, ${stale.length} stale` : '; nothing new');
}

const USAGE = 'usage: node scripts/dev/words/check.mjs [--prune | --json | --rules | --fixed | --files <file> …] (see its header)';
const FLAGS = new Set(['--prune', '--json', '--rules', '--fixed', '--files']);

/** Refused before anything runs: exit 2 with one sentence. */
class Usage extends Error {}

function probe(paths) {
  if (!paths.length) throw new Usage('--files needs at least one file');
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
    if (!existsSync(abs)) throw new Usage(`${p}: no such file`);
    if (statSync(abs).isDirectory()) throw new Usage(`${p} is a folder: name the files in it`);
  }
  let n = 0;
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
    const shown = abs.startsWith(ROOT) ? relative(ROOT, abs) : abs;
    const items = extract(abs, readFileSync(abs, 'utf8'));
    for (const m of matchItems(shown, items).sort((a, b) => a.line - b.line)) { console.log(sayLine(m)); n++; }
  }
  console.log(`${n} match${n === 1 ? '' : 'es'} in ${paths.length} file${paths.length === 1 ? '' : 's'} (known.json not read)`);
  return 0;
}

function main(argv) {
  const at = argv.indexOf('--files');
  const flags = at >= 0 ? argv.slice(0, at + 1) : argv;
  const bad = flags.find((a) => !FLAGS.has(a));
  if (bad) throw new Usage(bad.startsWith('-') ? `unknown option ${bad}` : `unexpected ${bad} (to probe files, put them after --files)`);
  if (at >= 0) {
    const rest = argv.slice(at + 1);
    const opt = rest.find((a) => a.startsWith('--'));
    if (opt) throw new Usage(`${opt} cannot follow --files: put the options first`);
    return probe(rest);
  }
  if (argv.includes('--rules')) {
    const w = Math.max(...RULES.map((r) => r.id.length));
    for (const r of RULES) console.log(`${r.id.padEnd(w)}  ${String(r.item ?? '—').padEnd(5)}  ${r.re}${r.except ? `  except ${r.except}` : ''}\n${' '.repeat(w + 9)}say: ${r.say}`);
    return 0;
  }
  if (argv.includes('--fixed')) {
    for (const f of FIXED) console.log(`${f.glob}${f.bar ? '   (its screen bar is read)' : ''}\n    ${f.why}`);
    return 0;
  }
  const result = scan();
  const known = readKnown();
  const cmp = compare(result.found, known);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(cmp.classified.sort((a, b) => collate(a.file, b.file) || a.line - b.line), null, 1));
    return cmp.fresh.length || cmp.stale.length ? 1 : 0;
  }
  if (argv.includes('--prune')) {
    const next = pruned(known, result.found);
    writeFileSync(KNOWN_PATH, formatKnown(next));
    const was = known.allowed.length + known.todo.length, now = next.allowed.length + next.todo.length;
    console.log(`known.json: ${was} entries → ${now} (${cmp.stale.length} stale taken off or lowered; nothing added)`);
    const after = compare(result.found, next);
    for (const l of report({ fresh: after.fresh, stale: [] })) console.log(l);
    console.log(summary(result, next, after));
    return after.fresh.length ? 1 : 0;
  }
  for (const l of report(cmp)) console.log(l);
  console.log(summary(result, known, cmp));
  return cmp.fresh.length || cmp.stale.length ? 1 : 0;
}

/** True when this file is the one node was asked to run, even through a symbolic link. */
const isMain = () => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
};

if (isMain()) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) {
    if (e instanceof Usage) { console.error(`words check: ${e.message}\n${USAGE}`); process.exitCode = 2; }
    else if (/^words check: /.test(e.message)) { console.error(e.message); process.exitCode = 2; }
    else throw e;
  }
}
