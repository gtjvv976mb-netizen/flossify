// The patient-facing directory: what a person with a toothache in Baguio sees.
// Everything here is invented — clinics, dentists, phone numbers (all 555),
// licence numbers — and the pages say so. Shapes are deliberately close to
// what schema.sql will hold so the swap to real queries is a change of source.
//
// The service catalogue and fee guide mirror the ones the sample clinic site
// ships with (public/samples/*/js/data.js). Keep the two in step.

import { clinics as workspaceClinics } from './demo';

export type Category = 'prevent' | 'restore' | 'replace' | 'surgery' | 'cosmetic' | 'ortho';

export interface Service {
  id: string;
  name: string;
  /** The word patients actually use at the desk. */
  local?: string;
  cat: Category;
  /** Pesos. null = quoted at consultation. */
  min: number | null;
  max?: number;
  /** "Starting at" rather than a range. */
  from?: boolean;
  unit?: string;
  /** Chair time, which is what the schedule needs. */
  minutes: number;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  prevent: 'Check-ups & prevention',
  restore: 'Restorative',
  replace: 'Tooth replacement',
  surgery: 'Extractions',
  cosmetic: 'Cosmetic',
  ortho: 'Orthodontics',
};

export const services: Service[] = [
  { id: 'consultation', name: 'Consultation', local: 'Konsulta', cat: 'prevent', min: 300, from: true, minutes: 30 },
  { id: 'prophylaxis', name: 'Cleaning', local: 'Linis', cat: 'prevent', min: 1500, max: 2500, minutes: 45 },
  { id: 'xray', name: 'Dental X-ray', cat: 'prevent', min: 500, max: 1500, minutes: 15 },
  { id: 'fluoride', name: 'Fluoride varnish', cat: 'prevent', min: 800, minutes: 15 },
  { id: 'sealant', name: 'Pit & fissure sealant', cat: 'prevent', min: 1000, unit: 'per tooth', minutes: 20 },
  { id: 'restoration', name: 'Filling', local: 'Pasta', cat: 'restore', min: 2000, max: 4500, unit: 'per tooth', minutes: 45 },
  { id: 'rootcanal', name: 'Root canal', cat: 'restore', min: 8000, max: 15000, minutes: 90 },
  { id: 'crown', name: 'Crown', cat: 'restore', min: 12000, max: 16000, minutes: 60 },
  { id: 'dentures', name: 'Dentures', local: 'Pustiso', cat: 'replace', min: 16000, max: 28000, minutes: 60 },
  { id: 'bridge', name: 'Fixed bridge', cat: 'replace', min: 11000, unit: 'per unit', minutes: 60 },
  { id: 'extraction', name: 'Extraction', local: 'Bunot', cat: 'surgery', min: 1500, max: 3500, unit: 'per tooth', minutes: 30 },
  { id: 'wisdom', name: 'Wisdom tooth removal', cat: 'surgery', min: 8000, max: 15000, unit: 'per tooth', minutes: 60 },
  { id: 'whitening', name: 'Whitening', cat: 'cosmetic', min: 12000, max: 18000, minutes: 60 },
  { id: 'veneers', name: 'Veneers', cat: 'cosmetic', min: 18000, from: true, unit: 'per tooth', minutes: 60 },
  { id: 'braces', name: 'Braces', cat: 'ortho', min: 60000, max: 120000, minutes: 60 },
];

export const serviceById = (id: string) => services.find((s) => s.id === id);

/** Symptom-led search. Guidance, not diagnosis; the page says so. */
export interface Symptom {
  id: string;
  label: string;
  services: string[];
  urgency: 'routine' | 'soon' | 'urgent';
  tip: string;
}

export const symptoms: Symptom[] = [
  { id: 'toothache', label: 'Toothache', services: ['consultation', 'xray', 'restoration', 'rootcanal'], urgency: 'soon', tip: 'Rinse with warm water, cold compress on the cheek, pain relief as the label says. Nothing on the gum itself.' },
  { id: 'sensitive', label: 'Sensitive to cold or sweets', services: ['consultation', 'restoration', 'fluoride'], urgency: 'routine', tip: 'A toothpaste for sensitive teeth and a soft brush usually help while you wait.' },
  { id: 'gums', label: 'Bleeding gums', services: ['prophylaxis', 'consultation'], urgency: 'routine', tip: 'Keep brushing gently along the gumline and floss daily, even if they bleed at first.' },
  { id: 'cavity', label: 'A hole or dark spot', services: ['consultation', 'restoration'], urgency: 'soon', tip: 'Small cavities are quicker and cheaper to fix. Don’t wait for it to hurt.' },
  { id: 'chipped', label: 'Chipped or broken tooth', services: ['consultation', 'restoration', 'crown', 'veneers'], urgency: 'soon', tip: 'Keep any pieces in milk and bring them.' },
  { id: 'missing', label: 'Missing teeth', services: ['consultation', 'bridge', 'dentures'], urgency: 'routine', tip: 'Bring any dentures you already wear.' },
  { id: 'stains', label: 'Stained or yellow teeth', services: ['prophylaxis', 'whitening', 'veneers'], urgency: 'routine', tip: 'A cleaning usually comes before whitening.' },
  { id: 'crooked', label: 'Crooked teeth or bite', services: ['consultation', 'braces'], urgency: 'routine', tip: 'An assessment with X-rays comes first; braces work for adults too.' },
  { id: 'wisdom', label: 'Pain at the back of the jaw', services: ['consultation', 'xray', 'wisdom'], urgency: 'soon', tip: 'Warm salt-water rinses after meals. Fever or trouble opening your mouth means today, not next week.' },
  { id: 'checkup', label: 'Just a check-up', services: ['consultation', 'prophylaxis', 'fluoride', 'sealant'], urgency: 'routine', tip: 'Every six months for most people. PhilHealth pays for two preventive visits a year.' },
  { id: 'swelling', label: 'Swelling or fever', services: ['consultation'], urgency: 'urgent', tip: 'Call a clinic now. Trouble breathing or swallowing, or swelling toward the eye or neck, is an emergency room visit.' },
  { id: 'knocked', label: 'Knocked-out tooth', services: ['consultation'], urgency: 'urgent', tip: 'Pick it up by the crown, keep it in milk, and get to a dentist within the hour.' },
];

/** HMOs licensed by the Insurance Commission. Names only; the list a clinic
 *  ticks is theirs to keep true, and every chip says "confirm with your HMO". */
export const hmos = [
  { id: 'maxicare', name: 'Maxicare' },
  { id: 'intellicare', name: 'Intellicare' },
  { id: 'medicard', name: 'MediCard' },
  { id: 'philcare', name: 'PhilCare' },
  { id: 'cocolife', name: 'Cocolife' },
  { id: 'avega', name: 'Avega' },
  { id: 'eastwest', name: 'EastWest Healthcare' },
  { id: 'etiqa', name: 'Etiqa' },
  { id: 'hmi', name: 'HMI' },
  { id: 'insular', name: 'Insular Health Care' },
  { id: 'valucare', name: 'ValuCare' },
  { id: 'hpdai', name: 'Health Partners Dental Access' },
];

export const hmoById = (id: string) => hmos.find((h) => h.id === id);

/** The seven fields the Board of Dentistry recognises. Anything else is
 *  "general dentist, practices X" — the signage rule, applied to a web page. */
export type Specialty =
  | 'Endodontics' | 'Oral & maxillofacial surgery' | 'Orthodontics' | 'Pediatric dentistry'
  | 'Periodontics' | 'Prosthodontics' | 'Dental public health';

export interface Dentist {
  id: string;
  slug: string;
  name: string;
  /** Format only; not a real licence. */
  prc: string;
  /** A person checked verification.prc.gov.ph on this date. There is no API. */
  prcCheckedOn: string;
  pda: boolean;
  specialty: Specialty | null;
  practices: string[];
  since: number;
  /** Where they are, and which weekdays (0 = Sunday). */
  clinics: { slug: string; days: number[] }[];
  about: string;
}

export const dentists: Dentist[] = [
  { id: 'd1', slug: 'liwayway-domingo', name: 'Dr. Liwayway Domingo', prc: '0051234', prcCheckedOn: '2026-09-15', pda: true, specialty: null,
    practices: ['General dentistry', 'Restorations', 'Root canal'], since: 2009,
    clinics: [{ slug: 'session-road', days: [1, 2, 3, 4, 5, 6] }],
    about: 'Owner of Session Road Dental. Explains before she does anything, which is why nervous patients ask for her.' },
  { id: 'd2', slug: 'ramon-carino', name: 'Dr. Ramon Cariño', prc: '0067890', prcCheckedOn: '2026-09-15', pda: true, specialty: 'Orthodontics',
    practices: ['Braces', 'Clear aligners', 'Bite correction'], since: 2013,
    clinics: [{ slug: 'session-road', days: [2, 4] }, { slug: 'burnham-smile', days: [1, 3, 5, 6] }],
    about: 'Diplomate of the Association of Philippine Orthodontists. Sees braces patients at two clinics in Baguio.' },
  { id: 'd3', slug: 'hazel-tabanao', name: 'Dr. Hazel Tabanao', prc: '0078123', prcCheckedOn: '2026-09-10', pda: true, specialty: 'Pediatric dentistry',
    practices: ['Children’s dentistry', 'Sealants', 'Fluoride'], since: 2015,
    clinics: [{ slug: 'session-road', days: [1, 3, 5] }, { slug: 'la-trinidad-family', days: [2, 4, 6] }],
    about: 'Kids leave her chair asking when they can come back. PhilHealth preventive visits are her usual Saturday.' },
  { id: 'd4', slug: 'benjamin-pucay', name: 'Dr. Benjamin Pucay', prc: '0043321', prcCheckedOn: '2026-09-12', pda: true, specialty: 'Oral & maxillofacial surgery',
    practices: ['Wisdom tooth removal', 'Extractions', 'Implants'], since: 2004,
    clinics: [{ slug: 'leonard-wood', days: [1, 2, 3, 4, 5] }],
    about: 'Twenty years of surgical extractions. Aftercare on paper and by text, and a call the next day.' },
  { id: 'd5', slug: 'marites-alangdeo', name: 'Dr. Marites Alangdeo', prc: '0089456', prcCheckedOn: '2026-09-12', pda: true, specialty: null,
    practices: ['General dentistry', 'Dentures', 'Crowns and bridges'], since: 2011,
    clinics: [{ slug: 'leonard-wood', days: [1, 3, 5, 6] }, { slug: 'la-trinidad-family', days: [2, 4] }],
    about: 'Dentures that fit on the first try-in, and adjustments the same week when they don’t.' },
  { id: 'd6', slug: 'carlo-buyagan', name: 'Dr. Carlo Buyagan', prc: '0092210', prcCheckedOn: '2026-09-18', pda: false, specialty: null,
    practices: ['General dentistry', 'Whitening', 'Veneers'], since: 2019,
    clinics: [{ slug: 'burnham-smile', days: [1, 2, 3, 4, 5, 6] }],
    about: 'Cosmetic work that reads as natural. Shows you the shade before and after.' },
  { id: 'd7', slug: 'elena-sarmiento', name: 'Dr. Elena Sarmiento', prc: '0038765', prcCheckedOn: '2026-09-15', pda: true, specialty: null,
    practices: ['General dentistry', 'Restorations'], since: 2006,
    clinics: [{ slug: 'marikina-heights', days: [1, 2, 3, 4, 5, 6] }],
    about: 'Runs Marikina Heights Dental. Same group as Session Road; same records if you move between them.' },
];

export const dentistBySlug = (slug: string) => dentists.find((d) => d.slug === slug);

/** Opening hours as [open, close] in 24h, per weekday (0 = Sunday); null = by appointment. */
export type Hours = Record<number, [number, number] | null>;

export interface Listing {
  slug: string;
  name: string;
  area: string;
  address: string;
  /** 555 numbers only. */
  phone: string;
  hours: Hours;
  hmos: string[];
  /** PhilHealth-accredited for the preventive oral health benefit. */
  philhealth: boolean;
  /** On the Flossify workspace: the schedule is live and a booking is a booking.
   *  Off it: the patient sends a request and the clinic confirms by text. */
  workspace: boolean;
  walkIns: boolean;
  chairs: number;
  since: number;
  /** House-style stills from public/img, by key. No people. */
  photos: [string, string];
  /** Fee overrides; anything not listed is the catalogue price. null = not offered. */
  prices: Record<string, { min: number | null; max?: number } | null>;
  about: string;
  /** Dentists' slugs, in the order the clinic lists them. */
  dentists: string[];
}

const WEEKDAYS_9_6: Hours = { 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: [9, 18] };

export const listings: Listing[] = [
  {
    slug: 'session-road', name: 'Session Road Dental', area: 'Baguio City',
    address: '2/F, 88 Session Road, Baguio City', phone: '0917 555 0100',
    hours: { ...WEEKDAYS_9_6, 6: [9, 15] },
    hmos: ['maxicare', 'intellicare', 'medicard', 'philcare', 'hpdai'],
    philhealth: true, workspace: true, walkIns: true, chairs: 4, since: 2009,
    photos: ['clinic-tall', 'instruments'],
    prices: { veneers: null },
    about: 'Four chairs above Session Road. General dentistry every day, orthodontics on Tuesdays and Thursdays, children on Mondays, Wednesdays and Fridays.',
    dentists: ['liwayway-domingo', 'ramon-carino', 'hazel-tabanao'],
  },
  {
    slug: 'leonard-wood', name: 'Leonard Wood Dental', area: 'Baguio City',
    address: '14 Leonard Wood Road, Baguio City', phone: '0918 555 0200',
    hours: { ...WEEKDAYS_9_6, 6: [9, 13] },
    hmos: ['maxicare', 'medicard', 'cocolife', 'avega', 'etiqa'],
    philhealth: false, workspace: true, walkIns: false, chairs: 2, since: 2004,
    photos: ['handpiece', 'tray'],
    prices: { wisdom: { min: 7500, max: 12000 }, extraction: { min: 1200, max: 3000 }, braces: null, whitening: null, veneers: null },
    about: 'Surgery and dentures. Two chairs, one surgeon, appointments only.',
    dentists: ['benjamin-pucay', 'marites-alangdeo'],
  },
  {
    slug: 'burnham-smile', name: 'Burnham Smile Studio', area: 'Baguio City',
    address: 'G/F, 5 Harrison Road, Baguio City', phone: '0919 555 0300',
    hours: { 0: null, 1: [10, 19], 2: [10, 19], 3: [10, 19], 4: [10, 19], 5: [10, 19], 6: [10, 17] },
    hmos: ['maxicare', 'intellicare'],
    philhealth: false, workspace: true, walkIns: true, chairs: 3, since: 2019,
    photos: ['aligner', 'model'],
    prices: { whitening: { min: 15000, max: 20000 }, braces: { min: 65000, max: 130000 }, dentures: null, wisdom: null },
    about: 'Cosmetic and orthodontic. Open until seven for people who work.',
    dentists: ['carlo-buyagan', 'ramon-carino'],
  },
  {
    slug: 'la-trinidad-family', name: 'La Trinidad Family Dental', area: 'La Trinidad',
    address: 'Km 5, Central Pico, La Trinidad, Benguet', phone: '0920 555 0400',
    hours: { 0: null, 1: null, 2: [9, 17], 3: null, 4: [9, 17], 5: null, 6: [9, 17] },
    hmos: ['philcare', 'hpdai'],
    philhealth: true, workspace: false, walkIns: true, chairs: 2, since: 2016,
    photos: ['xray', 'tray'],
    prices: { consultation: { min: 250 }, prophylaxis: { min: 1200, max: 2000 }, rootcanal: null, crown: null, whitening: null, veneers: null, braces: null, wisdom: null },
    about: 'A family clinic three days a week. Not yet on the Flossify workspace, so bookings here are requests the clinic confirms by text.',
    dentists: ['hazel-tabanao', 'marites-alangdeo'],
  },
  {
    slug: 'marikina-heights', name: 'Marikina Heights Dental', area: 'Marikina City',
    address: '2/F, 37 Sumulong Highway, Marikina Heights', phone: '0927 555 0500',
    hours: WEEKDAYS_9_6,
    hmos: ['maxicare', 'intellicare', 'medicard', 'philcare', 'insular', 'valucare'],
    philhealth: false, workspace: true, walkIns: true, chairs: 2, since: 2018,
    photos: ['model', 'instruments'],
    prices: { braces: null, veneers: null },
    about: 'The group’s Marikina branch. Your Session Road records follow you here.',
    dentists: ['elena-sarmiento'],
  },
];

export const listingBySlug = (slug: string) => listings.find((l) => l.slug === slug);

/** The fee guide for one clinic: catalogue price unless the clinic overrides or
 *  does not offer it. */
export const feeGuide = (l: Listing) =>
  services
    .map((s) => {
      const o = l.prices[s.id];
      if (o === null) return null;
      return { ...s, min: o?.min ?? s.min, max: o ? o.max : s.max, from: o ? false : s.from };
    })
    .filter((x): x is Service => x !== null);

export const priceText = (s: { min: number | null; max?: number; from?: boolean; unit?: string }) => {
  const peso = (n: number) => '₱' + n.toLocaleString('en-PH');
  if (s.min == null) return 'Quoted at consultation';
  const core = s.max ? `${peso(s.min)} – ${peso(s.max)}` : s.from ? `from ${peso(s.min)}` : peso(s.min);
  return s.unit ? `${core} ${s.unit}` : core;
};

export const dentistsOf = (l: Listing) => l.dentists.map(dentistBySlug).filter((d): d is Dentist => !!d);

/** Sanity: every listing that claims a workspace has one in demo.ts, and vice versa. */
export const workspaceSlugs = new Set(workspaceClinics.map((c) => c.slug));

/** The two rendered widths per house-style photograph in public/img. */
const PHOTO_W: Record<string, [number, number]> = {
  aligner: [960, 1600], instruments: [960, 1600], handpiece: [640, 1000], model: [640, 1000],
  tray: [640, 1000], xray: [640, 1000], 'clinic-tall': [448, 688],
};
export const photo = (key: string) => ({
  src: `/img/${key}-${PHOTO_W[key][1]}.webp`,
  srcset: `/img/${key}-${PHOTO_W[key][0]}.webp ${PHOTO_W[key][0]}w, /img/${key}-${PHOTO_W[key][1]}.webp ${PHOTO_W[key][1]}w`,
});

export const PHOTO_ALT: Record<string, string> = {
  aligner: 'A clear orthodontic aligner on a pale stone surface',
  instruments: 'Stainless dental instruments laid out on a folded cloth',
  handpiece: 'A dental handpiece resting on a pale worktop',
  model: 'A white dental study model of upper and lower teeth',
  tray: 'A stainless instrument tray with a mouth mirror and probe',
  xray: 'A panoramic dental radiograph on a light box',
  'clinic-tall': 'A bright treatment room with a sage-grey chair beside the window',
};
