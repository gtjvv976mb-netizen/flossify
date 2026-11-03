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
| The page's half | `public/app-shell.js` | Haptics, motion, safe areas, print, downloads, links, pull-to-refresh's question, the status bar, swipe back's question. Every rule it adds is under `html[data-app]`. Excluded from Tailwind's scan (`@source not` in `global.css`). |
| The native half | `mobile/ios/App/App/FlossifyShell.swift` | `FlossifyViewController` (Capacitor's view controller, extended), the `FlossifyShell` plugin, `FlossifyHaptics`, `FlossifyPrinter`, `FlossifyFiles`, `NavigationProxy`, `UIProxy`, `PageSheetController`. |
| Offline | `public/sw.js` | `/app-shell.js` network first, its last copy when the line is down (only the app ever asks for it). |
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
- **Motion:** cross-document view transitions on iOS's navigation curve (`cubic-bezier(0.32, 0.72, 0, 1)`, 420 ms):
  a push forward, a pop back (the Navigation API's `activation`, or the navigation's type), a crossfade when a save
  comes back to the same page, none on a reload. Buttons, chips, segments and cards give under the finger (`scale`).
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
- **Pull to refresh** asks `flossifyApp.canRefresh()` first: not while a POST form holds typed words ("Not refreshed:
  what you typed here is not saved yet.").
- **Safe areas:** the sticky bars take the status bar's height as padding (their colour runs up under the clock); the
  drawers, the side panels, the staff entrance, the desk consent turned to the patient and the scroll offsets follow;
  a page with no sticky bar starts below the clock and gets a frosted band under it; every page ends above the home
  indicator. Measured with an iPhone's (59 / 34 px) and an iPad's (24 / 20 px) insets.
- **The status bar** follows the page's theme; the colour behind the page (a bounce, a load) is the page's own ground.
- **Swipe back** works between pages, except out of a page where the page behind may not be this person's (anything
  under `/auth/`, a clinic's door, the patients' door, `/f/`, a signing page), and except while a panel, the drawer or
  a consent turned to the patient is drawn over the page.
- **The app switcher** shows the Flossify mark, not the page, for anything under `/c/`, `/f/`, `/me/` or `/admin/`.
- **Clinic tablets:** the screen stays awake on `/f/t/` and `/f/i/`.
- **Cookies:** Capacitor copies every cookie of the page into the app's shared cookie jar and never takes a copy away;
  the shell empties that jar at launch, after each page and going to the background (the page's own cookies live in
  the web view's store and are not touched). It never clears the web view's data: IndexedDB `flossify-offline` holds
  chart changes not yet sent.

## Rules for the app

- **In a browser the website is unchanged.** Everything for the app is behind the `FlossifyApp/` user agent and
  `html[data-app]`; `mobile/` and `public/app-shell.js` are kept out of Tailwind's scan. After any change, build and
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
- The native half: `mobile/README.md`, "What to check on the Mac".

## Open

- **Not yet built or run on a Mac.** The Swift was written in the cloud, without a compiler.
- **The App Store** (`mobile/README.md`): account deletion from inside the app (guideline 5.1.1(v)), since a clinic can
  be opened from it; paying for Flossify inside the app (3.1.1 / 3.1.3(c)); minimum functionality (4.2); the owner's
  Apple Developer account, App Privacy answers and a demo clinic for App Review. The owner decides each.
- **Password AutoFill** needs the owner's Team ID in `/.well-known/apple-app-site-association` and the Associated Domains
  capability.
- **The chart's palette** is placed by script no higher than 8 px from the top of the screen (`Odontogram.astro`), so a
  tooth near the top of the screen can put it under the status bar in the app.
- **The calendar's drag haptics** are felt by nobody yet: an iPhone's calendar does not drag (under 768 px) and iPads
  have no haptic engine.
