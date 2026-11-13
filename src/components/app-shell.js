/* Flossify in its iPhone app.
 *
 * Loaded only inside the app (src/components/AppShell.astro tests the user agent for "FlossifyApp/"), in the head, before
 * the page's own scripts. The native side is mobile/ios/App/App/FlossifyShell.swift (the `FlossifyShell` plugin) and
 * Capacitor's Browser plugin, reached through the bridge Capacitor injects (window.Capacitor).
 * In a browser this file never runs, so the website is unchanged there.
 *
 * What it adds:
 * - Haptics, in Apple's manner: a tick for a choice, a light tap under the main (teal) button, a soft tap when a panel or a
 *   fold opens, and success, warning or error when something is saved or refused (the API's answer, a refusal the server
 *   draws, a save that lands with ?saved= or ?done=). Pages call window.flossifyApp.haptic for the moments only they
 *   know (a card lifted and dropped on the calendar, a visit booked).
 * - Motion: iOS page transitions between pages (push forward, pop back, a quick crossfade when a save reloads the same
 *   page) under a top bar and a tab row that hold still; buttons, rows and cards that give under the finger and stay
 *   pressed until the next page comes; panels, folds, menus and the booking's steps that arrive rather than appear.
 *   Always on, as on the website (the owner's rule).
 * - What a web view lacks: print() opens iOS's print sheet on the paper the page is drawn for (its CSS @page size); a
 *   download (a[download], a blob or data: link the page made) is saved and offered in the share sheet (an .ics opens in
 *   iOS's calendar preview); a link to another website opens in an in-app Safari view. A link meant for a new tab opens in
 *   a native sheet over the page (FlossifyShell.swift, PageSheetController), so what is typed underneath stays.
 * - Pull to refresh (native) asks window.flossifyApp.canRefresh() first: not while a form holds typed words (a form
 *   that posts, a panel, the booking's steps, a refused form drawn again with its answers).
 * - What a touch screen needs: no hover left behind after a tap, no words selected or links lifted by a long press on a
 *   button or a tab, no zoom on a quick double tap, iOS's Larger Text (window.flossifyApp.textSize), and a note under
 *   the clock when the line drops or a file could not be downloaded. What is felt on arrival is also said to VoiceOver.
 * - The status bar's words and the colour behind the page follow the page's theme.
 */
(function () {
  'use strict';
  if (window.flossifyApp) return;
  var root = document.documentElement;
  var cap = window.Capacitor;
  // The address as the page arrived: Clinic settings, a person's page and My page tidy ?saved= and ?done= away with
  // replaceState before DOMContentLoaded, and this script runs first, in the head.
  var arrivedSearch = location.search;
  var noop = function () {};
  var OWN_HOSTS = { 'flossify.ph': 1, 'www.flossify.ph': 1 };
  OWN_HOSTS[location.host] = 1;

  function native(plugin, method, options) {
    try {
      if (cap && typeof cap.nativePromise === 'function') {
        return Promise.resolve(cap.nativePromise(plugin, method, options || {})).catch(noop);
      }
    } catch (e) { /* no bridge: nothing to do */ }
    return Promise.resolve();
  }

  /* ---------------------------------------------------------------- haptics */

  var last = { select: 0, notify: 0, pattern: 0, tap: 0 };
  function notify(type) {
    var now = Date.now();
    // One outcome, one feeling: a refusal the API answers and the alert the page then draws are the same event.
    if (now - last.notify < 400 || now - last.pattern < 400) return;
    last.notify = now;
    native('FlossifyShell', 'notify', { type: type });
  }
  var haptic = {
    tap: function (style, intensity) {
      var now = Date.now();
      if (now - last.tap < 60) return;
      last.tap = now;
      var o = { style: style || 'light' };
      if (typeof intensity === 'number') o.intensity = intensity;
      native('FlossifyShell', 'impact', o);
    },
    select: function () {
      var now = Date.now();
      if (now - last.select < 50) return;
      last.select = now;
      native('FlossifyShell', 'selection');
    },
    success: function () { notify('success'); },
    warning: function () { notify('warning'); },
    error: function () { notify('error'); },
    /* lift · drop · confirm · refuse (FlossifyShell.swift, FlossifyHaptics.pattern) */
    pattern: function (name) {
      last.pattern = Date.now();
      native('FlossifyShell', 'pattern', { name: name });
    },
    recentPattern: function (ms) { return Date.now() - last.pattern < (ms || 900); },
  };

  /* ---------------------------------------------------------------- motion */

  var css = [
    '@view-transition { navigation: auto; }',
    /* touch-action: a quick second tap on a control never zooms the page; panning and pinch zoom stay (the papers and
       the words are still read large that way), and the pads and calendar cards keep their own touch-action: none. */
    'html[data-app] { -webkit-tap-highlight-color: transparent; touch-action: manipulation; --app-vt-shadow: rgba(16, 24, 40, 0.14); --app-press: rgb(16 24 40 / 0.08); --app-press-soft: rgb(16 24 40 / 0.045); }',
    '@media (prefers-color-scheme: dark) { html[data-app]:not([data-theme="light"]) { --app-vt-shadow: rgba(0, 0, 0, 0.45); --app-press: rgb(255 255 255 / 0.1); --app-press-soft: rgb(255 255 255 / 0.1); } }',
    'html[data-app][data-theme="dark"] { --app-vt-shadow: rgba(0, 0, 0, 0.45); --app-press: rgb(255 255 255 / 0.1); --app-press-soft: rgb(255 255 255 / 0.1); }',
    'html[data-app] :is(a, button, summary, label, [role="button"], img) { -webkit-touch-callout: none; }',
    /* A long press on a control does not select its words or lift it as a drag (a link or a picture dragged to another
       app on an iPad would be a patient's file leaving unrecorded). What a person reads stays theirs to select and copy:
       a clinic's address and number, a reference number, the record, the words of a consent form. Fields always. */
    'html[data-app] :is(a, img) { -webkit-user-drag: none; }',
    'html[data-app] :is(button, summary, .btn, .ws-btn, .chip, .tab, .ws-seg, .ws-nav, .ws-nav-item, .ws-tabrow, .ws-side-top, .ws-side-foot,' +
      ' .site-nav, .site-link, .site-drawer-nav, .site-menu-btn, .rail-item, .app-door, .chip-radio, .slot-radio, .row-radio, .theme-seg, .entry-seg,' +
      ' [role="tab"], [role="button"], [role="switch"]) { -webkit-user-select: none; user-select: none; }',
    'html[data-app] :is(input, textarea, select, [contenteditable]) { -webkit-user-select: text; user-select: text; }',
    /* iOS page transitions. Push: the new page slides in from the right over the old one, which drifts left and dims.
       Pop: the reverse. A save that reloads the same page crossfades. The curve is iOS's own navigation curve. */
    /* (html[data-app] so these win over the workspace layouts' own 220 ms crossfade, Clinic.astro and Admin.astro.) */
    'html[data-app]::view-transition-old(root), html[data-app]::view-transition-new(root) { animation-duration: 420ms; animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1); animation-fill-mode: both; mix-blend-mode: normal; }',
    'html[data-nav="forward"]::view-transition-old(root) { animation-name: app-out-left; }',
    'html[data-nav="forward"]::view-transition-new(root) { animation-name: app-in-right; box-shadow: -12px 0 32px var(--app-vt-shadow); }',
    'html[data-nav="back"]::view-transition-old(root) { animation-name: app-out-right; z-index: 2; box-shadow: -12px 0 32px var(--app-vt-shadow); }',
    'html[data-nav="back"]::view-transition-new(root) { animation-name: app-in-left; z-index: 1; }',
    /* A save that comes back to the same page, and a move between the main tabs (Dashboard, Patients …), crossfade: iOS
       does not slide between tabs. */
    /* The new page stands whole underneath and the old one fades off it: two half-clear pages over each other would let
       the ground show through for a moment, a blink on every tab and every save. */
    'html[data-app]:is([data-nav="same"], [data-nav="tab"])::view-transition-new(root) { animation: none; }',
    'html[data-app]:is([data-nav="same"], [data-nav="tab"])::view-transition-old(root) { animation: 200ms ease both app-fade-out; z-index: 1; }',
    /* The bar at the top and the phone's tab row hold still while the page moves under them, as iOS's navigation bar
       does: each is its own group (named by nameChrome() only for the length of a transition, so at rest nothing about
       them differs from the website), its words crossfading in place. A bar only one of the two pages has travels with
       its page: in with a push, out with a pop. The current tab's pill (the layouts' own ws-tab-on) then sits in a row
       that is also still. */
    'html[data-app]::view-transition-group(app-bar), html[data-app]::view-transition-group(app-tabs) { animation-duration: 420ms; animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1); }',
    'html[data-app]:is([data-nav="same"], [data-nav="tab"])::view-transition-group(app-bar), html[data-app]:is([data-nav="same"], [data-nav="tab"])::view-transition-group(app-tabs) { animation-duration: 200ms; animation-timing-function: ease; }',
    'html[data-app]::view-transition-old(app-bar), html[data-app]::view-transition-new(app-bar), html[data-app]::view-transition-old(app-tabs), html[data-app]::view-transition-new(app-tabs) { animation-duration: 200ms; animation-timing-function: ease; }',
    'html[data-app][data-nav="forward"]::view-transition-new(app-bar):only-child, html[data-app][data-nav="forward"]::view-transition-new(app-tabs):only-child { animation: 420ms cubic-bezier(0.32, 0.72, 0, 1) both app-chrome-in; }',
    'html[data-app][data-nav="back"]::view-transition-old(app-bar):only-child, html[data-app][data-nav="back"]::view-transition-old(app-tabs):only-child { animation: 420ms cubic-bezier(0.32, 0.72, 0, 1) both app-chrome-out; }',
    '@media (max-width: 767px) {' +
      ' html[data-app][data-nav="forward"]::view-transition-new(ws-tab-on):only-child { animation: 420ms cubic-bezier(0.32, 0.72, 0, 1) both app-chrome-in; }' +
      ' html[data-app][data-nav="back"]::view-transition-old(ws-tab-on):only-child { animation: 420ms cubic-bezier(0.32, 0.72, 0, 1) both app-chrome-out; } }',
    '@keyframes app-chrome-in { from { transform: translateX(100vw); } }',
    '@keyframes app-chrome-out { to { transform: translateX(100vw); } }',
    '@keyframes app-in-right { from { transform: translateX(100%); } }',
    '@keyframes app-out-left { to { transform: translateX(-30%); filter: brightness(0.94); } }',
    '@keyframes app-out-right { to { transform: translateX(100%); } }',
    '@keyframes app-in-left { from { transform: translateX(-30%); filter: brightness(0.94); } }',
    '@keyframes app-fade-out { to { opacity: 0; } }',
    '@keyframes app-fade-in { from { opacity: 0; } }',
    /* Buttons, chips, segments and cards give under the finger and spring back. */
    'html[data-app] :is(.btn, .ws-btn, .chip, .ws-seg a, .ws-seg button, .slot, .tab, .ws-tool, .site-menu-btn, .app-door, a.card, [data-app-press]) {' +
      ' transition-property: scale, background-color, border-color, color, box-shadow, opacity;' +
      ' transition-duration: 300ms, 150ms, 150ms, 150ms, 150ms, 150ms;' +
      ' transition-timing-function: cubic-bezier(0.3, 0.7, 0.4, 1.5), ease, ease, ease, ease, ease; }',
    /* ([data-app-leaving]: the thing tapped stays pressed until its page comes, so a tap on a slow line is seen to
       have been taken. Set and cleared by markLeaving().) */
    'html[data-app] :is(.btn, .ws-btn, .chip, .ws-seg a, .ws-seg button, .slot, .tab, .ws-tool, .site-menu-btn, [data-app-press]):is(:active, [data-app-leaving]):not(:disabled) { scale: 0.96; transition-duration: 80ms, 150ms, 150ms, 150ms, 150ms, 150ms; }',
    'html[data-app] :is(.app-door, a.card):is(:active, [data-app-leaving]) { scale: 0.985; transition-duration: 90ms, 150ms, 150ms, 150ms, 150ms, 150ms; }',
    /* Rows and links in the chrome (the sidebar, the tab row, menus, search results, the public bar and its drawer)
       tint under the finger at once and let go with their own fade, the way an iOS row does; the system's grey flash
       is off (above) and the website only has hover, which a finger does not have. Not the current tab: its teal stays.
       Rows that carry muted words (a menu's hint, a tile's label, a search result's second line) take the softer tint:
       measured, the full one takes those words to 4.2:1 in the light theme. No tint at all on a patients row (list.css
       says why): the name turns teal, as on hover. */
    'html[data-app] :is(.ws-nav-item, .ws-tabrow-item, .ws-side-link, .ws-empty-go, .site-link, .site-drawer-link,' +
      ' .entry-way, .pt-clinic-link, .pt-back, .me-clinic, .pp-fold-sum, .rail-item, .idx-row):not([aria-current="page"]):is(:active, [data-app-leaving]) { background-color: var(--app-press); transition-duration: 0ms; }',
    'html[data-app] :is(.ws-menu-item, .ws-result, .ws-tile-link):not([aria-current="page"]):is(:active, [data-app-leaving]) { background-color: var(--app-press-soft); transition-duration: 0ms; }',
    'html[data-app] .pts-row:has(.pts-link:is(:active, [data-app-leaving])) .pts-link { color: var(--ws-teal-ink); text-decoration-color: currentColor; transition-duration: 0ms; }',
    /* A form on its way: its button dims a little (no spinner, nothing changes size) until the answer comes. */
    'html[data-app] [aria-busy="true"][data-app-leaving] { opacity: 0.72; }',
    /* Full-screen panels on a phone move on the app's own navigation curve, like a page; closing is quicker than opening
       (and inside the 260 ms after which the panel's script closes it anyway, shell.ts). */
    '@media (max-width: 767px) {' +
      ' html[data-app] .ws-panel[open] { animation: ws-panel-in 420ms cubic-bezier(0.32, 0.72, 0, 1); }' +
      ' html[data-app] .ws-panel[data-closing] { animation: ws-panel-out 240ms cubic-bezier(0.32, 0.72, 0, 1) forwards; } }',
    /* The phone drawer's scrim leaves with the drawer instead of a frame before it. (A transition is the one thing that
       outranks the [hidden] rule's display: none !important; before iOS 17.4 it cuts as on the website.) */
    '@media screen and (max-width: 767px) {' +
      ' html[data-app] .ws-scrim { transition: opacity 260ms cubic-bezier(0.4, 0, 1, 1), display 260ms allow-discrete; }' +
      ' html[data-app] .ws-scrim[hidden] { opacity: 0; pointer-events: none; } }',
    /* Menus and search results leave as they came, quicker; while leaving they take no taps. */
    '@media screen {' +
      ' html[data-app] :is(.ws-menu-pop, .ws-results) { transition: opacity 120ms ease, scale 120ms ease, display 120ms allow-discrete; transform-origin: top right; }' +
      ' html[data-app] :is(.ws-menu-pop[data-align="left"], .ws-side .ws-menu-pop) { transform-origin: top left; }' +
      ' html[data-app] :is(.ws-menu-pop, .ws-results)[hidden] { opacity: 0; scale: 0.98; pointer-events: none; }' +
      /* A fold the person opened: what is in it settles into place (opened by the page, or drawn open, it is just there). */
      ' html[data-app] details[data-app-opened][open] > :not(summary) { animation: app-fold-in 220ms cubic-bezier(0.32, 0.72, 0, 1); }' +
      /* The booking's steps (find/[clinic]/book.astro): the next question rises into place, and the booked moment the
         hand feels (pattern confirm) is also seen: the mark pops, the lines under it follow in turn. Not the alert:
         it is drawn later, when an Undo is refused, and a refusal must not wait its turn in a line that has passed. */
      ' html[data-app] .cl-book .wiz[data-app-in]:not([hidden]) { animation: app-step-in 280ms cubic-bezier(0.32, 0.72, 0, 1) backwards; }' +
      ' html[data-app] .cl-book [data-done-panel]:not([hidden]) > :not([role="alert"]) { animation: app-rise-in 400ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }' +
      ' html[data-app] .cl-book [data-done-panel]:not([hidden]) > .pt-done-mark { animation: app-mark-pop 420ms cubic-bezier(0.3, 0.7, 0.4, 1.5) backwards; }' +
      ' html[data-app] .cl-book [data-done-panel] > :nth-child(2) { animation-delay: 40ms; }' +
      ' html[data-app] .cl-book [data-done-panel] > :nth-child(3) { animation-delay: 80ms; }' +
      ' html[data-app] .cl-book [data-done-panel] > :nth-child(4) { animation-delay: 120ms; }' +
      ' html[data-app] .cl-book [data-done-panel] > :nth-child(5) { animation-delay: 160ms; }' +
      ' html[data-app] .cl-book [data-done-panel] > :nth-child(6) { animation-delay: 200ms; }' +
      ' html[data-app] .cl-book [data-done-panel] > :nth-child(n + 7) { animation-delay: 240ms; }' +
      /* A notice the patient's own post brought back (My visits: confirmed, cancelled) arrives with the tap. */
      ' html[data-app] .me-shell .ws-main > .ws-callout[role="status"] { animation: app-rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }' +
    ' }',
    '@keyframes app-fold-in { from { opacity: 0; translate: 0 -6px; } }',
    '@keyframes app-step-in { from { opacity: 0; translate: 0 8px; } }',
    '@keyframes app-rise-in { from { opacity: 0; translate: 0 12px; } }',
    '@keyframes app-mark-pop { from { opacity: 0; scale: 0.6; } }',
    /* Pop-overs that scroll keep their scrolling to themselves: a drag past their end does not pull the page (or start
       pull to refresh). */
    'html[data-app] :is(.ws-menu-pop, .ws-results, .bk-results) { overscroll-behavior: contain; }',
    /* Clear of the clock and the Dynamic Island, and of the home indicator. The app draws the page edge to edge
       (contentInset "never"); only here, inside the app, does anything read the insets, so the website is unchanged.
       Bars that stick to the top take the inset as padding: their colour runs up under the clock, and the pages that
       measure the bar (the calendar, the record, Clinic settings) follow on their own. On the screen only: the insets
       keep their values while iOS lays a page out for print, and paper has no clock. */
    'html[data-app] { --app-top: env(safe-area-inset-top, 0px); --app-bottom: env(safe-area-inset-bottom, 0px);' +
      ' --app-band-ground: rgba(243, 245, 248, 0.86); }',
    '@media (prefers-color-scheme: dark) { html[data-app]:not([data-theme="light"]) { --app-band-ground: rgba(21, 25, 30, 0.86); } }',
    'html[data-app][data-theme="dark"] { --app-band-ground: rgba(21, 25, 30, 0.86); }',
    '@media screen {' +
      ' html[data-app] { --ws-topbar-h: calc(72px + var(--app-top)); --fin-top: calc(4.5rem + var(--app-top)); }' +
      ' html[data-app] :is(.site-top, .ws-top) { padding-top: var(--app-top); }' +
      ' html[data-app] .site-drawer-inner { padding-top: calc(0.75rem + var(--app-top)); padding-bottom: calc(1.5rem + var(--app-bottom)); }' +
      ' html[data-app] .ws-side-top { padding-top: calc(1.125rem + var(--app-top)); }' +
      ' html[data-app] .ws-side-foot { padding-bottom: calc(1.125rem + var(--app-bottom)); }' +
      ' html[data-app] .ws-panel { top: calc(0.75rem + var(--app-top)); bottom: calc(0.75rem + var(--app-bottom)); height: calc(100dvh - 1.5rem - var(--app-top) - var(--app-bottom)); }' +
      /* --app-kb: how much of the screen the keyboard covers (watchKeyboard()). The keyboard is the web view's own and
         resizes nothing, so a panel's last field and its Save button get that much room to be scrolled clear of it. */
      ' html[data-app] .ws-panel-body { padding-bottom: calc(2rem + var(--app-kb, 0px)); }' +
      ' html[data-app] .ws-menu-pop { max-height: calc(100dvh - 6rem - var(--app-top) - var(--app-bottom)); }' +
      ' html[data-app] .ws-skip:focus { top: calc(0.75rem + var(--app-top)); }' +
      ' html[data-app] .entrance-top { padding-top: calc(1rem + var(--app-top)); }' +
      ' html[data-app] .entrance-main { padding-bottom: calc(clamp(0.75rem, 3vh, 2.5rem) + var(--app-bottom)); }' +
      ' html[data-app] .page-hero { min-height: calc(100svh - 4.25rem - var(--app-top)); }' +
      ' html[data-app] [data-desk-consent][data-facing] { padding-top: var(--app-top); padding-bottom: var(--app-bottom); }' +
      ' html[data-app] :is([data-rec-panel], [data-rec-panel] .ws-pane, [data-chart-offer]) { scroll-margin-top: calc(var(--rec-top, calc(4.75rem + var(--app-top))) + 0.75rem); }' +
      /* The chart's palette (a popover placed by script, Odontogram.astro) fits between the status bar and the home
         indicator; its scroll-margin-top carries the inset in px for the clamp in ready(). */
      ' html[data-app] [data-palette] { max-height: calc(100dvh - 16px - var(--app-top) - var(--app-bottom)); scroll-margin-top: var(--app-top); }' +
      ' html[data-app] .pt-main { scroll-margin-top: calc(4.5rem + var(--app-top)); }' +
      ' html[data-app] .pt-anchor { scroll-margin-top: calc(5.25rem + var(--app-top)); }' +
      ' html[data-app]:has(body.ops) { scroll-padding-top: calc(5.5rem + var(--app-top)); }' +
      /* The iPad's icon rail (768 to 1023 px) has its own, tighter padding. */
      ' @media (min-width: 768px) and (max-width: 1023px) {' +
        ' html[data-app] .ws-side-top { padding-top: calc(0.875rem + var(--app-top)); }' +
        ' html[data-app] .ws-side-foot { padding-bottom: calc(0.875rem + var(--app-bottom)); } }' +
      ' @media (max-width: 767px) {' +
        ' html[data-app] .ws-side-top { padding-top: calc(0.75rem + var(--app-top)); }' +
        ' html[data-app] .ws-side-foot { padding-bottom: calc(1.5rem + var(--app-bottom)); }' +
        ' html[data-app] .ws-panel { inset: 0; height: 100dvh; }' +
        /* The panel is the whole screen here and scrolls as one: its head (the title and the only Close button) stays
           at the top, on the panel's own ground, so words never run under the clock and Close is always in reach. */
        ' html[data-app] .ws-panel-head { position: sticky; top: 0; z-index: 3; flex: none; padding-top: calc(0.625rem + var(--app-top)); background: var(--ws-glass-strong); }' +
        ' html[data-app] .ws-panel-body { padding-bottom: calc(2rem + var(--app-bottom) + var(--app-kb, 0px)); }' +
        ' html[data-app] .entrance-top { padding-top: calc(0.75rem + var(--app-top)); }' +
        ' html[data-app] .entrance-main { padding-bottom: calc(1.5rem + var(--app-bottom)); } }' +
      /* A page with no bar of its own (a paper, a page a patient holds) starts below the status bar. Every page but the
         full-height ones (the workspace, the staff entrance, /app/, which place their own foot) ends above the home
         indicator. A page with no bar that sticks to the top gets a frosted band under the clock for words that scroll
         up under it. All in CSS, so nothing moves after the first paint. */
      ' html[data-app]:not(:has(.site-top, .ws-top, .entrance, .app-start)) body { padding-top: var(--app-top); }' +
      ' html[data-app]:not(:has(.app-start, .ws-app, .entrance)) body { padding-bottom: var(--app-bottom); }' +
      ' html[data-app]:not(:has(.site-sticky, .ws-top)) body::before { content: ""; position: fixed; inset: 0 0 auto 0; z-index: 2147482000;' +
        ' height: var(--app-top); pointer-events: none; background: var(--app-band, var(--app-band-ground));' +
        ' -webkit-backdrop-filter: blur(16px) saturate(1.05); backdrop-filter: blur(16px) saturate(1.05); }' +
      /* iOS's Larger Text (Settings, Display & Text Size): the app tells the page the size (textSize(), --app-text) and
         the words follow it, on an iPhone (WebKit ignores text-size-adjust on an iPad, where pinch zoom is the way).
         Fields never go under 16 px (iOS would zoom the page on focus). What is drawn to a fixed measure stays as
         drawn: the record's paper sheets, the calendar's grid, the chart, and every paper and signing page (a page
         with its own document, body.…-body). */
      ' html[data-app] { -webkit-text-size-adjust: var(--app-text, 100%); text-size-adjust: var(--app-text, 100%); }' +
      ' html[data-app] :is(input, textarea, select) { -webkit-text-size-adjust: var(--app-text-field, 100%); text-size-adjust: var(--app-text-field, 100%); }' +
      ' html[data-app] :is(.pp-sheet, .cal-frame, [data-odontogram], body[class$="-body"]) { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }' +
      /* The bars keep their size, as iOS's own navigation bars do: seen in the simulator at the largest size, the four
         tabs read "Dashb… Patien… Finan…" and the clinic's name broke in two. (A field in a bar still follows the rule
         above.) */
      ' html[data-app] :is(.ws-top, .ws-tabrow, .site-top) { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }' +
      /* WebKit grows what is measured in rem with the words, so at a larger size the tab row is narrower and its four
         equal tabs cannot hold "Dashboard": each tab is then as wide as its word (as global.css does under 390 px),
         with the row's own measures in px so they stay as drawn. */
      ' html[data-app][data-app-big] .ws-tabrow { gap: 4px; margin-inline: 12px; padding: 4px; }' +
      ' html[data-app][data-app-big] .ws-tabrow-item { flex: 1 1 auto; padding-inline: 2px; }' +
    ' }',
    '@media print { .app-note { display: none !important; } }',
    /* The note under the clock: pull to refresh will not reload a page with typed words, the line dropped, a file could
       not be downloaded. A popover, so it is drawn over an open panel too (showNote()); the rule undoes the browser's
       own popover box. Its words are said by the live region (say()), so the note itself is for the eye. */
    '.app-note { position: fixed; z-index: 2147483000; inset: calc(env(safe-area-inset-top) + 10px) 0 auto 0; width: fit-content; height: auto; margin: 0 auto; border: 0; overflow: visible; translate: 0 -8px; opacity: 0;' +
      ' max-width: min(92vw, 26rem); padding: 10px 16px; border-radius: 18px; font: 500 15px/1.35 Inter, -apple-system, system-ui, sans-serif;' +
      ' background: #1f2937; color: #fff; box-shadow: 0 8px 24px rgba(16, 24, 40, 0.18); text-align: center;' +
      ' transition: opacity 220ms ease, translate 420ms cubic-bezier(0.3, 0.7, 0.4, 1.3); pointer-events: none; }',
    '.app-note[data-show] { opacity: 1; translate: 0 0; }',
    /* Words for VoiceOver only (say()): in the page before they are needed, never seen. */
    '.app-say { position: fixed; left: 0; top: 0; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; pointer-events: none; }',
    '@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) .app-note { background: #e7ebf0; color: #15191e; } }',
    'html[data-theme="dark"] .app-note { background: #e7ebf0; color: #15191e; }',
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-app-shell', '');
  style.textContent = css;
  (document.head || root).appendChild(style);

  // iOS's Larger Text, as the app tells it (a percentage of the usual size; FlossifyShell.swift calls textSize() at the
  // start and whenever the setting changes). Kept for the session, so the next page has it before its first paint.
  var TEXT = 'flossify:text';
  function textSize(percent) {
    var p = Math.round(Number(percent));
    if (!isFinite(p) || p <= 0) return;
    p = Math.max(85, Math.min(135, p));
    if (p > 100) root.setAttribute('data-app-big', ''); else root.removeAttribute('data-app-big');
    if (p === 100) { root.style.removeProperty('--app-text'); root.style.removeProperty('--app-text-field'); }
    else { root.style.setProperty('--app-text', p + '%'); root.style.setProperty('--app-text-field', Math.max(100, p) + '%'); }
    try { sessionStorage.setItem(TEXT, String(p)); } catch (e) { /* no storage */ }
  }
  try { textSize(sessionStorage.getItem(TEXT)); } catch (e) { /* no storage */ }
  native('FlossifyShell', 'textSize').then(function (r) { if (r && r.percent) textSize(r.percent); });

  // Which way this page came in, for the transition: forward, back, or the same page again (a save that redirects back).
  function samePath(a, b) {
    try { return new URL(a, location.href).pathname === new URL(b, location.href).pathname; } catch (e) { return false; }
  }
  var navType = '';
  try {
    var entry = performance.getEntriesByType('navigation')[0];
    navType = entry ? entry.type : '';
  } catch (e) { /* older WebKit */ }
  // The link tapped on the last page says what kind of move this is: a "Back to …" link pops, a main tab crossfades.
  var HINT = 'flossify:nav';
  function hinted() {
    try {
      var h = JSON.parse(sessionStorage.getItem(HINT) || 'null');
      sessionStorage.removeItem(HINT);
      if (h && h.to === location.pathname && Date.now() - h.at < 15000) return h.kind;
    } catch (e) { /* no storage */ }
    return '';
  }
  var hint = hinted();
  root.dataset.nav = navType === 'back_forward' ? 'back' : hint || (document.referrer && samePath(document.referrer, location.href) ? 'same' : 'forward');
  // The bar and the phone's tab row get their names only while a transition is taken and played, one of each at most
  // (two elements with one name would cancel the whole transition), and lose them when it ends.
  // Not My visits' bar (.me-shell): it is clear glass over a clinic's photograph, and a bar taken as its own picture
  // has nothing behind it to blur, so the photograph would show sharp through it until the transition ended. It
  // travels with its page, frost and all, as on the website.
  var CHROME = [['.ws-top:not(.me-shell .ws-top), .site-top', 'app-bar'], ['.ws-tabrow', 'app-tabs']];
  // Only what is on screen on this side holds still. The phone's tab row is not sticky (nor is a public bar without
  // .site-sticky): on a page scrolled down it is above the screen, and named there it would fly down across the bar
  // to its place on the next page. Left unnamed it goes with its own page, and the other side's comes with its page.
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  }
  function nameChrome(on) {
    CHROME.forEach(function (c) {
      var els = document.querySelectorAll(c[0]), first = null;
      for (var i = 0; i < els.length; i++) {
        els[i].style.viewTransitionName = '';
        if (on && !first && shown(els[i]) && inView(els[i])) first = els[i];
      }
      if (first) first.style.viewTransitionName = c[1];
    });
    // The current tab's pill has a name of its own from the layouts (ws-tab-on): off screen it is taken out for the
    // length of the transition, for the same reason as its row.
    var pills = document.querySelectorAll('.ws-tabrow-item[aria-current="page"]');
    for (var j = 0; j < pills.length; j++) pills[j].style.viewTransitionName = on && shown(pills[j]) && !inView(pills[j]) ? 'none' : '';
  }
  // The page being left: named just before WebKit takes its picture. Not under a panel, the drawer or a palette: a
  // named bar is drawn above the page's picture, so it would jump on top of what was covering it. It leaves with the
  // page, and the next page's bar comes in with its page.
  window.addEventListener('pageswap', function (e) { if (e.viewTransition && !layerUp()) nameChrome(true); });
  window.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    if (!vt) return;
    nameChrome(true);
    var unname = function () { nameChrome(false); };
    if (vt.finished && vt.finished.then) vt.finished.then(unname, unname); else setTimeout(unname, 600);
    var nav = window.navigation, act = nav && nav.activation;
    if (act) {
      if (act.navigationType === 'reload') { vt.skipTransition(); return; }
      if (act.navigationType === 'traverse' && act.from && act.entry) {
        root.dataset.nav = act.entry.index < act.from.index ? 'back' : 'forward';
      } else if (act.from && act.from.url && samePath(act.from.url, location.href)) {
        root.dataset.nav = 'same';
      } else {
        root.dataset.nav = hint || 'forward';
      }
    }
  });
  var TAB_LINKS = '.ws-nav a, .ws-tabrow a, .ws-side a.ws-nav-item, .site-nav a, .site-drawer-nav a, [role="tablist"] a, .ws-seg a';
  function kindOf(a) {
    // The Flossify mark goes home (/app/ here, see ready()): a crossfade, not a push from the right.
    if (a.matches('.ws-mark') || a.closest(TAB_LINKS)) return 'tab';
    var words = (a.getAttribute('aria-label') || a.textContent || '').trim();
    if (/^(back\b|←)/i.test(words) || a.getAttribute('rel') === 'prev' || /(^|[\s-])back($|[\s-])/.test(a.className || '')) return 'back';
    return '';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented || a.target === '_blank' || a.hasAttribute('download')) return;
    var kind = kindOf(a);
    if (!kind) return;
    // A "Back to …" link to the very page this one was opened from goes back to it (where the person was on it, and
    // the edge swipe after it does not return here) instead of opening it again on top. Only when the history proves
    // it (the Navigation API, iOS 26.2): otherwise the link is followed as written. Never in a sheet, where the app
    // itself decides what such a link does, and never over typed words.
    if (kind === 'back' && backIsPrevious(a) && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      lastSent = null;
      markLeaving(a, false);
      history.back();
      return;
    }
    try { sessionStorage.setItem(HINT, JSON.stringify({ to: new URL(a.href, location.href).pathname, kind: kind, at: Date.now() })); } catch (err) { /* no storage */ }
  }, true);

  var inSheet = false;
  try { inSheet = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.flossifySheet); } catch (e) { /* not in a sheet */ }
  function backIsPrevious(a) {
    try {
      var nav = window.navigation, cur = nav && nav.currentEntry;
      if (!cur || cur.index < 1 || inSheet || typedWords()) return false;
      var prev = nav.entries()[cur.index - 1], to = new URL(a.href, location.href);
      for (var i = 0; i < SAVED_PARAMS.length; i++) if (to.searchParams.has(SAVED_PARAMS[i])) return false;
      return !!prev && prev.url === to.href && to.origin === location.origin && to.pathname !== location.pathname;
    } catch (err) { return false; }
  }

  /* ---------------------------------------------------------------- a tap that was taken: pressed until the page comes */

  // The app draws a thin line at the top while a page loads (FlossifyShell.swift); this is the part under the finger.
  // A link to another of our pages, or a form sent, stays pressed (data-app-leaving) until the page leaves, comes back
  // from the back-forward cache, or ten seconds pass (a "page" that turned out to be a file leaves nothing).
  // (lastSent: the form last sent from this page, for lineFailed. It outlives the ten seconds, since a line that times
  // out takes a minute to say so, and is forgotten when the page leaves or comes back, or another move starts.)
  var leaving = [], leavingTimer = 0, lastSent = null;
  function clearLeaving() {
    clearTimeout(leavingTimer);
    leaving.forEach(function (el) {
      el.removeAttribute('data-app-leaving');
      if (el.hasAttribute('data-app-busy')) { el.removeAttribute('data-app-busy'); el.removeAttribute('aria-busy'); }
      el.removeAttribute('data-app-sent');
    });
    leaving = [];
  }
  function markLeaving(el, busy) {
    clearLeaving();
    leavingTimer = setTimeout(clearLeaving, 10000);
    if (!el) return;
    el.setAttribute('data-app-leaving', '');
    if (busy && !el.hasAttribute('aria-busy')) { el.setAttribute('aria-busy', 'true'); el.setAttribute('data-app-busy', ''); }
    leaving.push(el);
  }
  var PRESSED = '.btn, .ws-btn, .chip, .slot, .tab, .ws-tool, .app-door, a.card, .ws-nav-item, .ws-tabrow-item, .ws-menu-item, .ws-result, .ws-side-link, .ws-tile-link,' +
    ' .ws-empty-go, .site-link, .site-drawer-link, .entry-way, .pt-clinic-link, .pt-back, .me-clinic, .rail-item, .idx-row, .pts-link, [data-app-press]';
  document.addEventListener('click', function (e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !OWN_HOSTS[url.host]) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // a move within this page
    // Decided once every listener has had its say: a link the page handles itself goes nowhere.
    setTimeout(function () { if (!e.defaultPrevented) { lastSent = null; markLeaving(a.closest(PRESSED) || a, false); } }, 0);
  });
  window.addEventListener('pagehide', function () { lastSent = null; clearLeaving(); });
  window.addEventListener('pageshow', function () { lastSent = null; clearLeaving(); });

  /* ---------------------------------------------------------------- typed words: pull to refresh, leaving */

  // Typed words that a reload would lose: in a form that posts, or in a panel still open (the calendar's panels send
  // with fetch, so their forms do not post).
  // Also the booking's steps (a form the page sends with fetch, find/[clinic]/book.astro): a name, a number or a note
  // written there counts until the booking is made and the form is put away. A choice ticked is not typed words.
  var dirty = false, dirtyPanels = [], dirtyWizards = [];
  var WORDS = 'input:not([type="hidden"], [type="radio"], [type="checkbox"], [type="submit"], [type="button"], [type="file"], [type="password"]), textarea';
  function isPostForm(f) { return !!f && String(f.getAttribute('method') || 'get').toLowerCase() === 'post'; }
  function holdsWords(form) {
    return Array.prototype.some.call(form.querySelectorAll(WORDS), function (f) { return !!f.value.trim(); });
  }
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t) return;
    if (isPostForm(t.form)) dirty = true;
    var panel = t.closest && t.closest('dialog[open]');
    if (panel && dirtyPanels.indexOf(panel) < 0) dirtyPanels.push(panel);
    var wizard = t.matches && t.matches(WORDS) && t.closest('form[data-wizard]');
    if (wizard && !isPostForm(wizard) && dirtyWizards.indexOf(wizard) < 0) dirtyWizards.push(wizard);
  }, true);
  // Sent: only once the page has let the form go (a check of its own can still stop it).
  window.addEventListener('submit', function (e) {
    var f = e.target;
    if (e.defaultPrevented || !f || !f.getAttribute) return;
    if (isPostForm(f) && !f.getAttribute('target')) {
      // A second tap while the first send is on its way would send the form twice: it is dropped. The button keeps its
      // name and value in the post (nothing is disabled); it only reads as busy.
      if (f.hasAttribute('data-app-sent')) { e.preventDefault(); return; }
      var by = e.submitter && e.submitter.form === f ? e.submitter : null;
      // (Marked a moment later, once every listener has had its say: a form the page stops is not on its way.)
      setTimeout(function () {
        if (e.defaultPrevented) return;
        markLeaving(by, true);
        f.setAttribute('data-app-sent', '');
        leaving.push(f);
        lastSent = f;
      }, 0);
    }
    if (isPostForm(f)) { dirty = false; noteSubmit(f); }
  });
  function typedWords() {
    dirtyPanels = dirtyPanels.filter(function (d) { return d.isConnected && d.open; });
    dirtyWizards = dirtyWizards.filter(function (f) { return f.isConnected && shown(f) && holdsWords(f); });
    // A signature drawn on a pad in a form not yet sent (the signing page, the consent forms): its strokes are not in
    // any field a reload would keep.
    var inked = !!document.querySelector('form[method="post" i] :is([data-sg-pad], [data-sp-pad])[data-ink]');
    return dirty || dirtyPanels.length > 0 || dirtyWizards.length > 0 || inked;
  }
  // A page in a sheet tells the app when it holds typed words, so a swipe down asks before it closes.
  var typedTimer = 0;
  function typedChanged() { clearTimeout(typedTimer); typedTimer = setTimeout(function () { syncChrome(); }, 250); }
  document.addEventListener('input', typedChanged, true);
  document.addEventListener('pointerup', typedChanged, true);

  // Where a note or spoken words must sit to be seen and heard: inside the panel on top when one is open (everything
  // outside a modal panel is inert, and under it), else the page.
  function topHost() {
    var open = document.querySelectorAll('dialog[open]:not([data-closing])'); // (not a panel on its way out)
    for (var i = open.length - 1; i >= 0; i--) { try { if (open[i].matches(':modal')) return open[i]; } catch (e) { return open[i]; } }
    return document.body;
  }
  // Words for VoiceOver: a live region is only read when it was in the page before its words, so each host gets its
  // pair (polite, and assertive for a refusal) ahead of time (ready(), and as a panel opens), and the words come later.
  function sayRegion(host, urgent) {
    var name = urgent ? 'assertive' : 'polite';
    var el = host.querySelector(':scope > .app-say[aria-live="' + name + '"]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'app-say';
      el.setAttribute('aria-live', name);
      el.setAttribute('aria-atomic', 'true');
      host.appendChild(el);
      el.bornAt = Date.now();
    }
    return el;
  }
  function prepareSay() { var host = topHost(); if (host) { sayRegion(host, false); sayRegion(host, true); } }
  var sayTimer = 0;
  function say(words, urgent, wait) {
    words = String(words || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!words || !document.body) return;
    var el = sayRegion(topHost(), urgent);
    // Emptied first, so the same sentence a second time is said again; and never in the tick the region was made.
    el.textContent = '';
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = words; }, Math.max(wait || 0, Date.now() - el.bornAt < 400 ? 400 : 80));
  }

  var noteTimer = 0, noteGone = 0;
  function showNote(words, ms) {
    var el = document.querySelector('.app-note');
    if (!el) {
      el = document.createElement('div');
      el.className = 'app-note';
      el.setAttribute('aria-hidden', 'true'); // said by say(): once, not twice
      if (el.showPopover) el.setAttribute('popover', 'manual');
    }
    // Shown again as a popover each time, inside whatever is on top now: it then sits above a panel opened since.
    var host = topHost();
    if (el.parentNode !== host) host.appendChild(el);
    clearTimeout(noteGone);
    if (el.hasAttribute('popover')) {
      try { el.hidePopover(); } catch (e) { /* was not showing */ }
      try { el.showPopover(); } catch (e) { el.removeAttribute('popover'); }
    }
    el.textContent = words;
    requestAnimationFrame(function () { el.setAttribute('data-show', ''); });
    say(words, false);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      el.removeAttribute('data-show');
      noteGone = setTimeout(function () { try { el.hidePopover(); } catch (e) { /* not a popover here */ } }, 240);
    }, ms || 3200);
  }

  /* ---------------------------------------------------------------- print, save, links */

  // The paper the page is drawn for, from its CSS @page size, in points: the print sheet starts on the nearest paper.
  var PAPERS = { A3: [841.89, 1190.55], A4: [595.28, 841.89], A5: [419.53, 595.28], A6: [297.64, 419.53], LETTER: [612, 792], LEGAL: [612, 1008] };
  var TO_PT = { mm: 72 / 25.4, cm: 720 / 25.4, in: 72, pt: 1, px: 0.75 };
  function sizeOf(value) {
    var words = String(value || '').trim().split(/\s+/), base = null, lengths = [], landscape = false;
    words.forEach(function (w) {
      var named = PAPERS[w.toUpperCase()];
      var m = /^([\d.]+)(mm|cm|in|pt|px)$/i.exec(w);
      if (named) base = named.slice();
      else if (m) lengths.push(parseFloat(m[1]) * TO_PT[m[2].toLowerCase()]);
      else if (w.toLowerCase() === 'landscape') landscape = true;
    });
    if (!base && lengths.length) base = [lengths[0], lengths.length > 1 ? lengths[1] : lengths[0]];
    if (base && landscape) base = [base[1], base[0]];
    return base;
  }
  function pagePaper() {
    var found = null;
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.type === 6 && r.style && r.style.getPropertyValue('size')) found = sizeOf(r.style.getPropertyValue('size')) || found;
        else if (r.cssRules && (r.type === 4 ? !r.media || /print|all/.test(r.media.mediaText || 'all') : true)) walk(r.cssRules);
      }
    }
    for (var i = 0; i < document.styleSheets.length; i++) {
      try { walk(document.styleSheets[i].cssRules); } catch (e) { /* another origin's sheet: none here */ }
    }
    return found;
  }
  window.print = function () {
    // Pages measure themselves on beforeprint (the receipt's length) and log the print (the record): first.
    window.dispatchEvent(new Event('beforeprint'));
    var paper = pagePaper();
    var options = { jobName: document.title || 'Flossify' };
    if (paper) { options.paperWidth = paper[0]; options.paperHeight = paper[1]; }
    return native('FlossifyShell', 'print', options).then(function () {
      window.dispatchEvent(new Event('afterprint'));
    });
  };
  window.flossifyPagePaper = pagePaper;

  function filenameFrom(disposition) {
    if (!disposition) return '';
    var star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition);
    if (star) { try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch (e) { /* fall through */ } }
    var plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
    return plain ? plain[1].trim() : '';
  }
  function base64Of(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { var s = String(reader.result); resolve(s.slice(s.indexOf(',') + 1)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }
  function saveUrl(href, name) {
    var type = '';
    return fetch(href, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('status ' + res.status);
      name = name || filenameFrom(res.headers.get('content-disposition'));
      if (!name) { try { name = decodeURIComponent(new URL(href, location.href).pathname.split('/').filter(Boolean).pop() || ''); } catch (e) { name = ''; } }
      return res.blob();
    }).then(function (blob) {
      type = blob.type;
      return base64Of(blob);
    }).then(function (data) {
      // Only a file the page drew itself (the QR poster, a blob: or data: link) may be offered to Photos; a file from the
      // server (a patient's X-ray) never is.
      return native('FlossifyShell', 'saveFile', { data: data, filename: name || 'Flossify file', mimeType: type, madeByPage: /^(blob|data):/i.test(href) });
    }).catch(function () { haptic.error(); showNote(NO_FILE, 5000); });
  }
  var NO_FILE = 'That file could not be downloaded. Check your connection and try again.';
  // A page or a form that could not go (lineFailed, below). Nothing claims a save: only the server knows.
  // The first sentence says why, and "No connection" only when the phone itself has no line: with a line, it was
  // Flossify that could not be reached, or did not answer.
  var LINE_NONE = 'No connection.', LINE_DROPPED = 'The connection dropped.';
  var LINE_UNREACHED = 'Flossify could not be reached.', LINE_SILENT = 'Flossify did not answer.';
  var LINE_NO_PAGE = 'That page could not open: try again in a moment.';
  var LINE_NOT_SENT = 'Nothing was sent: what you typed is still here.';
  var LINE_MAYBE = 'This may not have been saved: check before you send it again.';

  function hostOf(url) { return url.host; }
  /** Returns true when the app handled the link itself. */
  function handleAnchor(a, e) {
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    if (a.hasAttribute('download')) {
      if (e) e.preventDefault();
      saveUrl(a.href, a.getAttribute('download'));
      return true;
    }
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return false; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false; // tel:, mailto:, sms: go to iOS
    if (!OWN_HOSTS[hostOf(url)]) {
      if (e) e.preventDefault();
      // Directions to a clinic with no map link of its own (find/_ui/ClinicPage.astro): the address goes to the Maps
      // app, where a web map inside the app could not start a route. Another website's address is not ours to load, so
      // the app hands it to iOS, which opens Maps.
      var place = a.getAttribute('data-app-map');
      if (place) { location.href = 'https://maps.apple.com/?daddr=' + encodeURIComponent(place); return true; }
      native('Browser', 'open', { url: url.href, presentationStyle: 'popover' });
      return true;
    }
    // Our own page in a new tab: WebKit asks the app for a new window, and the app shows it in a sheet over this page.
    return false;
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) handleAnchor(a, e);
  });
  // A download a script starts with a link it never puts in the page (a.click() on a detached <a download>).
  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.isConnected && handleAnchor(this, null)) return;
    return anchorClick.call(this);
  };
  var openWindow = window.open;
  window.open = function (href) {
    if (href) {
      try {
        var url = new URL(href, location.href);
        if (url.protocol === 'blob:' || url.protocol === 'data:') { saveUrl(url.href, ''); return null; }
        if (!OWN_HOSTS[url.host]) { native('Browser', 'open', { url: url.href, presentationStyle: 'popover' }); return null; }
      } catch (e) { /* not a URL: let WebKit decide */ }
    }
    return openWindow.apply(window, arguments);
  };

  /* ---------------------------------------------------------------- what the person did */

  // Haptics answer the person: an API's answer or a fold opening is felt only within a moment of a touch, a key or a
  // send, never for the page's own background work (the chart's queue retrying every 30 s, a fold a script opens).
  var lastGesture = 0;
  function gestured(ms) { return Date.now() - lastGesture < (ms || 1500); }
  document.addEventListener('pointerup', function () { lastGesture = Date.now(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') lastGesture = Date.now(); }, true);
  document.addEventListener('submit', function () { lastGesture = Date.now(); }, true);

  // A form that posts and lands on a page with no word of its own (a task ticked, Close the day, a thank-you): the
  // next page, if it comes within moments and draws no refusal, is felt as saved.
  var POSTED = 'flossify:posted';
  // Any form sent, a save or not (SENT): when its answer is a refusal drawn in place, the page holds the answers again.
  var SENT = 'flossify:sent';
  function noteSubmit(form) {
    var action;
    try { action = new URL(form.getAttribute('action') || location.href, location.href); } catch (e) { return; }
    // Not a save: signing in or out (staff, and a patient at /me/), and the steps of the forms on a patient's device
    // (each lands on the same page).
    var door = /^\/auth\//.test(action.pathname) || /\/sign-in\/?$/.test(action.pathname) || /^\/me\/(logout|code)\/?$/.test(action.pathname);
    try { if (!door) sessionStorage.setItem(SENT, String(Date.now())); } catch (e) { /* no storage */ }
    if (door || /^\/f\/[it]\//.test(location.pathname)) return;
    try { sessionStorage.setItem(POSTED, String(Date.now())); } catch (e) { /* no storage */ }
  }
  function justNow(key) {
    try {
      var at = Number(sessionStorage.getItem(key) || 0);
      sessionStorage.removeItem(key);
      return Date.now() - at < 15000;
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------- feedback from the API's answers */

  var pageFetch = window.fetch;
  window.fetch = function (input, init) {
    var promise = pageFetch.apply(this, arguments);
    try {
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
      // A failed line (offline, a timeout) is not a refusal: the page says what waits. Only answers count, and only to
      // something the person just did.
      if (method !== 'GET' && method !== 'HEAD' && OWN_HOSTS[url.host] && url.pathname.indexOf('/api/') === 0 && gestured()) {
        promise.then(function (res) { answered(url.pathname, method, res); }, noop);
      }
    } catch (e) { /* the page's own request goes on untouched */ }
    return promise;
  };
  function answered(path, method, res) {
    var s = res.status;
    if (s >= 200 && s < 300) {
      // The chart was felt as the finding was picked (it works offline too); a colleague's newer finding kept over it
      // is said by the chart's notice, a warning (watchAlerts).
      if (path === '/api/chart') return;
      if (haptic.recentPattern()) return; // the page already gave this moment its own feel (a drop, a booking)
      if (path === '/api/schedule' && Date.now() - dropAt < 4000) return; // the drop that asked for it was felt
      if (path === '/api/bookings' && method === 'POST') { haptic.pattern('confirm'); return; }
      haptic.success();
      return;
    }
    // Not a refusal: too many at once, a timeout, the chart renumbering its own changes.
    if (s === 408 || s === 429 || s >= 500) return;
    if (s === 409) {
      // A soft stop asks first (blocked time, a consent form not agreed): a warning. A clash is a refusal.
      res.clone().json().then(function (body) {
        if (body && body.code === 'resequence') return;
        if (body && (body.blocked || body.consent)) haptic.warning();
        else haptic.pattern('refuse');
      }, function () { haptic.pattern('refuse'); });
      return;
    }
    if (s >= 400) haptic.error();
  }

  /* ---------------------------------------------------------------- the page as it arrives, and as it changes */

  function shown(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)) && !el.closest('[hidden], [aria-hidden="true"]');
  }
  // A record's allergies and conditions stand at its head as an alert for the screen reader, but they are not a refusal:
  // they never buzz (and are never hidden: the page draws them, this only stays quiet about them).
  var STANDING = '.rec-alerts';
  function refusals() {
    return Array.prototype.filter.call(document.querySelectorAll('[role="alert"]'), function (el) {
      return !el.matches(STANDING) && shown(el) && el.textContent.trim();
    });
  }
  function toneOf(el) {
    // A colleague's chart change kept over this device's (the chart's notice) is a heads-up, not a refusal.
    if (el.matches('[data-sync-notice-list], .entry-note-warn')) return 'warn';
    var t = el.getAttribute('data-tone') || (el.closest('[data-tone]') && el.closest('[data-tone]').getAttribute('data-tone')) || '';
    return t;
  }
  // What a page's address says when it comes back from a save. (Not ?paid=: PayMongo sends the person back before the
  // payment is confirmed.)
  var SAVED_PARAMS = ['saved', 'done', 'sent', 'added', 'booked', 'signed', 'used', 'closed', 'welcome', 'made', 'explained', 'renewed'];
  var CONFIRMED_PARAMS = ['booked', 'signed', 'welcome'];
  // What is felt on arrival is also said, with the page's own words: VoiceOver reads a refusal or a notice that changes,
  // not one the page arrived with. After the page's own reading has begun, and never anything the page did not draw.
  function sayDrawn(el, urgent) { if (el) say(el.textContent, urgent, 700); }
  function drawnStatus(tone) {
    var all = document.querySelectorAll('[role="status"][data-tone="' + tone + '"]');
    for (var i = 0; i < all.length; i++) if (shown(all[i]) && all[i].textContent.trim()) return all[i];
    return null;
  }
  function onArrive() {
    var posted = justNow(POSTED), sent = justNow(SENT);
    if (navType === 'back_forward' || navType === 'reload') return;
    // Only a post answered with a redirect landed (a refusal is drawn in place, a server fault is a blank page).
    var redirected = false;
    try { var e = performance.getEntriesByType('navigation')[0]; redirected = !!e && e.redirectCount > 0; } catch (err) { /* older WebKit */ }
    var alerts = refusals();
    if (alerts.length) {
      var warnOnly = alerts.every(function (el) { return toneOf(el) === 'warn'; });
      if (warnOnly) haptic.warning(); else haptic.error();
      sayDrawn(alerts[0], !warnOnly);
      // A form the server refused and drew again with the answers in it: they are typed words, though no key has been
      // pressed on this page (a pull to refresh would fetch the page afresh, without them).
      if (sent && !redirected && Array.prototype.some.call(document.querySelectorAll('form[method="post" i]'), function (f) { return shown(f) && holdsWords(f); })) dirty = true;
      return;
    }
    var q = new URLSearchParams(arrivedSearch);
    // Came back, but nothing changed: "Nothing was saved", the same words as before.
    if (q.get('saved') === 'nothing' || /^(same|bio-same)$/.test(q.get('done') || '')) return;
    // Saved, but not all of it: the chart was not updated after a treatment, a text that could not be sent.
    var warned = Array.prototype.some.call(document.querySelectorAll('[role="status"][data-tone="warn"], [role="note"][data-tone="warn"]'), shown);
    if (q.has('chartskip') || q.has('missed') || warned) { haptic.warning(); sayDrawn(drawnStatus('warn'), false); return; }
    // A post answered in place with the server's own notice of success (My visits: visit confirmed, visit cancelled).
    if (posted && drawnStatus('success')) { haptic.success(); sayDrawn(drawnStatus('success'), false); return; }
    for (var i = 0; i < SAVED_PARAMS.length; i++) {
      if (q.has(SAVED_PARAMS[i])) {
        if (CONFIRMED_PARAMS.indexOf(SAVED_PARAMS[i]) >= 0) haptic.pattern('confirm'); else haptic.success();
        sayDrawn(drawnStatus('success'), false);
        return;
      }
    }
    if (posted && redirected) { haptic.success(); sayDrawn(drawnStatus('success'), false); }
  }
  // A refusal a script draws after the page arrived (a form checked in the page, a 409 said in a panel).
  var seen = new WeakMap();
  function watchAlerts() {
    // What the page arrived with was felt on arrival (onArrive): only what changes after counts.
    refusals().forEach(function (el) { seen.set(el, el.textContent.trim()); });
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (dragging) return; // the calendar redraws every frame of a drag; nothing is refused until it is let go
        var els = document.querySelectorAll('[role="alert"]');
        for (var i = 0; i < els.length; i++) {
          var el = els[i], text = el.textContent.trim();
          if (el.matches(STANDING)) continue;
          // Emptied or hidden itself: the next words are new. Only out of sight (its panel closed): still the same words.
          if (!text || el.closest('[hidden]')) { seen.delete(el); continue; }
          if (!shown(el) || seen.get(el) === text) continue;
          seen.set(el, text);
          if (toneOf(el) === 'warn') haptic.warning(); else haptic.error();
        }
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden', 'open'] });
  }

  // Choices tick; the main button taps; panels and folds open with a soft tap.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('input[type="radio"], input[type="checkbox"], select')) haptic.select();
  }, true);
  var CHOICES = '[role="tab"], .ws-seg a, .ws-seg button, button[aria-pressed], [role="switch"], [data-cal-step], [data-theme-toggle]';
  var lastPointer = '';
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t || !e.isTrusted) return;
    // A finding picked on the chart: felt as it is picked, so it is felt offline too (the change waits on this phone).
    if (t.closest('[data-palette] [data-condition]')) { haptic.tap('rigid', 0.55); return; }
    if (t.closest(CHOICES)) { haptic.select(); return; }
    // The main button taps as it is pressed (not as a finger lands on it to scroll); a red one a little firmer.
    if (lastPointer !== 'touch') return;
    var b = t.closest('.btn-primary, .ws-btn-primary, .ws-btn-danger');
    if (!b || b.matches(':disabled, [aria-disabled="true"]')) return;
    haptic.tap(b.classList.contains('ws-btn-danger') ? 'medium' : 'light');
  }, true);
  var prepared = false;
  document.addEventListener('pointerdown', function (e) {
    lastPointer = e.pointerType;
    if (!prepared) { prepared = true; native('FlossifyShell', 'prepare'); }
  }, { capture: true, passive: true });
  // WebKit draws :active (the press above) under a finger only when a touch listener is on the page.
  document.addEventListener('touchstart', noop, { passive: true });
  document.addEventListener('toggle', function (e) {
    var t = e.target;
    // Only a fold or popover the person opened: not one drawn open, or opened by the page's own script.
    if (!t || !t.tagName) return;
    // (A fold closed loses its mark, so it cannot settle in again when the page opens it later.)
    if (t.tagName === 'DETAILS' && !t.open) t.removeAttribute('data-app-opened');
    if (!gestured(800)) return;
    if (t.tagName === 'DETAILS' && t.open) haptic.tap('soft', 0.7);
    // A popover (the chart's palette over a tooth) opening under the finger. Not the app's own note: nobody opened
    // it, and what it is about has its own haptic.
    else if (e.newState === 'open' && t.hasAttribute('popover') && !t.classList.contains('app-note')) haptic.tap('soft', 0.6);
  }, true);
  // The fold is marked as the person taps its summary, before it opens: the toggle event comes a moment after the fold
  // is already drawn, and marked there its content showed whole for a frame, then blinked out and faded in.
  document.addEventListener('click', function (e) {
    var s = e.isTrusted && e.target && e.target.closest ? e.target.closest('summary') : null, d = s && s.parentNode;
    if (!d || d.tagName !== 'DETAILS' || d.open) return;
    d.setAttribute('data-app-opened', '');
    // (A tap that did not open it, a link inside the summary or a page that stopped it: no mark left behind.)
    setTimeout(function () { if (!d.open) d.removeAttribute('data-app-opened'); }, 0);
  }, true);
  document.addEventListener('animationend', function (e) {
    if (e.animationName === 'app-fold-in' && e.target.parentNode && e.target.parentNode.removeAttribute) e.target.parentNode.removeAttribute('data-app-opened');
    if (e.animationName === 'app-step-in') e.target.removeAttribute('data-app-in');
  }, true);
  // The line goes: felt once, while the page is in front, and said once in a note under the clock (an iPad has no
  // haptics, and most pages draw nothing). Not where the page says it itself: the chart, a kept copy of a record, the
  // offline page. The line back is said, not felt: nobody did anything.
  var saidOffline = false;
  function offlineNote() {
    if (saidOffline || !document.body || root.hasAttribute('data-offline-copy') || document.querySelector('[data-odontogram], #offline-title')) return;
    saidOffline = true;
    showNote('No connection. What is on screen may be out of date.', 5000);
  }
  window.addEventListener('offline', function () {
    if (document.visibilityState !== 'visible') return;
    haptic.warning();
    offlineNote();
  });
  window.addEventListener('online', function () {
    if (!saidOffline) return;
    saidOffline = false;
    if (document.visibilityState === 'visible') showNote('Connection is back.', 2000);
  });

  // The calendar's drag (src/components/ws/cal/board.ts), felt without the calendar knowing: the card lifts as the drag
  // starts (body.is-dragging), ticks each time it crosses to another quarter hour (the ghost's time changes), and settles
  // when it is let go. The server's answer then adds only a refusal (a clash, blocked time); a move it takes was felt.
  var dragging = false, dropAt = 0;
  function watchDrag() {
    var ghostWatch = null;
    new MutationObserver(function () {
      var now = document.body.classList.contains('is-dragging');
      if (now === dragging) return;
      dragging = now;
      if (now) {
        haptic.pattern('lift');
        var ghost = document.querySelector('.cal-ghost');
        if (ghost) {
          ghostWatch = new MutationObserver(function () { haptic.select(); });
          ghostWatch.observe(ghost, { subtree: true, childList: true, characterData: true });
        }
      } else {
        if (ghostWatch) { ghostWatch.disconnect(); ghostWatch = null; }
        haptic.pattern('drop');
        dropAt = Date.now();
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  // A panel opening is felt once: not again when the finger already felt the button that opened it, and not when the
  // server drew it open after a refusal (the error says that moment).
  document.addEventListener('ws:panel-open', function (e) {
    if ((e.detail && e.detail.auto) || Date.now() - last.tap < 400) return;
    haptic.tap('soft');
  }, true);

  /* ---------------------------------------------------------------- the status bar, the colour behind the page, swipe back */

  function rgbOf(value) {
    var m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/.exec(value || '');
    if (!m) return null;
    var a = m[4] === undefined ? 1 : (m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a: a };
  }
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() {
    var chosen = root.getAttribute('data-theme');
    return chosen ? chosen === 'dark' : !!(darkQuery && darkQuery.matches);
  }
  // The page's own ground (the body's, else the root's), else the soft template's for the theme.
  function pageColour(dark) {
    var picks = [document.body, root];
    for (var i = 0; i < picks.length; i++) {
      var c = picks[i] && rgbOf(getComputedStyle(picks[i]).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return dark ? { r: 21, g: 25, b: 30, a: 1 } : { r: 243, g: 245, b: 248, a: 1 };
  }
  function hex(c) {
    return '#' + [c.r, c.g, c.b].map(function (n) { return ('0' + Math.max(0, Math.min(255, n)).toString(16)).slice(-2); }).join('');
  }
  // The edge swipe goes back, except over something drawn on top of the page (a panel, the drawer, a consent turned to
  // the patient): there a sideways drag belongs to it. The shell also never swipes back out of a sign-in page or a page
  // a patient holds (FlossifyShell.swift, guarded()).
  function layerUp() {
    if (document.querySelector('dialog[open], .ws-side[data-open], [data-facing]')) return true;
    try { if (document.querySelector('[popover]:popover-open:not(.app-note)')) return true; } catch (e) { /* no popovers here */ }
    return false;
  }
  // Nor out of a booking part-way through its steps: there the page's own Back goes one step back, and a swipe would
  // leave with the reason, the dentist and the time chosen.
  function midBooking() {
    var w = document.querySelector('.cl-book form[data-wizard]:not([hidden])');
    var first = w && w.querySelector('.wiz[data-step]');
    return !!first && first.hidden;
  }
  function swipeOk() { return !layerUp() && !midBooking(); }
  var chromeWas = '';
  function syncChrome() {
    var dark = isDark();
    var ground = pageColour(dark);
    // The frosted band under the clock (body::before, on a page with no sticky bar) takes the page's own ground.
    root.style.setProperty('--app-band', 'rgba(' + ground.r + ', ' + ground.g + ', ' + ground.b + ', 0.86)');
    // theme: the person's own choice ('light', 'dark'), or '' when the page follows the device.
    // overlay: something is drawn over the page (a panel, the drawer, the chart's palette): no pull to refresh under it.
    var state = { dark: dark, theme: root.getAttribute('data-theme') || '', color: hex(ground), swipeBack: swipeOk(), overlay: layerUp(), typed: typedWords() };
    var key = JSON.stringify(state);
    if (key === chromeWas) return;
    chromeWas = key;
    native('FlossifyShell', 'setChrome', state);
  }
  new MutationObserver(syncChrome).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', syncChrome);
  function watchLayers() {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; syncChrome(); prepareSay(); });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'data-open', 'data-facing'] });
    // The booking's steps: the swipe is held from the second step on, and the step that comes in rises into place
    // (data-app-in; the first one, drawn on arrival, came with the page).
    var wizard = document.querySelector('.cl-book form[data-wizard]');
    if (wizard) {
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          if (m.target.matches('.wiz[data-step]') && !m.target.hidden) m.target.setAttribute('data-app-in', '');
        });
        syncChrome();
      }).observe(wizard, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
    // The chart's palette is a popover: it says so with its toggle event, not an attribute.
    document.addEventListener('toggle', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('popover')) syncChrome(); }, true);
  }
  // A page restored from the back-forward cache: the app reset what it knew at the commit, so say it all again.
  window.addEventListener('pageshow', function (e) { if (e.persisted) { chromeWas = ''; nameChrome(false); syncChrome(); } });

  /* ---------------------------------------------------------------- start */

  window.flossifyApp = {
    haptic: haptic,
    canRefresh: function () { return !typedWords(); },
    refreshRefused: function () { showNote('Not refreshed: what you typed here is not saved yet.', 5000); },
    markDirty: function (on) { dirty = on !== false; },
    /* The app's side calls these (FlossifyShell.swift): iOS's Larger Text as a percentage, and a download it started
       that failed (the app buzzes; the page says why nothing came). */
    textSize: textSize,
    downloadFailed: function () { showNote(NO_FILE, 5000); },
    /* The next page could not start loading (the line dropped as a link was tapped or a form was sent). The app keeps
       this page, alive and with what was typed on it, only because this function exists (FlossifyShell.swift,
       lineFailed); without it the offline page would take its place. `sent` is false when nothing can have reached the
       server, 'maybe' when the line dropped part-way: a form may then have been saved, so the words say to check
       before sending again. The app plays nothing for the main page, so the warning is felt from here. */
    lineFailed: function (sent) {
      // The form that was sent, remembered apart from its pressed look: that is let go after ten seconds, and a line
      // that times out says so much later.
      var form = lastSent && lastSent.isConnected ? lastSent : null;
      lastSent = null;
      clearLeaving();
      // The form is still on screen with its words: they count as typed again, so a pull or a swipe will not lose them,
      // and it can be sent again.
      if (form) {
        form.removeAttribute('data-app-sent');
        if (holdsWords(form)) dirty = true;
      }
      haptic.warning();
      // The cause is said only as far as it is known: the phone has no line, or it has one and Flossify did not answer.
      var offline = navigator.onLine === false, maybe = sent === 'maybe';
      var why = offline ? (form && maybe ? LINE_DROPPED : LINE_NONE) : (maybe ? LINE_SILENT : LINE_UNREACHED);
      showNote(why + ' ' + (form ? (maybe ? LINE_MAYBE : LINE_NOT_SENT) : LINE_NO_PAGE), 6000);
      syncChrome();
    },
    /* A tap on the status bar scrolls the page to its top by itself; iOS cannot reach a panel, the drawer or the
       chart's palette drawn over the page, so the app asks (FlossifyShell.swift) and whatever is on top scrolls. */
    scrollTop: function () {
      var tops = document.querySelectorAll('dialog[open] .ws-panel-inner, dialog[open] .site-drawer-inner, .ws-side[data-open], [data-palette]:popover-open');
      var top = tops.length ? tops[tops.length - 1] : null;
      if (!top) return false;
      try { top.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { top.scrollTop = 0; }
      return true;
    },
  };

  // The chart's palette is placed by its own script no higher than 8 px from the top of the screen: in the app that is
  // under the clock, so it is moved down to 8 px below the status bar.
  function clampPalettes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-palette]'), function (pal) {
      new MutationObserver(function () {
        var min = (parseFloat(getComputedStyle(pal).scrollMarginTop) || 0) + 8;
        var top = parseFloat(pal.style.top);
        if (!isNaN(top) && top < min) pal.style.top = min + 'px';
      }).observe(pal, { attributes: true, attributeFilter: ['style'] });
    });
  }

  // A finger has no hover, but WebKit leaves :hover on the last thing tapped until something else is tapped: a chip, a
  // time slot or a tooth keeps its hover look as if chosen, an arrow stays nudged. The website's hover rules are put
  // behind @media (hover: hover), here in the app only and in the page's own style sheets as loaded: a finger-driven
  // iPhone or iPad no longer matches them, a trackpad or mouse on an iPad still does, and the press feedback above is
  // what a finger gets. Rules already behind a hover query (Tailwind's) and any :not(:hover) are left alone; each rule
  // keeps its place, so the cascade is unchanged. Costs one walk of the style sheets per page.
  var tamed = typeof WeakSet === 'function' ? new WeakSet() : null;
  var HOVER = /(^|[^\\]):hover(?![\w-])/;
  function selectors(text) {
    var out = [], depth = 0, from = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\\') i++;
      else if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) { out.push(text.slice(from, i).trim()); from = i + 1; }
    }
    out.push(text.slice(from).trim());
    return out;
  }
  function tameRules(parent) {
    var rules;
    try { rules = parent.cssRules; } catch (e) { return; }
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (typeof r.selectorText === 'string' && r.style) {
        if (!HOVER.test(r.selectorText) || /:not\([^)]*:hover/.test(r.selectorText)) continue;
        var hover = [], rest = [];
        selectors(r.selectorText).forEach(function (one) { (HOVER.test(one) ? hover : rest).push(one); });
        var text = r.cssText, body = text.slice(text.indexOf('{'));
        try {
          if (rest.length) {
            // ".door:hover, .door:focus-within": the focus half stays as it is, the hover half follows it.
            parent.insertRule('@media (hover: hover) { ' + hover.join(', ') + ' ' + body + ' }', i + 1);
            r.selectorText = rest.join(', ');
            i++;
          } else {
            parent.insertRule('@media (hover: hover) { ' + text + ' }', i + 1);
            parent.deleteRule(i);
          }
        } catch (e) { /* a rule WebKit will not take back: left as it was */ }
      } else if (r.cssRules && !(r.media && /hover/.test(r.media.mediaText || ''))) {
        tameRules(r);
      }
    }
  }
  function tameHover() {
    if (!tamed) return;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sheet = document.styleSheets[i];
      if (tamed.has(sheet) || (sheet.ownerNode && sheet.ownerNode.hasAttribute && sheet.ownerNode.hasAttribute('data-app-shell'))) continue;
      tamed.add(sheet);
      tameRules(sheet);
    }
  }

  // How much of the screen the keyboard covers, for a panel's last field (--app-kb). The visual viewport shrinks for
  // the keyboard and nothing else does; a pinch zoom shrinks it too, and is not a keyboard.
  function watchKeyboard() {
    var vv = window.visualViewport, was = 0;
    if (!vv) return;
    var measure = function () {
      var kb = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      if (kb < 80) kb = 0;
      if (kb === was) return;
      was = kb;
      if (kb) root.style.setProperty('--app-kb', kb + 'px'); else root.style.removeProperty('--app-kb');
    };
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
  }

  // Return on the booking's Who step (find/[clinic]/book.astro sends every Return to Continue): with a later field of
  // the step still empty, Return goes to that field, as Next does on a keyboard, instead of an error about a field the
  // person has not reached yet; with only the consent box left, it goes to the box.
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key !== 'Enter' || e.isComposing || !t || !t.matches || !t.matches('input[type="text"], input[type="tel"], input:not([type])')) return;
    var step = t.closest('.cl-book form[data-wizard] .wiz[data-step="who"]');
    if (!step || !t.value.trim()) return;
    var form = t.form, next = null;
    var name = form.elements.namedItem('name'), phone = form.elements.namedItem('phone'), other = form.elements.namedItem('patientName'), consent = form.elements.namedItem('consent');
    if (name && !name.value.trim()) next = name;
    else if (phone && !phone.value.trim()) next = phone;
    else if (other && shown(other) && !other.value.trim()) next = other;
    else if (consent && !consent.checked && phone && phone.checkValidity()) next = consent;
    if (!next || next === t) return;
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  }, true);

  function ready() {
    // Home, in the app, is where the app starts (/app/: My visits or the Dashboard for someone signed in, else the two
    // doors), not the website's home page and its film. The workspace's own mark already goes to the Dashboard.
    Array.prototype.forEach.call(document.querySelectorAll('a.ws-mark[href="/"]'), function (a) { a.setAttribute('href', '/app/'); });
    tameHover();
    window.addEventListener('load', tameHover);
    clampPalettes();
    prepareSay();
    syncChrome();
    watchLayers();
    watchDrag();
    watchKeyboard();
    // A cold start: the launch screen still covers the page, and under it the start page's lines (and the staff
    // entrance's card) have mostly risen already. They start again as the app is told to lift the cover, so the rise is
    // seen. Nothing is held back: if the answer never comes, the page is as it is today.
    var cold = history.length <= 1 && !document.referrer && navType !== 'reload' && navType !== 'back_forward';
    // the page has drawn itself: the app's launch screen goes (FlossifyShell.swift)
    native('FlossifyShell', 'ready').then(function () {
      if (!cold || !document.getAnimations) return;
      document.getAnimations().forEach(function (a) {
        if (a.animationName === 'app-rise' || a.animationName === 'entrance-rise') { try { a.currentTime = 0; } catch (e) { /* gone */ } }
      });
    });
    onArrive();
    watchAlerts();
    syncChrome(); // a refused form drawn again counts as typed words (onArrive)
    if (navigator.onLine === false) offlineNote();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
