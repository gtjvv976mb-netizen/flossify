// The words check's reader: the strings a person sees, read out of the source with Astro's own parser
// (@astrojs/compiler-rs), not with a grep. Plan item 1.8; docs/glossary.md, "For the developer: the words check".
//
//   extract(path, source) → [{ text, line, kind }]   the visible strings of one file
//   extractFile(rel)     → the same for a repository file (a fixed print page: only its screen bar)
//   listFiles()          → ['src/…', 'public/…']    the files the repo check reads (FIXED files left out, but a
//                                                    print page stays for its screen bar)
//
// What it reads (kind):
//   text      a template's text between tags, entities decoded
//   attr      an attribute a person sees or hears (title, aria-label, placeholder, alt, value …: every one but
//             DENY_ATTR, the aria-* in ARIA_WORDS, the data-* a page script turns into words in DATA_WORDS) and every
//             component prop but COMPONENT_DENY (label, head, lede, action={{ label }} …), as written or as the
//             strings inside its {…}; set:html and set:text as text, a script's define:vars as its script
//   expr      a string inside a template's {…}
//   code      a string in a page's frontmatter or in a .ts / .js file
//   script    a string in a page's own <script>
//   joined    an element's whole text when its text is split by tags or {…} ("Settings → <a>Team</a>"); a {…} that
//             is a string ({' '}) reads as that string, any other {…} as "…"
//   css       a CSS content: string
//   manifest  the installed app's name, description and shortcuts
//
// A string made of pieces is also read whole, each way it can read: a template or a '+' chain whose ${…} or piece
// is a `?:` (or || ?? &&) between strings ("…new patient ${n === 1 ? 'form' : 'forms'} waiting"), and an element
// whose {…} is one ("Owes <strong>{n ? 'nothing' : pesos(n)}</strong>"). Such an item carries `covers`: the items
// it is made of, and the ways read before it, so a rule that matched one of those is not counted twice
// (check.mjs, matchItems). Anything in it that is not a string reads "…". At most MAX_WAYS ways a string.
//
// What it skips: comments, <style> (apart from content:), JSON scripts, imports, TypeScript types, object keys,
// the operands of === and switch cases, the arguments of console.*, selectors, attributes, events, fetch, URLs,
// storage, cookies, headers and SQL queries (a callback passed to any of these is still read); and anything
// code-like (isCodeLike: identifiers, paths, selectors, class lists, URLs, SQL), except in a template's own text,
// in one lower-case word written with a space beside it (`el('span', 'unit', ' slots')`), in what is put in an
// element's textContent, title, placeholder, alt or aria-label (`el.textContent = n === 1 ? 'slot' : 'slots'`),
// in attributes that are always words (ALWAYS_WORDS, the data-* in DATA_WORDS, as written or as a string in their
// {…}) and the words a count helper is given (`plural(n, 'invoice')`: a function of the file that picks its
// argument by `n === 1 ? one : many`). Strings that carry HTML have their tags taken out first, and the title,
// aria-label, placeholder and alt in them read on their own. Every string is normalised (normalise: straight
// quotes, no hard spaces, one space between words).
//
// What it never reads: SQL (the migrations hold the sentences built there; see FIXED) and the FIXED files.
//
// Not run on its own: scripts/dev/words/check.mjs and words.test.mjs use it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Astro's parser is a dependency of astro, not of this repository. A hoisting installer puts it at the top of
// node_modules; one that does not keeps it under astro, so ask astro's own location for it.
const { parse } = await (async () => {
  try { return await import('@astrojs/compiler-rs'); }
  catch {
    const astro = createRequire(join(ROOT, 'package.json')).resolve('astro/package.json');
    return import(pathToFileURL(createRequire(astro).resolve('@astrojs/compiler-rs')).href);
  }
})();

// ── The files ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Files whose words are legal, clinical or printed paper, changed only with the owner (and the lawyer or a
 *  dentist where the plan says), or that are no screen at all. The repo check never reads them, except a print
 *  page's screen bar (`bar`: the strip above the paper with Back, the paper size and Print, which never prints, so
 *  it is a screen like any other; SCREEN_BAR names it). Each entry is a path or a glob (`*` within a folder, `**`
 *  across folders) and why. words.test.mjs checks that every entry still matches a file, and that every file
 *  under src is either read or listed here. Files that MIX fixed words with ordinary screen words are read, and
 *  their fixed words are listed as allowed in known.json. */
export const FIXED = [
  // Not read at all: SQL, generated data, tests.
  { glob: 'src/data/migrations/**', why: 'SQL. The check never reads SQL, so the sentences built there are not checked: patient_act()’s answers on My visits (020), the reminder, the two-day reminder and the check-up text (019, 036). They change only through a new migration, and an applied migration is never edited, so a file here keeps its old words for good' },
  { glob: 'src/data/schema.sql', why: 'SQL (see the migrations)' },
  { glob: 'src/data/*.json', why: 'generated image data: blur placeholders and screenshot sizes' },
  { glob: 'src/**/*.test.ts', why: 'unit tests' },
  // Legal words: the privacy notice and the consent forms.
  { glob: 'src/pages/privacy.astro', why: 'the privacy notice itself (privacy-2026-09); new words are a new consent version the lawyer reads' },
  { glob: 'src/lib/consent-library.ts', why: 'the consent forms’ words, pinned by consent_version.body_sha256 (npm run test:consent)' },
  { glob: 'src/components/consent/ConsentDocument.astro', why: 'draws a consent form’s frozen words, the page a signing seals' },
  { glob: 'src/lib/patient-forms-def.ts', why: 'the patient forms’ questions (FORM_VERSION; a change is a new version a dentist reads), TREATMENT_CONSENT and PRIVACY_TICK' },
  { glob: 'src/lib/intake-def.ts', why: 'page 1 of the step-by-step forms, built from the patient forms’ questions, and who may agree to the privacy notice' },
  // Clinical words a dentist reads in the review pack.
  { glob: 'src/lib/aftercare.ts', why: 'the nine aftercare sheets and their evening text, English and Filipino' },
  // Printed papers: every print page, and the papers a clinic hands out. Their screen bars are read (bar).
  { glob: 'src/pages/**/print.astro', why: 'print pages: the statement and acknowledgment, a signed consent form, a patient forms printout, the QR poster', bar: true },
  { glob: 'src/pages/c/[clinic]/patients/[patient]/rx/**', why: 'the printed prescription (A5)', bar: true },
  { glob: 'src/pages/c/[clinic]/patients/[patient]/letters/**', why: 'the printed certificate, referral and clearance letters (A5)', bar: true },
  { glob: 'src/pages/c/[clinic]/patients/[patient]/aftercare/**', why: 'the printed aftercare sheet (A5)', bar: true },
  { glob: 'src/pages/c/[clinic]/patients/[patient]/treatment-record.astro', why: 'the Treatment record on A4 paper', bar: true },
  { glob: 'src/pages/c/[clinic]/patients/qr/_poster.ts', why: 'the QR poster’s printed words, already on clinic walls' },
  { glob: 'src/pages/c/[clinic]/patients/qr/_draw.ts', why: 'draws the QR poster as a 300 dpi PNG' },
];

/** A print page's screen bar: an element whose class says it never prints (Tailwind's print:hidden), or the two
 *  print pages whose stylesheet hides their own bar in print (.fp-bar, .pq-bar). */
export const SCREEN_BAR = /(?:^|\s)(?:print:hidden|fp-bar|pq-bar)(?:\s|$)/;

/** Words outside src that a person sees: the installed app's name and shortcuts, the offline fallback, the
 *  install button. */
export const PUBLIC_FILES = ['public/manifest.webmanifest', 'public/sw.js', 'public/pwa.js'];

/** The kinds of file the reader reads. */
export const SCANNED = /\.(astro|ts|js|mjs|css)$/;

const globRe = (glob) => new RegExp('^' + glob.split(/(\*\*\/|\*\*|\*)/).map((p) =>
  p === '**/' ? '(?:.*/)?' : p === '**' ? '.*' : p === '*' ? '[^/]*' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
const FIXED_RE = FIXED.map((f) => ({ ...f, re: globRe(f.glob) }));

/** The FIXED entry a repository path falls under, or null. */
export function fixedEntry(rel) {
  return FIXED_RE.find((f) => f.re.test(rel)) ?? null;
}

const posix = (p) => p.split(sep).join('/');

/** Every file under src, as repository paths; only those the reader reads unless `all`. */
export function allSourceFiles({ all = false } = {}) {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (all || SCANNED.test(name)) out.push(posix(relative(ROOT, p)));
    }
  })(join(ROOT, 'src'));
  return out.sort();
}

/** The files the repo check reads: src less the FIXED files (a print page stays, for its screen bar), then the
 *  public files. */
export function listFiles() {
  return [...allSourceFiles().filter((f) => { const e = fixedEntry(f); return !e || e.bar; }), ...PUBLIC_FILES];
}

// ── Normalising and telling words from code ─────────────────────────────────────────────────────────────────

/** Straight quotes and apostrophes, no hard or zero-width spaces, one space between words. */
export function normalise(s) {
  return s.normalize('NFC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[     ]/g, ' ')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', middot: '·', hellip: '…',
  rarr: '→', larr: '←', nearr: '↗', minus: '−', times: '×', copy: '©', bull: '•',
  thinsp: ' ', peso: '₱', deg: '°', laquo: '«', raquo: '»', trade: '™', reg: '®',
};
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd') : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const LETTER = /\p{L}/u;
const MARKUP = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/i;
/** A string that carries HTML (a page script building a list), with its tags taken out. */
const stripTags = (s) => decodeEntities(s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<![^>]*>|<\?[^>]*\?>/g, ' ').replace(/<\/?[a-z][^<>]*>/gi, ' '));
/** The attributes in a piece of HTML that a person reads or hears. */
const MARKUP_WORDS = /\s(?:title|aria-label|aria-description|placeholder|alt)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

// Words that put a string of lower-case tokens back into prose, so "a no-show" is not read as two classes.
const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'be', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'it',
  'its', 'this', 'that', 'with', 'by', 'as', 'not', 'no', 'your', 'you', 'we', 'they', 'them', 'their', 'has', 'have',
  'what', 'who', 'when', 'from', 'here', 'there', 'still', 'yet', 'all', 'one', 'can', 'will', 'if', 'but', 'so']);
// Hyphenated words these screens use in prose, which a class list never holds: "no-show balance", "check-up due …".
const PROSE_HYPHEN = /^(no-shows?|walk-ins?|x-rays?|check-ups?|check-ins?|follow-ups?|sign-ins?|e-mails?|part-paid|re-checks?|set-ups?|pick-ups?|co-pays?|in-person|on-site|one-time|up-to-date|day-to-day)$/;
const SQL_ID = /\$\d|\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\b[a-z]{1,3}\.[a-z_]{2,}\b|::[a-z]|\b(coalesce|nullif|count|sum|now|jsonb?_[a-z_]+|array_agg|string_agg|to_char|date_trunc|greatest|least|exists|lower|upper)\s*\(/;
const SQL_IDS = new RegExp(SQL_ID.source, 'g');
const SQL_WORD = /\b(select|from|where|join|into|update|delete|values|returning|on conflict|group by|order by|limit|coalesce|exists|between|ilike|union|having|offset|distinct|is (not )?null|nulls (first|last)|asc|desc|interval|case when)\b|\bin \(|\) as [a-z_]+\b|[<>=]/i;
const SQL_START = /^\(?\s*(select|insert into|update [a-z_]+ set|delete from|with [a-z_]+ as \(|create |alter |drop |grant |revoke |set local|lock table)\b/; // lower case, as this repository writes SQL

/** Lower-case tokens that are prose, not a class list: a word with a colon after it ("allergy: …", "…: closed"),
 *  a sentence's full stop, a word pair with a slash ("slots/day"), or a hyphenated English word ("walk-in"). A
 *  media query's "(max-width: 900px)" is not prose (the caller tests it first). */
const prosy = (s, toks) => toks.some((t) => /[a-z…]:$/.test(t)) || /[a-z…][.!?]["')]?$/.test(s)
  || toks.some((t) => /^[a-z]{2,}\/[a-z]{2,}$/.test(t)) || toks.some((t) => PROSE_HYPHEN.test(t.replace(/[^a-z-]/g, '')));

/** True when a string is code rather than words: no letter, an identifier, a path or URL, a selector, a class
 *  list, a key, a header value, a media query, SQL. A template's own text is never put through this (it is words
 *  by definition). A "…" (where a template literal had an expression) counts as nothing, so `rec-ahead-${id}` is
 *  still a key. */
export function isCodeLike(raw) {
  const s = raw.trim();
  const bare = s.replace(/…/g, '');
  if (!LETTER.test(bare)) return true;
  if (/^(https?:|mailto:|tel:|sms:|data:|blob:|javascript:|\/\/)/i.test(bare) || /:\/\//.test(s) && !/\s/.test(s)) return true;
  const toks = s.split(/\s+/);
  if (toks.length === 1) {
    if (/^\(?[A-Z][a-z]+(?:\(s\)|\/[a-z]+)*\)?:?[.,;!?]?$/.test(bare)) return false; // Balance:, (Completed), Appointment(s), Invoice/receipt
    if (/^[/.#[?&]/.test(bare)) return true;                         // a path, a selector, a hash, a query
    if (/[_:=/[\]{}()<>@$\\|*^~`;]/.test(bare)) return true;          // a key, a hook, a namespace, code
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TEXTAREA|SELECT|BUTTON|INPUT|DIV|SPAN|FORM|LABEL|OPTION|DETAILS|DIALOG)$/.test(bare)) return true; // an HTTP method, a tagName
    if (/[^\x00-\x7f]/.test(bare)) return false;                       // ₱800, Café, a word with ’
    if (/^[a-z0-9.\-']+$/.test(bare)) return true;                    // an identifier, a kebab-case key, a file name
    if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(bare)) return true;          // camelCase
    return false;                                                       // a capitalised word: Save, Booked, PRC
  }
  if (/^[/.#[]/.test(s) && !/\s[A-Za-z]{2,}\s/.test(s.slice(1))) return true;  // a path or selector list
  if (/^<([/?!]?[a-z][a-z0-9-]*)(\s|$)/i.test(s)) return true;                     // a piece of markup: <html data-x="…", <?xml …
  if (/\[(aria|data)-[a-z-]+|^[a-z]*\[[a-z-]+[~|^$*]?=/.test(s)) return true;   // a selector
  if (/^\(\s*(?:min-|max-)?(?:width|height|resolution|aspect-ratio)\s*:|^\(\s*(?:prefers-[a-z-]+|hover|pointer|orientation)\s*:/.test(s)) return true; // a media query
  if (/^[a-z]+\/[a-z0-9.+-]+\s*(;|$)|^(attachment|inline)\s*;|\bcharset=/i.test(s)) return true; // a header value
  if (toks.every((t) => /^[a-z][a-z0-9:-]*=(["']).*\1$/.test(t))) return true;  // attributes: width="…" height="…"
  // SQL, or a piece of one: a statement's opening, or a snake_case column, a $1 or an a.column beside SQL words.
  // Prose has none of those ("Where it is from" stays words).
  if ((SQL_START.test(s) && (SQL_ID.test(s) || SQL_WORD.test(s))) || (SQL_ID.test(s) && SQL_WORD.test(s)) || (s.match(SQL_IDS) ?? []).length >= 3) return true;
  if (/^\(\s*'[^']*'(\s*,\s*'[^']*')*\s*\)$/.test(s)) return true;               // a SQL list: ('issued', 'paid')
  if (/'(self|none|unsafe-inline)'|^[a-z-]+=\(/.test(s)) return true;                // a security header's value
  if (toks.every((t) => /^!?[a-z0-9_\-:[\]/.%#()&>*@=,+~'"…]+$/.test(t)) && toks.some((t) => /[-:[\]/]/.test(t)) && !toks.some((t) => STOP.has(t)) && !prosy(s, toks)) return true; // a class list
  if (/^[a-z_$][\w$]*\s*\(.*\)\s*;?$/.test(s) || /=>|\breturn\b.*;|[{};]\s*$/.test(s) && /[=:(]/.test(s) && !/[.!?]["')]?$/.test(s)) return true; // a line of code
  return false;
}

// ── Attributes ──────────────────────────────────────────────────────────────────────────────────────────────

const DENY_ATTR = new Set(['class', 'class:list', 'id', 'href', 'src', 'srcset', 'name', 'for', 'type', 'style', 'rel',
  'method', 'action', 'autocomplete', 'pattern', 'inputmode', 'role', 'slot', 'lang', 'dir', 'target', 'form', 'accept',
  'enctype', 'loading', 'decoding', 'sizes', 'width', 'height', 'min', 'max', 'step', 'tabindex', 'viewBox', 'viewbox',
  'd', 'fill', 'stroke', 'xmlns', 'key', 'poster', 'media', 'points', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y',
  'x1', 'x2', 'y1', 'y2', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'formaction',
  'formmethod', 'list', 'nonce', 'integrity', 'crossorigin', 'referrerpolicy', 'http-equiv', 'charset', 'enterkeyhint',
  'datetime', 'preserveAspectRatio', 'focusable', 'maxlength', 'minlength', 'colspan', 'rowspan', 'scope', 'headers']);
/** Props of a component that are never words. */
const COMPONENT_DENY = new Set(['id', 'href', 'src', 'srcset', 'style', 'key', 'slot', 'for']);
/** aria-* attributes a screen reader says. Every other aria-* holds an id, a state or a number. */
const ARIA_WORDS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder']);
/** data-* attributes a page script turns into words (each found where a script reads it: the comment names the
 *  reader). Every other data-* is a hook. */
const DATA_WORDS = [
  /^data-sec$/,                // index.astro: the bar's room pill, readout.textContent = dataset.sec
  /^data-label(-[a-z]+)?$/,    // intake/[intake].astro go.textContent = dataset.label; Letters.astro per-kind labels; book.astro chosenLabel
  /^data-busy$/,               // auth/code.astro, auth/forgot.astro: the button's words while it works
  /^data-confirm$/,            // Treatment.astro and the record's forms: confirm(dataset.confirm)
  /^data-title$/,              // admin pages: the panel title, title.textContent = dataset.title
  /^data-meta$/,               // admin pages: the panel's line under the title
  /^data-placeholder-[a-z]+$/, // Letters.astro: el.placeholder = dataset.placeholderClearance
  /^data-f-empty$/,            // finances/_Claims.astro: el.textContent = dataset.fEmpty
  /^data-fold-word$/,          // Treatment.astro: "Show 3 more lab cases"
  /^data-tip$/,                // find/index.astro: tipText.textContent = dataset.tip
  /^data-tooth-work-words$/,   // Odontogram.astro: the work sentence in a tooth's label
  /^data-(own|shared)-hint$/,  // entry/SignInForm.astro: the device line under This device
  /^data-loa-payor$/,          // _record/Loas.astro: meta.textContent = dataset.loaPayor
  /^data-full$/,               // sign/[visit].astro and the calendar: a name put back into a field or a card
];
/** Attributes whose every value is words: only "has a letter" applies to them, not the code test. */
const ALWAYS_WORDS = new Set(['title', 'placeholder', 'alt', 'label', ...ARIA_WORDS]);

const attrName = (n) => n?.type === 'JSXNamespacedName' ? `${n.namespace.name}:${n.name.name}` : n?.name ?? '';
const tagName = (n) => n?.type === 'JSXIdentifier' ? n.name : n?.type === 'JSXMemberExpression' ? `${tagName(n.object)}.${n.property.name}` : n?.type === 'JSXNamespacedName' ? `${n.namespace.name}:${n.name.name}` : '';

function attrIsWords(name, tag, attrs) {
  if (/^(is|set|define|transition|client|server):/.test(name) || name.startsWith('popover')) return false;
  if (name.startsWith('aria-')) return ARIA_WORDS.has(name);
  if (name.startsWith('data-')) return DATA_WORDS.some((re) => re.test(name));
  if (/^on[a-z]+$/.test(name)) return false;
  if (/class/i.test(name)) return false;                          // class, bodyClass, paneClass …: class lists
  if (name === 'value' && tag === 'input' && attrs.some((a) => attrName(a.name) === 'type' && a.value?.value === 'hidden')) return false;
  // A component's props are its own: `action={{ label: 'Book the first one', href }}` on <Empty> is words, not a
  // form's action. Only the props that are addresses or styling are left out; the code test does the rest.
  if (/^[A-Z]|\./.test(tag)) return !COMPONENT_DENY.has(name);
  return !DENY_ATTR.has(name);
}

// ── Code: what a string inside a program is for ─────────────────────────────────────────────────────────────

/** Calls whose arguments are never words (the last part of the callee). A function passed to one is still read. */
const ARGS_NOT_WORDS = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById',
  'getElementsByClassName', 'getElementsByTagName', 'getAttribute', 'hasAttribute', 'removeAttribute',
  'toggleAttribute', 'dispatchEvent', 'removeEventListener', 'fetch', 'require', 'importScripts', 'getItem',
  'setItem', 'removeItem', 'query', 'get', 'has', 'getAll', 'delete', 'includes', 'startsWith', 'endsWith',
  'indexOf', 'lastIndexOf', 'split', 'match', 'matchAll', 'search', 'test', 'exec', 'padStart', 'padEnd',
  'normalize', 'join', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'setProperty',
  'getPropertyValue', 'removeProperty', 'createElement', 'createElementNS', 'postMessage', 'open', 'replaceState',
  'pushState', 'assign', 'register', 'mark', 'measure', 'localeCompare', 'getModifierState', 'matchMedia']);
/** Calls whose FIRST argument, when it is a string, is a name (an event, a key, a pattern) and the rest may be
 *  words. (Element.append is not here: its first argument is what goes on the page.) */
const FIRST_NOT_WORDS = new Set(['addEventListener', 'on', 'once', 'set', 'replace', 'replaceAll']);
/** Objects whose calls never take words: console.*, classList.*, url.searchParams.*, cookies.*, headers.* … */
const OBJECTS_NOT_WORDS = new Set(['console', 'classList', 'searchParams', 'cookies', 'headers', 'localStorage',
  'sessionStorage', 'style', 'Intl', 'crypto', 'process', 'caches', 'indexedDB']);
/** `new X(…)` whose arguments are never words. */
const NEW_NOT_WORDS = /^(RegExp|URL|URLSearchParams|CustomEvent|Event|Date|Intl\..+|Request|Headers|Worker|SharedWorker|BroadcastChannel|IntersectionObserver|ResizeObserver|MutationObserver)$/;
/** Properties whose assigned value is never words. */
const PROPS_NOT_WORDS = new Set(['className', 'id', 'href', 'src', 'type', 'name', 'rel', 'target', 'method', 'action',
  'htmlFor', 'autocomplete', 'inputMode', 'pattern', 'accept', 'cssText', 'display', 'hash', 'search', 'pathname', 'role']);
const ATTR_WORD_NAMES = new Set([...ALWAYS_WORDS, 'value']);
/** Properties whose assigned value is always words, however short: `el.textContent = n === 1 ? 'slot' : 'slots'`. */
const PROPS_WORDS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'alt', 'ariaLabel', 'ariaDescription', 'ariaValueText']);
const COMPARE = new Set(['===', '!==', '==', '!=', 'in', 'instanceof']);
const TS_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'TSInstantiationExpression']);
const SKIP_KEYS = new Set(['typeAnnotation', 'returnType', 'typeParameters', 'typeArguments', 'superTypeArguments', 'superTypeParameters', 'implements', 'decorators', 'start', 'end', 'range', 'loc']);
/** Nodes through which an always-words attribute's {…} stays words: the strings it is made of, not a call's
 *  arguments inside it. */
const KEEP_ALWAYS = new Set(['JSXExpressionContainer', 'ConditionalExpression', 'LogicalExpression', 'TemplateLiteral',
  'Literal', 'ParenthesizedExpression', 'BinaryExpression', ...TS_WRAPPERS]);

function calleePath(c) {
  if (!c) return '';
  switch (c.type) {
    case 'Identifier': return c.name;
    case 'MemberExpression': return `${calleePath(c.object)}.${c.computed ? '[]' : c.property?.name ?? ''}`;
    case 'CallExpression': return `${calleePath(c.callee)}()`;
    case 'ChainExpression': case 'ParenthesizedExpression': return calleePath(c.expression);
    case 'ThisExpression': return 'this';
    default: return TS_WRAPPERS.has(c.type) ? calleePath(c.expression) : '?';
  }
}
const isStr = (n) => n && ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral');
const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');
const cooked = (q) => q.value.cooked ?? q.value.raw;
const unwrap = (n) => n && (n.type === 'ParenthesizedExpression' || TS_WRAPPERS.has(n.type)) ? unwrap(n.expression) : n;
const range = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** Every node under a node, depth first. */
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, fn); return; }
  if (typeof node.type === 'string') fn(node);
  for (const [k, v] of Object.entries(node)) if (k !== 'start' && k !== 'end' && v && typeof v === 'object') walk(v, fn);
}

/** The count helpers a file defines: a function that picks one of its own arguments by `x === 1 ? one : many`
 *  (`plural(n, 'invoice')`, `n(k, 'visit', 'visits')`). The words it is given are words, however short. */
function countHelpers(ast) {
  const names = new Set();
  const isOne = (t) => t?.type === 'BinaryExpression' && (t.operator === '===' || t.operator === '==') && [t.left, t.right].some((x) => x?.type === 'Literal' && x.value === 1);
  const picksArg = (fn) => {
    const params = new Set((fn.params ?? []).map((p) => (p.type === 'AssignmentPattern' ? p.left : p)?.name).filter(Boolean));
    let yes = false;
    walk(fn.body, (n) => { if (n.type === 'ConditionalExpression' && isOne(n.test) && [n.consequent, n.alternate].some((b) => b?.type === 'Identifier' && params.has(b.name))) yes = true; });
    return yes;
  };
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && isFn(n.init) && picksArg(n.init)) names.add(n.id.name);
    if (n.type === 'FunctionDeclaration' && n.id?.name && picksArg(n)) names.add(n.id.name);
  });
  return names;
}

/** At most this many ways one string can read (see the header). */
const MAX_WAYS = 24;
const ways = (lists) => {
  let out = [''];
  for (const l of lists) { out = out.flatMap((s) => l.map((x) => s + x)); if (out.length > MAX_WAYS) return null; }
  return [...new Set(out)];
};
/** The ways an expression made of strings can read: a string, a template, a `?:` or || ?? && between strings, a
 *  '+' chain. What is not a string reads "…". null when nothing in it is a string (it is code) or there are more
 *  than MAX_WAYS ways. */
function renderings(node) {
  const n = unwrap(node);
  if (!n) return null;
  switch (n.type) {
    case 'Literal': return typeof n.value === 'string' && !n.regex ? [n.value] : null;
    case 'TemplateLiteral': {
      const parts = [[cooked(n.quasis[0])]];
      n.expressions.forEach((e, i) => { parts.push(renderings(e) ?? ['…'], [cooked(n.quasis[i + 1])]); });
      return ways(parts);
    }
    case 'ConditionalExpression': return either(n.consequent, n.alternate);
    case 'LogicalExpression': {
      if (n.operator !== '&&') return either(n.left, n.right);
      const r = renderings(n.right);
      return r ? [...new Set([...r, ''])] : null;
    }
    case 'BinaryExpression': {
      if (n.operator !== '+') return null;
      const ops = chain(n);
      return ops.some((o) => isStr(unwrap(o))) ? ways(ops.map((o) => renderings(o) ?? ['…'])) : null;
    }
    default: return null;
  }
}
function either(a, b) {
  const ra = renderings(a), rb = renderings(b);
  if (!ra && !rb) return null;
  const out = [...new Set([...(ra ?? ['…']), ...(rb ?? ['…'])])];
  return out.length > MAX_WAYS ? null : out;
}
/** The operands of a '+' chain, left to right. */
const chain = (n) => {
  const u = unwrap(n);
  return u?.type === 'BinaryExpression' && u.operator === '+' ? [...chain(u.left), ...chain(u.right)] : [n];
};

// ── CSS ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The quoted strings of every `content:` declaration in a stylesheet, with their offsets. */
function cssContents(css) {
  const out = [];
  const blanked = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  for (const m of blanked.matchAll(/(?<![\w-])content\s*:([^;}]*)/g)) {
    const at = m.index + m[0].length - m[1].length;
    for (const q of m[1].matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)) {
      const value = q[2].replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
      out.push({ value, offset: at + q.index });
    }
  }
  return out;
}

// ── One file ────────────────────────────────────────────────────────────────────────────────────────────────

/** Line starts of a source, to turn an offset into a line. */
function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; };
}

/** Parse, or fail with where. `addedLines` is how many lines the caller put before the source (a .ts file is
 *  wrapped in a frontmatter fence), so the line named is the file's own. */
function parseOrThrow(path, input, addedLines = 0) {
  const { ast, diagnostics } = parse(input);
  const errors = (diagnostics ?? []).filter((d) => d.severity === 'error');
  if (errors.length) {
    const where = errors.map((d) => { const l = d.labels?.[0]; return `${l?.line ? Math.max(1, l.line - addedLines) : '?'}:${l?.column ?? '?'} ${d.text}`; }).join('; ');
    throw new Error(`words check: ${path} does not parse (${where})`);
  }
  return ast;
}

/** The visible strings of one file: [{ text, line, kind }] (some carry `covers`, see the header). Options:
 *  { dropped: true } also returns the code-like strings it would leave out, marked `dropped: true` (for probing
 *  the filter); { only: RegExp } reads only inside elements whose class matches it (a print page's screen bar). */
export function extract(path, source, { dropped = false, only = null } = {}) {
  const items = [];
  const ext = (path.match(/\.([a-z]+)$/i)?.[1] ?? '').toLowerCase();
  if (ext === 'css') {
    const line = lineIndex(source);
    for (const c of cssContents(source)) pushText(items, c.value, line(c.offset), 'css');
    return items;
  }
  if (ext === 'webmanifest' || ext === 'json') return manifestWords(path, source);
  if (!['astro', 'ts', 'js', 'mjs'].includes(ext)) throw new Error(`words check: ${path} is not a kind of file the words check reads (.astro .ts .js .mjs .css .webmanifest .json)`);

  const wrapped = ext !== 'astro';
  const input = wrapped ? `---\n${source}\n---\n` : source;
  const shift = wrapped ? 4 : 0;
  const ast = parseOrThrow(path, input, wrapped ? 1 : 0);
  const lineOf = lineIndex(source);
  const line = (off) => lineOf(Math.max(0, Math.min(source.length - 1, off - shift)));
  const textIdx = new Map();   // JSXText node → its item
  const nodeIdx = new Map();   // a string literal or template → its item
  const joinedIdx = new Map(); // element → its joined item
  const helpers = countHelpers(ast);
  let inBar = 0;               // with `only`: how deep inside a matching element

  const add = (text, off, kind, extra) => {
    if (only && !inBar) return -1;
    items.push({ text, line: line(off), kind, ...extra });
    return items.length - 1;
  };
  /** Add a string (tags taken out, the words in its tags read on their own) unless it is code; its item or -1. */
  const addString = (value, off, ctx, { node = null, covers = null, tagWords = true } = {}) => {
    let s = value;
    if (MARKUP.test(s)) {
      if (tagWords) for (const m of s.matchAll(MARKUP_WORDS)) {
        const w = normalise(decodeEntities(m[1] ?? m[2]));
        if (w && LETTER.test(w.replace(/…/g, ''))) add(w, off, ctx.kind);
      }
      s = stripTags(s);
    } else if (/&(#x?[0-9a-f]+|[a-z]+);/i.test(s)) s = decodeEntities(s);   // 'No&nbsp;show' with no tags
    s = normalise(s);
    if (!s || !LETTER.test(s)) return -1;
    // One lower-case word with a space beside it (' slots', 'today ') is put beside other words, never a key.
    const besideWords = /^\s+[a-z]+\s*$|^\s*[a-z]+\s+$/.test(value);
    if (!ctx.always && !besideWords && isCodeLike(s)) { if (dropped) add(s, off, ctx.kind, { dropped: true }); return -1; }
    const i = add(s, off, ctx.kind, covers ? { covers } : undefined);
    if (node && i >= 0) nodeIdx.set(node, i);
    return i;
  };
  /** The other ways a string made of pieces reads (renderings), each covering the pieces and the ways before it. */
  const addWays = (list, base, off, ctx, covers) => {
    if (!list) return;
    const seen = new Set([normalise(MARKUP.test(base) ? stripTags(base) : base)]);
    const mine = [];
    for (const w of list) {
      const key = normalise(MARKUP.test(w) ? stripTags(w) : w);
      if (seen.has(key)) continue;
      seen.add(key);
      const i = addString(w, off, ctx, { covers: [...covers, ...mine], tagWords: false });
      if (i >= 0) mine.push(i);
    }
  };

  const visitChildren = (kids, ctx) => { for (const k of kids ?? []) visit(k, ctx); };

  function visitElement(el, ctx) {
    const tag = tagName(el.openingElement.name);
    const attrs = el.openingElement.attributes ?? [];
    if (tag === 'style') {
      if (!only) for (const k of el.children ?? []) if (k.type === 'JSXText') for (const c of cssContents(k.value)) pushText(items, c.value, line(k.start + c.offset), 'css');
      return;
    }
    if (tag === 'script') {
      const type = attrs.find((a) => attrName(a.name) === 'type')?.value?.value;
      if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) return; // JSON, speculation rules
      const vars = attrs.find((a) => attrName(a.name) === 'define:vars')?.value;  // values the script uses
      if (vars) visit(vars, { kind: 'script' });
      for (const k of el.children ?? []) if (k.type === 'AstroScript' && k.program) visit(k.program, { kind: 'script' });
      return;
    }
    const cls = attrs.find((a) => attrName(a.name) === 'class')?.value;
    const bar = !!only && cls?.type === 'Literal' && only.test(String(cls.value));
    if (bar) inBar++;
    for (const a of attrs) {
      if (a.type === 'JSXSpreadAttribute') { visit(a.argument, { kind: 'attr' }); continue; }
      const name = attrName(a.name);
      if (!a.value) continue;
      if (name === 'set:html' || name === 'set:text') {             // the element's content, given as a string
        if (a.value.type === 'Literal') addString(String(a.value.value), a.value.start, { kind: 'text', always: true });
        else visit(a.value, { kind: 'expr' });
        continue;
      }
      if (!attrIsWords(name, tag, attrs)) continue;
      const always = ALWAYS_WORDS.has(name) || name.startsWith('data-');
      if (a.value.type === 'Literal') addString(decodeEntities(String(a.value.value)), a.value.start, { kind: 'attr', always });
      else visit(a.value, { kind: 'attr', always });
    }
    const from = items.length;
    visitChildren(el.children, ctx);
    joined(el, from);
    if (bar) inBar--;
  }

  // An element whose text is split by tags or {…}: its whole text, once, so a phrase across a tag is seen; and
  // each other way it reads when a {…} is a choice between strings.
  const BLOCK = new Set(['div', 'p', 'li', 'ul', 'ol', 'section', 'article', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th', 'dt', 'dd', 'dl', 'table', 'br', 'hr', 'form', 'fieldset', 'legend', 'label', 'details', 'summary', 'option', 'select', 'nav', 'aside', 'main']);
  /** An element's flow as segments: a string, or { alt } for a {…} (alt: the ways it reads, null for "…"). */
  function flow(node, segs, covers) {
    switch (node.type) {
      case 'JSXText': segs.push(decodeEntities(node.value)); if (textIdx.has(node)) covers.push(textIdx.get(node)); return;
      case 'JSXExpressionContainer': {
        const e = unwrap(node.expression);
        if (!e || e.type === 'JSXEmptyExpression') return;
        const plain = e.type === 'Literal' && typeof e.value === 'string' ? e.value
          : e.type === 'TemplateLiteral' && !e.expressions.length ? cooked(e.quasis[0]) : null;
        if (plain !== null) { segs.push(plain); if (nodeIdx.has(e)) covers.push(nodeIdx.get(e)); return; } // {' '}
        segs.push({ alt: renderings(e) });
        return;
      }
      case 'JSXFragment': for (const k of node.children ?? []) flow(k, segs, covers); return;
      case 'JSXElement': {
        const tag = tagName(node.openingElement.name);
        if (tag === 'script' || tag === 'style') { segs.push(' '); return; }
        const block = BLOCK.has(tag);
        if (block) segs.push(' ');
        for (const k of node.children ?? []) flow(k, segs, covers);
        if (joinedIdx.has(node)) covers.push(joinedIdx.get(node));
        if (block) segs.push(' ');
        return;
      }
      default: return;
    }
  }
  function joined(el, from) {
    const kids = el.children ?? [];
    const hasText = kids.some((k) => k.type === 'JSXText' && LETTER.test(decodeEntities(k.value)));
    const hasOther = kids.some((k) => (k.type === 'JSXElement' && !['script', 'style'].includes(tagName(k.openingElement.name)))
      || k.type === 'JSXFragment' || (k.type === 'JSXExpressionContainer' && k.expression?.type !== 'JSXEmptyExpression'));
    if (!hasText || !hasOther) return;
    const segs = [], covers = [];
    for (const k of kids) flow(k, segs, covers);
    const text = normalise(segs.map((s) => typeof s === 'string' ? s : '…').join(''));
    if (!LETTER.test(text)) return;
    const j = add(text, el.start, 'joined', { covers });
    if (j >= 0) joinedIdx.set(el, j);
    if (!segs.some((s) => typeof s !== 'string' && s.alt)) return;
    const all = ways(segs.map((s) => typeof s === 'string' ? [s] : s.alt ?? ['…']));
    if (!all) return;
    const subtree = range(from, items.length); // the pieces, the base and everything inside
    const seen = new Set([text]), mine = [];
    for (const w of all) {
      const t = normalise(w);
      if (seen.has(t) || !LETTER.test(t)) continue;
      seen.add(t);
      const i = add(t, el.start, 'joined', { covers: [...subtree, ...mine] });
      if (i >= 0) mine.push(i);
    }
  }

  function visitCall(node, ctx) {
    visit(node.callee, ctx);
    const path = calleePath(node.callee);
    const parts = path.split('.').map((p) => p.replace(/\(\)$/, ''));
    const last = parts.at(-1);
    const args = node.arguments ?? [];
    const callbacks = () => visit(args.filter(isFn), ctx); // a function passed to a call is read, whatever the call
    if (path === 'Object.assign') {                          // Object.assign(el, { textContent: '…' }), but never a style
      if (/(^|\.)style$/.test(calleePath(args[0]))) return callbacks();
      return visit(args, ctx);
    }
    if (parts.some((p) => OBJECTS_NOT_WORDS.has(p)) || ARGS_NOT_WORDS.has(last)) return callbacks();
    if (last === 'setAttribute') {
      const name = args[0]?.type === 'Literal' ? String(args[0].value) : '';
      if (ATTR_WORD_NAMES.has(name) || DATA_WORDS.some((re) => re.test(name))) visit(args.slice(1), ctx);
      else callbacks();
      return;
    }
    if (node.callee?.type === 'Identifier' && helpers.has(path)) {
      for (const a of args) visit(a, isStr(a) ? { ...ctx, always: true } : ctx);
      return;
    }
    if (FIRST_NOT_WORDS.has(last)) { if (!isStr(args[0])) visit(args[0], ctx); visit(args.slice(1), ctx); return; }
    visit(args, ctx);
  }

  function visit(node, ctx) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) visit(n, ctx); return; }
    if (ctx.always && !KEEP_ALWAYS.has(node.type)) ctx = { ...ctx, always: false };
    switch (node.type) {
      case 'JSXElement': return visitElement(node, ctx);
      case 'JSXFragment': { const from = items.length; visitChildren(node.children, ctx); return joined(node, from); }
      case 'JSXText': {
        const s = normalise(decodeEntities(node.value));
        if (s && LETTER.test(s)) { const i = add(s, node.start, 'text'); if (i >= 0) textIdx.set(node, i); }
        return;
      }
      case 'JSXExpressionContainer':
        if (node.expression?.type === 'JSXEmptyExpression') return;
        return visit(node.expression, { ...ctx, kind: ctx.kind === 'attr' ? 'attr' : 'expr' });
      case 'JSXEmptyExpression': case 'AstroComment': case 'AstroDoctype': case 'AstroScript': return;
      case 'ImportDeclaration': case 'ExportAllDeclaration': case 'ImportExpression': case 'TaggedTemplateExpression': return;
      case 'ExportNamedDeclaration': return visit(node.declaration, ctx);
      case 'Literal':
        if (typeof node.value === 'string' && !node.regex) addString(node.value, node.start, ctx, { node });
        return;
      case 'TemplateLiteral': {
        const base = node.quasis.map(cooked).join('…');
        const b = addString(base, node.start, ctx, { node });
        const from = items.length;
        visit(node.expressions, { ...ctx, always: false }); // a piece is not the words; the whole and its ways are
        if (node.expressions.length) addWays(renderings(node), base, node.start, ctx, [...(b >= 0 ? [b] : []), ...range(from, items.length)]);
        return;
      }
      case 'Property': case 'PropertyDefinition': case 'MethodDefinition': case 'AccessorProperty':
        if (node.computed && !isStr(node.key)) visit(node.key, ctx);
        return visit(node.value, ctx);
      case 'MemberExpression':
        visit(node.object, ctx);
        if (node.computed && !isStr(node.property)) visit(node.property, ctx);
        return;
      case 'BinaryExpression':
        if (COMPARE.has(node.operator)) { for (const side of [node.left, node.right]) if (!isStr(side)) visit(side, ctx); return; }
        if (node.operator === '+') {
          const ops = chain(node);
          if (!ops.some((o) => isStr(unwrap(o)))) break;
          // A '+' chain of strings: each piece as it is, then the whole, and each way it reads.
          const from = items.length;
          visit(ops, { ...ctx, always: false });
          const pieces = range(from, items.length);
          const base = ops.map((o) => { const u = unwrap(o); return u.type === 'Literal' && typeof u.value === 'string' ? u.value : u.type === 'TemplateLiteral' ? u.quasis.map(cooked).join('…') : '…'; }).join('');
          const b = addString(base, node.start, ctx, { covers: pieces });
          addWays(renderings(node), base, node.start, ctx, [...pieces, ...(b >= 0 ? [b] : [])]);
          return;
        }
        break;
      case 'SwitchCase': return visit(node.consequent, ctx);
      case 'CallExpression': return visitCall(node, ctx);
      case 'NewExpression':
        if (NEW_NOT_WORDS.test(calleePath(node.callee))) return;
        break;
      case 'AssignmentExpression': {
        const l = node.left;
        if (l?.type === 'MemberExpression' && !l.computed) {
          const prop = l.property?.name ?? '';
          const obj = calleePath(l.object).split('.');
          if (PROPS_NOT_WORDS.has(prop) || obj.includes('style') || (obj.at(-1) === 'dataset' && !DATA_WORDS.some((re) => re.test(`data-${prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)))) return;
          if (PROPS_WORDS.has(prop) && node.operator === '=') { visit(node.left, ctx); return visit(node.right, { ...ctx, always: true }); }
        }
        break;
      }
      case 'ExpressionStatement':
        if (node.directive) return;
        break;
    }
    if (typeof node.type === 'string' && node.type.startsWith('TS')) {
      if (TS_WRAPPERS.has(node.type)) visit(node.expression, ctx);
      return; // types, interfaces, enums, declare blocks
    }
    for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k) && v && typeof v === 'object') visit(v, ctx);
  }

  if (ast.frontmatter?.program) visit(ast.frontmatter.program, { kind: 'code' });
  visitChildren(ast.body, { kind: 'expr' });
  return items;
}

function pushText(items, value, line, kind) {
  const s = normalise(value);
  if (s && LETTER.test(s)) items.push({ text: s, line, kind });
}

/** The installed app's words: name, short name, description, and each shortcut's. */
function manifestWords(path, source) {
  let m;
  try { m = JSON.parse(source); } catch (e) { throw new Error(`words check: ${path} is not JSON (${e.message})`); }
  const items = [];
  const lineOf = lineIndex(source);
  const used = new Set();
  const lineFor = (key, value) => {
    const re = new RegExp(`"${key}"\\s*:\\s*${JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    for (const hit of source.matchAll(re)) if (!used.has(hit.index)) { used.add(hit.index); return lineOf(hit.index); }
    return 1;
  };
  const take = (obj) => { for (const key of ['name', 'short_name', 'description']) if (typeof obj?.[key] === 'string') pushText(items, obj[key], lineFor(key, obj[key]), 'manifest'); };
  take(m);
  for (const s of m.shortcuts ?? []) take(s);
  return items;
}

/** Read and extract one repository file. A fixed print page gives only its screen bar (FIXED, `bar`). */
export function extractFile(rel, options = {}) {
  const only = fixedEntry(rel)?.bar ? SCREEN_BAR : null;
  return extract(rel, readFileSync(join(ROOT, rel), 'utf8'), only ? { ...options, only } : options);
}
