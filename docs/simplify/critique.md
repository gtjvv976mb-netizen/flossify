1. **[d] Three items contradict each other on the condition list.**
   - 2.9 folds conditions and medicines on Type it in into one "None · Add…" line.
   - 2.13 says the typing form uses the paper's health fields (23 conditions, 12 problems, physician, transfusion, pregnancy) and that "condition lists stay visible".
   - §7 says hiding the condition list is "not doing".

   Pick one rule for each surface and state it. For example: the desk's typed form follows 2.9 but stores the answers in paper-history's shape, and the patient forms keep the visible list. As written, 2.13 undoes 2.9 and 1.25.

2. **[c] 2.13 collects more at the desk than the privacy notice names.** Putting the paper fields on Add patient widens collection of categories privacy-2026-09 does not name. CLAUDE.md "Open" lists these for the lawyer: the desk's health history, pregnancy, nursing, the pill, transfusions, and the physician's and former dentist's names and numbers. The plan holds paper-only questions back on the patient forms but not at the desk. Either hold them back at the desk too, or say it extends an existing gap and add it to the lawyer's list.

3. **[d] 2.7 leaves the permission rule undecided.**
   - The dashboard audit says Settings' Add link is for schedule.edit only, others get one sentence, and the API gate is not widened.
   - The settings audit says the API allows schedule.edit OR settings.edit.

   The default roles hold both keys, so only custom roles differ, but the plan must pick one. Also decide what happens with scripts off: today's Settings closed-add form works without scripts, the Block panel does not. Do not delete closed-add or readWholeDays until the lifted panel works from Settings and from the person page.

4. **[d] 1.22 and 2.4 clash on phones.** 1.22 makes the Waiting and In the chair tiles scroll to and filter Today's patients. 2.4 stops drawing Today's patients under 768 px. Say what the tiles do on a phone (for example, filter the calendar's list cards) and cover both in dash-check.

5. **[d] The plan's own names disagree.**
   - 1.6 links "New patient forms", but 1.7 renames that list "Forms to add".
   - 1.8's inbox row needs 1.7's name.
   - 2.28 may rename Messages to "Texts", while 1.8 (the foot link) and 1.13 (the place-names module) hard-code "Messages".

   Write the 2.28 glossary as a document at the start of phase 1 and use it in every phase-1 item. Otherwise the wording in 1.2, 1.7, 1.8, 1.13, 1.26 and 1.31 is changed twice.

6. **[d/g] The owner-facing text breaks its own principle 4.**
   - The treatment consent has three names: "consent to treatment" (1.2, Q2), "general consent" (1.2, 2.12) and "the treatment consent" (2.28).
   - The intake has three: "phone forms" (1.7), "step-by-step forms" (Q1) and "patient forms".
   - "Strip" means two things: the booking's held-time strip (1.17, 2.1) and the record's This visit strip (1.2, 2.8).

7. **[e] 2.26 depends on 2.34, which comes later.** 2.26 uses the shared door sign-in from 2.34. Move 2.34 first.

8. **[e] 2.1 should follow or ship with 2.2.** 2.1's "Change opens the time in place" would be built on the 65-chip grid, then rebuilt by 2.2. 1.17's head merge is also redone by 2.1, so build 1.17 with 2.1 or accept the rework.

9. **[e] 1.43 re-records the walkthroughs too early.**
   - The patient video changes with 1.10, 1.17, 1.24, 2.1 and 2.2.
   - The clinic video changes with 1.21, 2.19 and 2.20 (/start/ → settings?welcome) and 2.4 and 2.5 (it ends on the Dashboard).
   - The bar changes with 3.3.
   - Q14 may replace the videos with stills, and Q13 may change the clinic video's first caption.

   Ask Q13 and Q14 first and record once after phase 2's booking and Dashboard work. Or label 1.43 "record now and again later".

10. **[e] The setup checklist is rewritten three times.** 1.19 splits it inside ProfileSection, 2.19 replaces it with a card above the section list, and 2.20 splits the form around it. Keep only 1.19's server-enabled listing switch in phase 1 and move its checklist split into 2.19. Also, 1.21 opens ?welcome=1 straight on the section, while 2.19 wants the welcome card at the top of the list on a phone. Define the welcome landing once.

11. **[e] 3.4 is in the wrong phase.** It says steps 1–2 (a linked draft claim on save; Mark paid records the payment) "can start without waiting", yet it sits in "needs your yes". Move steps 1–2 to Phase 2 Money. Keep only step 3 (the shortfall) behind Q3.

12. **[b/e] Add a phase-1 safety fix that is hidden inside 3.8.**
   - `voidStatement` (src/lib/invoices.ts:632) checks only for live payments.
   - Voiding a statement that a payment plan is built on (`payment_plan.invoice_id`) leaves an "active" plan.
   - `planState` then counts missed instalments against a void statement, and 2.16 would show "₱3,000 due now" on it.

   Add the guard now, regardless of Q15. Add the filed-claim guard once 3.4 links claims.

13. **[c/f] Raise the unreviewed tablet consent now, not only in 3.5.**
   - The tablet signing (patients/<id>/sign/<visit>/, 035) offers treatment-2026-09 on the live site with no review gate. I confirmed there is no CONSENT_REVIEWED check on that path.
   - `CONSENT_REVIEWED` is empty, and §3 and 1.6 tell the owner that production offers no unreviewed consent.
   - This is the most legally relevant finding. Put it in the FYI list and the review pack in phase 1.

14. **[b] 1.2 needs the right test case.**
   - `visit_treatment_consented()` (039:1247) counts a 039 form only when `consent_document.appointment_id` is that visit.
   - A general consent signed on the phone for a new patient (no visit, like P-0001) counts for no visit under either rule. That patient is still asked at their next visit after 1.2. That is Q2's territory, not a bug.
   - Define the "phone" test visit as a form prepared from that visit and agreed on the phone. Add a fourth case: a paper signing for the visit.

15. **[b] 1.11's target cannot be met by what it proposes.**
   - Call sits in `.pt-actions` at the bottom of each card, after the about line, the facts and the slots (find/index.astro:196–200).
   - Moving it "first" in that row moves it sideways, not up.
   - In urgent mode, put Call in the card head, or put the first open clinic's Call inside the urgent callout. Otherwise change the target.

16. **[b] 2.8 and the summary claim are only measured with no safety lines.**
   - The summary says "Dentists get the chart back on the first screen".
   - Maria, the measured patient, is in the chair with BP not taken, consent not signed and privacy missing. Under 2.8 she keeps 3–4 unfolded lines.
   - "Chart starts inside 900 px" can mean only its heading is in view.
   - Set the target on Maria's real record (for example, the upper arch's teeth inside 900 px at 1440) and also report 1366×768.

17. **[b] The §1 summary overstates 2.4.** "Today's list is drawn once" is true only on phones. On desk the day stays in Next for you, the grid and Today's patients, on purpose. Reword it to "drawn once on a phone; shorter rows on desk".

18. **[b] §7's film claim has no measurement behind it.** It says "On mobile data, Android Chrome already holds back the download (about 1 MB)". The audit's only measurement is a full 3.97 MB fetch of tour-960.mp4 with preload=auto, and no device test is cited. Either measure on a real Android phone on cellular, or reword as "not measured; deferred because…".

19. **[b] Many items have no measure, against principle 7.** Principle 7 says every item has a before number and a target. Missing in: 1.21, 1.23, 1.27, 1.28, 1.32, 1.35, 1.37–1.40, 1.42, 1.44, 1.45, 2.3, 2.7, 2.12 (has 7 clicks / 5 screens but no target), 2.13, 2.14, 2.17, 2.18, 2.20, 2.21, 2.23 (70 fields per save → about 7), 2.24, 2.25, 2.27, 2.28 (visit 44 / booking 31 / appointment 9 → ?), 2.30 and 2.32. Add the audit's number where one exists.

20. **[b] Say whether targets include the dev-only banner.** The patient-side and Dashboard fold targets were measured with the development-only Prototype banner (100–130 px): 1.11, 1.17's "about 950", 2.1, 2.4's "above the 844 fold" and 2.5's "about 840". Otherwise pass and fail flip on deploy.

21. **[b] Remove a wrong premise from 2.28.** "SOA- and A- stay two separate numbered series" is wrong. A- is the seed's statement prefix (scripts/db/seed.ts:180 inserts series_prefix 'A'). The app issues only SOA (`SERIES='SOA'`, invoices.ts:23). No acknowledgment series appears in the Finances list. Drop the line; the mixed list is a seed artifact.

22. **[b] §6's list of leftover test rows is incomplete.** A read-only check now shows:
   - **flossify_t:**
     - session-road patients P-0001 Plan Walkthrough, P-0002 Records Tx-Audit and W-0005 Plan Walk
     - statements SOA-000001 (Joel, paid) and SOA-000002 (Plan Walkthrough, partly paid)
     - clinic "Plan Check Dental 9627092"
     - 8 session-road intakes: 1 added, 4 out, 3 preparing
   - **flossify_teeth:**
     - W-0001 Plan Tester at burnham-smile (BU-RYFR)
     - W-0004 Plan Audit 1440 and W-0005 Plan Audit 390 at session-road, both booked
     - clinics Plan Test Dental 32140, Plan Onboard Check 4707732, Verify Listing Dental 755131 and Welcome Measure 4869638
     - 5 intakes in preparing

   Session-road on flossify_t now carries SR-, P- and W- chart numbers side by side. Cite that in 2.14 as its evidence.

23. **[a] No item covers the chart palette or the repeated tooth picker.**
   - The palette is an 801 px popover with 27 buttons, and its tooth actions are at the bottom.
   - The 32-tile picker is repeated in four panels, which are 1187–1384 px tall (up to 1731 at 390).
   - The records audit deferred the picker "as a separate item", but the plan has none. Add one (for example, open a panel with "Tooth 26 MO · Change" instead of the full picker), or list it in §7 with the reason.

24. **[a] No item covers the patient's own form pages.**
   - /f/i/ "Your health" is 3801 px with 70 controls at 390, and the general consent page is 3148 px: 13 taps and 28 fields over 8 screens.
   - /f/<key>/ has 136 inputs and is 11,977 px without script.
   - 2.13 only remaps the answers, and 3.1 waits on Q1. If Q1 is no, the poster page is never touched. Add an item or a §7 reason.

25. **[a] The visit panel itself gets no item.** After 1.5 it is the only panel for a visit, but its layout is untouched: the actions row wraps at 1440 so More drops to a second line, and its content is 942 px in an 874 px viewport. Add it to 2.8 or as a small item, and note that 1.5 sends it the patient panel's traffic.

26. **[a] Several screens are never mentioned.** patients/import, the consent form page /consents/<doc>/ (1800 px, 11 headings), /admin/clinics and its detail panel (31 controls, 428 words), /admin/system, /f/t/ (the clinic tablet), Messages → Text a patient, and Calls. Add one line in §3 or §7 saying each was looked at and left as is, or was not audited.

27. **[c] Visible changes with no question or FYI.**
   - 2.31 retires the visit panel's section colours and says "we'll show you first", but there is no question for it.
   - 2.14 ends the documented "W-" prefix that marks patients who booked online.
   - 2.28 may rename the Messages page.
   - 1.31 removes "In the lobby".
   - 2.7 takes Block time out of + New.
   - 1.4 rewrites live rows. It flips the public pages of any dentist marked checked without a number back to "PRC check pending". Run a read-only count on production first and tell the owner which clinics change.

28. **[c] 1.18 promises something nothing delivers.** "We'll ask you to confirm two days before" is not done by any channel:
   - Texts never ask for a reply.
   - The 48-hour reminder can be switched off per clinic (remind_48h).
   - The Calls list only helps if the desk actually phones.

   Reword, for example: "From two days before you can confirm here; the clinic may also call."

29. **[c/g] 2.20 hides the TIN where nobody will look.** It puts the TIN and BIR branch code under "How the day runs → More". The TIN is the BIR number printed on statements; an owner won't look for it there. Use the settings audit's alternatives instead: a "Your clinic's details (not shown on your page)" block, or a place beside Services & prices. Keep the BIR sentence word for word.

30. **[f] Q1 is missing its trade-off.** If a poster patient's record is made at Send, anyone who scans the desk poster creates a patient record with no desk check; the 500-per-poster "full" cap exists because of floods. Waiting keeps the desk in control. Also use the owner's own name for the forms ("Add patient, step by step").

31. **[f] Q3 should split PhilHealth from HMOs.** PhilHealth's own rules may forbid billing the patient for the shortfall, so that half belongs with the lawyer or accountant, not a free choice.

32. **[f] Q2 should say what "once per record" gives up.** Today's per-visit tablet signing records which plan lines the dentist explained at that visit (consentFor, and the Edit form's sign-again prompt). Name the lawyer as the one who decides.

33. **[f] Q10 hides who does the work.** "Yes" commits Flossify's own team to entering each year's dates from the proclamation, and Eid is announced late. A wrong date closes online booking on a working day. Say both.

34. **[f] Q23–Q25 cannot be answered as worded.**
   - Q24: "Today one database setting can stop a staff member editing patient records at one branch. No screen sets it and nobody uses it. Add a switch for it on the person's page, or remove it?"
   - Q25: "You own two branches. Should Close the day show both branches' drawer counts together, or do you switch branch to see each?"
   - Q23: add an example, such as a secretary who sees claim amounts only at Session Road.

35. **[f] Bundle and route the questions.**
   - Q12 matters only if Q4 is no.
   - Q5 and Q6 are one question.
   - Q13 and Q14 decide 1.43.
   - Q19 names the sheet in 1.30.
   - Q7 decides 3.6.
   - Q22 follows 1.8.

   Mark which need the lawyer (Q2, Q3's PhilHealth half, Q9) and the accountant (Q17). Put the questions that block phase-2 work first.

36. **[g] Take the "Auditors disagree…" paragraphs out of the owner text.** They appear in 1.2, 1.8, 1.24, 1.30, 1.45, 2.4 and 2.20, plus the recounts in 1.16 and 2.26. State the choice and move the alternative under "For the developer"; a dentist-owner should not arbitrate between auditors.

37. **[g] Owner-facing lines use builders' words.** Examples: "quiet" button, "fold", "first screen", "glass", "held time", "look-alike check", "seal", "tone", "safety lines", "presence flags" (2.20), "pill classes" and "rules that undo tiles" (2.30–2.31). Define "quiet button" and "fold" once in §2. Rewrite 2.30 and 2.31 for the owner as "no visible change; less to maintain".

38. **[e/g] Phase 1 is not "low risk, done in days".** It has 45 items, including a migration that rewrites live rows (1.4), one status source shared across Finances, the record and panels (1.26), about 20 page headers (1.45) and new SMS wording (1.13).
   - Split it. **1a** holds the safety fixes: 1.1, 1.3, 1.4, the voidStatement guard, 1.2, 1.14, and raising the tablet consent gate. **1b** holds the rest.
   - Sequence by file to avoid conflicting edits:
     - book.astro: 1.9, 1.10, 1.17, 1.27(e), 2.1–2.3
     - ProfileSection: 1.19, 1.36, 1.37, 2.19–2.21
     - new/type.astro: 1.6, 1.25, 2.9, 2.13

39. **[e] Do 2.29 (the shorter CLAUDE.md) early.** Every later session pays for the 1,886-line file (about 40k tokens). Do it right after the owner reads the constraints and the Retired list. Otherwise every phase-1 and phase-2 item adds more to split later.

40. **[d] 1.15 edits sections that 3.2 may delete.** 1.15 rewords and removes links in Services, How it works and Pricing, which 3.2 folds away if Q4 is yes. Hold 1.15's section-header link removals until Q4 is answered, or accept the rework.