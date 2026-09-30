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
 *  on screen any more). Otherwise, when focus did not land (its opener sits in a closed menu or a hidden section):
 *  the shown section's own button for this panel, else that section's tab. */
export function focusBack(panelId: string, back: string, fdi: string | undefined): void {
  if (back === 'chart' && fdi) {
    const tooth = document.querySelector<HTMLElement>(`[data-odontogram] button[data-tooth][data-fdi="${fdi}"]`);
    if (tooth) { tooth.focus(); return; }
  }
  const at = document.activeElement;
  if (at && at !== document.body) return;
  const shown = document.querySelector<HTMLElement>('[data-rec-panel]:not([hidden])');
  if (!shown) return;
  const own = [...shown.querySelectorAll<HTMLElement>(`[data-ws-open="${panelId}"]`)].find((e) => e.getClientRects().length > 0);
  if (own) { own.focus(); return; }
  document.getElementById(`rec-rec-${shown.dataset.recPanel}-tab`)?.focus();
}
