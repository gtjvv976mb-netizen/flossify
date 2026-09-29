// The consent library (039): the forms a clinic asks a patient to sign before
// a procedure, as data. Ten forms and the consent to examination and
// treatment already in force (TREATMENT_CONSENT, 028), each a Template keyed
// by its consent_version id, with the clinic's part (the fields the desk and
// the dentist fill in), the patient's part (a few questions on the page), the
// words, and the reading and drawing of both.
//
// These words are Flossify's plain drafts, written from the usual Philippine
// dental consent and the research catalogue in the intake spec. A dentist and
// the owner's lawyer read each before a clinic offers it in production:
// CONSENT_REVIEWED lists the versions they have read (and whether the
// Filipino lines are reviewed too), and it is empty. Until a version is listed
// a production server does not offer it; a development machine offers every
// one, tagged "Not reviewed".
//
// Rules kept:
// - A template is pure data (no functions), so its words can be pinned: the
//   consent_version row holds sha256(canonicalJson(template)) (libraryHash in
//   consent-seal.ts; npm run consent:hash prints them), a template is offered
//   only while the two match, and the unit test fails when a word changes. New
//   words are a new version id and a new row, in one change; the words of a
//   version patients have signed never change.
// - What was signed is frozen as the rendered snapshot (consent-seal.ts), so a
//   reprint never comes from these words again.
// - Every value the clinic types is read on the server (readClinicPart) without
//   invisible characters, on one line, within its bounds, whatever the page
//   sent. Fields have an owner: the desk's (money, visits, what is included)
//   or the dentist's (the procedure, teeth, reasons, findings, materials). The
//   desk may propose the dentist's; they read "to be confirmed by the dentist"
//   until the named dentist attests (consent_attestation, 039), which freezes
//   them.
// - Never used (spec §3.9): liability waivers; making the patient pay the
//   clinic's attorney's fees or collection costs; blanket authority (the
//   narrow `unexpected` line replaces it); a pre-printed "I have no further
//   questions"; precise success claims such as "95%"; "noncompliant patients
//   may be dismissed"; "Required" on an optional item; a religion field.
// - Sentence case, plain words. Filipino lines only where the spec gives a
//   draft; the rest are English only until a translator and a dentist write
//   and review them (a new version).
//
// No Node or database imports: a page's script may import this file.

import { TREATMENT_CONSENT, visibleOnly } from './patient-forms-def';
import { oneLine } from './health';
import { kindForCatalog } from './aftercare';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
/** Words in English, and the Filipino draft where there is one (shown only when reviewed: §3.8). */
export interface Bi { en: string; fil?: string }

/** What a run of a line may stand for besides plain words: the signer, their relation, who read the form aloud, the substitute's ground and who they are. */
export type CtxVar = 'signer' | 'relation' | 'reader' | 'ground' | 'who' | 'what' | 'by';

/**
 * A piece of a line: plain words, a clinic field's value (`style: 'tooth'`
 * writes "tooth 36" or "teeth 36 and 37"), the dentist's name, the patient's
 * name, the language it was explained in, or a value of the signing (CtxVar).
 */
export type Run = string | { f: string; style?: Style } | { dentist: true } | { patient: true } | { lang: true } | { v: CtxVar };
/** How a value reads in a sentence: teeth as "tooth 36" / "teeth 36 and 37"; a number with its unit, "1 visit" / "2 visits". */
export type Style = 'tooth' | 'visit' | 'session' | 'week' | 'month';

/**
 * When a line or a section is shown: a field's value is one of `in` (a
 * money field by its kind, a list if any of it is), a field has a value, any
 * of a teeth field's teeth is one of `teethIn`, the patient is a minor, all
 * of several, or not one.
 */
export type Cond =
  | { f: string; in: readonly string[] }
  | { has: string }
  | { teethIn: readonly number[]; f?: string }
  | { minor: boolean }
  | { all: readonly Cond[] }
  | { not: Cond };

export interface Line { en: readonly Run[]; fil?: readonly Run[]; when?: Cond }

export type SectionRole = 'what' | 'why' | 'risks' | 'rare' | 'special' | 'choices' | 'without' | 'care' | 'cost' | 'rights' | 'records';

export interface Section {
  id: string;
  head: Bi;
  role: SectionRole;
  lines: readonly Line[];
  /** Drawn as a list. */
  list?: boolean;
  when?: Cond;
  /** Ends with an Initials box (the risks). */
  initials?: true;
}

export type ClinicKind = 'teeth' | 'choice' | 'choices' | 'text' | 'number' | 'range' | 'money' | 'yesno';

export type Code = 'general' | 'anaesthesia' | 'extraction' | 'root_canal' | 'restoration' | 'periodontal'
  | 'denture' | 'implant' | 'ortho' | 'whitening' | 'photos';

/** A choice: `label` as a sentence has it ("a surgical extraction, in which …"); `short` for a pill in the For box when the label is long. */
export interface Choice { value: string; label: string; short?: string; fil?: string }

export interface ClinicField {
  name: string;
  kind: ClinicKind;
  /** Who fills it in: the desk, or the dentist (the desk may propose; the dentist confirms). */
  who: 'desk' | 'dentist';
  /** The desk's label. */
  label: string;
  /** Shown as a fact in the page's "For" box, under these words. */
  forBox?: string;
  required?: boolean;
  choices?: readonly Choice[];
  /** A choice may be "other", typed, at most this long. */
  other?: { max: number };
  /** For 'choices': the value that is ticked alone ("none noted", "the whole mouth"). */
  alone?: string;
  min?: number;
  max?: number;
  maxTeeth?: number;
  /** A number's unit, for the For box ("18 to 24 months"). */
  unit?: Style;
  /** A money field may be "the dentist tells you before starting". */
  allowLater?: boolean;
  prefill?: 'plan_teeth' | 'fee_guide' | { value: string | number };
  when?: Cond;
  help?: string;
}

export interface PatientField {
  name: string;
  kind: 'yesno' | 'yesnounsure' | 'choices';
  label: Bi;
  required?: boolean;
  /** Answers that take "I agree" away (whitening's label). */
  stop?: readonly string[];
  choices?: readonly Choice[];
  when?: Cond;
}

export type TickId = 'explained' | 'risks' | 'history' | 'general';
export interface Tick { id: TickId; line: Line }

/** The words every page shares: the decisions, who signs, the dentist's statement, the labels. Copied into each template so its hash covers them. */
export interface Words {
  agree: Line; refuse: Line; later: Line;
  read_self: Line; read_to: Line;
  as_parent: Line; as_guardian: Line; as_written: Line; as_substitute: Line; as_representative: Line; by_mark: Line;
  attest: Line;
  meaning_agree: Line; meaning_agree_for: Line; meaning_refuse: Line; meaning_refuse_for: Line; meaning_by: Line;
  grounds: Readonly<Record<SubstituteGround, string>>;
  who: Readonly<Record<SubstituteWho, string>>;
  labels: Readonly<Record<'patient_name' | 'birth_date' | 'sig_patient' | 'sig_guardian' | 'relation' | 'dentist' | 'explained_in' | 'interpreter' | 'date_time' | 'initials', Bi>>;
}

export interface Template {
  code: Code;
  /** The consent_version id: kind 'document', or 'treatment' for the general consent. */
  version: string;
  kind: 'document' | 'treatment';
  title: Bi;
  group: 'general' | 'numbing' | 'treatment' | 'records';
  /** The order pages come in, whatever order the desk ticked them. */
  order: number;
  /** About how long it takes to read. */
  minutes: number;
  /** Signed only after the named dentist attests (consent_attestation). */
  attest: boolean;
  minors: 'guardian' | 'not_under_18';
  /** How long a signed form covers treatment; null until withdrawn. */
  validDays: number | null;
  /** "No, thank you" is kept without a signature (photos). */
  refuseUnsigned: boolean;
  clinicFields: readonly ClinicField[];
  /** At least one field of each group has a value (anaesthesia: the teeth or the area in words). */
  needOne: readonly (readonly string[])[];
  patientFields: readonly PatientField[];
  inShort: readonly Line[];
  sections: readonly Section[];
  ticks: readonly Tick[];
  /** What is agreed to, for the meaning sentence: "the extraction of tooth 36". */
  meaning: Line;
  words: Words;
}

/** Filled-in clinic fields, by name (consent_document.fields). */
export type FieldValue = number[] | string | string[] | number | { other: string } | { from: number; to: number } | Money | null;
export type Fields = Record<string, FieldValue>;
export type Money = { kind: 'amount'; from: number; includes?: string } | { kind: 'range'; from: number; to: number; includes?: string } | { kind: 'later' };

export type SubstituteGround = 'died' | 'absent' | 'unfit';
export type SubstituteWho = 'grandparent' | 'sibling_21' | 'custodian_21';

// ---------------------------------------------------------------------------
// Writing lines: '{teeth}' is the field teeth, '{teeth:tooth}' "tooth 36", '{visits:visit}' "2 visits",
// '{dentist}', '{patient}', '{language}', '{$signer}' a CtxVar.
// ---------------------------------------------------------------------------
function runs(s: string): Run[] {
  const out: Run[] = [];
  const re = /\{(\$?)([a-z_]+)(?::(tooth|visit|session|week|month))?\}/g;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) out.push(s.slice(at, m.index));
    const [, dollar, name, style] = m;
    if (dollar) out.push({ v: name as CtxVar });
    else if (name === 'dentist') out.push({ dentist: true });
    else if (name === 'patient') out.push({ patient: true });
    else if (name === 'language') out.push({ lang: true });
    else out.push(style ? { f: name, style: style as Style } : { f: name });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}
const L = (en: string, fil?: string | null, when?: Cond): Line => ({ en: runs(en), ...(fil ? { fil: runs(fil) } : {}), ...(when ? { when } : {}) });
const W = (en: string, when?: Cond): Line => L(en, null, when);
const H = (en: string, fil?: string): Bi => (fil ? { en, fil } : { en });

// ---------------------------------------------------------------------------
// Shared words (§3.2)
// ---------------------------------------------------------------------------
export const SHARED = {
  explained: L('Dr {dentist} explained this to me in {language}, and my questions were answered.',
    'Ipinaliwanag sa akin ni Dr {dentist} sa {language} ang gamutang ito, at nasagot ang aking mga tanong.'),
  risks: L('I understand the risks above, and that no one can promise a particular result.',
    'Naiintindihan ko ang mga panganib sa itaas, at na walang makapangangako ng tiyak na resulta.'),
  history: L('I told the clinic truthfully about my health, medicines and allergies, and will tell them if anything changes.',
    'Tapat kong sinabi sa klinika ang tungkol sa aking kalusugan, mga gamot, at mga allergy, at sasabihin ko kung may magbago.'),
  rights: L('You may say no, or change your mind and stop at any time. The dentist will tell you what stopping may mean for your teeth. You may ask for a second opinion.',
    'Maaari akong tumanggi, o magbago ng isip at ipahinto ang gamutan anumang oras; sasabihin sa akin ng dentista kung ano ang maaaring mangyari sa aking ngipin kapag itinigil ito.'),
  unexpected: L('If the dentist finds something unexpected, they stop and explain before doing more, unless stopping would put you at risk.',
    'Kung may matuklasang hindi inaasahan ang dentista, hihinto muna siya at magpapaliwanag bago gumawa ng iba pa, maliban kung makasasama sa akin ang paghinto.'),
} as const;

export const WORDS: Words = {
  agree: L('I agree to the treatment described above.', 'Pumapayag ako sa gamutang nakasaad sa itaas.'),
  refuse: L('I do not agree to the treatment described above, and I understand what may happen without it.',
    'Hindi ako pumapayag sa gamutang nakasaad sa itaas, at naiintindihan ko ang maaaring mangyari kung hindi ako magpapagamot.'),
  later: W('I want to ask the dentist first.'),
  read_self: W('I read this form myself.'),
  read_to: W('This form was read to me by {$reader}.'),
  as_parent: W('I am the patient’s parent, and I have the right to consent for them.'),
  as_guardian: W('I am the patient’s guardian appointed by a court, and the order is with the clinic.'),
  as_written: W('A parent of the patient authorised me in writing to consent to this treatment, and the letter is with the clinic.'),
  as_substitute: W('The patient’s parents {$ground}. I am the patient’s {$who}, and 21 or older where the law requires it.'),
  as_representative: W('The dentist has recorded that the patient cannot decide for themself. I am their {$relation}.'),
  by_mark: W('The patient cannot write and made this mark as their signature, in front of the clinic’s staff.'),
  attest: W('I confirmed the details above, explained them to the patient (or parent or guardian) in {language}, answered their questions, and believe they understood.'),
  meaning_agree: W('By signing, I, {$signer}, agree to {$what}{$by} as described above.'),
  meaning_agree_for: W('By signing, I, {$signer}, {$relation} of {patient}, agree for {patient} to have {$what}{$by} as described above.'),
  meaning_refuse: W('By signing, I, {$signer}, do not agree to {$what}{$by} described above.'),
  meaning_refuse_for: W('By signing, I, {$signer}, {$relation} of {patient}, do not agree for {patient} to have {$what}{$by} described above.'),
  meaning_by: W(' by Dr {dentist}'),
  grounds: { died: 'have died', absent: 'are absent and cannot be found', unfit: 'are unfit, or a court has ruled so' },
  who: { grandparent: 'surviving grandparent', sibling_21: 'oldest brother or sister, 21 or over', custodian_21: 'actual custodian (the person who looks after them), 21 or over' },
  labels: {
    patient_name: H('Patient’s full name', 'Buong pangalan ng pasyente'),
    birth_date: H('Date of birth', 'Petsa ng kapanganakan'),
    sig_patient: H('Signature of the patient', 'Lagda ng pasyente'),
    sig_guardian: H('Signature of the parent or legal guardian', 'Lagda ng magulang o legal na tagapag-alaga'),
    relation: H('Relation', 'Relasyon'),
    dentist: H('Dentist (name, PRC licence no.)', 'Dentista (pangalan, numero ng lisensiya sa PRC)'),
    explained_in: H('Explained in', 'Ipinaliwanag sa'),
    interpreter: H('Interpreter', 'Tagapagsalin'),
    date_time: H('Date and time', 'Petsa at oras'),
    initials: H('Initials'),
  },
};

// ---------------------------------------------------------------------------
// Pieces every procedure form ends with
// ---------------------------------------------------------------------------
const TICKS_ERH: readonly Tick[] = [{ id: 'explained', line: SHARED.explained }, { id: 'risks', line: SHARED.risks }, { id: 'history', line: SHARED.history }];
const TICKS_ER: readonly Tick[] = [{ id: 'explained', line: SHARED.explained }, { id: 'risks', line: SHARED.risks }];

const HEAD = {
  what: H('What we will do'), why: H('Why'), risks: H('Risks'), rare: H('Less common but serious'),
  choices: H('Other choices'), without: H('If you do not have it'), care: H('Before and after'), cost: H('Cost'), rights: H('Your rights'),
};

/** The cost lines of one money field: the amount (with what it includes), or "told before starting". `what` names it when a form has two. */
const costLines = (field: string, what?: string): Line[] => [
  what
    ? W(`${what}: {${field}}. If it changes, the clinic tells you first.`, { f: field, in: ['amount', 'range'] })
    : L(`The estimated fee is {${field}}. If it changes, the clinic tells you first.`,
      `Sinabi sa akin ang tinatayang bayad na {${field}} at kung ano ang kasama rito. Kung magbabago ang halaga, sasabihin muna ito sa akin ng klinika.`,
      { f: field, in: ['amount', 'range'] }),
  what
    ? W(`${what}: the dentist tells you the cost before starting, and nothing starts until you agree to it.`, { f: field, in: ['later'] })
    : L('The dentist tells you the cost before starting, and nothing starts until you agree to it.',
      'Sasabihin ng dentista ang halaga bago magsimula, at walang sisimulan hangga’t hindi ako pumapayag.', { f: field, in: ['later'] }),
];
/** The In short line for the cost. */
const costShort = (field: string): Line[] => [
  W(`Estimated fee: {${field}}.`, { f: field, in: ['amount', 'range'] }),
  W('The dentist tells you the cost before starting.', { f: field, in: ['later'] }),
];
const cost = (lines: Line[]): Section => ({ id: 'cost', head: HEAD.cost, role: 'cost', lines });
const RIGHTS: Section = { id: 'rights', head: HEAD.rights, role: 'rights', lines: [SHARED.rights, SHARED.unexpected] };
const list = (id: string, head: Bi, role: SectionRole, lines: string[], extra: Partial<Section> = {}): Section => ({ id, head, role, lines: lines.map((x) => W(x)), list: true, ...extra });
const one = (id: string, head: Bi, role: SectionRole, lines: Line[], extra: Partial<Section> = {}): Section => ({ id, head, role, lines, ...extra });

const NONE_NOTED = 'none';
const hasReal = (f: string): Cond => ({ all: [{ has: f }, { not: { f, in: [NONE_NOTED] } }] });

const estimate = (extra: Partial<ClinicField> = {}): ClinicField => ({
  name: 'estimate', kind: 'money', who: 'desk', label: 'Estimated fee', forBox: 'Estimate', prefill: 'fee_guide', allowLater: true, required: true,
  help: 'From the fee guide, or leave it to the dentist to tell them before starting.', ...extra,
});
const teeth = (extra: Partial<ClinicField> = {}): ClinicField => ({ name: 'teeth', kind: 'teeth', who: 'dentist', label: 'Teeth', forBox: 'Teeth', required: true, prefill: 'plan_teeth', ...extra });
const riskFactors = (choices: [string, string][]): ClinicField => ({
  name: 'risk_factors', kind: 'choices', who: 'dentist', label: 'Things that raise the risk for them', alone: NONE_NOTED,
  choices: [...choices.map(([value, label]) => ({ value, label })), { value: NONE_NOTED, label: 'none noted' }],
});
const forYou = (): Section => one('for_you', H('For you'), 'special', [W('Noted for you: {risk_factors}. These raise some of the risks above.')], { when: hasReal('risk_factors') });

const base = (t: Omit<Template, 'words' | 'kind' | 'needOne' | 'patientFields' | 'refuseUnsigned'> & Partial<Pick<Template, 'needOne' | 'patientFields' | 'refuseUnsigned' | 'words'>>): Template => ({
  kind: 'document', needOne: [], patientFields: [], refuseUnsigned: false, words: WORDS, ...t,
});

// ---------------------------------------------------------------------------
// G. The consent to examination and treatment in force (028), unchanged
// ---------------------------------------------------------------------------
function generalFrom(version: string): Template {
  const g = TREATMENT_CONSENT[version];
  return {
    code: 'general', version, kind: 'treatment', title: { en: g.title }, group: 'general', order: 10, minutes: 2, attest: false, minors: 'guardian',
    validDays: null, refuseUnsigned: false, clinicFields: [], needOne: [], patientFields: [], inShort: [],
    sections: g.points.map((p, i) => ({ id: `p${i + 1}`, head: { en: p.head }, role: p.head === 'Your rights' ? 'rights' : 'special', lines: [{ en: [p.body] }] })),
    ticks: [{ id: 'general', line: { en: [g.tick] } }],
    meaning: W('be examined, and to treatment once the dentist has explained it'),
    words: WORDS,
  };
}

// ---------------------------------------------------------------------------
// 1. Local anaesthesia
// ---------------------------------------------------------------------------
const ANAESTHESIA = base({
  code: 'anaesthesia', version: 'anaesthesia-2026-10', title: H('Local anaesthesia', 'Pahintulot sa pampamanhid'), group: 'numbing', order: 20, minutes: 2,
  attest: true, minors: 'guardian', validDays: 180, ticks: TICKS_ERH,
  clinicFields: [
    { name: 'area', kind: 'teeth', who: 'dentist', label: 'Teeth to numb', forBox: 'Teeth', prefill: 'plan_teeth' },
    { name: 'area_text', kind: 'text', who: 'dentist', label: 'Or the area, in words', max: 80, forBox: 'Area', help: 'For example: the lower left back teeth.' },
    {
      name: 'technique', kind: 'choice', who: 'dentist', label: 'How', choices: [
        { value: 'infiltration', label: 'an injection beside the tooth (infiltration)' },
        { value: 'block', label: 'a nerve block, which numbs a larger area such as half of the lower jaw' },
        { value: 'decide', label: 'decided at the visit' },
      ],
    },
    {
      name: 'agent', kind: 'choice', who: 'dentist', label: 'The medicine', other: { max: 60 }, choices: [
        { value: 'lidocaine', label: 'lidocaine 2% with epinephrine 1:100,000' },
        { value: 'mepivacaine', label: 'mepivacaine 3% plain' },
        { value: 'articaine', label: 'articaine 4% with epinephrine 1:100,000' },
      ],
    },
    riskFactors([['heart', 'heart disease'], ['blood_pressure', 'high blood pressure'], ['pregnant', 'pregnant, or may be'], ['reaction', 'a reaction to numbing before'], ['thinners', 'blood thinners']]),
  ],
  needOne: [['area', 'area_text']],
  inShort: [
    L('An injection numbs the area to be treated. Your lips, cheek or tongue stay numb for a few hours.',
      'Pamamanhirin ang bahaging gagamutin gamit ang pampamanhid (local anesthesia). Mananatiling manhid ang labi, pisngi o dila nang ilang oras.'),
    L('While you are numb, do not bite, suck or scratch your lip, cheek or tongue, and avoid very hot food and drink.',
      'Habang manhid, huwag kagatin, sipsipin o kamutin ang labi, pisngi o dila, at iwasan ang napakainit na pagkain o inumin.'),
    L('It may bruise or ache where the needle went in, your heart may beat faster for a few minutes, or your jaw may be stiff for a few days. Allergy is rare. Numbness that lasts weeks or months is rare too, and very rarely permanent.',
      'Maaaring magkapasa o sumakit ang tinurukan, bumilis ang tibok ng puso, o mahirapang ibuka ang bibig nang ilang araw. Bihira ang allergy. Bihira rin ang pamamanhid na tumatagal nang ilang linggo o buwan, at napakabihirang permanente.'),
    W('Other choices: no numbing (the treatment may hurt), numbing gel for minor care, or sedation elsewhere by referral.'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('An injection numbs the area around {area:tooth}.', { has: 'area' }),
      W('An injection numbs {area_text}.', { all: [{ not: { has: 'area' } }, { has: 'area_text' }] }),
      W('How: {technique}.', { has: 'technique' }),
      W('The medicine: {agent}.', { has: 'agent' }),
      W('Your lips, cheek and tongue on that side stay numb for a few hours.'),
    ]),
    one('why', HEAD.why, 'why', [W('So the treatment does not hurt.')]),
    list('risks', HEAD.risks, 'risks', [
      'Soreness or bruising where the needle went in.',
      'A stiff jaw for a few days.',
      'A fast heartbeat or feeling shaky for a few minutes, from the epinephrine in the medicine.',
      'Feeling faint.',
      'The numbing may not work fully, most often on an infected tooth.',
    ]),
    list('rare', HEAD.rare, 'rare', [
      'Biting or burning the numb lip, cheek or tongue without feeling it (children most of all).',
      'Swallowing is harder to control while you are numb.',
      'Rarely, an allergic or severe reaction that needs emergency care.',
      'Rarely, numbness or tingling that lasts weeks or months, and very rarely for good (a nerve injury).',
    ], { initials: true }),
    forYou(),
    list('choices', HEAD.choices, 'choices', [
      'No numbing: the treatment may hurt.',
      'Numbing gel only, for minor care.',
      'Sedation or general anaesthesia elsewhere, by referral.',
    ]),
    one('without', HEAD.without, 'without', [W('The treatment may hurt, and it may not be possible to finish it.')]),
    list('care', HEAD.care, 'care', [
      'While you are numb, do not bite, suck or scratch your lip, cheek or tongue, and avoid very hot food and drink.',
      'A child is watched until the numbness wears off.',
    ]),
    cost([L('The dentist tells you the cost before starting, and nothing starts until you agree to it.',
      'Sasabihin ng dentista ang halaga bago magsimula, at walang sisimulan hangga’t hindi ako pumapayag.')]),
    RIGHTS,
  ],
  meaning: W('local anaesthesia (numbing) for the treatment'),
});

// ---------------------------------------------------------------------------
// 2. Tooth extraction and oral surgery
// ---------------------------------------------------------------------------
const UPPER_BACK = [14, 15, 16, 17, 18, 24, 25, 26, 27, 28];
const WISDOM = [18, 28, 38, 48];
const EXTRACTION = base({
  code: 'extraction', version: 'extraction-2026-10', title: H('Tooth extraction and oral surgery', 'Pahintulot sa pagbunot ng ngipin at operasyon sa bibig'),
  group: 'treatment', order: 30, minutes: 3, attest: true, minors: 'guardian', validDays: 180, ticks: TICKS_ERH,
  clinicFields: [
    teeth(),
    {
      name: 'type', kind: 'choice', who: 'dentist', label: 'Type', forBox: 'Type', required: true, choices: [
        { value: 'simple', label: 'a simple extraction', short: 'Simple' },
        { value: 'surgical', label: 'a surgical extraction, in which the gum is opened, some bone may be removed, the tooth may be cut in parts and stitches are placed', short: 'Surgical' },
      ],
    },
    {
      name: 'reason', kind: 'choice', who: 'dentist', label: 'Reason', other: { max: 120 }, choices: [
        { value: 'decay', label: 'decay that cannot be repaired' },
        { value: 'infection', label: 'an infection' },
        { value: 'gum', label: 'gum disease' },
        { value: 'crowding', label: 'crowding, or to make room for braces' },
        { value: 'wisdom', label: 'a wisdom tooth causing problems' },
        { value: 'broken', label: 'a broken tooth' },
      ],
    },
    {
      name: 'xray', kind: 'choices', who: 'dentist', label: 'Found on the X-ray', alone: NONE_NOTED, choices: [
        { value: 'nerve', label: 'the root is near the nerve canal' },
        { value: 'sinus', label: 'the root is near the sinus' },
        { value: 'roots', label: 'the roots are curved or joined' },
        { value: NONE_NOTED, label: 'nothing of note' },
      ],
    },
    riskFactors([['smokes', 'smoking'], ['thinners', 'blood thinners'], ['bone_meds', 'bone medicines (bisphosphonate or denosumab)'], ['radiotherapy', 'radiotherapy to the head or neck'], ['diabetes', 'diabetes']]),
    { name: 'follow_up', kind: 'text', who: 'desk', label: 'Follow-up', max: 120, prefill: { value: 'A check-up in 7 days' } },
    estimate(),
  ],
  patientFields: [{ name: 'keep_tooth', kind: 'yesno', label: H('Do you want to keep the tooth?', 'Gusto mo bang itabi ang ngipin?') }],
  inShort: [
    W('We will remove {teeth:tooth}.'),
    W('Why: {reason}.', { has: 'reason' }),
    W('For a few days: pain, swelling and some bleeding. Less often: a dry socket, an infection, or numbness of the lip, chin or tongue.'),
    W('Other choices include keeping the tooth, a root canal where that is possible, or no treatment.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will remove {teeth:tooth}: {type}.'),
      W('Stitches are placed if needed.'),
      W('You get an aftercare sheet to take home.'),
    ]),
    one('why', HEAD.why, 'why', [W('{reason}.')], { when: { has: 'reason' } }),
    list('risks', HEAD.risks, 'risks', [
      'Pain, swelling, bruising and some bleeding for a few days, more if you take blood thinners.',
      'A stiff jaw and sore corners of the mouth.',
      'Dry socket: the socket becomes painful a few days later. It is more common in smokers and after lower wisdom teeth.',
      'Infection.',
    ]),
    list('rare', HEAD.rare, 'rare', [
      'Damage to a nearby tooth, filling or crown.',
      'A small tip of root may be left in the bone when removing it would be riskier.',
      'Nerve injury: numbness or tingling of the lip, chin or tongue. It is usually temporary, and rarely permanent.',
      'Rarely, a broken jaw.',
      'Swallowing or breathing in a piece of tooth.',
      'Bone that heals slowly or not at all, with bone medicines or after radiotherapy.',
    ], { initials: true }),
    one('sinus', H('Upper back teeth'), 'special', [W('The roots of upper back teeth are close to the sinus. An opening into the sinus may happen, and may need more treatment.')],
      { when: { teethIn: UPPER_BACK } }),
    list('wisdom', H('Wisdom teeth'), 'special', [
      'The nerves to the lip, chin and tongue run close to lower wisdom teeth. After a lower wisdom tooth is removed, about 1 in 100 people are left with numbness that does not go away.',
      'Dry socket is more likely.',
      'A gum pocket may stay behind the next tooth.',
      'The risks rise with age.',
    ], { when: { teethIn: WISDOM }, initials: true }),
    one('xray', H('Found on your X-ray'), 'special', [W('{xray}.')], { when: hasReal('xray') }),
    forYou(),
    list('choices', HEAD.choices, 'choices', [
      'Keep the tooth and watch it.',
      'A root canal and a crown to save it, where that is possible.',
      'Medicine or draining the infection, which helps only for now.',
      'For a wisdom tooth on the nerve, removing only its crown (coronectomy).',
      'Seeing an oral surgeon.',
      'No treatment.',
      'After removal, the gap may need an implant, bridge or denture, at extra cost.',
    ]),
    list('without', HEAD.without, 'without', ['Pain, and an infection or swelling that may spread.', 'A cyst.', 'Damage to the next tooth.', 'Harder surgery later.']),
    one('care', HEAD.care, 'care', [
      W('Follow the aftercare sheet.'),
      W('No smoking, spitting or drinking through a straw for 24 to 48 hours.'),
      W('{follow_up}.', { has: 'follow_up' }),
    ], { list: true }),
    cost(costLines('estimate')),
    RIGHTS,
  ],
  meaning: W('the extraction of {teeth:tooth}'),
});

// ---------------------------------------------------------------------------
// 3. Root canal treatment
// ---------------------------------------------------------------------------
const ROOT_CANAL = base({
  code: 'root_canal', version: 'root-canal-2026-10', title: H('Root canal treatment', 'Pahintulot sa root canal'), group: 'treatment', order: 40, minutes: 3,
  attest: true, minors: 'guardian', validDays: 180, ticks: TICKS_ER,
  clinicFields: [
    teeth({ label: 'Tooth', forBox: 'Tooth', maxTeeth: 1 }),
    {
      name: 'diagnosis', kind: 'choice', who: 'dentist', label: 'Diagnosis', other: { max: 120 }, choices: [
        { value: 'inflamed', label: 'an inflamed nerve that will not heal' },
        { value: 'dead', label: 'a dead nerve with infection' },
        { value: 'abscess', label: 'an abscess' },
        { value: 'redo', label: 'an old root canal that is failing (a redo)' },
      ],
    },
    { name: 'visits', kind: 'number', who: 'desk', label: 'Visits', min: 1, max: 4, prefill: { value: 2 } },
    {
      name: 'after', kind: 'choice', who: 'dentist', label: 'Afterwards', forBox: 'Afterwards', choices: [
        { value: 'filling', label: 'a filling' }, { value: 'crown', label: 'a crown' }, { value: 'post_crown', label: 'a post and crown' },
      ],
    },
    estimate(),
    { name: 'estimate_after', kind: 'money', who: 'desk', label: 'The filling or crown after it, a separate fee', allowLater: true },
    { name: 'specialist', kind: 'yesno', who: 'dentist', label: 'Offer a root canal specialist (endodontist)', prefill: { value: 'yes' } },
  ],
  inShort: [
    W('We will clean and fill the inside of {teeth:tooth} over {visits:visit}.'),
    W('To keep the tooth and ease pain or infection.'),
    W('It may be sore for a few days. Less often an instrument breaks in a canal, the root is damaged, or the treatment fails and needs more.'),
    W('Other choices include removing the tooth, or no treatment.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will open {teeth:tooth}, remove the nerve, clean, medicate and fill the canals, over {visits:visit}.'),
      W('Then {after}.', { has: 'after' }),
    ]),
    one('why', HEAD.why, 'why', [
      W('To keep the tooth and ease pain or infection: {diagnosis}.', { has: 'diagnosis' }),
      W('To keep the tooth and ease pain or infection.', { not: { has: 'diagnosis' } }),
    ]),
    list('risks', HEAD.risks, 'risks', ['Pain, swelling or tenderness for a few days.']),
    list('rare', HEAD.rare, 'rare', [
      'A small instrument may break inside a canal.',
      'A hole may be made through the side of the root.',
      'A canal may be blocked or too curved to finish.',
      'Filling material may pass beyond the end of the root.',
      'A crack may be found during treatment.',
      'An existing crown or filling may be damaged.',
      'It may fail and need redoing, surgery at the root end, or removing the tooth.',
      'The tooth is weaker afterwards and may break without a crown.',
    ], { initials: true }),
    one('usually', H('How it usually goes'), 'special', [W('In large studies, about 9 in 10 root-treated teeth are still in place 4 to 10 years later, and a crown afterwards helps most.')]),
    one('specialist', H('A specialist'), 'special', [W('You may ask to see a root canal specialist (endodontist).')], { when: { f: 'specialist', in: ['yes'] } }),
    list('choices', HEAD.choices, 'choices', [
      'Removing the tooth, then an implant, bridge or denture, or leaving a gap.',
      'Watching it.',
      'Seeing a specialist.',
      'No treatment.',
    ]),
    list('without', HEAD.without, 'without', ['Pain.', 'An abscess.', 'Losing the tooth.']),
    one('care', HEAD.care, 'care', [W('Come back for {after}.', { has: 'after' }), W('Until then, chew on the other side.')], { list: true }),
    cost([...costLines('estimate', 'The root canal'), ...costLines('estimate_after', 'What comes after it, a separate fee')]),
    RIGHTS,
  ],
  meaning: W('root canal treatment of {teeth:tooth}'),
});

// ---------------------------------------------------------------------------
// 4. Fillings, crowns, bridges and veneers
// ---------------------------------------------------------------------------
const MADE = ['crown', 'bridge', 'veneer', 'inlay'];
const RESTORATION = base({
  code: 'restoration', version: 'restoration-2026-10', title: H('Fillings, crowns, bridges and veneers', 'Pahintulot sa pasta, crown, bridge at veneer'),
  group: 'treatment', order: 50, minutes: 2, attest: true, minors: 'guardian', validDays: 180, ticks: TICKS_ER,
  clinicFields: [
    {
      name: 'kind', kind: 'choices', who: 'dentist', label: 'What', forBox: 'Treatment', required: true, choices: [
        { value: 'filling', label: 'a filling' }, { value: 'crown', label: 'a crown' }, { value: 'bridge', label: 'a bridge' },
        { value: 'veneer', label: 'a veneer' }, { value: 'inlay', label: 'an inlay or onlay' },
      ],
    },
    teeth(),
    { name: 'bridge_teeth', kind: 'teeth', who: 'dentist', label: 'Teeth holding the bridge', required: true, when: { f: 'kind', in: ['bridge'] } },
    {
      name: 'material', kind: 'choice', who: 'dentist', label: 'Material', other: { max: 60 }, choices: [
        { value: 'composite', label: 'tooth-coloured composite' }, { value: 'glass_ionomer', label: 'glass ionomer' },
        { value: 'pfm', label: 'porcelain fused to metal' }, { value: 'zirconia', label: 'zirconia' },
        { value: 'lithium_disilicate', label: 'lithium disilicate (a glass ceramic)' }, { value: 'metal', label: 'full metal' },
      ],
    },
    { name: 'temporary', kind: 'yesno', who: 'dentist', label: 'A temporary first', when: { f: 'kind', in: MADE } },
    { name: 'visits', kind: 'number', who: 'desk', label: 'Visits', min: 1, max: 6 },
    estimate(),
  ],
  inShort: [
    W('We will repair {teeth:tooth} with {kind}.'),
    W('It may be sensitive for days to weeks, or the bite may need a small adjustment. Less often the nerve needs a root canal, or the work chips or comes loose.'),
    W('Other choices include another material, or no treatment.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will remove decay or the old filling and shape {teeth:tooth} for {kind}.'),
      W('The material: {material}.', { has: 'material' }),
      W('An impression or scan is taken, a temporary is placed, and the final one is fitted after you approve its fit and colour.', { f: 'kind', in: MADE }),
      W('Over {visits:visit}.', { has: 'visits' }),
    ]),
    list('risks', HEAD.risks, 'risks', [
      'Sensitivity to cold, heat or biting, usually for days to weeks.',
      'A high bite or sore jaw that needs a small adjustment.',
      'A stiff jaw.',
    ]),
    list('rare', HEAD.rare, 'rare', [
      'The nerve may get irritated and need a root canal.',
      'Deeper decay may be found once work starts, needing a bigger filling or a crown.',
      'Chipping, breaking or coming loose.',
      'New decay at the edges.',
      'A sore gum at the edge.',
      'The colour may not match exactly.',
      'Swallowing or breathing in a crown during a try-in.',
    ], { initials: true }),
    one('crowns', H('Crowns and bridges'), 'special', [
      W('The temporary can come off, so come back promptly.'),
      W('Delaying the final crown lets teeth move.'),
      W('The teeth holding the bridge ({bridge_teeth}) are shaped down for good.', { f: 'kind', in: ['bridge'] }),
    ], { list: true, when: { f: 'kind', in: ['crown', 'bridge'] } }),
    list('veneers', H('Veneers'), 'special', [
      'Some enamel is removed, and it cannot be put back.',
      'A chipped veneer usually cannot be repaired.',
      'The colour cannot change after bonding.',
      'Biting nails or ice, or grinding, can loosen a veneer; a night guard may be advised.',
    ], { when: { f: 'kind', in: ['veneer'] } }),
    list('choices', HEAD.choices, 'choices', [
      'No treatment.',
      'Another material.',
      'A filling instead of a crown, which protects the tooth less.',
      'Removing the tooth.',
      'For a gap: an implant or a denture.',
      'For looks: whitening, bonding or braces.',
    ]),
    list('without', HEAD.without, 'without', ['Decay spreads.', 'Pain.', 'Losing the tooth.']),
    one('care', HEAD.care, 'care', [W('Do not chew on a new filling until the numbness has gone.')]),
    cost(costLines('estimate')),
    RIGHTS,
  ],
  meaning: W('{kind} on {teeth:tooth}'),
});

// ---------------------------------------------------------------------------
// 5. Deep cleaning and gum treatment
// ---------------------------------------------------------------------------
const PERIODONTAL = base({
  code: 'periodontal', version: 'periodontal-2026-10', title: H('Deep cleaning and gum treatment', 'Pahintulot sa malalim na paglilinis at gamutan sa gilagid'),
  group: 'treatment', order: 60, minutes: 2, attest: true, minors: 'guardian', validDays: 180, ticks: TICKS_ERH,
  clinicFields: [
    {
      name: 'areas', kind: 'choices', who: 'dentist', label: 'Areas', forBox: 'Areas', required: true, alone: 'whole', choices: [
        { value: 'upper_right', label: 'the upper right' }, { value: 'upper_left', label: 'the upper left' },
        { value: 'lower_right', label: 'the lower right' }, { value: 'lower_left', label: 'the lower left' },
        { value: 'whole', label: 'the whole mouth' },
      ],
    },
    { name: 'visits', kind: 'number', who: 'desk', label: 'Visits', min: 1, max: 4 },
    { name: 'numbing', kind: 'yesno', who: 'dentist', label: 'With numbing' },
    {
      name: 'extras', kind: 'choices', who: 'dentist', label: 'Also', alone: NONE_NOTED, choices: [
        { value: 'chlorhexidine', label: 'a chlorhexidine mouthwash' }, { value: 'local_antibiotic', label: 'an antibiotic placed in the gum' },
        { value: NONE_NOTED, label: 'nothing else' },
      ],
    },
    { name: 'recheck_weeks', kind: 'number', who: 'desk', label: 'Recheck after (weeks)', min: 4, max: 12, prefill: { value: 6 } },
    {
      name: 'maintenance_months', kind: 'choice', who: 'desk', label: 'Maintenance every', choices: [
        { value: '3', label: '3 months' }, { value: '4', label: '4 months' }, { value: '6', label: '6 months' },
      ],
    },
    estimate(),
  ],
  inShort: [
    W('We will clean below the gums and smooth the roots in {areas}.'),
    W('To reduce the infection and slow bone loss.'),
    W('Gums may be sore and bleed for a few days, then pull back, so roots show and teeth feel sensitive.'),
    W('Other choices include an ordinary cleaning, a gum specialist, or no treatment.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will remove tartar and bacteria below the gum and smooth the roots in {areas}.'),
      W('Over {visits:visit}.', { has: 'visits' }),
      W('With numbing.', { f: 'numbing', in: ['yes'] }),
      W('Also: {extras}.', hasReal('extras')),
    ]),
    one('why', HEAD.why, 'why', [W('To reduce the infection and slow bone loss.')]),
    list('risks', HEAD.risks, 'risks', [
      'Swelling, soreness and bleeding for a few days.',
      'As the swelling goes down the gums pull back: roots show, gaps between teeth look bigger, and food catches.',
      'Sensitivity to hot, cold and sweets.',
      'Teeth may feel loose at first; most firm up, but not all.',
      'Infection.',
    ], { initials: true }),
    list('results', H('Results'), 'special', [
      'There is no guarantee. Smoking, diabetes and cleaning at home change the result.',
      'Without regular maintenance, gum disease usually comes back.',
    ]),
    list('choices', HEAD.choices, 'choices', [
      'No treatment: the disease goes on, and teeth can be lost.',
      'An ordinary cleaning only, which does not reach deep pockets.',
      'Gum surgery, or seeing a periodontist.',
      'Removing teeth that cannot be saved.',
    ]),
    one('without', HEAD.without, 'without', [W('The gum disease goes on, and teeth can loosen and be lost.')]),
    one('care', HEAD.care, 'care', [
      W('Brush and clean between your teeth every day.'),
      W('A recheck in {recheck_weeks:week}.', { has: 'recheck_weeks' }),
      W('Then maintenance every {maintenance_months}.', { has: 'maintenance_months' }),
    ], { list: true }),
    cost(costLines('estimate')),
    RIGHTS,
  ],
  meaning: W('deep cleaning and gum treatment of {areas}'),
});

// ---------------------------------------------------------------------------
// 6. Dentures
// ---------------------------------------------------------------------------
const DENTURE = base({
  code: 'denture', version: 'denture-2026-10', title: H('Dentures', 'Pahintulot sa pustiso'), group: 'treatment', order: 70, minutes: 2,
  attest: true, minors: 'guardian', validDays: 365, ticks: TICKS_ER,
  clinicFields: [
    {
      name: 'arch', kind: 'choice', who: 'dentist', label: 'Jaw', forBox: 'Jaw', required: true, choices: [
        { value: 'upper', label: 'the upper jaw' }, { value: 'lower', label: 'the lower jaw' }, { value: 'both', label: 'both jaws' },
      ],
    },
    {
      name: 'type', kind: 'choice', who: 'dentist', label: 'Type', forBox: 'Type', required: true, choices: [
        { value: 'complete', label: 'a complete denture' }, { value: 'partial_acrylic', label: 'a partial acrylic denture' },
        { value: 'flexible', label: 'a flexible denture' }, { value: 'cast', label: 'a cast metal partial denture' },
        { value: 'immediate', label: 'an immediate denture, worn right after extractions' }, { value: 'overdenture', label: 'an overdenture' },
      ],
    },
    { name: 'extract_first', kind: 'teeth', who: 'dentist', label: 'Teeth to remove first' },
    { name: 'visits', kind: 'text', who: 'desk', label: 'Visits', max: 160, prefill: { value: 'Impression, try-in, fitting, then adjustments' } },
    { name: 'included', kind: 'text', who: 'desk', label: 'Included', max: 160, prefill: { value: 'Adjustments for 3 months after fitting' } },
    { name: 'relines', kind: 'text', who: 'desk', label: 'Relines', max: 160, prefill: { value: 'Relines after that are a separate fee' } },
    estimate(),
  ],
  inShort: [
    W('We will make {type} for {arch}.'),
    W('It takes weeks to get used to: sore spots, speech and eating change at first. Gums get smaller over time, so relines are needed.'),
    W('Other choices include a bridge, implants, or no replacement.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will make {type} for {arch}.'),
      W('Teeth to remove first: {extract_first}.', { has: 'extract_first' }),
      W('The visits: {visits}.', { has: 'visits' }),
    ]),
    list('risks', H('Risks and limits'), 'risks', [
      'It takes weeks to get used to.',
      'Sore spots and ulcers that need adjustment visits.',
      'Speech changes at first.',
      'Learning to eat again.',
      'Looseness, most of all with a lower complete denture.',
      'Gums and bone get smaller over time, so relines or a new denture are needed.',
      'Immediate dentures need more adjustments and relines, and are often temporary.',
      'The clasps of a partial denture can raise decay and gum problems on the teeth holding them.',
      'It may not support the lips and face as natural teeth did.',
      'It can break: do not glue it at home.',
      'Smell or stains without daily cleaning.',
    ], { initials: true }),
    list('choices', HEAD.choices, 'choices', [
      'No replacement: teeth drift and the bite collapses.',
      'A bridge.',
      'Implants.',
      'A denture held by implants.',
    ]),
    one('without', HEAD.without, 'without', [W('The teeth next to the gaps drift, the bite changes, and chewing gets harder.')]),
    one('care', HEAD.care, 'care', [
      W('Come to every fitting and adjustment.'),
      W('{included}.', { has: 'included' }),
      W('{relines}.', { has: 'relines' }),
    ], { list: true }),
    cost(costLines('estimate')),
    RIGHTS,
  ],
  meaning: W('{type} for {arch}'),
});

// ---------------------------------------------------------------------------
// 7. Dental implants
// ---------------------------------------------------------------------------
const IMPLANT = base({
  code: 'implant', version: 'implant-2026-10', title: H('Dental implants', 'Pahintulot sa dental implant'), group: 'treatment', order: 80, minutes: 3,
  attest: true, minors: 'guardian', validDays: 180, ticks: TICKS_ERH,
  clinicFields: [
    teeth({ label: 'Implant sites', forBox: 'Sites' }),
    {
      name: 'timing', kind: 'choice', who: 'dentist', label: 'When', choices: [
        { value: 'immediate', label: 'right after an extraction' }, { value: 'healed', label: 'after healing' },
      ],
    },
    {
      name: 'graft', kind: 'choice', who: 'dentist', label: 'Graft', choices: [
        { value: NONE_NOTED, label: 'no graft' }, { value: 'bone', label: 'a bone graft' }, { value: 'sinus', label: 'a sinus lift' },
        { value: 'both', label: 'a bone graft and a sinus lift' },
      ],
    },
    { name: 'scan', kind: 'yesno', who: 'dentist', label: 'A 3D scan (CBCT) was taken' },
    { name: 'healing_months', kind: 'number', who: 'dentist', label: 'Healing (months)', min: 2, max: 9 },
    {
      name: 'restoration', kind: 'choice', who: 'dentist', label: 'Then', forBox: 'Then', choices: [
        { value: 'crown', label: 'a crown' }, { value: 'bridge', label: 'a bridge' }, { value: 'overdenture', label: 'an overdenture' },
      ],
    },
    { name: 'made_by', kind: 'text', who: 'desk', label: 'Made by (laboratory)', max: 120 },
    { name: 'estimate_surgery', kind: 'money', who: 'desk', label: 'The surgery', forBox: 'Surgery', prefill: 'fee_guide', allowLater: true, required: true },
    { name: 'estimate_restoration', kind: 'money', who: 'desk', label: 'The crown, bridge or overdenture', allowLater: true },
    riskFactors([['smokes', 'smoking'], ['diabetes', 'diabetes'], ['bone_meds', 'bone medicines'], ['grinding', 'grinding'], ['radiotherapy', 'radiotherapy']]),
  ],
  inShort: [
    W('We will place an implant at {teeth:tooth}; after it heals, {restoration} is attached.'),
    W('For a few days: pain, swelling and bruising. Less often the implant does not take and is removed, or a nerve or the sinus is injured.'),
    W('Other choices include a bridge, a denture, or no replacement.'),
    ...costShort('estimate_surgery'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('With numbing, the gum is opened, the bone prepared and an implant placed at {teeth:tooth}.'),
      W('When: {timing}.', { has: 'timing' }),
      W('Also: {graft}.', hasReal('graft')),
      W('A 3D scan (CBCT) was taken to plan it.', { f: 'scan', in: ['yes'] }),
      W('After {healing_months:month}, {restoration} is attached.', { all: [{ has: 'healing_months' }, { has: 'restoration' }] }),
      W('Made by: {made_by}.', { has: 'made_by' }),
    ]),
    list('risks', HEAD.risks, 'risks', ['Pain, swelling and bruising.', 'Infection.']),
    list('rare', HEAD.rare, 'rare', [
      'The implant does not join the bone and is removed; trying again may be possible.',
      'Nerve injury in the lower jaw: numbness of the lip, chin or tongue, temporary or permanent.',
      'An opening into the sinus in the upper jaw.',
      'Injury to nearby teeth.',
      'A graft that fails.',
      'Rarely, a broken jaw.',
    ], { initials: true }),
    list('later', H('Later on'), 'special', [
      'Gum recession, or a grey edge showing.',
      'A loose screw.',
      'A chipped crown.',
      'Infection around the implant with bone loss (peri-implantitis), in about 1 in 5 patients in studies.',
    ]),
    list('usually', H('How it usually goes'), 'special', [
      'In studies, about 96 in 100 implants are still in place after 10 years.',
      'Smoking, diabetes that is not under control, and some bone medicines raise the risk of failure.',
    ]),
    forYou(),
    list('choices', HEAD.choices, 'choices', ['No replacement.', 'A bridge.', 'A removable denture.', 'A resin-bonded bridge.']),
    one('without', HEAD.without, 'without', [W('The gap stays, and the teeth next to it may drift.')]),
    one('care', HEAD.care, 'care', [W('Clean around the implant like a tooth, with regular reviews.')]),
    cost([...costLines('estimate_surgery', 'The surgery'), ...costLines('estimate_restoration', 'What is attached to it')]),
    RIGHTS,
  ],
  meaning: W('a dental implant at {teeth:tooth}'),
});

// ---------------------------------------------------------------------------
// 8. Braces and orthodontic treatment
// ---------------------------------------------------------------------------
const ORTHO = base({
  code: 'ortho', version: 'ortho-2026-10', title: H('Braces and orthodontic treatment', 'Pahintulot sa braces'), group: 'treatment', order: 90, minutes: 3,
  attest: true, minors: 'guardian', validDays: 365, ticks: TICKS_ER,
  clinicFields: [
    {
      name: 'appliance', kind: 'choice', who: 'dentist', label: 'Appliance', forBox: 'Appliance', required: true, choices: [
        { value: 'metal', label: 'metal braces' }, { value: 'ceramic', label: 'ceramic braces' }, { value: 'aligners', label: 'clear aligners' },
        { value: 'removable', label: 'a removable appliance' }, { value: 'functional', label: 'a functional appliance' },
      ],
    },
    { name: 'extractions', kind: 'teeth', who: 'dentist', label: 'Teeth to remove for the treatment' },
    { name: 'mini_screws', kind: 'yesno', who: 'dentist', label: 'Mini-screws' },
    { name: 'months', kind: 'range', who: 'dentist', label: 'About how long (months)', forBox: 'About', unit: 'month', min: 3, max: 48 },
    { name: 'visit_weeks', kind: 'number', who: 'desk', label: 'A visit every (weeks)', min: 2, max: 12 },
    { name: 'fees', kind: 'text', who: 'desk', label: 'Down payment and monthly adjustments', max: 200 },
    { name: 'breakage', kind: 'text', who: 'desk', label: 'A broken bracket or lost aligner', max: 160 },
    { name: 'retainer', kind: 'text', who: 'dentist', label: 'Retainer', max: 120 },
    estimate({ label: 'Estimated total', forBox: 'Total estimate' }),
  ],
  inShort: [
    W('We will straighten your teeth with {appliance}.'),
    W('Sore after adjustments; decay and white spots without good cleaning; roots may shorten. Teeth move back without retainers.'),
    W('Other choices include limited treatment, crowns or veneers, or no treatment.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will straighten your teeth with {appliance}.'),
      W('It takes about {months:month}.', { has: 'months' }),
      W('A visit every {visit_weeks:week}.', { has: 'visit_weeks' }),
      W('Teeth to remove for the treatment: {extractions}.', { has: 'extractions' }),
      W('Mini-screws are placed in the bone to help move teeth.', { f: 'mini_screws', in: ['yes'] }),
      W('Afterwards: {retainer}.', { has: 'retainer' }),
    ]),
    list('risks', HEAD.risks, 'risks', [
      'Discomfort after adjustments.',
      'White spots and decay if teeth are not cleaned well.',
      'Gum disease.',
      'Roots may get shorter; this cannot be predicted.',
      'A tooth hurt in the past may lose its nerve.',
      'Mini-screws can loosen, break or irritate.',
      'Jaw joint problems can happen with or without braces.',
      'Teeth stuck in the bone (impacted) may not move.',
      'Injury from the appliance, or swallowing a part of it.',
      'Allergy to a material.',
      'Treatment may take longer than planned, and fees may change.',
      'Smoking worsens the results.',
    ], { initials: true }),
    list('results', H('Results'), 'special', [
      'Teeth tend to move back, so retainers are worn long-term.',
      'No one can promise perfectly straight teeth for life.',
      'Wisdom teeth may push teeth.',
    ]),
    one('records', H('Records'), 'records', [W('X-rays, photos and models before, during and after are part of the treatment.')]),
    list('choices', HEAD.choices, 'choices', [
      'No treatment.',
      'Limited treatment.',
      'Crowns or veneers to hide crooked teeth.',
      'Jaw surgery, by a specialist, for a jaw problem.',
    ]),
    one('without', HEAD.without, 'without', [W('The teeth and bite stay as they are.')]),
    one('care', HEAD.care, 'care', [W('Clean around the braces carefully every day, and come to every adjustment.')]),
    cost([
      ...costLines('estimate'),
      W('Payments: {fees}.', { has: 'fees' }),
      W('If something breaks: {breakage}.', { has: 'breakage' }),
      W('Moving to another dentist may change the fees and the time.'),
    ]),
    RIGHTS,
  ],
  meaning: W('orthodontic treatment with {appliance}'),
});

// ---------------------------------------------------------------------------
// 9. Tooth whitening
// ---------------------------------------------------------------------------
const WHITENING = base({
  code: 'whitening', version: 'whitening-2026-10', title: H('Tooth whitening', 'Pahintulot sa pagpapaputi ng ngipin'), group: 'treatment', order: 100, minutes: 2,
  attest: true, minors: 'not_under_18', validDays: 90, ticks: TICKS_ER,
  clinicFields: [
    {
      name: 'method', kind: 'choice', who: 'dentist', label: 'How', forBox: 'How', required: true, choices: [
        { value: 'clinic', label: 'in the clinic' }, { value: 'trays', label: 'with trays at home' }, { value: 'both', label: 'in the clinic and with trays at home' },
      ],
    },
    { name: 'product', kind: 'text', who: 'dentist', label: 'Product', max: 80 },
    { name: 'strength', kind: 'text', who: 'dentist', label: 'Strength', max: 40, help: 'For example: hydrogen peroxide 35%.' },
    { name: 'sessions', kind: 'number', who: 'desk', label: 'Sessions', min: 1, max: 10 },
    { name: 'shade_before', kind: 'text', who: 'dentist', label: 'Shade before', max: 20 },
    { name: 'wont_change', kind: 'teeth', who: 'dentist', label: 'Fillings, crowns or veneers that will not whiten' },
    estimate(),
  ],
  patientFields: [
    { name: 'pregnant', kind: 'yesnounsure', label: H('Are you pregnant, or could you be?'), required: true, stop: ['yes', 'unsure'] },
    { name: 'smoke_drink', kind: 'yesno', label: H('Do you smoke, or drink alcohol often?'), required: true, stop: ['yes'] },
    { name: 'recent_work', kind: 'yesno', label: H('Have you had a filling or crown in the last 2 weeks?'), required: true, stop: ['yes'] },
  ],
  inShort: [
    W('We will whiten your natural teeth {method}.'),
    W('Teeth and gums may be sensitive for a short time. Fillings, crowns and veneers do not whiten.'),
    W('Not for anyone under 18, while pregnant, or within 2 weeks of a filling or crown.'),
    W('Other choices include cleaning and polishing, or no treatment.'),
    ...costShort('estimate'),
  ],
  sections: [
    one('what', HEAD.what, 'what', [
      W('We will whiten your natural teeth {method}.'),
      W('Over {sessions:session}.', { has: 'sessions' }),
      W('The product: {product}.', { has: 'product' }),
      W('Its strength: {strength}.', { has: 'strength' }),
      W('Your shade before: {shade_before}.', { has: 'shade_before' }),
    ]),
    list('before', H('Before'), 'special', [
      'An examination, and treatment of decay and gum disease, come first.',
      'The product label says it is not for anyone under 18, not while pregnant, not for people who smoke or drink often, and not within 2 weeks of a filling or crown.',
    ]),
    list('risks', HEAD.risks, 'risks', ['Sensitive teeth, usually mild and short.', 'Sore gums from the gel.'], { initials: true }),
    one('limits', H('Limits'), 'special', [
      W('Only natural teeth whiten.'),
      W('Fillings, crowns, veneers and dentures do not whiten, and may need replacing to match, at extra cost.'),
      W('These will not change: {wont_change}.', { has: 'wont_change' }),
      W('Results vary, and the shade fades over time.'),
      W('White spots may look more visible for a while.'),
    ], { list: true }),
    list('choices', HEAD.choices, 'choices', ['No treatment.', 'Cleaning and polishing.', 'Bonding, veneers or crowns.']),
    one('without', HEAD.without, 'without', [W('Your teeth stay their present shade.')]),
    cost(costLines('estimate')),
    RIGHTS,
  ],
  meaning: W('tooth whitening'),
});

// ---------------------------------------------------------------------------
// 10. Photos and use of records
// ---------------------------------------------------------------------------
const PHOTOS = base({
  code: 'photos', version: 'photos-2026-10', title: H('Photos and use of records', 'Pahintulot sa litrato at paggamit ng rekord'), group: 'records', order: 200, minutes: 1,
  attest: false, minors: 'guardian', validDays: null, refuseUnsigned: true, ticks: [],
  clinicFields: [
    {
      name: 'photo_types', kind: 'choices', who: 'desk', label: 'Photos taken', choices: [
        { value: 'intraoral', label: 'photos inside the mouth' }, { value: 'face', label: 'photos of the face' },
      ],
    },
    {
      name: 'uses', kind: 'choices', who: 'desk', label: 'Uses to ask about', required: true, choices: [
        { value: 'specialist', label: 'sharing with a specialist or laboratory for this treatment' },
        { value: 'teaching', label: 'teaching and journals, without your name' },
        { value: 'social', label: 'the clinic’s website or social media' },
      ],
    },
  ],
  patientFields: [
    { name: 'use_specialist', kind: 'yesno', label: H('May the clinic share them with a specialist or laboratory for this treatment?'), when: { f: 'uses', in: ['specialist'] } },
    { name: 'use_teaching', kind: 'yesno', label: H('May they be used for teaching and in journals, without your name?'), when: { f: 'uses', in: ['teaching'] } },
    { name: 'use_social', kind: 'yesno', label: H('May they be shown on the clinic’s website or social media?'), when: { f: 'uses', in: ['social'] } },
    { name: 'face', kind: 'yesno', label: H('On the website or social media, may your face show?'), when: { f: 'uses', in: ['social'] } },
    { name: 'name', kind: 'yesno', label: H('On the website or social media, may your name show?'), when: { f: 'uses', in: ['social'] } },
  ],
  inShort: [
    W('The clinic asks your permission to use photos of your teeth for things other than your care.'),
    W('Saying no does not change your care.'),
    W('You may change your mind at any time.'),
  ],
  sections: [
    one('record', H('For your record'), 'records', [W('Photos, X-rays and scans for diagnosis and your record are part of your care. The consent to examination and treatment and the privacy notice cover them.')]),
    one('what', H('What the clinic asks'), 'what', [
      W('The clinic takes {photo_types}.', { has: 'photo_types' }),
      W('It asks your permission for each of these: {uses}.'),
    ]),
    list('choices', H('Your choices'), 'special', ['Saying no to any of these does not change your care.', 'Each use has its own yes or no. Nothing is ticked for you.']),
    list('rights', H('Changing your mind'), 'rights', [
      'To change your mind later, tell the clinic in person, by phone or by text.',
      'It stops future use. What was already published or printed may not be recalled.',
    ]),
  ],
  meaning: W('the choices on this form about my photos and records'),
  words: { ...WORDS, agree: W('Yes, with these choices.'), refuse: W('No, thank you.') },
});

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------
/** Every template, by consent_version id, the general consent included. */
export const TEMPLATES: Readonly<Record<string, Template>> = Object.fromEntries(
  [generalFrom('treatment-2026-09'), ANAESTHESIA, EXTRACTION, ROOT_CANAL, RESTORATION, PERIODONTAL, DENTURE, IMPLANT, ORTHO, WHITENING, PHOTOS]
    .map((t) => [t.version, t]));

/** The versions a dentist and the owner's lawyer have read, and in which languages. Empty: nothing is offered on a production server yet (§3.8). */
export const CONSENT_REVIEWED: readonly { version: string; langs: readonly ('en' | 'fil')[]; by: string; on: string }[] = [];

/** Minutes the other parts take, for "4 parts · about 10 minutes". */
export const PAGE_MINUTES = { page1: 5, check: 1 } as const;

export const CODES: readonly Code[] = ['general', 'anaesthesia', 'extraction', 'root_canal', 'restoration', 'periodontal', 'denture', 'implant', 'ortho', 'whitening', 'photos'];

/** The template of a version, or null when this server has no words for it. */
export const templateOf = (version: string | null | undefined): Template | null => (version && TEMPLATES[version]) || null;

/** Offered on this server: every template on a development machine; on a production one only those CONSENT_REVIEWED lists. */
export const reviewOf = (version: string) => CONSENT_REVIEWED.find((r) => r.version === version) ?? null;
export const offered = (t: Template, production: boolean): boolean => !production || !!reviewOf(t.version);
/** The languages a page shows: English, and Filipino where reviewed (or on a development machine, tagged). */
export const langsFor = (t: Template, production: boolean): ('en' | 'fil')[] => (!production || reviewOf(t.version)?.langs.includes('fil') ? ['en', 'fil'] : ['en']);

/**
 * The forms a procedure in the fee guide suggests (§3.1), from its code, name
 * and category: for suggestions and the fee-guide chips only, never a rule.
 * Filling and crown also "often" need anaesthesia (OFTEN_WITH). Braces
 * suggest ortho only when no ortho form is signed (the caller knows).
 */
export function consentsForCatalog(code: string | null, name: string | null, category: string | null): Code[] {
  const words = ` ${(name ?? '').toLowerCase()} ${(code ?? '').toLowerCase().replace(/[_-]+/g, ' ')} `;
  if (/implant/.test(words)) return ['implant', 'anaesthesia'];
  if (/root planing|deep scal|periodont|curettage/.test(words)) return ['periodontal', 'anaesthesia'];
  switch (kindForCatalog(code, name, category)) {
    case 'extraction': case 'surgical_extraction': return ['extraction', 'anaesthesia'];
    case 'root_canal': return ['root_canal', 'anaesthesia'];
    case 'filling': case 'crown': return ['restoration'];
    case 'denture': return ['denture'];
    case 'braces_adjustment': return ['ortho'];
    case 'whitening': return ['whitening'];
    default: return [];
  }
}
/** Forms often needed with another: shown as "Often needed", never ticked for the desk. */
export const OFTEN_WITH: Readonly<Partial<Record<Code, readonly Code[]>>> = { restoration: ['anaesthesia'] };

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------
/** FDI tooth numbers: 11–48 permanent, 51–85 milk teeth. */
export const isFdi = (n: number) => { const q = Math.floor(n / 10), t = n % 10; return (q >= 1 && q <= 4 && t >= 1 && t <= 8) || (q >= 5 && q <= 8 && t >= 1 && t <= 5); };

/** Centavos as pesos: ₱3,000 or ₱3,000.50. */
export const pesoText = (c: number): string => {
  const whole = Math.floor(c / 100), cents = c % 100;
  return `₱${whole.toLocaleString('en-PH')}${cents ? '.' + String(cents).padStart(2, '0') : ''}`;
};

/** "a, b and c". */
export const andList = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const isEmpty = (v: FieldValue | undefined): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const choiceLabel = (f: ClinicField, v: string | { other: string }, pill = false): string => {
  if (typeof v !== 'string') return v.other;
  const c = f.choices?.find((x) => x.value === v);
  return (pill ? c?.short ?? c?.label : c?.label) ?? v;
};

/**
 * One field's value in words, as a sentence has it; `pill`: as the For box
 * shows it (a choice's short label); `lang` 'fil': a line in Filipino, where
 * an amount is the number alone (what it includes is typed in English).
 */
export function valueText(f: ClinicField, v: FieldValue | undefined, style?: Style, opts: { pill?: boolean; lang?: 'en' | 'fil' } = {}): string {
  if (isEmpty(v)) return '';
  const unit = (n: number) => (style && style !== 'tooth' ? ` ${style}${n === 1 ? '' : 's'}` : '');
  switch (f.kind) {
    case 'teeth': {
      const t = (v as number[]).map(String);
      return style === 'tooth' ? `${t.length === 1 ? 'tooth' : 'teeth'} ${andList(t)}` : andList(t);
    }
    case 'choice': return choiceLabel(f, v as string | { other: string }, opts.pill);
    case 'choices': return andList((v as string[]).map((x) => choiceLabel(f, x, opts.pill)));
    case 'number': return `${v}${unit(v as number)}`;
    case 'range': { const r = v as { from: number; to: number }; return r.from === r.to ? `${r.from}${unit(r.from)}` : `${r.from} to ${r.to}${unit(r.to)}`; }
    case 'money': {
      const m = v as Money;
      if (m.kind === 'later') return 'told before starting';
      if (opts.lang === 'fil') return m.kind === 'range' ? `${pesoText(m.from)}–${pesoText(m.to)}` : pesoText(m.from);
      const amount = m.kind === 'range' ? `${pesoText(m.from)} to ${pesoText(m.to)}` : pesoText(m.from);
      return m.includes ? `${amount}, including ${m.includes}` : amount;
    }
    case 'yesno': return v === 'yes' ? 'yes' : 'no';
    default: return String(v);
  }
}

/** Does this condition hold for these fields? `minor` null: not known (a minor-only line is not shown). */
export function holds(c: Cond | undefined, t: Template, fields: Readonly<Fields>, minor: boolean | null): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => holds(x, t, fields, minor));
  if ('not' in c) return !holds(c.not, t, fields, minor);
  if ('minor' in c) return minor === c.minor;
  if ('has' in c) return !isEmpty(fields[c.has]);
  if ('teethIn' in c) { const v = fields[c.f ?? 'teeth']; return Array.isArray(v) && (v as unknown[]).some((n) => typeof n === 'number' && c.teethIn.includes(n)); }
  const v = fields[c.f];
  if (isEmpty(v)) return false;
  if (Array.isArray(v)) return (v as unknown[]).some((x) => c.in.includes(typeof x === 'object' && x !== null ? 'other' : String(x)));
  if (typeof v === 'object' && v !== null) return 'kind' in v ? c.in.includes(String((v as Money).kind)) : 'other' in v ? c.in.includes('other') : false;
  return c.in.includes(String(v));
}

// ---------------------------------------------------------------------------
// Reading the clinic's part (§3.3)
// ---------------------------------------------------------------------------
/** What the desk posted, as typed: a field's name (or name_kind, name_from, name_to, name_includes, name_other), one value or several. */
export type RawPart = Record<string, string | readonly string[] | undefined>;

const first = (raw: RawPart, name: string): string => { const v = raw[name]; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
const all = (raw: RawPart, name: string): string[] => { const v = raw[name]; return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)]; };
const clean = (s: unknown): string => oneLine(visibleOnly(String(s ?? ''))).normalize('NFC');

/** Most a money field may say: ₱5,000,000 (in centavos). */
export const MONEY_MAX = 500_000_000;
/** The stored fields, at most (the database refuses more: 039). */
export const FIELDS_MAX_BYTES = 8 * 1024;

/** Pesos as typed ("3,000", "₱ 3000.50") → centavos, or null. */
export function readPesos(s: string): number | null {
  const t = s.replace(/[₱,\s]/g, '').replace(/^php/i, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  const c = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return c <= MONEY_MAX ? c : null;
}

/** Teeth as typed ("36, 37 38") or picked → sorted, unique FDI numbers; null when something is not a tooth number. */
export function readTeeth(values: readonly string[]): number[] | null {
  const parts = values.flatMap((v) => clean(v).split(/[^0-9]+/)).filter(Boolean);
  const out = new Set<number>();
  for (const p of parts) {
    if (!/^\d{2}$/.test(p) || !isFdi(Number(p))) return null;
    out.add(Number(p));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Read and check the clinic's part of a form as posted. Every value is read
 * with visibleOnly and oneLine; `fields` holds the declared names only (null
 * when empty, or when its `when` does not hold). `ctx.dentist`: the named
 * dentist is confirming, so the dentist's required fields are required;
 * otherwise they are proposals and may stay empty (`proposed` names those
 * given). `ctx.minor`: the patient is under 18 (null: not known yet).
 */
export function readClinicPart(t: Template, raw: RawPart, ctx: { minor: boolean | null; dentist: boolean }): { fields: Fields; errors: Record<string, string>; proposed: string[] } {
  const fields: Fields = {};
  const errors: Record<string, string> = {};
  const say = (name: string, text: string) => { if (!errors[name]) errors[name] = text; };
  if (t.minors === 'not_under_18' && ctx.minor === true) say('_form', 'Not for under 18: the product label says so.');

  for (const f of t.clinicFields) {
    let v: FieldValue = null;
    switch (f.kind) {
      case 'teeth': {
        const typed = all(raw, f.name).filter((x) => clean(x) !== '');
        if (!typed.length) break;
        const teeth = readTeeth(typed);
        if (!teeth) say(f.name, 'Teeth are FDI numbers: 11 to 48, or 51 to 85 for milk teeth.');
        else if (teeth.length > (f.maxTeeth ?? 16)) say(f.name, f.maxTeeth === 1 ? 'One tooth per form.' : `At most ${f.maxTeeth ?? 16} teeth on one form.`);
        else v = teeth;
        break;
      }
      case 'choice': {
        const s = clean(first(raw, f.name));
        if (!s) break;
        if (s === 'other' && f.other) {
          const o = clean(first(raw, `${f.name}_other`));
          if (!o) say(f.name, 'Write what it is.');
          else if (o.length > f.other.max) say(f.name, `Keep it under ${f.other.max} characters.`);
          else v = { other: o };
        } else if (f.choices?.some((c) => c.value === s)) v = s;
        else say(f.name, 'Choose one from the list.');
        break;
      }
      case 'choices': {
        const picked = [...new Set(all(raw, f.name).map(clean).filter(Boolean))];
        if (!picked.length) break;
        if (picked.some((x) => !f.choices?.some((c) => c.value === x))) { say(f.name, 'Choose from the list.'); break; }
        if (f.alone && picked.includes(f.alone) && picked.length > 1) {
          const label = f.choices?.find((c) => c.value === f.alone)?.label ?? f.alone;
          say(f.name, `“${label}” goes alone. Untick it or the others.`);
          break;
        }
        v = (f.choices ?? []).map((c) => c.value).filter((x) => picked.includes(x));
        break;
      }
      case 'text': {
        const s = clean(first(raw, f.name));
        if (!s) break;
        if (s.length > (f.max ?? 160)) say(f.name, `Keep it under ${f.max ?? 160} characters.`);
        else v = s;
        break;
      }
      case 'number': {
        const s = clean(first(raw, f.name));
        if (!s) break;
        const n = /^\d{1,4}$/.test(s) ? Number(s) : NaN;
        if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 9999)) say(f.name, `A whole number from ${f.min ?? 0} to ${f.max ?? 9999}.`);
        else v = n;
        break;
      }
      case 'range': {
        const a = clean(first(raw, `${f.name}_from`)), b = clean(first(raw, `${f.name}_to`)) || a;
        if (!a) break;
        const from = /^\d{1,4}$/.test(a) ? Number(a) : NaN, to = /^\d{1,4}$/.test(b) ? Number(b) : NaN;
        const lo = f.min ?? 0, hi = f.max ?? 9999;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < lo || to > hi || from > to) say(f.name, `From ${lo} to ${hi}, the smaller number first.`);
        else v = { from, to };
        break;
      }
      case 'money': {
        const kind = clean(first(raw, `${f.name}_kind`));
        if (!kind) break;
        const includes = clean(first(raw, `${f.name}_includes`));
        if (includes.length > 160) { say(f.name, 'Keep what it includes under 160 characters.'); break; }
        if (kind === 'later') { if (f.allowLater) v = { kind: 'later' }; else say(f.name, 'Write the estimate.'); break; }
        const from = readPesos(clean(first(raw, `${f.name}_from`)));
        if (from === null) { say(f.name, 'Write the amount in pesos, like 3,000, up to ₱5,000,000.'); break; }
        if (kind === 'amount') { v = { kind: 'amount', from, ...(includes ? { includes } : {}) }; break; }
        if (kind === 'range') {
          const to = readPesos(clean(first(raw, `${f.name}_to`)));
          if (to === null || to < from) { say(f.name, 'Write the range in pesos, the smaller amount first.'); break; }
          v = to === from ? { kind: 'amount', from, ...(includes ? { includes } : {}) } : { kind: 'range', from, to, ...(includes ? { includes } : {}) };
          break;
        }
        say(f.name, 'Choose an amount, a range, or “told before starting”.');
        break;
      }
      case 'yesno': {
        const s = clean(first(raw, f.name));
        if (s === 'yes' || s === 'no') v = s;
        else if (s) say(f.name, 'Choose yes or no.');
        break;
      }
    }
    fields[f.name] = v;
  }

  // What is shown, and so kept and required. A field whose `when` does not hold is stored as null.
  const proposed: string[] = [];
  for (const f of t.clinicFields) {
    if (!holds(f.when, t, fields, ctx.minor)) { fields[f.name] = null; delete errors[f.name]; continue; }
    const needed = f.required && (f.who === 'desk' || ctx.dentist);
    if (needed && isEmpty(fields[f.name]) && !errors[f.name]) say(f.name, f.kind === 'money' ? 'Write the estimate, or choose “told before starting”.' : f.kind === 'teeth' ? 'Write the teeth.' : 'Fill this in.');
    if (f.who === 'dentist' && !ctx.dentist && !isEmpty(fields[f.name])) proposed.push(f.name);
  }
  for (const group of t.needOne) {
    const fs = t.clinicFields.filter((f) => group.includes(f.name));
    const dentistOnly = fs.every((f) => f.who === 'dentist');
    if ((ctx.dentist || !dentistOnly) && group.every((n) => isEmpty(fields[n]))) say(group[0], `Fill in one of these: ${andList(fs.map((f) => f.label.toLowerCase()))}.`);
  }
  if (new TextEncoder().encode(JSON.stringify(fields)).length > FIELDS_MAX_BYTES) say('_form', 'That is too much for one form. Shorten the longest answers.');
  return { fields, errors, proposed };
}

// ---------------------------------------------------------------------------
// Reading the patient's part (§2.3)
// ---------------------------------------------------------------------------
export type Decision = 'agreed' | 'refused' | 'later';
/** Who signs, as the page offers it. */
export type SignerChoice = 'patient' | 'mark' | 'parent' | 'court_guardian' | 'substitute' | 'written' | 'representative';
export type Authority = 'parent' | 'court_guardian' | 'substitute' | 'written' | 'representative';
export interface Signer {
  name: string;
  as: 'patient' | 'guardian';
  method: 'sign' | 'mark';
  relation: string | null;
  authority: Authority | null;
  ground: SubstituteGround | null;
  /** For a substitute: who they are (SubstituteWho). */
  note: SubstituteWho | null;
}

/** Languages a page may be explained in (§2.3 step 7). */
export const EXPLAINED_LANGS: readonly Choice[] = [
  { value: 'English', label: 'English' }, { value: 'Filipino', label: 'Filipino' }, { value: 'Ilocano', label: 'Ilocano' },
  { value: 'Cebuano', label: 'Cebuano' }, { value: 'other', label: 'Another language' },
];
export const SUBSTITUTE_GROUNDS: readonly SubstituteGround[] = ['died', 'absent', 'unfit'];
export const SUBSTITUTE_WHO: readonly SubstituteWho[] = ['grandparent', 'sibling_21', 'custodian_21'];

/** Who may sign, by age and device (§2.3): the patient or a parent on any device; everyone else on a clinic device only. */
export function signerChoices(minor: boolean, device: 'phone' | 'clinic'): SignerChoice[] {
  const all: SignerChoice[] = minor ? ['parent', 'court_guardian', 'substitute', 'written'] : ['patient', 'mark', 'court_guardian', 'representative'];
  return device === 'phone' ? all.filter((c) => c === 'patient' || c === 'parent') : all;
}

export interface PatientPart {
  decision: Decision | null;
  answers: Record<string, string | string[] | null>;
  ticks: TickId[];
  initials: string | null;
  signer: Signer | null;
  explainedIn: string | null;
  read: { self: true } | { self: false; by: string } | null;
  why: string | null;
  errors: Record<string, string>;
  /** A stop answer (whitening's label): the sentence to show instead of "I agree". */
  stopped: string | null;
}

/**
 * Read and check the patient's part of a page that can be signed. Names:
 * the patient fields by name; tick_<id>; initials_<section id> (every box the
 * same letters); decision (agree | refuse | later); why; explained_lang (+
 * explained_other); read (self | to) + read_by; signer_as (SignerChoice),
 * signer_name, signer_relation, signer_ground, signer_who, signer_over21. The
 * patient's own name comes from `ctx.patientName`, never from the post. The
 * signature's strokes are read by the caller (readStrokes). Everything is
 * checked again by the database (intake_decide).
 */
export function readPatientPart(t: Template, raw: RawPart, ctx: { minor: boolean; device: 'phone' | 'clinic'; patientName: string; fields: Readonly<Fields> }): PatientPart {
  const errors: Record<string, string> = {};
  const say = (name: string, text: string) => { if (!errors[name]) errors[name] = text; };
  const d = clean(first(raw, 'decision'));
  const decision: Decision | null = d === 'agree' ? 'agreed' : d === 'refuse' ? 'refused' : d === 'later' && !t.refuseUnsigned ? 'later' : null;
  if (!decision) say('decision', t.refuseUnsigned ? 'Choose “Yes, with these choices” or “No, thank you”.' : 'Say what you decide.');
  const signing = decision === 'agreed' || decision === 'refused';
  const agreeing = decision === 'agreed';

  // The page's questions.
  const answers: Record<string, string | string[] | null> = {};
  let stopped: string | null = null;
  for (const f of t.patientFields) {
    if (!holds(f.when, t, ctx.fields, ctx.minor)) { answers[f.name] = null; continue; }
    const ok = f.kind === 'yesno' ? ['yes', 'no'] : f.kind === 'yesnounsure' ? ['yes', 'no', 'unsure'] : (f.choices ?? []).map((c) => c.value);
    if (f.kind === 'choices') {
      const picked = all(raw, f.name).map(clean).filter((x) => ok.includes(x));
      answers[f.name] = picked;
    } else {
      const s = clean(first(raw, f.name));
      answers[f.name] = ok.includes(s) ? s : null;
      if (s && !ok.includes(s)) say(f.name, 'Choose one.');
    }
    const a = answers[f.name];
    if (agreeing && f.required && (a === null || (Array.isArray(a) && !a.length))) say(f.name, 'Answer this.');
    if (typeof a === 'string' && f.stop?.includes(a)) stopped = 'Please talk to the dentist before whitening. The product label says it is not for anyone pregnant, anyone who smokes or drinks often, or within 2 weeks of a filling or crown.';
  }
  if (stopped && agreeing) say('decision', stopped);
  if (t.code === 'photos' && agreeing && !['use_specialist', 'use_teaching', 'use_social'].some((n) => answers[n] === 'yes')) {
    say('decision', 'Say yes to at least one use, or choose “No, thank you”.');
  }

  // Ticks: every one to agree; none to refuse or ask first.
  const ticks = t.ticks.filter((k) => ['1', 'on', 'yes'].includes(clean(first(raw, `tick_${k.id}`)))).map((k) => k.id);
  if (agreeing) for (const k of t.ticks) if (!ticks.includes(k.id)) say(`tick_${k.id}`, 'Tick this to agree.');

  // Initials: one to four letters, the same in every box, to agree.
  const boxes = t.sections.filter((s) => s.initials && holds(s.when, t, ctx.fields, ctx.minor));
  const typed = boxes.map((s) => clean(first(raw, `initials_${s.id}`)).toUpperCase().replace(/[.\s]/g, ''));
  let initials: string | null = null;
  if (boxes.length && typed.some(Boolean)) {
    if (typed.some((x) => !/^\p{L}{1,4}$/u.test(x))) say('initials', 'Write your initials, 1 to 4 letters, in every box.');
    else if (new Set(typed).size > 1) say('initials', 'Write the same initials in every box.');
    else initials = typed[0];
  }
  if (agreeing && boxes.length && !initials) say('initials', 'Write your initials in every box.');

  // How it reached them.
  let explainedIn: string | null = null;
  const lang = clean(first(raw, 'explained_lang'));
  if (lang === 'other') {
    const o = clean(first(raw, 'explained_other'));
    if (!o) say('explained_lang', 'Write the language.');
    else if (o.length > 40) say('explained_lang', 'Keep it under 40 characters.');
    else explainedIn = o;
  } else if (EXPLAINED_LANGS.some((c) => c.value === lang)) explainedIn = lang;
  if (signing && t.attest && !explainedIn) say('explained_lang', 'Say which language it was explained in.');
  let read: PatientPart['read'] = null;
  const r = clean(first(raw, 'read'));
  if (r === 'self') read = { self: true };
  else if (r === 'to') {
    const by = clean(first(raw, 'read_by'));
    if (!by) say('read', 'Write who read it to you.');
    else if (by.length > 60) say('read', 'Keep the name under 60 characters.');
    else read = { self: false, by };
  }
  if (signing && !read) say('read', 'Say whether you read it yourself, or who read it to you.');
  const why = clean(first(raw, 'why'));
  if (why.length > 200) say('why', 'Keep it under 200 characters.');

  // Who signs.
  let signer: Signer | null = null;
  if (signing) {
    const choice = clean(first(raw, 'signer_as')) as SignerChoice;
    const allowed = signerChoices(ctx.minor, ctx.device);
    if (!allowed.includes(choice)) {
      say('signer_as', ctx.minor
        ? (ctx.device === 'phone' ? 'On this phone only a parent can sign for a patient under 18. Please ask the desk.' : 'Only a parent or legal guardian can sign for a patient under 18. Please ask the desk.')
        : (ctx.device === 'phone' ? 'On this phone only the patient signs. Please ask the desk.' : 'Say who is signing.'));
    } else if (choice === 'patient' || choice === 'mark') {
      signer = { name: ctx.patientName, as: 'patient', method: choice === 'mark' ? 'mark' : 'sign', relation: null, authority: null, ground: null, note: null };
    } else {
      const name = clean(first(raw, 'signer_name'));
      const relation = clean(first(raw, 'signer_relation'));
      if (name.length < 2) say('signer_name', 'Write your full name.');
      else if (name.length > 120) say('signer_name', 'Keep the name under 120 characters.');
      if (!relation) say('signer_relation', 'Write who you are to the patient.');
      else if (relation.length > 60) say('signer_relation', 'Keep it under 60 characters.');
      let ground: SubstituteGround | null = null, note: SubstituteWho | null = null;
      if (choice === 'substitute') {
        const g = clean(first(raw, 'signer_ground')) as SubstituteGround, w = clean(first(raw, 'signer_who')) as SubstituteWho;
        if (!SUBSTITUTE_GROUNDS.includes(g)) say('signer_ground', 'Say why the parents cannot sign.');
        else ground = g;
        if (!SUBSTITUTE_WHO.includes(w)) say('signer_who', 'Say who you are to the patient.');
        else note = w;
        if ((w === 'sibling_21' || w === 'custodian_21') && !['1', 'on', 'yes'].includes(clean(first(raw, 'signer_over21')))) say('signer_over21', 'Tick this to say you are 21 or older.');
      }
      signer = { name, as: 'guardian', method: 'sign', relation: relation || null, authority: choice, ground, note };
    }
  }
  return { decision, answers, ticks, initials, signer, explainedIn, read, why: why || null, errors, stopped };
}

// ---------------------------------------------------------------------------
// Drawing (§3.5): one renderer, pure; the snapshot is what it returns
// ---------------------------------------------------------------------------
export interface RLine { en: string; fil?: string }
export interface RenderCtx {
  langs: readonly ('en' | 'fil')[];
  minor: boolean | null;
  /** The named dentist has attested: their fields are confirmed. */
  confirmed: boolean;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: { name: string; birth: string | null };
  dentist: { name: string; prc: string | null } | null;
  attested: { at: string; lang: string; interpreter: string | null; assent: string | null } | null;
  /** The language it was explained in, for {language}: the attestation's, else the planned one. */
  language: string | null;
  answers?: Record<string, string | string[] | null>;
  initials?: string | null;
  decision?: Decision | null;
  signer?: Signer | null;
  read?: PatientPart['read'];
  explainedIn?: string | null;
  /** YYYY-MM-DD, Manila. */
  date: string;
}

export interface Rendered {
  version: string;
  code: Code;
  langs: ('en' | 'fil')[];
  title: RLine;
  /** The facts in the "For" box. */
  for: { label: string; text: string; kind: 'teeth' | 'money' | 'text'; confirmed: boolean }[];
  in_short: RLine[];
  sections: { id: string; role: SectionRole; head: RLine; list: boolean; initials: boolean; lines: RLine[] }[];
  ticks: { id: TickId; text: RLine; ticked: boolean }[];
  decision_words: { agree: RLine; refuse: RLine; later: RLine | null };
  clinic: RenderCtx['clinic'];
  patient: RenderCtx['patient'];
  dentist: RenderCtx['dentist'];
  attested: RenderCtx['attested'];
  fields: Fields;
  answers: Record<string, string | string[] | null>;
  initials: string | null;
  decision: Decision | null;
  signer: (Signer & { statement: RLine | null }) | null;
  read: RLine | null;
  explained_in: string | null;
  meaning: string | null;
  date: string;
}

const TBC = 'to be confirmed by the dentist';
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The whole document, words and facts, for these fields and this signing. Pure: the same input draws the same document. */
export function renderDocument(t: Template, fields: Readonly<Fields>, ctx: RenderCtx): Rendered {
  const fil = ctx.langs.includes('fil');
  const byName = new Map(t.clinicFields.map((f) => [f.name, f]));
  const vars: Record<CtxVar, string> = {
    signer: ctx.signer?.name ?? '', relation: ctx.signer?.relation ?? '', reader: ctx.read && !ctx.read.self ? ctx.read.by : '',
    ground: ctx.signer?.ground ? t.words.grounds[ctx.signer.ground] : '', who: ctx.signer?.note ? t.words.who[ctx.signer.note] : '', what: '', by: '',
  };
  const runText = (r: Run, lang: 'en' | 'fil' = 'en'): string => {
    if (typeof r === 'string') return r;
    if ('dentist' in r) return ctx.dentist?.name ?? TBC;
    if ('patient' in r) return ctx.patient.name;
    if ('lang' in r) return ctx.language ?? 'the language you chose';
    if ('v' in r) return vars[r.v];
    const f = byName.get(r.f);
    if (!f) return '';
    const text = valueText(f, fields[r.f], r.style, { lang });
    if (f.who === 'dentist' && !ctx.confirmed) return text ? `${text} (${TBC})` : TBC;
    return text;
  };
  const tidy = (s: string) => { const x = s.replace(/\s+/g, ' ').replace(/\s+([.,:;])/g, '$1').trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
  const line = (l: Line): RLine => ({ en: tidy(l.en.map((r) => runText(r)).join('')), ...(fil && l.fil ? { fil: tidy(l.fil.map((r) => runText(r, 'fil')).join('')) } : {}) });
  const bi = (b: Bi): RLine => ({ en: b.en, ...(fil && b.fil ? { fil: b.fil } : {}) });
  const shown = (c?: Cond) => holds(c, t, fields, ctx.minor);

  const forBox = t.clinicFields.filter((f) => f.forBox && shown(f.when) && !isEmpty(fields[f.name])).map((f) => ({
    label: f.forBox!, text: capital(valueText(f, fields[f.name], f.unit, { pill: true })), kind: f.kind === 'teeth' ? 'teeth' as const : f.kind === 'money' ? 'money' as const : 'text' as const,
    confirmed: f.who === 'desk' || ctx.confirmed,
  }));
  const sections = t.sections.filter((s) => shown(s.when)).map((s) => ({
    id: s.id, role: s.role, head: bi(s.head), list: !!s.list, initials: !!s.initials, lines: s.lines.filter((l) => shown(l.when)).map(line),
  })).filter((s) => s.lines.length);
  const ticks = t.ticks.map((k) => ({ id: k.id, text: line(k.line), ticked: ctx.decision === 'agreed' }));

  const signer = ctx.signer ?? null;
  let statement: RLine | null = null;
  if (signer) {
    const w = t.words;
    const pick = signer.method === 'mark' ? w.by_mark : signer.authority === 'parent' ? w.as_parent : signer.authority === 'court_guardian' ? w.as_guardian
      : signer.authority === 'written' ? w.as_written : signer.authority === 'substitute' ? w.as_substitute : signer.authority === 'representative' ? w.as_representative : null;
    statement = pick ? line(pick) : null;
  }
  const rendered: Rendered = {
    version: t.version, code: t.code, langs: [...ctx.langs], title: bi(t.title), for: forBox,
    in_short: t.inShort.filter((l) => shown(l.when)).map(line), sections, ticks,
    decision_words: { agree: line(t.words.agree), refuse: line(t.words.refuse), later: t.refuseUnsigned ? null : line(t.words.later) },
    clinic: ctx.clinic, patient: ctx.patient, dentist: ctx.dentist, attested: ctx.attested,
    fields: { ...fields }, answers: { ...(ctx.answers ?? {}) }, initials: ctx.initials ?? null, decision: ctx.decision ?? null,
    signer: signer ? { ...signer, statement } : null,
    read: ctx.read ? line(ctx.read.self ? t.words.read_self : t.words.read_to) : null,
    explained_in: ctx.explainedIn ?? null, meaning: null, date: ctx.date,
  };
  // The meaning sentence, from the template's own words: what is agreed to, and by whom it is done
  // (a procedure form's named dentist; not the general consent or the photos).
  if (signer && (ctx.decision === 'agreed' || ctx.decision === 'refused')) {
    const plain = (l: Line) => l.en.map((r) => runText(r)).join('');
    vars.what = plain(t.meaning);
    vars.by = ctx.dentist && t.attest ? plain(t.words.meaning_by) : '';
    const forThem = signer.as === 'guardian';
    const w = ctx.decision === 'agreed' ? (forThem ? t.words.meaning_agree_for : t.words.meaning_agree) : (forThem ? t.words.meaning_refuse_for : t.words.meaning_refuse);
    rendered.meaning = `${tidy(plain(w))} ${dateWords(ctx.date)}.`;
  }
  return rendered;
}

/** "By signing, I, Juan dela Cruz, agree to the extraction of tooth 36 by Dr Ana Reyes as described above. 29 Sep 2026." Empty before a signed decision. */
export const meaningSentence = (r: Rendered): string => r.meaning ?? '';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-09-29 → 29 Sep 2026. */
export const dateWords = (ymd: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ymd; };
