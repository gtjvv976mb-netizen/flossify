// The intake's page 1, "Patient information", as data (039): what a new
// patient fills in on their own phone or the clinic's tablet before the
// consent forms, read by the same engine as the patient forms (parseForm,
// parseScreen in patient-forms-def.ts). The questions are the forms' own
// FieldDefs, taken by name from STEPS, so the wording, the ShowIf conditions,
// the `need` sentences and the reading are shared; page 1 leaves out civil
// status, Facebook, the teeth step, the PhilHealth PIN and the HMO card's
// company, and ends with the privacy notice and who agrees to it.
//
// Four screens, each saved as a draft on the server (intake_save_page1):
//   you      the names, birth date, sex, occupation (from 18)
//   contact  mobile, email, address; a parent or guardian (under 18); the emergency contact
//   health   the whole health step
//   privacy  the HMO (folded); the notice; who is agreeing; the tick
// The privacy screen reads the whole of page 1 again (parseForm over the saved
// screens and this post: valuesAsForm), and the definer checks it again.
//
// Who agrees to the privacy notice: the patient (18 and over only); for a
// minor, a parent or a court-appointed guardian (named, with the relation), or
// "Nobody here can agree for them now" — page 1 still saves, and the privacy
// consent is not given (the desk records one when a parent comes).
//
// No Node or database imports: a page's script may import this file.

import {
  STEPS, FIELDS, indexFields, formName, HEALTH_RULES, GUARDIAN_EMERGENCY_RULE, PRIVACY_TICK,
  type FieldDef, type SectionDef, type StepDef, type FormDef, type PatientFormValues, type Choice,
} from './patient-forms-def';

/** The version of page 1's questions, stored with its answers (intake.form_version, answers.v). */
export const INTAKE_FORM_VERSION = 'intake-2026-10';

export type IntakeScreen = 'you' | 'contact' | 'health' | 'privacy';
export const INTAKE_SCREENS: readonly IntakeScreen[] = ['you', 'contact', 'health', 'privacy'];

/** Who is agreeing to the privacy notice on page 1 (intake.privacy_as). */
export type PrivacyAs = 'patient' | 'parent' | 'court_guardian' | 'none';
export const PRIVACY_AS: readonly Choice[] = [
  { value: 'patient', label: 'I am the patient' },
  { value: 'parent', label: 'I am their parent' },
  { value: 'court_guardian', label: 'I am their guardian, appointed by a court' },
  { value: 'none', label: 'Nobody here can agree for them now' },
];

/** The answers page 1 keeps: the forms' fields it asks, and who agreed to the notice. */
export type IntakePage1Values = Pick<PatientFormValues,
  | 'first_name' | 'middle_name' | 'last_name' | 'suffix' | 'birth_date' | 'sex' | 'occupation'
  | 'mobile' | 'email' | 'address' | 'city' | 'province'
  | 'guardian_name' | 'guardian_relation' | 'guardian_mobile' | 'guardian_is_emergency'
  | 'emergency_name' | 'emergency_relation' | 'emergency_mobile'
  | 'good_health' | 'under_treatment' | 'treatment_detail' | 'serious_illness' | 'illness_detail' | 'hospitalised' | 'hospital_detail'
  | 'takes_medicines' | 'medicines' | 'allergies' | 'allergy_other' | 'smoke' | 'alcohol_drugs'
  | 'pregnant' | 'nursing' | 'birth_control' | 'blood_type' | 'blood_pressure' | 'bleeding_time' | 'conditions' | 'condition_other'
  | 'hmo' | 'hmo_other' | 'hmo_card_no'
> & {
  /** INTAKE_FORM_VERSION. */
  v: string;
  /** The notice agreed to; null when nobody agreed ('none'). */
  privacy_version: string | null;
  privacy_as: PrivacyAs;
  /** Who agreed: the patient's own name (the server's), or the parent's or guardian's as typed. Null for 'none'. */
  privacy_by_name: string | null;
  /** The parent's or guardian's relation to the patient. */
  privacy_relation: string | null;
  consent_privacy: boolean;
};

const formsSection = (step: string, id: string, leaveOut: readonly string[] = [], over: Partial<SectionDef<string>> = {}): SectionDef<string> => {
  const s = STEPS.find((x) => x.id === step)?.sections.find((x) => x.id === id);
  if (!s) throw new Error(`intake-def: no section ${step}.${id}`);
  return { ...s, ...over, fields: s.fields.filter((f) => !leaveOut.includes(f.name)) };
};

const WHEN_AGREEING = { not: { field: 'privacy_as', in: ['none'] } } as const;
const WHEN_FOR_THEM = { field: 'privacy_as', in: ['parent', 'court_guardian'] } as const;

const PRIVACY_FIELDS: readonly FieldDef<string>[] = [
  { name: 'privacy_version', kind: 'hidden', label: 'Privacy notice version' },
  {
    name: 'privacy_as', kind: 'radio', label: 'Who is agreeing to the privacy notice?', required: true, choices: PRIVACY_AS, short: 'Agreed by',
    help: 'Under 18, a parent or a court-appointed guardian agrees for the patient.', need: 'Say who is agreeing.',
  },
  { name: 'privacy_by_name', kind: 'text', label: 'Your full name', required: true, max: 120, autocomplete: 'name', showIf: WHEN_FOR_THEM, short: 'Name', need: 'Write your full name.' },
  {
    name: 'privacy_relation', kind: 'text', label: 'Who you are to the patient', required: true, max: 60, placeholder: 'Mother, father', showIf: WHEN_FOR_THEM,
    short: 'Relation', need: 'Say who you are to the patient.',
  },
  { ...(FIELDS.consent_privacy as FieldDef<string>), label: PRIVACY_TICK, showIf: WHEN_AGREEING },
];

export const INTAKE_STEPS: readonly StepDef<string, IntakeScreen>[] = [
  {
    id: 'you', short: 'You', title: 'About you', lede: 'So the clinic knows who you are.',
    sections: [formsSection('about', 'name'), formsSection('about', 'you', ['civil_status'])],
  },
  {
    id: 'contact', short: 'Contact', title: 'How to reach you', lede: 'The clinic texts your visit reminders to your mobile.',
    sections: [formsSection('about', 'contact', ['facebook']), formsSection('about', 'address'), formsSection('about', 'guardian'), formsSection('about', 'emergency')],
  },
  {
    id: 'health', short: 'Health', title: 'Your health', lede: STEPS.find((s) => s.id === 'health')!.lede,
    sections: STEPS.find((s) => s.id === 'health')!.sections,
  },
  {
    id: 'privacy', short: 'Privacy', title: 'Your privacy', lede: 'Read the clinic’s privacy notice, and say who agrees to it.',
    sections: [
      formsSection('cards', 'hmo', ['hmo_company'], { fold: 'Have an HMO card?' }),
      { id: 'privacy', title: 'The privacy notice', fields: PRIVACY_FIELDS },
    ],
  },
];

export interface IntakeOpts {
  /** The privacy notice in force now (current_consent_version()); page 1 must have shown it. */
  privacyVersion: string | null;
  today?: string;
}

/** Page 1 as a FormDef: parseScreen(INTAKE_DEF, post, screen, …) for a screen, parseForm(INTAKE_DEF, valuesAsForm(…), …) for the whole. */
export const INTAKE_DEF: FormDef<IntakeOpts, string, IntakeScreen> = {
  ...indexFields(INTAKE_STEPS),
  version: INTAKE_FORM_VERSION,
  steps: INTAKE_STEPS,
  nonce: false,
  // The database keeps at most 24 KB (intake.answers, 039); the same headroom as the forms.
  maxAnswersBytes: 20 * 1024,
  fixed: {},
  rules: [
    ...HEALTH_RULES,
    GUARDIAN_EMERGENCY_RULE,
    {
      on: ['privacy_as'],
      run(out, { say, minor }) {
        const as = out.privacy_as as PrivacyAs | null;
        if (!as) return;
        if (!minor && as !== 'patient') say('privacy_as', 'The patient is 18 or older, so they agree for themself. Choose “I am the patient”.');
        if (minor && as === 'patient') say('privacy_as', 'The patient is under 18, so a parent or a court-appointed guardian agrees for them.');
        if (as === 'none') { out.privacy_version = null; out.privacy_by_name = null; out.privacy_relation = null; out.consent_privacy = false; }
      },
    },
    {
      on: ['privacy_as', 'privacy_version'],
      run(out, { say, opts }) {
        if (out.privacy_as === 'none' || !out.privacy_as) return;
        if (!opts.privacyVersion || out.privacy_version !== opts.privacyVersion) {
          say('consent_privacy', 'The privacy notice was updated while you were filling in. Read it again, and tick it again.');
        }
      },
    },
    {
      // The patient agrees under the name page 1 holds, never one typed here.
      on: ['privacy_as', 'first_name', 'middle_name', 'last_name', 'suffix'],
      run(out) {
        if (out.privacy_as !== 'patient') return;
        out.privacy_by_name = formName(out as Pick<PatientFormValues, 'first_name' | 'middle_name' | 'last_name' | 'suffix'>);
        out.privacy_relation = null;
      },
    },
  ],
};

/** Which screen a field of page 1 is on. */
export const INTAKE_FIELD_SCREEN: Readonly<Record<string, IntakeScreen>> = Object.fromEntries(
  Object.entries(INTAKE_DEF.fieldStep).map(([name, i]) => [name, INTAKE_STEPS[i].id]));

/** The fields that say who the patient is: a change to any of them after a consent was signed means signing again (039: intake_save_page1). */
export const IDENTITY_FIELDS: readonly string[] = ['first_name', 'middle_name', 'last_name', 'suffix', 'birth_date', 'guardian_name', 'guardian_relation', 'guardian_mobile'];
