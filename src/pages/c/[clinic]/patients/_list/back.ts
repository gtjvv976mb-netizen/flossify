// "Back to patients" returns to the list as the person left it — the same
// search, filter and sort — not to the bare list: a secretary working through
// "Needs attention" opens a record, adds the birth date, goes back, and is
// where she was (docs/workspace-redesign.md, "Patients tab").
//
// The Patients tab's script (index.astro) keeps the list's address for this
// browser tab and branch (sessionStorage, keepListAddress); the record, Add
// patient and Import mark their link data-pts-back, and restoreBackLinks() puts
// the kept address on it. Only this branch's list, and only its q, f and sort,
// are taken back; with nothing kept, or no storage at all (a private window,
// blocked site data), the plain link to the list stays as it is.
const KEY = 'flossify:patients-list:';
const STATE = ['q', 'f', 'sort'] as const;

/** The list's own address, kept for "Back to patients". base: /c/<slug>/patients/. */
export function keepListAddress(base: string, search: string): void {
  const slug = base.match(/^\/c\/([^/]+)\/patients\/$/)?.[1];
  if (!slug) return;
  try { sessionStorage.setItem(KEY + slug, search); } catch { /* no storage: the plain link stays */ }
}

/** Every link marked data-pts-back (href /c/<slug>/patients/) goes to the list as it was left. */
export function restoreBackLinks(): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-pts-back]')) {
    const base = a.getAttribute('href') ?? '';
    const slug = base.match(/^\/c\/([^/]+)\/patients\/$/)?.[1];
    if (!slug) continue;
    let kept: string | null = null;
    try { kept = sessionStorage.getItem(KEY + slug); } catch { /* no storage */ }
    if (!kept) continue;
    const from = new URLSearchParams(kept);
    const to = new URLSearchParams();
    for (const k of STATE) { const v = from.get(k)?.slice(0, 80); if (v) to.set(k, v); }
    const s = to.toString();
    a.href = s ? `${base}?${s}` : base;
  }
}
