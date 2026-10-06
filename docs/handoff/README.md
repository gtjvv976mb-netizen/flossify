# Handoff: the simpler patient record (6 Oct 2026)

The work stopped here. The next session (on another account, with no access to earlier session scratchpads)
should pick it up from this file.

## What the owner asked for

"SIMPLIFY THE PATIENT RECORD" and "THERE'S TOO MANY TABS AND BUTTONS". Later they added: "it's okay to build it slow, just make sure
it's being checked and fixed thoroughly."

The design is settled. Do not re-open it:

- The full design is in `notes/simplify-spec.md`.
- §8 is the slice list, with the checks for each slice.
- §9's questions take their defaults: yes; "In 6 months"; keep Treatments done folded.

The record shrinks to four tabs: **Today · Patient info · Chart & plan · Treatment record**. It also gets one **Add ▾** menu and a
safety line that stays pinned at the top.

## Where it stands

All of it is on the branch `claude/funny-ritchie-ujucx6`, a draft PR. Locally it was the branch `round/simple`.

| Slice | What | State |
|---|---|---|
| S0–S1 | Baselines; `TAB_OF` and `npm run test:record-tabs` | built, verified, 3 fix rounds (b593a0e … c4463a2) |
| S2 | The frame: four tab panels, sticky RecordNav, Add ▾ | built, verified, 3 fix rounds (50eab20 … a5a6739) |
| S3 | The head: facts line, desk note, pinned safety line | built, verified, 3 fix rounds (9e84ba8 … b0f0df3) |
| **S4** | **Today: This visit, Coming up, Needs attention, Last visit** | **built (f546246), NOT verified yet** |
| S5 | Patient info + the rec-health side panel | to build |
| S6 | Chart & plan | to build |
| S7 | Treatment record tab (folds, notes, Rx/letters, statements, texts) | to build |
| S8 | Measure everything, then rewrite CLAUDE.md's record sections | to build |
| Final | Three-lens review (routes, safety, design), then fixes | to do |

The merge commit 741d2d5 brought `main` in, with intake phases 3–4 (PR #38/#39). Only two files conflicted, and both are
resolved:

- `[patient].astro`: main's old Consent block is dropped, because Consent now lives in Patient info.
- `ConsentForms.astro`: it gains `canPrepare` and `offered` for Sign again.

After the merge, the build passes, `test:record-tabs` passes (917 names), `test:consent` is 24/24, and a smoke test of the
four tabs shows 0 page errors. **Not checked yet:** phase 4's consent cards in the visit panel, the consent rows in the
Treatment record, and the Sign again buttons, all inside the new tab layout. Verify S4 and the final review must cover them.

`simple-scratch/progress.md` is the running log of every slice: commit, measured checks, and what each left open. Read
the S4 section before verifying. Its "Open" list says what S5 and S6 must pick up: rec-health, rec-loa-answer, and the
Details card as a definition list.

## Rebuild the sandbox (the scripts expect these exact paths)

```bash
cd /home/user/flossify && git fetch origin claude/funny-ritchie-ujucx6
git worktree add /home/user/fl-simple -B round/simple origin/claude/funny-ritchie-ujucx6
cp -r /home/user/fl-simple/docs/handoff/simple-scratch /tmp/fl-simple-scratch   # tools/, baseline/, slices/, progress.md
cd /home/user/fl-simple && npm install
service postgresql start
DB=flossify_dev scripts/db/setup.sh            # dev database (seed); never on a real server
createdb -U root -h /var/run/postgresql -T flossify_dev flossify_simple
psql -U root -h /var/run/postgresql -d flossify_simple -f /tmp/fl-simple-scratch/baseline/fixture.sql
psql -U root -h /var/run/postgresql -d flossify_simple -f /tmp/fl-simple-scratch/slices/s3/fixture-s3.sql
# .env in /home/user/fl-simple: copy .env.example, set DATABASE_URL to flossify_simple, SHOW_DEMO_LOGINS=1
npm run build && npm run test:record-tabs
```

If `scripts/dev/resume.sh` exists, it does the database part for a throwaway database (see `docs/HANDOFF.md`).

- Serve on port 4470. The exact commands are in `notes/simplify-rules.md`.
- Sign in at `/auth/login/?any=1`:
  - `liwayway.domingo@example.com`, the owner;
  - `hazel.tabanao@example.com`, a dentist with no billing.
  - Both use the dev password `flossify`.
- Test patients: Maria Liza Dela Cruz (SR-0142) and Ledger Test (T-LEDG).

## How to continue

1. Read `notes/simplify-rules.md`. That file says "this folder" in a few places; it means `docs/handoff/notes/`. Then read
   `notes/simplify-spec.md`.
2. Ask the owner to say yes to a multi-agent workflow, because the build ran as one. Then run
   `workflows/resume-simpler-record.js`. It starts at **verify S4**, skipping S4's build, and goes on with up to 3
   verify/fix rounds per slice, S5–S8, the three-lens final review, and the fixes. Without a workflow, do the same by
   hand: build a slice, have an independent check try to break it, fix it, and repeat up to 3 rounds.
3. S8 rewrites CLAUDE.md's record sections. Then push to `claude/funny-ritchie-ujucx6`, update the draft PR,
   mark it ready, and merge only when CI is green and the owner says so.

`workflows/build-simpler-record.js` is the original full script. `workflows/simplify-patient-record-design.js` made
the design.

## Other things from that session

- **Ads** (`ads/`): two vertical 9:16 ads for clinic owners, made with Higgsfield.
  - Ad 1 is 20 s, with music and on-screen text.
  - Ad 2 is 34 s, with a voiceover and real product screens.
  - The edit scripts are beside them.
  - Nothing has been posted anywhere.
- `notes/` holds the earlier rounds' specs and check scripts: the intake spec, the six scheduling features, the Treatment
  record, and the paperless day. They are for reference only; all of that work is merged.
- The demo visits seeded locally on 6 Oct exist only in that session's database.
- The owner's open questions are unchanged (see CLAUDE.md "Open — read before shipping"):
  - p07 §7.1 (reminders in closed time);
  - the chart-effect mapping for a dentist to read;
  - turnover minutes;
  - lawyer and dentist review of the consent forms and the privacy notice.
