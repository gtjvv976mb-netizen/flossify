# Flossify operations brief: how a paperless Philippine dental clinic runs

*For the product team. Written from the seven research lenses (front desk, clinical visit, records, compliance and operations, the patient, software patterns, the owner). Where Flossify already has the piece, it is named; where it does not, the gap is stated once. Facts marked "verify" could not be confirmed against the regulator's own text.*

## 1. The patient's journey, step by step

**First contact is a message, not a call.** A Filipino patient with a toothache opens Facebook, finds the clinic page and types. Messenger reaches 61.8M Filipinos (90.6% of internet users); Viber has 71% penetration; 73% still say they prefer SMS to IM, and SMS is what reaches feature phones. The three opening questions are always the same, in English, Tagalog or Taglish: "Magkano po ang cleaning?", "Open po ba kayo Saturday?", "HMO accepted?". Messages arrive at night and on Sundays, and the clinic that answers first gets the booking; the one that replies next morning "gets a read receipt". So the public clinic page must answer price range, hours and HMO acceptance before it asks for a time, and the clinic profile needs a Messenger and Viber handle shown as "Message us" (a page name is not a link, so it may also ride in a text).

**Booking.** Offer two concrete slots that fill the clinic's holes ("Tuesday at 11 or Thursday at 2?"), never "call when convenient". Chair times from the research sit inside Flossify's directory minutes (consult 30, cleaning 45, filling 45, RCT 90, extraction 30, wisdom 60, braces 60); what is missing is per-visit minutes for later visits of a course (crown seat 30, RCT visit 2 45–60, orthodontic adjustment 15–30, denture try-in 30) and an 8–12 minute turnover buffer after each visit. Ask three things at booking that today go unasked: "Is there anything that makes dental visits hard for you?" (72.6% of adults fear the dentist; 71% would take help if offered), "Anything we should prepare for you?" (ramp, companion, sign language), and HMO name plus member number so the LOA can be chased the day before. Book households on one mobile: a mother books three children and her parents from one number, and today one mobile means one patient. Add "Book for my family": several names and birth dates, consecutive slots on one chair, one text per mobile naming each child's time.

**Confirmation and reminders.** The cadence that works is confirmation at booking, a firm ask 2–3 days before (so a broken slot can be resold), and a final alert 24 hours before, with a same-day nudge for confirmed patients. SMS reminders cut no-shows 38–40%; two reminders beat one. Flossify sends one reminder the day before. Add the 48-hour text ("Call <number> if you cannot come, so someone else can") and a booking text that names the day, the dentist, "arrive 10–15 minutes early", what to bring (HMO card and ID, OSCA/PWD ID, medicines list) and the clinic's landmark line. Because Semaphore sends one-way from a sender name and telcos drop links, "reply C to confirm" cannot exist; confirm, move and cancel live on /me/ (which today has confirm and cancel only) and on Messenger. Every text names the clinic's phone number.

**Arrival.** Check-in should take under two minutes for a prepared patient; paper intake adds 15–20 minutes, which is why the QR forms exist. Stamp arrival and seating (Flossify already has `arrived_at`, `seated_at`, `in_lobby`), show minutes waiting on the queue, turn the row amber past a clinic-set threshold, and refresh every 60 seconds. Targets: lobby wait under 10 minutes for existing patients (alert at 20), under 5 for new (alert at 15). Satisfaction in a 399-patient dental study fell from 4.80/5 when on time to 4.21 when late. At 10 minutes the desk says the honest line ("we're running about 10 minutes behind, we expect to seat you around 2:40"); never "the doctor will be right with you". A lobby screen shows initials and position, never names.

**HMO at the desk.** Card plus one government ID; eligibility checked in the HMO portal; LOA/eLOA requested, 5–15 minutes when the portal is up, 1–5 business days for procedures over roughly ₱5,000. "No LOA, no coverage — billed as a walk-in." An LOA is per procedure, valid three calendar days. Typical cover: consultation, prophylaxis 1–2× a year, simple extractions, temporary fillings, basic gum treatment; not orthodontics, whitening, crowns, dentures, implants, most root canals or surgical extractions; heavy calculus gets reclassified from covered prophylaxis to uncovered "deep scaling" and the argument happens at checkout. Flossify's `hmo_loa` (asked → approved with code → used) matches the real states; add expiry, a "charge slip signed" flag, the payor's yearly limits ("already used this year"), and an HMO pre-visit checklist on the day queue (card seen · eligibility checked · LOA approved · patient told their share).

**Seniors and PWD.** RA 9994 and RA 10754: 20% off and 12% VAT exemption on professional fees, procedures, dentures. VAT-registered clinic: price ÷ 1.12 then × 0.80 (₱1,120 → ₱800); non-VAT (most clinics under ₱3M) simply 20% off. One statutory discount per transaction, never stacked on a promo, SC/PWD ID alone suffices; the invoice shows gross, discount, ID number and signature (RR 7-2010); the clinic keeps a separate SC/PWD register for the BIR deduction. Refusal: ₱50,000–₱100,000 and 2–6 years. Statutory discounts apply before PhilHealth is deducted. Statements need a discount basis (none/senior/PWD) computed from the birth date and an "ID on file" tick, its own printed line, and a monthly register export.

**The estimate before the chair.** 75%+ of patients want every cost before treatment; 53% of those who hesitate cite cost; "hidden charges" is the most common Philippine review complaint; PDA Code Art. I s.5 requires fees discussed beforehand, and a clinic may not hold a patient over an unpaid bill (RA 9439). Case acceptance runs 42% average, 75% at top practices; offering three payment choices roughly doubles acceptance. So every plan produces a written, itemised estimate: per line what, which tooth, fee-guide price, HMO estimate (LOA-dependent, say so), PhilHealth amount where it applies, senior/PWD line, the patient's share, phase (urgent · disease control · restorative · maintenance), and three ways to pay (in full · per visit · down payment plus monthly). Freeze it as a snapshot, sign it on the same tablet stroke pad as the visit consent, print A4, show it in My visits. Braces in the Philippines are ₱5,000–20,000 down then ₱300–3,500 per 4–6-week adjustment for 18–36 months; the payment plan's schedule and paid-to-date belong on /me/ and the receipt.

**Consent and treatment** are section 3.

**Checkout.** Exit compliance, not a checklist: show only what is missing when a visit goes to completed. Pay today (statement total; cash, GCash, Maya, card, transfer with reference number; acknowledgment printed; BIR invoice number recorded). Next check-up booked (target 85–95% pre-appointed; a recall-by-call system alone brings back ~25%): the clinician says it as a statement in the chair, the desk offers two slots before the patient stands. Aftercare printed with the receipt and texted the same day. A no-next-appointment amber mark that the huddle lists next morning.

**After the visit.** A check-in text 4–6 hours after an extraction, surgery or RCT with the two red-flag lines and the clinic's number ("Bleeding that soaks gauze after 30 min, swelling that grows on day 2–3, fever: call 09xx"), then desk calls on day 1 and day 3 logged on the Timeline. Compliance with post-op instructions rose from 7.64/10 to 9.14/10 with two calls; the salt-water rinse is followed by 9.4% without follow-up. Aftercare sheets per procedure (extraction, surgical extraction, RCT, temporary crown, filling, scaling, orthodontic adjustment, denture delivery) in English and Tagalog, reviewed by a dentist before shipping. Review request by Messenger or a QR on the receipt; answer every negative review within 48 hours without discussing health. Recall text when due, Tue/Wed 9–11 am, no link: "Hi Ana, your check-up and cleaning at <clinic> is due this month. Call <number> to book."

## 2. The front desk's day

**Opening (5–10 minutes before the huddle).** Voicemail, Messenger and Viber inboxes, the openings report. Print today's day sheet: one A4 that survives a brownout (3.9M customers hit by rotational cuts in May 2026; Cebu reports daily cuts).

**Morning huddle, 10–15 minutes, ending 5 minutes before the first patient.** In a two-person clinic it is five minutes over the day sheet. By role: schedule (production vs goal, gaps, next open production block, emergencies and where they go, new patients and referral source), finance (yesterday's arrangements, today's balances), clinical (lab cases in, medical alerts and pre-medication, unsigned notes, one patient for same-day treatment), and unscheduled treatment among today's patients and family members due. Practices that huddle report ~30% higher production; one case found +18% doctor and +37% hygiene production in a month. Every input already lives in Flossify (queue, Unplaced lane, lab_order, vital_sign, allergies, forms waiting, tasks, plan items, balances); the huddle card is the missing summary on the Dashboard, amounts only for `finance.view`, printable.

**First task after the huddle: fill today's openings**, from an ASAP list. Any booked, planned, unscheduled or recall visit can be flagged "earlier if possible"; a cancellation offers the slot to everyone whose length fits, staggered, capped at two texts a day per patient, with a hold painted on the slot. Worked lists refill 65–90% of same-day cancellations against 25–30% by phone. Flossify has no waitlist; a cancelled visit simply frees the slot. One named person owns the list.

**Confirmation as a 10-minute routine.** A "still to confirm" list for the next two business days, families grouped, a Call button, an attempt log (Call 1 / Call 2 / Left message). Confirmation status is separate from where the patient is: Flossify's `NEXT_STATUS` (booked → confirmed → arrived → in_lobby → in_chair → completed) mixes the desk's contact state with the patient's physical state, has no "left message" or "asked twice", and a reschedule does not reset "confirmed". Release rule, stated at booking: unconfirmed 24 hours before is offered to the list and to walk-ins as "open now".

**Late arrivals and no-shows.** Grace 10–15 minutes (Dentacare PH: more than 15 minutes late "may need to reschedule"); at appointment time + 5–10 minutes the desk calls. Notice 24 hours for ordinary visits, 48 for crowns and root canals. Tiered consequence: first miss noted, second miss same-day-only status, chronic offenders booked outside prime blocks; cash fees are rarely collected here, so the levers are a GCash reservation fee for long procedures, same-day-only status and rescheduling 4–6 weeks out. Filipino no-shows are mostly forgetting and second "hiya": patients who know they cannot come avoid calling, so cancelling must be a one-message act. Every no-show and cancellation lands on an Unscheduled list until rebooked; Flossify keeps no per-patient count, no policy text, no flag. Benchmarks: no-show under 5% (top clinics under 1%); pre-booked recalls no-show 8–12% against 22–30% for call-to-schedule.

**Walk-ins and emergencies.** Walk-ins are the norm ("Walk-ins are welcome, but we highly recommend booking"). Register the walk-in in the Unplaced lane, quote the next free time, text it so they can leave and come back. One protected 30-minute emergency slot per dentist per session; extra emergencies go into no-show holes; if the day is full, the patient waits for a no-show and is seen at the end of the session — never turned away. Same day: pain, swelling, fever, bleeding, trauma, any complaint after recent treatment here. Not same day: lost filling or broken tooth without pain. Triage in under three minutes: which tooth, fractured, when, 0–10, triggered by hot/cold/biting, swelling extent, bleeding, fever, medicines, premedication, history in that area. PDA Code s.2: an emergency dentist treats only the emergency and returns the patient to their dentist of record with a note.

**Mid-morning.** Tomorrow's prep list: balance, planned procedure and estimate, HMO status and whether the LOA is in hand, lab case received, PhilHealth eligibility; call today what will otherwise be a 15-minute scramble at check-in.

**Money at the desk.** Present fee, payor share and patient share before treatment; collect at the desk, never "we'll bill you"; dentures and crowns 50% before the first visit, balance at delivery; no emergency patient refused for inability to pay, elective work waits. Since 27 April 2024 (EOPT, RR 7-2024) a service provider issues an INVOICE, not an Official Receipt; an invoice for every sale of ₱500 or more (VAT-registered: always); VAT is due on invoicing, not collection. Flossify statements are acknowledgments; the close should show statements without a BIR invoice number.

**End-of-day close, five minutes.** Received = recorded = deposited = cleared. Payments by method (cash, GCash, Maya, card, transfer, cheque, HMO charge slip) against the count, a variance note signed by the closer, visits still "arrived/in chair", procedures done with no statement, notes unsigned, claims not generated, LOAs used, patients who left owing, tomorrow's count and confirmations. Adjustments and write-offs listed for the owner: that is where embezzlement hides.

**Weekly and monthly.** Claims over 30 days, overdue accounts, recall list, unscheduled treatment, orders, spore test, waterline shock. Month-end: HMO and PhilHealth remittances reconciled gross with withholding as its own line (a ₱300 HMO consultation arrives as ₱270 after 10% withholding, sometimes 18 months later; without the BIR 2307 the ₱30 is tax paid twice).

## 3. The dentist's visit

**Before seating.** A per-visit checklist generated from the record: health history older than 12 months, BP not taken, consent not signed, radiographs due, lab case not back, LOA waiting, pre-medication due (amoxicillin 2 g 30–60 minutes before for prosthetic valves or previous endocarditis; none for joints; clindamycin no longer recommended). The assistant rooms the patient from a named tray ("Composite tray"); the Philippine assistant is not a hygienist (PDA Code s.3 forbids delegating anything in the mouth except to a licensed dentist, hygienist or technologist), so their job is room, tray, scribe, sterilisation, reception.

**History and vitals at every visit.** Active patients refresh the history at every appointment; a full new form every two years. "Asked: no changes since <date>" in one tap writes a `medical_history` version with who asked and when; "something changed" opens the panel. BP at every visit, before anaesthesia; Flossify's `bpWords` bands (180/110 postpone and refer; 160/100 clearance; 140/90 take again; under 90/60 low) match the guidance. Over 160/100: epinephrine capped at 0.04 mg (about two cartridges of 1:100,000), no epinephrine cord. Written medical clearance for hypertensive, diabetic and cardiac patients before extractions is routine here and must be filed with the record ten years (PDA Code s.11). Pregnancy: safe in every trimester; radiographs and lidocaine safe; no nitrous; semi-reclined with left tilt from the third trimester; show it as a head chip.

**Examination order.** Soft tissue and cancer screen (lips, mucosa, tongue, floor, palate, oropharynx; lesion by site, size, colour, borders, duration), then periodontal (six sites per tooth, bleeding, recession, CAL computed, furcation 0–3, mobility 0–3; probe, chart, then instrument, never after scaling; baseline for every perio diagnosis, full charting yearly), then hard tissue on the odontogram. The PDA paper chart has no place for soft tissue and one line for perio; Flossify has the FDI odontogram and no perio chart. A perio chart is an insert-only exam like BP, auto-advancing along a fixed path, one-key flags, red at threshold, past exams greyed for comparison.

**Radiographs.** ADA/AAOMR January 2026: recall adults with caries every 6–18 months, without every 24–36; children 6–12 or 12–24. Store the original immutably, derived views separately, with type (periapical, bitewing, panoramic), teeth and justification, so the record says "last bitewings 14 months ago". Most PH general clinics refer panoramics out (₱500–1,500). Keep radiographs as long as the record.

**Plan and consent.** Phases named (Urgent · Disease control · Restorative · Maintenance), plus "existing" and "referred" lines. Consent is per procedure and per visit, not a paragraph signed at registration: procedure-specific risk paragraphs chosen by the plan lines ticked (extraction: dry socket, nerve, sinus; endo: retreatment, file separation, crown; crown; perio; denture; ortho), appended under the general words, versioned, signed by hand on the tablet (Flossify 035 already binds strokes to the visit, the version in force, the dentist and a guardian under 18), with a "plan changed since consent" warning on Mark done. Agree a stop signal before starting and print it on the tablet step.

**Anaesthesia and the note.** One cartridge of 2% lidocaine is 36 mg; maximums lidocaine ~7 mg/kg (absolute 500 mg), mepivacaine 400 mg; onset 5–8 minutes. An "Anaesthesia" row on Mark done and in the note: drug (picklist: 2% lidocaine 1:100,000, 4% articaine, 3% mepivacaine plain), cartridges in 0.5 steps, technique, time; compute mg against weight (the QR form can ask weight) and the epinephrine cap against today's BP. The note is SOAP under Flossify's names (complaint, findings, diagnosis, treatment, plan): auto-fill O from today's BP, chart changes and radiographs; make "post-op instructions given" and "anaesthesia" structured so a silent note is visibly incomplete; stamp the signer's PRC. Signed notes are never changed; corrections are dated addenda (`amends_id`); anything written more than 24–48 hours after the visit is labelled "Late entry". Inadequate documentation is cited in over 60% of dental malpractice claims; the top three missing items are the treatment plan, an updated history and the consent conversation.

**Courses.** Root canal: visit 1 access and calcium hydroxide, return in 1–2 weeks (62% of flare-ups within two weeks), visit 2 obturate, then core and crown promptly; crown: prep, lab 5–10 working days, seat booked 1–3 weeks out and confirmed only once received and checked; braces: bonding then adjustments every 4–8 weeks, 15–30 minutes; dentures: impressions, bite, try-in, delivery, adjustments. Course templates create the linked plan lines and suggest spacing; "temporary in place since <date>" turns amber at 30 days; a seat visit shows "lab case not received" until `received_on` is set. Flossify's lab statuses need due day, delivery appointment and "quality checked by".

**Prescriptions.** Generic name (RA 6675), strength, form, quantity, directions, prescriber's name, PRC and PTR; dangerous drugs need a PDEA S2 licence and the yellow pad. Flossify's A5 Rx is compliant; add an S2 field with a refusal, a small formulary with usual sig ("1 capsule every 8 hours for 7 days"), and validate the PTR year against the print date.

**Sterilisation traceability.** Mechanical monitoring every load, an internal chemical indicator in every pack, a spore test weekly and with every implantable load; a positive test takes the steriliser out of service and recalls what the suspect loads served. Autoclaves are mandatory under the 2022 PRBOD guidelines, yet spore testing is not a habit in PH clinics. A light Sterilisation log under Clinic settings (cycle number, date, operator, indicator, weekly spore result) with an optional cycle number on Mark done answers "which patients got packs from the failed load".

## 4. Records, retention and archiving

**What a complete record holds** (PRBOD six parts, which the inspector's form checks): patient information, dental history, medical history, dental record chart, diagnosis, treatment done; plus radiographs, casts, photos, lab results, consents, medical clearances, referral letters, post-op instructions given, every dated call. No financial information inside the clinical record; ledgers, claims and vouchers live separately (Flossify's Finances split is right). No opinions about the patient or the previous dentist. Every entry linked to its author; shared logins on the clinic computer destroy the trail.

**Retention: keep the longest rule and write it down.** PD 1575 (1978): ten years from the LAST ENTRY, then the dentition record is turned over to the NBI for forensic identification (copies kept); fine ₱100–1,000. PRBOD 2022 and PDA Code s.11: at least ten years including radiographs, casts, photos, lab results. DOH DC 2021-0226: outpatient records seven years after the last consultation. DOH-NPC Health Privacy Code: fifteen years, lifetime for medico-legal cases. RA 10173 IRR s.19: "as long as necessary", then unreadable or irretrievable, with a disposal log. Recommended Flossify default: 15 years from last entry, minors max(last entry + 15, 18th birthday + 10), never-purge on a legal hold, override only upward; a per-patient retention date on the record; a "retention review" list; an NBI turnover export (chart history, radiographs, photos, notes, consents); a disposal log row per action, with a 7-day grace period like Dentally's. `retention_purge()` must never touch clinical rows; the privacy notice must state the clinical period beside "texts two years, unadded forms 30 days". BIR books and invoices: five years (RR 7-2024), a separate clock.

**Patient status.** Active (seen in 12–24 months) · Inactive (no service in 24 months, still searchable, "re-verify details" prompt on the next booking) · Archived (manual, reason, hidden from search and recall) · Deceased (date, stops every text, cancels future visits). Flossify has no status, so recall texts would reach the dead and the departed. Statuses never delete data.

**Audit trail.** Health Privacy Code: who accessed, when, what operation; unique user id, date, time; a written retention policy for the log. Flossify audits `record.*` writes; add read events (opens, prints, downloads — files already do), keep the audit table insert-only, and give the owner or DPO a per-patient access log. Every appointment create, move, status change and delete visible from the visit ("who cancelled this").

**Access, transfer, release.** The patient has the right to the whole record including radiographs; unpaid bills are never a reason to withhold; 30 working days (+15 for complex requests); reasonable copying costs only; copies, never originals. PRBOD transfer set: written endorsement with the record extract, certification of release, statement of obligation (or none), acknowledgement by the receiving dentist. Legal requests (court order, subpoena, NBI): certified, page-numbered export with a hash, a disclosure log kept six years, a legal hold. "Get a copy of my record" on /me/ lands in the clinic inbox with a 30-working-day clock.

**Images, signatures, backups.** Images in DICOM or lossless original plus derived views; e-signatures valid under RA 8792 when bound to the document with a hash and an audit entry (store a hash of the rendered consent text with the strokes). Backups 3-2-1, encrypted, offsite, immutable copies, monthly restore tests recorded and shown to clinics on a "Where your records are kept" page; a 2019 attack encrypted ~400 practices through their backup provider. Breach: NPC and data subjects within 72 hours (NPC Circular 16-03); an incident register with the timer in /admin/.

## 5. Compliance and operations in the Philippines

**The papers a clinic keeps current** (a compliance calendar with 60/30/7-day reminders and scanned copies): PRC ID per dentist (three years, birth month, ₱450; CPD 15 units under the transitional rule, undertakings through 31 Dec 2026), original COR and diploma displayed at the main clinic and certified copies at every branch with a photocopy of each current PRC ID on file; PTR by 31 January (≤₱300, one covers the country, printed on prescriptions and certificates); mayor's permit by 20 January with sanitary permit, fire safety certificate and staff health certificates; DTI/SEC; BIR registration (1901/1903, books, Authority to Print), 1701Q on 15 May/Aug/Nov, annual ITR 15 April, 8% option under ₱3M, VAT above; FDA x-ray licence to operate (≤100 mA: ₱810 initial, ₱410 renewal; late renewal doubles plus 10% a month; dose badges and RPO training); PhilHealth accreditation renewed 120–20 days before expiry; DENR generator registration and hauler manifests; NPC registration when sensitive personal information of 1,000+ individuals is processed (NPC Circular 2022-04; verify the threshold and show "patients on file" beside privacy settings); DOLE 13th-month report by 15 January. Whether a stand-alone dental clinic needs a DOH LTO is unsettled (AO 2020-0047 lists dental as an ancillary service of a licensed primary care facility): keep it optional.

**Signage and advertising (PRBOD 2022).** Signage carries only name, degree, practice title, hours, address, nature of practice and a specialty in one of the seven Board fields; no "Dental Spa", technical terms, neon, promos, discounts, sponsors, testimonials or before/after photos visible from outside, and the inspection form checks "brochures/flyers through social media" and "discounts/promos … electronic media". A Notice of Violation gives two months. Flossify's public clinic page and any Facebook card must never offer promos, discounts, testimonials or galleries as features; a "signage-safe summary" the clinic can paste on Facebook and Google Business Profile is the safe version.

**Waste.** DOH HCWM Manual 4th ed.: three-bin system (black general, yellow infectious, yellow puncture-proof sharps), 0.07 mm liners sealed at three-quarters, tagged with source, weight, date; infectious waste held at most 48 hours cool season / 24 hours hot season; a waste log per pickup with hauler and manifest number.

**PhilHealth preventive oral health (PC 2024-0034, in force 28 Dec 2024; verify unchanged under YAKAP).** ₱1,000 per member per year: ₱300 first visit (screening, prophylaxis, fluoride varnish), ₱300 second visit at least four months later, ₱200 per tooth for sealant or Class V up to two teeth, emergency extraction; private co-pay caps ₱1,500 (exam and cleaning), ₱600 (sealant/Class V), ₱600 (extraction); free at public facilities; stand-alone dentists need a referral from the member's YAKAP provider. Claims within 60 calendar days; an RTH claim refiled within 60 days of notice; 2024 alone saw 483,000 denials and 304,082 returns, mostly late filing and encoding errors. From CY 2026 YAKAP clinics must use a PhilHealth-certified EMR and eKonsulta closes 31 December 2026: filing dental claims from Flossify would require Flossify itself on the certified list; the coverage page should say so and "ask your YAKAP clinic for the referral". Record PIN, referring facility and encounter date; a "days left to file" column and an RTH sub-status on the claims page.

**Staff and associates.** DOLE: 8-hour day, overtime +25%, night differential +10%, rest day +30%, holiday 200%, 13th month by 24 December, SSS/PhilHealth/Pag-IBIG. Associates earn ~₱30–50k a month or 30–40% of each procedure, less lab, less 5%/10% expanded withholding with a 2307 if a contractor: every `procedure_done` and statement line must carry the treating dentist so Finances prints a monthly professional-fee statement per associate per branch; employee or contractor is a setting, never inferred. A rota clash check for a dentist booked in two branches on one day.

**Inventory and equipment.** Reorder point = daily usage × lead time + safety stock; 2–4 weeks' cover for gloves and barriers, 1–2 for expiry-risk composites, cements and anaesthetic; provincial lead times 7–10 days; supplies ≤5–6% of collections (single practices average 7.2%); one person orders. An asset register with tasks per patient/daily/weekly/monthly/quarterly/annual and an "after every power interruption" list (re-run the cut autoclave cycle, purge lines, check compressor pressure).

**Owner KPIs, six tiles.** Production per provider per day; collection rate (alarm under 98%; average small practice 80%, top 10% 97%); case acceptance (42% average, 75% top); new patients plus reactivations; recall reappointment % (85%+); AR over 90 days under 3%. Secondary: no-show %, active patients, chair utilisation, median wait per dentist. Collection rate shown with and without HMO receivables; claims aging by payor rolled into AR. All derivable from events Flossify already stores.

## 6. What patients want

Speed of first answer (the clinic that replies wins), a price range before a time, no surprise at checkout, a wait they were told about, a dentist who is not rushed and explains each step, control in the chair (stop signal honoured every time; no "needle", "drill", "just relax"), a plan they can repeat at home (40–80% of spoken information is forgotten; recall ~14% spoken versus ~80% with pictures), three ways to pay, the next visit booked before leaving, a message that evening after an extraction, aftercare they can read at 10 pm, one booking and one text for the whole family, the discount computed correctly without asking for the ID twice, accessibility facts before arriving (ground floor, lift, ramp, accessible toilet, companion welcome — BP 344), and their record when they move clinic. About 10% would leave a dentist who criticises their teeth; 30% have walked out over a wait; average retention is 57% and the top 10% keep 99%; 83% read reviews and 52% require at least ten. The nervous flag, the stop signal and "what helps" belong on the record head as chips beside BP and allergies; "first visit" and "senior — OSCA ID on file" as chips on the queue.

## 7. Software patterns clinics praise

- **Status-coloured block with a confirmation dot**, colour never alone (Flossify's `QUEUE` colours stay the only status colours; add an optional tint by procedure or dentist).
- **Confirmation list** for the next two business days, families grouped, attempts counted, a commlog line per contact.
- **ASAP list with fit-to-gap offers** and a hold on the slot.
- **Unscheduled list and planned-appointment tracker**: nothing is deleted, broken visits stay crossed out.
- **Household/guarantor**: one number, one reminder, siblings back-to-back, family aging with credits to the oldest bucket.
- **Waiting-room board** with minutes waiting, an alert colour, self check-in by mobile plus birth date (reuse the desk QR).
- **Before-seating checklist** on the visit card; **exit compliance** at checkout showing only what is missing.
- **Perio chart** with auto-advance and one-key flags; **procedure note templates** with required slots (tooth, anaesthesia, materials, post-op given).
- **Treatment plan as phases with "your share" and a signature**; an **accepted-but-unscheduled** list worked weekly.
- **Recall list** with due = last cleaning + interval, hide-after-reminder, reminder counts, one reminder per family.
- **Morning huddle auto-report** and **end-of-day close** on one page each, printable.
- **Lab case due-date alert** against the fitting appointment.
- **Compliance calendar with document vault**, **inspection-readiness page** mirroring the PRBOD form, **sterilisation log**, **waste log**.
- **Patient status ladder**; **lock, then append or invalidate**; **immutable audit trail with reads**; **retention rule per record class with legal hold**.
- **Single record across branches with an enterprise view** (Flossify's group → clinic → staff_access, ₱800 per branch against Molarsoft's ₱1,499 + ₱499).
- **Downtime plan**: cached read-only today's schedule and queue, a printable day sheet, an offline queue for arrive/pay/note beyond the open chart (025), pages that load on 3G.
- **Export everything**, duplicate check on mobile + birth date + name at import, opening balances as a brought-forward line, merge patients.
- **Two-way inbox**: what every foreign vendor sells and what one-way sender-name SMS cannot do; until a two-way number exists, every text names the clinic's number and an action on /me/, and Messenger/Viber carry the conversation.

## Sources

- https://www.ada.org/resources/practice/practice-management/cancellations
- https://www.ada.org/resources/practice/practice-management/appointment-confirmations
- https://www.ada.org/resources/practice/practice-management/emergency-treatment
- https://www.ada.org/resources/practice/practice-management/medical-dental-health-history
- https://www.ada.org/resources/practice/practice-management/case-presentations
- https://www.ada.org/resources/practice/practice-management/templates-smart-phrases-and-soap
- https://www.ada.org/resources/ada-library/oral-health-topics/hypertension
- https://www.ada.org/resources/ada-library/oral-health-topics/antibiotic-prophylaxis
- https://www.ada.org/resources/ada-library/oral-health-topics/pregnancy
- https://www.aapd.org/globalassets/media/safety-toolkit/dental-records-ada.pdf
- https://adanews.ada.org/ada-news/2026/january/new-ada-recommendations-confirm-dental-imaging-most-effectively-used-in-moderation/
- https://adanews.ada.org/ada-news/2025/september/september-jada-finds-dental-fear-still-prevalent-in-us/
- https://www.opendental.com/manual/asaplist.html
- https://www.opendental.com/manual/confirmationlist.html
- https://www.opendental.com/manual/confirmationstatus.html
- https://www.opendental.com/manual/unscheduled.html
- https://www.opendental.com/manual/waitingroom.html
- https://www.opendental.com/manual/perio.html
- https://www.opendental.com/manual/treatmentplan.html
- https://www.opendental.com/manual/recalllist.html
- https://www.opendental.com/manual/family.html
- https://www.opendental.com/manual/labcaseedit.html
- https://www.opendental.com/manual/audittrail.html
- https://www.opendental.com/manual/patientedit.html
- https://www.opendental.com/manual/procedurelocking.html
- https://www.opendental.com/manual243/aging.html
- https://www.opendental.com/manual243/reportsstandard.html
- https://learn.dentrixascend.com/courses/scheduling-essentials-for-teams/lessons/patient-visit-workflow/topic/patient-checkout-using-exit-workflow-compliance/
- https://hsps.pro/Dentrix/Help/mergedProjects/Office%20Manager/Practice_Advisor/Running_the_Daily_Huddle_Report.htm
- https://magazine.dentrix.com/establishing-an-effective-continuing-care-process/
- https://dentrix.ideas.aha.io/ideas/DTX-I-296
- https://www.curvedental.com/dental-blog/what-your-dental-kpi-dashboard-should-actually-show
- https://www.curvedental.com/dental-blog/presenting-dental-treatment-plans
- https://www.curvedental.com/dental-blog/dental-osha-compliance-guide
- https://www.dentally.com/en-gb/solutions/fail-to-attend-rate
- https://help.dentally.com/en/articles/3567092-how-to-store-data-and-comply-with-gdpr-in-dentally
- https://molarsoft.com/
- https://www.dentalclinicmanual.com/documents/policies-and-procedures-manual-template.pdf
- https://dentalpracticesolutions.com/wp-content/uploads/2013/06/SAMPLE-MORNING-TEAM-HUDDLE.pdf
- https://www.dentaleconomics.com/practice/article/16393494/the-am-huddle-dentistrys-secret-weapon-for-success
- https://www.dentaleconomics.com/practice/systems/article/14210946/trouble-with-your-schedule-set-it-up-for-success
- https://www.dentalcare.com/en-us/ce-courses/ce704/the-daily-production-goal
- https://www.burkhartdental.com/practice-guide/front-office-systems/front-office-task-flow-guidelines/
- https://www.burkhartdental.com/practice-guide/front-office-systems/scripting-strategies-for-successful-scheduling/
- https://www.dentalintel.com/blog-posts/late-arrival-policy-for-patients-how-to-deal-with-tardy-patients-at-your-dental-practice
- https://www.dentistryiq.com/front-office/article/16357095/triage-a-front-office-responsibility
- https://www.dentistryiq.com/practice-management/industry/article/16366660/theres-a-hole-in-your-hygiene-how-reappointment-rates-dramatically-affect-dental-practice-growth
- https://www.dentalclaimsupport.com/blog/dental-office-managers-end-of-day-checklist
- https://resources.rework.com/libraries/dental-clinic-growth/wait-time-optimization-dental-clinics
- https://resources.rework.com/libraries/dental-clinic-growth/chairside-efficiency-improvement
- https://www.teero.com/blog/no-show-policy
- https://www.henryscheinone.com/insights/ebook/2026-catalyst-index/
- https://dentx.ca/dental-kpi/
- https://ashdentalcpa.com/dental-practice-accounting-framingham-kpi-benchmarks/
- https://dentalpracticeinsider.org/associate-dentist-compensation-models/
- https://denzif.com/blog/train-dental-receptionist-7-days-2026
- https://www.arini.ai/blog/dental-inventory-management-setting-par-level
- https://www.safcodental.com/blog/dental-equipment-maintenance-checklist
- https://www.cdc.gov/dental-infection-control/hcp/dental-ipc-faqs/sterilization-monitoring.html
- https://www.todaysrdh.com/hygiene-clinician-and-mathematician-three-local-anesthetic-calculations-explained-and-simplified/
- https://www.aafp.org/pubs/afp/issues/2021/1100/p476.html
- https://www.periodontalcare.sdcep.org.uk/guidance/assessment/special-tests/full-periodontal-examination/what-should-be-recorded/periodontal-parameters/
- https://health.ri.gov/sites/g/files/xkgbur1006/files/2026-01/ADA-AAOMR-patient-selection.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10477423/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC9750235/
- https://journals.sagepub.com/doi/10.1177/014107680309600504
- https://jdh.adha.org/content/90/3/203
- https://www.nature.com/articles/s41415-023-6199-5
- https://clerri.com/blog/dental-patient-attrition-statistics/
- https://www.dentaly.org/us/research/dentist-reviews-online/
- https://www.mlmic.com/dentists/blog/faqs-about-dental-records/
- https://www.thedoctors.com/articles/patient-safety-in-dentistry-documentation
- https://www.dentists-advantage.com/getmedia/ac408139-e8b9-4164-910a-d3aaf875de23/CNA-DA_DPL_7-RECORDK_093019_SEC.pdf
- https://www.accountablehq.com/post/data-backup-best-practices-for-dental-offices-a-hipaa-compliant-ransomware-ready-guide
- https://heydenta.com/reduce-no-shows-dental-clinic-philippines/
- https://heydenta.com/dental-clinic-messenger-automation-philippines/
- https://www.bookeasy.ph/dental-clinic-booking-system
- https://dentacarephilippines.com.ph/terms
- https://datareportal.com/reports/digital-2025-philippines
- https://blog.semaphore.co/2023/07/24/sms-statistics-philippines/
- https://www.telerivet.com/blog/viber-vs-whatsapp-vs-sms-philippines
- https://ngipenhub.com/blog/how-to-use-hmo-dental-benefits-philippines
- https://ngipenhub.com/blog/dental-hmo-philippines
- https://ngipenhub.com/blog/philhealth-dental-benefits-philippines
- https://www.ngipenhub.com/blog/braces-installment-philippines
- https://ngipenhub.com/blog/dental-clinic-reviews-philippines
- https://ngipenhub.com/blog/dental-clinic-accreditation-philippines
- https://hati.health/faq/how-to-request-an-loa-letter-of-authorization-from-maxicare
- https://radar.ph/doctor-stops-accepting-hmo-after-18-month-delay-in-%e2%82%b1300-consultation-payout/
- https://www.philhealth.gov.ph/news/up/article/2025/news_6789f4104aab3.php
- https://www.philhealth.gov.ph/circulars/2024/PC2024-0034.pdf
- https://www.philhealth.gov.ph/circulars/2020/circ2020-0022.pdf
- https://www.philhealth.gov.ph/circulars/2026/PC2026-0007.pdf
- https://www.philhealth.gov.ph/partners/emr/
- https://www.philhealth.gov.ph/news/2023/seniorpwd_discounts.pdf
- https://www.pna.gov.ph/articles/1238983
- https://www.philstar.com/business/2025/01/15/2414444/philhealth-accumulated-p596b-denied-returned-claims-hospitals-2018
- https://seriousmd.com/yakap/accreditation/
- https://pda.com.ph/wp-content/uploads/2023/03/2022-12-Annex-AB.pdf
- https://pda.com.ph/about-us/code-of-ethics/
- https://www.philippinedentalassociation.info/members/code-dental-practice/
- https://lawphil.net/statutes/presdecs/pd1978/pd_1575_1978.html
- https://lawphil.net/statutes/repacts/ra2007/ra_9484_2007.html
- https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html
- https://lawphil.net/statutes/repacts/ra2024/ra_11976_2024.html
- https://www.officialgazette.gov.ph/1988/09/13/republic-act-no-6675/
- https://www.foi.gov.ph/agencies/doh/retention-and-disposal-of-records/
- https://www.dataguidance.com/sites/default/files/health_privacy_code_as_reviewed_by_npc_05.24.2017.pdf
- https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/
- https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04-1.pdf
- https://privacy.gov.ph/wp-content/uploads/2022/01/sgd-npc-circular-16-03-personal-data-breach-management.pdf
- https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf
- https://www.respicio.ph/commentaries/applicability-of-electronic-signatures-in-medical-records-under-ra-8792-in-the-philippines
- https://www.respicio.ph/commentaries/bir-registration-requirements-for-new-dental-clinic
- https://www.respicio.ph/commentaries/how-many-cpd-units-are-required-for-prc-license-renewal-in-2026
- https://www.lawyer-philippines.com/articles/patient-rights-forced-stay-and-payment-disputes-in-dental-clinics
- https://www.lawyer-philippines.com/articles/2fpo982n1fgd39cvcuajyeud0thhgi
- https://www.grantthornton.com.ph/insights/articles-and-updates1/lets-talk-tax/invoicing-requirements-under-the-eopt-act/
- https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/eopt-is-here-updates-on-the-preservation-of-book-of-accounts-and-changes-in-taxpayer-registration/
- https://taxify.ph/blog/pwd-senior-citizen-discount-vat-exemption-philippines/
- https://taxify.ph/blog/withholding-tax-professional-fees-philippines/
- https://www.betterpractice.ph/guides/professional-tax-receipt-doctors
- https://www.fda.gov.ph/wp-content/uploads/2021/03/LAF_DENTAL-X-RAY-FACILITY.pdf
- https://law.upd.edu.ph/wp-content/uploads/2020/12/DOH-Administrative-Order-No-2020-0047.pdf
- https://www.washinhcf.org/wp-content/uploads/2021/07/DOH-Health-Care-Waste-Management-Manual_4th-Edition_FINAL.pdf
- https://ncda.gov.ph/revised-2024-rules-and-regulations-implementing-batas-pambansa-344/
- https://www.gloroots.com/blog/employee-benefits-in-the-philippines
- https://www.clinicfinderph.com/blog/how-to-get-medical-records-philippines
- https://www.clinicfinderph.com/blog/philhealth-dental-benefits-guide
- https://sugbo.ph/2026/cebu-brownout/
- https://solaren-power.com/power-outages-philippines-rotational-guide/
- https://www.paymongo.com/blog/mode-of-payment-philippines
- https://support.google.com/business/answer/7091?hl=en