export const meta = {
  name: 'build-simpler-record',
  description: 'Build the simpler patient record slice by slice (S0–S8), verifying each slice adversarially before the next',
  phases: [
    { title: 'Build', detail: 'one builder per slice, sequential in /home/user/fl-simple' },
    { title: 'Verify', detail: 'an independent verifier per slice; fixes loop until clean' },
    { title: 'Parallel', detail: 'S4–S7 built side by side in their own worktrees' },
    { title: 'Integrate', detail: 'merge S4–S7 into round/simple and check the whole record' },
    { title: 'Final review', detail: 'three lenses over the whole record, then fixes' },
  ],
}

const SP = '/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad'
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


const FULL_VERIFY = ['S0-S1', 'S2']   // already run with the old, heavy loop: kept identical so they replay from cache
const reports = []

function verifyPrompt(s, built, where) {
  const w = where || { dir: '/home/user/fl-simple', branch: 'round/simple', db: 'flossify_simple', port: 4470 }
  if (FULL_VERIFY.includes(s.key)) {
    return `${RULES}

You are the VERIFIER for slice ${s.key} of the simpler patient record, just committed on round/simple in /home/user/fl-simple by a builder. You must NOT edit any file under /home/user/ (read, build and serve only; scratch in /tmp/fl-simple-scratch/verify-${s.key}/). You may change data in flossify_simple.

The slice: ${s.what}

The builder's report:
<report>
${typeof built === 'string' ? built.slice(0, 12000) : JSON.stringify(built).slice(0, 12000)}
</report>

Try to break it. Re-run the slice's checks yourself from spec §8 (do not trust the builder's numbers), and also check what this slice could have broken: every deep link and posted intent in spec §5 still lands on the right tab with the right panel or line; a refused post reopens its panel; the dentist without billing sees no amount; one teal per screen; contrast ≥4.5:1 light and dark at 1440 and 390; 44px targets; no sideways scroll at 390; the offline kept copy and the chart palette still work (for slices that touch them). Leave your server stopped. pass=true only if nothing fails. For every failure give exact steps, expected, got, and the file:line you believe is at fault.`
  }
  return `${RULES}

You are the VERIFIER for slice ${s.key} of the simpler patient record, just committed on ${w.branch} in ${w.dir} by a builder (database ${w.db}; serve on port ${w.port} — where the rules file says /home/user/fl-simple, flossify_simple or 4470, use these). You must NOT edit any file under /home/user/ (read, build and serve only; scratch in /tmp/fl-simple-scratch/verify-${s.key}/). You may change data in ${w.db}. The shared tools in /tmp/fl-simple-scratch/tools/ take PORT_, DB_ and OUT_ from the environment; progress.md says how each is run.

The slice: ${s.what}

The builder's report:
<report>
${typeof built === 'string' ? built.slice(0, 12000) : JSON.stringify(built).slice(0, 12000)}
</report>

A FOCUSED check, about 30–40 minutes: the whole-record sweeps (7-role snapshot, every-width contrast, keyboard walk) run once at S8 and in the final review, not here. Re-run yourself (do not trust the builder's numbers): the slice's own checks from spec §8; \`npm run test:record-tabs\`; links.mjs with --expect for this slice; refused-posts for any panel this slice moved or added; one teal button per screen on the tabs this slice changed; the dentist without billing sees no amount on them; contrast ≥4.5:1 (light and dark, 1440 and 390), 44px targets, 16px fields and no sideways scroll for what this slice added or moved. Report only real defects in what a clinic would see or do; do not report gaps in the check scripts themselves. A panel or id the spec gives to a sibling slice (S4–S7 are built side by side) may be missing until integration — that is not a failure. Leave your server stopped. pass=true only if nothing fails. For every failure: exact steps, expected, got, file:line.`
}

async function fixRound(s, verdict, where) {
  const w = where || { dir: '/home/user/fl-simple', branch: 'round/simple', db: 'flossify_simple', port: 4470, log: '/tmp/fl-simple-scratch/progress.md' }
  return agent(`${RULES}

You are fixing slice ${s.key} of the simpler patient record in ${w.dir} (${w.branch}; database ${w.db}; port ${w.port} — where the rules file says /home/user/fl-simple, flossify_simple or 4470, use these). An independent verifier found these failures:
${JSON.stringify(verdict.failures, null, 1)}

Reproduce each one, fix it (or, if the verifier is wrong, prove it with a measurement), re-run the checks that cover it, commit the fixes as one commit, update ${w.log || '/tmp/fl-simple-scratch/progress.md'}, stop your server, and report each failure → fixed / not a failure (with the measurement).`, { label: `fix:${s.key}`, phase: FULL_VERIFY.includes(s.key) ? 'Verify' : (where ? 'Parallel' : 'Verify') })
}

// ---- S0-S1, S2, S3: one after another on round/simple ----
for (const s of SLICES.slice(0, 3)) {
  phase('Build')
  const built = await agent(`${RULES}

Your slice: ${s.what}

Earlier slices are committed on round/simple; /tmp/fl-simple-scratch/progress.md says what each did and what it left open. Build your slice, run its checks, commit, update progress.md, and report.`, { label: `build:${s.key}`, phase: 'Build' })
  reports.push({ slice: s.key, report: built })

  let verdict = null
  if (FULL_VERIFY.includes(s.key)) {
    let round = 0
    while (round < 3) {
      verdict = await agent(verifyPrompt(s, built), { label: `verify:${s.key}:${round + 1}`, phase: 'Verify', schema: VERDICT })
      if (!verdict || verdict.pass || !verdict.failures.length) break
      log(`${s.key}: verifier round ${round + 1} found ${verdict.failures.length} failure(s); fixing`)
      await agent(`${RULES}

You are fixing slice ${s.key} of the simpler patient record in /home/user/fl-simple (round/simple). An independent verifier found these failures:
${JSON.stringify(verdict.failures, null, 1)}

Reproduce each one, fix it (or, if the verifier is wrong, prove it with a measurement), re-run the slice's checks, commit the fixes as one commit, update /tmp/fl-simple-scratch/progress.md, stop your server, and report each failure → fixed / not a failure (with the measurement).`, { label: `fix:${s.key}:${round + 1}`, phase: 'Verify' })
      round++
    }
  } else {
    verdict = await agent(verifyPrompt(s, built), { label: `verify:${s.key}`, phase: 'Verify', schema: VERDICT })
    if (verdict && !verdict.pass && verdict.failures.length) {
      log(`${s.key}: ${verdict.failures.length} failure(s); one fix round`)
      await fixRound(s, verdict)
    }
  }
  reports.push({ slice: s.key, verdict })
}

// ---- S4–S7 side by side ----
phase('Parallel')
const PAR = SLICES.slice(3, 7).map((s, i) => ({ ...s, n: s.key.slice(1), dir: `/home/user/fl-simple-${s.key.toLowerCase()}`, branch: `round/simple-${s.key.toLowerCase()}`, db: `flossify_simple_${s.key.toLowerCase()}`, port: 4474 + i, log: `/tmp/fl-simple-scratch/progress-${s.key.toLowerCase()}.md` }))
const setup = await agent(`${RULES}

Set up four sandboxes so slices S4, S5, S6 and S7 of the simpler patient record can be built side by side, each branching from round/simple as it is now (S3 is committed there). Do not change any source file. For each of:
${PAR.map(p => `- ${p.key}: worktree ${p.dir} on a new branch ${p.branch} from round/simple; database ${p.db}; port ${p.port}; uploads /tmp/fl-uploads-${p.key.toLowerCase()}`).join('\n')}
do: \`git -C /home/user/fl-simple worktree add -b <branch> <dir> round/simple\`; copy node_modules (\`cp -a /home/user/fl-simple/node_modules <dir>/\`); copy /home/user/fl-simple/.env to <dir>/.env with the database name and UPLOAD_DIR changed; copy /tmp/fl-uploads-simple/. into the uploads folder; create the database ONE AT A TIME with \`psql -U root -h /var/run/postgresql -d postgres -c "create database <db> template flossify_simple owner root"\` (first make sure nothing is connected to flossify_simple: no server on 4470 — \`kill $(cat /tmp/fl-simple-server.pid)\` if it runs; if a create fails with "being accessed by other users", list pg_stat_activity for flossify_simple and wait, never terminate another session you did not start). Then build each worktree once (\`npm run build\`) to prove it works. Report each sandbox as ready or what failed.`, { label: 'setup:parallel', phase: 'Parallel' })

const par = await pipeline(PAR,
  (p) => agent(`${RULES}

SIDE-BY-SIDE BUILD. Your slice is built in its own sandbox, at the same time as three sibling slices in theirs. Everywhere the rules file says /home/user/fl-simple, round/simple, flossify_simple, port 4470 or /tmp/fl-simple-server.pid, use: worktree ${p.dir}, branch ${p.branch}, database ${p.db}, port ${p.port}, pid file /tmp/fl-simple-${p.key.toLowerCase()}-server.pid, log /tmp/fl-simple-${p.key.toLowerCase()}-server.log. Keep your running log in ${p.log} (read /tmp/fl-simple-scratch/progress.md first for S0–S3, but never write to it). The shared tools in /tmp/fl-simple-scratch/tools/ take PORT_, DB_ and OUT_ from the environment; OUT_ under /tmp/fl-simple-scratch/${p.key.toLowerCase()}/.

Your slice: ${p.what}

The siblings: ${PAR.filter(q => q.key !== p.key).map(q => `${q.key} (${q.what.split(':')[0]})`).join('; ')}. To keep the merge clean:
- Stay inside your own tab panel's region of [patient].astro and your own components. Where you must touch shared code (the page's frontmatter loaders, the client script, record.css, sections.ts, TAB_OF), add in a clearly separate block with a comment naming your slice, and never reformat or reorder lines you do not own.
- New CSS goes at the end of record.css under a comment "/* ${p.key}: … */".
- Use the panel ids and anchors exactly as the spec names them. A link from your slice to a panel a sibling builds (e.g. rec-health is S5's, rec-loa-answer S6's, the clearance kind of rec-letter-add S7's) is written as the spec says even if it does not open yet in your sandbox; say so in your report.
Aim to finish in about an hour. Build, run the slice's checks, commit on ${p.branch}, stop your server, leave the worktree clean, and report.`, { label: `build:${p.key}`, phase: 'Parallel' }),
  async (built, p) => {
    const where = { dir: p.dir, branch: p.branch, db: p.db, port: p.port, log: p.log }
    const verdict = await agent(verifyPrompt(p, built, where), { label: `verify:${p.key}`, phase: 'Parallel', schema: VERDICT })
    let fixed = null
    if (verdict && !verdict.pass && verdict.failures.length) fixed = await fixRound(p, verdict, where)
    return { slice: p.key, report: built, verdict, fixed }
  })
reports.push(...par.filter(Boolean))

// ---- integrate ----
phase('Integrate')
const integrated = await agent(`${RULES}

INTEGRATE slices S4–S7 of the simpler patient record. They were built side by side on branches ${PAR.map(p => p.branch).join(', ')} (worktrees ${PAR.map(p => p.dir).join(', ')}; their logs ${PAR.map(p => p.log).join(', ')}), each from round/simple after S3. In /home/user/fl-simple (round/simple), merge them in order S4, S5, S6, S7 with \`git merge --no-ff\`. Resolve every conflict by keeping both slices' intent (read both sides and the spec; never drop a sibling's lines). Then make the cross-slice links real: every opener named in spec §3/§5 opens its panel (Today's Something changed and Check it → rec-health; Needs attention's LOA line → rec-loa-answer; Ask for clearance → rec-letter-add with the clearance kind; Other… → rec-recall-set), and each builder's "does not open yet in my sandbox" note is now resolved. Rebuild and run the full set: \`npm run test:record-tabs\`; links.mjs with --expect and NO --slice; refused-posts for every intent × back; snap-record vs the S0 baseline (only the differences spec S8 allows); prints.mjs; the ledger's last balance = patient_balance() for every dev patient; the inventory counts (inv.mjs) against the targets; one teal per screen on every tab. Fix what the merge broke. Commit (merge commits plus one "integration fixes" commit), append an "Integration" section to /tmp/fl-simple-scratch/progress.md summarising the four slice logs and what you fixed, stop your server, and report.`, { label: 'integrate', phase: 'Integrate' })
reports.push({ slice: 'integrate', report: integrated })
const intVerdict = await agent(`${RULES}

VERIFY the integration of S4–S7 on round/simple in /home/user/fl-simple (read-only under /home/user/; scratch /tmp/fl-simple-scratch/verify-int/). The integrator's report:
<report>
${typeof integrated === 'string' ? integrated.slice(0, 12000) : JSON.stringify(integrated).slice(0, 12000)}
</report>
Re-run yourself: links.mjs --expect with no --slice; refused-posts; every opener of spec §3's panel table opens its panel from each place it lists; the frequent jobs of spec §4 click counts; one teal per screen on each tab; a dentist without billing sees no amount; the offline kept copy opens on Chart and charting offline still queues. Report only real defects a clinic would meet. pass=true only if nothing fails; each failure with steps, expected, got, file:line. Leave your server stopped.`, { label: 'verify:integrate', phase: 'Integrate', schema: VERDICT })
if (intVerdict && !intVerdict.pass && intVerdict.failures.length) {
  await fixRound({ key: 'integrate' }, intVerdict)
}
reports.push({ slice: 'integrate', verdict: intVerdict })

// ---- S8 ----
phase('Build')
{
  const s = SLICES[7]
  const built = await agent(`${RULES}

Your slice: ${s.what}

Earlier slices are committed on round/simple (S4–S7 built side by side and merged; see the Integration section of /tmp/fl-simple-scratch/progress.md). Build your slice, run its checks, commit, update progress.md, and report.`, { label: `build:${s.key}`, phase: 'Build' })
  reports.push({ slice: s.key, report: built })
  const verdict = await agent(verifyPrompt(s, built), { label: `verify:${s.key}`, phase: 'Verify', schema: VERDICT })
  if (verdict && !verdict.pass && verdict.failures.length) await fixRound(s, verdict)
  reports.push({ slice: s.key, verdict })
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
