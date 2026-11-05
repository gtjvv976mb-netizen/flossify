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
 *   page), and buttons and cards that give under the finger. Always on, as on the website (the owner's rule).
 * - What a web view lacks: print() opens iOS's print sheet on the paper the page is drawn for (its CSS @page size); a
 *   download (a[download], a blob or data: link the page made) is saved and offered in the share sheet (an .ics opens in
 *   iOS's calendar preview); a link to another website opens in an in-app Safari view. A link meant for a new tab opens in
 *   a native sheet over the page (FlossifyShell.swift, PageSheetController), so what is typed underneath stays.
 * - Pull to refresh (native) asks window.flossifyApp.canRefresh() first: not while a form holds typed words.
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
    'html[data-app] { -webkit-tap-highlight-color: transparent; --app-vt-shadow: rgba(16, 24, 40, 0.14); }',
    '@media (prefers-color-scheme: dark) { html[data-app]:not([data-theme="light"]) { --app-vt-shadow: rgba(0, 0, 0, 0.45); } }',
    'html[data-app][data-theme="dark"] { --app-vt-shadow: rgba(0, 0, 0, 0.45); }',
    'html[data-app] :is(a, button, summary, label, [role="button"], img) { -webkit-touch-callout: none; }',
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
    'html[data-app]:is([data-nav="same"], [data-nav="tab"])::view-transition-old(root) { animation: 160ms ease both app-fade-out; }',
    'html[data-app]:is([data-nav="same"], [data-nav="tab"])::view-transition-new(root) { animation: 220ms ease both app-fade-in; }',
    '@keyframes app-in-right { from { transform: translateX(100%); } }',
    '@keyframes app-out-left { to { transform: translateX(-30%); filter: brightness(0.94); } }',
    '@keyframes app-out-right { to { transform: translateX(100%); } }',
    '@keyframes app-in-left { from { transform: translateX(-30%); filter: brightness(0.94); } }',
    '@keyframes app-fade-out { to { opacity: 0; } }',
    '@keyframes app-fade-in { from { opacity: 0; } }',
    /* Buttons, chips, segments and cards give under the finger and spring back. */
    'html[data-app] :is(.btn, .ws-btn, .chip, .ws-seg a, .ws-seg button, .app-door, a.card, [data-app-press]) {' +
      ' transition-property: scale, background-color, border-color, color, box-shadow, opacity;' +
      ' transition-duration: 300ms, 150ms, 150ms, 150ms, 150ms, 150ms;' +
      ' transition-timing-function: cubic-bezier(0.3, 0.7, 0.4, 1.5), ease, ease, ease, ease, ease; }',
    'html[data-app] :is(.btn, .ws-btn, .chip, .ws-seg a, .ws-seg button, [data-app-press]):active:not(:disabled) { scale: 0.96; transition-duration: 80ms, 150ms, 150ms, 150ms, 150ms, 150ms; }',
    'html[data-app] :is(.app-door, a.card):active { scale: 0.985; transition-duration: 90ms, 150ms, 150ms, 150ms, 150ms, 150ms; }',
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
        ' html[data-app] .ws-panel-head { padding-top: calc(0.625rem + var(--app-top)); }' +
        ' html[data-app] .ws-panel-body { padding-bottom: calc(2rem + var(--app-bottom)); }' +
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
    ' }',
    '@media print { .app-note { display: none !important; } }',
    /* The note pull to refresh leaves when it will not reload a page with typed words (below the status bar). */
    '.app-note { position: fixed; z-index: 2147483000; left: 50%; top: calc(env(safe-area-inset-top) + 10px); translate: -50% -8px; opacity: 0;' +
      ' max-width: min(92vw, 26rem); padding: 10px 16px; border-radius: 999px; font: 500 15px/1.35 Inter, -apple-system, system-ui, sans-serif;' +
      ' background: #1f2937; color: #fff; box-shadow: 0 8px 24px rgba(16, 24, 40, 0.18); text-align: center;' +
      ' transition: opacity 220ms ease, translate 420ms cubic-bezier(0.3, 0.7, 0.4, 1.3); pointer-events: none; }',
    '.app-note[data-show] { opacity: 1; translate: -50% 0; }',
    '@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) .app-note { background: #e7ebf0; color: #15191e; } }',
    'html[data-theme="dark"] .app-note { background: #e7ebf0; color: #15191e; }',
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-app-shell', '');
  style.textContent = css;
  (document.head || root).appendChild(style);

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
  window.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    if (!vt) return;
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
    if (a.closest(TAB_LINKS)) return 'tab';
    var words = (a.getAttribute('aria-label') || a.textContent || '').trim();
    if (/^(back\b|←)/i.test(words) || a.getAttribute('rel') === 'prev' || /(^|[\s-])back($|[\s-])/.test(a.className || '')) return 'back';
    return '';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented || a.target === '_blank' || a.hasAttribute('download')) return;
    var kind = kindOf(a);
    if (!kind) return;
    try { sessionStorage.setItem(HINT, JSON.stringify({ to: new URL(a.href, location.href).pathname, kind: kind, at: Date.now() })); } catch (err) { /* no storage */ }
  }, true);

  /* ---------------------------------------------------------------- typed words: pull to refresh, leaving */

  // Typed words that a reload would lose: in a form that posts, or in a panel still open (the calendar's panels send
  // with fetch, so their forms do not post).
  var dirty = false, dirtyPanels = [];
  function isPostForm(f) { return !!f && String(f.getAttribute('method') || 'get').toLowerCase() === 'post'; }
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t) return;
    if (isPostForm(t.form)) dirty = true;
    var panel = t.closest && t.closest('dialog[open]');
    if (panel && dirtyPanels.indexOf(panel) < 0) dirtyPanels.push(panel);
  }, true);
  // Sent: only once the page has let the form go (a check of its own can still stop it).
  window.addEventListener('submit', function (e) {
    if (!e.defaultPrevented && isPostForm(e.target)) { dirty = false; noteSubmit(e.target); }
  });
  function typedWords() {
    dirtyPanels = dirtyPanels.filter(function (d) { return d.isConnected && d.open; });
    // A signature drawn on a pad in a form not yet sent (the signing page, the consent forms): its strokes are not in
    // any field a reload would keep.
    var inked = !!document.querySelector('form[method="post" i] :is([data-sg-pad], [data-sp-pad])[data-ink]');
    return dirty || dirtyPanels.length > 0 || inked;
  }
  // A page in a sheet tells the app when it holds typed words, so a swipe down asks before it closes.
  var typedTimer = 0;
  function typedChanged() { clearTimeout(typedTimer); typedTimer = setTimeout(function () { syncChrome(); }, 250); }
  document.addEventListener('input', typedChanged, true);
  document.addEventListener('pointerup', typedChanged, true);

  var noteTimer = 0;
  function showNote(words) {
    var el = document.querySelector('.app-note');
    if (!el) {
      el = document.createElement('div');
      el.className = 'app-note';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = words;
    requestAnimationFrame(function () { el.setAttribute('data-show', ''); });
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.removeAttribute('data-show'); }, 3200);
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
    }).catch(function () { haptic.error(); });
  }

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
  function noteSubmit(form) {
    var action;
    try { action = new URL(form.getAttribute('action') || location.href, location.href); } catch (e) { return; }
    // Not a save: signing in or out, and the steps of the forms on a patient's device (each lands on the same page).
    if (/^\/auth\//.test(action.pathname) || /\/sign-in\/?$/.test(action.pathname) || /^\/f\/[it]\//.test(location.pathname)) return;
    try { sessionStorage.setItem(POSTED, String(Date.now())); } catch (e) { /* no storage */ }
  }
  function postedJustNow() {
    try {
      var at = Number(sessionStorage.getItem(POSTED) || 0);
      sessionStorage.removeItem(POSTED);
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
  function onArrive() {
    var posted = postedJustNow();
    if (navType === 'back_forward' || navType === 'reload') return;
    var alerts = refusals();
    if (alerts.length) {
      var warnOnly = alerts.every(function (el) { return toneOf(el) === 'warn'; });
      if (warnOnly) haptic.warning(); else haptic.error();
      return;
    }
    var q = new URLSearchParams(arrivedSearch);
    // Came back, but nothing changed: "Nothing was saved", the same words as before.
    if (q.get('saved') === 'nothing' || /^(same|bio-same)$/.test(q.get('done') || '')) return;
    // Saved, but not all of it: the chart was not updated after a treatment, a text that could not be sent.
    var warned = Array.prototype.some.call(document.querySelectorAll('[role="status"][data-tone="warn"], [role="note"][data-tone="warn"]'), shown);
    if (q.has('chartskip') || q.has('missed') || warned) { haptic.warning(); return; }
    for (var i = 0; i < SAVED_PARAMS.length; i++) {
      if (q.has(SAVED_PARAMS[i])) {
        if (CONFIRMED_PARAMS.indexOf(SAVED_PARAMS[i]) >= 0) haptic.pattern('confirm'); else haptic.success();
        return;
      }
    }
    // Only a post answered with a redirect landed (a refusal is drawn in place, a server fault is a blank page).
    var redirected = false;
    try { var e = performance.getEntriesByType('navigation')[0]; redirected = !!e && e.redirectCount > 0; } catch (err) { /* older WebKit */ }
    if (posted && redirected) haptic.success();
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
    if (!t || !t.tagName || !gestured(800)) return;
    if (t.tagName === 'DETAILS' && t.open) haptic.tap('soft', 0.7);
    // A popover (the chart's palette over a tooth) opening under the finger.
    else if (e.newState === 'open' && t.hasAttribute('popover')) haptic.tap('soft', 0.6);
  }, true);
  // The line goes: felt once, while the page is in front (what waits is said on the page).
  window.addEventListener('offline', function () { if (document.visibilityState === 'visible') haptic.warning(); });

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
  function swipeOk() {
    if (document.querySelector('dialog[open], .ws-side[data-open], [data-facing]')) return false;
    try { if (document.querySelector('[popover]:popover-open')) return false; } catch (e) { /* no popovers here */ }
    return true;
  }
  var chromeWas = '';
  function syncChrome() {
    var dark = isDark();
    var ground = pageColour(dark);
    // The frosted band under the clock (body::before, on a page with no sticky bar) takes the page's own ground.
    root.style.setProperty('--app-band', 'rgba(' + ground.r + ', ' + ground.g + ', ' + ground.b + ', 0.86)');
    // theme: the person's own choice ('light', 'dark'), or '' when the page follows the device.
    var state = { dark: dark, theme: root.getAttribute('data-theme') || '', color: hex(ground), swipeBack: swipeOk(), typed: typedWords() };
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
      requestAnimationFrame(function () { pending = false; syncChrome(); });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'data-open', 'data-facing'] });
    // The chart's palette is a popover: it says so with its toggle event, not an attribute.
    document.addEventListener('toggle', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('popover')) syncChrome(); }, true);
  }
  // A page restored from the back-forward cache: the app reset what it knew at the commit, so say it all again.
  window.addEventListener('pageshow', function (e) { if (e.persisted) { chromeWas = ''; syncChrome(); } });

  /* ---------------------------------------------------------------- start */

  window.flossifyApp = {
    haptic: haptic,
    canRefresh: function () { return !typedWords(); },
    refreshRefused: function () { showNote('Not refreshed: what you typed here is not saved yet.'); },
    markDirty: function (on) { dirty = on !== false; },
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

  function ready() {
    clampPalettes();
    syncChrome();
    watchLayers();
    watchDrag();
    native('FlossifyShell', 'ready'); // the page has drawn itself: the app's launch screen goes (FlossifyShell.swift)
    onArrive();
    watchAlerts();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
