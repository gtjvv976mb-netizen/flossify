// The record's four tabs: every name that can pick what the patient record shows first must resolve to one of
// them through TAB_OF (src/pages/c/[clinic]/patients/_record/sections.ts). A name that does not would land a person
// on the wrong tab, or on nothing, without a word — so this fails, naming the value and where it came from.
//
//   npm run test:record-tabs     (node --experimental-strip-types --import ./scripts/ts-register.mjs scripts/dev/record-tabs-check.mjs)
//   npm run test:record-tabs -- --list     (also every name found, with where it was read)
//
// What it reads:
//   - the maps themselves: ANCHOR, EXTRA_ANCHOR, both SECTION_OF (record.ts, record-extra.ts), SAVED_TO, SAVED_WORD,
//     OPEN_PANEL, the old sections (SECTION_META), every `back` a form may carry (backOf);
//   - the source, through a small lexer (below). An address of the record is known by its shape: /patients/${id}/, a
//     patients-list base and an id, a variable or a helper that holds or returns one (patientHref(id)), a parameter one
//     is passed to (withHash(record, h): `u` inside it), `action` in the record's components. What is written after
//     one is read the same however it is put together — a template, `+` (also `x += …` and .concat(…)), through a
//     conditional or a group (a + (c ? '&open=' + o : '') + '#' + h), after an origin — and in any page:
//       · every #hash (`patientHref(id) + '?from=close#money'`, `${action}#${back === 'chart' ? 'chart' : 'notes'}`),
//         ?saved= and ?open= (as literals, or followed: '#' + hash, `&open=${open}`, into every call's argument);
//       · code added after the address (`${record}${q}`, record + suffix): followed to its literals, each read as the
//         rest of that address; code it cannot follow fails (a URLSearchParams, an object's property);
//       · URL objects: `new URL(<address>, …)`, then u.hash = …, u.search = …, u.searchParams.set / append('open' |
//         'saved' | 'visit', …); on an object whose address it cannot tell, outside the record's own files, it fails;
//       · [record, 'x'].join('#') fails: an address put together that way is not read;
//     and every hash a script of the record sets (aimForm()'s `u.hash`, followed into its calls and data-pick-home);
//     every data-rec-go / data-rec-show (data-rec-go={a.go}: every value `go` is given, however written); every name
//     that picks a tab (every call of the page's show(), every tab looked up by its id rec-rec-<name>-tab, every
//     data-rec-panel); every `saved` and `section` record.ts and record-extra.ts give an Outcome (so every call of
//     done()); every section the page's `backTo` can hold;
//   - landingSection() over every combination of a post's section (every value `backTo` can take, read from the page),
//     back=chart, a saved word, a panel to open and a ?visit= (today's, another day's on the Treatment record, another
//     day's that is not, none);
//   - the inbound names the spec lists (§5), each on the tab §5 puts it on; and every §5 link another page writes,
//     pinned to its file (SPEC_SITES): a link the check stops reading there fails instead of going quiet.
// It is closed to what it cannot read: in the record's own files (the page, _record/, _ui/, and a component the page
// hands its address as `action`), a # it cannot place, or an expression whose names it cannot follow, fails — unless
// ALLOWED below says why that one is safe; elsewhere, an address named like a record's that it cannot read, code
// after a record's address that it cannot follow, and a write on a URL object it cannot place all fail. So a new way
// of writing an address is a failure to look at, not a route lost without a word. What it does not see: an address
// handed on whole inside an object or an array and put together later (a §5 link written that way fails its pin when
// it was the only one writing that name in its file).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REC = 'src/pages/c/[clinic]/patients';
const PAGE = `${REC}/[patient].astro`;
const S = await import(pathToFileURL(join(ROOT, REC, '_record/sections.ts')).href);
const R = await import(pathToFileURL(join(ROOT, 'src/lib/record.ts')).href);
const X = await import(pathToFileURL(join(ROOT, 'src/lib/record-extra.ts')).href);
const { TABS, TAB_OF, tabOf, SECTION_META, ANCHOR, SAVED_TO, SAVED_WORD, recordSaved, OPEN_PANEL, backOf, landingSection } = S;

const TAB_IDS = ['overview', 'patient', 'chart', 'treatment-record'];
const fails = [];
let checked = 0;
const fail = (what, value, got) => fails.push(`${what}: ${JSON.stringify(value)}${got !== undefined ? ` → ${JSON.stringify(got)}` : ''}`);
/** A name resolves when TAB_OF takes it to one of the four tabs. */
const resolves = (what, name) => { checked++; const t = tabOf(name); if (!t || !TAB_IDS.includes(t)) fail(what, name, t); };
/** A #hash resolves the way the page reads one: the name, or a panel's id (rec-<name>). */
const hashResolves = (what, h) => { checked++; const t = tabOf(h) ?? tabOf(h.replace(/^rec-/, '')); if (!t || !TAB_IDS.includes(t)) fail(what, `#${h}`, t); };

// --- the tabs and the map --------------------------------------------------------------------------------------
if (TABS.length !== 4) fail('TABS: four tabs', TABS.map((t) => t.id));
if (JSON.stringify(TABS.map((t) => t.id)) !== JSON.stringify(TAB_IDS)) fail('TABS: overview, patient, chart, treatment-record in that order', TABS.map((t) => t.id));
for (const t of TABS) {
  if (TAB_OF[t.id] !== t.id) fail('TAB_OF: a tab is its own tab', t.id, TAB_OF[t.id]);
  if (!t.label || !t.short || !t.hue || !t.icon) fail('TABS: label, short, hue and icon', t.id);
}
for (const [k, v] of Object.entries(TAB_OF)) if (!TAB_IDS.includes(v)) fail(`TAB_OF.${k}`, v);
for (const k of Object.keys(SECTION_META)) resolves('an old section (SECTION_META)', k);

// --- the maps a post or a link lands through ------------------------------------------------------------------
for (const [k, v] of Object.entries(ANCHOR)) hashResolves(`ANCHOR[${k}]`, v);
for (const [k, v] of Object.entries(X.EXTRA_ANCHOR)) hashResolves(`EXTRA_ANCHOR[${k}]`, v);
for (const [k, v] of Object.entries(R.SECTION_OF)) resolves(`record.ts SECTION_OF[${k}]`, v);
for (const [k, v] of Object.entries(X.SECTION_OF)) resolves(`record-extra.ts SECTION_OF[${k}]`, v);
for (const [k, v] of Object.entries(SAVED_TO)) resolves(`SAVED_TO[${k}]`, v);
for (const [k, v] of Object.entries(SAVED_WORD)) resolves(`SAVED_WORD[${k}]`, v);
for (const [k, v] of Object.entries(OPEN_PANEL)) resolves(`OPEN_PANEL[${k}]`, v);
for (const i of [...R.RECORD_INTENTS, ...X.EXTRA_INTENTS]) {
  const section = R.SECTION_OF[i] ?? X.SECTION_OF[i];
  if (!section) fail('an intent with no section', i);
  // Where a saved post goes when the page's redirect names no literal hash: ANCHOR / EXTRA_ANCHOR, else the section.
  hashResolves(`the redirect of ${i}`, ANCHOR[i] ?? X.EXTRA_ANCHOR[i] ?? section);
}
const BACKS = [];
for (const b of ['chart', 'treatment', 'overview', 'patient', 'treatment-record', 'health', 'nonsense']) { const v = backOf(b); if (v) { resolves(`back=${b}`, v); BACKS.push(v); } }
if (backOf('chart') !== 'chart') fail('backOf: the palette\'s back=chart', 'chart', backOf('chart'));

// --- reading the source: a small lexer ---------------------------------------------------------------------------
// Every string and template literal (a template's ${…} is lexed in turn, so a literal inside one is a token of its
// own that knows the address written before it), and a mask of the source: the same length, with comments, regular
// expressions and the text of every literal blanked, so code — calls, definitions, brackets — is found without being
// fooled by what a string says. A quote that does not close on its line is text (an apostrophe in a page's words).
function lex(src, astro) {
  const n = src.length;
  const mask = src.split('');
  const tokens = [];
  const blank = (a, b) => { for (let k = a; k < b; k++) if (mask[k] !== '\n') mask[k] = ' '; };
  const str = (i, parent) => {
    const q = src[i];
    let j = i + 1;
    while (j < n && src[j] !== q) { if (src[j] === '\n') return null; j += src[j] === '\\' ? 2 : 1; }
    if (j >= n) return null;
    const t = { kind: 'str', start: i, end: j + 1, parts: [{ text: src.slice(i + 1, j), at: i + 1 }], parent };
    tokens.push(t); blank(i + 1, j);
    return t;
  };
  const regex = (i) => {
    let j = i + 1, cls = false;
    for (; j < n; j++) {
      const c = src[j];
      if (c === '\n') return 0;
      if (c === '\\') { j++; continue; }
      if (cls) { if (c === ']') cls = false; } else if (c === '[') cls = true; else if (c === '/') break;
    }
    if (j >= n || j === i + 1) return 0;
    j++;
    while (/[a-z]/.test(src[j] ?? '')) j++;
    return /^[\s,;.)\]}]?$/.test(src[j] ?? '') ? j : 0;
  };
  const tpl = (i, parent) => {
    const t = { kind: 'tpl', start: i, end: n, parts: [], parent };
    tokens.push(t);
    let j = i + 1, textAt = j;
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '$' && src[j + 1] === '{') {
        t.parts.push({ text: src.slice(textAt, j), at: textAt }); blank(textAt, j + 2);
        const e = code(j + 2, true, { tok: t, part: t.parts.length });
        t.parts.push({ expr: src.slice(j + 2, e), at: j + 2, end: e });
        blank(e, e + 1);
        j = e + 1; textAt = j;
        continue;
      }
      j++;
    }
    t.parts.push({ text: src.slice(textAt, j), at: textAt }); blank(textAt, j);
    t.end = Math.min(j + 1, n);
    return t;
  };
  // Code from i: to the end, or (inExpr) to the } that closes a template's ${.
  function code(i, inExpr, parent) {
    let depth = 0, prev = '';
    while (i < n) {
      const c = src[i];
      if (astro && src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); const end = e < 0 ? n : e + 3; blank(i, end); i = end; continue; }
      if (c === '/' && src[i + 1] === '/' && src[i - 1] !== ':') { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
      if (c === "'" || c === '"') { const t = str(i, parent); i = t ? t.end : i + 1; prev = c; continue; }
      if (c === '`') { i = tpl(i, parent).end; prev = '`'; continue; }
      if (c === '/' && src[i + 1] !== '>' && (prev === '' || '(,=:[!&|?;{}'.includes(prev))) { const e = regex(i); if (e) { blank(i + 1, e); i = e; prev = '/'; continue; } }
      if (inExpr) { if (c === '{') depth++; else if (c === '}') { if (depth === 0) return i; depth--; } }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
    return i;
  }
  code(0, false, null);
  return { mask: mask.join(''), tokens };
}

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(astro|ts|mjs)$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p); } };
walk(join(ROOT, 'src'));
const FILES = files.map((p) => {
  const src = readFileSync(p, 'utf8');
  // A page's <style> is CSS (colours, #ids): not an address.
  const body = src.replace(/<style[\s\S]*?<\/style>/g, (s) => s.replace(/[^\n]/g, ' '));
  const { mask, tokens } = lex(body, p.endsWith('.astro'));
  const lines = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lines.push(i + 1);
  return { rel: relative(ROOT, p), src: body, mask, tokens, tokAt: new Map(tokens.map((t) => [t.start, t])), lines };
});
const byRel = new Map(FILES.map((F) => [F.rel, F]));
const where = (F, i) => { let lo = 0, hi = F.lines.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F.lines[m] <= i) lo = m; else hi = m - 1; } return `${F.rel}:${lo + 1}`; };

// --- reading code backwards: what an expression writes before a place in it ---------------------------------------
// Each file's bracket pairs (from the mask, so no bracket in a literal or a comment counts; a stray one in a page's
// words is passed over), where each literal ends, and every template's ${…}.
for (const F of FILES) {
  F.openOf = new Map();
  const stack = [];
  for (let i = 0; i < F.mask.length; i++) {
    const c = F.mask[i];
    if (c === '(' || c === '[' || c === '{') stack.push(i);
    else if (c === ')' || c === ']' || c === '}') {
      const want = c === ')' ? '(' : c === ']' ? '[' : '{';
      let k = stack.length - 1;
      while (k >= 0 && F.mask[stack[k]] !== want) k--;
      if (k >= 0) { F.openOf.set(i, stack[k]); stack.length = k; }
    }
  }
  F.tokEnd = new Map(F.tokens.map((t) => [t.end, t]));
  F.spans = F.tokens.flatMap((t) => t.parts.flatMap((p, k) => (p.expr !== undefined ? [{ tok: t, part: k, at: p.at, end: p.end }] : [])));
}
const KEYWORDS = new Set(['return', 'typeof', 'void', 'delete', 'await', 'yield', 'new', 'in', 'of', 'instanceof', 'case', 'else', 'do', 'throw', 'if', 'while', 'for', 'switch', 'const', 'let', 'var', 'export', 'default']);
const isId = (c) => /[\w$]/.test(c ?? '');
/** The last character of code before i, at lo or after it; -1 when there is none. */
const prevSig = (F, i, lo) => { let k = i - 1; while (k >= lo && /\s/.test(F.mask[k])) k--; return k >= lo ? k : -1; };
/** Where the word that ends at k starts. */
const wordBack = (F, k, lo) => { let a = k; while (a > lo && isId(F.mask[a - 1])) a--; return a; };
/** The innermost template ${…} that holds position i (its expression starts at .at), or null. */
const spanAt = (F, i) => { let best = null; for (const s of F.spans) if (s.at <= i && i < s.end && (!best || s.at > best.at)) best = s; return best; };
/** Where the operand that ends at k starts — a literal, a name, a.b?.c, a call, an index, x!, or a group in brackets —
 *  or -1 when what ends there is no operand (an operator: the + before it was a unary one). */
function operandBack(F, k, lo) {
  let i = k;
  for (let n = 0; n < 400 && i >= lo; n++) {
    const c = F.mask[i];
    let start;
    const tok = F.tokEnd.get(i + 1);
    if (tok && tok.start >= lo) start = tok.start;
    else if (c === ')' || c === ']') {
      const o = F.openOf.get(i);
      if (o === undefined || o < lo) return -1;
      // A call or an index: the callee before it is part of the operand. Otherwise a group.
      const q = prevSig(F, o, lo);
      const w = q >= 0 && isId(F.mask[q]) ? F.mask.slice(wordBack(F, q, lo), q + 1) : '';
      if (q >= 0 && ((w && !KEYWORDS.has(w)) || F.mask[q] === ')' || F.mask[q] === ']' || (F.mask[q] === '.' && F.mask[q - 1] === '?'))) { i = F.mask[q] === '.' ? prevSig(F, q - 1, lo) : q; continue; }
      return o;
    } else if (isId(c)) {
      start = wordBack(F, i, lo);
      if (KEYWORDS.has(F.mask.slice(start, i + 1))) return -1;
    } else if (c === '!') { i = prevSig(F, i, lo); continue; }
    else return -1;
    // a member: a.b, a?.b
    const q = prevSig(F, start, lo);
    if (q >= 0 && F.mask[q] === '.' && F.mask[q - 1] !== '.') { i = prevSig(F, F.mask[q - 1] === '?' ? q - 1 : q, lo); continue; }
    return start;
  }
  return -1;
}
/** The operand that starts at a (after spaces): [start, end], or null. */
function operandFwd(F, a) {
  let i = a;
  while (i < F.mask.length && /\s/.test(F.mask[i])) i++;
  const s = i;
  for (;;) {
    const tok = F.tokAt.get(i);
    if (tok) i = tok.end;
    else if (F.mask[i] === '(' || F.mask[i] === '[') i = close(F, i) + 1;
    else if (isId(F.mask[i])) {
      const w0 = i;
      while (isId(F.mask[i])) i++;
      if (['new', 'await', 'typeof', 'void'].includes(F.mask.slice(w0, i))) { while (/\s/.test(F.mask[i] ?? '')) i++; continue; }
    } else return i > s ? [s, i] : null;
    break;
  }
  for (;;) {
    let j = i;
    while (/\s/.test(F.mask[j] ?? '')) j++;
    if ((F.mask[j] === '(' || F.mask[j] === '[') && j === i) { i = close(F, j) + 1; continue; }
    if (F.mask[j] === '!' && F.mask[j + 1] !== '=') { i = j + 1; continue; }
    if (F.mask[j] === '?' && F.mask[j + 1] === '.') j += 2;
    else if (F.mask[j] === '.' && F.mask[j + 1] !== '.') j += 1;
    else break;
    while (/\s/.test(F.mask[j] ?? '')) j++;
    if (F.mask[j] === '(' || F.mask[j] === '[') { i = close(F, j) + 1; continue; }
    if (!isId(F.mask[j])) break;
    while (isId(F.mask[j])) j++;
    i = j;
  }
  return [s, i];
}
/** A `:` at j that ends an object's key ({ href: … }, not a ? b : c). */
function isKeyColon(F, j, lo) {
  const k = prevSig(F, j, lo);
  if (k < 0) return false;
  const tok = F.tokEnd.get(k + 1);
  const s = tok ? tok.start : isId(F.mask[k]) ? wordBack(F, k, lo) : F.mask[k] === ']' ? F.openOf.get(k) : undefined;
  if (s === undefined) return false;
  const b = prevSig(F, s, lo);
  return b >= 0 && (F.mask[b] === '{' || F.mask[b] === ',');
}
/** The operator at j makes what follows it one side of a conditional: a ? b : c, a ?? b, a || b, a && b. */
const isCondOp = (F, j, lo) => { const c = F.mask[j]; return c === '?' || ((c === '|' || c === '&') && F.mask[j - 1] === c) || (c === ':' && !isKeyColon(F, j, lo)); };
/** Where the conditional whose operator is at j starts: back past its condition to what opens it. */
function condStart(F, j, lo) {
  let i = j;
  for (let n = 0; n < 20000; n++) {
    const k = prevSig(F, i, lo);
    if (k < 0) return i;
    const c = F.mask[k];
    const tok = F.tokEnd.get(k + 1);
    if (tok) { i = tok.start; continue; }
    if (c === ')' || c === ']' || c === '}') { const o = F.openOf.get(k); if (o === undefined) return i; i = o; continue; }
    if (c === '(' || c === '[' || c === '{' || c === ',' || c === ';') return i;
    if (c === '>' && F.mask[k - 1] === '=') return i;
    if (c === '=' && F.mask[k + 1] !== '=' && !'=!<>'.includes(F.mask[k - 1])) return i;
    if (c === ':' && isKeyColon(F, k, lo)) return i;
    if (isId(c)) { const a = wordBack(F, k, lo); if (['return', 'yield', 'throw', 'case', 'else', 'do'].includes(F.mask.slice(a, k + 1))) return i; i = a; continue; }
    i = k;
  }
  return i;
}
/** The ( at o groups (it is no call's). */
function isGroup(F, o, lo) {
  const q = prevSig(F, o, lo);
  if (q < 0) return true;
  const c = F.mask[q];
  if (c === ')' || c === ']' || (c === '.' && F.mask[q - 1] === '?') || (c === '>' && F.mask[q - 1] !== '=')) return false;
  if (isId(c)) return KEYWORDS.has(F.mask.slice(wordBack(F, q, lo), q + 1));
  return true;
}
/** A piece of an address: a literal's text as written (render), anything else as \u0001code\u0002. */
const pieceOf = (F, a, b) => { const t = F.tokAt.get(a); return t && t.end === b ? render(t.parts) : `\u0001${F.src.slice(a, b).trim()}\u0002`; };
/** An expression as an address: its + pieces in turn (`'/c/' + slug + '/patients/'` → /c/\u0001slug\u0002/patients/). */
function renderSpan(F, a, b) {
  while (a < b && /\s/.test(F.src[a])) a++;
  while (b > a && /\s/.test(F.src[b - 1])) b--;
  const t = F.tokAt.get(a);
  if (t && t.end === b) return render(t.parts);
  const plus = tops(F, a, b, (i) => F.mask[i] === '+' && F.mask[i + 1] !== '+' && F.mask[i + 1] !== '=' && F.mask[i - 1] !== '+');
  if (!plus.length) return a < b ? `\u0001${F.src.slice(a, b)}\u0002` : '';
  const out = [];
  let s = a;
  for (const i of plus) { out.push([s, i]); s = i + 1; }
  out.push([s, b]);
  return out.map(([x, y]) => renderSpan(F, x, y)).join('');
}
/** The address written before position s in the expression that holds it: the pieces a + chain adds before it
 *  (a + b + s), through the conditional it is one side of (c ? x + s : y), the group it stands in
 *  (a + (c ? s : '')), `x += s`, and the template ${…} it is written in — so an address reads the same however it is
 *  put together. */
function prefixOf(F, s, depth = 0) {
  const sp = spanAt(F, s), lo = sp ? sp.at : 0;
  const ops = [];
  let start = s;
  for (;;) {
    const j = prevSig(F, start, lo);
    if (j < 0 || F.mask[j] !== '+' || F.mask[j - 1] === '+') break;
    const k = prevSig(F, j, lo);
    const a = k < 0 ? -1 : operandBack(F, k, lo);
    if (a < 0) break;
    ops.unshift([a, k + 1]);
    start = a;
  }
  return contextOf(F, start, lo, sp, depth) + ops.map(([a, b]) => pieceOf(F, a, b)).join('');
}
/** The ( of the call whose argument list holds position e (at its top level), or -1. */
function callOpen(F, e, lo) {
  let i = e;
  for (let n = 0; n < 20000; n++) {
    const k = prevSig(F, i, lo);
    if (k < 0) return -1;
    const c = F.mask[k];
    const tok = F.tokEnd.get(k + 1);
    if (tok) { i = tok.start; continue; }
    if (c === ')' || c === ']' || c === '}') { const o = F.openOf.get(k); if (o === undefined) return -1; i = o; continue; }
    if (c === '(') return isGroup(F, k, lo) ? -1 : k;
    if (c === '[' || c === '{' || c === ';') return -1;
    i = k;
  }
  return -1;
}
/** x.concat(a, b): what is written before an argument is x's address and the arguments before it. */
function concatBefore(F, e, lo, depth) {
  const o = callOpen(F, e, lo);
  if (o < 0 || !/\.\s*concat\s*$/.test(F.mask.slice(Math.max(0, o - 12), o))) return null;
  const dot = F.mask.lastIndexOf('.', o);
  const k = prevSig(F, dot, lo);
  const r = k < 0 ? -1 : operandBack(F, k, lo);
  if (r < 0) return null;
  const args = splitTop(F, o + 1, close(F, o), ',').filter(([a]) => a < e);
  return prefixOf(F, r, depth + 1) + pieceOf(F, r, k + 1) + args.slice(0, -1).map(([a, b]) => renderSpan(F, a, b)).join('');
}
function contextOf(F, e, lo, sp, depth) {
  if (depth > 24) return '';
  const j = prevSig(F, e, lo);
  if (j < 0) return sp ? addrBefore(F, sp.tok, sp.part, depth + 1) : '';
  const c = F.mask[j];
  if (c === '(' || c === ',') { const cat = concatBefore(F, e, lo, depth); if (cat !== null) return cat; }
  if (c === '(' && isGroup(F, j, lo)) return prefixOf(F, j, depth + 1);
  if (c === '=' && F.mask[j - 1] === '+') { const k = prevSig(F, j - 1, lo); const a = k < 0 ? -1 : operandBack(F, k, lo); return a < 0 ? '' : pieceOf(F, a, k + 1); }
  if (isCondOp(F, j, lo)) return contextOf(F, condStart(F, j, lo), lo, sp, depth + 1);
  return '';
}
/** The address written before part k of a token. */
const addrBefore = (F, t, k, depth = 0) => prefixOf(F, t.start, depth) + render(t.parts.slice(0, k));

// --- reading code: brackets, expressions, definitions, calls -------------------------------------------------------
/** The bracket that closes the one at i (literals skipped). */
function close(F, i) {
  let d = 0;
  for (let j = i + 1; j < F.src.length;) {
    const t = F.tokAt.get(j); if (t) { j = t.end; continue; }
    const c = F.mask[j];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { if (d === 0) return j; d--; }
    j++;
  }
  return F.src.length;
}
/** Positions from a to b, at the top level of that span (not inside brackets or literals), where test(i) holds. */
function tops(F, a, b, test) {
  const out = [];
  let d = 0;
  for (let i = a; i < b;) {
    const t = F.tokAt.get(i); if (t) { i = t.end; continue; }
    const c = F.mask[i];
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (d === 0 && test(i)) out.push(i);
    i++;
  }
  return out;
}
const splitTop = (F, a, b, sep) => { const at = tops(F, a, b, (i) => F.mask.startsWith(sep, i)); const out = []; let s = a; for (const i of at) { out.push([s, i]); s = i + sep.length; } out.push([s, b]); return out.filter(([x, y]) => F.src.slice(x, y).trim()); };
/** Where an expression starting at a ends: a ; or , or a closing bracket of its own level, or the end of its line
 *  when the line does not carry on (an operator at its end, or at the start of the next). */
function exprEnd(F, a) {
  let d = 0;
  for (let i = a; i < F.src.length;) {
    const t = F.tokAt.get(i); if (t) { i = t.end; continue; }
    const c = F.mask[i];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { if (d === 0) return i; d--; }
    else if (d === 0 && (c === ';' || c === ',')) return i;
    else if (d === 0 && c === '\n') {
      const before = F.mask.slice(a, i).trimEnd().slice(-1);
      let k = i + 1; while (k < F.mask.length && /\s/.test(F.mask[k])) k++;
      if (before && !'=?:(,[{+&|'.includes(before) && !'?:.&|+'.includes(F.mask[k] ?? '')) return i;
    }
    i++;
  }
  return F.src.length;
}
const paramsOf = (F, p0, p1) => splitTop(F, p0 + 1, p1, ',').map(([x, y]) => /^\s*(?:\.\.\.)?([\w$]+)/.exec(F.src.slice(x, y))?.[1] ?? null);
function functionsOf(F) {
  const out = [];
  for (const m of F.mask.matchAll(/(?<![\w$.])(export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*(?:<[^>(]*>)?\s*\(/g)) {
    const p0 = m.index + m[0].length - 1, p1 = close(F, p0);
    let b = p1 + 1; while (b < F.src.length && F.mask[b] !== '{') b++;
    out.push({ name: m[2], exported: !!m[1], at: m.index, params: paramsOf(F, p0, p1), bodyStart: b, bodyEnd: close(F, b) });
  }
  for (const m of F.mask.matchAll(/(?<![\w$.])(export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/g)) {
    const p0 = m.index + m[0].length - 1, p1 = close(F, p0);
    const arrow = /^\s*(?::[^=]*?)?=>\s*/.exec(F.mask.slice(p1 + 1, p1 + 240));
    if (!arrow) continue;
    const b = p1 + 1 + arrow[0].length;
    out.push({ name: m[2], exported: !!m[1], at: m.index, params: paramsOf(F, p0, p1), bodyStart: b, bodyEnd: F.mask[b] === '{' ? close(F, b) : exprEnd(F, b), exprBody: F.mask[b] !== '{' });
  }
  return out;
}
function definitionsOf(F) {
  const out = [];
  for (const m of F.mask.matchAll(/(?<![\w$.])(const|let|var)\s+([\w$]+)\s*(?::[^=;]*?)?=(?![=>])\s*/g)) out.push({ name: m[2], kind: m[1], at: m.index, a: m.index + m[0].length, b: exprEnd(F, m.index + m[0].length) });
  // A `let` changes later: each assignment is a definition too.
  for (const name of new Set(out.filter((d) => d.kind !== 'const').map((d) => d.name))) {
    for (const m of F.mask.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*=(?![=>])\\s*`, 'g'))) {
      const a = m.index + m[0].length;
      if (!out.some((d) => d.a === a)) out.push({ name, kind: 'set', at: m.index, a, b: exprEnd(F, a) });
    }
  }
  return out;
}
// Where definitions are read: a .ts file whole; in an .astro page its frontmatter and its <script>s (the markup's
// `id="…"` is not an assignment to `id`).
for (const F of FILES) {
  F.code = [[0, F.src.length]];
  if (F.rel.endsWith('.astro')) {
    const fm = /^---\r?\n[\s\S]*?\n---/.exec(F.src);
    F.code = [...(fm ? [[0, fm[0].length]] : []), ...[...F.src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => [m.index, m.index + m[0].length])];
  }
  const inCode = (x) => F.code.some(([a, b]) => x.at >= a && x.at < b);
  F.fns = functionsOf(F).filter(inCode);
  F.defs = definitionsOf(F).filter(inCode);
}
/** Every call of fn: in its own file, or in every file when it is exported. Only where a call can stand (after an
 *  operator, a bracket, an arrow, `return` or at a line's start), so a page's words ("… to (…)") are not calls. */
function callsOf(fn, F0) {
  const out = [];
  const re = new RegExp(`(?<![\\w$.])${fn.name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
  for (const F of fn.exported ? FILES : [F0]) {
    for (const m of F.mask.matchAll(re)) {
      const before = F.mask.slice(Math.max(0, m.index - 16), m.index);
      if (/function\s*\*?\s*$/.test(before)) continue;
      if (!/(?:[=(,:?&|!{};[+]|=>|^|\n|\breturn|\bawait|\))\s*$/.test(before)) continue;
      const p0 = m.index + m[0].length - 1;
      out.push({ F, at: m.index, args: splitTop(F, p0 + 1, close(F, p0), ',') });
    }
  }
  return out;
}

// --- following an expression to the names it can take -----------------------------------------------------------
/** The alternatives an expression can evaluate to: both sides of a ternary (never its condition), every side of ??
 *  and ||, the last of &&; brackets, `x!` and `x as T` taken off. Each is a literal token or a piece of code. */
function alts(F, a, b, out = []) {
  while (a < b && /\s/.test(F.src[a])) a++;
  while (b > a && /\s/.test(F.src[b - 1])) b--;
  if (a >= b) return out;
  const tok = F.tokAt.get(a);
  if (tok && tok.end === b) { out.push({ tok, at: a }); return out; }
  if (F.mask[a] === '(' && close(F, a) === b - 1) return alts(F, a + 1, b - 1, out);
  const isQ = (i) => F.mask[i] === '?' && F.mask[i + 1] !== '?' && F.mask[i - 1] !== '?' && F.mask[i + 1] !== '.';
  const qs = tops(F, a, b, isQ);
  if (qs.length) {
    let open = 0, colon = -1;
    for (const i of tops(F, qs[0] + 1, b, (i) => isQ(i) || F.mask[i] === ':')) { if (F.mask[i] === '?') open++; else if (open === 0) { colon = i; break; } else open--; }
    if (colon > 0) { alts(F, qs[0] + 1, colon, out); alts(F, colon + 1, b, out); return out; }
  }
  for (const op of ['??', '||']) {
    const parts = splitTop(F, a, b, op);
    if (parts.length > 1) { for (const [x, y] of parts) alts(F, x, y, out); return out; }
  }
  const ands = tops(F, a, b, (i) => F.mask.startsWith('&&', i));
  if (ands.length) return alts(F, ands[ands.length - 1] + 2, b, out);
  const as = tops(F, a, b, (i) => /^\sas\s/.test(F.mask.slice(i, i + 4)));
  if (as.length) return alts(F, a, as[0], out);
  if (F.mask[b - 1] === '!') return alts(F, a, b - 1, out);
  out.push({ code: F.src.slice(a, b), at: a });
  return out;
}
/** A template or string as an address: its text as written, each ${…} as \u0001expression\u0002. */
function render(parts) { return parts.map((p) => (p.expr !== undefined ? `\u0001${p.expr.trim()}\u0002` : p.text)).join(''); }

// Expressions whose names this check reads whole elsewhere: taken as covered, not followed.
const COVERED = [
  [/^(?:ANCHOR|EXTRA_ANCHOR|SAVED_TO|SAVED_WORD|OPEN_PANEL|TAB_OF|SECTION_OF)\s*\[/, 'a map checked whole above'],
  [/^outcome\.section$/, 'an intent\'s section: every `section` an Outcome is given in record.ts / record-extra.ts, read below'],
  [/^(?:encodeURIComponent\()?outcome\.saved\)?$/, 'a clinical save\'s word: every `saved` an Outcome is given in record.ts / record-extra.ts, read below'],
  [/^backOf\(/, 'backOf(), checked above'],
  [/^recordSaved\(/, 'recordSaved(), SAVED_WORD checked above'],
];
// Expressions that cannot be followed, and why each is safe. One that matches nothing any more fails, so the list
// stays true. file: repo path; text: the expression exactly as written.
const ALLOWED = [
  { file: PAGE, text: 'decodeURIComponent(location.hash.slice(1))', why: 'fromHash writes the address\'s own #hash back (#timeline as #treatment-record); every hash that links in is checked here' },
  { file: PAGE, text: 'String((e as CustomEvent).detail?.id ?? \'\').replace(/^rec-/, \'\')', why: 'the tab just chosen, written into the address: a tab\'s own id' },
  { file: PAGE, text: 'id.replace(/^rec-/, \'\')', why: 'fromHash shows the tab the address\'s own #hash names (less rec-) when no section holds its element; every hash that links in is checked here' },
  { file: PAGE, text: '[postedVisit ? `visit=${postedVisit}` : \'\', qs].filter(Boolean).join(\'&\')', why: 'the query of a post\'s redirect (to()): visit= and to()\'s first argument, whose saved= words are read where the page writes them (in the record\'s own files every saved= and open= is the record\'s)' },
  { file: PAGE, text: 'u.toString()', why: 'leaveOffer(): the page\'s own query less treated, chartskip and saved' },
];

/** Every value an object is given under the key `name` in file F: `name: v`, `'name': v`, the shorthand `{ name }`
 *  (in code), and `x.name = v`. A key written `name?:`, or one whose value is a type (`string`, `string | null`), is a
 *  type's member, not a value. Each is a span [a, b] to follow (a shorthand's span is its own name). */
const TYPE_ONLY = /^(?:string|number|boolean|null|undefined|unknown|any)(?:\[\])?(?:\s*\|\s*(?:string|number|boolean|null|undefined|unknown|any)(?:\[\])?)*$/;
function keyValues(F, name) {
  const out = [];
  const esc = name.replace(/\$/g, '\\$');
  const before = (i) => { let k = i - 1; while (k >= 0 && /\s/.test(F.mask[k])) k--; return F.mask[k] ?? ''; };
  const isKey = (i) => before(i) === '{' || before(i) === ',';
  const value = (a) => { const b = exprEnd(F, a); if (!TYPE_ONLY.test(F.src.slice(a, b).trim())) out.push([a, b]); };
  for (const m of F.mask.matchAll(new RegExp(`(?<![\\w$.])${esc}\\s*(\\?)?:\\s*`, 'g'))) if (!m[1] && isKey(m.index)) value(m.index + m[0].length);
  for (const t of F.tokens) {
    if (t.parts.length !== 1 || t.parts[0].text !== name || !isKey(t.start)) continue;
    const c = /^\s*:\s*/.exec(F.mask.slice(t.end, t.end + 40));
    if (c) value(t.end + c[0].length);
  }
  for (const m of F.mask.matchAll(new RegExp(`(?<![\\w$.])${esc}(?=\\s*[,}])`, 'g'))) {
    if (isKey(m.index) && F.code.some(([a, b]) => m.index >= a && m.index < b)) out.push([m.index, m.index + name.length]);
  }
  for (const m of F.mask.matchAll(new RegExp(`\\.${esc}\\s*=(?![=>])\\s*`, 'g'))) value(m.index + m[0].length);
  return out;
}
/** The files that import F (a component's props come from the page that draws it). */
const importersOf = (F) => FILES.filter((G) => G !== F && [...G.src.matchAll(/\bimport\s+[\w$]+\s+from\s+['"]([^'"]+)['"]/g)]
  .some((m) => m[1].startsWith('.') && relative(ROOT, resolve(dirname(join(ROOT, G.rel)), m[1])) === F.rel));
// A member chain ending in .dataset.x: el.dataset.pickHome, el?.closest<HTMLElement>('[data-rec-panel]')?.dataset.recPanel.
const DATASET = /^[A-Za-z_$][\w$]*(?:\??\.[\w$]+|(?:\?\.)?(?:<[^<>()]*>)?\((?:[^()]|\([^()]*\))*\)|\[[^\]]*\])*\??\.dataset\.([\w$]+)$/;

/** Follow an expression (a..b in file F) to the literal names it can take. */
function follow(F, a, b, res = { lits: [], covered: [], unresolved: [] }, depth = 0) {
  for (const x of alts(F, a, b)) {
    const w = where(F, x.at);
    if (x.tok) {
      // Reading the rest of an address (readPiece): the literal itself, to be read with the address before it.
      if (res.toks) { res.toks.push({ G: F, tok: x.tok, where: w }); continue; }
      if (x.tok.parts.length === 1) { if (x.tok.parts[0].text) res.lits.push({ v: x.tok.parts[0].text, where: w }); }
      // A saved word is read by its first word (recordSaved: plan-done → plan, rx:<id> → rx), so `plan-${to}` is 'plan-'.
      else if (res.prefix && /[-:]/.test(x.tok.parts[0].text)) res.lits.push({ v: x.tok.parts[0].text, where: w });
      else res.unresolved.push({ F, text: F.src.slice(x.tok.start, x.tok.end), where: w });
      continue;
    }
    const text = x.code.trim();
    if (/^(?:null|undefined|true|false)$/.test(text)) continue;
    const cov = COVERED.find(([re]) => re.test(text));
    if (cov) { res.covered.push({ text, why: cov[1], where: w }); continue; }
    if (depth > 12) { res.unresolved.push({ F, text, where: w }); continue; }
    // el.dataset.pickHome → every data-pick-home="…" (or ={…}) in the record's files, and every value a script gives it
    // there (el.dataset.pickHome = …, setAttribute('data-pick-home', …)).
    const ds = DATASET.exec(text);
    if (ds) {
      const attr = 'data-' + ds[1].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      let any = false;
      for (const G of FILES.filter((G) => RECORD_OWN.has(G.rel))) {
        for (const m of G.mask.matchAll(new RegExp(`(?<![\\w-])${attr}=(["'{])`, 'g'))) {
          any = true;
          const q = m.index + m[0].length - 1;
          if (m[1] === '{') follow(G, q + 1, close(G, q), res, depth + 1);
          else { const t = G.tokAt.get(q); if (t?.parts[0].text) res.lits.push({ v: t.parts[0].text, where: where(G, q) }); }
        }
        for (const m of G.mask.matchAll(new RegExp(`\\.dataset\\.${ds[1].replace(/\$/g, "\\$")}\\s*=(?![=>])\\s*`, 'g'))) { any = true; const a = m.index + m[0].length; follow(G, a, exprEnd(G, a), res, depth + 1); }
        for (const t of G.tokens) {
          if (t.parts.length !== 1 || t.parts[0].text !== attr || !/\bsetAttribute\s*\(\s*$/.test(G.mask.slice(Math.max(0, t.start - 40), t.start))) continue;
          const c = /^\s*,\s*/.exec(G.mask.slice(t.end, t.end + 20));
          if (c) { any = true; const a = t.end + c[0].length; follow(G, a, exprEnd(G, a), res, depth + 1); }
        }
      }
      if (!any) res.unresolved.push({ F, text, where: w });
      continue;
    }
    // An object's property in the record's own files (a.go, o.show): every value that key is given in the file, and
    // in the files that draw it (keyValues). None found: the check cannot tell.
    const prop = /^[A-Za-z_$][\w$]*(?:\??\.[\w$]+)*\??\.([\w$]+)$/.exec(text);
    if (prop && RECORD_OWN.has(F.rel)) {
      const spans = [F, ...importersOf(F)].flatMap((G) => keyValues(G, prop[1]).map(([a, b]) => [G, a, b]));
      if (!spans.length) res.unresolved.push({ F, text, where: w });
      for (const [G, a, b] of spans) follow(G, a, b, res, depth + 1);
      continue;
    }
    // A call of a function this file writes as one expression (panelOf(el)): what that expression can be.
    const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(text);
    const callee = call && close(F, x.at + call[0].length - 1) === x.at + text.length - 1 ? F.fns.find((f) => f.name === call[1] && f.exprBody) : null;
    if (callee) { follow(F, callee.bodyStart, callee.bodyEnd, res, depth + 1); continue; }
    if (/^[A-Za-z_$][\w$]*$/.test(text)) {
      // A parameter of the function it is written in: what every call passes there.
      const fn = F.fns.filter((f) => f.params.includes(text) && x.at >= f.bodyStart && x.at <= f.bodyEnd).sort((p, q) => (p.bodyEnd - p.bodyStart) - (q.bodyEnd - q.bodyStart))[0];
      if (fn) {
        const i = fn.params.indexOf(text);
        const calls = callsOf(fn, F);
        if (!calls.length) res.unresolved.push({ F, text: `${text} (no call of ${fn.name}() found)`, where: w });
        for (const c of calls) if (c.args[i]) follow(c.F, c.args[i][0], c.args[i][1], res, depth + 1);
        continue;
      }
      // A const (the nearest one before), or a let with every value it is given.
      const defs = F.defs.filter((d) => d.name === text);
      if (defs.length) {
        const use = defs.some((d) => d.kind !== 'const') ? defs : [defs.filter((d) => d.at < x.at).pop() ?? defs[0]];
        for (const d of use) follow(F, d.a, d.b, res, depth + 1);
        continue;
      }
    }
    res.unresolved.push({ F, text, where: w });
  }
  return res;
}
const allowedHits = new Set();
/** Report what could not be followed (unless ALLOWED says why it is safe); hand back the names. */
const namesOf = (what, res) => {
  for (const u of res.unresolved) {
    const ok = ALLOWED.findIndex((x) => x.file === u.F.rel && x.text === u.text);
    if (ok >= 0) allowedHits.add(ok);
    else fail(`${what} (${u.where}): this check cannot tell which names \`${u.text}\` takes — write a literal, or teach the check (COVERED / ALLOWED)`, u.text);
  }
  return res.lits;
};

// --- whose address is it --------------------------------------------------------------------------------------
// A record address: `/patients/${id}/` (then a query), a variable holding one (`const here = …`), a patients-list base
// and an id (`${base}${id}/`), a function that returns one (patientHref(id)), or `action` in the record's components.
const REC_BASE = /^\/c\/\u0001[^\u0002]+\u0002\/patients\/\u0001[^\u0002]+\u0002\/?$/;
const LIST_BASE = /^\/c\/\u0001[^\u0002]+\u0002\/patients\/?$/;
const REC_PATH = /\/patients\/\u0001[^\u0002]+\u0002\/(?:[?&][\s\S]*|\u0001[\s\S]*)?$/;
const QUERY_AFTER = /^\/?(?:[?&][\s\S]*|\u0001[\s\S]*)?$/;
const ID_AFTER = /^\/?\u0001[^\u0002]+\u0002\/(?:[?&][\s\S]*|\u0001[\s\S]*)?$/;
// The Dashboard's boot.links.record is `/c/${clinic.slug}/patients/` (src/pages/c/[clinic]/index.astro).
const LIST_EXPRS = new Set(['boot.links.record']);
/** A record's address as code at position `at` of F: a variable holding one, a parameter a record's address is passed
 *  to (inside its function), a helper's call (patientHref(id)), each with a trailing .replace(…) / .slice(…) /
 *  .split(…)[0] / .trim() (action.replace(/#.*$/, '')), in brackets or with a `!`. */
const isRecordExpr = (F, e, at = -1) => {
  e = e.trim().replace(/!$/, '');
  while (/^\(/.test(e) && /\)$/.test(e)) e = e.slice(1, -1).trim();
  const m = /^([\w$]+)(\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))?((?:\.(?:replace|slice|split|trim)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)(?:\[\d+\])?)*)$/s.exec(e);
  if (!m) return false;
  if (m[2]) return F.recordHelpers.has(m[1]);
  return F.recordVars.has(m[1]) || F.recordParams.some((p) => p.name === m[1] && at >= p.a && at <= p.b);
};
const isListExpr = (F, e) => F.listVars.has(e.trim()) || LIST_EXPRS.has(e.trim());
/** 'record' (an address of the record), 'page' (another page, or a page under the record), 'here' (this page's own
 *  address), 'unknown' (named like a record's address, but not one this check can read), or null (cannot tell). The
 *  address is read from its first piece of code that is a record's or a patients list's, so an origin may come first
 *  (`${origin}${record}#x`). `at`: where in F it is written (a parameter holds a record's address only inside its
 *  function). */
function addressOf(F, A, at = -1) {
  if (REC_PATH.test(A)) return 'record';
  for (const p of A.matchAll(/\u0001([^\u0002]*)\u0002/g)) {
    const rest = A.slice(p.index + p[0].length);
    if (isRecordExpr(F, p[1], at)) return QUERY_AFTER.test(rest) ? 'record' : 'page';
    if (isListExpr(F, p[1])) return ID_AFTER.test(rest) ? 'record' : 'page';
  }
  const m = /^\u0001([^\u0002]*)\u0002([\s\S]*)$/.exec(A);
  if (m) {
    if (m[1] === 'location.pathname' && m[2].startsWith('\u0001location.search\u0002')) return 'here';
    // Named like a patient's or a record's address, but not one this check knows: say so, in any file.
    if (/record|patient/i.test(m[1].replace(/\(.*$/s, ''))) return 'unknown';
  }
  if (/^(?:https?:|mailto:|tel:|\/)/.test(A)) return 'page';
  return null;
}
/** The record's address as written (a template, `+` pieces, a variable), and none of its #hash yet. */
const holdsRecord = (F, s, at) => REC_BASE.test(s) || (addressOf(F, s, at) === 'record' && !s.replace(/\u0001[^\u0002]*\u0002/g, '').includes('#'));
const altText = (F, x) => (x.tok ? render(x.tok.parts) : renderSpan(F, x.at, x.at + x.code.length));
/** The functions a file imports by name from a relative module: local name → [file, exported name]. */
function importsOf(F) {
  const out = new Map();
  for (const m of F.src.matchAll(/\bimport\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const base = resolve(dirname(join(ROOT, F.rel)), m[2]);
    const G = ['', '.ts', '.mjs', '.astro', '/index.ts'].map((x) => byRel.get(relative(ROOT, base + x))).find(Boolean);
    if (!G) continue;
    for (const part of m[1].split(',')) {
      const n = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);
      if (n) out.set(n[2] ?? n[1], [G, n[1]]);
    }
  }
  return out;
}
function addressVars(F) {
  F.recordVars = new Set();
  F.listVars = new Set();
  F.recordHelpers = new Set();
  F.recordParams = [];
  F.imports = importsOf(F);
}
/** One pass over F: a variable given a record's address (or a list base), a function that returns one, and a function
 *  a record's address is passed to whole (its parameter holds one inside it: withHash(record, 'x')). True when it found
 *  something new, here or in the file of a function it calls. */
function addressStep(F) {
  let grew = false;
  // Only code that names a record's or a list's address, or writes /patients/, can hold one: the rest is passed over.
  const names = new Set([...F.recordVars, ...F.recordHelpers, ...F.listVars, ...F.recordParams.map((p) => p.name), ...[...LIST_EXPRS].map((e) => e.split('.')[0])]);
  const may = (a, b) => { const t = F.src.slice(a, b); return t.includes('/patients') || [...t.matchAll(/[\w$]+/g)].some((m) => names.has(m[0])); };
  for (const d of F.defs) {
    if (F.recordVars.has(d.name) || F.listVars.has(d.name) || !may(d.a, d.b)) continue;
    for (const x of alts(F, d.a, d.b)) {
      // An address of the record (with a query, or pieces after it, but no #hash yet: more can be added to it), or a
      // patients-list base; however it is put together (a template, `+`, another such variable).
      const s = altText(F, x);
      if (holdsRecord(F, s, x.at)) { F.recordVars.add(d.name); grew = true; break; }
      if (LIST_BASE.test(s) || (/^\u0001[^\u0002]*\u0002$/.test(s) && isListExpr(F, s.slice(1, -1)))) { F.listVars.add(d.name); grew = true; break; }
    }
  }
  // A function that returns one (an arrow's expression, or any `return` in its body): patientHref(id).
  for (const f of F.fns) {
    if (F.recordHelpers.has(f.name) || !may(f.bodyStart, f.bodyEnd)) continue;
    const rets = f.exprBody ? [[f.bodyStart, f.bodyEnd]]
      : [...F.mask.slice(f.bodyStart, f.bodyEnd).matchAll(/(?<![\w$.])return\s+/g)].map((m) => { const a = f.bodyStart + m.index + m[0].length; return [a, exprEnd(F, a)]; });
    if (rets.some(([a, b]) => alts(F, a, b).some((x) => addressOf(F, altText(F, x), x.at) === 'record'))) { F.recordHelpers.add(f.name); grew = true; }
  }
  // Calls: a record's address as a whole argument of a function this file writes, or imports by name.
  if (!names.size && !F.src.includes('/patients')) return grew;
  for (const m of F.mask.matchAll(/(?<![\w$.])([\w$]+)\s*\(/g)) {
    const own = F.fns.find((f) => f.name === m[1]);
    const imp = own ? null : F.imports.get(m[1]);
    const G = own ? F : imp?.[0];
    const fn = own ?? G?.fns.find((f) => f.name === imp[1] && f.exported);
    if (!fn || fn.at === m.index || /function\s*\*?\s*$/.test(F.mask.slice(Math.max(0, m.index - 12), m.index))) continue;
    const p0 = m.index + m[0].length - 1, p1 = close(F, p0);
    if (!may(p0, p1)) continue;
    splitTop(F, p0 + 1, p1, ',').forEach(([a, b], i) => {
      const name = fn.params[i];
      if (!name || G.recordParams.some((p) => p.name === name && p.a === fn.bodyStart)) return;
      if (!alts(F, a, b).some((x) => holdsRecord(F, altText(F, x), x.at))) return;
      G.recordParams.push({ name, a: fn.bodyStart, b: fn.bodyEnd, from: where(F, a) });
      grew = true;
    });
  }
  return grew;
}
// The record's own files: the page, _record/, _ui/, and every component the page draws with its address as `action`.
const RECORD_OWN = new Set([PAGE, ...FILES.filter((F) => F.rel.startsWith(`${REC}/_record/`) || F.rel.startsWith(`${REC}/_ui/`)).map((F) => F.rel)]);
const pageF = byRel.get(PAGE);
for (const F of FILES) addressVars(F);
while (addressStep(pageF));
for (const m of pageF.src.matchAll(/import\s+([\w$]+)\s+from\s+'([^']+\.astro)'/g)) {
  const rel = relative(ROOT, resolve(dirname(join(ROOT, PAGE)), m[2]));
  for (const tag of pageF.mask.matchAll(new RegExp(`<${m[1]}\\b`, 'g'))) {
    let end = tag.index, d = 0;
    for (let i = tag.index + 1; i < pageF.src.length;) { const t = pageF.tokAt.get(i); if (t) { i = t.end; continue; } const c = pageF.mask[i]; if (c === '{') d++; else if (c === '}') d--; else if (c === '>' && d === 0) { end = i; break; } i++; }
    const act = /\baction=\{\s*`?(?:\$\{)?([\w$]+)/.exec(pageF.src.slice(tag.index, end));
    if (act && pageF.recordVars.has(act[1])) RECORD_OWN.add(rel);
  }
}
for (const F of FILES) if (F !== pageF && RECORD_OWN.has(F.rel)) F.recordVars.add('action');
// Until nothing new is found (a helper in one file makes a variable in another, a parameter makes a helper …).
for (let pass = 0; pass < 8; pass++) { let grew = false; for (const F of FILES) if (addressStep(F)) grew = true; if (!grew) break; }

// --- the source: hashes, saved words, ?open=, data-rec-go / show, backTo ----------------------------------------
const found = { saved: new Map(), hash: new Map(), open: new Map(), visit: new Map(), go: new Map(), tab: new Map(), back: new Map() };
const note = (kind, v, w) => { if (!found[kind].has(v)) found[kind].set(v, []); if (!found[kind].get(v).includes(w)) found[kind].get(v).push(w); };
let hashSites = 0, pieceSites = 0, urlSites = 0;
const SELECTOR_CALL = /(?:\$\$?|querySelector(?:All)?|closest|matches)\s*(?:<[^>]*>)?\(\s*$/;
/** The literal t is the separator of `[…].join(t)` and the array holds an address of the record. */
function joinsRecord(F, t) {
  const sp = spanAt(F, t.start), lo = sp ? sp.at : 0;
  const o = callOpen(F, t.start, lo);
  if (o < 0 || !/\.\s*join\s*$/.test(F.mask.slice(Math.max(0, o - 12), o))) return false;
  const k = prevSig(F, F.mask.lastIndexOf('.', o), lo);
  const a = k >= 0 && F.mask[k] === ']' ? F.openOf.get(k) : undefined;
  if (a === undefined) return false;
  return splitTop(F, a + 1, k, ',').some(([x, y]) => alts(F, x, y).some((z) => holdsRecord(F, altText(F, z), z.at) || addressOf(F, altText(F, z), z.at) === 'record'));
}
/** Read one literal (token t of file F) as part of an address: `pre` is what is written before it (prefixOf, or the
 *  address a piece continues: readPiece), and C the file whose variables say whose address that is. Every #name in
 *  fragment position, ?saved= / ?open= and ?visit= on an address of the record is noted; a name that follows as code
 *  (`#${h}`, '#' + h, '?open=' + o) is followed. */
function scanParts(C, F, t, pre, own, at = t.start) {
  t.parts.forEach((p, k) => {
    if (p.expr !== undefined) return;
    const before = pre + render(t.parts.slice(0, k));
    const nextExpr = t.parts[k + 1]?.expr !== undefined ? t.parts[k + 1] : null;
    // What `+` adds after the literal ('#' + hash, '&open=' + open): that one operand.
    const plusNext = () => {
      if (k !== t.parts.length - 1) return null;
      const m = /^\s*\+(?![+=])/.exec(F.mask.slice(t.end, t.end + 80));
      return m ? operandFwd(F, t.end + m[0].length) : null;
    };
    // A # that can start a fragment: at the literal's start, after a / or a ${…}, or after a query.
    for (const m of p.text.matchAll(/#/g)) {
      const o = m.index;
      const rest = p.text.slice(o + 1);
      const name = /^[a-z][a-z0-9-]*/.exec(rest)?.[0];
      // '#' + name: the fragment is what is added after the literal.
      const plus = !name && rest === '' && !nextExpr ? plusNext() : null;
      // [record, 'money'].join('#'): an address put together by .join, which this check does not read.
      if (o === 0 && !before && joinsRecord(F, t)) { fail(`a # joins an address of the record by .join() (${where(F, p.at)}): this check cannot read an address put together that way — write it as a template or with +`, p.text); continue; }
      if (!name && !(rest === '' && (nextExpr || plus))) continue;
      const prev = o > 0 ? p.text[o - 1] : k > 0 ? '}' : '^';
      const A = before + p.text.slice(0, o);
      if (!(prev === '^' || prev === '}' || prev === '/' || /\?\S*$/.test(A.replace(/\u0001[^\u0002]*\u0002/g, 'x')))) continue;
      const w = where(F, p.at + o);
      let place;
      if (A === '') {
        const line = F.mask.slice(F.mask.lastIndexOf('\n', t.start) + 1, t.start);
        if (/^#[0-9a-fA-F]{3,8}$/.test(p.text) || SELECTOR_CALL.test(line)) place = 'page';
        else place = own ? 'record' : 'page';
      } else place = addressOf(C, A, at);
      if (place === 'here') place = own ? 'record' : 'page';
      if (place === 'unknown') place = null;
      else if (place === null && !own) place = 'page';
      if (place === 'page') continue;
      hashSites++;
      if (place === null) { fail(`a # this check cannot place (${w}): \`${F.src.slice(t.start, t.end).slice(0, 120)}\` — say in addressOf() whose address it is`, A); continue; }
      if (name && name.length === rest.length && nextExpr) { fail(`a #hash with a name built in pieces (${w}): the check cannot read \`#${name}\${…}\``, name); continue; }
      if (name) note('hash', name, w);
      else {
        const [a, b] = nextExpr ? [nextExpr.at, nextExpr.end] : plus;
        for (const l of namesOf(`the #hash at ${w}`, follow(F, a, b))) note('hash', l.v.replace(/^#/, ''), `${w} via ${l.where}`);
      }
    }
    // ?saved=, ?open= (and ?visit=, for the §5 sites below) on an address of the record (or, in the record's own files,
    // a query written apart: to('saved=…')).
    for (const m of p.text.matchAll(/(^|[?&])(saved|open|visit)=([a-z][a-z-]*)?/g)) {
      const A = before + p.text.slice(0, m.index);
      const kind = m[2], w = where(F, p.at + m.index);
      let place = A === '' ? (own ? 'record' : 'page') : addressOf(C, A, at);
      if (place === 'here') place = own ? 'record' : 'page';
      if (place === 'unknown') { fail(`?${kind}= on an address this check cannot read (${w}): \`${F.src.slice(t.start, t.end).slice(0, 120)}\` — say in addressOf() whose address it is`, A); continue; }
      if (place !== 'record') continue;
      if (kind === 'visit') { note('visit', '*', w); continue; }
      if (m[3]) note(kind, m[3], w);
      else if (m.index + m[0].length === p.text.length) {
        const nx = nextExpr ? [nextExpr.at, nextExpr.end] : plusNext();
        if (nx) for (const l of namesOf(`the ?${kind}= at ${w}`, follow(F, nx[0], nx[1]))) note(kind, l.v.split(/[&#]/)[0], `${w} via ${l.where}`);
      }
    }
  });
}
/** What code adds after an address of the record (`${record}${q}`, record + q, record + (c ? x : '')): each of its
 *  alternatives is read — a literal written in it is read where it stands (with the address before it, prefixOf); a
 *  name is followed to its literals, each read as the rest of that address; a + chain in it is read by its first
 *  operand (the others are pieces of their own). What cannot be followed fails, since it could carry a #hash, a
 *  ?saved= or an ?open= that nothing checks. */
function readPiece(F, a, b, A, w, depth = 0) {
  for (const x of alts(F, a, b)) {
    if (x.tok) continue;
    const code = x.code.trim();
    if (/^(?:null|undefined|true|false)$/.test(code)) continue;
    const end = x.at + x.code.length;
    const plus = tops(F, x.at, end, (i) => F.mask[i] === '+' && F.mask[i + 1] !== '+' && F.mask[i + 1] !== '=' && F.mask[i - 1] !== '+');
    if (plus.length && depth < 8) { readPiece(F, x.at, plus[0], A, w, depth + 1); continue; }
    const res = follow(F, x.at, end, { lits: [], covered: [], unresolved: [], toks: [] });
    namesOf(`what is added after an address of the record at ${w}`, res);
    for (const { G, tok } of res.toks) scanParts(F, G, tok, A, RECORD_OWN.has(G.rel), a);
  }
}
for (const F of FILES) {
  const own = RECORD_OWN.has(F.rel);
  for (const t of F.tokens) scanParts(F, F, t, prefixOf(F, t.start), own);
  // Code written after an address of the record, as a template's ${…} or a + operand, where it could add a path, a
  // query or a #hash (not a value after `x=`, and not the name after a # — both read above).
  const pieces = [];
  for (const t of F.tokens) t.parts.forEach((p, k) => { if (p.expr !== undefined) pieces.push([p.at, p.end, () => addrBefore(F, t, k)]); });
  for (const m of F.mask.matchAll(/\+/g)) {
    const i = m.index;
    if (F.mask[i + 1] === '+' || F.mask[i + 1] === '=' || F.mask[i - 1] === '+') continue;
    const op = operandFwd(F, i + 1);
    if (!op || F.tokAt.get(op[0])?.end === op[1]) continue;
    pieces.push([op[0], op[1], () => prefixOf(F, op[0])]);
  }
  for (const [a, b, pre] of pieces) {
    const A = pre();
    if (A === '') continue;
    let place = addressOf(F, A, a);
    if (place === 'here') place = own ? 'record' : 'page';
    if (place !== 'record') continue;
    const bare = A.replace(/\u0001[^\u0002]*\u0002/g, '\u0001');
    if (/=$/.test(bare) || bare.includes('#')) continue;
    pieceSites++;
    readPiece(F, a, b, A, where(F, a));
  }
  if (!own) continue;
  // A # the lexer did not see inside a literal (markup, code), or a "literal" that is really a stretch of markup between
  // two apostrophes: the check would not be reading that line as written, so it says so.
  for (const m of F.mask.matchAll(/#(?=[a-z$])/g)) fail(`a # outside any string (${where(F, m.index)}): this check cannot read \`${F.src.slice(m.index, m.index + 40).split('\n')[0]}\``, F.rel);
  for (const t of F.tokens) if (t.kind === 'str' && /[<>]|="/.test(t.parts[0].text) && /#[a-z$]/.test(t.parts[0].text)) fail(`markup read as a string (${where(F, t.start)}): an apostrophe in the words? Write it as ’ so this check reads the line`, t.parts[0].text.slice(0, 80));
  // data-rec-go / data-rec-show, as literals or as an expression: data-rec-go={a.go} is every value `go` is given in
  // the file and in the page that draws it, however written (`go: "x"`, `go: ok ? 'x' : 'y'`, go: `x`, a const).
  for (const m of F.mask.matchAll(/data-rec-(?:go|show)=(["'{])/g)) {
    const q = m.index + m[0].length - 1, w = where(F, m.index);
    if (m[1] === '{') for (const l of namesOf(`data-rec-go / show at ${w}`, follow(F, q + 1, close(F, q)))) note('go', l.v, `${w} via ${l.where}`);
    else { const t = F.tokAt.get(q); note('go', t?.parts[0].text ?? '', w); }
  }
  // A tab looked up by its id: 'rec-rec-chart-tab' as written, or `rec-rec-${name}-tab` with every name it is given
  // (the page's tabFor(name): every call, so every show() call too). The template that draws a tab (RecordNav's
  // id={`rec-rec-${i.id}-tab`}) makes the tabs, and is not a lookup.
  for (const t of F.tokens) {
    for (const p of t.parts) for (const m of (p.text ?? '').matchAll(/rec-rec-([a-z][a-z0-9-]*)-tab/g)) note('tab', m[1], where(F, p.at + m.index));
    t.parts.forEach((p, k) => {
      if (p.expr === undefined || !/(?:^|[^\w-])rec-rec-$/.test(t.parts[k - 1]?.text ?? '') || !/^-tab/.test(t.parts[k + 1]?.text ?? '')) return;
      if (/\bid=\{\s*$/.test(F.mask.slice(Math.max(0, t.start - 12), t.start))) return;
      const w = where(F, p.at);
      for (const l of namesOf(`the tab looked up at ${w}`, follow(F, p.at, p.end))) note('tab', l.v, `${w} via ${l.where}`);
    });
  }
}
// URL objects, in any file: `const u = new URL(<address>, …)` is the address of its first argument (the record's,
// another page's, or this page's own: location.href). What a script writes on one — u.hash = …, u.search = …,
// u.searchParams.set('open' | 'saved' | 'visit', …) — is read like a literal of that address (pickpanel's aimForm:
// `u.hash = back === 'chart' ? 'chart' : home`, home from every call). In the record's own files every such write is
// the record's; elsewhere one on an object this check cannot place fails.
const HERE = /^(?:(?:window|document)\.)?location(?:\.href)?$/;
for (const F of FILES) {
  F.urls = new Map();
  for (const d of F.defs) {
    const m = /^new\s+URL\s*\(/.exec(F.mask.slice(d.a, d.b));
    if (!m) continue;
    const p0 = d.a + m[0].length - 1;
    const arg = splitTop(F, p0 + 1, close(F, p0), ',')[0];
    const kinds = arg ? alts(F, arg[0], arg[1]).map((x) => {
      const s = x.tok ? render(x.tok.parts) : renderSpan(F, x.at, x.at + x.code.length);
      return /^\u0001[^\u0002]*\u0002$/.test(s) && HERE.test(s.slice(1, -1).trim()) ? 'here' : addressOf(F, s, x.at);
    }) : [];
    F.urls.set(d.name, kinds.includes('record') ? 'record' : kinds.length && kinds.every((k) => k === 'page') ? 'page' : kinds.length && kinds.every((k) => k === 'here') ? 'here' : null);
  }
}
for (const F of FILES) {
  const own = RECORD_OWN.has(F.rel);
  /** Whose address the object at [s, e) is: 'record', 'page', or null (cannot tell). */
  const placeOf = (s, e) => {
    const o = F.src.slice(s, e).trim();
    const kind = /^(?:(?:window|document)\.)?location$/.test(o) ? 'here' : F.urls.get(o) ?? null;
    if (kind === 'here') return own ? 'record' : 'page';
    return kind === 'record' || kind === 'page' ? kind : own ? 'record' : null;
  };
  const objectBefore = (i) => { const sp = spanAt(F, i), lo = sp ? sp.at : 0; const k = prevSig(F, i, lo); const s = k < 0 ? -1 : operandBack(F, k, lo); return s < 0 ? null : [s, k + 1]; };
  for (const m of F.mask.matchAll(/\.(hash|search)\s*=(?![=>])\s*/g)) {
    const a = m.index + m[0].length, w = where(F, m.index);
    const obj = objectBefore(m.index);
    const place = obj ? placeOf(obj[0], obj[1]) : own ? 'record' : null;
    if (place === 'page') continue;
    urlSites++;
    if (!place) { fail(`.${m[1]} is written at ${w} on an object this check cannot place — say among the URL objects whose address it is`, obj ? F.src.slice(obj[0], obj[1]) : m[1]); continue; }
    if (m[1] === 'hash') { hashSites++; for (const l of namesOf(`the hash set at ${w}`, follow(F, a, exprEnd(F, a)))) note('hash', l.v.replace(/^#/, ''), `${w} via ${l.where}`); continue; }
    const res = follow(F, a, exprEnd(F, a), { lits: [], covered: [], unresolved: [], toks: [] });
    namesOf(`the query set at ${w}`, res);
    for (const { G, tok } of res.toks) scanParts(F, G, tok, '/patients/\u0001the URL object\u0002/', RECORD_OWN.has(G.rel), m.index); // read as a record's address
  }
  for (const m of F.mask.matchAll(/\.searchParams\s*\.\s*(?:set|append)\s*\(/g)) {
    const p0 = m.index + m[0].length - 1, w = where(F, m.index);
    const args = splitTop(F, p0 + 1, close(F, p0), ',');
    if (!args[0]) continue;
    const keys = follow(F, args[0][0], args[0][1]);
    const hit = [...new Set(keys.lits.map((l) => l.v).filter((v) => v === 'saved' || v === 'open' || v === 'visit'))];
    if (!hit.length && !keys.unresolved.length) continue;
    const obj = objectBefore(m.index);
    const place = obj ? placeOf(obj[0], obj[1]) : own ? 'record' : null;
    if (place === 'page') continue;
    urlSites++;
    if (!place) { fail(`?${hit[0] ?? '…'}= is set at ${w} on an address this check cannot place — say among the URL objects whose address it is`, obj ? F.src.slice(obj[0], obj[1]) : 'searchParams'); continue; }
    namesOf(`the query key set at ${w}`, keys);
    for (const kind of hit) {
      if (kind === 'visit') { note('visit', '*', w); continue; }
      if (!args[1]) { fail(`?${kind}= set with no value (${w})`, kind); continue; }
      for (const l of namesOf(`the ?${kind}= set at ${w}`, follow(F, args[1][0], args[1][1]))) note(kind, l.v, `${w} via ${l.where}`);
    }
  }
}
// The page's show(name): every name it is given picks a tab (the offline kept copy's show('chart'), the chart's
// notices, data-rec-go / data-rec-show, fromHash). Read from its calls whatever show() does with the name.
const pageShow = pageF.fns.find((f) => f.name === 'show');
if (!pageShow) fail(`${PAGE} has no show(): this check reads the names that pick a tab through its calls — update the check with the page`, 'show');
else for (const c of callsOf(pageShow, pageF)) {
  const w = where(pageF, c.at);
  if (!c.args[0]) { fail(`show() with no name (${w})`, 'show()'); continue; }
  for (const l of namesOf(`show() at ${w}`, follow(pageF, c.args[0][0], c.args[0][1]))) note('tab', l.v, `${w} via ${l.where}`);
}
// Saved words and sections the record libraries return: every `saved` and `section` an object is given in record.ts and
// record-extra.ts (done(saved) → { ok: true, section, saved }, so every call of done(); { …, saved: `rx:${id}` }),
// however written. A template counts by its first word (`plan-${to}` is plan).
for (const rel of ['src/lib/record.ts', 'src/lib/record-extra.ts']) {
  const F = byRel.get(rel);
  for (const [key, kind] of [['saved', 'saved'], ['section', 'back']]) {
    const spans = keyValues(F, key);
    if (!spans.length) fail(`${rel}: no \`${key}\` found in an Outcome — this check reads the record's saves through it; update the check with the library`, key);
    for (const [a, b] of spans) for (const l of namesOf(`the \`${key}\` at ${where(F, a)}`, follow(F, a, b, { lits: [], covered: [], unresolved: [], prefix: kind === 'saved' }))) note(kind, l.v, l.where);
  }
}
// Every section the page's first tab can come from: what landingSection's backTo is given (the page's `backTo`), and
// an intent's section (SECTION_OF[intent], else the fallback in record.ts / record-extra.ts).
const landing = byRel.get(`${REC}/_record/sections.ts`).fns.find((f) => f.name === 'landingSection');
const landingCalls = landing ? callsOf(landing, null).filter((c) => c.F === pageF) : [];
if (!landingCalls.length) fail(`${PAGE} does not call landingSection(): this check reads the page's first tab through it — update the check with the page`, 'landingSection');
for (const c of landingCalls) {
  let obj = c.args[0]?.[0] ?? -1;
  while (obj >= 0 && /\s/.test(c.F.src[obj])) obj++;
  const prop = obj >= 0 && c.F.mask[obj] === '{' ? splitTop(c.F, obj + 1, close(c.F, obj), ',').find(([x, y]) => /^\s*backTo\b/.test(c.F.src.slice(x, y))) : null;
  if (!prop) { fail(`landingSection() at ${where(c.F, c.at)}: this check cannot find its backTo`, 'backTo'); continue; }
  const colon = c.F.src.slice(prop[0], prop[1]).indexOf(':');
  const res = colon < 0 ? follow(c.F, prop[0], prop[1]) : follow(c.F, prop[0] + colon + 1, prop[1]);
  for (const l of namesOf(`landingSection's backTo at ${where(c.F, c.at)}`, res)) note('back', l.v, l.where);
}
ALLOWED.forEach((x, i) => { if (!allowedHits.has(i)) fail(`ALLOWED: nothing in ${x.file} writes \`${x.text}\` any more — take it off the list`, x.text); });

// The page's own saved words that land on the default tab on purpose (This visit's "No change": the strip is on Today).
const DEFAULT_OK = new Set(['checked', 'checked-today']);
for (const [w, at] of found.saved) {
  checked++;
  const s = Object.hasOwn(SAVED_TO, w) ? SAVED_TO[w] : recordSaved(w);
  if (s === null) { if (!DEFAULT_OK.has(w)) fail(`?saved=${w} (${at[0]}) has no section in SAVED_TO or SAVED_WORD`, w); }
  else resolves(`?saved=${w} (${at[0]})`, s);
}
for (const [h, at] of found.hash) hashResolves(`#${h} (${at.join(', ')})`, h);
for (const [g, at] of found.go) resolves(`data-rec-go / show "${g}" (${at[0]})`, g);
for (const [g, at] of found.tab) resolves(`a name that picks a tab, "${g}" (${at[0]})`, g);
for (const [b, at] of found.back) resolves(`a section the page lands on (${at.join(', ')})`, b);
for (const [o, at] of found.open) { checked++; if (!Object.hasOwn(OPEN_PANEL, o)) fail(`?open=${o} (${at.join(', ')}) is not a panel the record opens (OPEN_PANEL)`, o); }
// Every panel the page opens as it loads (openNow === 'rx' …) needs its section in OPEN_PANEL, and so does every ?open=
// the spec lists (§5; `health` joins with rec-health in S5).
for (const m of pageF.src.matchAll(/\bopenNow\s*===\s*'([a-z-]+)'/g)) { checked++; if (!Object.hasOwn(OPEN_PANEL, m[1])) fail(`the page opens a panel for ?open=${m[1]} (${where(pageF, m.index)}) that OPEN_PANEL does not know`, m[1]); }
for (const o of ['vitals', 'note', 'rx', 'done', 'file', 'details']) { checked++; if (!Object.hasOwn(OPEN_PANEL, o)) fail(`?open=${o}, an inbound link of spec §5, is not in OPEN_PANEL`, o); }

// --- the inbound links of spec §5 -----------------------------------------------------------------------------
// TAB_OF as spec §5 draws it: each name on its own tab, not only on some tab (#money on Today would pass the rest of
// this check). A name TAB_OF adds later is checked above; one of these moved or gone fails here.
const SPEC_TAB_OF = {
  overview: ['overview', 'this-visit', 'visits', 'recall'],
  patient: ['patient', 'health', 'vitals', 'consent', 'consent-paper', 'consent-forms', 'visit-consents', 'patient-forms', 'details-card'],
  chart: ['chart', 'chart-offer', 'treatment', 'treatment-done', 'treatment-lab', 'loas', 'payplans', 'files'],
  'treatment-record': ['treatment-record', 'timeline', 'notes', 'rx', 'letters', 'money', 'texts'],
};
for (const [tab, names] of Object.entries(SPEC_TAB_OF)) for (const h of [...names, `rec-${tab}`]) {
  checked++;
  const t = tabOf(h) ?? tabOf(h.replace(/^rec-/, ''));
  if (t !== tab) fail(`an inbound name of spec §5 on the wrong tab: #${h} belongs on ${tab}`, h, t);
}
// Every link of spec §5 that another page writes, pinned to the file that writes it: each name must still be read there.
// A link rewritten in a way this check does not follow (a URL object, a helper, pieces) would otherwise stop being
// checked without a word — here it fails instead. A change §5 asks for (finances/close:338 → #treatment-record,
// import.astro:572 → #treatment-record, the Dashboard's hashes dropped) is made in this table with the link.
// [§5 row, file, kind (hash | saved | open | visit), names ('*': at least one)]
const RP = `${REC}/[patient]`;
const SPEC_SITES = [
  ['?visit=<id> (panels.ts:85, :358)', 'src/components/ws/cal/panels.ts', 'visit', ['*']],
  ['?visit=<id> (sign/[visit].astro:169, 184, 190)', `${RP}/sign/[visit].astro`, 'visit', ['*']],
  ['panels.ts:236-247: #health, #vitals, #rx, #treatment', 'src/components/ws/cal/panels.ts', 'hash', ['health', 'vitals', 'rx', 'treatment']],
  ['panels.ts:240 ?open=vitals, :463 ?open=details&dash=', 'src/components/ws/cal/panels.ts', 'open', ['vitals', 'details']],
  ['#consent-paper (DeskConsent.astro:163)', 'src/components/DeskConsent.astro', 'hash', ['consent-paper']],
  ['#treatment-record (treatment-record.astro:32)', `${RP}/treatment-record.astro`, 'hash', ['treatment-record']],
  ['#treatment-record (aftercare/[kind].astro:34)', `${RP}/aftercare/[kind].astro`, 'hash', ['treatment-record']],
  ['?visit= (aftercare/[kind].astro:34)', `${RP}/aftercare/[kind].astro`, 'visit', ['*']],
  ['#rx (rx/[rx].astro:26)', `${RP}/rx/[rx].astro`, 'hash', ['rx']],
  ['#letters (letters/[letter].astro:25)', `${RP}/letters/[letter].astro`, 'hash', ['letters']],
  ['#files (files/[file]/view.astro)', `${RP}/files/[file]/view.astro`, 'hash', ['files']],
  ['#treatment (finances/close:338), #money (:370)', 'src/pages/c/[clinic]/finances/close/index.astro', 'hash', ['treatment', 'money']],
  ['#visits (import.astro:572)', `${REC}/import.astro`, 'hash', ['visits']],
  ['the intake\'s #consent (consents/index.astro)', `${RP}/consents/index.astro`, 'hash', ['consent']],
  ['?saved=capacity (consents/index.astro:35)', `${RP}/consents/index.astro`, 'saved', ['capacity']],
  ['the intake\'s #consent ([document].astro:100, 170)', `${RP}/consents/[document].astro`, 'hash', ['consent']],
  ['?saved=consent-removed ([document].astro:100)', `${RP}/consents/[document].astro`, 'saved', ['consent-removed']],
  ['the intake\'s #consent (new/index.astro:107)', `${REC}/new/index.astro`, 'hash', ['consent']],
  ['the intake\'s #consent (intake/[intake].astro:708)', `${REC}/intake/[intake].astro`, 'hash', ['consent']],
  ['?saved=intake&intake= (intake/[intake].astro)', `${REC}/intake/[intake].astro`, 'saved', ['intake']],
  ['?saved=new (new/type.astro)', `${REC}/new/type.astro`, 'saved', ['new']],
  ['?saved=form&form= (forms/[form]/index.astro)', `${REC}/forms/[form]/index.astro`, 'saved', ['form']],
];
const siteOf = (w) => w.split(' via ')[0].replace(/:\d+$/, '');
for (const [row, file, kind, names] of SPEC_SITES) {
  checked++;
  if (!byRel.has(file)) { fail(`spec §5, ${row}: ${file} is gone — update SPEC_SITES with the page that writes this link now`, file); continue; }
  const read = new Set([...found[kind]].filter(([, at]) => at.some((w) => siteOf(w) === file)).map(([v]) => v));
  for (const n of names) {
    if (n === '*' ? read.size : read.has(n)) continue;
    const what = kind === 'hash' ? `#${n}` : `?${kind}=${n === '*' ? '…' : n}`;
    fail(`spec §5, ${row}: this check no longer reads ${what} in ${file} — the link was rewritten in a way the check does not follow (teach it), or moved or changed (update SPEC_SITES with it)`, n);
  }
}

// --- the first tab, over every combination ---------------------------------------------------------------------
// backTo: every value the page gives it (read above), every section an intent has, and what backOf() gives.
const sections = [...new Set([...found.back.keys(), ...Object.values(R.SECTION_OF), ...Object.values(X.SECTION_OF), ...BACKS])];
const savedWords = [null, ...Object.keys(SAVED_TO), ...found.saved.keys(), 'rx:0f0f0f0f-1111-4222-8333-444444444444', 'files:3', 'vitals-crisis', 'plan-done', 'nonsense', 'constructor', '__proto__'];
const opens = [null, ...Object.keys(OPEN_PANEL)];
const visits = [null, 'today', 'ledger', 'other'];
let combos = 0;
const lost = new Map(); // a section landingSection gave that is no tab → [how often, the first combination]
for (const backTo of [null, ...sections]) for (const fromChart of [false, true]) for (const saved of savedWords) for (const openNow of opens) for (const visit of visits) {
  combos++;
  const s = landingSection({ backTo, fromChart, saved, openNow, visit });
  const t = tabOf(s);
  if (!t || !TAB_IDS.includes(t)) { const x = lost.get(s) ?? [0, { backTo, fromChart, saved, openNow, visit }]; x[0]++; lost.set(s, x); }
}
for (const [s, [n, first]] of lost) fail(`landingSection gave a section that is no tab, in ${n} of the combinations, first`, first, s);
// ?visit= by itself (today, another day's on the Treatment record, a future or cancelled one that is not, an unknown id).
for (const visit of visits) resolves(`?visit= (${visit ?? 'none or unknown'})`, landingSection({ backTo: null, fromChart: false, saved: null, openNow: null, visit }));

// --- the report -----------------------------------------------------------------------------------------------
const list = (m) => [...m.keys()].sort().join(' ');
console.log(`tabs: ${TABS.map((t) => `${t.id} (${t.label})`).join(' · ')}`);
console.log(`TAB_OF: ${Object.keys(TAB_OF).length} names`);
console.log(`the record's own files (${RECORD_OWN.size}); ${hashSites} places an address of the record gets its #hash; ${pieceSites} pieces of code added after one; ${urlSites} writes on a URL object; ${SPEC_SITES.length} §5 link sites pinned`);
console.log(`from the source — saved words (${found.saved.size}): ${list(found.saved)}`);
console.log(`from the source — hashes (${found.hash.size}): ${list(found.hash)}`);
console.log(`from the source — data-rec-go / show (${found.go.size}): ${list(found.go)}`);
console.log(`from the source — names that pick a tab: show() and rec-rec-<name>-tab (${found.tab.size}): ${list(found.tab)}`);
console.log(`from the source — ?open= (${found.open.size}): ${list(found.open)}`);
console.log(`from the source — ?visit= on an address of the record: ${found.visit.get('*')?.length ?? 0} places`);
console.log(`from the source — sections the page lands on (${found.back.size}): ${list(found.back)}`);
console.log(`${checked} names checked, ${combos} landing combinations`);
// --list: every name with every place it was read from.
if (process.argv.includes('--list')) for (const [kind, m] of Object.entries(found)) for (const [v, at] of [...m].sort()) console.log(`  ${kind} ${v}: ${at.join(', ')}`);
if (fails.length) {
  console.log(`\n${fails.length} did not resolve to one of the four tabs:`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('every name resolves to one of the four tabs');
