// Every place in the workspace by the name it has on screen, in one module (docs/glossary.md, "Places"): the four
// tabs, the sections of Clinic settings, and the pages and record parts a sentence sends someone to. A sentence that
// points somewhere says the place's name from here, with an arrow for the path ("Clinic settings → People"), so a
// rename (2.24's sections) changes every sentence that reads it at once; a few headings and older sentences still write
// a name out, so a rename searches for the old one too. A link that goes there is settingsAt(), straight to the
// section, never through an old address.
//
// No imports, and only erasable TypeScript: the pages, the libraries, the calendar's script in the browser and plain
// Node (the unit tests) all read it. No retired word may be written here (npm run test:words reads its strings).

/** The workspace's four tabs. `short` is the phone's tab row. */
export const TABS = {
  dashboard: { label: 'Dashboard', short: 'Dashboard' },
  patients: { label: 'Patients', short: 'Patients' },
  finances: { label: 'Finances', short: 'Finances' },
  settings: { label: 'Clinic settings', short: 'Settings' },
} as const;

/** The one Clinic settings page, section by section, in the order its list shows them: a short plain name and the
 *  shell's line icon for each (src/components/ws/icons.ts). The id is the section's id on the page (#people). */
export const SECTIONS = [
  { id: 'profile', label: 'Clinic profile', icon: 'clinic' },
  { id: 'hours', label: 'Opening hours', icon: 'clock' },
  { id: 'closed', label: 'Closed days', icon: 'calendar' },
  { id: 'fees', label: 'Services & prices', icon: 'money' },
  { id: 'people', label: 'People', icon: 'patients' },
  { id: 'roles', label: 'Roles', icon: 'shield' },
  { id: 'photos', label: 'Photos', icon: 'upload' },
  { id: 'privacy', label: 'Privacy', icon: 'check' },
  { id: 'tablets', label: 'Clinic tablets', icon: 'phone' },
  { id: 'plan', label: 'Your Flossify plan', icon: 'file' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];
export const isSection = (s: string | null): s is SectionId => SECTIONS.some((x) => x.id === s);
/** A section's name: sectionName('closed') → "Closed days". */
export const sectionName = (id: SectionId): string => SECTIONS.find((s) => s.id === id)!.label;

/** A named part inside a section: the section it is in, its heading, and the id the page gives it. */
export const PARTS = {
  hmos: { in: 'profile', label: 'HMOs you accept', anchor: 'hmos' },
} as const satisfies Record<string, { in: SectionId; label: string; anchor: string }>;
export type PartId = keyof typeof PARTS;
/** A section, or a part inside one. */
export type SettingsPlace = SectionId | PartId;

/** The arrow of a path on screen. A text message cannot carry it (it is not GSM-7): inText() turns it into a comma. */
export const ARROW = ' → ';

const isPart = (p: SettingsPlace): p is PartId => Object.hasOwn(PARTS, p);

/** A place in Clinic settings, as a sentence names it: "Clinic settings → People"; a part from its section:
 *  "Clinic profile → HMOs you accept". */
export function settingsPlace(p: SettingsPlace): string {
  if (isPart(p)) return `${sectionName(PARTS[p].in)}${ARROW}${PARTS[p].label}`;
  return `${TABS.settings.label}${ARROW}${sectionName(p)}`;
}

/** The address of a place in Clinic settings: the one page, opened on that section (or the part's id inside it). */
export function settingsAt(slug: string, p: SettingsPlace): string {
  return `/c/${slug}/settings/#${isPart(p) ? PARTS[p].anchor : p}`;
}

/** A path for a text message: "Clinic settings, People". */
export const inText = (path: string): string => path.split(ARROW).join(', ');

const SECTION_PLACES = Object.fromEntries(SECTIONS.map((s) => [s.id, settingsPlace(s.id)])) as Record<SectionId, string>;

/** The names a sentence uses for a place, ready to write. */
export const PLACE = {
  /** The tab. */
  settings: TABS.settings.label,
  /** Each section of Clinic settings with its path: PLACE.people → "Clinic settings → People". */
  ...SECTION_PLACES,
  /** "Clinic profile → HMOs you accept". */
  hmos: settingsPlace('hmos'),
  /** The Dashboard's list of visits to call about. */
  calls: 'Calls',
  /** The branch's texts, both ways (its address stays /messages/), and the inbox's link to it. */
  texts: 'Texts',
  allTexts: 'All texts',
  /** In the sidebar for people without Finances, and a tab in Finances; Claims on a narrow screen. */
  claims: 'HMO & PhilHealth claims',
  claimsShort: 'Claims',
  myPage: 'My page',
  /** On the patient record (page 1): where the health history is kept. */
  medicalHistory: 'Medical history',
  /** The record's attached sheet of X-rays, photos and scans. */
  files: 'X-rays and files',
} as const;
