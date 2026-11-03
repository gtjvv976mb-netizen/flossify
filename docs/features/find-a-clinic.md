# The patient side: Find a clinic and booking

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9), with cross-references re-pointed to the file that now holds them. `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## The patient side — `/find/`

Built from `docs/service-map.md`. Rules that shaped it, and that hold:

- **Only availability the clinic can honour.** Slots come from the clinic's
  hours, the chosen dentist's days and the service's chair time; clinics not on
  the workspace get a labelled *request* path, never a calendar. The "taken"
  slots are a stable hash of the slot until a real schedule exists.
- **No account.** Name, mobile, reason. A known mobile is greeted by name.
- **Status is Manila time and never colour alone** — the dot changes and the
  words change with it (`statusFor` in `src/lib/availability.ts`).
- **Every trust claim names its source.** "PRC licence · checked <date>" means a
  person looked it up; there is no API. Specialty is shown only for the seven
  Board-recognised fields. HMO chips are what the clinic reported and say
  "confirm with your HMO".
- **Hooks are `data-*` attributes and must not collide.** Two bugs came from
  `$('[data-tip]')` matching the chips' own `data-tip` and `$('[data-done]')`
  matching progress marks. A hook that is queried with `querySelector` gets a
  name nothing else uses.
- **Toggle the `hidden` attribute, never the `hidden` utility class**, on
  anything JavaScript shows later; the class wins and the element stays gone.
- Bookings live in `localStorage` (`flossify:bookings`) with a three-minute
  undo. On a live clinic the same submit lands in the workspace.
- **A time tapped on /find/ is held** (p32). The booking opens with it on a
  strip inside the wizard card and skips When while it fits. When it no longer
  fits, the strip turns amber with one sentence and the two nearest free times,
  or a Call button, and Continue goes to When. The steps are named and numbered
  from the ones in the flow (three to five), and the reason chosen on /find/
  carries over.
- **A clinic with one dentist on its public page books with her.**
  `soloDentist()` pins her in `openSlots`, and `/api/bookings` pins her for live
  bookings and requests. The re-check is `slotStillOpen` on her slug, which
  counts her visits, the unassigned ones and the chairs. There is no Dentist
  step. A request there never offers "any dentist", and the When step names her
  days away from the start. Her reminders then name her.
- Blocked time (lunch, closed days, a dentist's hours and leave, a chair out of
  use) is honoured by every slot and every request: "Blocked time (040)" in docs/features/schedule.md.
