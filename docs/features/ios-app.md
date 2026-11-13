# The iPhone and iPad app

*Written 3 Nov 2026 with the app. `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.
How to build it, run it on a Mac and send it to TestFlight: `mobile/README.md`.*

## The owner's decision

The owner, 3 Nov 2026: "now make it into a fully functional iOS app with great haptics and motion design", and "use our
tools that helps iOS app building". Asked how, the owner chose:

- **A native shell around the live site** (Capacitor 8), not a rebuild: the website keeps doing the work, so a fix to the
  site reaches the app with no App Store release, and every rule in `CLAUDE.md` holds inside the app unchanged.
- **One app for patients and clinics.** It opens `/app/`: staff signed in go to their branch's Dashboard (Flossify's
  operator to /admin/), a patient signed in to My visits, everyone else sees the home page's two doors as two cards,
  *I'm a Patient* (/find/) and *Clinic sign-in* (/auth/login/), with *Booked already? My visits* under them.
- **Tested on the owner's Mac** (Xcode's simulator, then the owner's iPhone through TestFlight). The cloud cannot build
  or run iOS: everything native in this branch was written without a compiler and is checked first on the Mac.

## How it is built

| Part | File | What it does |
|---|---|---|
| The way in | `src/components/AppShell.astro` | Before first paint, only when the user agent carries `FlossifyApp/` (the app appends it, `capacitor.config.json` `appendUserAgent`): sets `html[data-app]` and loads `/app-shell.js`. In every layout (Base, Clinic, Admin) and the ten standalone /c/ pages. A browser never loads the script. |
| The start page | `src/pages/app/index.astro` | `/app/` (`app` was already on `RESERVED`). `noindex`; in a browser it is a plain page. |
| The page's half | `src/components/app-shell.js` | Haptics, motion, safe areas, print, downloads, links, pull-to-refresh's question, the status bar, swipe back's question. Every rule it adds is under `html[data-app]`. Excluded from Tailwind's scan (`@source not` in `global.css`). |
| The native half | `mobile/ios/App/App/FlossifyShell.swift` | `FlossifyViewController` (Capacitor's view controller, extended), the `FlossifyShell` plugin, `FlossifyHaptics`, `FlossifyPrinter`, `FlossifyFiles`, `NavigationProxy`, `UIProxy`, `PageSheetController`. |
| Offline, and a bad line | `AppShell.astro`, `public/sw.js` | The script is a hashed `/assets/` file (`import … ?url`), sent as immutable: a phone loads it once per release and never waits on the network for it again, worker or not (patients' phones have none). The worker keeps it too (cache first), so the offline page and a kept record have it. (On the dev server it comes from `/src/`; the worker then serves its kept copy at once and waits at most 2.5 s for one it has not got.) |
| The app | `mobile/capacitor.config.json`, `mobile/ios/App/App/Info.plist` | `ph.flossify.app`; opens `https://flossify.ph/app/`; bound domains flossify.ph, www, localhost (so the service worker runs: without App-Bound Domains WKWebView has no service worker, no /offline/ page and no kept record); iPhone portrait, iPad any way up; camera and photo words for file inputs. |

What the page asks for, and what the native side does with it:

- **Haptics** (`window.flossifyApp.haptic`): `selection` for a radio, checkbox, select, tab, segment or switch;
  `impact light` under a touch on the teal button (`medium` on a red one); `impact soft` as a panel opens from a plain
  button, a fold opens, or a popover (the chart's palette) opens; `notify success` when a save lands (`?saved=`,
  `?done=` … or an API 2xx), `warning` for a soft stop (blocked time, a consent form not agreed: a 409 that asks first),
  `error` for a refusal (an API 4xx, a `role="alert"` the server draws or a script adds); `pattern confirm` for an
  online booking; `impact rigid` as a tooth is charted; `pattern lift`, a `selection` per quarter hour and `pattern drop`
  for a visit dragged on the calendar. One gesture, one feeling: the panel a teal button opens does not tap again, a
  refusal and the alert it draws buzz once, and the move a drop asked for is not felt twice. The record's allergy and
  conditions line (`.rec-alerts`) is a `role="alert"` for the screen reader but never buzzes: it is not a refusal.
  Only what the person did is felt: an API's answer within 1.5 s of a touch, a key or a send (the chart's queue
  retrying every 30 s, or catching up when the line is back, is silent); a fold or popover only when the person opened
  it; the teal button as it is pressed, not as a finger lands on it to scroll. A failed line, 408, 429, 5xx and the
  chart's own renumbering are not refusals. On arrival the address is read before the page tidies it away; `?saved=
  nothing` and `?done=same` are not saves, `?chartskip=` and `?missed=` (and a warning callout) warn, `?paid=` is not
  felt (PayMongo sends the person back before the payment is confirmed), `?booked=`, `?signed=` and `?welcome=`
  confirm, and a post answered with a redirect (how this site answers a save that landed) to a page with no word of
  its own is felt as saved.
- **Motion:** cross-document view transitions on iOS's navigation curve (`cubic-bezier(0.32, 0.72, 0, 1)`, 420 ms):
  a push forward, a pop back (the Navigation API's `activation`, the navigation's type, or a "Back to …" link tapped),
  a crossfade between the main tabs (Dashboard, Patients, Finances, Clinic settings; the public bar's links) and when a
  save comes back to the same page, none on a reload. These win over the workspace's own 220 ms crossfade. Buttons, chips, segments and cards give under the finger (`scale`).
  `/app/` rises into place in turn. Always on, like the website.
- **Print:** `window.print()` fires `beforeprint` (the record's print audit rides on it), reads the page's `@page` size
  (A4, A5, the 80 mm roll) and opens iOS's print sheet on that paper, then `afterprint`.
- **Files:** `a[download]`, a blob or `data:` link the page makes, and a response that is an attachment or that WebKit
  cannot show are saved into `tmp/flossify-files/<uuid>/` with complete file protection, offered in the share sheet
  (an `.ics` in iOS's calendar preview) and deleted when the sheet closes; the folder is emptied at launch. A file from
  the server is never offered to Photos.
- **Links:** another website opens in an in-app Safari view (Capacitor's Browser); `tel:` and `mailto:` go to iOS; a
  same-site link meant for a new tab opens in a sheet over the page, sharing the sign-in, so what is typed underneath
  stays. Long-press previews and the long-press menu on links and images are off.
- **Pull to refresh** asks `flossifyApp.canRefresh()` first: not while a POST form, a panel still open or a signature pad holds typed
  words ("Not refreshed: what you typed here is not saved yet.").
- **Safe areas:** the sticky bars take the status bar's height as padding (their colour runs up under the clock); the
  drawers, the side panels, the staff entrance, the desk consent turned to the patient and the scroll offsets follow;
  a page with no sticky bar starts below the clock and gets a frosted band under it (`body::before`); every page ends
  above the home indicator, the full-height ones (the workspace, the staff entrance, /app/) without scrolling by it.
  All in CSS and on the screen only, so nothing moves after the first paint and nothing of it prints. Measured with an
  iPhone's (59 / 34 px) and an iPad's (24 / 20 px) insets.
- **The status bar** follows the page's theme; the colour behind the page (a bounce, a load) is the page's own ground;
  alerts, pickers and sheets follow the person's own choice of light or dark (the device's when they chose none); the
  native buttons are teal.
- **The keyboard** is the web view's own, as in Safari: it covers the lower part of the page and the field scrolls into
  view. (Capacitor's Keyboard plugin resized the whole page on every focus, so the clinic's photo jumped; it is not used.)
- **iOS 17 or newer**: the chart's palette is a popover.
- **The launch screen** stays over the web view until the page has drawn itself: the page says so (`FlossifyShell.ready`,
  from the app's script at DOMContentLoaded, and from the offline page), or, for a page without the script, its load has
  finished; 30 s at most. Never on a timer before that. Measured in the simulator: Capacitor's splash screen, which hid
  itself on a 4 s timer, left the web view blank whenever it ran out before the page had drawn (a first launch, a slow
  line, the offline page), so it is no longer used.
- **Swipe back** works between pages, except out of a page where the page behind may not be this person's (anything
  under `/auth/`, a clinic's door, the patients' door, `/f/`, a signing page), and except while a panel, the drawer or
  a consent turned to the patient is drawn over the page.
- **The app switcher** shows the Flossify mark, not the page, for anything under `/c/`, `/f/`, `/me/` or `/admin/`.
- **Clinic tablets:** the screen stays awake on `/f/t/` and `/f/i/`.
- **Backups:** what the web view keeps on the phone (its cookies, a kept record, chart changes not yet sent) is kept out
  of iCloud and computer backups (`Library/WebKit`, `Library/Cookies`), so a restored or new phone never carries a
  sign-in or a patient's data. Nothing native deletes any of it: IndexedDB `flossify-offline` holds chart changes not
  yet sent, and WebKit may keep its cookies in the same file as the app's own cookie jar (so the shell never empties
  that jar either).
- **A form is never sent again** by going back, forward or pulling to refresh (WebKit would re-send a refused record
  post without asking): a reload fetches the page afresh in place; going back or forward onto a form's answer steps
  one entry further, so the gesture never loops there.
- **A sheet** (a page the site opens in a new tab): its *Back to …* link closes it and the page underneath goes there,
  or, when the page underneath already is that page, stays as it is (its visit, anything typed), only scrolled to the
  part; when the page underneath holds typed words, the link opens in the sheet instead. Never from under a page a
  patient holds. A download, `tel:` or a change of language stays in the sheet. A sheet holding typed words asks
  before a swipe down or *Done* closes it.

## Rules for the app

- **In a browser the website is unchanged.** Everything for the app is behind the `FlossifyApp/` user agent and
  `html[data-app]`; `mobile/` and `src/components/app-shell.js` are kept out of Tailwind's scan. After any change, build and
  compare the CSS with `main` (it differs by exactly one rule, the start page's heading size), and run the two checks
  below.
- **Motion and haptics are never gated** on `prefers-reduced-motion` or any setting, as on the website.
- **Never clear website data from native code**, and never sign out by deleting cookies natively: sign-out is the
  page's own form (`guardSignOut` sends waiting chart changes first).
- **What the app shows a patient is what the website shows**: no native screen holds a patient's details, and nothing
  the app saves stays after the share sheet closes.
- **Haptics follow the page's events, never a guess**: a success only for a save the server took, a refusal only for
  one it refused.

## Checks

- `scripts/dev/app/app-shell-check.mjs` (`scripts/dev/e2e.sh app`): a phone-sized Chromium with the app's user agent
  and a stand-in bridge that records every call. An ordinary browser gets nothing; `/app/` light and dark (contrast,
  44 px, no sideways scroll); forward and back transitions; selection, the teal button's one tap, a panel's soft tap,
  errors and successes, the allergy line staying quiet; swipe back off while a panel is open; the in-app browser; the
  QR poster and `.ics` saved; typed words stopping pull to refresh; print on A4; offline, the app's script from the
  worker; the calendar's drag on an iPad (let go off the grid, so nothing moves).
- `scripts/dev/app/app-safe-areas.mjs` (`scripts/dev/e2e.sh safe`): with an iPhone's and an iPad's insets, 14 pages,
  the two drawers and a side panel: nothing under the status bar at the top, nothing in the home indicator's band at
  the end, the band where there is no sticky bar, no sideways scroll; and an ordinary browser given the same insets
  unchanged. Run without the app's user agent it fails on every page, which is how it was checked.
- `.github/workflows/ios-app.yml` and `scripts/dev/app/ios-simulator.sh`: the app built with Xcode and run in the iOS
  simulator on GitHub's Mac, against a copy of the website on the runner, on the newest iPhone Pro and iPad Pro: it
  builds with no warnings in Flossify's Swift, keeps running on every page, shows the page within 40 s (also on a slow
  line and on the app's offline page), and the page reaches the native side. Screenshots and logs are kept with each
  run. First green on 5 Nov 2026 (Xcode 26, iPhone 17 Pro, iPad Pro 13-inch).
- What needs a finger, a printer or a real iPhone: `mobile/README.md`, "What to check on a real device".

## The polish round (13 Nov 2026)

The owner, 13 Nov 2026: "audit the app … add motion designs, HUD/UI improvements and make the app perfect for
clinics/doctors/dentists/patients alike". Nine auditors read the app, a skeptic re-checked each finding (81 of 89
stood), three builders worked on separate files, and five reviewers then read the change (17 defects fixed). What it
added, by what a person meets:

**A dropped line never loses the page or the words.**
- A link tapped or a form sent on a dead line used to swap the page for the offline page, and the typed words went with
  it. Now the page stays, alive, and says so under the clock: nothing was sent, or (when the line dropped part-way) that
  it may not have been saved, so check before sending again. The app keeps the page only because the page defines
  `flossifyApp.lineFailed(sent)`; a page without the app's script still gets the offline page.
- The app's own offline page (`mobile/www/offline.html`): *Try again*, the line coming back and a pull all return to
  the page the person was on (`FlossifyShell.retry`: the last website page in the back list), not to `/app/`. The
  button shows it is trying. Two headings: "You're offline." and, when the phone has a line, "Flossify is not
  answering."; only the first promises to reopen by itself. A clinic tablet stays awake under it.
- The website's `/offline/` page asks `/healthz` when the line returns and reloads only on an ok answer.
- A server fault has a page (`src/pages/500.astro`), with no reload button: reloading a failed post would send it twice.
- A sheet that cannot load says so with *Try again*; a killed web process reloads, never a white screen.
- Back after 30 minutes or more: the page is fetched afresh, quietly, unless it holds typed words, a booking part-way,
  a panel, a sheet, or is a page a patient holds.

**A tap is always seen.**
- A thin teal line at the top (never the foot) while a page has been loading for a quarter second or more; it slides
  for a download. The thing tapped stays pressed until its page comes; a sent form's button reads as busy and a second
  tap is not a second send. Rows, tabs and cards tint or give under the finger.
- The launch screen breathes while it waits, says "Still loading…" after 8 s, and after 30 s with nothing loaded
  shows the offline page, never a blank one. VoiceOver hears "Flossify is loading", not the hidden page.

**Motion.** (Always on; nothing is gated.)
- The top bar and the phone's tab row hold still while the page under them slides (their own view-transition groups,
  named only for the length of a transition and only when on screen; iOS 18.2+).
- Tab moves and same-page saves dissolve without dipping through the ground. Phone panels move on the navigation
  curve (420 ms in, 240 ms out); the drawer's scrim leaves with it; menus and search results leave in 120 ms; a fold
  the person opens settles in; the booking's next step rises, and the booked moment has its mark and lines.
- The chart's palette is deliberately not animated: it is used hundreds of times a day.
- On the iPad's calendar a finger or pencil presses and holds 350 ms before a visit lifts (`HOLD_MS` in `board.ts`); a
  swipe over a card scrolls the day. It used to move the visit, which could text the patient. The mouse is unchanged.

**Fit.**
- Larger Text: the app tells the page iOS's size as a percentage (85 to 135; `FlossifyShell.textSize`,
  `flossifyApp.textSize`, `--app-text`), applied before first paint. Fields never go under 16 px. Kept as drawn: the
  record's paper sheets, the calendar, the chart, every paper and signing page, and the bars (as iOS's own bars are);
  at a larger size each tab is as wide as its word (`html[data-app-big]`). Seen in the simulator at the largest size.
- A date or time field on an iPhone takes its column's width (it ran past the screen's edge in New booking and on the
  Dashboard): `global.css`, inside `@supports (-webkit-touch-callout: none)`, so only iOS. Seen in the simulator.
- A full-screen panel's head and Close stay under the clock as it scrolls, and its last field clears the keyboard.
- Pull to refresh is off while a panel, drawer or pop-over is open, and its spinner sits clear of the Dynamic Island.
- No text selection, callout or drag on buttons, tabs and bars; a patient's details stay selectable. Hover styles do
  not stick after a tap. Quick taps never zoom.
- Signature pads follow one pointer per stroke; a pen takes over from a resting palm.

**What iOS adds.**
- Home Screen quick actions: Find a clinic, My visits, Clinic sign-in. Never from a page a patient holds or over
  typed words.
- VoiceOver's two-finger scrub goes back (the edge swipe's equivalent); saves and refusals drawn on arrival are
  spoken; the note under the clock is a live region that exists before its words.
- Native buttons are teal that reads in dark mode (`#98e3dc`); a dark Home Screen icon.
- Directions for a clinic with no map link of its own opens the Maps app. The Flossify mark goes to `/app/`.
- The calendar file from a booking has an end time and the clinic's address (`src/lib/ics.ts`).
- After signing in, the edge swipe no longer goes back onto the sign-in page.

**Not verified on a real device** (the simulator has no haptics, pencil or VoiceOver gestures): the hold-then-drag on
an iPad, palm and pencil on the signature pads, the quick actions, the two-finger scrub, the status-bar tap inside a
panel, and the dark icon. `mobile/README.md` lists them.

**Left for the owner** (found by the audit, not touched): the privacy notice's placeholders and a support page; the
price and free trial two taps from the first screen, and Pay now leaving for Safari (3.1.1); the start page's "in the
Web" and words for clinic owners only; Find a clinic naming Baguio while the one listed clinic is elsewhere; the
privacy manifest's answers; a Share button on a clinic's page; a signature for someone who cannot draw one.

## Open

- **Not yet on a real iPhone.** Built and run in the simulator by CI; haptics, printing, sharing and the app switcher's
  cover need a real device (TestFlight, which needs the owner's developer account).
- **The App Store** (`mobile/README.md`): account deletion from inside the app (guideline 5.1.1(v)) is built (047: My
  page → *Delete my account*, a request Flossify confirms on `/admin/accounts/`); paying for Flossify inside the app (3.1.1 / 3.1.3(c)); minimum functionality (4.2); an Apple
  Developer account as an organisation (5.1.1(ix): health records); a privacy notice with no placeholders that says how
  to reach Flossify and ask for deletion, and a support URL (5.1.1(i)); a demo clinic made for review, unlisted, with
  made-up patients; the SwiftCare sample's permission or /websites/ left out (5.2.1); App Privacy answers; Mac and
  Vision Pro availability off. The owner decides each.
- **iPad multitasking**: in Slide Over or Split View the app can be 320 pt wide. Measured at 320 on 13 Nov 2026: the
  four-tab row, the chart's palette, the Dashboard's date row and Finances' head. The full 14-page pass at 320 is open.
- **Larger Text** follows iOS's setting on an iPhone since 13 Nov 2026 ("The polish round", below); WebKit ignores it on
  an iPad, where pinch zoom is the way. The patient forms under `/f/` are not yet measured at the largest size.
- **Password AutoFill** needs the owner's Team ID in `/.well-known/apple-app-site-association` and the Associated Domains
  capability.
- **The chart's palette** is placed by its own script no higher than 8 px from the top of the screen; in the app it is
  moved down to 8 px below the status bar (a clamp in the app's script) and kept above the home indicator. Check on an
  iPhone that it never flashes under the clock as it opens.
- **The calendar's drag haptics** are felt by nobody yet: an iPhone's calendar does not drag (under 768 px) and iPads
  have no haptic engine.
