// The headline numbers of the record's inventory (inv.mjs, panels.mjs output), counted the way the design
// inventory counted them (simplify-result.json, inventory.buttonsPerSection):
//   a "button" = a visible <button>, <summary>, or <a> drawn as a button (ws-btn, tile link, menu item …);
//   plain text links, tooth buttons (32) and form controls are counted apart.
//   first load  = the record's controls in <main> on first load (buttons + link-buttons + disclosures + tabs),
//                 and with the workspace shell (the whole <body>);
//   per section = the section's own buttons with it open (not the head, the tabs or This visit);
//   total       = Σ sections (teeth apart) + head + tabs + This visit.
// node summarize.mjs <dir with inventory-owner.json, inventory-dentist.json, panels-*.json> [> summary.txt]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const dir = process.argv[2] ?? '/tmp/fl-simple-scratch/baseline/inv';
const out = {};
const btn = (v) => (v ? v.buttons + v.linkButtons + v.disclosures : 0);
for (const who of ['owner', 'dentist']) {
  const f = `${dir}/inventory-${who}.json`;
  if (!existsSync(f)) continue;
  const inv = JSON.parse(readFileSync(f, 'utf8'));
  for (const [key, R] of Object.entries(inv)) {
    const sec = {};
    let teeth = 0, all = 0, tealMax = 0;
    for (const [id, s] of Object.entries(R.sections)) {
      const n = btn(s.visible);
      sec[id] = { buttons: n - (s.visible.toothButtons ?? 0), teeth: s.visible.toothButtons ?? 0, textLinks: s.visible.textLinks, teal: s.visible.teal, height: s.height, words: s.words, chips: s.chips.length, cards: s.cards.length, banner: s.title ?? null };
      teeth += s.visible.toothButtons ?? 0; all += n;
    }
    const head = btn(R.headDetail?.visible);
    const strip = btn(R.stripDetail?.visible);
    const tabs = R.tabs.tabs.length;
    // Teal on one screen: the section's own, plus the head's and the strip's (always on screen with it).
    for (const s of Object.values(R.sections)) tealMax = Math.max(tealMax, s.visible.teal + (R.headDetail?.visible.teal ?? 0) + (R.stripDetail?.visible.teal ?? 0));
    out[key] = {
      tabs, tabIds: R.tabs.tabs.map((t) => t.id).join(' '), groups: [...new Set(R.tabs.tabs.map((t) => t.group))].length,
      firstLoad: { record: btn(R.mainFirst.visible) + R.mainFirst.visible.tabs, withShell: btn(R.pageFirst.visible) + R.pageFirst.visible.tabs, teal: R.mainFirst.visible.teal, textLinks: R.mainFirst.visible.textLinks, words: R.mainFirst.words },
      alwaysOn: { head, tabs, strip, moreMenu: R.head.more.length },
      totalWithoutTeeth: all - teeth + head + tabs + strip, totalWithTeeth: all + head + tabs + strip, sectionsSum: all, sectionsSumWithoutTeeth: all - teeth,
      tealMaxOnOneScreen: tealMax,
      headChips: R.head.chips.map((c) => `${c.text}${c.clickable ? ' [button]' : ''}`), headTiles: R.head.tiles.map((t) => t.text), headHeight: R.head.height,
      strip: R.strip ? { height: R.strip.height, lines: R.strip.lines.length, meta: R.strip.meta } : null,
      banners: Object.values(R.sections).filter((s) => s.title).length,
      panels: R.panels.length, panelIds: R.panels.map((p) => p.id.replace(/^rec-visit-.*/, 'rec-visit-*')).filter((x, i, a) => a.indexOf(x) === i),
      sections: sec,
    };
  }
}
const panels = {};
for (const who of ['owner', 'dentist']) {
  const f = `${dir}/panels-${who}.json`;
  if (!existsSync(f)) continue;
  for (const [k, list] of Object.entries(JSON.parse(readFileSync(f, 'utf8')))) {
    panels[k] = { count: list.length, visit: list.filter((p) => p.id.startsWith('rec-visit-')).length, form: list.filter((p) => !p.id.startsWith('rec-visit-')).length,
      buttonsInside: list.reduce((n, p) => n + p.buttons.length, 0), fieldsInside: list.reduce((n, p) => n + p.fields, 0),
      noOpener: list.filter((p) => !p.openers.length).map((p) => p.id), forms: list.filter((p) => !p.id.startsWith('rec-visit-')).map((p) => `${p.id} (${p.openers.map((o) => o.where).join(', ') || 'no opener'})`) };
  }
}
writeFileSync(`${dir}/summary.json`, JSON.stringify({ record: out, panels }, null, 1));
for (const [k, r] of Object.entries(out)) {
  console.log(`\n== ${k}`);
  console.log(`tabs ${r.tabs} (${r.groups} groups): ${r.tabIds}`);
  console.log(`first load: ${r.firstLoad.record} controls in the record (${r.firstLoad.withShell} with the shell), ${r.firstLoad.teal} teal, ${r.firstLoad.textLinks} text links, ${r.firstLoad.words} words`);
  console.log(`always on: head ${r.alwaysOn.head}, tabs ${r.alwaysOn.tabs}, This visit ${r.alwaysOn.strip}; More menu ${r.alwaysOn.moreMenu} items`);
  console.log(`whole record: ${r.totalWithoutTeeth} buttons without the teeth, ${r.totalWithTeeth} with (sections ${r.sectionsSumWithoutTeeth} + ${r.sectionsSum - r.sectionsSumWithoutTeeth} teeth); teal on one screen at most ${r.tealMaxOnOneScreen}`);
  console.log(`head: ${r.headHeight}px, chips [${r.headChips.join(' | ')}], tiles ${r.headTiles.length}; banners ${r.banners}; This visit ${r.strip ? `${r.strip.height}px, ${r.strip.lines} lines` : 'none'}`);
  console.log(`panels ${r.panels}; per section: ${Object.entries(r.sections).map(([id, s]) => `${id} ${s.buttons}${s.teeth ? `+${s.teeth}t` : ''}`).join(', ')}`);
}
console.log('\n== panels (opened one by one, 1440)');
for (const [k, p] of Object.entries(panels)) console.log(`${k}: ${p.count} (${p.form} forms, ${p.visit} visits), ${p.buttonsInside} buttons and ${p.fieldsInside} fields inside; no opener: ${p.noOpener.join(', ') || 'none'}`);
