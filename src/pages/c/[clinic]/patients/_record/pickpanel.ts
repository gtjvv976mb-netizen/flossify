// What the record's side panels share in the browser: where a form comes back to, and where focus goes when the
// panel closes.
//
// Every panel form posts `back`: the tab it was opened over (the page's script and the tooth-first panels,
// TreatmentPanels and NotePanel, set it as the panel opens). The form's address then ends #<back>, so a refused post
// comes back over that tab with its panel open, and a saved one lands there with its saved line. A panel opened from
// the chart's palette posts back=chart and is the one that gives focus back to its tooth.
import { backOf } from './sections';

/** The tab the record shows now (overview · patient · chart · treatment-record), or '' before there is one. */
export function currentTab(): string {
  const t = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
  return t ? t.id.replace(/^rec-rec-|-tab$/g, '') : '';
}

/** Point a form at `#<back>` (the tab it was opened over) or, with no back, at its own section's anchor. */
export function aimForm(form: HTMLFormElement, back: string, home: string): void {
  const u = new URL(form.action, location.href);
  u.hash = backOf(back) ?? home;
  form.action = u.href;
}

/** On ws:panel-close. A panel from the chart gives focus back to its tooth (the palette button that opened it is not
 *  on screen any more); any other panel lands as landFocus() says. */
export function focusBack(panelId: string, back: string, fdi: string | undefined): void {
  if (back === 'chart' && fdi) {
    const tooth = document.querySelector<HTMLElement>(`[data-odontogram] button[data-tooth][data-fdi="${fdi}"]`);
    if (tooth) { tooth.focus(); return; }
  }
  landFocus(panelId);
}

const onScreen = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && e.getClientRects().length > 0;

/** On ws:panel-close, for every panel of the record: when the shell could not give focus back (the button that opened
 *  the panel sits in a closed menu or a hidden tab, or there was none: a panel the server drew open after a refused
 *  post), focus goes to a button on screen that opens this panel, else Add ▾ when its list holds the panel, else the
 *  tab in view. Never to <body>, where the next Tab would start from the top of the page. */
export function landFocus(panelId: string): void {
  if (document.activeElement !== document.body && onScreen(document.activeElement)) return;
  const own = [...document.querySelectorAll(`[data-ws-open="${panelId}"]`)].find(onScreen);
  if (own) { own.focus(); return; }
  const add = document.querySelector('.rec-add > button');
  if (onScreen(add) && document.querySelector(`[data-rec-add-item][data-ws-open="${panelId}"]`)) { add.focus(); return; }
  const shown = document.querySelector<HTMLElement>('[data-rec-panel]:not([hidden])');
  if (shown) document.getElementById(`rec-rec-${shown.dataset.recPanel}-tab`)?.focus();
}
