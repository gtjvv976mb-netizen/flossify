// The record's sections, grouped and colour-coded so a person always knows where they are: the same hue on
// the section's button in the record's index, its banner, its cards' top edge and icons, and its lines on
// the Treatment record. Five groups, each a hue the workspace already has in both themes — teal for the patient,
// rose for health, blue for clinical work, violet for documents, green for money — and never amber or red,
// which keep their meanings ("needs attention", "blocked"). Colour is never alone: every button, banner
// and card also says its group and name in words.
import type { GlyphName } from '../_ui/glyphs';

export type Hue = 'teal' | 'rose' | 'blue' | 'violet' | 'green';
export interface SectionMeta { group: string; hue: Hue; icon: GlyphName; blurb: string }

export const GROUPS: { name: string; hue: Hue }[] = [
  { name: 'Patient', hue: 'teal' },
  { name: 'Health', hue: 'rose' },
  { name: 'Clinical', hue: 'blue' },
  { name: 'Documents', hue: 'violet' },
  { name: 'Billing', hue: 'green' },
];

export const SECTION_META: Record<string, SectionMeta> = {
  overview: { group: 'Patient', hue: 'teal', icon: 'user', blurb: 'Who they are, the next check-up, and each part of the record in short.' },
  'treatment-record': { group: 'Patient', hue: 'teal', icon: 'history', blurb: 'Every treatment by date: the tooth, the procedure and the dentist, as on the paper treatment record.' },
  visits: { group: 'Patient', hue: 'teal', icon: 'calendar', blurb: 'Every booking and visit, past and coming.' },
  health: { group: 'Health', hue: 'rose', icon: 'heart', blurb: 'Blood pressure, allergies, conditions and medicines. Check before treatment.' },
  chart: { group: 'Clinical', hue: 'blue', icon: 'tooth', blurb: 'The teeth as they are. Every change saves as you make it.' },
  treatment: { group: 'Clinical', hue: 'blue', icon: 'plan', blurb: 'The plan, work done, lab cases, HMO approvals and payment plans.' },
  notes: { group: 'Clinical', hue: 'blue', icon: 'pen', blurb: 'What the dentist found and did at each visit.' },
  files: { group: 'Clinical', hue: 'blue', icon: 'image', blurb: 'X-rays, photos and scanned papers.' },
  rx: { group: 'Documents', hue: 'violet', icon: 'pill', blurb: 'Prescriptions, certificates, referrals and clearance requests to print.' },
  consent: { group: 'Documents', hue: 'violet', icon: 'shield', blurb: 'The privacy notice, the treatment consent and the patient forms.' },
  texts: { group: 'Documents', hue: 'violet', icon: 'message', blurb: 'Texts sent to and from this patient.' },
  money: { group: 'Billing', hue: 'green', icon: 'money', blurb: 'Statements, payments and what is owed.' },
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
 * a visit), `back`, the client's show() for data-rec-go / data-rec-show, and a link's #hash when its element is
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
/** ?open=vitals|note|rx|done|file|details: the panel the page opens as it loads (the Dashboard's "Take it", "Write the
 *  note", the desk note's "Edit") → the section shown behind it. */
export const OPEN_PANEL: Readonly<Record<string, string>> = { vitals: 'health', note: 'notes', rx: 'rx', done: 'treatment', file: 'files', details: 'overview' };
/** The `back` a record form may carry (a panel the chart's palette opened posts back=chart), or null. */
export const backOf = (v: unknown): 'chart' | 'treatment' | null => (v === 'chart' ? 'chart' : v === 'treatment' ? 'treatment' : null);
/**
 * The section showing first: where a post came back to, the section of what was just saved, the section of a
 * panel to open, the Treatment record (or Visits) for another day's visit (?visit=), else the Overview.
 * visit: 'today' when ?visit= is today's visit (This visit shows it), 'ledger' for another day's visit on the
 * Treatment record, 'other' for another day's visit that is not (a future one, a cancelled one that holds nothing).
 */
export function landingSection(o: { backTo: string | null; fromChart: boolean; saved: string | null; openNow: string | null; visit: 'today' | 'ledger' | 'other' | null }): string {
  return o.backTo ?? (o.fromChart ? 'chart' : null) ?? (Object.hasOwn(SAVED_TO, o.saved ?? '') ? SAVED_TO[o.saved ?? ''] : null) ?? recordSaved(o.saved)
    ?? (o.openNow ? OPEN_PANEL[o.openNow] : o.visit === 'ledger' ? 'treatment-record' : o.visit === 'other' ? 'visits' : 'overview');
}
