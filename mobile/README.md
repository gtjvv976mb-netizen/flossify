# Flossify for iPhone and iPad

One app for both sides of Flossify, by the owner's choice (3 Nov 2026: "make it into a fully functional iOS app with great
haptics and motion design"; a native shell around the live site, one app for patients and clinics). It opens
`https://flossify.ph/app/`, which sends someone already signed in straight to their Dashboard (staff) or My visits
(patients) and shows everyone else the two doors: *I'm a Patient* and *Clinic sign-in*.

The website does the work, so a fix to the site reaches the app without a new App Store release. The app adds what a
browser tab cannot do:

| | What | Where |
|---|---|---|
| Haptics (iPhone) | a tick for a choice, a light tap as the teal button is pressed, a soft tap as a panel, fold or the chart's palette opens, success, warning or error when something the person did is saved or refused (never for the page's own background work), a confirm for a booking or a signing, a rigid tap as a finding is picked on the chart (offline too) (a lift, ticks and a drop for a visit dragged on the calendar too, though only an iPad's calendar drags and iPads have no haptic engine) | `src/components/app-shell.js` asks; `FlossifyHaptics` in `ios/App/App/FlossifyShell.swift` plays (Core Haptics patterns where the phone has them) |
| Motion | iOS page transitions (push forward, pop back for Back and "Back to …", a crossfade between the main tabs and when a save comes back to the same page), buttons and cards that give under the finger, the start page rising into place; always on, as on the website | `src/components/app-shell.js` (cross-document view transitions, iOS 18.2+), `src/pages/app/index.astro` |
| Printing | `print()` opens iOS's print sheet on the paper the page is drawn for (A4, A5, the 80 mm receipt roll), after the page's own `beforeprint` (the record's print audit) | `FlossifyPrinter` |
| Files | a download (CSV, a patient file, the QR poster, *Add to calendar*) is kept in the app's protected temporary folder, offered in the share sheet (an `.ics` in iOS's calendar preview), and deleted when the sheet closes; patient files are never offered to Photos | `FlossifyFiles`, `NavigationProxy` |
| Links | another website opens in an in-app Safari view; a paper meant for a new tab opens in a sheet over the page, so what is typed underneath stays, and its "Back to …" link closes the sheet and goes there underneath | `UIProxy`, `PageSheetController` |
| Pull to refresh | not while a form holds typed words (the page says so) | `FlossifyViewController.pulled()` |
| Privacy | the app switcher shows the Flossify mark, not a record; the edge swipe never goes back out of a sign-in page or a page a patient holds; a form is never sent again by going back or pulling to refresh; what the web view keeps (cookies, a kept record, chart changes waiting) stays out of iCloud and computer backups | `FlossifyViewController`, `NavigationProxy` |
| Clinic tablets | the screen stays awake on a clinic tablet (`/f/t/`) and a device handed to a patient (`/f/i/`) | `arrived(at:)` |
| Offline | the app's script is a hashed file the phone keeps (no page waits on the network for it); the service worker keeps it too, so the offline page and a kept record still print and buzz | `AppShell.astro`, `public/sw.js` |
| Safe areas | bars, drawers and panels clear the clock, the Dynamic Island and the home indicator; iPhone stays upright (iPad turns) | `src/components/app-shell.js` (`html[data-app]` only), `Info.plist` |
| Launch screen | the launch screen stays until the page has drawn itself (the page says so, or its load has finished), never on a timer before that, so a slow line shows the launch screen, never a blank page; 30 s at most | `FlossifyViewController.showLaunchCover()` |

In a browser none of this runs: `src/components/AppShell.astro` loads the app's script only when the user agent carries
`FlossifyApp/`, and every rule it adds is under `html[data-app]`.

## Built and run on a Mac by CI

Every push to a pull request that touches the app runs `.github/workflows/ios-app.yml` on GitHub's macOS runner (or run
it by hand: Actions → iOS app → Run workflow). It starts a copy of the website on the runner (a throwaway seeded
database and the dev server), then `scripts/dev/app/ios-simulator.sh`:

- builds the app for the simulator with Xcode, without signing, and lists warnings in Flossify's own Swift;
- installs it on the newest iPhone Pro and iPad Pro simulators;
- opens `/app/` (light and dark, first launch and again), a slow line (an address that answers after 7 s), Find a
  clinic, the staff entrance and a dead address (the app's offline page, with and without the app-bound limit);
- checks on each that the app keeps running and the page is on screen within 40 s, and on `/app/` that the page
  reached the native side (a debug build logs every bridge call).

The screenshots, the app's console and WebKit's system log are kept with the run (Artifacts: ios-simulator). First
green on 5 Nov 2026, on Xcode 26 with an iPhone 17 Pro and an iPad Pro 13-inch (M5). On the Mac, the same script runs
against `npm run dev`.

A macOS runner's minute counts ten times a Linux one in a private repository's allowance; a run takes about 18 minutes.

## Build and run it on the Mac

You need a Mac with Xcode 16 or newer and Node 22. Nothing else: Capacitor 8 uses Swift Package Manager, no CocoaPods.
The app needs iOS 17 or newer (the chart's palette is a popover, which iOS 16 does not have).

```bash
cd mobile
npm ci              # Capacitor and its two plugins (App, Browser)
npm run sync        # copies the config and the offline page into the Xcode project
npm run open        # opens ios/App/App.xcodeproj in Xcode
```

In Xcode pick a simulator (iPhone 16 Pro, and an iPad to see the calendar's drag) and press Run.

**Until this branch is deployed, flossify.ph has no `/app/` page and no app script.** Try the website's half from
this Mac instead:

```bash
npm run dev                      # in the repo's root: the website on http://localhost:4321
cd mobile && npm run local       # the app now opens http://localhost:4321/app/ (the simulator shares the Mac's localhost)
```

then Run in Xcode. `npm run sync` points it back at flossify.ph. (`npm run local` edits only the copy inside the Xcode
project, which git ignores.)

To see what the page asks of the app, turn on `webContentsDebuggingEnabled` in `capacitor.config.json` for a debug run
only, then Safari → Develop → Simulator → flossify.ph. Never ship it on.

### What to check on a real device (CI covers the rest)

CI already checks 1, 2 (signed out) and 18 in the simulator; the rest needs a finger, a printer or a real iPhone.

1. It builds with no warnings from `FlossifyShell.swift`.
2. `/app/` shows the two doors; signed in, the app opens on the Dashboard; the launch screen fades into the page.
3. Haptics on a real iPhone (the simulator has none): a radio or checkbox ticks; the teal *New booking* taps; a panel
   opening from a plain button taps softly; a wrong password buzzes an error; a save that lands buzzes success.
4. On an iPad, a visit dragged on the calendar asks for a lift, a tick per quarter hour and a drop. iPads have no haptic
   engine and an iPhone's calendar does not drag (it is narrower than 768 px), so today nobody feels these: check the
   calls in Safari's Web Inspector, and that the drag itself still works with a finger.
5. Print the Treatment record: iOS's print sheet, on A4. A receipt prints on the roll's width.
6. Download a patient file and the patients CSV: the share sheet; *Add to calendar* on a booking: the calendar preview.
7. A link to another website opens in the in-app Safari view; *Done* comes back to the page.
8. Swipe back works between pages, but not out of the sign-in page or a page handed to a patient, and not while a panel
   is open.
9. With a record open, swipe up to the app switcher: the Flossify mark, not the record.
10. Turn on Airplane Mode with a record open in the last four hours: the kept copy shows, and a chart change waits and
    sends when the line is back.
11. Light and dark: the status bar's clock stays readable on every page, including the papers; with Light chosen on a
    dark-mode phone, alerts and the share sheet are light too.
12. A refused save on the record (Mark done with no consent), then pull to refresh or swipe back: nothing is sent again,
    the page is fetched afresh.
13. Open a prescription (it opens in a sheet), tap *Back to … record*: the sheet closes and the record underneath is
    there, once.
14. Tap a field on the sign-in page and on a patient's forms (`/f/i/`): the keyboard covers the lower part as in Safari
    and the field scrolls into view; the clinic's photo behind does not jump.
15. Share a patient file, open Mail, cancel: the share sheet stays and the file is still there; close it: gone.
16. A refused save, then a link to another page, then swipe back twice: the second swipe goes past the refused save's
    page to the one before it (it never loops there).
17. In a sheet with words typed (a person's page opened from a prescription's PTR link), swipe down or tap Done: it
    asks first. A *Back to …* link in a sheet: the page underneath keeps its visit and anything typed.
18. With the line off, the app shows its offline page; pull to refresh there: it tries the site again.

19. On an iPad, press and hold a visit on the calendar, then drag: it lifts and moves. A swipe over a card only scrolls
    the day.
20. Sign with a finger while the palm rests on the pad, and with a Pencil: one clean stroke each time.
21. Long-press the app's icon: Find a clinic, My visits and Clinic sign-in each open their page; none takes a tablet
    out of a patient's forms.
22. With VoiceOver on, a two-finger scrub goes back; a save and a refusal are spoken; the launch screen says
    "Flossify is loading".
23. Settings → Display & Text Size → Larger Text at the largest: `/app/`, Find a clinic, the Dashboard, Patients and a
    patient's forms under `/f/` read larger with no sideways scroll; the four tabs still show their whole words.
24. With a full-screen panel scrolled down, tap the status bar: the panel goes to its top. Its Close stays in reach.
25. Airplane Mode, then tap a link and send a form: the page stays, a note says nothing was sent, and the words are
    still there. Turn the line back on and send again: once.
26. In dark mode, *Done* on a sheet and the buttons of an alert are readable; the Home Screen icon has its dark look.
27. New booking on an iPhone: the Date and Time fields sit side by side inside the panel.

(`scripts/dev/app/app-shell-check.mjs` runs with any Chromium: `PW_CHROMIUM=<binary>`. `npm run icons` also draws
`AppIcon-dark.png`. `cap sync` copies `www/offline.html` into the Xcode project again.)

`scripts/dev/app/app-shell-check.mjs` and `scripts/dev/app/app-safe-areas.mjs` check the website's half (what the page asks
the app for, and where it draws) in Chromium; this list is for the native half.

## Signing, TestFlight and the App Store

These need an Apple Developer account (99 USD a year) and only the owner enters its password or keys. An app that holds
health records must come from an organisation, not a person (guideline 5.1.1(ix)): the account is an Organization in
Flossify's company name, with a D-U-N-S number.

1. In Xcode, *App* target → Signing & Capabilities → Team: the owner's team. The bundle id is `ph.flossify.app`.
2. First, once: in App Store Connect, Apps → New App (iOS, *Flossify*, bundle id `ph.flossify.app`, which Xcode
   registered on 13 Nov 2026, SKU `flossify-ios`). Until the app is there an upload stops at "Error Downloading App
   Information". Then upload without a Mac: **Actions → iOS release → Run workflow** (`.github/workflows/ios-release.yml`) archives,
   signs with an App Store Connect API key (cloud-managed signing, no certificate files) and uploads; the build number
   is the run number. It needs four repository secrets, listed at the top of the workflow. On a Mac instead: Product →
   Archive → Distribute App → App Store Connect → Upload. Then TestFlight for the clinic's own phones.
   The privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) must agree with the App Privacy answers in step 3.
   Screenshots at the App Store's sizes (6.9-inch iPhone, 13-inch iPad): Actions → iOS app → Run workflow, tick
   *App Store sizes*.
3. In App Store Connect: the App Privacy answers (health information, contact details, photos, user content and a user
   id are collected, linked to the person, not used for tracking), a privacy policy URL (`https://flossify.ph/privacy/`),
   a support URL, an age rating, and Mac and Vision Pro availability turned off (the app is for iPhone and iPad).
4. For App Review: a demo clinic sign-in in the review notes. Never a real clinic's (it would show real patients): a
   clinic made for review, not listed (it never appears on /find/ or among the home page's partners), with made-up
   patients. Walk the reviewer through what is native: chart a tooth (haptics), print a prescription (the print sheet),
   download a file (the share sheet), the app switcher's cover.

Questions for the owner before submitting (also in `docs/features/ios-app.md`):

- **Account deletion (guideline 5.1.1(v)).** Done (047): My page → *Delete my account* sends a request (an owner's
  closes the whole clinic, anyone else's only their own sign-in), and Flossify confirms it on `/admin/accounts/`. The
  owner chose a request Flossify confirms (7 Nov 2026). Tell App Review where it is: My page, at the foot.
- **Paying for Flossify inside the app (3.1.1, 3.1.3).** The plan is paid through PayMongo from Clinic settings. Selling
  to a clinic for its staff usually falls under 3.1.3(c), enterprise services, but Apple decides; until `BILLING_FINAL`
  is true nothing is paid anyway.
- **Minimum functionality (4.2).** Apple refuses apps that are only a website. Printing, the share sheet, haptics, the
  offline chart and the privacy cover are the native part; say so in the review notes.
- **The privacy notice and a way to reach Flossify (5.1.1(i)).** Review opens `/privacy/`: it must name who to contact
  and how to ask for data to be deleted, with no unfilled placeholders, and the support URL must reach a person. The
  notice's words are a legal change (the owner's lawyer).
- **The SwiftCare sample (5.2.1).** A real clinic's name and photographs are reachable from /websites/ in the app: have
  the clinic's written permission ready for the review notes, or leave /websites/ out of the app.
- **Password AutoFill** needs the owner's Team ID in `/.well-known/apple-app-site-association` and the Associated
  Domains capability (`webcredentials:flossify.ph`). Not set up yet.

## Files

```
capacitor.config.json        the app: its id, the address it opens, the plugins' settings
www/offline.html             shown when flossify.ph cannot be reached at all (no service worker yet)
www/index.html               a fallback that goes to flossify.ph/app/
ios/App/App/FlossifyShell.swift   everything native that is Flossify's own
ios/App/App/SceneDelegate.swift   opens FlossifyViewController instead of Capacitor's plain one
ios/App/App/Info.plist       camera and photo words, bound domains, portrait on iPhone
ios/App/App/PrivacyInfo.xcprivacy  the privacy manifest: what the app collects (matches App Store Connect's App Privacy)
scripts/draw-icons.mjs       npm run icons: the app icon and the launch screen, drawn from the Flossify mark
scripts/use-local.mjs        npm run local: the simulator on the Mac's own website
```
