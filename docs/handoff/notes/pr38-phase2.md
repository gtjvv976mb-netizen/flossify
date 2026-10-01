## 8. The patient intake, phase 2 (039, review fixes in migration 043)
- **The desk's steps:** Add patient → *At the clinic, step by step*. The desk ticks the consent forms the procedure needs and fills the clinic's part. The named dentist then records "Explain and confirm"; the patient's own view is asked of a patient 7 to 17, and while the age is not known.
- **Handing over:** the forms go to a clinic tablet, or to the desk's own device ("Hand this device to <name>", `/auth/park/`, which signs the desk out). A clinic tablet is set up at `/auth/tablet/` and never holds a staff session.
- **The patient's pages** (`/f/i/<token>/`): page 1 (their details), then each form with a fresh signature and initials on the risks, then Check and send. Each form has a quiet Back, "Ask the desk" (keeps what was typed) and "Decide later". The profile is made at Send, unless the patient looks like someone already on file.
- **The device follows the desk:** a clinic device checks in every 12 s and leaves when the desk stops, moves or replaces the link. Unlocking or the next hand-over stops the earlier patient's link. Every standalone workspace page leaves when the device is handed over (`ParkedGuard`).
- **On the record:** a Consent forms pane with the forms' own pages and prints, a paper-signing path, and Manila dates.
- **Review:** 29 confirmed findings, all fixed and each re-tested against its failure scenario. `test:consent` 24/24, the intake database checks 19/19, the build passes, and the new screens measure clean (contrast, 44 px, no sideways scroll, light and dark, 1440 and 390).
- Production still offers none of the consent forms until they are reviewed (`CONSENT_REVIEWED` is empty).

