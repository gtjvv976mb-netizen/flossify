export const meta = {
  name: 'resume-simpler-record',
  description: 'Resume the simpler patient record at S4 (built, not verified), then S5–S8 and the final review',
  phases: [
    { title: 'Build', detail: 'one builder per slice, sequential in /home/user/fl-simple' },
    { title: 'Verify', detail: 'an independent verifier per slice; fixes loop until clean' },
    { title: 'Final review', detail: 'three lenses over the whole record, then fixes' },
  ],
}

const SP = '/home/user/fl-simple/docs/handoff/notes'
const RULES = `Read ${SP}/simplify-rules.md first (sandbox, rules, how to finish), then ${SP}/simplify-spec.md (the design; §8 is the slice list and each slice's checks). CLAUDE.md applies in full.`

const SLICES = [
  { key: 'S0-S1', what: 'S0 (baseline: record the before-numbers with the inventory scripts, the 7-role snapshot of the record for Maria and Ledger Test, and a new links.mjs that records every deep link of spec §5 with its landing tab and element; save the baselines under /tmp/fl-simple-scratch/baseline/) and S1 (TAB_OF in _record/sections.ts and the resolver check script that fails when any value listed in S1 does not resolve to one of the four tabs). S0 commits nothing to the repo except S1\'s code; the check script lives in scripts/dev/record-tabs-check.mjs (or similar) so it can be re-run.' },
  { key: 'S2', what: 'S2, the frame: four tab panels re-parenting the existing components, banners and group headings gone, RecordNav horizontal and sticky at the top with Add ▾, current/fromHash/show()/back generalised, the saved-line slot.' },
  { key: 'S3', what: 'S3, the head: tiles and hereNow go, the facts line (HMO, member no., Owes for finance.bill), the desk note, the safety line with explicit empty states, pinned (≥768 compact copy in the row, <768 the alert line), birth date into Edit details.' },
  { key: 'S4', what: 'S4, Today: This visit with one button per line and a teal next step, Coming up with reminder states and In 6 months / Other…, Needs attention, Last visit.' },
  { key: 'S5', what: 'S5, Patient info and the rec-health panel (the health form in a side panel with its conflict and unsaved handling and the close warning; Details as a definition list; Consent with DeskConsent on the page and the intake\'s ConsentForms pane whole).' },
  { key: 'S6', what: 'S6, Chart & plan: plan rows with a next step and ⋯, Done by and the LOA ask-first kept, the Done fold, X-rays and photos, the conditional lab/LOA/payplan cards, the merged rec-loa-answer panel, the Findings duplicate gone, ChartOffer drawn only here.' },
  { key: 'S7', what: 'S7, Treatment record: the cancelled-and-missed fold, clinical notes (newest 3, addendum on the card), Prescriptions and letters with the kind radio in rec-letter-add, Statements (finance.bill), the Texts fold. The ledger and the paper unchanged.' },
  { key: 'S8', what: 'S8, measure everything: the inventory against the targets (41 total without teeth, 16 on first load, 22 panels for Maria, ≤1 teal per screen), the 7-role snapshot with only the expected differences (spec S8), contrast light and dark at 1440 and 390 including the sticky row over scrolled content, targets, fields, no sideways scroll at 1440/1366/1280/1200/1024/768/390, keyboard order, reduced-motion parity, built CSS before/after. Fix whatever fails. Then rewrite CLAUDE.md\'s record sections (the record, 033\'s colour groups and pills, 034\'s head chips, 035\'s visit panel openers, 036\'s This visit strip, the Treatment record section) to describe the record as built — CLAUDE.md is yours to edit in this slice only.' },
]

const VERDICT = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'object', properties: {
      check: { type: 'string' }, steps: { type: 'string' }, expected: { type: 'string' }, got: { type: 'string' }, where: { type: 'string' },
    }, required: ['check', 'steps', 'expected', 'got'] } },
    summary: { type: 'string' },
  },
  required: ['pass', 'failures', 'summary'],
}

const reports = []
// Resume point: S0–S3 are done and verified; S4 is built (f546246) but not verified.
const FROM = SLICES.findIndex(s => s.key === 'S4')
for (const s of SLICES.slice(FROM)) {
  phase('Build')
  const built = s.key === 'S4' ? 'S4 was built and committed as f546246 in the previous session; read the S4 section of /tmp/fl-simple-scratch/progress.md for its report.' : await agent(`${RULES}

Your slice: ${s.what}

Earlier slices are committed on round/simple; /tmp/fl-simple-scratch/progress.md says what each did and what it left open. Build your slice, run its checks, commit, update progress.md, and report.`, { label: `build:${s.key}`, phase: 'Build' })
  reports.push({ slice: s.key, report: built })

  let round = 0
  let verdict = null
  while (round < 3) {
    verdict = await agent(`${RULES}

You are the VERIFIER for slice ${s.key} of the simpler patient record, just committed on round/simple in /home/user/fl-simple by a builder. You must NOT edit any file under /home/user/ (read, build and serve only; scratch in /tmp/fl-simple-scratch/verify-${s.key}/). You may change data in flossify_simple.

The slice: ${s.what}

The builder's report:
<report>
${typeof built === 'string' ? built.slice(0, 12000) : JSON.stringify(built).slice(0, 12000)}
</report>

Try to break it. Re-run the slice's checks yourself from spec §8 (do not trust the builder's numbers), and also check what this slice could have broken: every deep link and posted intent in spec §5 still lands on the right tab with the right panel or line; a refused post reopens its panel; the dentist without billing sees no amount; one teal per screen; contrast ≥4.5:1 light and dark at 1440 and 390; 44px targets; no sideways scroll at 390; the offline kept copy and the chart palette still work (for slices that touch them). Leave your server stopped. pass=true only if nothing fails. For every failure give exact steps, expected, got, and the file:line you believe is at fault.`, { label: `verify:${s.key}:${round + 1}`, phase: 'Verify', schema: VERDICT })
    if (!verdict || verdict.pass || !verdict.failures.length) break
    log(`${s.key}: verifier round ${round + 1} found ${verdict.failures.length} failure(s); fixing`)
    await agent(`${RULES}

You are fixing slice ${s.key} of the simpler patient record in /home/user/fl-simple (round/simple). An independent verifier found these failures:
${JSON.stringify(verdict.failures, null, 1)}

Reproduce each one, fix it (or, if the verifier is wrong, prove it with a measurement), re-run the slice's checks, commit the fixes as one commit, update /tmp/fl-simple-scratch/progress.md, stop your server, and report each failure → fixed / not a failure (with the measurement).`, { label: `fix:${s.key}:${round + 1}`, phase: 'Verify' })
    round++
  }
  reports.push({ slice: s.key, verdict })
  if (verdict && !verdict.pass && verdict.failures.length) log(`${s.key}: still ${verdict.failures.length} failure(s) after 3 rounds — carried forward`)
}

phase('Final review')
const LENSES = [
  { key: 'routes', p: 'ROUTES AND ACTIONS: prove nothing a clinic uses was lost. Diff the baseline snapshot (/tmp/fl-simple-scratch/baseline/) against now for all 7 roles on Maria and Ledger Test: every form intent, form action, panel id, print page and outgoing link that existed before must still be reachable (list any that is not, apart from Bring in past visits and the rec-loa-approve/deny → rec-loa-answer merge). Re-run links.mjs and the resolver check. Walk each frequent job in spec §4 and count its clicks against the spec.' },
  { key: 'safety', p: 'CLINICAL SAFETY, ROLES AND DATA: allergies are never hidden or cut at any width (1440, 1366×768, 1024, 768, 390) with 0, 1 and 5 allergies and a long note; the safety line says "No known allergies" / "Allergies: not asked yet" correctly from the data; a dentist without finance.bill sees no peso sign anywhere on the record; the health panel\'s conflict flow and unsaved-close warning work; a minor shows Under 18; the ledger\'s last balance equals patient_balance() for every dev patient; the offline kept copy opens on Chart and charting offline still queues; every post still refuses a CSRF miss and a role without the key.' },
  { key: 'design', p: 'DESIGN MEASUREMENT: the owner\'s complaint was too many tabs and buttons. Count them now exactly as the inventory did (inventory scripts) for owner and dentist on Maria and Ledger Test at 1440 and 390, and compare with the spec\'s targets. Then: contrast of every visible word ≥4.5:1 against the pixels behind, light and dark (chosen and device theme), 1440 and 390, including the sticky row over scrolled content; one teal button per screen on every tab and in every open menu/panel state; targets ≥44px; fields ≥16px; no sideways scroll at 1440/1366/1280/1200/1024/768/390; sentence case; keyboard order through tabs (arrow keys), Add ▾ and ⋯ returning focus; nothing fixed at the bottom. Also judge honestly as a busy clinic desk: is anything now harder to find than before, or still cluttered? Report those as failures with a concrete change.' },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${RULES}

You are a final reviewer of the simpler patient record, now complete on round/simple in /home/user/fl-simple. You must NOT edit files under /home/user/. Serve the build on port ${l.key === 'routes' ? 4471 : l.key === 'safety' ? 4472 : 4473} instead of 4470 (same command, your own pid file /tmp/fl-simple-${l.key}.pid and log), and stop it when done. Data changes in flossify_simple are allowed but keep them to new test patients.

Your lens: ${l.p}

pass=true only if nothing fails. For every failure: exact steps, expected, got, file:line.`, { label: `review:${l.key}`, phase: 'Final review', schema: VERDICT })))

const allFailures = reviews.filter(Boolean).flatMap((r, i) => r.failures.map(f => ({ lens: LENSES[i].key, ...f })))
let finalFix = null
if (allFailures.length) {
  log(`Final review: ${allFailures.length} failure(s); fixing`)
  finalFix = await agent(`${RULES}

Final fixes for the simpler patient record in /home/user/fl-simple (round/simple). Three reviewers found these failures:
${JSON.stringify(allFailures, null, 1)}

Reproduce each, fix it (or prove with a measurement that it is not a failure), re-run the affected checks (and the S8 counts if buttons change), keep CLAUDE.md in step, commit, update progress.md, stop your server, and report each failure → fixed / not a failure / left open (why).`, { label: 'fix:final', phase: 'Final review' })
}

return { reports, reviews, finalFix }
