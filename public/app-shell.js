/* Flossify in its iPhone app.
 *
 * Loaded only inside the app (src/components/AppShell.astro tests the user agent for "FlossifyApp/"), in the head, before
 * the page's own scripts. The native side is mobile/ios/App/App/FlossifyShell.swift (the `FlossifyShell` plugin) and
 * Capacitor's Browser and SplashScreen plugins, reached through the bridge Capacitor injects (window.Capacitor).
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
    '::view-transition-old(root), ::view-transition-new(root) { animation-duration: 420ms; animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1); animation-fill-mode: both; mix-blend-mode: normal; }',
    'html[data-nav="forward"]::view-transition-old(root) { animation-name: app-out-left; }',
    'html[data-nav="forward"]::view-transition-new(root) { animation-name: app-in-right; box-shadow: -12px 0 32px var(--app-vt-shadow); }',
    'html[data-nav="back"]::view-transition-old(root) { animation-name: app-out-right; z-index: 2; box-shadow: -12px 0 32px var(--app-vt-shadow); }',
    'html[data-nav="back"]::view-transition-new(root) { animation-name: app-in-left; z-index: 1; }',
    'html[data-nav="same"]::view-transition-old(root) { animation: 160ms ease both app-fade-out; }',
    'html[data-nav="same"]::view-transition-new(root) { animation: 220ms ease both app-fade-in; }',
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
       measure the bar (the calendar, the record, Clinic settings) follow on their own. */
    'html[data-app] { --app-top: env(safe-area-inset-top, 0px); --app-bottom: env(safe-area-inset-bottom, 0px);' +
      ' --ws-topbar-h: calc(72px + var(--app-top)); --fin-top: calc(4.5rem + var(--app-top)); }',
    'html[data-app] :is(.site-top, .ws-top) { padding-top: var(--app-top); }',
    'html[data-app] .site-drawer-inner { padding-top: calc(0.75rem + var(--app-top)); padding-bottom: calc(1.5rem + var(--app-bottom)); }',
    'html[data-app] .ws-side-top { padding-top: calc(1.125rem + var(--app-top)); }',
    'html[data-app] .ws-side-foot { padding-bottom: calc(1.125rem + var(--app-bottom)); }',
    'html[data-app] .ws-panel { top: calc(0.75rem + var(--app-top)); bottom: calc(0.75rem + var(--app-bottom)); height: calc(100dvh - 1.5rem - var(--app-top) - var(--app-bottom)); }',
    'html[data-app] .ws-menu-pop { max-height: calc(100dvh - 6rem - var(--app-top) - var(--app-bottom)); }',
    'html[data-app] .ws-skip:focus { top: calc(0.75rem + var(--app-top)); }',
    'html[data-app] .entrance-top { padding-top: calc(1rem + var(--app-top)); }',
    'html[data-app] .page-hero { min-height: calc(100svh - 4.25rem - var(--app-top)); }',
    'html[data-app] [data-desk-consent][data-facing] { padding-top: var(--app-top); padding-bottom: var(--app-bottom); }',
    'html[data-app] :is([data-rec-panel], [data-rec-panel] .ws-pane, [data-chart-offer]) { scroll-margin-top: calc(5.5rem + var(--app-top)); }',
    'html[data-app] .pt-main { scroll-margin-top: calc(4.5rem + var(--app-top)); }',
    'html[data-app] .pt-anchor { scroll-margin-top: calc(5.25rem + var(--app-top)); }',
    'html[data-app]:has(body.ops) { scroll-padding-top: calc(5.5rem + var(--app-top)); }',
    '@media (max-width: 767px) {' +
      ' html[data-app] .ws-side-top { padding-top: calc(0.75rem + var(--app-top)); }' +
      ' html[data-app] .ws-side-foot { padding-bottom: calc(1.5rem + var(--app-bottom)); }' +
      ' html[data-app] .ws-panel { inset: 0; height: 100dvh; }' +
      ' html[data-app] .ws-panel-head { padding-top: calc(0.625rem + var(--app-top)); }' +
      ' html[data-app] .ws-panel-body { padding-bottom: calc(2rem + var(--app-bottom)); }' +
      ' html[data-app] .entrance-top { padding-top: calc(0.75rem + var(--app-top)); } }',
    /* A page with no bar that sticks to the top (a paper, a page a patient holds, the staff entrance) starts below the
       status bar, ends above the home indicator, and gets a frosted band under the clock for words that scroll up. */
    'html[data-app][data-app-bare] body { padding-top: var(--app-top); }',
    'html[data-app]:not(:has(.app-start)) body { padding-bottom: var(--app-bottom); }',
    '[data-app-statusbar] { position: fixed; inset: 0 0 auto 0; z-index: 2147482000; height: var(--app-top); pointer-events: none;' +
      ' background: var(--app-band, rgba(243, 245, 248, 0.86)); -webkit-backdrop-filter: blur(16px) saturate(1.05); backdrop-filter: blur(16px) saturate(1.05); }',
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
  root.dataset.nav = navType === 'back_forward' ? 'back' : (document.referrer && samePath(document.referrer, location.href) ? 'same' : 'forward');
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
        root.dataset.nav = 'forward';
      }
    }
  });

  /* ---------------------------------------------------------------- typed words: pull to refresh, leaving */

  var dirty = false;
  function isPostForm(f) { return !!f && String(f.getAttribute('method') || 'get').toLowerCase() === 'post'; }
  document.addEventListener('input', function (e) { if (e.target && isPostForm(e.target.form)) dirty = true; }, true);
  document.addEventListener('submit', function () { dirty = false; }, true);
  window.addEventListener('pageshow', function () { dirty = false; });

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
      return native('FlossifyShell', 'saveFile', { data: data, filename: name || 'Flossify file', mimeType: type });
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

  /* ---------------------------------------------------------------- feedback from the API's answers */

  var pageFetch = window.fetch;
  window.fetch = function (input, init) {
    var promise = pageFetch.apply(this, arguments);
    try {
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
      if (method !== 'GET' && method !== 'HEAD' && OWN_HOSTS[url.host] && url.pathname.indexOf('/api/') === 0) {
        promise.then(function (res) { answered(url.pathname, method, res); }, function () { haptic.error(); });
      }
    } catch (e) { /* the page's own request goes on untouched */ }
    return promise;
  };
  function answered(path, method, res) {
    var s = res.status;
    if (s >= 200 && s < 300) {
      if (haptic.recentPattern()) return; // the page already gave this moment its own feel (a drop, a booking)
      if (path === '/api/schedule' && Date.now() - dropAt < 4000) return; // the drop that asked for it was felt
      if (path === '/api/bookings' && method === 'POST') { haptic.pattern('confirm'); return; }
      if (path === '/api/chart') { haptic.tap('rigid', 0.55); return; }
      haptic.success();
      return;
    }
    if (s === 409) {
      // A soft stop asks first (blocked time, a consent form not agreed): a warning. A clash is a refusal.
      res.clone().json().then(function (body) {
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
  var SAVED_PARAMS = ['saved', 'done', 'sent', 'added', 'booked', 'paid', 'signed', 'used'];
  function onArrive() {
    if (navType === 'back_forward' || navType === 'reload') return;
    var alerts = refusals();
    if (alerts.length) {
      var warnOnly = alerts.every(function (el) { return toneOf(el) === 'warn'; });
      if (warnOnly) haptic.warning(); else haptic.error();
      return;
    }
    var q = new URLSearchParams(location.search);
    for (var i = 0; i < SAVED_PARAMS.length; i++) {
      if (q.has(SAVED_PARAMS[i])) { haptic.success(); return; }
    }
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
        var els = document.querySelectorAll('[role="alert"]');
        for (var i = 0; i < els.length; i++) {
          var el = els[i], text = el.textContent.trim();
          if (el.matches(STANDING)) continue;
          if (!text || !shown(el)) { seen.delete(el); continue; }
          if (seen.get(el) === text) continue;
          seen.set(el, text);
          if (toneOf(el) === 'warn') haptic.warning(); else haptic.error();
        }
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden'] });
  }

  // Choices tick; the main button taps; panels and folds open with a soft tap.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('input[type="radio"], input[type="checkbox"], select')) haptic.select();
  }, true);
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[role="tab"], .ws-seg a, .ws-seg button, button[aria-pressed], [role="switch"]') : null;
    if (t) haptic.select();
  }, true);
  var prepared = false;
  document.addEventListener('pointerdown', function (e) {
    if (!prepared) { prepared = true; native('FlossifyShell', 'prepare'); }
    if (e.pointerType !== 'touch' || !e.target || !e.target.closest) return;
    var b = e.target.closest('.btn-primary, .ws-btn-primary, .ws-btn-danger');
    if (!b || b.matches(':disabled, [aria-disabled="true"]')) return;
    haptic.tap(b.classList.contains('ws-btn-danger') ? 'medium' : 'light');
  }, { capture: true, passive: true });
  document.addEventListener('toggle', function (e) {
    var t = e.target;
    if (!t || !t.tagName) return;
    if (t.tagName === 'DETAILS' && t.open) haptic.tap('soft', 0.7);
    // A popover (the chart's palette over a tooth) opening under the finger.
    else if (e.newState === 'open' && t.hasAttribute('popover')) haptic.tap('soft', 0.6);
  }, true);

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

  // A page whose top scrolls away (no sticky bar) gets a frosted band under the clock; a page with no bar at all also
  // starts below it (data-app-bare). The entrance and /app/ place themselves.
  var band = null;
  function frame() {
    if (!document.querySelector('.site-top, .ws-top, .entrance, .app-start')) root.setAttribute('data-app-bare', '');
    if (document.querySelector('.site-sticky, .ws-top') || band) return;
    band = document.createElement('div');
    band.setAttribute('data-app-statusbar', '');
    band.setAttribute('aria-hidden', 'true');
    document.body.appendChild(band);
  }
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
    return !document.querySelector('dialog[open], .ws-side[data-open], [data-facing]');
  }
  var chromeWas = '';
  function syncChrome() {
    var dark = isDark();
    var ground = pageColour(dark);
    if (band) band.style.setProperty('--app-band', 'rgba(' + ground.r + ', ' + ground.g + ', ' + ground.b + ', 0.86)');
    var state = { dark: dark, color: hex(ground), swipeBack: swipeOk() };
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
  }

  /* ---------------------------------------------------------------- start */

  window.flossifyApp = {
    haptic: haptic,
    canRefresh: function () { return !dirty; },
    refreshRefused: function () { showNote('Not refreshed: what you typed here is not saved yet.'); },
    markDirty: function (on) { dirty = on !== false; },
  };

  function ready() {
    frame();
    syncChrome();
    watchLayers();
    watchDrag();
    native('SplashScreen', 'hide', { fadeOutDuration: 300 });
    onArrive();
    watchAlerts();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
