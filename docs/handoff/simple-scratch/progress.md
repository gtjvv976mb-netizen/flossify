# The simpler patient record — progress (worktree /home/user/fl-simple, branch round/simple)

Spec: /tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/simplify-spec.md (§8 slices).
Rules: same folder, simplify-rules.md. Server: port 4470 only. Database: flossify_simple.

## Before any measurement (every slice)
1. `psql -U root -h /var/run/postgresql -d flossify_simple -f /tmp/fl-simple-scratch/baseline/fixture.sql`
   Idempotent. Pins Maria's confirmed "Filling, tooth 36" visit (5a055ab9…) to TODAY 9:30 am Manila (the spec's
   §2.5 screen; nothing is attached to that visit), makes the 5 snap.* sign-ins (admin, assoc, sec, asst, desk with
   a custom "Front desk (snap)" role; password flossify), one certificate on Maria (the snapshot's letter print
   page), and "Rich Test" (T-RICH, 7e57a1c0-0000-4000-8000-000000000001): 5 allergies, 3 conditions, 2 medicines,
   a long note for the dentist, BP 165/102 today, an HMO LOA waiting (…00a1) with a plan item under it, a lab case
   at the lab, a filling 36 O done 29 Sep (procedure_done …00d1, catalog Filling → a real chart offer), and a visit
   in the chair today 11:00 with Dr. Hazel (…00e1). Maria and Ledger Test are otherwise as the dev data had them:
   make any other data on a NEW patient so the before/after numbers stay comparable.
2. Rebuild, restart on 4470, copy nothing into dist.
3. The database as it was at S0: /tmp/fl-simple-scratch/baseline/flossify_simple-s0.dump
   (`createdb -U root -h /var/run/postgresql X && pg_restore -U root -h /var/run/postgresql -d X <dump>`).

## Tools — /tmp/fl-simple-scratch/tools/ (copy at S0: baseline/tools-s0/). PORT_ (4470), OUT_, DB_ env
- `inv.mjs owner|dentist [--shots]`, `panels.mjs owner|dentist` → OUT_ (inventory-*.json, panels-*.json, pngs);
  `summarize.mjs <dir>` → the headline numbers (definitions in its header; they match the design inventory's).
- `fold.mjs`, `tabscroll.mjs`, `health.mjs` (the design inventory's small probes, repointed).
- `links.mjs [out.json] [--expect [--slice=N]] [--only=x]`: 150 deep links of spec §5 (+ every post redirect, the new
  back=<tab> forms, the offline kept copy via a route that adds data-offline-copy) and 36 data-rec-go/show presses.
  Each case carries §5's expected landing. Without --expect it prints the old tab mapped through TAB_OF and
  "same" / "CHANGES"; WITH --expect (the S2 gate) it exits 1 on any miss. `links-cmp.py a.json b.json [--loose]`
  compares two runs case by case.
- `snap-record.mjs <out.json>`: 7 roles × 8 record pages (Maria, Maria ?visit=today, Ledger, Rich, the two
  treatment-record papers, Maria's rx and letter papers), the 030 fingerprint plus intents / actions / hrefs /
  panels / opens / recgo sets. `snap.mjs <out> 4470 flossify_simple`: the original 22-page × 7-role snapshot.
  `cmp.mjs a b` compares either.
- `prints.mjs <dir>`: the paper pages' HTML (owner and dentist) for S7's byte-identical check.
- `refused-posts.mjs`: 9 refused record posts (writes nothing), where each lands and which panel reopens.

## S0 — baseline (no commit; base = dced1c6, the intake's phase 2 already merged by e23c2ec)
Files in /tmp/fl-simple-scratch/baseline/: inv/ (inventory-owner.json, inventory-dentist.json, panels-*.json,
264 screenshots, summary.json), summary-s0.txt, links-s0.json/.txt, snap-record-s0.json (56 pages),
snap-all-s0.json (154 pages), fold-s0.txt, tabscroll-s0.txt, health-s0.txt, prints-s0/ (10 pages),
css/ + css-s0.sha256 (27 built stylesheets), fixture.sql, flossify_simple-s0.dump.

Numbers (owner, Maria, 1440, today's visit on the page):
- Tabs 12 in 5 groups (dentist 11 in 4).
- First load: 36 controls in the record (20 buttons, 4 link-buttons, 12 tabs), 1 teal; 42 with the shell's
  buttons, 49 counting the shell's 7 nav links (the spec's 49). 390: 36. Ledger: 28. Dentist Maria: 34.
- Whole record: 91 buttons without the teeth, 123 with (sections 66 + 32 teeth; head 5, tabs 12, This visit 8).
  Spec said 88/120: the +3 are Maria's new certificate (Rx & letters 6, was 5) and the intake's Consent forms
  pane (Consent 8, was 6). Ledger 93/125; dentist Maria 86/118, dentist Ledger 88/120.
- Teal on one screen: at most 2. More menu: 8 (dentist 7).
- Side panels, Maria: 23 = 6 visits + 17 forms (the spec's 16 + rec-capacity from the intake). Ledger 40.
  Dentist 22 / 38. No opener on this data: rec-loa-approve, rec-loa-deny, rec-adjust-add, rec-letter-answer.
- Head (fold.mjs): 214–528 at 1440; This visit 544–972; first banner y=988, first card y=1105; 390: head 306–866,
  strip 934–1666, banner 1678, first card 1805; 1366×768 banner 1005. Maria's head chips: Allergy: Penicillin,
  Hypertension (2), 4 tiles; 12 banners.
- links-s0: 150 links + 36 presses; 23 rows are "CHANGES" = where §5 moves the landing (every ?open= → Today,
  a cancelled visit → Treatment record, ?treated= without saved → Chart, a dentist's #money → Treatment record,
  #chart-offer / #patient / #patient-forms / #details-card with no element, back=patient). All other 127 already
  land on §5's tab once the old tab is read through TAB_OF.
Notes for later slices, seen in the baseline:
- `?treated=<id>#chart-offer` with no `saved` lands on Overview today and ChartOffer is not drawn (it is drawn
  only when current === 'chart' or treatment): S2's `current` must take ?treated= to chart.
- `?open=health` opens nothing yet (rec-health is S5). `hash-money-dentist` has no element: needs the TAB_OF
  fallback in fromHash (S2).
- `#consent-paper` and `#consent-forms` exist inside Consent; `#patient-forms`, `#details-card` do not exist yet.

## S1 — TAB_OF and the resolver check — commit b593a0e
- `_record/sections.ts`: TabId, TABS (overview Today teal calendar · patient Patient info rose user · chart
  Chart & plan blue tooth · treatment-record Treatment record violet history; `short` = the phone label),
  TAB_OF (28 names, exactly spec §5), tabOf(). The page's landing rules moved here unchanged: ANCHOR, SAVED_TO
  (was savedTo), SAVED_WORD + recordSaved, OPEN_PANEL, backOf (was the inline postedBack), landingSection (was the
  `current` expression; its `visit` is 'today' | 'ledger' | 'other' | null). The page imports them.
  record.ts / record-extra.ts: `export` on SECTION_OF (no other change). Only difference in behaviour: a saved
  word equal to an Object.prototype name (?saved=constructor) no longer picks a function as the section.
- `scripts/dev/record-tabs-check.mjs`, `npm run test:record-tabs`: fails naming value and source when any of
  ANCHOR, EXTRA_ANCHOR, both SECTION_OF, SAVED_TO, SAVED_WORD, OPEN_PANEL, SECTION_META, backOf, each intent's
  redirect hash, every saved word scanned from record.ts / record-extra.ts and from redirects into the record
  (30 found), landingSection over 25,200 combinations (post section × back=chart × saved word × ?open= × ?visit=
  today/ledger/other/none), every #hash linked into the record from the source (16 found) + the 32 of §5, every
  data-rec-go/show (9), does not resolve to one of the four tabs; and every ?open= in a link (6) must be an
  OPEN_PANEL key. Negative test: removing `money` from TAB_OF and mis-mapping `loa` gave 7 named failures, exit 1.
- Checks: test:record-tabs passes (238 names, 25,200 combinations). Built S1 vs baseline: links 150 + presses 36,
  0 differences (links-cmp.py, strict: tab, element, dialogs, focus, scroll, callouts); snap-record 56 pages,
  0 differences; refused posts (note/plan with back none|chart|treatment, vitals, rx, recall, letter) land on the
  old sections with their panels open, nothing written; built CSS byte-identical (27 files).
- For S2: wire `current = tabOf(landingSection(...)) ?? 'overview'` (and make ?treated= → chart, OPEN_PANEL →
  overview per §5), widen backOf to overview | patient | chart | treatment-record (+ treatment → chart), let the
  client script import tabOf from sections.ts for show() / fromHash, and keep `npm run test:record-tabs` passing.
  Gate: `node links.mjs out.json --expect --slice=2` must exit 0. Cases a later slice builds carry `slice` and
  are shown as "later (Sn)", not failed: open-health (S5), visit-cancelled-empty (the fold, S7); saved-birth
  accepts patient|overview until S5. Raise --slice with each slice; S8 runs it with no --slice.
- Open: nothing.

## S0-S1 fix after verification — commit 457efad (only scripts/dev/record-tabs-check.mjs)
The verifier found that the resolver check missed 5 one-word mutations: DeskConsent.astro:163 '#consent-paper',
ChartOffer.astro:71 '#chart-offer', TreatmentPanels.astro:111 ternary hash, NotePanel.astro:104 aimForm home, and the
page's `backTo = 'consent'`. I reproduced all 5 on b593a0e (exit 0).
- The check now lexes every string and template literal in src. A template's ${…} is lexed too, and a nested literal
  knows the address before it. A mask blanks comments, regexes and literal text. `follow()` reads an expression to
  its literal names through ternaries, ??, ||, && and parens, consts, lets and their assignments (in code regions
  only: frontmatter and <script> of .astro), a function's parameters (every call, in all files when exported) and
  `el.dataset.x` (every data-x in the record's files). The record's addresses are found by shape: /patients/${id}/,
  vars and helpers that hold one, patients-list bases + id, `action` in components the page hands its address.
- Fail-closed in the record's own files (the page, _record/, _ui/, DeskConsent via `action`): a # it cannot place,
  a name it cannot follow, a name built in pieces, a # outside any literal, or markup lexed as a string (a straight
  apostrophe) all fail. In any file, an address named like a record's (record|patient) that the check cannot read
  fails. ALLOWED holds the two location-hash expressions in the page's script; an unused allowance fails.
- backTo is read from landingSection()'s argument in the page (fails if the page stops calling it). The hard-coded
  sections list is gone. The combos use the page's backTo values, SECTION_OF values, backOf() outputs and the
  `const section` fallback. New: every `openNow === 'x'` in the page and the spec's six ?open= must be OPEN_PANEL keys.
- `npm run test:record-tabs -- --list` prints every name with where it was read. It runs in 1.2 s.
- Found now: saved 30 (same), hashes 20 (was 16: + chart, chart-offer, notes, treatment-done), go 9 (same), ?open= 2
  (the old 6 included 4 read from comments), backTo sections 3, 71 hash sites, 33 own files.
- Mutations: the verifier's round 1, 29/31 caught. The 2 missed change only comments (pickpanel.ts:7 doc comment,
  sign/[visit].astro:15). Round 2, 8/9 caught; its sign-page pattern is not in the source, so nothing was mutated.
  Scripts: /tmp/fl-simple-scratch/s1fix/neg-fixed.sh, neg2-fixed.sh. My 37 real-code mutations
  (s1fix/neg3.sh), 37/37 caught; the original script caught 16/37. Plus s1fix/neg4.sh: 5/6 caught. The one
  not caught removes a hash entirely, so there is nothing to check.
- Re-run: test:record-tabs passes (252 names, 25,200 combinations). Build: 27 CSS files byte-identical to S0
  (Tailwind scans scripts/). links.mjs 150 + 36 presses, 0 differences vs links-s0 and links-s1. snap-record
  56 pages, 0 differences vs S0. Server stopped.
- For S2+: when the page's show()/fromHash/backTo change, the check may fail with "cannot tell which names …"
  or "ALLOWED: … take it off the list". That is by design: teach COVERED or ALLOWED, with a reason.

## S0-S1 fix after verification, round 2 — commit 0f1aa4d (only scripts/dev/record-tabs-check.mjs)
The verifier (verify-S0-S1/r2, mut1.json) found 3 gaps. Reproduced on 457efad (copy in s1fix2/tree, harness
s1fix2/mutate.mjs with MUT_TREE): mut1 39/54 caught; all 10 of the reported mutations passed with exit 0.
- go:/show: → `keyValues(F, key)`: every value a key gets in a file (`key: v`, quoted key, shorthand in code,
  `x.key = v`; `key?:` and type-only values like `string` are skipped as type members). follow() reads an object
  property `a.go` in the record's own files as every `go` value in that file + the files that import it (the
  page); none found → fails. The old COVERED rule for x.go/x.show and the single-quote regex are gone.
- show() → every call of the page's show() is followed (fails if the page has no show()); plus every tab looked
  up by id: literals 'rec-rec-x-tab' and templates `rec-rec-${…}-tab` (not the id={…} RecordNav draws with),
  followed through tabFor's calls. follow() now also reads a call of a same-file one-expression function
  (panelOf → its body) and any member chain ending .dataset.x (plus `.dataset.x =` and setAttribute('data-x', …)
  in own files). New ALLOWED: fromHash's `id.replace(/^rec-/, '')`. New kind "names that pick a tab" (12).
- saved words → every `saved` and `section` key in record.ts / record-extra.ts, followed (so every done() call);
  follow's `prefix` mode reads a template by its leading word (`plan-${to}` → 'plan-'). The `const section`
  reading is replaced by the `section` keys (shorthand → the const).
- Also: SPEC_TAB_OF pins each §5 name (and rec-<tab>) to its §5 tab (the verifier's 2 "wrong tab" misses).
- Mutations after: mut1 51/54, mut2 4/5, mut3 8/8; every miss (4) changes only a comment (panels.ts:457,
  forms/[form]:27, new/type.astro:14, sign/[visit].astro:15), and the code lines are caught in mut2/mut3.
  Earlier suites, no regression: neg1 29/31, neg2 8/9 (+1 not applied), neg3 37/37, neg4 5/6 (same as before).
  New s1fix2/neg5.sh (27: go/show via const, shorthand, quoted keys, assignment, call, multi-line ternary; show()
  via template, double quotes, const, observer, unreadable arg; tabFor direct; ChartOffer tab id; data-rec-panel;
  setAttribute/dataset writes; show() renamed; saved via bare template, let, +, wrong first word, undefined const,
  helper call; an Outcome's own section; the fallback section): 27/27 caught.
- Re-run: test:record-tabs passes, 1.3 s: 288 names checked (was 252), 31,248 combinations (was 25,200: the saved
  list now keeps whole words and template prefixes, 42; nothing lost: hashes 20, go 9, ?open= 2, back 3 the same).
  Build: 27 CSS byte-identical to S0; the verifier's 148 client files byte-identical to its 457efad build.
  links.mjs 150 + 36 presses, 0 differences vs links-s0; snap-record 56 pages, 0 differences vs S0; refused posts
  identical to the verifier's HEAD run, nothing written. Server stopped. Worktree clean.

## S0-S1 fix after verification, round 3 — commit c4463a2 (only scripts/dev/record-tabs-check.mjs; tools/links.mjs outside the repo)
The verifier (verify-S0-S1/r3: mutA.json, mutB.json) found 3 failures. Reproduced on 0f1aa4d (tree s1fix3/tree =
git archive + node_modules link, harnesses s1fix3/mutate.mjs / mutate2.mjs with MUT_TREE): mutA 3 caught of 14 (13
real + 1 control), mutB 1 of 5 (the control only).
1. Concatenated addresses (close:338/370, panels.ts:463, consents:35, forms/[form]:98, new/type:288). Fixed: prefixOf()
   reads what is written before a literal backwards through + chains, `x +=`, .concat(), the conditional it is one side
   of, the group it stands in and its template ${…} (replaces addrBefore's parent walk and the CONCAT regex). addressOf
   reads the address from its first record/list piece (an origin may come first). Variables holding a record address
   with a query, helpers with a block body (`return`), and parameters a record address is passed to (scoped to the
   function; same file or a named import) are known. Code added after a record address in structure position
   (`${record}${q}`, record + q, a group) is followed to its literals and each read as the rest of the address
   (readPiece); unfollowable fails. New ALLOWED: the page's to() query, leaveOffer()'s u.toString().
2. panels.ts rec() by + or by a URL object. Fixed by 1 and: URL objects in every file (new URL(<address>) → record /
   page / here; .hash =, .search =, .searchParams.set/append('open'|'saved'|'visit') read; an unplaceable object
   outside the record's own files fails); `[record, x].join('#')` fails. SPEC_SITES pins 22 §5 link sites to their
   files (hash / saved / open / visit names): a site the check stops reading fails. S2: a §5 change (close:338 →
   #treatment-record, import.astro:572, dropping the Dashboard's hashes) updates SPEC_SITES in the same change.
3. links.mjs: dash-vitals-open now expects { tab: 'overview', dialog: 'rec-vitals-add' } only. New `until` (shown
   "retired (after Sn)", not failed): saved-birth `?saved=birth#health` → patient + el until S4, saved-birth-details
   `?saved=birth` → overview from S5; visit-future-cancelled → overview until S6, visit-future-cancelled-fold →
   treatment-record from S7 (same two-tab looseness, not in the report). links-cmp.py lists cases only in b.
   baseline/tools-s0/links.mjs is left as the S0 record; the gate is tools/links.mjs.
Measured after: mutA 13/13 real caught (control passes), mutB 4/4 (control caught as before), my mutD 21/21 real
(helper params, consts, +=, URL objects on sign/rx, URLSearchParams, origin, join, pins, import/treatment-record/
letters/files/new/intake/panels forms; control passes), mutE 3/3 (.join, .concat; control passes). No regression:
round-2 mut1 51/54, mut2 4/5, mut3 8/8 (misses are comment-only, as before); neg1 29/31, neg2 8/9 (+1 not applied),
neg3 37/37, neg4 5/6, neg5 27/27 (identical to round 2). Outputs: s1fix3/final-*.txt / *.out.
Re-run: test:record-tabs passes in 1.7 s: 310 names (was 288), 31,248 combinations, found lists identical to 0f1aa4d
plus 6 ?visit= sites; 8 pieces after a record address, 1 URL-object write, 22 §5 sites. Build: 27 CSS byte-identical
to S0; dist/client 148 files identical to the round-2 build. links.mjs 152 links + 36 presses: 150 vs links-s0,
0 differences (2 new cases). snap-record 56 pages, 0 differences vs S0. Refused posts identical to round 2.
Known limit (in the check's header): an address handed on whole inside an object or an array and put together later
is not read; a §5 link written that way fails its pin when it was the only one writing that name in its file.
Server stopped. Worktree clean.

## S2 — the frame — commit 50eab20
Files: [patient].astro, _record/{RecordNav, SavedLine (new), sections.ts, pickpanel.ts, record.css, Vitals, RecallCard, Treatment,
Files, Loas, PayPlans, Prescriptions, Letters, Notes, ConsentForms, TreatmentPanels, NotePanel, VisitStrip, TreatmentRecord},
_ui/patients.css, import.astro, scripts/dev/record-tabs-check.mjs; Banner.astro deleted.
- Four tab panels rec-overview/rec-patient/rec-chart/rec-treatment-record, each starting with an absolute 1px anchor
  (#overview, #patient, #chart, #treatment-record: moved off the Details pane, the chart pane and the ledger's Pane) and,
  in the tab showing first, <SavedLine>. Today: This visit, the old Overview grid (unchanged, Details included), Visits.
  Patient info: Vitals, Health, <div id="consent" hue-violet> (Privacy consent, ConsentForms, Signed at visits, Patient
  forms). Chart & plan: ChartOffer (drawn only here now; Treatment's slot="offer" gone), Chart, Treatment, Files, Loas,
  PayPlans (green). Treatment record: ledger (violet), Notes (blue), Prescriptions, Letters, Money (green, finance.bill), Texts.
  Hues: TAB_HUE from TABS, cardHue() from CARD_HUE (sections.ts; SECTION_META trimmed to hue + icon, GROUPS gone).
- Panels outside the tabs: every card with a panel takes part="body" | "panels" and is drawn twice with one props
  object (vitalsProps, recallProps …). Their saved callouts moved into SavedLine.astro (one slot, all words; the Chart's
  words when drawn on Chart & plan; a BP out of range said on other tabs, not on Patient info where the card says it).
- Every panel form has <input name=back data-rec-back> (details too, except with dash). The page script aims it as the
  panel opens (ws:panel-open, and at init for panels the server drew open): back=currentTab(), action #<tab>
  (pickpanel.aimForm now `backOf(back) ?? home`). TreatmentPanels/NotePanel: palette → chart, any other opener →
  currentTab(), auto (?open= or refused) keeps the posted back or takes currentTab(). planRefused = plan-status with any back.
- Server: backOf() takes the 4 tabs (+ treatment → chart). Saved: `?saved=…&back=<b>#<b>` (treated: #chart-offer).
  Refused: backTo = back, except INLINE_REFUSAL intents (card sentences) and plan-status without back → their section.
  Details: refused over its back, saved → #overview. current = tabOf(landingSection({backTo, treated, back, saved,
  openNow, visit})) ?? 'overview'; landingSection order: backTo, treated → chart, back, SAVED_TO, recordSaved, open → Today.
  OPEN_PANEL values all 'overview'.
- Client: show(name) = tabNamed (element's tab, else TAB_OF, else less rec-) + scroll the card into view or reveal() the
  tab top only when needed (top under the row, or lower than innerHeight−96 → scrolled to just under the stuck row).
  fromHash skipped when the server opened a panel (data-rec-opened: ?open=…#vitals stays on Today); on a refused POST
  (data-rec-posted) a hash naming another tab is rewritten to the server's tab. data-rec-show is gone (nothing uses it:
  the strip's panel buttons and Add ▾ open over the tab in view). --rec-top/--rec-stick measured; `.rec-body [id]`
  scroll-margin (patients.css rule removed).
- RecordNav: horizontal tablist (data-ws-tabs, aria-orientation horizontal), sticky under data-ws-top, Add ▾ = ws/Menu
  (#rec-add, items data-rec-add-item, groups This visit / Plan / Papers / Money). Chart & plan count = open plan items
  (sr words "N open on the plan"; a dot on phones). <768: grid 4fr|1fr, 5 columns of 71px × 56px at 390.
- import.astro:572 now links #treatment-record (SPEC_SITES updated).
Checks (all on the final build, fixture applied):
- test:record-tabs passes: 870 names, 190,960 combinations (+ ?treated= → chart and back → its tab for every saved word).
  Mutations: show('nonsense-y') and show(recGo + 'z') both fail it.
- links.mjs --expect --slice=2: 152 links + 16 presses, 0 failing (4 "later": visit-cancelled-empty S7,
  visit-future-cancelled-fold S7, open-health S5, saved-birth-details S5). Presses 36 → 16: More's and the strip's
  data-rec-show buttons are gone. s2/links-s2-final.txt.
- tools/backs.mjs (new): 192 cases, 0 failing — 17 panel saves × 4 tabs through the real panels (tab = back, or chart
  for ?treated=; back=<tab> and #<tab> in the address; a saved line), 9 card buttons × 4 crafted backs, 22 intents
  refused × 4 backs (panel reopened over that tab with its sentence and back=<tab>/#<tab>; card intents on the card's
  tab with the sentence). Rows unchanged by every refusal. Rx save from Today: "Prescription saved. Print it…" +
  "Printed without a PTR number…" on Today (every clinician has no PTR on file) — on all four tabs too.
- tools/focus.mjs (new): all ok — palette → Add to plan / Treatment done / Clinical note open with back=chart #chart,
  Escape gives focus back to teeth 26/36/46; Add ▾ › Prescription over each tab keeps the tab, back=<tab>, focus back to
  Add ▾; ↓/Escape in Add ▾; → ← End Home on the tabs; kept copy opens on Chart & plan with Add ▾ hidden; offline hides
  Add ▾, online shows it; reveal only when needed at 1440 and 390; ?open=vitals|note|rx|done|file|details over Today with
  back=overview; no sideways scroll; no page errors. Add ▾ items 11 (owner), all 55px.
- tools/row-contrast.mjs (new): the row and Add ▾ open, light/dark × 1440/390, stuck over content: 148 texts, lowest
  4.64 (menu hints, the workspace's own menu style), targets ≥ 44 (tabs 44 high at 1440, 71×56 at 390).
- tools/refused-posts.mjs (the S0 tool, no back): every panel reopens, TAB_OF of the old section (note → treatment-record,
  back=treatment → chart), nothing written.
- snap-record vs S0 (tools/cmp2.mjs, order ignored; 56 pages): intents, actions, panels, opens unchanged; print pages
  unchanged. Differences only: tabs (12 → 4), headings (the 12 banners), buttons (the tabs; More → Add ▾ with its items:
  renamed Add to plan / Blood pressure / X-ray or photo / Certificate or letter, new Record a treatment / Lab case /
  HMO approval (LOA) / Braces or payment plan), fields (+12 hidden back, +13 with finance.bill), links/hrefs (Bring in past
  visits), recgo (show:* gone). snap.mjs (22 pages): only the record, plus data/time (calls after hours).
- After the checks the database was restored from the S0 dump + fixture (the backs runs had added T-BACK-* patients).
Open / for later slices:
- Today's badge (open lines) waits for S4's lines; only Chart & plan has a count.
- More teal buttons than one on a tab until S6/S7 remove the cards' own add buttons (Add to plan, Add files, New note,
  New prescription are primary inside their cards); the head's New booking is still teal (S3).
- Details stays on Today (with the old Overview) until S4/S5; #details-card has no element yet (resolves to Patient info).
- Visits table is on Today until S4/S7; its empty state still links Bring in past visits.
- Add ▾ is ws/Menu (disclosure button), not <details>; 11 items for the owner, 9 for a dentist (the spec's table lists 11;
  its "10 / 8" does not add up).

## S2 fix after verification — commit 0d1e4e6 (on 50eab20)
Tools and outputs: /tmp/fl-simple-scratch/s2fix/ (landing.mjs, roww.mjs, rowwide.mjs, roerr.mjs, row-contrast.mjs with
SIZES_, saved-contrast.mjs, shots.mjs; *-fix.txt/json).
1. Saved line hidden after a card's own post (recall new at S2; plan rows, lab, file, LOA, payplan, ?treated= already
   hidden at S0) → FIXED. The saved line is drawn once, where the address lands: panel save (?back=) at the tab top;
   a save with no back inside its card, under its title (savedCard(word) in sections.ts, SAVED_CARD; the redirect's
   #hash now = postedBack ?? savedCard(saved) ?? ANCHOR … so they cannot disagree; hashes unchanged for every intent);
   ?treated= with the offer drawn: at the top of ChartOffer (its default slot); offer not drawn → tab top. Cards got a
   `saved` slot (RecallCard, Vitals, Treatment ×3 via savedAt, Files, Loas, PayPlans, Notes, Prescriptions, Letters).
   Refused row buttons' sentences moved into the same place (inside their card) — they were above the card, hidden.
   SavedLine wraps its callouts in <div data-rec-saved class="grid gap-3 {class}">, drawn only when it says something.
   landing.mjs (new patient T-LAND-*): 119 cases at 1440×900 and 119 at 390×844, 0 failing — A 19 panel saves × 4 tabs
   (incl. a treated done-add → #chart-offer), B the same 19 posted with no back (line in its card), C 15 card buttons
   clicked as drawn (agreed, not agreed yet, declined, remove, mark done, mark done with an offer + Update the chart,
   lab ×3 incl. remake, file remove, LOA cancel, payplan stop, recall came in / 6 months / clear / 3 months), D 7 refused
   card posts (sentence in the card). Every line: exactly one [data-rec-saved], top ≥ row bottom, bottom ≤ viewport,
   elementFromPoint hits it (headless hit-tests <html> for ~0.5 s after an accepted confirm(): the tool looks again).
   Verifier's cards.mjs: 6/6 ok at 1440 (lines y≈223–298, row ends 130) and 390 (y≈209–290, row ends 126).
   saved-contrast.mjs: in-card lines 44 texts, lowest 10.46 (dark) / 13.29 (light) — callout tints are opaque.
   vitals-high/crisis with no back on Patient info draws no line, as at S0 (the card's own advice speaks).
2. Duplicate id="consent" → FIXED: the Consent wrapper lost its id (keeps hue-violet); #consent is DeskConsent's
   section as at S0. dupids.mjs: 0 duplicates, 0 bad label[for], 0 bad aria refs (3 patients × owner/dentist).
3. Tab row wrapping at 768–1080 → FIXED: inline script under the row (RecordNav) sets data-fit="compact" then "short"
   when the tabs would wrap (measured by offsetTop), refits on width change in the next rAF (no RO loop error while
   resizing 1440→380→1440). The 768–1023 media rule is replaced by the data-fit rules. rowh.mjs: 58px one line at
   768–1440 (short 768–834, compact 900/1024/1080, full 1000 and ≥1112 with Maria); 390–767 phone row 66px unchanged.
   rowwide.mjs: + a Today count "12", Chart "14", DejaVu Sans / Verdana: never wraps. row-contrast (SIZES_ 1440, 1024,
   834, 768, 390; light/dark; Add open): 376 texts, lowest 4.64 (menu hints, unchanged), 0 failing; tabs ≥ 44 high.
   Sticky block at 1024×768: 72 + 58 = 130px (was 178).
Slice checks re-run on the final build (fixture applied): test:record-tabs 927 names, 190,960 combinations, passes
(+ SAVED_CARD checks; mutations recall→notes, loa removed, lab→treatment-labs each fail it). links.mjs --expect
--slice=2: 152 links + 16 presses, 0 failing; vs links-s2-final loose 0 differences (strict: scrollY and card tops only,
the line moved into the card; #consent lands 81px lower on DeskConsent's section). backs.mjs 192 cases 0 failing,
refusals wrote nothing. focus.mjs all ok (same lines as S2). refused-posts identical to S2. snap-record vs S2: 0
differences; vs S0: the same difference list as S2's.
Database restored from the S0 dump + fixture afterwards. Server stopped. Worktree clean.
Open (for S3): the head's callouts after ?saved=capacity|consent-removed#consent are scrolled past by the #consent
landing (same at S0).

## S2 fix 2 after verification — commit d5eeece (on 0d1e4e6)
Tools and outputs: /tmp/fl-simple-scratch/s2fix2/ (slowall.mjs, focuswalk.mjs, facing.mjs, consentdbg.mjs; the verifier's
slow.mjs and obscure-generic.mjs copied; *-fix*.txt/json).
1. A card's own button refused by the rate limit landed on Today with its sentence on the hidden Chart & plan → FIXED.
   The slow outcome now carries the intent's own section (SECTION_OF of record.ts / record-extra.ts, imported as
   RECORD_SECTION / EXTRA_SECTION) and backTo falls back to it (the `slow ? null` is gone). Reproduced first on HEAD
   (verifier's slow.mjs: 3/3 → tab overview #overview, shown 0). After: 3/3 ok (tab chart, #treatment / #treatment-lab /
   #loas, shown 1, on screen). slowall.mjs (new, patient T-SLOW-*): 110 cases at 1440×900 and 110 at 390×844, 0 failing —
   A 16 panels × 4 tabs refused (panel reopens over that tab with the sentence), B 16 panels posted with no back (panel
   over its own section's tab), C 12 card buttons × from the card's tab and another tab's address (plan agreed / declined
   / remove / mark done, lab next / remake, file remove, LOA cancel, payplan stop, recall came in / clear → sentence in
   the card, under the row, hit; recall In 6 months → rec-recall-set panel), D Update the chart (in #chart-offer).
   Row counts before = after for every case (nothing written).
2. Focus under the sticky row → FIXED. record.css: `html:has([data-rec-bar]) { scroll-padding-top: calc(var(--rec-stick)
   + 1rem); scroll-padding-bottom: 1rem }` (phones: fallback 7.5rem); `.rec-body [id] { scroll-margin-top: 0 }` (zeroes
   DeskConsent's scroll-mt-24, which the old [id] rule had overridden — without it #consent landed 100px low).
   Same pattern as the Dashboard's `html:has(.dash-board)` in cal.css. 1rem, not 0.75rem: a date field's day/month
   segment is what Chromium scrolls to, and at 0.5rem the field's box was 5px under the row.
   Verifier's obscure-generic.mjs: HEAD 24/110 (1440), 33/111 (390) → 0/110, 0/111. focuswalk.mjs (new): Shift+Tab up
   and Tab down through every tab, Maria and Rich, 1440×900 · 1366×768 · 1024×768 · 768×1024 · 390×844: 2134 stops,
   0 under the row or below the foot. Mutation (MUTATE_=1 puts HEAD's rules back): 118 of 856 hidden at 1440/390,
   matching the verifier's HEAD numbers for Maria exactly.
   Landings move uniformly: every card and tab 4px lower at 1440 (top 142 → 146), 8px on a phone.
   Show the patient (facing.mjs): still full screen at 1440/1024/390, 12 tab stops inside, 0 off screen.
Slice checks re-run on the final build (fixture applied): test:record-tabs 927 names, 190,960 combinations, passes.
links.mjs --expect --slice=2: 152 links + 16 presses, 0 failing; vs s2fix/links-fix loose 0 differences; strict 105,
all the uniform 4px (99 el top +4, 105 scrollY −4). backs.mjs 192 cases 0 failing, refusals wrote nothing. landing.mjs
119/119 at 1440 and 390, 0 failing. focus.mjs all ok, output byte-identical to s2fix. refused-posts identical to s2fix.
snap-record vs s2fix: 56 pages, 0 differences. Verifier's cards.mjs 6/6 ok.
Database restored from the S0 dump + fixture afterwards. Server stopped. Worktree clean.
Open: a slow refusal still reopens a panel empty (values {}), as at S0 — the rate limit fires before the form is read.

## S2 fix 3 after verification — commit a5a6739 (on d5eeece)
Files: [patient].astro, _record/{pickpanel.ts, Notes.astro, Prescriptions.astro, Files.astro}. Tools and outputs:
/tmp/fl-simple-scratch/s2fix3/ (panel-focus.mjs, visit-focus.mjs, teal-sweep.mjs, checks.sh; *-head.* = measured on
d5eeece built in s2fix3/tree, *-fix* = on a5a6739).
1. Focus lost after closing a panel the server drew open → FIXED. Reproduced first: verifier's focus2.mjs SKIP_PAL=1
   15/36 failing + focus2-pp.mjs 3/4 (the 18 of 40). landFocus(panelId) in pickpanel.ts runs on every panel's
   ws:panel-close (the page wires it for all dialog[data-ws-panel]; focusBack() keeps the tooth, then calls it): when the
   shell's focus did not land on something on screen, a button on screen that opens the panel, else Add ▾ when its list
   holds the panel, else the tab in view. After: focus2 0/36 (1440) and 0/36 (390, focus2-390.mjs), full focus2 with the
   palette 0/55, focus2-pp 0/4. New panel-focus.mjs: 17 panel intents (16 record/extra + details) refused × 4 tabs,
   closed by Escape or Close, owner 1440 (Maria, Rich), owner 390 (Maria), dentist 1440 (Rich): 268 cases, HEAD 151
   failing (all <body>), fix 0 (focus on screen and hit by elementFromPoint, never under the row). visit-focus.mjs
   (?visit= for every visit of Maria, Rich, Ledger, 1440/390, Escape and Close): HEAD 36/108 on <body> (Ledger's folded
   days), fix 0/108.
2. Two teal buttons on one screen → FIXED. Continuous sweep (teal-sweep.mjs, every tab scrolled 40px at a time; owner
   and dentist; 1440×900, 1366×768, 390×844; Maria, Rich, Ledger, an empty patient, one with consent on file): HEAD 60
   of 120 tab sweeps > 1 (worst 3), incl. pairs the sampled sweep missed (Add to plan + Add files, New booking + New
   note / Add to plan on sparse patients). Fix, light and dark: 0 of 240, worst 1. Now quiet: New booking (spec §2.2),
   New note, New prescription (removed in S7), Add files (removed in S6). The health form's Save is quiet only while
   DeskConsent draws its teal Record consent (consentAsked = notice && canEdit && (no consent in force || guardian
   needed)); S5 moves the form into rec-health. Teal per tab now: Today none, Patient info Record consent (or the health
   Save when consent is on file), Chart & plan Add to plan, Treatment record none. Page heights identical HEAD vs fix
   on all 120 sweeps. Verifier's sweep.mjs: teal ≤ 1 on every tab, contrast < 4.5: 0, targets and sideways as HEAD.
Slice checks on the final build (fixture applied): test:record-tabs 927 names, 190,960 combinations, passes. links.mjs
--expect --slice=2 152 links + 16 presses, 0 failing; vs s2fix2 0 differences strict and loose. backs.mjs 192 cases 0
failing, refusals wrote nothing, Rx from Today shows Print it + "Printed without a PTR number". focus.mjs all ok, output
identical to s2fix2 (palette → tooth, kept copy on Chart & plan with Add ▾ hidden). refused-posts identical, nothing
written. snap-record vs s2fix2: 56 pages, 0 differences; vs S0 the same list as s2fix2. focuswalk 2134 stops, 0 hidden;
obscure-generic 0. landing 119/119 at 1440 and 390. slowall 110/110 at 1440 and 390. Built CSS: 28 files byte-identical
to d5eeece; dist/client identical to the measured build (only server/entry.mjs's manifest order varies build to build).
Database restored from the S0 dump + fixture afterwards. Server stopped. Worktree clean.
Open: none from this round. Today has no teal until S4 draws This visit's next step.

## S3 — the head — commit 9e84ba8 (on a5a6739)
Finished from the first S3 builder's uncommitted work (kept whole after review; no code changed by the second builder).
Files: src/lib/health.ts (readBirth, saveBirth), src/lib/import.ts (importNotesOf), [patient].astro, _record/{RecordNav,
record.css, sections.ts (SAVED_TO birth → overview), SafetyLine.astro (new), safety.ts (new)}, _ui/patients.css.
- Head: tiles and hereNow (and the `next` query) gone. Facts line: chart no., age, sex, mobile, HMO + member no.; with
  finance.bill "Owes ₱…" / "In credit ₱…" links to finances/?patient=<id>&view=all ("Nothing owed" plain text at 0).
  Edit details and New booking quiet. Safety line = plain pills (SafetyLine head): allergies or "No known allergies" (green)
  / "Allergies: not asked yet" (amber), conditions, "Takes …", BP, "Clearance asked <day>", under 18. Note for the
  dentist callout, then "Desk note" (deskNoteOf); the import's own lines go to Details as "From the old records".
- Pinned: ≥768 an aria-hidden compact copy under the row, shown (data-pinned) when the row is stuck and the head's line is
  off screen (two IntersectionObservers; data-rec-stuck mark); laid out always, counted in --rec-stick; row+copy capped at
  128px by folding note → medicines → conditions → minor → clearance → BP into "+N more alerts, at the top"; allergies
  never fold. <768: one line of words above the 5 columns ("Allergy: Penicillin · +1 more"), allergies in full.
- Birth date in Edit details (age beside it); saveBirth in the details transaction (a version with {birth_date:{from,to}},
  audit patient.birth_date); a conflict (birth_was ≠ on file) rolls back the whole save with a sentence. ?saved=birth →
  Today. The health form has no birth field; an old form posting birth_was still has its birth date kept.
- A focusin handler scrolls a tab's textarea fully into view (the health note at 1366×768 was below the foot).
Checks (s3/checks.sh, outputs s3/run/; fixture + s3/fixture-s3.sql: T-PIN 5 long allergies/6 conditions/4 meds/BP crisis/
clearance asked/minor/long note/desk note with import lines; T-NONE no allergies, in credit ₱500; T-ASK no history):
- Sticky block 1366×768: Rich (5 allergies + long note) row 58 + copy 67 = 125px ≤ 128 ("+3 more alerts"); Maria 97.
  T-PIN 153px: its 5 allergies alone need more than 128, and an allergy is never cut (spec's rule wins). 390: Maria bar 98,
  T-PIN 189 (all 5 allergies in full). 9 sizes 360–1440, light and dark: all ok, no allergy folded or clipped.
- covered.mjs: 281 cases 0 failing (landings incl. #chart-offer below the block; panels opened while pinned: title on
  screen and hit; the chart palette on a tooth under the pinned block).
- owes.mjs: 8 roles × 3 patients: "Owes"/"In credit"/amounts only for finance.bill (owner, admin, secretary); none for
  dentist, associate, assistant, desk, ramon.
- contrast.mjs: 1164 texts light/dark at 1440/1366/390, lowest 4.97, 0 failing; head targets ≥ 44. row-contrast 500 texts
  lowest 4.64 (menu hints, unchanged), 0 failing.
- birth.mjs: 16 cases all ok (case 10 fixed in the tool: goto about:blank first, a same-path hash goto kept typed answers).
- test:record-tabs 925 names, 190,960 combinations, passes. links.mjs --expect --slice=3: 152 links + 14 presses, 0 failing
  (presses 16 → 14: the BP and clearance chips are no longer buttons). backs 192/0. landing 119/119 at 1440 and 390. slowall
  110/110 at 1440 and 390. focus all ok. refused-posts nothing written. focuswalk3 2856 stops 0 hidden. obscure3 0.
- snap-record vs s2fix3: only the head (Balance/Consent tiles gone, Owes link added, BP/clearance chip buttons and go:rx gone)
  plus date noise (Manila crossed into 1 Oct during the run: "Sep"→"Oct", Calls' "In closed time" line).
Database restored from the S0 dump + baseline fixture + s3/fixture-s3.sql afterwards. Server stopped. Worktree clean.
Open (for S4): the LOA-waiting, plan-behind and stale-health chips are still buttons in a row under the safety line
(data-rec-go treatment/health) until Today's Needs attention takes them; so the head has 2 buttons + to-do chips, not
yet the spec's 2 + 2 links. lastVisit is still computed (Letters uses it; S4's Last visit card will too).

## S3 fix (verifier round 1) — commit 0488b89
- Failure: facts line clipped a long HMO + member no. ("Health Partners Dental Access HPDA-0000-1234-5678-9" ran 151px past
  the box at 390, 181 at 360, 134 at 1024; overflow hidden, so the member no. was cut). Fixed in patients.css only:
  `.rec-facts-in > span` is no longer nowrap; it has max-width 100% (border-box, so the dot's 1.5rem is counted),
  min-width 0 and overflow-wrap anywhere. Flex still places each fact at its max-content width, so a fact keeps to one
  line while it fits one; only a fact wider than the whole line wraps inside itself.
- s3fix/clip.mjs: 5 HMO samples (HPDA long, EastWest, Maxicare, Intellicare alone, a 27-char unbroken member no.) ×
  7 widths (1440…320) × light/dark = 70 cases, 0 failing (nothing past the box, every character inside, no side scroll).
  HPDA wraps to 2 lines at 1024/390/360, 3 at 320. s3fix/short.mjs: 130 facts on 5 patients × 5 widths, 0 short facts
  wrapped (only the long HMO one). Screenshot s3fix/facts-390.png.
- s3/checks.sh re-run: record-tabs pass; links 152+14 0 failing; focus ok; refused nothing written; focuswalk 2856/0;
  obscure 0; backs 192/0; landing 119/119 at 1440 and 390; slowall 110/110 both; row-contrast 500 lowest 4.64 0 failing;
  pin ok light+dark; covered 281/0; owes all ok; contrast 1164 lowest 4.97 0 failing; birth ok; snap diff vs s2fix3 the
  same S3 head changes as before plus date noise. T-VER1/T-VER2 archived again. Server stopped. Worktree clean.

## S3 fix (verifier round 2) — commit edc651d
- Pin gap (landings left room for the copy below the row, so the row never stuck and no allergy showed): the copy now
  stands ON TOP of the row (bottom:100%) and shows as soon as the head's safety line starts to go under the top bar
  (one IntersectionObserver, threshold 0.999, the line above the top bar). While pinned the row sticks at
  --rec-top + --rec-pin-h - 1px, so the copy meets the top bar. The stuck mark and its observer are gone. reveal() no longer adds
  the pin to "covered". Add ▾ scrolls the row to top+pin. Deviation from spec §2.3 ("second line of the row", below):
  the copy is the first line, as the phone's line already is. With it below the row, a floating (unstuck) row's copy
  would cover the tab's content.
- Birth date: saveBirth's version carries "birth_only": true. readHealth returns `asked` (newest without it);
  ASKED_SQL is used in cal/data.ts (Dashboard) and _list/list.ts (stale history). The record's staleHealth, the head chip,
  VisitStrip, the Health cards' "Updated", and recheckHealth ("No change") read asked.
- Checks: verifier's seen.mjs 16/16 no landing gaps, 0 scroll gaps; birthsem.mjs before = after (chip, strip, Dashboard,
  Health card unchanged; history lists the birth change); No change after a birth edit saves (not "today").
  s3fix2/geom.mjs 3616 cases 0 failing (landings #hash × 6 and tab clicks × 4 from 4 scroll positions, free scroll
  every 10px; allergy on screen, row not over the landed target, copy never over the row or under the top bar;
  1440/1366/1024/768 light+dark; Maria, Rich, Pin, Ask). offline-pin.mjs kept copy at 1440/1366/390 ok (1366 pinned).
  s3fix2/checks.sh: record-tabs pass; links 152+14 0 failing; focus ok; refused nothing written; focuswalk 2856/0;
  obscure 0; backs 192/0; landing 119/119 at 1440 and 390; slowall 110/110 both; row-contrast 500 lowest 4.64; covered
  281/0; owes ok; contrast 1164 lowest 4.97; birth ok; pin light+dark all ok (after the 1px fix); snap vs s2fix3 the same S3 head changes + date noise.
  Tools updated for the copy on top (pin.mjs, covered.mjs, focuswalk3.mjs, obscure3.mjs; *.pre-fix2.mjs kept).
- T-V3B archived, its visit cancelled. Server stopped. Worktree clean.

## S3 fix (verifier round 3) — commit b0f0df3
- Failure 1 (copy over the head's note and buttons): from 768px the copy is now the row's SECOND line, in the row's own
  box (padding-bottom = --rec-pin-h while data-pinned; the copy absolute at the padding box's foot, laid out hidden
  when unpinned so it is measured). Pinned once the head's safety line has left the screen (IO under the top bar,
  PIN_AT = 12px: no more than a sliver of its last pill row left). The row always sticks at --rec-top; the copy's room
  pushes the tab's content down (html overflow-anchor: none from 768px), so it covers nothing. land() works a landing
  out for the row as it will be after the scroll (pinned or not); show() uses it for #cards instead of scrollIntoView.
  A focused control below the row is kept on screen when the copy appears (focuswalk found 1 at 1366 Rich otherwise).
  Fold's 128px cap measures the row without the pin room. Add ▾ scrolls the row to the top bar only.
  This follows spec §2.3 literally ("second line of the row"); round 2's copy-on-top deviation is gone.
- Failure 2 (?saved=details/birth, ?stale=1 landing with the callout off screen or covered): the head's post callouts
  carry data-rec-said; on load (no ?open panel), when the hash is empty or names a tab, the page scrolls so they are
  on screen (page top when they fit). The details/birth redirects no longer add #overview.
- Checks (s3fix3/run2, final build): verifier's pinover6 0 covered head controls; note.mjs 0 positions at 1440/1366/1024/768
  for Rich and T-PIN; callout.mjs 24/24 ok (1440/1366/1024/390 × Maria/T-V6/T-PIN × saved=details/stale); clickchip:
  the stale-history chip at 1366 y=250 is hit and opens Patient info; realsave.mjs (real Edit details save) 8/8 callout on
  screen and hit. geom3.mjs 3616 cases 0 failing (landings + tab clicks + free scroll; allergy on screen, copy inside the
  row, copy over no head element, no landing gap). pin.mjs (updated, pin.pre-fix3.mjs kept) all ok light+dark: 1366 Rich
  row 58 + copy 66 = 124 ≤ 128, Maria 96, T-PIN 152 (5 allergies never cut). record-tabs pass; links 152+14 0 failing;
  focus ok; refused nothing written; focuswalk3 2856/0; obscure3 0; backs 192/0; landing 119/119 at 1440 and 390;
  slowall 110/110 both; row-contrast 500 lowest 4.64; covered 281/0; owes ok; contrast 1164 lowest 4.97; birth ok;
  offline-pin kept copy ok at 1440/1366/390; snap vs s2fix3 the same S3 head changes + date noise.
- Database restored from S0 dump + baseline fixture + s3/fixture-s3.sql (T-V6, the verifier's fixture, is gone with it).
  Server stopped. Worktree clean.

## S4 — Today — commit f546246 (on b0f0df3)
Files: [patient].astro, _record/{Today.astro (new), today.ts (new), VisitStrip.astro, RecallCard.astro, record.css},
scripts/dev/record-tabs-check.mjs. Tools and outputs: /tmp/fl-simple-scratch/s4/ (today-check.mjs, landing4.mjs, slowall4.mjs,
pin4.mjs, contrast4.mjs, checks.sh, run/).
- today.ts: thisVisitPlan() (This visit's lines, pure, used by the page for the Today count and by VisitStrip) and
  needsAttention(). Order: health history (No change · Something changed), privacy (Record it → #consent), BP (Take it;
  high: Take again · Ask for clearance → rec-letter-add with data-letter-kind=clearance, words include the advice), consent
  to treatment (Sign on this tablet; no button when not signable), then once seated Treatment done (Record it), Clinical
  note (Write it), next check-up (Set the next check-up → rec-recall-set), Charge this visit (finance.bill). Teal = first
  button of the first line that has one. Done: one ticked line, links only for Prescription · Print and Aftercare · Print.
  Also (Prescription, X-ray or photo) only once seated; Also: Chart, The plan, What to do, Consent (go) are gone.
  Header meta "9:30 am · Filling, tooth 36 · Chair 2 · Dr. Tabanao" (shortName) + status chip.
- Today.astro: grid, ≥1024 areas "visit coming / visit needs / last needs" (no visit: "last coming / last needs"); phone
  order This visit, Needs attention, Coming up, Last visit. Coming up (#visits): visits after now but this one, each day a
  button to rec-visit-<id>, dentist, "Confirmed", reminderWords() (reminder-state.ts; remindersFor loaded in the page);
  RecallCard body (#recall: In 6 months + Other… when none; set: date, chip, reason, texted, Change); "Still on the plan:".
  "The patient wrote: …" (form < 30 days: reason + bothering) in This visit, or atop Coming up without a visit.
  Needs attention: Not on file → Add them (details); earlier-day visit still arrived/waiting/in chair → text link to the
  Dashboard day (?date=&booking=); LOA waiting → Record the answer (go loas, carries data-loa/-payor for S6's rec-loa-answer);
  plan behind → Take a payment (finances/<invoice>/, finance.bill); stale health → Check it (go health; only when This
  visit is not asking); clearance with no reply → Physician replied (rec-letter-answer, data-letter). Last visit: newest
  completed (or "At the clinic" day) before today: date button → panel, reason · dentist, Done:, BP, Diagnosis.
- RecallCard: panel holds In 3 months / In 6 months / In a year (one tap), Or pick a day + For + teal Set the check-up,
  and with a check-up set: Came in, Clear. All panel forms carry data-rec-back. Refused Came in/Clear still land in the
  card on Today (INLINE_REFUSAL unchanged).
- Page: head's to-do chip row removed; Today = <Today>; Details (#details-card) moved to the top of Patient info with
  "Not on file: …" as one line (dashed + Add tiles gone); Recent visits, Health in short, Treatment in short, From the
  patient forms, the Visits table gone from Today; "Cancelled and missed (N)" fold (#visits-cancelled) added after the
  ledger so cancelled-empty visits keep an opener (S7 may restyle/move its landing). tabCounts.overview = This visit lines.
- record-tabs-check: an object property (a.go) is also followed into the record's own modules the file imports by name
  (today.ts). Mutations go:'loas'→'loasx' and go:'consent'→'consentz' in today.ts each fail it.
Checks (fixture + s3 fixture):
- today-check.mjs: owner Maria first load 16 controls (Edit details, New booking, 4 tabs, Add, No change, Something
  changed, Record it, Take it, Sign on this tablet, Add them, In 6 months, Other…, the Last visit date) at 1440 and 390,
  1 teal. First to-do line top 509 / its button bottom 560 at 1440×900; at 390×844 line top 747, button bottom 844 (dev
  banner on; production has none). Shell: 25 body controls at 1440 by my count (spec said 29; the official inventory is S8).
  6 patients × owner/dentist × light/dark × 1440/1366/390: 1296 Today texts, lowest 4.95; teal ≤ 1; no target < 44; no
  sideways scroll. ?visit=<today> → Today, This visit, no panel, 7 panel forms carry the visit; ?visit=28 Sep → Treatment
  record with its panel.
- test:record-tabs: 917 names, 190,960 combinations, passes. links --slice=4: 152 links + 5 presses (was 14: the removed
  go buttons), 0 failing; vs s3fix3 loose: only the strip meta. focus all ok. refused-posts nothing written. backs 192/0.
  landing4 119/119 at 1440 and 390; slowall4 110/110 at both (recall Came in / In 3 months / Clear now via the panel).
  focuswalk3 2586 stops 0 hidden; obscure3 0; covered 286/0; owes ok; birth ok; geom3 3616/0; realsave 0 failing;
  row-contrast 512 lowest 4.64. offline-pin: first run threw (null bar after an offline reload), re-run ok ×3 widths.
- pin.mjs / contrast.mjs (S3 tools) open on Today and scroll 300/700px: Today is now too short to scroll the head away on
  most patients, so their "row stuck" premise fails (not a regression: nothing to pin when the head is on screen). Run on
  Chart & plan instead: pin4 TAB_=chart all ok light and dark; contrast4 HASH_=#chart 1152 texts lowest 4.97, 0 failing.
- snap-record vs s3fix3: intents, actions, panels, opens unchanged; buttons/headings as listed in s4/run/snap-cmp-s3.txt.
  Panels with no opener: Maria/Ledger rec-loa-approve, rec-loa-deny, rec-adjust-add, rec-letter-answer (= S0's list).
Database restored from the S0 dump + baseline fixture + s3/fixture-s3.sql. Server stopped. Worktree clean.
Open: Something changed / Ask now / Check it go to Patient info until S5's rec-health; Record the answer goes to the LOA
row until S6's rec-loa-answer (swap `go` for `open` in today.ts); "Forms sent, not added" and the intake's consent gaps
are phase 4; today's not-yet-begun visit has no panel opener (the spec lists none); S5 should restyle the moved Details
card as a definition list.
