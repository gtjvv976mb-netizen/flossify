# Flossify for iPhone and iPad

One app for both sides of Flossify, by the owner's choice (3 Nov 2026: "make it into a fully functional iOS app with great
haptics and motion design"; a native shell around the live site, one app for patients and clinics). It opens
`https://flossify.ph/app/`, which sends someone already signed in straight to their Dashboard (staff) or My visits
(patients) and shows everyone else the two doors: *I'm a Patient* and *Clinic sign-in*.

The website does the work, so a fix to the site reaches the app without a new App Store release. The app adds what a
browser tab cannot do:

| | What | Where |
|---|---|---|
| Haptics (iPhone) | a tick for a choice, a light tap under the teal button, a soft tap as a panel, fold or the chart's palette opens, success, warning or error when something is saved or refused, a confirm for a booking, a rigid tap as a tooth is charted (a lift, ticks and a drop for a visit dragged on the calendar too, though only an iPad's calendar drags and iPads have no haptic engine) | `public/app-shell.js` asks; `FlossifyHaptics` in `ios/App/App/FlossifyShell.swift` plays (Core Haptics patterns where the phone has them) |
| Motion | iOS page transitions (push forward, pop back, a crossfade when a save comes back to the same page), buttons and cards that give under the finger, the start page rising into place; always on, as on the website | `public/app-shell.js` (cross-document view transitions, iOS 18.2+), `src/pages/app/index.astro` |
| Printing | `print()` opens iOS's print sheet on the paper the page is drawn for (A4, A5, the 80 mm receipt roll), after the page's own `beforeprint` (the record's print audit) | `FlossifyPrinter` |
| Files | a download (CSV, a patient file, the QR poster, *Add to calendar*) is kept in the app's protected temporary folder, offered in the share sheet (an `.ics` in iOS's calendar preview), and deleted when the sheet closes; patient files are never offered to Photos | `FlossifyFiles`, `NavigationProxy` |
| Links | another website opens in an in-app Safari view; a paper meant for a new tab opens in a sheet over the page, so what is typed underneath stays | `UIProxy`, `PageSheetController` |
| Pull to refresh | not while a form holds typed words (the page says so) | `FlossifyViewController.pulled()` |
| Privacy | the app switcher shows the Flossify mark, not a record; the edge swipe never goes back out of a sign-in page or a page a patient holds; the sign-in cookie is not copied to the app's own cookie jar | `FlossifyViewController` |
| Clinic tablets | the screen stays awake on a clinic tablet (`/f/t/`) and a device handed to a patient (`/f/i/`) | `arrived(at:)` |
| Offline | the service worker keeps the app's script, so the offline page and a kept record still print and buzz | `public/sw.js` |
| Safe areas | bars, drawers and panels clear the clock, the Dynamic Island and the home indicator; iPhone stays upright (iPad turns) | `public/app-shell.js` (`html[data-app]` only), `Info.plist` |

In a browser none of this runs: `src/components/AppShell.astro` loads `/app-shell.js` only when the user agent carries
`FlossifyApp/`, and every rule it adds is under `html[data-app]`.

## Build and run it on the Mac

You need a Mac with Xcode 16 or newer and Node 22. Nothing else: Capacitor 8 uses Swift Package Manager, no CocoaPods.

```bash
cd mobile
npm ci              # Capacitor and its four plugins
npm run sync        # copies the config and the offline page into the Xcode project
npm run open        # opens ios/App/App.xcodeproj in Xcode
```

In Xcode pick a simulator (iPhone 16 Pro, and an iPad to see the calendar's drag) and press Run.

**Until this branch is deployed, flossify.ph has no `/app/` page and no `/app-shell.js`.** Try the website's half from
this Mac instead:

```bash
npm run dev                      # in the repo's root: the website on http://localhost:4321
cd mobile && npm run local       # the app now opens http://localhost:4321/app/ (the simulator shares the Mac's localhost)
```

then Run in Xcode. `npm run sync` points it back at flossify.ph. (`npm run local` edits only the copy inside the Xcode
project, which git ignores.)

To see what the page asks of the app, turn on `webContentsDebuggingEnabled` in `capacitor.config.json` for a debug run
only, then Safari → Develop → Simulator → flossify.ph. Never ship it on.

### What to check on the Mac (none of it can be checked in the cloud)

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
11. Light and dark: the status bar's clock stays readable on every page, including the papers.

`scripts/dev/app/app-shell-check.mjs` and `scripts/dev/app/app-safe-areas.mjs` check the website's half (what the page asks
the app for, and where it draws) in Chromium; this list is for the native half.

## Signing, TestFlight and the App Store

These need the owner's Apple Developer account (99 USD a year), in the owner's name, and only the owner enters its
password or keys.

1. In Xcode, *App* target → Signing & Capabilities → Team: the owner's team. The bundle id is `ph.flossify.app`.
2. Product → Archive → Distribute App → App Store Connect → Upload. Then TestFlight for the clinic's own phones.
3. In App Store Connect: the App Privacy answers (health information and contact details are collected, linked to the
   person, not used for tracking), a privacy policy URL (`https://flossify.ph/privacy/`), and a demo clinic sign-in for
   App Review in the review notes.

Questions for the owner before submitting (also in `docs/features/ios-app.md`):

- **Account deletion (guideline 5.1.1(v)).** A clinic can be opened from inside the app (*Open your clinic*, `/start/`),
  so Apple requires a way to ask for the account to be deleted from inside the app too.
- **Paying for Flossify inside the app (3.1.1, 3.1.3).** The plan is paid through PayMongo from Clinic settings. Selling
  to a clinic for its staff usually falls under 3.1.3(c), enterprise services, but Apple decides; until `BILLING_FINAL`
  is true nothing is paid anyway.
- **Minimum functionality (4.2).** Apple refuses apps that are only a website. Printing, the share sheet, haptics, the
  offline chart and the privacy cover are the native part; say so in the review notes.
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
scripts/draw-icons.mjs       npm run icons: the app icon and the launch screen, drawn from the Flossify mark
scripts/use-local.mjs        npm run local: the simulator on the Mac's own website
```
