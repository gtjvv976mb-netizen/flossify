export const meta = {
  name: 'simplify-patient-record',
  description: 'Map the patient record, count its tabs and buttons, then design and judge simpler records and settle one plan with far fewer tabs and buttons',
  phases: [
    { title: 'Understand', detail: 'inventory and counts, the jobs people do, how other systems do it, what is landing' },
    { title: 'Design', detail: 'three independent simpler records' },
    { title: 'Judge', detail: 'the people who use it; the rules and the counts' },
    { title: 'Settle', detail: 'one plan, with a build order' },
  ],
}

const OWNER = `The owner of Flossify (dental practice software for Philippine clinics) just said, in capitals: "SIMPLIFY THE PATIENT RECORD" and then "THERE'S TOO MANY TABS AND BUTTONS". The patient record is src/pages/c/[clinic]/patients/[patient].astro with its pieces in src/pages/c/[clinic]/patients/_record/ (sections.ts lists the sections and their colour groups; RecordNav.astro is the index of tabs; VisitStrip.astro is the "This visit" checklist above the sections; Banner.astro heads each section; VisitPanels.astro are the visit side panels; TreatmentPanels/NotePanel are panels the chart's palette opens) and patients/_ui/. CLAUDE.md in the repo (/home/user/flossify) describes every part of it: read its sections "The clinical record (033)", "The record's paperwork (034)", "The visit panel and the signed consent (035)", "The Treatment record", "The paperless day (036)" (This visit on the record), and the tooth-first / PTR / desk note parts. The success measure the owner gave is plain: far fewer tabs and far fewer buttons on the record, while nothing a clinic needs is lost and nothing becomes harder to find.`

const COUNT_SCHEMA = { type: 'object', properties: {
  tabs: { type: 'number' }, buttonsVisibleOverview: { type: 'number' }, buttonsPerSection: { type: 'object' },
  report: { type: 'string' } }, required: ['tabs', 'report'] }

phase('Understand')
const understand = await parallel([
  () => agent(`${OWNER}

Your job: an exact INVENTORY of the record as it is now, with numbers. The current build runs at http://127.0.0.1:4399 against the dev database (sign in at /auth/login/?any=1 as liwayway.domingo@example.com / flossify, the owner; and as hazel.tabanao@example.com / flossify, a dentist without billing). Use Playwright (import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs'; chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })) — do not edit any repo file; scratch in /tmp/fl-simplify/inventory/.
Open the record of Maria Liza Dela Cruz (patient 1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb) and of Ledger Test (chart no T-LEDG; find its id with psql -U root -h /var/run/postgresql -d flossify_dev) at 1440×900 and 390×844. Count and list: every tab in the record's index (and their groups/colours); for EACH section: its title, every visible button and link-button (text, whether teal/primary, whether it opens a panel), every chip/pill, every card, the number of words, and its scroll height; the head of the record (name, chips, quick actions, More menu items); the This visit strip; the side panels reachable from the page (count them, and the buttons inside each). Also count buttons that are rendered but hidden until a click (menus), separately. Take full-page screenshots of the Overview and of each section at 1440 and 390 into /tmp/fl-simplify/inventory/ and name them clearly. Give totals: tabs, visible buttons on first load (Overview), total buttons across all sections, total side panels, total chips on the head. Then list every DUPLICATE you can see: the same fact or action offered in two or more places (for example the visits in Visits vs the Treatment record vs the visit panel; money in Money vs the Treatment record; consent in Consent vs the visit panel vs This visit; treatment plan in Treatment vs the chart's palette; Rx & letters vs This visit). Return the numbers and the full report.`, { label: 'inventory', phase: 'Understand', schema: COUNT_SCHEMA }),

  () => agent(`${OWNER}

Your job: the JOBS people do with a record in a Philippine dental clinic, and which parts of today's record each job needs. Read docs/clinic-operations.md (how a clinic runs, front door to archive), docs/service-map.md, and CLAUDE.md. For each person — the front desk/secretary (booking, arrival, details, money, texts, consents, printing), the dentist at the chair (health alerts, chart, plan, what was done, notes, prescriptions, letters, consent), the dental assistant, the owner (money, follow-up) — list the 5–8 things they actually do with a patient's record, in order of how often, and for each: which current section/button/panel they use, how many clicks it takes today, and what they must see at the same moment (e.g. allergies while charting). Then say which sections are visited rarely (monthly or less) and which things could live inside another section without anyone missing them. Be concrete and cite the code (file:line) for how each job is done today. Do not edit files.`, { label: 'jobs', phase: 'Understand' }),

  () => agent(`${OWNER}

Your job: how OTHER dental records are laid out, to learn what "simple" looks like to a dentist. Use web search and fetch (load them with ToolSearch: WebSearch, WebFetch). Look at: the Philippine Dental Association's dental chart form (its pages: patient information and health history, the chart, the treatment record, consents); Open Dental, Dentrix, Curve Dental, Dentally, CareStack and any Philippine clinic system you can find (e.g. Molarsoft, SwiftCare's), and general EHR simplicity guidance (progressive disclosure, a patient summary header, "one primary action per screen"). For each: how many top-level tabs/areas a patient's record has, what they are called, what sits on the first screen, how treatment plan / treatment done / notes / charting relate (often one "chart" or "clinical" area), where billing and documents go. Summarise the common pattern in a short table, and name the 4–6 top-level areas the best of them converge on. Cite sources (URLs). Do not edit files.`, { label: 'other-systems', phase: 'Understand' }),

  () => agent(`${OWNER}

Your job: what is LANDING in the record that the simpler design must hold. (1) The scheduling round already on the branch (a0cf380): tooth-first entry (ToothPick, the chart's palette with Add to plan / Treatment done / Clinical note, TreatmentPanels, NotePanel, ChartOffer after a treatment), PTR notes in Rx & letters, the desk note (?open=details&dash=), the Treatment record ledger and its print. (2) The patient intake phase 2, built but not merged, in the worktree /home/user/fl-intake (branch round/intake; read \`git -C /home/user/fl-intake diff a0cf380...round/intake --stat\` and the record-side files: _record/ConsentForms.astro, patients/[patient]/consents/…, and its changes to [patient].astro): a Consent forms pane with Prepare consent forms, Explain and confirm, paper signing, withdraw, capacity notes; the intake spec's phase 4 plans (head chips, ask-first, the visit strip) are in /tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/intake-spec.md §7. List every tab, button, panel and chip these add or change, and which ones a simpler record must keep reachable (and from where). Also list the deep links other pages rely on (e.g. ?open=done|note|rx|vitals|file|details, ?visit=, #treatment-record, #timeline alias, #chart, the Dashboard's Open record, aftercare back links, sign page returns, finances/new?visit=) with file:line, because any simplification must keep them working. Do not edit files.`, { label: 'landing', phase: 'Understand' }),
])
const [inventory, jobs, others, landing] = understand
log(`Today: ${inventory?.tabs ?? '?'} tabs; ${inventory?.buttonsVisibleOverview ?? '?'} buttons visible on the Overview`)

const BRIEF = `${OWNER}

What the team found (read all of it before designing):

## Inventory and counts of today's record
${inventory ? inventory.report : '(missing)'}

## The jobs people do with a record
${jobs ?? '(missing)'}

## How other dental records are laid out
${others ?? '(missing)'}

## What is landing in the record, and the deep links that must keep working
${landing ?? '(missing)'}

Constraints that stand (from CLAUDE.md; do not break them): the soft template (white cards, one teal button per screen, sentence case, line icons), measured contrast ≥ 4.5:1 light and dark at 1440 and 390, targets ≥ 44px, fields 16px, no sideways scroll at 390, nothing fixed to the bottom, motion never gated on reduced motion; permissions by can(); every deep link above keeps working (old addresses may redirect); money only for finance.bill; the Treatment record (the PDA ledger the owner asked for last week) stays; nothing is deleted from the database or made unreachable. Earlier owner requests that a simplification may revisit because the owner now asks for fewer tabs and buttons: the colour-coded groups in the index (033: "encoders never lose their place"), "every detail is its own pill or tile" (033), the head's safety chips (034). Say explicitly what each design keeps, changes or drops of those, and why.`

phase('Design')
const ANGLES = [
  { key: 'jobs', angle: 'JOB-FIRST: organise the record around the few things people do most, in the order a visit runs; everything rare goes one level down (inside a section, behind a single "More" or a details disclosure). Start from the jobs list.' },
  { key: 'paper', angle: 'THE PAPER CHART: mirror the PDA dental chart Philippine dentists already know (patient information and health, the chart, the treatment record, consents), plus the minimum the software needs (money for the desk, documents). Start from the other-systems research.' },
  { key: 'minimal', angle: 'RADICAL MINIMUM: the fewest tabs possible (aim for 4 or fewer) and at most one button in view per card; everything else becomes a single overflow menu or an action inside the thing it acts on. Start from the inventory counts and remove until something a clinic needs would be lost, then add back only that.' },
]
const DESIGN_SCHEMA = { type: 'object', properties: {
  name: { type: 'string' }, tabs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, holds: { type: 'string' } }, required: ['name', 'holds'] } },
  tabsBefore: { type: 'number' }, tabsAfter: { type: 'number' }, buttonsBefore: { type: 'number' }, buttonsAfter: { type: 'number' },
  design: { type: 'string' } }, required: ['name', 'tabs', 'tabsAfter', 'buttonsAfter', 'design'] }

const designs = await parallel(ANGLES.map((a) => () => agent(`${BRIEF}

Design a SIMPLER PATIENT RECORD from this angle — ${a.angle}

Deliver a complete design another engineer could build from: (1) the tabs, their names (plain words a secretary uses), and exactly what each holds (map EVERY current section, card, button, chip and panel to where it goes or why it is dropped — nothing silently disappears); (2) the head of the record: what it shows and which actions, with counts; (3) the first screen a person sees (at 1440 and at 390), described card by card, with every button on it; (4) which buttons are removed, merged into one, or moved into a menu, with the before/after counts per tab and in total — count the way the inventory counted; (5) how each frequent job is done now, in clicks, compared with today; (6) how each deep link keeps working; (7) what it keeps/changes/drops of the colour groups, the pills-for-every-detail rule and the head chips, and why; (8) risks. Do not edit files.`, { label: `design:${a.key}`, phase: 'Design', schema: DESIGN_SCHEMA })))
const good = designs.filter(Boolean)
log(`Designs: ${good.map((d) => `${d.name} (${d.tabsAfter} tabs, ${d.buttonsAfter} buttons)`).join(' · ')}`)

phase('Judge')
const DESIGN_TEXT = good.map((d, i) => `### Design ${i + 1}: ${d.name} — ${d.tabsAfter} tabs, ${d.buttonsAfter} buttons (before: ${d.tabsBefore ?? '?'} tabs, ${d.buttonsBefore ?? '?'} buttons)\n${d.design}`).join('\n\n')
const JUDGE_SCHEMA = { type: 'object', properties: {
  scores: { type: 'array', items: { type: 'object', properties: { design: { type: 'number' }, score: { type: 'number' }, why: { type: 'string' } }, required: ['design', 'score', 'why'] } },
  bestIdeas: { type: 'string' }, mustFix: { type: 'string' } }, required: ['scores', 'bestIdeas', 'mustFix'] }
const judges = await parallel([
  () => agent(`${BRIEF}

The designs:
${DESIGN_TEXT}

You judge as THE PEOPLE WHO USE IT: a Philippine clinic's owner-dentist, an associate dentist at the chair with gloves on, a secretary at a busy front desk, and a dental assistant. Walk each design through a real day (a check-up with cleaning; an extraction with a prescription and a medical clearance; a braces adjustment with a payment; a new patient on an HMO; a walk-in emergency). Score each design 1–10 on: fewer tabs and buttons (the owner's words), how fast the frequent jobs are, never losing a safety fact (allergy, BP, clearance) while treating, and nothing a clinic needs becoming hard to find. Say which ideas from each are the best, and what any winner must fix.`, { label: 'judge:users', phase: 'Judge', schema: JUDGE_SCHEMA }),
  () => agent(`${BRIEF}

The designs:
${DESIGN_TEXT}

You judge as THE RULEBOOK AND THE COUNTS: check each design against CLAUDE.md's rules (one teal button per screen, 44px targets, contrast, permissions by can(), money only with finance.bill, deep links, the Treatment record stays, nothing unreachable, offline charting untouched, the intake's consent pieces have a home) and re-count its tabs and buttons honestly the way the inventory counted (a menu with 6 items is 1 visible button but 6 actions; say both). Score 1–10 on: real reduction of tabs and visible buttons, rule compliance, buildability without breaking the pages that link into the record, and risk. Say which ideas are best and what any winner must fix.`, { label: 'judge:rules', phase: 'Judge', schema: JUDGE_SCHEMA }),
])

phase('Settle')
const JUDGE_TEXT = judges.filter(Boolean).map((j, i) => `### Judge ${i + 1}\nScores: ${j.scores.map((s) => `design ${s.design}: ${s.score} — ${s.why}`).join('\n')}\nBest ideas: ${j.bestIdeas}\nMust fix: ${j.mustFix}`).join('\n\n')
const spec = await agent(`${BRIEF}

The designs:
${DESIGN_TEXT}

The judges:
${JUDGE_TEXT}

Settle ONE design: take the highest-scoring design as the base, graft in the best ideas the judges named from the others, and fix everything the judges said a winner must fix. Write the final BUILD SPEC in plain, concrete terms (the audience is the engineers who build it and the owner who will see a one-paragraph summary):
1. The owner summary: one short paragraph and a before/after table (tabs, visible buttons on the first screen, total buttons, panels, head chips).
2. The tabs (names and contents), the head, the first screen at 1440 and 390 card by card, every remaining button with where it lives.
3. The full mapping of every current section, card, button, chip and panel to its new home or its removal (with why) — nothing silently lost.
4. The frequent jobs, clicks before → after.
5. Deep links: each one and how it keeps working (redirect, alias, hash map).
6. What happens to the colour groups, pills and head chips; what stays of the owner's earlier asks and why.
7. How the intake's Consent forms pane (in /home/user/fl-intake) fits.
8. The files to change and a build order in slices that can each be verified, with the checks for each (counts measured with Playwright, the 7-role snapshot's expected differences, contrast/targets/390, every deep link, the Treatment record unchanged, offline charting unchanged).
9. Risks and anything the owner should decide (at most three questions, each with the default the build will use).
Return the spec as markdown text.`, { label: 'settle', phase: 'Settle' })

return { inventory, spec, designs: good.map((d) => ({ name: d.name, tabsAfter: d.tabsAfter, buttonsAfter: d.buttonsAfter, tabs: d.tabs })), judges }
