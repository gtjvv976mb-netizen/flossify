/* SwiftCare Dental — interactions & motion. No dependencies. */
(() => {
  'use strict';
  document.documentElement.classList.remove('no-js');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = !document.documentElement.classList.contains('force-motion') && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const C = SC.clinic;
  const svcById = Object.fromEntries(SC.services.map(s => [s.id, s]));
  const catLabel = Object.fromEntries(SC.categories.map(c => [c.id, c.label]));
  const catShort = { prevent: 'Prevention', restore: 'Restorative', replace: 'Replacement', surgery: 'Extractions', cosmetic: 'Cosmetic', ortho: 'Orthodontics' };

  const peso = n => '₱' + Math.round(n).toLocaleString('en-PH');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem('sc:' + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem('sc:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };
  const scrollToEl = el => el && el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

  /* ---------- Prices ---------- */
  function priceMain(s) {
    if (s.min == null) return 'Quoted at consultation';
    if (s.max) return `${peso(s.min)} – ${peso(s.max)}`;
    return peso(s.min);
  }
  function priceLabel(s) {
    if (s.min == null) return 'Price';
    return s.from ? 'Starting at' : 'Estimate';
  }
  function priceShort(s) {
    if (s.min == null) return 'At consult';
    return s.from ? `from ${peso(s.min)}` : priceMain(s);
  }

  /* ---------- Toast ---------- */
  const toastEl = $('[data-toast]');
  let toastTimer;
  function toast(msg) {
    toastEl.innerHTML = `${icon('i-check')}<span>${esc(msg)}</span>`;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }
  async function copyText(text, msg = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(msg);
  }

  /* =========================================================
     Clinic hours — live status in Manila time
     ========================================================= */
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const fmtHour = h => `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;

  function manilaNow() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: C.timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t).value;
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), mins: (+get('hour') % 24) * 60 + +get('minute') };
  }

  function hoursStatus() {
    const { day, mins } = manilaNow();
    const today = C.hours[day];
    if (today) {
      const [open, close] = today;
      if (mins >= open * 60 && mins < close * 60) {
        return close * 60 - mins <= 60
          ? { state: 'closing', text: `Closing soon · ${fmtHour(close)}`, short: `Closes ${fmtHour(close)}`, open: true }
          : { state: 'open', text: `Open now · until ${fmtHour(close)}`, short: `Open until ${fmtHour(close)}`, open: true };
      }
      if (mins < open * 60) return { state: 'closed', text: `Closed · opens ${fmtHour(open)}`, short: `Opens today ${fmtHour(open)}`, day };
    } else if (day === 0) {
      return { state: 'appt', text: 'Sunday · by appointment', short: 'By appointment today', day };
    }
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      if (C.hours[d]) {
        const when = i === 1 ? 'tomorrow' : DAY_NAMES[d].slice(0, 3);
        return { state: 'closed', text: `Closed · opens ${when} ${fmtHour(C.hours[d][0])}`, short: `Opens ${when} ${fmtHour(C.hours[d][0])}`, day };
      }
    }
  }

  function renderHours() {
    const st = hoursStatus();
    $$('[data-hours-status]').forEach(el => {
      el.dataset.state = st.state;
      $('.status-pill__text', el).textContent = st.text;
    });
    $$('[data-hours-short]').forEach(el => { el.textContent = st.short; });
    const { day } = manilaNow();
    $$('[data-hours-table] tr').forEach(tr => tr.classList.toggle('is-today', +tr.dataset.day === day));
  }
  renderHours();
  setInterval(renderHours, 60_000);

  /* =========================================================
     Header, scroll progress, back-to-top, parallax
     ========================================================= */
  const header = $('[data-header]');
  const progress = $('.scroll-progress');
  const toTop = $('[data-to-top]');
  const toTopRing = $('[data-to-top-ring]');
  const parallaxEls = $$('[data-parallax]');
  const wideScreen = matchMedia('(min-width: 961px)');
  let lastY = scrollY;
  let ticking = false;
  let menuOpen = false;

  function onScroll() {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, y / max) : 0;
    progress.style.setProperty('--p', p);
    header.classList.toggle('is-scrolled', y > 8);
    if (!menuOpen) {
      if (y > 420 && y > lastY + 6) header.classList.add('is-hidden');
      else if (y < lastY - 6 || y < 420) header.classList.remove('is-hidden');
    }
    toTop.classList.toggle('is-visible', y > 900);
    toTopRing.style.strokeDashoffset = 138.2 * (1 - p);

    if (!reduceMotion && wideScreen.matches) {
      const vh = innerHeight;
      parallaxEls.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const offset = (r.top + r.height / 2 - vh / 2) * parseFloat(el.dataset.parallax);
        el.style.translate = `0 ${offset.toFixed(1)}px`;
      });
    }
    lastY = y;
  }
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  /* Nav indicator + scrollspy */
  const nav = $('.nav');
  const navIndicator = $('.nav__indicator');
  const navLinks = $$('[data-spy]');
  let activeLink = null;
  function moveIndicator(link) {
    if (!link) { navIndicator.style.opacity = 0; return; }
    const pad = parseFloat(getComputedStyle(link).paddingLeft);
    navIndicator.style.opacity = 1;
    navIndicator.style.width = `${link.offsetWidth - pad * 2}px`;
    navIndicator.style.transform = `translateX(${link.offsetLeft + pad}px)`;
  }
  navLinks.forEach(a => a.addEventListener('mouseenter', () => moveIndicator(a)));
  nav.addEventListener('mouseleave', () => moveIndicator(activeLink));

  const spyTargets = navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);
  const visibleSections = new Set();
  const spyObserver = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? visibleSections.add(e.target) : visibleSections.delete(e.target));
    const current = spyTargets.filter(s => visibleSections.has(s)).pop();
    activeLink = current ? navLinks.find(a => a.getAttribute('href') === '#' + current.id) : null;
    navLinks.forEach(a => a.classList.toggle('is-active', a === activeLink));
    if (!nav.matches(':hover')) moveIndicator(activeLink);
  }, { rootMargin: '-35% 0px -60% 0px' });
  spyTargets.forEach(s => spyObserver.observe(s));

  /* Mobile menu */
  const burger = $('[data-burger]');
  const menu = $('[data-mobile-menu]');
  const actionBar = $('.action-bar');
  function setMenu(open) {
    menuOpen = open;
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.documentElement.style.overflow = open ? 'hidden' : '';
    actionBar.classList.toggle('is-hidden', open);
    if (open) {
      header.classList.remove('is-hidden');
      menu.hidden = false;
      $$('nav a', menu).forEach((a, i) => { a.style.transitionDelay = `${120 + i * 45}ms`; });
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    } else {
      menu.classList.remove('is-open');
      $$('nav a', menu).forEach(a => { a.style.transitionDelay = '0ms'; });
      setTimeout(() => { if (!menuOpen) menu.hidden = true; }, reduceMotion ? 0 : 650);
    }
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });
  matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches && menuOpen) setMenu(false); });

  /* =========================================================
     Reveal on scroll, stagger, count-up
     ========================================================= */
  function countUp(el) {
    const target = +el.dataset.count;
    if (reduceMotion) { el.textContent = target; return; }
    const dur = 1400;
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(2, -10 * k)));
      if (k < 1) requestAnimationFrame(step); else el.textContent = target;
    };
    requestAnimationFrame(step);
  }
  if (!reduceMotion) $$('[data-count]').forEach(el => { el.textContent = '0'; });

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      revealObserver.unobserve(el);
      el.classList.add('is-visible');
      $$('[data-count]', el).forEach(countUp);
      // Hand the element back to its own transitions once the reveal is done.
      const delay = parseFloat(getComputedStyle(el).getPropertyValue('--d')) || 0;
      setTimeout(() => { el.removeAttribute('data-reveal'); }, 1200 + delay * 1000);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  function observeReveals(root = document) {
    $$('[data-stagger]', root).forEach(group => {
      $$(':scope > [data-reveal]', group).forEach((child, i) => {
        if (!child.style.getPropertyValue('--d')) child.style.setProperty('--d', `${(i * 0.08).toFixed(2)}s`);
      });
    });
    $$('[data-reveal]', root).forEach(el => revealObserver.observe(el));
    if (root !== document && root.matches?.('[data-reveal]')) revealObserver.observe(root);
  }

  const stepsEl = $('[data-steps]');
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { stepsEl.classList.add('is-visible'); obs.disconnect(); }
  }, { threshold: 0.3 }).observe(stepsEl);

  /* =========================================================
     Hero title split + pointer motion
     ========================================================= */
  const heroTitle = $('[data-split]');
  if (heroTitle && !reduceMotion) {
    let i = 0;
    const splitNode = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(document.createTextNode(' ')); return; }
            const outer = document.createElement('span');
            outer.className = 'split-word';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--wd', `${(0.15 + i++ * 0.08).toFixed(2)}s`);
            outer.append(inner);
            frag.append(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          splitNode(child);
        }
      });
    };
    heroTitle.setAttribute('aria-label', heroTitle.textContent.trim());
    splitNode(heroTitle);
    $$('.split-word', heroTitle).forEach(w => w.setAttribute('aria-hidden', 'true'));
    heroTitle.classList.add('split-done');
    requestAnimationFrame(() => requestAnimationFrame(() => heroTitle.classList.add('is-split')));
  }

  const heroVisual = $('[data-hero-visual]');
  if (heroVisual && finePointer && !reduceMotion) {
    const tooth = $('.hero__tooth', heroVisual);
    heroVisual.addEventListener('pointermove', e => {
      const r = heroVisual.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      tooth.style.transform = `translate(${x * -18}px, ${y * -18}px) rotate(${x * -3}deg)`;
    });
    heroVisual.addEventListener('pointerleave', () => { tooth.style.transform = ''; });
    tooth.style.transition = 'transform .8s cubic-bezier(.16,1,.3,1)';
  }

  /* Magnetic buttons & tilt cards (delegated so rendered content gets them too) */
  if (finePointer && !reduceMotion) {
    document.addEventListener('pointermove', e => {
      const mag = e.target.closest('[data-magnetic]');
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.translate = `${((e.clientX - r.left) / r.width - 0.5) * 10}px ${((e.clientY - r.top) / r.height - 0.5) * 8}px`;
      }
      const card = e.target.closest('[data-tilt], .svc');
      if (card) {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
        const amt = card.classList.contains('svc') ? 3 : 5;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - y) * amt}deg) rotateY(${(x - 0.5) * amt}deg) translateY(-4px)`;
      }
    }, { passive: true });
    document.addEventListener('pointerout', e => {
      const mag = e.target.closest('[data-magnetic]');
      if (mag && !mag.contains(e.relatedTarget)) mag.style.translate = '';
      const card = e.target.closest('[data-tilt], .svc');
      if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
    });
  }

  /* Marquee — duplicate content for a seamless loop */
  const marquee = $('[data-marquee]');
  if (marquee) marquee.innerHTML += marquee.innerHTML;

  /* =========================================================
     Generic helpers: roving focus + sliding pill thumb
     ========================================================= */
  function roving(container, selector, onSelect) {
    container.addEventListener('keydown', e => {
      const items = $$(selector, container).filter(el => !el.hidden);
      const idx = items.indexOf(document.activeElement);
      if (idx < 0) return;
      const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      let target;
      if (next) target = items[(idx + next + items.length) % items.length];
      if (e.key === 'Home') target = items[0];
      if (e.key === 'End') target = items[items.length - 1];
      if (!target) return;
      e.preventDefault();
      target.focus();
      onSelect(target);
    });
  }
  function setRoving(items, active) {
    items.forEach(el => el.setAttribute('tabindex', el === active ? '0' : '-1'));
  }
  function moveThumb(container, btn) {
    let thumb = $(':scope > .tabs-pill__thumb, :scope > .segmented__thumb', container);
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'tabs-pill__thumb';
      thumb.setAttribute('aria-hidden', 'true');
      container.prepend(thumb);
    }
    if (!btn) return;
    const offset = thumb.classList.contains('segmented__thumb') ? 5 : 0;
    thumb.style.width = `${btn.offsetWidth}px`;
    thumb.style.transform = `translateX(${btn.offsetLeft - offset}px)`;
    if (container.scrollWidth > container.clientWidth) {
      container.scrollTo({ left: btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
  function scrollIntoRow(container, el) {
    if (container.scrollWidth <= container.clientWidth) return;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left >= c.left && r.right <= c.right) return;
    container.scrollTo({ left: container.scrollLeft + (r.left - c.left) - 16, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  const thumbSyncers = [];
  const syncThumbs = () => thumbSyncers.forEach(fn => fn());
  addEventListener('resize', syncThumbs);
  document.fonts?.ready.then(syncThumbs);

  /* =========================================================
     Smile Finder
     ========================================================= */
  const finderChips = $('[data-finder-chips]');
  const finderOut = $('[data-finder-result]');
  finderChips.innerHTML = SC.symptoms.map((s, i) => `
    <button type="button" class="chip ${s.urgency === 'urgent' ? 'chip--urgent' : ''}" role="radio" aria-checked="false" tabindex="${i === 0 ? 0 : -1}" data-symptom="${s.id}">
      ${s.urgency === 'urgent' ? '<span class="chip__dot" aria-hidden="true"></span>' : ''}<span class="chip__check" aria-hidden="true">${icon('i-check')}</span>${esc(s.label)}
    </button>`).join('');

  function selectSymptom(btn) {
    const chips = $$('.chip', finderChips);
    chips.forEach(c => c.setAttribute('aria-checked', c === btn));
    setRoving(chips, btn);
    const sym = SC.symptoms.find(s => s.id === btn.dataset.symptom);
    const u = SC.urgency[sym.urgency];
    const urgent = sym.urgency === 'urgent';
    finderOut.innerHTML = `
      <div class="result">
        <span class="urgency urgency--${u.tone}">${u.label}</span>
        <div>
          <h3 class="result__title">${esc(sym.title)}</h3>
          <p class="result__text">${esc(sym.text)}</p>
        </div>
        <div>
          <p class="result__label">Services that may help</p>
          <div class="result__services">
            ${sym.services.map(id => {
              const s = svcById[id];
              return `<button type="button" class="svc-mini" data-open-service="${s.id}">
                <span class="svc-mini__icon"><svg aria-hidden="true"><use href="#d-${s.icon}"/></svg></span>
                <span class="svc-mini__name">${esc(s.name)}${s.local ? `<small>${esc(s.local)}</small>` : ''}</span>
                <span class="svc-mini__price">${priceShort(s)}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div>
          <p class="result__label">${urgent ? 'Do this now' : 'What you can do now'}</p>
          <ul class="tips">${sym.tips.map(t => `<li>${icon('i-check')}<span>${esc(t)}</span></li>`).join('')}</ul>
        </div>
        <div class="result__actions">
          ${urgent
            ? `<a class="btn btn--rose" href="${C.phoneHref}">${icon('i-phone')}<span>Call ${C.phone}</span></a>
               <a class="btn btn--ghost" href="#care" data-open-tab="emergency" data-emergency="${sym.emergency}">${icon('i-alert')}<span>First-aid steps</span></a>`
            : `<a class="btn btn--gold" href="${C.bookUrl}" data-magnetic>${icon('i-calendar')}<span>Book a consultation</span></a>
               <button type="button" class="btn btn--ghost" data-show-prices="${sym.services.join(',')}">${icon('i-list')}<span>Compare prices</span></button>`}
        </div>
      </div>`;
  }
  finderChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) selectSymptom(chip);
  });
  roving(finderChips, '.chip', selectSymptom);

  /* =========================================================
     Services grid + filter (FLIP)
     ========================================================= */
  const servicesGrid = $('[data-services-grid]');
  const serviceFilters = $('[data-service-filters]');
  servicesGrid.id = 'services-grid';
  servicesGrid.setAttribute('role', 'tabpanel');
  serviceFilters.innerHTML = SC.categories.map((c, i) =>
    `<button role="tab" aria-selected="${i === 0}" aria-controls="services-grid" tabindex="${i === 0 ? 0 : -1}" data-filter="${c.id}">${esc(c.id === 'all' ? 'All services' : catShort[c.id])}</button>`
  ).join('');

  servicesGrid.innerHTML = SC.services.map(s => `
    <button type="button" class="svc" data-cat="${s.cat}" data-open-service="${s.id}" data-reveal>
      <span class="svc__top">
        <span class="svc__icon"><svg aria-hidden="true"><use href="#d-${s.icon}"/></svg></span>
        <span class="svc__cat">${catShort[s.cat]}</span>
      </span>
      <span class="svc__name">${esc(s.name)}${s.local ? `<span class="svc__local">${esc(s.local)}</span>` : ''}</span>
      <span class="svc__desc">${esc(s.short)}</span>
      <span class="svc__foot">
        <span class="svc__price"><small>${priceLabel(s)}${s.unit ? ` · ${esc(s.unit)}` : ''}</small>${priceMain(s)}</span>
        <span class="svc__go" aria-hidden="true">${icon('i-arrow-right')}</span>
      </span>
    </button>`).join('');
  servicesGrid.setAttribute('data-stagger', '');

  let filterBusy = false;
  let pendingFilter = null;
  function applyFilter(btn) {
    const tabs = $$('[data-filter]', serviceFilters);
    if (filterBusy) { pendingFilter = btn; return; }
    if (btn.getAttribute('aria-selected') === 'true') return;
    tabs.forEach(t => t.setAttribute('aria-selected', t === btn));
    setRoving(tabs, btn);
    moveThumb(serviceFilters, btn);

    const cat = btn.dataset.filter;
    const cards = $$('.svc', servicesGrid);
    const shouldShow = c => cat === 'all' || c.dataset.cat === cat;
    cards.forEach(c => { c.removeAttribute('data-reveal'); c.classList.add('is-visible'); });
    if (reduceMotion) { cards.forEach(c => { c.hidden = !shouldShow(c); }); return; }

    filterBusy = true;
    const leaving = cards.filter(c => !c.hidden && !shouldShow(c));
    const entering = cards.filter(c => c.hidden && shouldShow(c));
    const staying = cards.filter(c => !c.hidden && shouldShow(c));
    leaving.forEach(c => c.classList.add('is-leaving'));

    setTimeout(() => {
      const before = new Map(staying.map(c => [c, c.getBoundingClientRect()]));
      leaving.forEach(c => { c.hidden = true; c.classList.remove('is-leaving'); });
      entering.forEach(c => { c.hidden = false; c.classList.add('is-entering'); c.style.transition = 'none'; });
      before.forEach((r, c) => {
        const n = c.getBoundingClientRect();
        const dx = r.left - n.left;
        const dy = r.top - n.top;
        if (dx || dy) { c.style.transition = 'none'; c.style.transform = `translate(${dx}px, ${dy}px)`; }
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        before.forEach((_, c) => { c.style.transition = ''; c.style.transform = ''; });
        entering.forEach((c, i) => {
          c.style.transition = '';
          c.style.transitionDelay = `${i * 50}ms`;
          c.classList.remove('is-entering');
          setTimeout(() => { c.style.transitionDelay = ''; }, 900);
        });
        setTimeout(() => {
          filterBusy = false;
          if (pendingFilter) { const next = pendingFilter; pendingFilter = null; applyFilter(next); }
        }, 250);
      }));
    }, leaving.length ? 260 : 0);
  }
  serviceFilters.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (btn) applyFilter(btn);
  });
  roving(serviceFilters, '[data-filter]', applyFilter);
  thumbSyncers.push(() => moveThumb(serviceFilters, $('[aria-selected="true"]', serviceFilters)));

  /* =========================================================
     Service drawer
     ========================================================= */
  const drawer = $('[data-drawer]');
  const drawerBody = $('[data-drawer-body]');
  function openService(id) {
    const s = svcById[id];
    if (!s) return;
    const inEstimate = estimate.has(id);
    drawerBody.innerHTML = `
      <div class="drawer__media">
        <img src="assets/services/${s.img}" alt="" width="1200" height="750">
        <button type="button" class="icon-btn drawer__close" data-drawer-close aria-label="Close">${icon('i-x')}</button>
      </div>
      <div class="drawer__body">
        <span class="drawer__cat">${esc(catLabel[s.cat])}</span>
        <h2 class="drawer__title" id="drawer-title">${esc(s.name)}${s.local ? `<em>${esc(s.local)}</em>` : ''}</h2>
        <p class="drawer__desc">${esc(s.short)}</p>
        <div class="drawer__price">
          <span>${priceLabel(s)}</span>
          <strong>${priceMain(s)}${s.unit ? `<small>${esc(s.unit)}</small>` : ''}</strong>
        </div>
        <div>
          <p class="drawer__h">What to expect</p>
          <ol class="expect">${s.expect.map((x, i) => `<li><span>${i + 1}</span>${esc(x)}</li>`).join('')}</ol>
          ${s.note ? `<p class="drawer__note">${icon('i-info')}<span>${esc(s.note)}</span></p>` : ''}
        </div>
        <div class="drawer__actions">
          <a class="btn btn--gold btn--block" href="${C.bookUrl}">${icon('i-calendar')}<span>Book this treatment</span></a>
          <div class="drawer__actions-row">
            <button type="button" class="btn btn--ghost btn--sm" data-drawer-estimate="${s.id}">${icon(inEstimate ? 'i-check' : 'i-plus')}<span>${inEstimate ? 'In your estimate' : 'Add to estimate'}</span></button>
            ${s.care ? `<a class="btn btn--ghost btn--sm" href="#care" data-open-tab="aftercare" data-aftercare="${s.care}">${icon('i-heart')}<span>Aftercare</span></a>` : ''}
          </div>
        </div>
        <p class="disclaimer">${icon('i-info')}<span>Prices are estimates. Final fees are confirmed during your consultation.</span></p>
      </div>`;
    drawer.classList.remove('is-closing');
    drawer.showModal();
    document.documentElement.classList.add('has-dialog');
    drawerBody.scrollTop = 0;
    actionBar.classList.add('is-hidden');
  }
  function closeDrawer() {
    if (!drawer.open || drawer.classList.contains('is-closing')) return;
    const finish = () => {
      drawer.classList.remove('is-closing');
      drawer.close();
      document.documentElement.classList.remove('has-dialog');
      actionBar.classList.remove('is-hidden');
    };
    if (reduceMotion) return finish();
    drawer.classList.add('is-closing');
    setTimeout(finish, 380);
  }
  drawer.addEventListener('cancel', e => { e.preventDefault(); closeDrawer(); });
  drawer.addEventListener('click', e => {
    if (e.target === drawer || e.target.closest('[data-drawer-close]')) closeDrawer();
    const add = e.target.closest('[data-drawer-estimate]');
    if (add) {
      const id = add.dataset.drawerEstimate;
      if (!estimate.has(id)) { estimate.set(id, 1); updateEstimate(); }
      add.innerHTML = `${icon('i-check')}<span>In your estimate</span>`;
      toast(`${svcById[id].name} added to your estimate`);
    }
  });

  /* =========================================================
     Pricing & estimator
     ========================================================= */
  const KEYWORDS = {
    consultation: 'checkup check-up exam konsulta',
    prophylaxis: 'cleaning linis scaling tartar',
    xray: 'x-ray xray panoramic imaging',
    fluoride: 'kids children cavity',
    sealant: 'kids children sealants',
    restoration: 'filling pasta cavity composite',
    rootcanal: 'root canal endodontic nerve',
    crown: 'cap jacket crown',
    dentures: 'pustiso false teeth',
    bridge: 'missing tooth replacement',
    extraction: 'bunot pull remove',
    wisdom: 'third molar impacted bunot',
    whitening: 'bleaching white stain',
    veneers: 'veneer porcelain',
    braces: 'orthodontics brace align crooked'
  };
  const priceRows = $('[data-price-rows]');
  const priceSearch = $('[data-price-search]');
  const priceEmpty = $('[data-price-empty]');
  const estimate = new Map(Object.entries(store.get('estimate', {})).filter(([id]) => svcById[id]));

  priceRows.innerHTML = SC.services.map(s => `
    <li class="price-row" data-row="${s.id}" data-search="${esc(`${s.name} ${s.local || ''} ${catLabel[s.cat]} ${KEYWORDS[s.id] || ''}`.toLowerCase())}">
      <button type="button" class="price-row__toggle" aria-pressed="false" aria-label="Add ${esc(s.name)} to estimate">${icon('i-check')}</button>
      <div class="price-row__main">
        <div class="price-row__name">${esc(s.name)}${s.local ? `<em>${esc(s.local)}</em>` : ''}</div>
        <div class="price-row__meta">${esc(catLabel[s.cat])}${s.unit ? ` · ${esc(s.unit)}` : ''}</div>
      </div>
      <div class="price-row__right">
        <span class="price-row__price">${s.from ? '<small>from</small> ' : ''}${s.min == null ? 'Quoted at consultation' : (s.from ? peso(s.min) : priceMain(s))}</span>
        <span data-stepper></span>
      </div>
    </li>`).join('');
  priceRows.insertAdjacentHTML('afterend', `<p class="price-foot">${icon('i-info')}<span>All prices shown are estimates. Final fees are confirmed during your consultation based on your specific needs.</span></p>`);

  const unitWord = (s, n) => {
    const base = s.qtyLabel ? s.qtyLabel.replace(/s$/, '') : (s.unit === 'per unit' ? 'unit' : 'tooth');
    if (n === 1) return base;
    return base === 'tooth' ? 'teeth' : base + 's';
  };

  function lineRange(s, q) {
    if (s.min == null) return { text: 'At consult' };
    if (s.from) return { min: s.min * q, max: s.min * q, open: true, text: `from ${peso(s.min * q)}` };
    if (s.max) return { min: s.min * q, max: s.max * q, text: `${peso(s.min * q)} – ${peso(s.max * q)}` };
    return { min: s.min * q, max: s.min * q, text: peso(s.min * q) };
  }

  let shownTotal = { min: 0, max: 0 };
  function formatTotal(min, max, open) {
    if (min === 0 && max === 0) return '₱0';
    if (min === max) return open ? `${peso(min)}+` : peso(min);
    return `${peso(min)} – ${peso(max)}${open ? '+' : ''}`;
  }

  function updateEstimate() {
    store.set('estimate', Object.fromEntries(estimate));
    $$('.price-row', priceRows).forEach(row => {
      const s = svcById[row.dataset.row];
      const on = estimate.has(s.id);
      row.classList.toggle('is-selected', on);
      const toggle = $('.price-row__toggle', row);
      toggle.setAttribute('aria-pressed', on);
      toggle.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${s.name} ${on ? 'from' : 'to'} estimate`);
      const slot = $('[data-stepper]', row);
      if (on && s.qty) {
        const q = estimate.get(s.id);
        const existing = $('.stepper', slot);
        const html = `<button type="button" data-step="-1" aria-label="Fewer" ${q <= 1 ? 'disabled' : ''}>${icon('i-minus')}</button><output aria-live="polite">${q} ${unitWord(s, q)}</output><button type="button" data-step="1" aria-label="More" ${q >= 32 ? 'disabled' : ''}>${icon('i-plus')}</button>`;
        if (existing) existing.innerHTML = html;
        else slot.innerHTML = `<span class="stepper">${html}</span>`;
      } else {
        slot.innerHTML = '';
      }
    });

    const items = $('[data-estimate-items]');
    const quoted = [];
    let min = 0, max = 0, open = false;
    items.innerHTML = [...estimate].map(([id, q]) => {
      const s = svcById[id];
      const r = lineRange(s, q);
      if (r.min == null) quoted.push(s.name); else { min += r.min; max += r.max; open = open || !!r.open; }
      return `<li><span>${esc(s.name)}${s.qty && q > 1 ? ` × ${q}` : ''}</span><b>${r.text}</b><button type="button" class="estimate__remove" data-remove="${id}" aria-label="Remove ${esc(s.name)}">${icon('i-x')}</button></li>`;
    }).join('');

    const n = estimate.size;
    $('[data-estimate-count]').textContent = n ? `${n} treatment${n > 1 ? 's' : ''} added` : 'No treatments added yet';
    $('[data-estimate-copy]').disabled = !n;
    $('[data-estimate-clear]').disabled = !n;

    let note = 'Add treatments from the list to see a price range.';
    if (n) {
      note = 'Estimates only. Final fees are confirmed at your consultation.';
      if (open) note += ' “+” means some treatments show starting prices.';
      if (quoted.length) note += ` ${quoted.join(', ')} ${quoted.length > 1 ? 'are' : 'is'} quoted at consultation.`;
    }
    $('[data-estimate-note]').textContent = note;

    const totalEl = $('[data-estimate-total]');
    const from = { ...shownTotal };
    shownTotal = { min, max };
    if (reduceMotion) { totalEl.textContent = formatTotal(min, max, open); return; }
    const t0 = performance.now();
    const tick = t => {
      const k = Math.min(1, (t - t0) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      totalEl.textContent = formatTotal(from.min + (min - from.min) * e, from.max + (max - from.max) * e, open);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  priceRows.addEventListener('click', e => {
    const row = e.target.closest('.price-row');
    if (!row) return;
    const id = row.dataset.row;
    const step = e.target.closest('[data-step]');
    if (step) {
      const q = Math.min(32, Math.max(1, estimate.get(id) + +step.dataset.step));
      estimate.set(id, q);
      updateEstimate();
      return;
    }
    if (e.target.closest('.price-row__toggle') || (e.target.closest('.price-row__main'))) {
      estimate.has(id) ? estimate.delete(id) : estimate.set(id, 1);
      updateEstimate();
    }
  });
  $('[data-estimate-items]').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { estimate.delete(rm.dataset.remove); updateEstimate(); }
  });
  $('[data-estimate-clear]').addEventListener('click', () => { estimate.clear(); updateEstimate(); });
  $('[data-estimate-copy]').addEventListener('click', () => {
    const lines = [...estimate].map(([id, q]) => {
      const s = svcById[id];
      return `• ${s.name}${s.local ? ` (${s.local})` : ''}${s.qty && q > 1 ? ` × ${q}` : ''}: ${lineRange(s, q).text}`;
    });
    const text = [
      'SwiftCare Dental Clinic: my treatment estimate',
      ...lines,
      `Estimated total: ${$('[data-estimate-total]').textContent}`,
      'Prices are estimates. Final fees are confirmed at consultation.',
      `Book: ${C.bookUrl}`
    ].join('\n');
    copyText(text, 'Estimate copied. Paste it in Messenger or your notes');
  });

  priceSearch.addEventListener('input', () => {
    const q = priceSearch.value.trim().toLowerCase();
    let visible = 0;
    $$('.price-row', priceRows).forEach(row => {
      const match = !q || q.split(/\s+/).every(w => row.dataset.search.includes(w));
      row.classList.toggle('is-hidden', !match);
      if (match) visible++;
    });
    priceEmpty.hidden = visible > 0;
  });
  updateEstimate();

  function flashPrices(ids) {
    priceSearch.value = '';
    priceSearch.dispatchEvent(new Event('input'));
    scrollToEl($('#pricing'));
    setTimeout(() => {
      ids.forEach((id, i) => {
        const row = $(`[data-row="${id}"]`, priceRows);
        if (!row) return;
        row.classList.remove('is-flash');
        void row.offsetWidth;
        row.style.animationDelay = `${i * 120}ms`;
        row.classList.add('is-flash');
      });
    }, reduceMotion ? 0 : 650);
  }

  /* =========================================================
     Journey toggle
     ========================================================= */
  const journeyToggle = $('[data-journey-toggle]');
  const journeyBtns = $$('[data-journey]', journeyToggle);
  function setJourney(btn) {
    if (btn.getAttribute('aria-selected') === 'true') return;
    journeyBtns.forEach(b => b.setAttribute('aria-selected', b === btn));
    setRoving(journeyBtns, btn);
    moveThumb(journeyToggle, btn);
    const mode = btn.dataset.journey;
    stepsEl.classList.add('is-swapping');
    setTimeout(() => {
      $$('[data-new]', stepsEl).forEach(el => { el.textContent = el.dataset[mode === 'new' ? 'new' : 'existing']; });
      stepsEl.classList.remove('is-swapping');
    }, reduceMotion ? 0 : 280);
  }
  journeyToggle.addEventListener('click', e => { const b = e.target.closest('[data-journey]'); if (b) setJourney(b); });
  roving(journeyToggle, '[data-journey]', setJourney);
  setRoving(journeyBtns, journeyBtns[0]);
  thumbSyncers.push(() => moveThumb(journeyToggle, $('[aria-selected="true"]', journeyToggle)));

  /* =========================================================
     Care hub tabs
     ========================================================= */
  const careTabs = $('[data-tabs="care"]');
  const careTabBtns = $$('[data-tab]', careTabs);
  function selectCareTab(idOrBtn) {
    const btn = typeof idOrBtn === 'string' ? careTabBtns.find(b => b.dataset.tab === idOrBtn) : idOrBtn;
    if (!btn) return;
    careTabBtns.forEach(b => b.setAttribute('aria-selected', b === btn));
    setRoving(careTabBtns, btn);
    moveThumb(careTabs, btn);
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
  }
  careTabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) selectCareTab(b); });
  roving(careTabs, '[data-tab]', selectCareTab);
  thumbSyncers.push(() => moveThumb(careTabs, $('[aria-selected="true"]', careTabs)));

  /* Emergency first aid */
  const EM_TONE = { knocked: 'rose', swelling: 'rose', braces: 'sage' };
  const emList = $('[data-emergency-list]');
  const emDetail = $('[data-emergency-detail]');
  emList.innerHTML = SC.emergencies.map((em, i) =>
    `<button type="button" class="em-btn" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-em="${em.id}">${esc(em.title)}${icon('i-chevron-right')}</button>`
  ).join('');
  function selectEmergency(idOrBtn) {
    const btns = $$('.em-btn', emList);
    const btn = typeof idOrBtn === 'string' ? btns.find(b => b.dataset.em === idOrBtn) : idOrBtn;
    if (!btn) return;
    btns.forEach(b => b.setAttribute('aria-selected', b === btn));
    setRoving(btns, btn);
    scrollIntoRow(emList, btn);
    const em = SC.emergencies.find(x => x.id === btn.dataset.em);
    const st = hoursStatus();
    emDetail.innerHTML = `
      <div class="em-detail">
        <div class="em-detail__head">
          <h3 class="h3">${esc(em.title)}</h3>
          <span class="urgency urgency--${EM_TONE[em.id] || 'amber'}">${esc(em.badge)}</span>
        </div>
        <ol class="em-steps">${em.steps.map((s, i) => `<li style="--i:${i}"><span>${esc(s)}</span></li>`).join('')}</ol>
        ${em.note ? `<p class="em-note">${icon('i-alert')}<span>${esc(em.note)}</span></p>` : ''}
        ${st.open ? '' : `<p class="em-note em-note--info">${icon('i-clock')}<span>The clinic is currently closed (${esc(st.text.replace(/^Closed · /, '').replace(/^Sunday · /, 'Sunday, '))}). You can still call or message us. For anything severe, go to the nearest emergency room.</span></p>`}
        <div class="em-actions">
          <a class="btn btn--rose" href="${C.phoneHref}">${icon('i-phone')}<span>Call ${C.phone}</span></a>
          <a class="btn btn--ghost" href="${C.messenger}" target="_blank" rel="noopener">${icon('i-message')}<span>Message us</span></a>
          <a class="btn btn--ghost" href="${C.directions}" target="_blank" rel="noopener">${icon('i-nav')}<span>Directions</span></a>
        </div>
      </div>`;
  }
  emList.addEventListener('click', e => { const b = e.target.closest('.em-btn'); if (b) selectEmergency(b); });
  roving(emList, '.em-btn', selectEmergency);
  selectEmergency(SC.emergencies[0].id);

  /* Aftercare */
  const acChips = $('[data-aftercare-chips]');
  const acDetail = $('[data-aftercare-detail]');
  acChips.innerHTML = SC.aftercare.map((a, i) =>
    `<button type="button" class="chip" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-ac="${a.id}"><span class="chip__check" aria-hidden="true">${icon('i-check')}</span>${esc(a.label)}</button>`
  ).join('');
  function selectAftercare(idOrBtn) {
    const btns = $$('.chip', acChips);
    const btn = typeof idOrBtn === 'string' ? btns.find(b => b.dataset.ac === idOrBtn) : idOrBtn;
    if (!btn) return;
    btns.forEach(b => b.setAttribute('aria-selected', b === btn));
    setRoving(btns, btn);
    scrollIntoRow(acChips, btn);
    const a = SC.aftercare.find(x => x.id === btn.dataset.ac);
    const list = arr => `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    acDetail.innerHTML = `
      <div class="care-col care-col--do" style="--i:0"><h4><span>${icon('i-check')}</span>Do</h4>${list(a.do)}</div>
      <div class="care-col care-col--avoid" style="--i:1"><h4><span>${icon('i-x')}</span>Avoid</h4>${list(a.avoid)}</div>
      <div class="care-col care-col--call" style="--i:2"><h4><span>${icon('i-phone')}</span>Call us if</h4>${list(a.call)}
        <a class="btn btn--ghost btn--sm" href="${C.phoneHref}">${icon('i-phone')}<span>${C.phone}</span></a></div>`;
  }
  acChips.addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) selectAftercare(b); });
  roving(acChips, '.chip', selectAftercare);
  selectAftercare(SC.aftercare[0].id);

  /* =========================================================
     Brushing timer
     ========================================================= */
  (() => {
    const TOTAL = 120, SECTION = 30, CIRC = 930;
    const QUADS = ['Upper right', 'Upper left', 'Lower left', 'Lower right'];
    const TIPS = [
      'Hold your brush at a 45° angle to the gumline and use gentle circles.',
      'Brush the outer, inner and chewing surfaces of every tooth.',
      'Go gentle. A soft-bristled brush and light pressure protect your gums.',
      'Spit, don’t rinse. A little fluoride toothpaste left behind keeps protecting your teeth.',
      'Finish by gently brushing your tongue for fresher breath.'
    ];
    const root = $('.timer');
    const ring = $('[data-timer-ring]');
    const timeEl = $('[data-timer-time]');
    const labelEl = $('[data-timer-label]');
    const toggle = $('[data-timer-toggle]');
    const resetBtn = $('[data-timer-reset]');
    const soundBtn = $('[data-timer-sound]');
    const tipEl = $('[data-timer-tip] span');
    const qPaths = $$('.mouth__q');
    const qItems = $$('[data-quadrants] li');
    const bubbles = $('[data-bubbles]');
    const stage = $('.timer__stage');

    let elapsed = 0, running = false, startAt = 0, tickId = 0, bubbleId = 0, lastQ = -1;
    let sound = store.get('timerSound', true);
    let audio;

    const setSoundUI = () => {
      soundBtn.setAttribute('aria-pressed', sound);
      soundBtn.innerHTML = icon(sound ? 'i-volume' : 'i-mute');
    };
    setSoundUI();

    function chime(notes = [880]) {
      if (!sound) return;
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        notes.forEach((f, i) => {
          const o = audio.createOscillator(), g = audio.createGain();
          const t = audio.currentTime + i * 0.16;
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
          o.connect(g).connect(audio.destination);
          o.start(t); o.stop(t + 0.4);
        });
      } catch { /* audio unavailable */ }
    }

    function fmtRemaining(sec) {
      const s = Math.max(0, Math.ceil(sec));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function setTip(i) {
      tipEl.style.opacity = 0;
      setTimeout(() => { tipEl.textContent = TIPS[i % TIPS.length]; tipEl.style.opacity = 1; }, 250);
    }

    function render() {
      const remaining = TOTAL - elapsed;
      timeEl.textContent = fmtRemaining(remaining);
      ring.style.strokeDashoffset = CIRC * (1 - elapsed / TOTAL);
      const q = elapsed >= TOTAL ? 4 : Math.floor(elapsed / SECTION);
      qPaths.forEach(p => {
        const i = +p.dataset.q;
        p.classList.toggle('is-active', running && i === q);
        p.classList.toggle('is-done', i < q);
      });
      qItems.forEach(li => {
        const i = +li.dataset.q;
        li.classList.toggle('is-active', (running || elapsed > 0) && i === q);
        li.classList.toggle('is-done', i < q);
      });
      if (elapsed > 0 && q < 4) {
        const left = SECTION - (elapsed % SECTION);
        labelEl.textContent = `${QUADS[q]} · ${Math.ceil(left)}s`;
      }
      if (running && q !== lastQ && q < 4) {
        if (lastQ !== -1) chime([660, 880]);
        setTip(q);
        lastQ = q;
      }
    }

    function spawnBubble() {
      const q = Math.floor(elapsed / SECTION);
      const path = qPaths.find(p => +p.dataset.q === q);
      if (!path || reduceMotion) return;
      const pt = path.getPointAtLength(Math.random() * path.getTotalLength());
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', (pt.x + (Math.random() * 16 - 8)).toFixed(1));
      c.setAttribute('cy', (pt.y + (Math.random() * 10 - 5)).toFixed(1));
      c.setAttribute('r', (2 + Math.random() * 4).toFixed(1));
      c.style.setProperty('--bx', `${(Math.random() * 20 - 10).toFixed(1)}px`);
      c.style.transformBox = 'fill-box';
      bubbles.append(c);
      setTimeout(() => c.remove(), 1700);
    }

    function setToggle(state) {
      const map = {
        start: ['i-play', 'Start brushing'],
        pause: ['i-pause', 'Pause'],
        resume: ['i-play', 'Resume'],
        again: ['i-reset', 'Brush again']
      }[state];
      toggle.innerHTML = `${icon(map[0])}<span>${map[1]}</span>`;
    }

    function start() {
      if (elapsed >= TOTAL) reset();
      running = true;
      root.classList.remove('is-done');
      startAt = performance.now() - elapsed * 1000;
      if (elapsed === 0) chime([880]);
      setToggle('pause');
      tickId = setInterval(() => {
        elapsed = Math.min(TOTAL, (performance.now() - startAt) / 1000);
        render();
        if (elapsed >= TOTAL) finish();
      }, 200);
      bubbleId = setInterval(spawnBubble, 260);
      render();
    }
    function pause() {
      running = false;
      clearInterval(tickId); clearInterval(bubbleId);
      setToggle('resume');
      labelEl.textContent = 'Paused';
      render();
    }
    function finish() {
      running = false;
      clearInterval(tickId); clearInterval(bubbleId);
      elapsed = TOTAL;
      render();
      root.classList.add('is-done');
      labelEl.textContent = 'Great job! Sparkling clean';
      tipEl.textContent = 'See you tonight. Brushing twice a day keeps cavities away.';
      setToggle('again');
      chime([660, 880, 1175]);
      if (!reduceMotion) {
        for (let i = 0; i < 14; i++) {
          const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          s.setAttribute('class', 'confetti');
          s.innerHTML = '<use href="#i-sparkle"/>';
          const a = (i / 14) * Math.PI * 2;
          const d = 110 + Math.random() * 70;
          s.style.setProperty('--cx', `${Math.cos(a) * d}px`);
          s.style.setProperty('--cy', `${Math.sin(a) * d}px`);
          s.style.animationDelay = `${Math.random() * 120}ms`;
          stage.append(s);
          setTimeout(() => s.remove(), 1500);
        }
      }
    }
    function reset() {
      running = false;
      clearInterval(tickId); clearInterval(bubbleId);
      elapsed = 0; lastQ = -1;
      root.classList.remove('is-done');
      ring.style.transition = 'none';
      render();
      void ring.getBoundingClientRect();
      ring.style.transition = '';
      labelEl.textContent = 'Ready when you are';
      tipEl.textContent = TIPS[0];
      setToggle('start');
    }

    toggle.addEventListener('click', () => (running ? pause() : start()));
    resetBtn.addEventListener('click', reset);
    soundBtn.addEventListener('click', () => { sound = !sound; store.set('timerSound', sound); setSoundUI(); });
    reset();
  })();

  /* =========================================================
     Check-up reminder
     ========================================================= */
  (() => {
    const form = $('[data-reminder-form]');
    const input = $('[data-last-visit]');
    const out = $('[data-reminder-result]');
    const DAY = 864e5;
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
    const addMonths = (date, m) => {
      const d = new Date(date);
      const day = d.getDate();
      d.setMonth(d.getMonth() + m);
      if (d.getDate() < day) d.setDate(0);
      return d;
    };
    const longDate = d => d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

    input.max = iso(today());

    function calendarActions(when) {
      const next = new Date(when.getTime() + DAY);
      const title = 'Dental check-up at SwiftCare';
      const details = `Time for your dental check-up and cleaning.\nBook online: ${C.bookUrl}\nCall: ${C.phone}`;
      const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${ymd(when)}/${ymd(next)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(C.address)}`;
      return `
        <button type="button" class="btn btn--ghost btn--sm" data-ics="${ymd(when)}">${icon('i-calendar')}<span>Add to calendar</span></button>
        <a class="btn btn--ghost btn--sm" href="${g}" target="_blank" rel="noopener">${icon('i-calendar')}<span>Google Calendar</span></a>`;
    }

    function render({ unsure = false } = {}) {
      const interval = +form.querySelector('input[name="interval"]:checked').value;
      const now = today();
      if (unsure) {
        out.innerHTML = `
          <div class="due due--overdue">
            <p class="due__label">Next check-up</p>
            <p class="due__date">As soon as you can</p>
            <div class="due__bar"><span style="width:100%"></span></div>
            <p class="due__msg due__msg--overdue">${icon('i-alert')}<span>If it’s been over a year, book a check-up and cleaning soon. Small problems are easier and more affordable to fix early.</span></p>
            <div class="due__actions">
              <a class="btn btn--gold btn--sm" href="${C.bookUrl}">${icon('i-calendar')}<span>Book now</span></a>
              <a class="btn btn--ghost btn--sm" href="${C.phoneHref}">${icon('i-phone')}<span>Call us</span></a>
            </div>
          </div>`;
        return;
      }
      if (!input.value) return;
      const [y, m, d] = input.value.split('-').map(Number);
      const last = new Date(y, m - 1, d);
      if (last > now) {
        out.innerHTML = `<div class="due"><p class="due__msg due__msg--soon">${icon('i-info')}<span>Please choose a date in the past.</span></p></div>`;
        return;
      }
      store.set('lastVisit', { date: input.value, interval });
      const due = addMonths(last, interval);
      const daysLeft = Math.round((due - now) / DAY);
      const pct = Math.min(100, Math.max(2, ((now - last) / (due - last)) * 100));
      const state = daysLeft < 0 ? 'overdue' : daysLeft <= 30 ? 'soon' : 'ok';
      const msg = {
        overdue: `You’re ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue. Book a check-up soon to catch any problems early.`,
        soon: daysLeft === 0 ? 'You’re due today. It’s a great time to book.' : `You’re due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. It’s a great time to book.`,
        ok: `You’re on track. Your next visit is in ${daysLeft} days.`
      }[state];
      const calDate = due < now ? new Date(now.getTime() + 7 * DAY) : due;
      out.innerHTML = `
        <div class="due due--${state}">
          <p class="due__label">Next check-up ${state === 'overdue' ? 'was due' : 'due'}</p>
          <p class="due__date">${longDate(due)}</p>
          <div class="due__bar"><span data-bar></span></div>
          <div class="due__meta"><span>Last visit ${last.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span><span>Every ${interval} months</span></div>
          <p class="due__msg due__msg--${state}">${icon(state === 'ok' ? 'i-check' : state === 'soon' ? 'i-bell' : 'i-alert')}<span>${msg}</span></p>
          <div class="due__actions">
            ${state !== 'ok' ? `<a class="btn btn--gold btn--sm" href="${C.bookUrl}">${icon('i-calendar')}<span>Book now</span></a>` : ''}
            ${calendarActions(calDate)}
          </div>
          ${due < now ? '<p class="disclaimer">Calendar reminders are set for one week from today.</p>' : ''}
        </div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => { $('[data-bar]', out).style.width = `${pct}%`; }));
    }

    function downloadIcs(dateStr) {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      const y = +dateStr.slice(0, 4), m = +dateStr.slice(4, 6), d = +dateStr.slice(6, 8);
      const endStr = ymd(new Date(new Date(y, m - 1, d).getTime() + DAY));
      const escIcs = s => s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
      const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SwiftCare Dental//Check-up Reminder//EN', 'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${stamp}-${dateStr}@swiftcaredental.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${endStr}`,
        'SUMMARY:Dental check-up at SwiftCare',
        `DESCRIPTION:${escIcs(`Time for your dental check-up and cleaning.\nBook online: ${C.bookUrl}\nCall: ${C.phone}`)}`,
        `LOCATION:${escIcs(C.address)}`,
        'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:Book your dental check-up', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'swiftcare-checkup.ics' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Reminder saved. Open the file to add it to your calendar');
    }

    form.addEventListener('input', () => render());
    form.addEventListener('submit', e => e.preventDefault());
    $('[data-reminder-unsure]').addEventListener('click', () => { input.value = ''; render({ unsure: true }); });
    out.addEventListener('click', e => { const b = e.target.closest('[data-ics]'); if (b) downloadIcs(b.dataset.ics); });

    const saved = store.get('lastVisit', null);
    if (saved?.date) {
      input.value = saved.date;
      const radio = form.querySelector(`input[name="interval"][value="${saved.interval}"]`);
      if (radio) radio.checked = true;
      render();
    }
  })();

  /* =========================================================
     Testimonials carousel
     ========================================================= */
  (() => {
    const root = $('[data-carousel]');
    const track = $('[data-carousel-track]');
    const dotsEl = $('[data-carousel-dots]');
    const list = SC.testimonials;
    const DUR = 7000;
    let index = 0, timer = 0, paused = false, inView = false;

    track.innerHTML = list.map((t, i) => {
      const initials = t.name.split(' ').map(w => w[0]).slice(0, 2).join('');
      return `<figure class="story${i === 0 ? ' is-active' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}" ${i ? 'aria-hidden="true"' : ''}>
        <svg class="story__quote-mark" aria-hidden="true"><use href="#i-quote"/></svg>
        <div>
          <blockquote>“${esc(t.quote)}”</blockquote>
          <figcaption>
            <span class="story__avatar" aria-hidden="true">${esc(initials)}</span>
            <span><span class="story__name">${esc(t.name)}</span><span class="story__meta">${esc(t.place)}</span></span>
            <span class="story__tag">${esc(t.tag)}</span>
          </figcaption>
        </div>
      </figure>`;
    }).join('');
    dotsEl.innerHTML = list.map((_, i) => `<button type="button" class="carousel__dot" aria-label="Show story ${i + 1}" data-dot="${i}"><span></span></button>`).join('');
    const slides = $$('.story', track);
    const dots = $$('.carousel__dot', dotsEl);

    function go(i, user = false) {
      index = (i + list.length) % list.length;
      track.style.transform = `translateX(${-index * 100}%)`;
      slides.forEach((s, n) => {
        s.classList.toggle('is-active', n === index);
        s.setAttribute('aria-hidden', n !== index);
      });
      dots.forEach((d, n) => {
        d.setAttribute('aria-current', n === index);
        d.innerHTML = '<span></span>';
        d.style.setProperty('--dur', `${DUR}ms`);
      });
      schedule();
      if (user) root.classList.remove('is-paused');
    }
    function schedule() {
      clearTimeout(timer);
      const playing = !reduceMotion && !paused && inView && !document.hidden;
      root.classList.toggle('is-paused', !playing);
      if (reduceMotion) root.classList.add('is-paused');
      if (playing) timer = setTimeout(() => go(index + 1), DUR);
    }

    $('[data-carousel-prev]').addEventListener('click', () => go(index - 1, true));
    $('[data-carousel-next]').addEventListener('click', () => go(index + 1, true));
    dotsEl.addEventListener('click', e => { const d = e.target.closest('[data-dot]'); if (d) go(+d.dataset.dot, true); });
    root.addEventListener('mouseenter', () => { paused = true; schedule(); });
    root.addEventListener('mouseleave', () => { paused = false; go(index); });
    root.addEventListener('focusin', () => { paused = true; schedule(); });
    root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { paused = false; go(index); } });
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') go(index + 1, true);
      if (e.key === 'ArrowLeft') go(index - 1, true);
    });
    document.addEventListener('visibilitychange', schedule);
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; go(index); }, { threshold: 0.4 }).observe(root);

    let startX = null;
    const vp = $('.carousel__viewport', root);
    vp.addEventListener('pointerdown', e => { startX = e.clientX; });
    vp.addEventListener('pointerup', e => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1), true);
      startX = null;
    });
    go(0);
  })();

  /* =========================================================
     FAQ accordion
     ========================================================= */
  const acc = $('[data-accordion]');
  acc.innerHTML = SC.faqs.map((f, i) => `
    <div class="acc-item" data-reveal>
      <h3><button type="button" class="acc-q" id="faq-q-${i}" aria-expanded="false" aria-controls="faq-a-${i}">${esc(f.q)}<span class="acc-icon" aria-hidden="true">${icon('i-plus')}</span></button></h3>
      <div class="acc-a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}" inert><div><p>${esc(f.a)}</p></div></div>
    </div>`).join('');
  acc.addEventListener('click', e => {
    const q = e.target.closest('.acc-q');
    if (!q) return;
    const open = q.getAttribute('aria-expanded') !== 'true';
    q.setAttribute('aria-expanded', open);
    q.closest('.acc-item').classList.toggle('is-open', open);
    const panel = $('#' + q.getAttribute('aria-controls'));
    open ? panel.removeAttribute('inert') : panel.setAttribute('inert', '');
  });

  /* =========================================================
     CTA sparkles, copy buttons, year
     ========================================================= */
  const ctaSparkles = $('[data-cta-sparkles]');
  if (ctaSparkles) {
    const spots = [[8, 20], [16, 70], [26, 34], [38, 84], [62, 14], [72, 76], [84, 30], [92, 62], [50, 92], [4, 52], [96, 12], [30, 8]];
    ctaSparkles.innerHTML = spots.map(([x, y], i) => {
      const size = 8 + ((i * 7) % 16);
      return `<svg style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation-delay:${(i * 0.37) % 3}s;animation-duration:${2.6 + (i % 4) * 0.5}s"><use href="#i-sparkle"/></svg>`;
    }).join('');
  }

  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* =========================================================
     Global delegated actions
     ========================================================= */
  document.addEventListener('click', e => {
    const svc = e.target.closest('[data-open-service]');
    if (svc) { openService(svc.dataset.openService); return; }

    const tabLink = e.target.closest('[data-open-tab]');
    if (tabLink) {
      e.preventDefault();
      closeDrawer();
      if (menuOpen) setMenu(false);
      selectCareTab(tabLink.dataset.openTab);
      if (tabLink.dataset.emergency) selectEmergency(tabLink.dataset.emergency);
      if (tabLink.dataset.aftercare) selectAftercare(tabLink.dataset.aftercare);
      setTimeout(() => scrollToEl($('#care')), drawer.open ? 400 : 0);
      return;
    }

    const prices = e.target.closest('[data-show-prices]');
    if (prices) { flashPrices(prices.dataset.showPrices.split(',')); return; }

    const copy = e.target.closest('[data-copy]');
    if (copy) copyText(copy.dataset.copy);
  });

  // Reveal everything last so rendered sections are included.
  observeReveals();
  requestAnimationFrame(syncThumbs);
})();
