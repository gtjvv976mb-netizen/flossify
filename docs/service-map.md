# Flossify service map

What to build for clinics, dentists and patients in Baguio and Benguet, and why it will feel better than Molarsoft. Written 22 September 2026 from a survey of Molarsoft, the Philippine market, the best patient-facing directories abroad, clinic-side practice software, and the Philippine rules a dental directory has to live inside. Every page cited was read on that date; sources are numbered at the end. Anything marked *unverified* is a vendor claim or a secondary source we could not confirm.

The yardstick throughout is the owner's: **user experience and user-friendliness, for the patient and for the clinic owner.** "Best" below means fewest steps, nothing shown that is not true, and no surprise at the desk.

---

## 1. What Molarsoft actually offers

Molarsoft is a web-only, single-plan practice-management SaaS run by Reiro Corporation of San Fernando, Pampanga, established October 2023 [1]. It is sold to clinic owners. Patients never log in; they meet it only through a clinic's public page on `px.molarsoft.com`.

| Module | What it does | UX verdict | Source |
| --- | --- | --- | --- |
| Patient registration | One form on the patient's own phone: details, medical history, photo, e-signed consent | Good. No clipboard. | [1] |
| Dental records & charting | Records, images, x-rays, "advanced dental charts" | Unknown. Notation (FDI/Universal), surfaces and perio are not documented anywhere public. | [1] |
| Treatment plan proposals | Plans the patient can evaluate | Not observable from outside. | [1] |
| Prescriptions, custom forms | Password-protected e-Rx; consent, certificates, clearances, aftercare | Fine. | [1] |
| Agenda / queue | Arriving → lobby → treatment room → no-show; live public queue screen per branch | The public screen shows "Queue is empty" with no expected wait; the state machine itself is sound. | [2] |
| Reminders & recall | Email + SMS | SMS price not published. | [1] |
| Finance, multi-branch, permissions | Dashboard, expenses, centralised reporting, hide sales from staff | Standard. | [1] |
| Payments | QR Ph from the billing tab: 29 banks, 6 e-wallets | Good, Filipino-first. | [1] |
| Patient booking | 2-step *request* on the clinic's public page: name, birthdate, branch, purpose; no account, no OTP; HMO membership captured from a 34-HMO master list | The best decision in the product, undermined by four HTTP redirects before the form (0.85 s to first byte), free-text service names ("CBCT 7500php", ALL-CAPS warnings), no privacy notice where data is collected, English only. | [2][3] |
| Public clinic page | Name, logo, one address, phone, branch tabs, two buttons | A stub. No hours, dentists, services, prices, photos or reviews; browser title is "Molarsoft", not the clinic. | [2] |
| Pricing | One plan: ₱1,499/mo in NCR, Region III and IV-A; **₱1,299/mo everywhere else including CAR**; ₱999 in BARMM; +₱499 per extra branch; 15% off yearly; 7-day trial | Regional prices are hidden behind a 3-field calculator (read from the page's JavaScript). | [4] |
| Onboarding | Invite code obtained by Messenger, then a call | Gated. A Baguio clinic cannot start on its own on a Sunday night. | [5] |
| Not offered (nothing public) | Native app or PWA, patient login or history, clinic directory or search, reviews, telehealth, inventory, lab tracking, HMO claims aging, offline mode, API | | [1][6] |

Molarsoft also claims "300+ clinics" and 24/7 chat support; the first is *unverified* and the second conflicts with its own contact page (Mon–Fri 9–6, 1–2 business days) [1].

**Read:** Molarsoft is a competent clinic back-office with a thin patient front. Its weakest surface — the public clinic page and the discovery around it — is exactly where a service database for patients lives.

---

## 2. What the others do better

Eleven patterns, each from a product that has proved it.

1. **Lead with the visit reason, not the specialty.** Zocdoc's guided symptom search lifted bookings for several visit reasons by 100–190% [7]. Practo lists "toothache", "bleeding gums" and routes to dentists [8]. Flossify's Smile Finder already does this on the sample site.
2. **Search → match → book in three to five taps, no account.** Cliniko: "no usernames or passwords to remember" [9]; NexHealth: no patient portal needed [10]. Doctolib's ~11-step flow with a mandatory account is tolerated only because of its network [11].
3. **Next two or three slots on the result card**, with "Available today / next 4 hours / this week" filters (Practo) [8]. Time-to-appointment is the number patients feel: on Zocdoc 35% are seen within 48 hours [12].
4. **Only show availability you can honour.** Phantom slots and provider cancellations are the top one-star theme across Zocdoc, Doctolib DE and Practo [13][14][15]. Flossify owns the clinic queue; expose the live schedule and never a marketing calendar.
5. **Treat the insurance filter as a trust product.** Zocdoc disclaims in-network guarantees; Doctolib DE users report practices that list statutory insurance but only take private [14]. HMO chips must carry a "confirm with your HMO" line and a last-checked date.
6. **Price on the card and on the service page.** Practo prints the fee on every result [8]; Practo's own Trustpilot is 1.3/5 largely because fees at the clinic differed from the app [15]. What is shown online must be what the desk quotes.
7. **Reviews only from verified visits, solicited automatically, moderated, never deletable by the clinic.** Docplanner published 4.9 M opinions in 2025 and rejected 1.5% [16]; Zocdoc says a provider with 50+ reviews is booked twice as often [17].
8. **Reminders that confirm by reply.** Zocdoc: email 7 d and 1 d before, SMS ~3 h before, intake nudges at 48 h / 24 h / 90 min [18]; Weave lets the patient confirm with one text that writes back to the schedule [19].
9. **A one-tap waitlist.** Doctolib's "earlier appointment" alert is the single most praised feature in its German reviews [14]; NexHealth says waitlist slots fill in under ten minutes [10].
10. **Cancellation that respects both sides.** 24-hour self-cancel window (Jane, Cliniko), a 3-minute grace period to undo a mistaken booking (Jane), "contact to cancel" inside the window, and a per-clinic block from the second no-show (Doctolib, where dentists have the highest no-show rate, 6.2%) [20][21].
11. **Booking for someone else is first-class.** 76% of Zocdoc appointments booked for another person are booked by women [22]; Doctolib has "add a relative" inside the flow [11].

On the clinic side, the mechanics reviewers actually praise are few and specific [23]: a visible patient-flow state machine with role hand-offs (Dentrix Ascend's Here → Ready → Chair → Checkout → Complete), a "schedule next visit" task on every appointment card, two-tap charting with the odontogram beside the treatment plan (Curve), an invoice-based ledger where every payment visibly attaches to a line (the only ledger anyone praises), lab status as three colours on the calendar (Dentally), and a handful of saved one-click reports with CSV export. The universal complaint is click depth: "10 steps to reach a window" (Eaglesoft), "way too many clicks" (tab32), "several clicks for info" (CareStack) [23]. Measure taps-to-chart and taps-to-balance and put the numbers in the release notes.

---

## 3. Gaps in the Philippine market

- **No dental marketplace exists.** NgipenHub is a directory with Free / ₱100 / ₱300 monthly clinic tiers, verified badges and a cost estimator, no app [24]. HeyDenta is a Messenger and website booking bot ("Aria", English or Taglish) at ₱4,990/mo [25]. ClinicFinderPH is a directory-blog that lists ten featured Baguio clinics with PhilHealth and HMO flags but few hours, no reviews and no booking [26]. NowServing (SeriousMD) lists dentists by city and specialty; SeriousMD's free tier lets patients book only through NowServing, Pro is ₱1,950/mo [27][28].
- **Baguio clinics book through Facebook pages and Messenger**, occasionally a Setmore page [29]. A directory that speaks Messenger and gives the clinic a page better than its Facebook page meets them where they are.
- **PhilHealth now pays for preventive dental care and almost nobody explains it.** PC 2024-0034: ₱1,000 per member per year; two visits at least four months apart at ₱300 each (screening, cleaning, fluoride); +₱200 per tooth for sealants or Class V restorations, two teeth a year; co-pay caps of ₱1,500 and ₱600 in private clinics, none in public ones. It is delivered through YAKAP (ex-Konsulta) clinics or accredited dental clinics with an agreement with one [30][31]. In CAR the accredited YAKAP list (~123 clinics) is mostly government health centres [32]. A patient-facing "what PhilHealth will pay for at this clinic" screen would be the first in the region.
- **HMO dental is real but opaque.** 28 HMOs hold Insurance Commission licences [33]; dentist accreditation is per HMO, private, and has no public API [34]. Members find dentists through PDFs and per-HMO portals. Molarsoft's 34-HMO master list with per-clinic flags is the right shape; nobody shows it to patients before they book.
- **SMS has hard rules.** Semaphore charges ₱0.56 per SMS ex-VAT, two credits for priority or OTP, and requires a registered sender name [35]; since 2023 telcos must block SMS containing clickable links [36]. Reminders must work with no URL in them: "Reply Y to confirm", a short code, or app push.
- **Payments are cheap if you pick the rail.** QR Ph is 1.34% on PayMongo and 1.0% on Maya Business; GCash via wallet is 1.79–2.23%; cards 3.1–3.5% [37][38].
- **Dentists are scarce in the public system.** DOH cites one dentist per 53,000 people against a WHO ideal of 1:7,500 [39] (*the figure is as reported; it likely describes the public sector*). Waiting time and walk-in load are real; a live "open now, lobby not busy" signal is worth more here than in Manila.

---

## 4. The Flossify service map

Three audiences, one database. MVP = ship for Baguio and Benguet first. **Depends on** names the piece that must exist first.

### Patients — find, compare, book, prepare, recover

| Service | For whom | UX promise (measurable) | When | Depends on |
| --- | --- | --- | --- | --- |
| Find a clinic by what is wrong, by service, by HMO or PhilHealth, near me, open now | Anyone with a phone | Home → clinic card in ≤3 taps. Every card shows a price range, the next 2–3 real slots, HMO chips and "open now". | MVP | Clinic pages, live schedule |
| Book without an account | New and returning patients | Name + mobile + reason; ≤5 steps; under 60 s; first byte under 0.5 s on 4G; no redirect chain; record created only on submit | MVP | Workspace schedule |
| Real availability only | Everyone | Never show a slot the clinic cannot honour. Clinics not on the workspace get a clearly labelled *request* button, never a calendar. | MVP | Workspace |
| Smile Finder (symptom-led) | The worried | Symptom → urgency → services with prices → what to do tonight; urgent paths go straight to Call. Already built on the sample site. | MVP | Service catalogue |
| Fee guide + estimate | Price-sensitive patients (most) | Range and what it includes, per clinic; a copyable estimate. No "promo", "discount" or "sale" anywhere (PDA Code, §19.3) [40]. | MVP | Service catalogue |
| HMO and PhilHealth before booking | HMO members; PhilHealth beneficiaries | Per-HMO chips with IC licence number and "confirm with your HMO"; PhilHealth panel showing the ₱1,000 cap, the two-visit rule, the co-pay cap and which YAKAP clinic to be registered with. | MVP (static guidance) → Later (live balance) | HMO master list; PhilHealth accreditation |
| Reminders that confirm by reply | Booked patients | SMS at 48 h and 24 h, "Reply Y to confirm"; no links (NTC). Confirmation writes back to the schedule. | MVP | Sender-name registration |
| One-tap waitlist | Anyone who wanted sooner | "Tell me if something opens earlier" on every booking; one tap to take the slot. | Later (first after MVP) | Workspace |
| Book for someone else | Parents, adult children | A "for whom?" step with saved dependents; reminders to the booker. | MVP | — |
| Cancel and reschedule | Booked patients | Self-serve outside 24 h; 3-minute undo after booking; "contact to cancel" inside the window; reason captured. | MVP | — |
| After the visit | Treated patients | Aftercare for the treatment they had (built), an Invoice (not an OR, see §5), the next recall date to their calendar, a review request only once the appointment is marked complete. | MVP | Workspace completion event |
| Verified reviews | Choosing patients | Only from completed appointments, moderated, never deletable by the clinic, shown with count and date. | Later | Post-visit flow |
| One identity across clinics | Returning patients | Optional account after the first booking; history, invoices, x-rays where the clinic shares them. | Later | RLS schema (exists) |
| Language | Baguio and Benguet | English and Filipino at launch; Ilocano toggle for the patient flow. | MVP (EN/FIL) → Later (ILO) | — |

### Dentists — a profile people can trust, a schedule that follows them

| Service | UX promise | When | Depends on |
| --- | --- | --- | --- |
| Verified profile | PRC licence checked by a person against verification.prc.gov.ph (no API exists) and shown as "PRC licence · checked on <date>"; re-checked every three years at PIC renewal [41]. Specialty allowed only for the seven PRBOD-recognised fields with a credential on file; otherwise "General dentist, practices X" [42]. | MVP | Staff check queue |
| Self-onboarding | Upload e-PIC/PIC and Certificate of Registration from the phone; listed within a day after review. | MVP | — |
| Schedule across clinics | Many dentists rotate between clinics. One schedule, shown on each clinic's page for the days they are there. | MVP | Workspace |
| Referrals | Send a patient to a specialist with images and history in one action; the referral shows in both workspaces. | Later | Workspace |
| Renewal and CPD reminders | PIC expiry and CPD units due, as quiet reminders. | Later | Profile |
| Reviews on the profile | Verified visits only; no testimonials or before-and-after on public pages by default (PDA §18, PRBOD signage rules) [40][42]. | Later | Reviews |

### Clinics — the workspace, and a public page that is the product

| Service | UX promise | When | Depends on |
| --- | --- | --- | --- |
| Public clinic page generated from the workspace | Hours with "open now", dentists, services and prices, HMO and PhilHealth chips, photos, map, booking. The sample clinic website in this repo is this page; every clinic gets one and it stays true because it reads the same data the desk uses. Browser title is the clinic's name. | MVP | Service catalogue, hours, staff |
| Schedule and patient flow | Here → Ready → Chair → Checkout → Complete, each press notifying the next role; a live lobby screen; a "schedule next visit" task on every appointment card. Taps-to-chart and taps-to-balance from the schedule ≤2, and published. | MVP | — |
| Charting | Two taps: procedure, tooth. Odontogram (built: FDI / Universal / Palmer, surface-scoped) always beside the treatment plan, colour-coded planned / done / history. Never on the marketing home page. | MVP | Exists |
| Treatment plan for the patient | Plain-language procedure names; fee / covered / you-pay per line; sign on the patient's phone; duplicate to present an alternative. | MVP | Charting, HMO |
| Invoice-based ledger and BIR Invoice | Every payment attached to a treatment line; the document is titled **Invoice** (EOPT Act, RR 7-2024) with the OR series kept only as a supplementary legacy document; structured e-invoice ready before 31 Dec 2026 if the clinic is above the micro threshold [43]. | MVP | Existing OR-series logic, renamed |
| HMO on both sides | Capture membership and ID at booking (as Molarsoft does); LOA status on the appointment; claims aging with "stuck past 60 days" up front (built). | MVP | Exists |
| PhilHealth preventive oral health claims | Encode the mandatory bundle and transmit through a PhilHealth-certified system; show the member's remaining ₱1,000. | Later — requires certification and an agreement with a YAKAP clinic [31] | Accreditation |
| Reminders and recall | SMS at ₱0.56 with a registered sender name; recall lists computed from completed procedures; Messenger reply for clinics that live on Facebook. | MVP | Sender name |
| Payments | QR Ph first (1.0–1.34%), GCash and Maya, card as a fallback; the fee shown to the clinic before it turns a rail on. | MVP | Gateway account |
| Reports | Six saved one-click reports (production, collections, aging, recall due, unscheduled treatment, no-shows), CSV on every one, daily numbers on the schedule itself. | MVP | — |
| Self-serve start and open pricing | Create the listing and start a trial in minutes with no invite code; a published price table by region, with a per-branch price; the demo call offered, never required. Price at or under Molarsoft's ₱1,299 for CAR. | MVP | Billing |
| Works through a brownout | Charting, notes and the day's schedule cached on the device and synced back; the UI says plainly which actions need signal. | MVP (read + chart) → Later (full) | Client architecture |
| Multi-branch | One database; patients and staff with a default branch; per-branch fee schedule and invoice series (schema exists). | MVP | Exists |
| Lab cases | Sent / Received / Overdue on the appointment, a coloured mark on the calendar. | Later | — |
| Inventory, sterilisation log | Minimum-on-hand and a reorder list at most; a per-autoclave cycle log only if PDA or DOH inspectors ask for it. | Later, or never | — |

---

## 5. Trust and compliance, as product requirements

- **PRC verification is a human job.** The public lookup at verification.prc.gov.ph is free but reCAPTCHA-gated with no API or bulk endpoint [41]. Store licence number, PIC expiry, checker, timestamp and a screenshot hash; show "checked on". Never a bare "Verified".
- **Separate trust chips, not one badge:** PRC licence · PDA member · PhilHealth-accredited dental clinic · per-HMO accreditation · FDA x-ray licence (required per machine, ₱810 initial) [44]. Each comes from a different regulator and can lapse separately.
- **Data Privacy Act from day one.** Health data is sensitive personal information [45]. Register the processing system with the NPC once 1,000 people's SPI is held (₱500–2,500) [46]; appoint a DPO with a dedicated address; consent that is specific and unbundled — booking, reminders and marketing as separate ticks (NPC Circular 2023-04) [47]; 72-hour breach notification [48]. Put the notice and the consent tick on the screen where the data is typed, which Molarsoft does not.
- **Advertising rules shape the copy.** The PDA Code of Ethics forbids promotional rates and product endorsements; PRBOD guidelines allow before-and-after photos only inside the clinic and restrict titles to recognised ones [40][42]. Block "promo", "discount" and "sale" in clinic-editable text; keep any treatment gallery behind the clinic's login.
- **PhilHealth means a certified system.** All oral-health data for the benefit must be encoded in PhilHealth-certified applications [31]. Budget the certification as a project, not a feature.
- **BIR: the document is an Invoice.** Since 27 April 2024 the Invoice is the primary document for services; ORs are supplementary [43]. Rename the existing OR-series logic now, before a clinic prints a thousand of them.
- **No "teledentistry" claims.** The DOH telemedicine guidelines define providers as physicians and facilities [49]. Word any remote feature as *ask a question · send a photo · book*, never *online diagnosis*.
- **Stand-alone dental clinics are not DOH-licensed today** (inferred from AO 2020-0047 and PhilHealth's own circular) and are exempt from the mayor's permit under DILG MC 2016-170 where the dentist pays professional tax [50][51]. Do not require a "DOH licence" upload the clinic cannot produce.

---

## 6. What this means for the app

- **Installable web app first, store apps second.** Molarsoft has neither. A PWA gives home-screen icon, offline clinic pages and push reminders from one codebase, and it is the fastest way to give a Baguio patient an "app" without a 60 MB download on a prepaid plan. Wrap it for the stores when the patient account exists.
- **Design for low-end Android and one bar of signal.** No video in the app; images lazy and sized; every screen readable at 360 px; the booking flow must complete on 3G. The clinic-side app must chart offline.
- **Push replaces SMS links.** SMS cannot carry a URL [36], so the app is where "tap to confirm", "an earlier slot opened" and "your invoice" live. Keep SMS for the patients without the app: reply-Y confirmations and plain reminders.
- **Messenger is a channel, not a competitor.** Deep-link to the clinic page and booking from the clinic's Facebook page; accept "book" from Messenger the way HeyDenta does, but land in Flossify's flow.
- **One booking link everywhere** (Facebook, Google Business Profile, QR at the desk, the clinic site). NexHealth reports 73% of online bookings arrive after hours [10]; the link is the front door at eleven at night.
- **The app is the patient's history.** Doctolib and Zocdoc users praise having every appointment in one place and hate OTP failures and single-language UIs [11][13]. Optional account, phone-number login with a fallback, Filipino and English from day one.

---

## 7. What not to build first

- **Video consultations.** No dental legal framing, poor value for dental problems, and the regional apps that tried it (HealthNow, Medgate) show 1.8-star reliability complaints [52].
- **Pay-per-booking marketplace fees.** Zocdoc's USD 35–110 per new patient generates provider resentment and pull-outs [53]; the Philippine norm is a clinic subscription (NgipenHub ₱100–300, SeriousMD ₱1,950, Molarsoft ₱1,299–1,499, HeyDenta ₱4,990). Charge the clinic a clear monthly price and keep the patient side free.
- **Inventory, sterilisation logs, e-prescribing integrations.** Optional or third-party in every mature product; e-Rx networks are US-only [23].
- **AI x-ray reading.** Marketing in every vendor's deck, verified nowhere.
- **PhilHealth claims before Baguio has accredited private dental clinics to file them.** Ship the patient-facing explainer now; the certified pipeline when the network exists.
- **A national launch.** The value is density: enough Baguio clinics with live schedules that a search returns a real slot. Ten clinics with honest availability beat two hundred listings with none.

---

## 8. Open questions for the owner

1. Will the directory list clinics that do **not** use the Flossify workspace? If yes, they get a labelled request button and a claimable page, not a calendar; decide whether that free tier is worth the support load.
2. Price: at, under, or above Molarsoft's ₱1,299 for CAR, and is the public patient side always free?
3. Who performs PRC checks, and within what turnaround? (A one-person queue works for Baguio; it is the bottleneck for a national list.)
4. Is there a YAKAP clinic or LGU health office willing to sign the agreement that lets private clinics deliver the PhilHealth dental benefit?
5. Ilocano at launch or after? (It decides who translates the Smile Finder and the aftercare copy.)
6. SwiftCare: client, partner, or concept only? The sample site's status decides how it is described in public.
7. Where is the data hosted, and does the DPO exist yet?
8. Store apps in year one, or PWA only until the patient account ships?

---

## Sources (all seen 22 September 2026)

1. molarsoft.com — home, features, FAQ, terms, privacy, contact
2. px.molarsoft.com/_/drsmile and /_/teethcentrale — public clinic page, booking step 1, waiting screen
3. px.molarsoft.com booking step 1 — service picker text; redirect chain timed at 0.85 s TTFB / 1.13 s total
4. molarsoft.com/pricing — regional base prices read from `_app/immutable/chunks/D0yCcyd4.js`
5. app.molarsoft.com — registration (invite code) and login pages
6. Google Play, App Store, molarsoft.com manifest checks — no app or PWA found
7. zocdoc.com — Guided Search results and "how search works"
8. practo.com — dentist listing filters (Bangalore page); help.practo.com — verification and patient-story rules
9. cliniko.com — online booking without login
10. nexhealth.com — online booking, waitlist, after-hours and Reserve-with-Google figures (vendor claims)
11. Doctolib — App Store FR/US listings; refugies.info step-by-step guide; connect.doctolib.com verification
12. Zocdoc "What Patients Want 2025" via prnewswire.com (10 Dec 2025)
13. Zocdoc — App Store reviews; Trustpilot 4.8/5 from 14,356 reviews
14. doctolib.de on Trustpilot — 4.4/5 from 9,893 reviews
15. practo.com on Trustpilot — 1.3/5 from 188 reviews
16. trust.docplanner.com — 2025 transparency figures
17. zocdoc.com resources — review-count effect on booking
18. zocdoc.com — reminder cadence and intake nudges
19. getweave.com — dentistry and scheduling pages
20. jane.app — cancellation policy, 3-minute buffer, waitlist; help.cliniko.com — cancellation link
21. community.doctolib.fr (30 Nov 2022) and rdv-medecins.com — no-show statistics
22. zocdoc.com — booking-on-behalf figures
23. Open Dental, Dentrix Ascend, Curve, CareStack, tab32, Dentally, Software of Excellence, Dentalink product pages; Capterra / Software Advice / SelectHub reviews
24. ngipenhub.com — home, /for-dentists, /pricing
25. heydenta.com — home and online-booking page
26. clinicfinderph.com — Baguio dental listings, /for-clinics, clinic detail page
27. nowserving.ph — dentistry pages for Baguio City, Benguet (listing count not confirmed)
28. seriousmd.com/pricing and /dentist-software
29. Facebook pages of Baguio dental clinics; et3rnitydentalclinic.setmore.com
30. PhilHealth Circular 2024-0034 (23 Dec 2024); pna.gov.ph, pia.gov.ph coverage
31. PC 2024-0034 §V.B and §V.E — accreditation, agreements with YAKAP clinics, certified systems
32. philhealth.gov.ph — List of Accredited YAKAP Clinics CY 2026 (updated 31 Jan 2026)
33. insurance.gov.ph — licensed HMOs as of 31 Aug 2025
34. site.intellicare.com.ph Access Guidebook 2022; healthpartnersdental.com; medicardphils.com member FAQ
35. semaphore.co — pricing, docs, FAQ
36. NTC memorandum on SMS with clickable links, via globe.com.ph newsroom and philstarlife.com (2023)
37. paymongo.com/pricing
38. maya.ph/business/pricing; help.gcash.com MDR article; philstar.com (5 Sep 2023) on the micro-merchant waiver
39. gmanetwork.com (15 Feb 2026) quoting DOH on the dentist-to-population ratio — *as reported, likely public sector*
40. pda.com.ph — Code of Ethics §18, §19.3, §20.1
41. verification.prc.gov.ph; prc.gov.ph — stateboard verification, CPD FAQ; RA 9484 §19, §28
42. PRBOD Practice Management Guidelines (PDA Memorandum 2022-024); PRBOD Resolution 07 s. 2021 (recognised specialties)
43. RA 11976 (EOPT) and RR 7-2024 via ntrc.gov.ph; RR 11-2024; RR 11-2025 (e-invoicing, extended to 31 Dec 2026) via bir.gov.ph and firm summaries
44. fda.gov.ph — Dental X-ray Facility licence checklist and fees
45. RA 10173 §3(l), §13(a) via lawphil.net
46. NPC Circular 2022-04 §5; NPC Circular 2023-01 fees (via emerhub.com)
47. NPC Circular 2023-04 (7 Nov 2023)
48. NPC Circular 16-03 §11
49. DOH–UP Manila JMC 2020-0001 Telemedicine Practice Guidelines (via dataguidance.com)
50. DOH AO 2020-0047 (via law.upd.edu.ph); PC 2024-0034 on future DOH licensing
51. DILG Memorandum Circular 2016-170 (28 Nov 2016)
52. App Store PH — Medgate Philippines (1.8/5, 86 ratings); HealthNow PH listing
53. zocdoc.com provider pricing page; dentalvitals.com fee range (secondary)

*Not covered, because the market sweep was stopped before it finished: a first-hand count of NowServing's Baguio dentists, MediCard's and Maxicare's provider-finder UX, and Facebook-page reach statistics for Philippine clinics. None changes the map above; each would sharpen the Baguio launch plan.*
