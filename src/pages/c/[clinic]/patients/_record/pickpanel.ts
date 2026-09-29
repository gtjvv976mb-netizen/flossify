// What the record's tooth-first panels (TreatmentPanels, NotePanel) share in the browser: where a form comes back
// to, and where focus goes when the panel closes.
//
// A panel opened from the chart's palette posts back=chart: the form's address ends #chart, so a refused post
// comes back over the Chart section, and a saved one lands on the chart with its line. Any other opener clears it.

/** Point a form at `#chart` (back=chart) or at its own section's anchor. */
export function aimForm(form: HTMLFormElement, back: string, home: string): void {
  const u = new URL(form.action, location.href);
  u.hash = back === 'chart' ? 'chart' : home;
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
