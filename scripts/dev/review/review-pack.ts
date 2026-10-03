// The review pack: every word a dentist and the owner's lawyer must read before a clinic depends on it, drawn
// straight from the code, so the pack can never differ from what the site shows.
//
//   npm run review:pack        → docs/review/review-pack.html (one self-contained page; print it, or publish it)
//
// What is in it: the ten consent forms and the general consent (src/lib/consent-library.ts) with every line,
// conditional lines marked with when they show, the clinic's part, the patient's questions, the ticks and the
// decision words, and each version's fingerprint (what CONSENT_REVIEWED is signed against); the chart's codes, as the
// paper chart writes them and the four of ours (src/data/demo.ts, migration 045), and the chart's offer
// after a treatment (src/lib/chart-offer.ts and migration 042's defaults); the nine aftercare sheets in English
// and Filipino (src/lib/aftercare.ts); what the next privacy notice has to name; and the three scheduling choices each clinic makes (044).
// Nothing here is a database read; it needs no server. Re-run it whenever words change, and send the new copy.
import { writeFileSync, mkdirSync } from 'node:fs';
import { TEMPLATES, CONSENT_REVIEWED, CODES, type Template, type Line, type Run, type Cond, type Bi } from '../../../src/lib/consent-library.ts';
import { libraryHash, shortSeal } from '../../../src/lib/consent-seal.ts';
import { chartOffer, offerWords, CHART_EFFECTS } from '../../../src/lib/chart-offer.ts';
import { CONDITION_CODE, CODE_LEGEND, CONDITION_LABEL, SURFACE_SCOPED } from '../../../src/data/demo.ts';
import { AFTERCARE } from '../../../src/lib/aftercare.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const OUT = new URL('../../../docs/review/review-pack.html', import.meta.url);
const today = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date());

const VARS: Record<string, string> = { signer: 'the signer’s name', relation: 'their relation', reader: 'who read it aloud', ground: 'the ground', who: 'who they are', what: 'what is agreed to', by: 'by whom' };
function runs(t: Template, rs: readonly Run[] | undefined): string {
  if (!rs) return '';
  return rs.map((r) => {
    if (typeof r === 'string') return esc(r);
    if ('f' in r) {
      const label = t.clinicFields.find((f) => f.name === r.f)?.label ?? r.f;
      return `<span class="slot">${r.style === 'tooth' ? 'tooth / teeth ' : ''}[${esc(label.toLocaleLowerCase('en'))}]</span>`;
    }
    if ('dentist' in r) return '<span class="slot">[the dentist]</span>';
    if ('patient' in r) return '<span class="slot">[the patient]</span>';
    if ('lang' in r) return '<span class="slot">[the language]</span>';
    return `<span class="slot">[${esc(VARS[r.v] ?? r.v)}]</span>`;
  }).join('');
}
function cond(t: Template, c: Cond | undefined): string {
  if (!c) return '';
  const label = (f: string) => (t.clinicFields.find((x) => x.name === f)?.label ?? f).toLocaleLowerCase('en');
  if ('all' in c) return c.all.map((x) => cond(t, x)).join(' and ');
  if ('not' in c) return `not (${cond(t, c.not)})`;
  if ('minor' in c) return c.minor ? 'the patient is under 18' : 'the patient is 18 or over';
  if ('has' in c) return `${label(c.has)} is filled in`;
  if ('teethIn' in c) return `the teeth include ${c.teethIn.join(', ')}`;
  const f = t.clinicFields.find((x) => x.name === c.f);
  const names = c.in.map((v) => f?.choices?.find((ch) => ch.value === v)?.label ?? v);
  return `${label(c.f)} is ${names.join(' or ')}`;
}
const when = (t: Template, c: Cond | undefined) => (c ? `<span class="when">Shown when ${esc(cond(t, c))}</span>` : '');
const line = (t: Template, l: Line) => `<p class="en">${runs(t, l.en)}${when(t, l.when)}</p>${l.fil ? `<p class="fil"><span class="lang">Filipino draft</span>${runs(t, l.fil)}</p>` : ''}`;
const bi = (b: Bi) => `${esc(b.en)}${b.fil ? ` <span class="fil-inline">· ${esc(b.fil)}</span>` : ''}`;

const forms = CODES.map((code) => Object.values(TEMPLATES).find((t) => t.code === code)!).filter(Boolean);
const hasFil = (t: Template) => JSON.stringify(t).includes('"fil"');
const reviewed = (t: Template) => CONSENT_REVIEWED.find((r) => r.version === t.version);
const sharedWords = forms[0].words;

function formSection(t: Template): string {
  const fp = libraryHash(t);
  const ownWords = Object.entries(t.words).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((sharedWords as any)[k]));
  return `
<section class="form" id="form-${t.code}">
  <header class="form-head">
    <h3>${esc(t.title.en)}</h3>
    <p class="facts">
      <span class="pill mono">${esc(t.version)}</span>
      <span class="pill">${t.attest ? 'The named dentist explains it before it can be signed' : 'No dentist explains it first'}</span>
      <span class="pill">${t.minors === 'guardian' ? 'Under 18: a parent or guardian signs' : 'Never for a patient under 18'}</span>
      <span class="pill">${t.validDays ? `Covers treatment for ${t.validDays} days` : 'Covers treatment until withdrawn'}</span>
      <span class="pill">About ${t.minutes} min to read</span>
    </p>
    <p class="fp">Fingerprint <span class="mono">${shortSeal(fp)}</span> <span class="mono dim">${fp}</span></p>
  </header>
  <div class="block"><h4>In short</h4>${t.inShort.map((l) => line(t, l)).join('')}</div>
  ${t.sections.map((s) => `
  <div class="block${s.initials ? ' initials' : ''}">
    <h4>${bi(s.head)}${s.initials ? ' <span class="tag">Initialled by the signer</span>' : ''}</h4>
    ${when(t, s.when)}
    ${s.list ? `<ul>${s.lines.map((l) => `<li>${line(t, l)}</li>`).join('')}</ul>` : s.lines.map((l) => line(t, l)).join('')}
  </div>`).join('')}
  ${t.patientFields.length ? `<div class="block"><h4>Questions the patient answers</h4><ul>${t.patientFields.map((f) => `<li><p class="en">${bi(f.label)}${f.choices ? ` <span class="dim">(${f.choices.map((c) => esc(c.label)).join(' · ')})</span>` : f.kind === 'yesnounsure' ? ' <span class="dim">(yes · no · not sure)</span>' : ' <span class="dim">(yes · no)</span>'}${f.stop?.length ? ` <span class="tag warn">Answering ${esc(f.stop.join(' or '))} means they cannot agree</span>` : ''}${when(t, f.when)}</p></li>`).join('')}</ul></div>` : ''}
  <div class="block"><h4>The ticks before signing</h4><ul>${t.ticks.map((k) => `<li>${line(t, k.line)}</li>`).join('')}</ul></div>
  <div class="block"><h4>The clinic’s part</h4>
    <table class="fields"><thead><tr><th>Field</th><th>Filled in by</th><th>Kind</th></tr></thead><tbody>
    ${t.clinicFields.map((f) => `<tr><td>${esc(f.label)}${f.choices ? `<br><span class="dim">${f.choices.map((c) => esc(c.label)).join(' · ')}</span>` : ''}${f.when ? `<br>${when(t, f.when)}` : ''}</td><td>${f.who === 'dentist' ? 'The dentist (the desk may propose)' : 'The desk'}</td><td>${esc(f.kind)}${f.required ? ', required' : ''}</td></tr>`).join('')}
    </tbody></table></div>
  <div class="block"><h4>What signing means</h4>${line(t, t.meaning)}${ownWords.length ? ownWords.map(([k, v]) => (typeof v === 'object' && v && 'en' in (v as any) ? `<p class="en"><span class="dim">${esc(k.replace(/_/g, ' '))}:</span> ${runs(t, (v as Line).en)}</p>` : '')).join('') : '<p class="dim">The decision and signing words are the shared ones (below).</p>'}</div>
  <p class="signoff">Reviewed by ______________________ (dentist) on ________ · ______________________ (lawyer) on ________ · Languages: English ☐ Filipino ☐</p>
</section>`;
}

// The chart's offer: what each default fee-guide code charts, and the sentence for a few common cases.
const DEFAULTS: [string, string][] = [['restoration', 'filled'], ['sealant', 'sealant'], ['rootcanal', 'root_canal'], ['crown', 'crown'], ['extraction', 'missing'], ['wisdom', 'missing'], ['veneers', 'veneer']];
const CASES: { label: string; effect: string; fdi: number; letters: string | null; now: any; treatment: string }[] = [
  { label: 'A filling on 26 MO, the chart shows caries on 26 MO', effect: 'filled', fdi: 26, letters: 'MO', now: { condition: 'caries', surfaces: ['mesial', 'occlusal'] }, treatment: 'Composite filling' },
  { label: 'A filling on 26 O, the chart shows caries on 26 MO', effect: 'filled', fdi: 26, letters: 'O', now: { condition: 'caries', surfaces: ['mesial', 'occlusal'] }, treatment: 'Composite filling' },
  { label: 'A crown on 36, the chart shows a root canal on 36', effect: 'crown', fdi: 36, letters: null, now: { condition: 'root_canal', surfaces: [] }, treatment: 'Crown' },
  { label: 'An extraction of 48, the chart shows 48 sound', effect: 'missing', fdi: 48, letters: null, now: null, treatment: 'Tooth extraction' },
  { label: 'A filling with no surfaces given, on 14', effect: 'filled', fdi: 14, letters: null, now: null, treatment: 'Composite filling' },
  { label: 'A root canal on 11, the chart shows a veneer on 11', effect: 'root_canal', fdi: 11, letters: null, now: { condition: 'veneer', surfaces: [] }, treatment: 'Root canal treatment' },
  { label: 'An extraction of baby tooth 75', effect: 'missing', fdi: 75, letters: null, now: null, treatment: 'Tooth extraction' },
  // The paper chart's findings (045).
  { label: 'An extraction of 46, the chart shows 46 to be extracted (Ex)', effect: 'missing', fdi: 46, letters: null, now: { condition: 'extraction', surfaces: [] }, treatment: 'Tooth extraction' },
  { label: 'An extraction of 15, the chart shows a root fragment on 15 (RF)', effect: 'missing', fdi: 15, letters: null, now: { condition: 'root_fragment', surfaces: [] }, treatment: 'Tooth extraction' },
  { label: 'A crown on 26, the chart shows amalgam on 26 MOD (Am)', effect: 'crown', fdi: 26, letters: null, now: { condition: 'amalgam', surfaces: ['mesial', 'occlusal', 'distal'] }, treatment: 'Crown' },
  { label: 'A filling on 36 O, the chart shows amalgam on 36 O (Am)', effect: 'filled', fdi: 36, letters: 'O', now: { condition: 'amalgam', surfaces: ['occlusal'] }, treatment: 'Composite filling' },
  { label: 'A crown on 24, the chart shows 24 as a bridge abutment (Ab)', effect: 'crown', fdi: 24, letters: null, now: { condition: 'abutment', surfaces: [] }, treatment: 'Crown' },
];
// The chart's codes: the paper's legend in its order, then ours (the last four).
const OURS = new Set(['filled', 'root_canal', 'implant', 'veneer']);
const codes = `
<div class="table-wrap"><table class="fields"><thead><tr><th>Code</th><th>On the chart’s legend</th><th>The finding in the palette</th><th>Recorded</th><th>From</th></tr></thead><tbody>
${CODE_LEGEND.map(([c, words]) => `<tr><td class="mono">${esc(CONDITION_CODE[c])}</td><td>${esc(words)}</td><td>${esc(CONDITION_LABEL[c])}</td><td>${(SURFACE_SCOPED as string[]).includes(c) ? 'On surfaces' : 'Whole tooth'}</td><td>${OURS.has(c) ? 'Flossify (no code on the paper)' : 'The paper chart'}</td></tr>`).join('')}
</tbody></table></div>
<p class="ask">For the dentist: Ex is charted as a tooth to be extracted; a tooth already out is M, and an extraction recorded as done offers M. Is that how the clinic reads Ex? Am and I are surface findings like a filling (C, Am, I, S and F each say which surfaces); J is a jacket crown, Fx a bridge, Ab and P a bridge’s abutment and pontic, Rm a tooth replaced by a removable denture. The paper has no code for a filling of another material, a root canal, an implant or a veneer: are F, RCT, Impl and V right? (Not Imp, which some charts use for impacted.)</p>`;
const chart = `
<table class="fields"><thead><tr><th>Fee-guide code</th><th>What it charts</th></tr></thead><tbody>
${DEFAULTS.map(([c, e]) => `<tr><td class="mono">${c}</td><td>${e.replace('_', ' ')}</td></tr>`).join('')}
</tbody></table>
<p class="dim">Any other code charts nothing unless the clinic sets it. The effects a code can have: ${CHART_EFFECTS.map((e) => e.replace('_', ' ')).join(', ')}.</p>
<h4>What the record says after the treatment</h4>
<div class="cases">${CASES.map((k) => { const o = chartOffer(k.effect, k.fdi, k.letters, k.now); const w = offerWords(o, k.treatment); return `<div class="case"><p class="case-q">${esc(k.label)}</p><p class="case-a">${w ? `${w.title ? `<strong>${esc(w.title)}</strong> ` : ''}${esc(w.line)}` : '<span class="dim">Nothing is offered: the chart is left as it is.</span>'}</p></div>`; }).join('')}</div>
<p class="ask">For the dentist: should a crown over a charted root canal be offered? Today it is not: the record asks the dentist to choose on the chart, as in the third case above. Should the offers from one visit be gathered into one question?</p>`;

const care = Object.values(AFTERCARE).map((s) => `
<section class="sheet" id="care-${s.kind}">
  <h3>${esc(s.title)}</h3>
  <p class="dim">The check-in text goes ${s.hours ? `${s.hours} hours after the visit` : 'the evening of the visit'}.</p>
  <div class="two">
    <div><h4>English</h4><p class="sub">Do</p><ul>${s.en.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub">Avoid</p><ul>${s.en.avoid.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub">Call the clinic if</p><ul>${s.en.call.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><h4>Filipino</h4><p class="sub">Gawin</p><ul>${s.fil.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub">Iwasan</p><ul>${s.fil.avoid.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub">Tumawag sa klinika kung</p><ul>${s.fil.call.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  </div>
</section>`).join('');

const shared = forms[0];
const sharedBlock = Object.entries(sharedWords).filter(([, v]) => typeof v === 'object' && v && 'en' in (v as any))
  .map(([k, v]) => `<tr><td class="dim">${esc(k.replace(/_/g, ' '))}</td><td>${runs(shared, (v as Line).en)}${(v as Line).fil ? `<br><span class="fil-inline">${runs(shared, (v as Line).fil)}</span>` : ''}</td></tr>`).join('');

const html = `<title>Flossify review pack</title>
<style>
/* A reading document: one column of forms, a contents list, print-ready. Flossify's soft clinical palette. */
:root {
  --bg: #f6f7f9; --card: #ffffff; --ink: #1f2937; --ink-2: #475467; --hair: #e6e9ee;
  --teal: #0d706d; --teal-tint: #e3f2f1; --amber-ink: #8a4b06; --amber-tint: #fdf3e2; --slot: #1d4e89; --slot-tint: #e8f0fa;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #15191e; --card: #1d232a; --ink: #e7ebf0; --ink-2: #c3cad4; --hair: #2c343d;
  --teal: #7fd6cf; --teal-tint: #173533; --amber-ink: #f5c27a; --amber-tint: #3a2a12; --slot: #a9c8f2; --slot-tint: #1b2a3d; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #15191e; --card: #1d232a; --ink: #e7ebf0; --ink-2: #c3cad4; --hair: #2c343d;
  --teal: #7fd6cf; --teal-tint: #173533; --amber-ink: #f5c27a; --amber-tint: #3a2a12; --slot: #a9c8f2; --slot-tint: #1b2a3d; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 16px/1.55 var(--sans); }
.wrap { max-width: 52rem; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 24px; }
h1, h2, h3, h4 { text-wrap: balance; line-height: 1.25; margin: 0; }
h1 { font-size: 30px; letter-spacing: -0.01em; } h2 { font-size: 22px; margin-top: 16px; } h3 { font-size: 19px; } h4 { font-size: 15px; color: var(--ink); }
p { margin: 0; } ul { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
.lede { color: var(--ink-2); max-width: 65ch; } .dim { color: var(--ink-2); } .mono { font-family: var(--mono); font-size: 13px; }
.card, .form, .sheet { background: var(--card); border: 1px solid var(--hair); border-radius: 12px; padding: 20px; display: grid; gap: 14px; min-width: 0; }
.form-head { display: grid; gap: 8px; } .facts { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; background: var(--teal-tint); color: var(--ink); font-size: 13px; }
.fp { font-size: 13px; color: var(--ink-2); overflow-wrap: anywhere; }
.block { display: grid; gap: 6px; border-top: 1px solid var(--hair); padding-top: 12px; }
.block.initials { border-left: 3px solid var(--amber-ink); padding-left: 12px; }
.tag { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--amber-tint); color: var(--amber-ink); margin-left: 6px; vertical-align: middle; }
.slot { background: var(--slot-tint); color: var(--slot); border-radius: 4px; padding: 0 3px; }
.when { display: block; font-size: 13px; color: var(--amber-ink); margin-top: 2px; }
.fil { color: var(--ink-2); font-style: italic; } .fil-inline { color: var(--ink-2); font-style: italic; font-weight: 400; }
.lang { font-style: normal; font-size: 12px; font-weight: 600; margin-right: 6px; color: var(--teal); }
.table-wrap { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--hair); } th { color: var(--ink-2); font-weight: 600; }
.fields { font-size: 14px; } td { overflow-wrap: anywhere; }
.signoff { font-size: 13px; color: var(--ink-2); border-top: 1px dashed var(--hair); padding-top: 10px; }
.toc { display: grid; gap: 4px; } .toc a { color: var(--teal); }
a { color: var(--teal); } a:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.cases { display: grid; gap: 8px; } .case { border: 1px solid var(--hair); border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px; }
.case-q { font-size: 14px; color: var(--ink-2); }
.ask { background: var(--amber-tint); color: var(--amber-ink); border-radius: 10px; padding: 10px 12px; font-size: 14px; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 16px; } .two > div { display: grid; gap: 6px; align-content: start; min-width: 0; }
.sub { font-weight: 600; font-size: 14px; margin-top: 4px; }
.steps { display: grid; gap: 6px; padding-left: 1.3em; margin: 0; }
@media print { :root { --bg: #fff; --card: #fff; --ink: #000; --ink-2: #333; --hair: #bbb; --slot-tint: #fff; --slot: #000; --teal-tint: #fff; --amber-tint: #fff; --amber-ink: #000; --teal: #000 }
  .form, .sheet { break-before: page; border: 0; padding: 0; } }
</style>
<main class="wrap">
  <header class="card">
    <h1>Flossify review pack</h1>
    <p class="lede">Every word a patient will read and sign before a Philippine dental clinic relies on Flossify, drawn straight from the software on ${esc(today)}. A dentist reads the clinical words; the clinic owner’s lawyer reads the consent and privacy words. Nothing in sections 1 and 3 is offered on the live site until both have signed off.</p>
    <ol class="steps">
      <li>Read each form. Mark changes on the page; the wording changes as a new version, never in place.</li>
      <li>Sign off each form at its foot: who read it, when, and in which languages (English, and Filipino where a draft is shown).</li>
      <li>Send the pack back to Flossify. Each signed-off version is listed in the software (<span class="mono">CONSENT_REVIEWED</span>) with its fingerprint, and only then offered to clinics.</li>
    </ol>
    <p class="dim">Words in a blue box are filled in for each patient. An amber line says when a line or a section shows. Filipino lines are drafts and show only where marked.</p>
  </header>

  <nav class="card toc" aria-label="Contents">
    <h2 style="margin:0">Contents</h2>
    <a href="#forms">1. The consent forms (${forms.length})</a>
    <a href="#shared">2. Words every form shares</a>
    <a href="#chart">3. The chart’s codes, and the chart after a treatment (for the dentist)</a>
    <a href="#care">4. Aftercare sheets (for the dentist)</a>
    <a href="#privacy">5. The next privacy notice (for the lawyer)</a>
    <a href="#questions">6. How the day runs: each clinic chooses</a>
  </nav>

  <h2 id="forms">1. The consent forms</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Form</th><th>Version</th><th>Explained first</th><th>Filipino draft</th><th>Signed off</th></tr></thead>
    <tbody>${forms.map((t) => `<tr><td><a href="#form-${t.code}">${esc(t.title.en)}</a></td><td class="mono">${esc(t.version)}</td><td>${t.attest ? 'Yes' : 'No'}</td><td>${hasFil(t) ? 'Partly' : 'No'}</td><td>${reviewed(t) ? `${esc(reviewed(t)!.by)}, ${esc(reviewed(t)!.on)}` : 'Not yet'}</td></tr>`).join('')}</tbody>
  </table></div>
  ${forms.map(formSection).join('')}

  <h2 id="shared">2. Words every form shares</h2>
  <div class="card table-wrap"><table><tbody>${sharedBlock}</tbody></table></div>

  <h2 id="chart">3. The chart’s codes, and the chart after a treatment</h2>
  <div class="card"><h4>The chart’s codes</h4>${codes}</div>
  <div class="card">${chart}</div>

  <h2 id="care">4. Aftercare sheets</h2>
  <p class="lede">Printed for the patient after a treatment, and the evening check-in text that follows it. General guidance; the dentist adjusts it to the clinic’s practice.</p>
  ${care}

  <h2 id="privacy">5. The next privacy notice</h2>
  <div class="card">
    <p>The notice in force is <span class="mono">privacy-2026-09</span>. Before the patient forms open on the live site, a new version must name, in plain words, why it is collected, who sees it and how long it is kept:</p>
    <ul>
      <li>health and dental history, allergies, conditions and medicines;</li>
      <li>home address, emergency contact, and a parent’s or guardian’s details for a patient under 18;</li>
      <li>Facebook name, PhilHealth PIN and HMO card number;</li>
      <li>that a form nobody adds to the records is deleted 30 days after it is sent;</li>
      <li>the IP address stored with each consent, which the current notice does not mention;</li>
      <li>that texts are reminders only (the current notice says patients can “confirm or cancel by text”, which the clinic’s one-way texts cannot do);</li>
      <li>what the desk writes on the record’s dental and medical history, as the clinic’s paper patient record asks it: pregnancy, nursing and birth control pills; a blood transfusion and when; other serious illnesses or operations; the patient’s brushing and flossing, their last dental care and X-ray, and the dental problems they have or had;</li>
      <li>other people’s names and numbers on the record: the patient’s former dentist (name, where, contact number) and their physician (name, where, the last visit).</li>
    </ul>
    <p class="ask">For the lawyer: the notice in force does not name the health history the desk already records at the clinic (allergies, conditions, medicines, a note for the dentist), with or without the patient forms. Which basis covers the clinic’s own clinical record, and does the notice need to say it? Nothing on a page states a basis until you have said which.</p>
    <p class="dim">The general consent to examination and treatment (<span class="mono">treatment-2026-09</span>, form 1 above) is read with it.</p>
  </div>

  <h2 id="questions">6. How the day runs: each clinic chooses</h2>
  <div class="card">
    <p>The owner’s three scheduling questions are now settings every clinic chooses for itself, in Clinic settings → Clinic profile → How the day runs. Each starts as the product worked before, so nothing changes until a clinic picks otherwise. The owner says only whether a starting choice should be different.</p>
    <ul>
      <li><strong>Time between visits:</strong> none, or 5 to 30 minutes. Online booking and the calendar’s suggested times leave it after each visit; the desk can still book back to back. Starts at none.</li>
      <li><strong>Reminders for visits in closed time:</strong> when ticked, a visit that lands in lunch, a closed day or a dentist’s leave after it was booked gets no reminder text until someone keeps it or moves it. Starts unticked: the reminder goes.</li>
      <li><strong>Ask about a consent form not signed:</strong> at the chair, or at the door (when the patient arrives, so the form can be signed while they wait). The visit is never stopped; the reason is kept with the form. Starts at the chair.</li>
    </ul>
  </div>
</main>
`;
mkdirSync(new URL('../../../docs/review/', import.meta.url), { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote docs/review/review-pack.html: ${forms.length} forms, ${CODE_LEGEND.length} chart codes, ${Object.keys(AFTERCARE).length} aftercare sheets, ${CASES.length} chart cases`);
