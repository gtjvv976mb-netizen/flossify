// The record's colours. Four tabs (below), each with one hue on its icon; every card keeps a top edge and an icon
// in the hue of what it holds (CARD_HUE): teal for the visit, rose for health, blue for clinical work, violet for
// documents and the ledger, green for money — hues the workspace already has in both themes, and never amber or
// red, which keep their meanings ("needs attention", "blocked"). Colour is never alone: every tab and card also
// says what it is in words.
import type { GlyphName } from '../_ui/glyphs';

export type Hue = 'teal' | 'rose' | 'blue' | 'violet' | 'green';
export interface SectionMeta { hue: Hue; icon: GlyphName }

/** The record's old twelve sections: their hue and icon. They are names now, not tabs: TAB_OF puts each in a tab. */
export const SECTION_META: Record<string, SectionMeta> = {
  overview: { hue: 'teal', icon: 'user' },
  'treatment-record': { hue: 'teal', icon: 'history' },
  visits: { hue: 'teal', icon: 'calendar' },
  health: { hue: 'rose', icon: 'heart' },
  chart: { hue: 'blue', icon: 'tooth' },
  treatment: { hue: 'blue', icon: 'plan' },
  notes: { hue: 'blue', icon: 'pen' },
  files: { hue: 'blue', icon: 'image' },
  rx: { hue: 'violet', icon: 'pill' },
  consent: { hue: 'violet', icon: 'shield' },
  texts: { hue: 'violet', icon: 'message' },
  money: { hue: 'green', icon: 'money' },
};
/** A card's hue (its top edge and icon), by the section it came from: the ledger is violet like its tab, and the
 *  payment plans green like the money they hold. */
export const CARD_HUE: Readonly<Record<string, Hue>> = {
  ...Object.fromEntries(Object.entries(SECTION_META).map(([k, m]) => [k, m.hue])),
  'treatment-record': 'violet', payplans: 'green',
};

// --- the four tabs (the simpler record) -------------------------------------------------------------------
// The record is four tabs: Today, Patient info, Chart & plan and the Treatment record. Each keeps one hue on its
// icon (Today teal, Patient info rose, Chart & plan blue, Treatment record violet); `short` is the label on a
// phone's five-column row. The ids stay the elements' ids (rec-rec-<id>-tab, rec-<id>); `patient` is new, so
// the old `health` is only a name that TAB_OF resolves.
export type TabId = 'overview' | 'patient' | 'chart' | 'treatment-record';
export interface TabMeta { id: TabId; label: string; short: string; hue: Hue; icon: GlyphName }
export const TABS: readonly TabMeta[] = [
  { id: 'overview', label: 'Today', short: 'Today', hue: 'teal', icon: 'calendar' },
  { id: 'patient', label: 'Patient info', short: 'Patient', hue: 'rose', icon: 'user' },
  { id: 'chart', label: 'Chart & plan', short: 'Chart', hue: 'blue', icon: 'tooth' },
  { id: 'treatment-record', label: 'Treatment record', short: 'Record', hue: 'violet', icon: 'history' },
];

/**
 * Every old section name and every anchor a link or a post lands on → the tab it now lives in. The one map the
 * record reads a name through: the server's first tab (a post's section, a saved word's section, a panel to open,
 * a visit), `back`, the client's show() for data-rec-go, and a link's #hash when its element is
 * not on the page (a dentist's #money, #loas with no LOA). `npm run test:record-tabs` fails when a name the page,
 * record.ts or record-extra.ts can produce, or a link elsewhere points at, is missing here.
 */
export const TAB_OF: Readonly<Record<string, TabId>> = {
  // Today: this visit, what is coming, the next check-up
  overview: 'overview', 'this-visit': 'overview', visits: 'overview', recall: 'overview',
  // Patient info: details, health (blood pressure), consent
  patient: 'patient', health: 'patient', vitals: 'patient', consent: 'patient', 'consent-paper': 'patient', 'consent-forms': 'patient',
  'visit-consents': 'patient', 'patient-forms': 'patient', 'details-card': 'patient',
  // Chart & plan: the chart, its offer, the plan and work done, X-rays and photos, lab cases, HMO approvals, payment plans
  chart: 'chart', 'chart-offer': 'chart', treatment: 'chart', 'treatment-done': 'chart', 'treatment-lab': 'chart', loas: 'chart', payplans: 'chart', files: 'chart',
  // Treatment record: the ledger, clinical notes, prescriptions and letters, statements, texts
  'treatment-record': 'treatment-record', timeline: 'treatment-record', notes: 'treatment-record', rx: 'treatment-record', letters: 'treatment-record',
  money: 'treatment-record', texts: 'treatment-record',
};
/** The tab a section name or an anchor lives in, or null for a name nobody knows. */
export const tabOf = (name: string | null | undefined): TabId | null => (name && Object.hasOwn(TAB_OF, name) ? TAB_OF[name] : null);

// --- where a post, a saved line or a link lands (in the old section names; TAB_OF maps them to a tab) ----------
/** Where on the page a clinical-record post lands again (an element id). record-extra.ts has EXTRA_ANCHOR. */
export const ANCHOR: Readonly<Record<string, string>> = { 'done-add': 'treatment-done', 'lab-add': 'treatment-lab', 'lab-next': 'treatment-lab', 'recall-set': 'recall', 'recall-done': 'recall', 'recall-clear': 'recall' };
/** ?saved=<word> after one of the page's own posts (and the consent pages', the intake's, Add patient's) → its section. */
export const SAVED_TO: Readonly<Record<string, string>> = {
  intake: 'overview', capacity: 'consent', 'consent-removed': 'consent', health: 'health', birth: 'health', nothing: 'health', consent: 'consent',
  'consent-already': 'consent', paper: 'consent', details: 'overview', new: 'overview', form: 'overview',
};
/** A clinical-record save names its section by its first word (plan-done, rx:<id>, files:3, recall-cleared …). */
export const SAVED_WORD: Readonly<Record<string, string>> = {
  plan: 'treatment', done: 'treatment', lab: 'treatment', note: 'notes', addendum: 'notes', rx: 'rx', file: 'files', files: 'files', recall: 'overview',
  vitals: 'health', letter: 'rx', answered: 'rx', loa: 'treatment', payplan: 'treatment', adjusted: 'treatment', charted: 'treatment',
};
export const recordSaved = (s: string | null): string | null => {
  const w = (s ?? '').split(/[-:]/)[0];
  return Object.hasOwn(SAVED_WORD, w) ? SAVED_WORD[w] : null;
};
/** The card a save that carries no back lands on (a card's own button: the next check-up, a plan row, a lab case, a
 *  file, an LOA, a payment plan; or a panel posted without its back), by the saved word's first word. The page's
 *  redirect names it as the #hash, and the page draws the saved line inside that card, under its title, so it is on
 *  screen where the address lands. A save with a back lands on its tab and says so at the tab's top; a treatment the
 *  chart could show (?treated=) says so at the chart's offer. */
export const SAVED_CARD: Readonly<Record<string, string>> = {
  recall: 'recall', plan: 'treatment', done: 'treatment-done', lab: 'treatment-lab', note: 'notes', addendum: 'notes', rx: 'rx',
  file: 'files', files: 'files', vitals: 'vitals', letter: 'letters', answered: 'letters', loa: 'loas', payplan: 'payplans', adjusted: 'payplans',
};
export const savedCard = (s: string | null): string | null => {
  const w = (s ?? '').split(/[-:]/)[0];
  return Object.hasOwn(SAVED_CARD, w) ? SAVED_CARD[w] : null;
};
/** ?open=vitals|note|rx|done|file|details: the panel the page opens as it loads (the Dashboard's "Take it", "Write the
 *  note", the desk note's "Edit") → the tab shown behind it. The panels live outside the tabs, so every one opens
 *  over Today. */
export const OPEN_PANEL: Readonly<Record<string, string>> = { vitals: 'overview', note: 'overview', rx: 'overview', done: 'overview', file: 'overview', details: 'overview' };
/** The `back` a record form or an address may carry: the tab a panel was opened over (the page's script sets it; the
 *  chart's palette sends chart), or null. An old back=treatment is the Chart & plan tab now. */
export const backOf = (v: unknown): TabId | null =>
  v === 'overview' ? 'overview' : v === 'patient' ? 'patient' : v === 'chart' || v === 'treatment' ? 'chart' : v === 'treatment-record' ? 'treatment-record' : null;
/**
 * The section showing first (the page shows its tab, TAB_OF): where a post came back to, the chart for a treatment
 * the chart could show (?treated=, the chart's offer is drawn only there), the tab a saved panel was opened over
 * (?back=), the section of what was just saved, the tab of a panel to open, the Treatment record (or Visits) for
 * another day's visit (?visit=), else Today.
 * visit: 'today' when ?visit= is today's visit (This visit shows it), 'ledger' for another day's visit on the
 * Treatment record, 'other' for another day's visit that is not (a future one, a cancelled one that holds nothing).
 */
export function landingSection(o: { backTo: string | null; treated: boolean; back: TabId | null; saved: string | null; openNow: string | null; visit: 'today' | 'ledger' | 'other' | null }): string {
  return o.backTo ?? (o.treated ? 'chart' : null) ?? o.back ?? (Object.hasOwn(SAVED_TO, o.saved ?? '') ? SAVED_TO[o.saved ?? ''] : null) ?? recordSaved(o.saved)
    ?? (o.openNow ? OPEN_PANEL[o.openNow] : o.visit === 'ledger' ? 'treatment-record' : o.visit === 'other' ? 'visits' : 'overview');
}
