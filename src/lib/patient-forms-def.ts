// The patient forms, as data: what a patient fills in after scanning the QR
// code on the clinic's desk (/f/<key>/), and how every answer is read,
// checked and shown again. The public page renders its five steps from STEPS;
// the review queue and the patient record label the answers with
// answerSections(). The database side (the key, the submit, the queue, adding
// a form to the records) is src/lib/patient-forms.ts, which re-exports all of
// this; import THIS file, not that one, from a <script> that runs in the
// browser (it has no Node or database imports).
//
// Rules kept:
// - One definition, versioned (FORM_VERSION). A change to the questions is a
//   new version string; stored forms keep theirs, and answerSections() shows
//   what is in them, not what the form asks today.
// - The server reads and checks every field (parsePatientForm) whatever the
//   page's script did; a post without JavaScript gets the same answer.
//   Errors are per field, in plain words, keyed by the field's name.
// - A field that is not shown is not required, not read and not kept: the
//   parent or guardian only under 18, civil status and occupation only from
//   18, pregnancy only when the patient is not male and is 12 or older, the
//   emergency contact not when the parent or guardian is it, a follow-up
//   ("What for?") only after "Yes".
// - Text is read without invisible characters (zero-width spaces, direction
//   overrides): a name must look like what it is, and match the same name on
//   file.
// - Nothing here logs, and nothing here puts an answer in a URL.
// - Sentence case, plain words, "Not sure" where not knowing is a fair answer.

import { hmos } from '../data/directory';
import { oneLine, cleanList, LISTS, manilaToday, ageOn, dateText, ITEM_MAX } from './health';
import { normalizePhone, PH_MOBILE, prettyPhone } from './messages';
import { EMAIL_ADDRESS, EMAIL_MAX, normalizeEmail } from './email';

/** The version of the questions below. Stored with every form (patient_form.form_version). */
export const FORM_VERSION = 'forms-2026-09';

// ---------------------------------------------------------------------------
// The link
// ---------------------------------------------------------------------------
/** Lowercase letters and digits a person cannot misread: no i, l, o, 0 or 1. 31 of them. */
export const KEY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const KEY_LENGTH = 10;
/** The database checks the same shape (clinic_forms_key.key, 028). */
export const KEY_SHAPE = /^[a-hjkmnp-z2-9]{10}$/;
/** Where the QR code points. The link is the same whichever server renders the poster. */
export const PUBLIC_ORIGIN = 'https://flossify.ph';

/** A key as typed or scanned ("K7M2XQ9RTD ", from a printed poster) → the key, or null when it cannot be one. */
export function cleanKey(raw: unknown): string | null {
  const k = String(raw ?? '').trim().toLowerCase();
  return KEY_SHAPE.test(k) ? k : null;
}

/** https://flossify.ph/f/k7m2xq9rtd/ — what the QR code holds. */
export const formsUrl = (key: string, origin: string = PUBLIC_ORIGIN): string => `${origin.replace(/\/+$/, '')}/f/${key}/`;

/** flossify.ph/f/k7m2xq9rtd — printed under the QR code for anyone who cannot scan. */
export const formsShort = (key: string, host = 'flossify.ph'): string => `${host}/f/${key}`;

// ---------------------------------------------------------------------------
// The post
// ---------------------------------------------------------------------------
/** The hidden field with the form's own random token (newNonce() in patient-forms.ts): one form sent twice is one form. */
export const NONCE_FIELD = 'form_nonce';
export const NONCE_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;
/**
 * The honeypot: a text field people never see (off-screen, aria-hidden,
 * tabindex="-1", autocomplete="off") that a form-filling robot fills in.
 * Anything in it and nothing is saved.
 */
export const HONEYPOT_FIELD = 'website';
/** The whole post, at most. A full form in any script is well under 20 KB encoded. */
export const MAX_POST_BYTES = 64 * 1024;
/** The answers as stored, at most (the database refuses more: 028). */
export const MAX_ANSWERS_BYTES = 20 * 1024;

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
export interface Choice {
  value: string;
  label: string;
  /** How it is written into the health record's lists (medical_history), when not the label. */
  record?: string;
  /** A small heading the choice sits under in a long checklist ("Heart and blood pressure"). Words only: the stored value is `value`. */
  group?: string;
}

export const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const satisfies readonly Choice[];
export const YES_NO_UNSURE = [...YES_NO, { value: 'unsure', label: 'Not sure' }] as const satisfies readonly Choice[];

/** The same four as the patient row (patient.sex) and Add patient. */
export const SEX_CHOICES = [
  { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }, { value: 'undisclosed', label: 'Prefer not to say' },
] as const satisfies readonly Choice[];

export const CIVIL_STATUS = [
  { value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' }, { value: 'annulled', label: 'Annulled' },
] as const satisfies readonly Choice[];

/**
 * The allergies a dentist asks about. `record` is how each goes into the
 * health record's allergy list: the desk's own spelling where it has one
 * (health.ts LISTS), so the record's chips light up.
 */
export const ALLERGIES = [
  { value: 'local_anaesthetic', label: 'Local anaesthetic (the numbing injection)', record: 'Local anaesthetic' },
  { value: 'penicillin', label: 'Penicillin or other antibiotics', record: 'Penicillin or antibiotics' },
  { value: 'sulfa', label: 'Sulfa drugs', record: 'Sulfa drugs' },
  { value: 'aspirin', label: 'Aspirin', record: 'Aspirin' },
  { value: 'latex', label: 'Latex (rubber gloves)', record: 'Latex' },
  { value: 'other', label: 'Something else' },
  { value: 'none', label: 'No, none that I know of' },
] as const satisfies readonly Choice[];

/**
 * The standard checklist on a Philippine dental health history, in plain
 * words, under small headings so a patient finds theirs on a phone (the
 * values are the stored answers; the order and the headings are only how the
 * list reads). "No, none of these" is drawn first (FieldDef.none).
 */
const HEART = 'Heart and blood pressure', BLOOD = 'Blood', BREATH = 'Breathing', NERVES = 'Brain and nerves';
const BODY = 'Stomach, liver, kidneys and glands', INFECT = 'Infections', OTHER = 'Other';
export const CONDITIONS = [
  { value: 'high_bp', label: 'High blood pressure', record: 'Hypertension', group: HEART },
  { value: 'low_bp', label: 'Low blood pressure', group: HEART },
  { value: 'heart_disease', label: 'Heart disease', record: 'Heart condition', group: HEART },
  { value: 'heart_murmur', label: 'Heart murmur', group: HEART },
  { value: 'heart_attack', label: 'Heart attack', group: HEART },
  { value: 'heart_surgery', label: 'Heart surgery', group: HEART },
  { value: 'chest_pain', label: 'Chest pain', group: HEART },
  { value: 'angina', label: 'Angina', group: HEART },
  { value: 'rheumatic_fever', label: 'Rheumatic fever', group: HEART },
  { value: 'stroke', label: 'Stroke', group: HEART },
  { value: 'swollen_ankles', label: 'Swollen ankles', group: HEART },
  { value: 'anaemia', label: 'Anaemia', group: BLOOD },
  { value: 'bleeding', label: 'Bleeding problems', record: 'Bleeding disorder', group: BLOOD },
  { value: 'blood_disease', label: 'Blood disease', group: BLOOD },
  { value: 'asthma', label: 'Asthma', record: 'Asthma', group: BREATH },
  { value: 'emphysema', label: 'Emphysema', group: BREATH },
  { value: 'respiratory', label: 'Breathing problems', group: BREATH },
  { value: 'tuberculosis', label: 'Tuberculosis (TB)', group: BREATH },
  { value: 'hay_fever', label: 'Hay fever or allergies', group: BREATH },
  { value: 'epilepsy', label: 'Epilepsy or seizures', record: 'Epilepsy', group: NERVES },
  { value: 'fainting', label: 'Fainting spells', group: NERVES },
  { value: 'head_injury', label: 'Head injuries', group: NERVES },
  { value: 'ulcers', label: 'Stomach ulcers', group: BODY },
  { value: 'hepatitis', label: 'Hepatitis or liver disease', record: 'Hepatitis', group: BODY },
  { value: 'jaundice', label: 'Jaundice', group: BODY },
  { value: 'kidney', label: 'Kidney disease', group: BODY },
  { value: 'diabetes', label: 'Diabetes', record: 'Diabetes', group: BODY },
  { value: 'thyroid', label: 'Thyroid problem', group: BODY },
  { value: 'weight_loss', label: 'Losing weight quickly', group: BODY },
  { value: 'hiv', label: 'HIV or AIDS', group: INFECT },
  { value: 'std', label: 'A sexually transmitted disease', group: INFECT },
  { value: 'cancer', label: 'Cancer or tumours', group: OTHER },
  { value: 'radiation', label: 'Radiation therapy', group: OTHER },
  { value: 'joint_replacement', label: 'Joint replacement or implant', group: OTHER },
  { value: 'arthritis', label: 'Arthritis or rheumatism', group: OTHER },
  { value: 'other', label: 'Something else', group: OTHER },
  { value: 'none', label: 'No, none of these' },
] as const satisfies readonly Choice[];

/** What may be bothering the patient about their teeth. */
export const DENTAL_CONCERNS = [
  { value: 'pain', label: 'Toothache or pain' },
  { value: 'sensitivity', label: 'Sensitive to hot, cold or sweet' },
  { value: 'bleeding_gums', label: 'Bleeding gums' },
  { value: 'bad_breath', label: 'Bad breath' },
  { value: 'grinding', label: 'Grinding or clenching' },
  { value: 'jaw', label: 'Jaw clicking or pain' },
  { value: 'loose', label: 'Loose teeth' },
  { value: 'broken', label: 'A broken or chipped tooth' },
  { value: 'dentures', label: 'Dentures' },
  { value: 'braces', label: 'Braces' },
  { value: 'other', label: 'Something else' },
] as const satisfies readonly Choice[];

export const LAST_VISIT = [
  { value: 'lt6m', label: 'Less than 6 months ago' },
  { value: 'm6to12', label: '6 to 12 months ago' },
  { value: 'y1to2', label: '1 to 2 years ago' },
  { value: 'gt2y', label: 'More than 2 years ago' },
  { value: 'never', label: 'Never: this is my first' },
  { value: 'unsure', label: 'I don’t remember' },
] as const satisfies readonly Choice[];

export const NERVOUS = [
  { value: 'no', label: 'Not really' }, { value: 'little', label: 'A little' }, { value: 'very', label: 'Very nervous' },
] as const satisfies readonly Choice[];

export const BLOOD_TYPES = [
  ...['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map((t) => ({ value: t, label: t })),
  { value: 'unsure', label: 'Not sure' },
] as const satisfies readonly Choice[];

/** The site's HMO list (src/data/directory.ts), and "another". The select's empty first option means no HMO card. */
export const HMO_CHOICES: readonly Choice[] = [...hmos.map((h) => ({ value: h.id, label: h.name })), { value: 'other', label: 'Another HMO' }];

export const SIGNED_AS = [
  { value: 'patient', label: 'Myself: I am the patient' },
  { value: 'guardian', label: 'A parent or guardian, for the patient' },
] as const satisfies readonly Choice[];

// ---------------------------------------------------------------------------
// The consent to examination and treatment
// ---------------------------------------------------------------------------
/**
 * The words, by consent_version id (028 seeds 'treatment-2026-09'). A plain
 * summary of the standard Philippine dental informed consent. Never edit the
 * words of a version patients have agreed to: add a new version here and a
 * consent_version row (kind 'treatment') with a later effective_from, in the
 * same change. A version in force with no words here closes the forms
 * (lookupForms says 'unavailable') rather than show the wrong text.
 */
export const TREATMENT_CONSENT: Record<string, { title: string; points: readonly { head: string; body: string }[]; tick: string }> = {
  'treatment-2026-09': {
    title: 'Consent to dental examination and treatment',
    points: [
      { head: 'Examination', body: 'The dentist may look at your teeth, gums and mouth, and take X-rays or photos when they are needed to see what is wrong.' },
      { head: 'Medicines and numbing', body: 'You may be given medicines, or a local anaesthetic to numb the area. Your answers about allergies and medicines help the dentist choose safely.' },
      { head: 'Your treatment plan', body: 'Before any treatment starts, the dentist explains what they suggest and why, the other choices, the cost, and what could go wrong. Nothing starts until you agree to it.' },
      { head: 'Your answers', body: 'What you wrote about your health is true as far as you know. You will tell the clinic if anything changes.' },
      { head: 'Your rights', body: 'You may ask questions at any time, ask for a second opinion, and say no to a treatment or stop it. The dentist will tell you what that may mean for your teeth.' },
      { head: 'Results', body: 'Dental treatment cannot promise a result, and some treatments need more than one visit.' },
    ],
    tick: 'I agree to be examined, and to treatment once the dentist has explained it to me.',
  },
};

/** The privacy tick. The notice itself is /privacy/ (its version comes from the database: current_consent_version()). */
export const PRIVACY_TICK = 'I have read the privacy notice, and I agree to the clinic and Flossify keeping and using my details as it says.';

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------
export type StepId = 'about' | 'health' | 'teeth' | 'cards' | 'consent';
export type FieldKind = 'text' | 'textarea' | 'date' | 'tel' | 'email' | 'radio' | 'checks' | 'select' | 'agree' | 'hidden';

/**
 * When a field or a section is shown: another field's answer is one of `in`
 * (a tick that is ticked answers '1'); the patient is under 18 (`minor:
 * true`) or 18 and over (`minor: false`) by the birth date typed on step 1;
 * the patient is at least `minAge`; all of several; or not one. Only fields
 * on the same step or an earlier one are referred to.
 */
export type ShowIf =
  | { field: string; in: readonly string[] }
  | { minor: boolean }
  | { minAge: number }
  | { all: readonly ShowIf[] }
  | { not: ShowIf };

export interface FieldDef {
  /** The form field's name, unique across the whole form, and the answer's key in PatientFormValues. */
  name: keyof PatientFormValues & string;
  kind: FieldKind;
  label: string;
  /** Shown under the label. */
  help?: string;
  placeholder?: string;
  /** Required whenever it is shown. The rest are optional: the page says "(optional)". */
  required?: boolean;
  /** maxlength, in characters. */
  max?: number;
  choices?: readonly Choice[];
  /** For 'checks': the value that means "none of them" and is ticked alone. It is drawn first, across the width. */
  none?: string;
  /** For 'checks' with `none`: the words on the rule between it and the rest ("or tick the ones you have had"). */
  orText?: string;
  showIf?: ShowIf;
  autocomplete?: string;
  inputmode?: 'text' | 'tel' | 'email' | 'numeric';
  /** The label on the review page and the printout, when the question reads long there. */
  short?: string;
  /** The sentence when a required field is left empty. */
  need?: string;
  /** On the review page: an answer the dentist should see first (a "yes" to a health question, an allergy, a condition). */
  flagWhen?: readonly string[] | 'any';
  /** When it applies, in words, for a page with no script to hide it until then (derived from showIf when simple). */
  when?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  help?: string;
  showIf?: ShowIf;
  /** When it applies, in words, for a page with no script to hide it (see FieldDef.when). */
  when?: string;
  /** Folded away behind these words (a <details>): optional questions most people skip. */
  fold?: string;
  fields: readonly FieldDef[];
}

export interface StepDef {
  id: StepId;
  /** The stepper's word. */
  short: string;
  /** The step's heading. */
  title: string;
  /** One line under the heading. */
  lede: string;
  sections: readonly SectionDef[];
}

const NOT_MALE = { field: 'sex', in: ['female', 'other', 'undisclosed'] } as const;
/** Pregnancy, breastfeeding and the pill: asked when the patient is not male and is 12 or older. */
export const PREGNANCY_FROM_AGE = 12;
const ASK_PREGNANCY: ShowIf = { all: [NOT_MALE, { minAge: PREGNANCY_FROM_AGE }] };
/** Under 18 with the parent or guardian ticked as the emergency contact: the emergency questions are not asked. */
const GUARDIAN_IS_EMERGENCY: ShowIf = { all: [{ minor: true }, { field: 'guardian_is_emergency', in: ['1'] }] };
const WHEN_YES = (field: string): ShowIf => ({ field, in: ['yes'] });
const WHEN_TICKED = (field: string, value = 'other'): ShowIf => ({ field, in: [value] });
const HAS_HMO: ShowIf = { field: 'hmo', in: HMO_CHOICES.map((c) => c.value) };

export const STEPS: readonly StepDef[] = [
  {
    id: 'about', short: 'About you', title: 'About you', lede: 'So the clinic knows who you are and how to reach you.',
    sections: [
      {
        id: 'name', title: 'Your name', fields: [
          { name: 'first_name', kind: 'text', label: 'First name', required: true, max: 60, autocomplete: 'given-name', need: 'Write your first name.' },
          { name: 'middle_name', kind: 'text', label: 'Middle name', max: 60, autocomplete: 'additional-name' },
          { name: 'last_name', kind: 'text', label: 'Last name', required: true, max: 60, autocomplete: 'family-name', need: 'Write your last name.' },
          { name: 'suffix', kind: 'text', label: 'Suffix', max: 10, autocomplete: 'honorific-suffix', placeholder: 'Jr., III' },
        ],
      },
      {
        id: 'you', title: 'Date of birth and more', fields: [
          { name: 'birth_date', kind: 'date', label: 'Date of birth', required: true, autocomplete: 'bday', need: 'Pick your date of birth.' },
          { name: 'sex', kind: 'radio', label: 'Sex', required: true, choices: SEX_CHOICES, need: 'Choose one.' },
          { name: 'civil_status', kind: 'select', label: 'Civil status', choices: CIVIL_STATUS, showIf: { minor: false } },
          { name: 'occupation', kind: 'text', label: 'Occupation', max: 80, autocomplete: 'organization-title', showIf: { minor: false } },
        ],
      },
      {
        id: 'contact', title: 'How to reach you', fields: [
          { name: 'mobile', kind: 'tel', label: 'Mobile number', required: true, max: 20, autocomplete: 'tel', inputmode: 'tel', placeholder: '0917 555 0142', help: 'The clinic texts your visit reminders here.', need: 'Write your mobile number.' },
          { name: 'email', kind: 'email', label: 'Email', max: EMAIL_MAX, autocomplete: 'email', inputmode: 'email' },
          { name: 'facebook', kind: 'text', label: 'Facebook name or link', max: 100, help: 'If you are happy for the clinic to message you there.' },
        ],
      },
      {
        id: 'address', title: 'Home address', fields: [
          { name: 'address', kind: 'text', label: 'House no., street and barangay', required: true, max: 200, autocomplete: 'street-address', short: 'Street and barangay', need: 'Write your street and barangay.' },
          { name: 'city', kind: 'text', label: 'City or municipality', required: true, max: 80, autocomplete: 'address-level2', need: 'Write your city or municipality.' },
          { name: 'province', kind: 'text', label: 'Province', required: true, max: 80, autocomplete: 'address-level1', need: 'Write your province.' },
        ],
      },
      {
        id: 'guardian', title: 'Parent or guardian', help: 'The patient is under 18, so a parent or guardian is needed.', showIf: { minor: true }, fields: [
          { name: 'guardian_name', kind: 'text', label: 'Parent or guardian’s name', required: true, max: 120, short: 'Parent or guardian', need: 'Write the parent or guardian’s name.' },
          { name: 'guardian_relation', kind: 'text', label: 'Who they are to the patient', required: true, max: 40, placeholder: 'Mother, father, aunt', short: 'Relation', need: 'Say who they are to the patient.' },
          { name: 'guardian_mobile', kind: 'tel', label: 'Their mobile number', required: true, max: 20, inputmode: 'tel', short: 'Their mobile', need: 'Write the parent or guardian’s mobile number.' },
          { name: 'guardian_is_emergency', kind: 'agree', label: 'This parent or guardian is also the emergency contact', short: 'Also the emergency contact' },
        ],
      },
      {
        id: 'emergency', title: 'Emergency contact', help: 'Someone the clinic can call if you are unwell during a visit.', showIf: { not: GUARDIAN_IS_EMERGENCY },
        when: 'Skip this if the patient is under 18 and you ticked that the parent or guardian is also the emergency contact.', fields: [
          { name: 'emergency_name', kind: 'text', label: 'Their name', required: true, max: 120, short: 'Emergency contact', need: 'Write the name of someone the clinic can call.' },
          { name: 'emergency_relation', kind: 'text', label: 'Who they are to you', required: true, max: 40, placeholder: 'Mother, husband, friend', short: 'Relation', need: 'Say who they are to you.' },
          { name: 'emergency_mobile', kind: 'tel', label: 'Their mobile number', required: true, max: 20, inputmode: 'tel', short: 'Their number', need: 'Write their mobile number.' },
        ],
      },
    ],
  },
  {
    id: 'health', short: 'Your health', title: 'Your health', lede: 'Some health problems and medicines change how teeth are treated. Answer as well as you can.',
    sections: [
      {
        id: 'general', title: 'In general', fields: [
          { name: 'good_health', kind: 'radio', label: 'Are you in good health?', required: true, choices: YES_NO_UNSURE, short: 'In good health', flagWhen: ['no'] },
          { name: 'under_treatment', kind: 'radio', label: 'Are you being treated by a doctor now?', required: true, choices: YES_NO, short: 'Under treatment now', flagWhen: ['yes'] },
          { name: 'treatment_detail', kind: 'text', label: 'What for?', required: true, max: 200, showIf: WHEN_YES('under_treatment'), short: 'Treated for', need: 'Say what you are being treated for.' },
          { name: 'serious_illness', kind: 'radio', label: 'Have you had a serious illness or an operation?', required: true, choices: YES_NO, short: 'Serious illness or operation', flagWhen: ['yes'] },
          { name: 'illness_detail', kind: 'text', label: 'What was it?', required: true, max: 200, showIf: WHEN_YES('serious_illness'), short: 'Illness or operation', need: 'Say what it was.' },
          { name: 'hospitalised', kind: 'radio', label: 'Have you ever stayed in hospital?', required: true, choices: YES_NO, short: 'Stayed in hospital', flagWhen: ['yes'] },
          { name: 'hospital_detail', kind: 'text', label: 'When, and why?', required: true, max: 200, showIf: WHEN_YES('hospitalised'), short: 'Hospital stay', need: 'Say when, and why.' },
        ],
      },
      {
        id: 'medicines', title: 'Medicines', fields: [
          { name: 'takes_medicines', kind: 'radio', label: 'Do you take any medicines now?', required: true, choices: YES_NO, help: 'Include maintenance medicines, vitamins and herbal ones.', short: 'Takes medicines', flagWhen: ['yes'] },
          { name: 'medicines', kind: 'textarea', label: 'Which ones?', required: true, max: 600, showIf: WHEN_YES('takes_medicines'), help: 'One per line, with the dose if you know it.', placeholder: 'Losartan 50 mg\nVitamin C', short: 'Medicines', need: 'Write the medicines you take.' },
        ],
      },
      {
        id: 'allergies', title: 'Allergies', fields: [
          { name: 'allergies', kind: 'checks', label: 'Are you allergic to any of these?', required: true, choices: ALLERGIES, none: 'none', orText: 'or tick the ones you are allergic to', short: 'Allergies', flagWhen: 'any', need: 'Tick your allergies, or “No, none that I know of”.' },
          { name: 'allergy_other', kind: 'text', label: 'What else are you allergic to?', required: true, max: 200, showIf: WHEN_TICKED('allergies'), short: 'Other allergies', need: 'Write what else you are allergic to.', flagWhen: 'any' },
        ],
      },
      {
        id: 'habits', title: 'Habits', fields: [
          { name: 'smoke', kind: 'radio', label: 'Do you smoke, vape or use tobacco?', required: true, choices: YES_NO, short: 'Smokes or vapes', flagWhen: ['yes'] },
          { name: 'alcohol_drugs', kind: 'radio', label: 'Do you drink alcohol often, or use drugs?', required: true, choices: YES_NO, short: 'Alcohol or drugs', flagWhen: ['yes'] },
        ],
      },
      {
        id: 'pregnancy', title: 'Pregnancy and nursing', help: 'Asked because some X-rays and medicines are avoided then.', showIf: ASK_PREGNANCY,
        when: `Skip this if the patient is male or under ${PREGNANCY_FROM_AGE}.`, fields: [
          { name: 'pregnant', kind: 'radio', label: 'Are you pregnant, or could you be?', required: true, choices: YES_NO_UNSURE, short: 'Pregnant', flagWhen: ['yes', 'unsure'] },
          { name: 'nursing', kind: 'radio', label: 'Are you breastfeeding?', required: true, choices: YES_NO, short: 'Breastfeeding', flagWhen: ['yes'] },
          { name: 'birth_control', kind: 'radio', label: 'Are you taking birth control pills?', required: true, choices: YES_NO, short: 'Birth control pills', flagWhen: ['yes'] },
        ],
      },
      {
        id: 'numbers', title: 'If you know them', fold: 'Know your blood type or blood pressure?', fields: [
          { name: 'blood_type', kind: 'select', label: 'Blood type', choices: BLOOD_TYPES },
          { name: 'blood_pressure', kind: 'text', label: 'Blood pressure', max: 20, placeholder: '120/80' },
          { name: 'bleeding_time', kind: 'text', label: 'Bleeding time', max: 20, placeholder: '2 minutes' },
        ],
      },
      {
        id: 'conditions', title: 'Conditions', fields: [
          { name: 'conditions', kind: 'checks', label: 'Have you had any of these?', required: true, choices: CONDITIONS, none: 'none', orText: 'or tick the ones you have had', short: 'Conditions', flagWhen: 'any', need: 'Tick the ones you have had, or “No, none of these”.' },
          { name: 'condition_other', kind: 'text', label: 'What else?', required: true, max: 200, showIf: WHEN_TICKED('conditions'), short: 'Other conditions', need: 'Write what else you have had.', flagWhen: 'any' },
        ],
      },
    ],
  },
  {
    id: 'teeth', short: 'Your teeth', title: 'Your teeth', lede: 'A little about your teeth, so the dentist is ready for you.',
    sections: [
      {
        id: 'visit', title: 'This visit', fields: [
          { name: 'reason', kind: 'textarea', label: 'What brings you in today?', required: true, max: 300, placeholder: 'A check-up, a toothache, a cleaning…', short: 'Reason for the visit', need: 'Say what brings you in today.' },
          { name: 'concerns', kind: 'checks', label: 'Is anything bothering you?', choices: DENTAL_CONCERNS, help: 'Tick any that apply.', short: 'Bothering them' },
          { name: 'concern_other', kind: 'text', label: 'What else is bothering you?', required: true, max: 200, showIf: WHEN_TICKED('concerns'), short: 'Something else', need: 'Say what else is bothering you.' },
          { name: 'nervous', kind: 'radio', label: 'Are you nervous about dental visits?', choices: NERVOUS, short: 'Nervous about visits' },
        ],
      },
      {
        id: 'before', title: 'Before', fields: [
          { name: 'last_visit', kind: 'radio', label: 'When was your last dental visit?', required: true, choices: LAST_VISIT, short: 'Last dental visit', need: 'Choose when your last dental visit was.' },
          { name: 'previous_dentist', kind: 'text', label: 'Your previous dentist or clinic', max: 120, short: 'Previous dentist' },
        ],
      },
    ],
  },
  {
    id: 'cards', short: 'Cards', title: 'Cards', lede: 'Only if you have them. You can show the card at the desk too.',
    sections: [
      {
        id: 'philhealth', title: 'PhilHealth', fields: [
          { name: 'philhealth', kind: 'radio', label: 'Are you a PhilHealth member?', choices: YES_NO_UNSURE, short: 'PhilHealth member' },
          { name: 'philhealth_pin', kind: 'text', label: 'PhilHealth ID number (PIN)', max: 20, inputmode: 'numeric', placeholder: '12-345678901-2', showIf: WHEN_YES('philhealth'), short: 'PhilHealth PIN' },
        ],
      },
      {
        id: 'hmo', title: 'HMO', fields: [
          { name: 'hmo', kind: 'select', label: 'Your HMO', choices: HMO_CHOICES, short: 'HMO' },
          { name: 'hmo_other', kind: 'text', label: 'Which HMO?', required: true, max: 80, showIf: WHEN_TICKED('hmo'), short: 'Other HMO', need: 'Write the name of your HMO.' },
          { name: 'hmo_card_no', kind: 'text', label: 'Card or member number', max: 40, showIf: HAS_HMO, short: 'HMO card no.' },
          { name: 'hmo_company', kind: 'text', label: 'Company, if the card is from work', max: 120, showIf: HAS_HMO, autocomplete: 'organization', short: 'Company' },
        ],
      },
    ],
  },
  {
    id: 'consent', short: 'Consent', title: 'Consent and signature', lede: 'Read both, tick both, and type your name to sign.',
    sections: [
      {
        id: 'treatment', title: 'Examination and treatment', fields: [
          { name: 'treatment_version', kind: 'hidden', label: 'Treatment consent version' },
          { name: 'consent_treatment', kind: 'agree', label: TREATMENT_CONSENT['treatment-2026-09'].tick, required: true, short: 'Examination and treatment', need: 'Tick this to agree. The clinic cannot examine you without it.' },
        ],
      },
      {
        id: 'privacy', title: 'Your privacy', fields: [
          { name: 'privacy_version', kind: 'hidden', label: 'Privacy notice version' },
          { name: 'consent_privacy', kind: 'agree', label: PRIVACY_TICK, required: true, short: 'Privacy notice', need: 'Tick this to agree to the privacy notice.' },
        ],
      },
      {
        id: 'signature', title: 'Signature', fields: [
          { name: 'signed_as', kind: 'radio', label: 'Who is signing?', required: true, choices: SIGNED_AS, short: 'Signed by', need: 'Say who is signing.' },
          { name: 'signed_name', kind: 'text', label: 'Type your full name to sign', required: true, max: 120, autocomplete: 'name', short: 'Signature', need: 'Type your full name to sign.' },
        ],
      },
    ],
  },
];

/** Every field, by name. */
export const FIELDS: Readonly<Record<string, FieldDef>> = Object.fromEntries(STEPS.flatMap((s) => s.sections.flatMap((x) => x.fields.map((f) => [f.name, f]))));

/** Which step (0–4) a field is on. */
export const FIELD_STEP: Readonly<Record<string, number>> = Object.fromEntries(STEPS.flatMap((s, i) => s.sections.flatMap((x) => x.fields.map((f) => [f.name, i]))));

/** The section a field is in. */
const FIELD_SECTION: Readonly<Record<string, SectionDef>> = Object.fromEntries(STEPS.flatMap((s) => s.sections.flatMap((x) => x.fields.map((f) => [f.name, x]))));

// ---------------------------------------------------------------------------
// The answers, typed. The keys are the field names; this is exactly what is
// stored (patient_form.answers) and what submitForms() sends.
// ---------------------------------------------------------------------------
export type YesNo = 'yes' | 'no';
export type YesNoUnsure = 'yes' | 'no' | 'unsure';
export type Sex = (typeof SEX_CHOICES)[number]['value'];
export type SignedAs = 'patient' | 'guardian';

export interface PatientFormValues {
  /** FORM_VERSION when it was filled in. */
  v: string;
  // 1 About you
  first_name: string; middle_name: string | null; last_name: string; suffix: string | null;
  /** YYYY-MM-DD. */
  birth_date: string; sex: Sex; civil_status: string | null; occupation: string | null;
  /** 09XXXXXXXXX. */
  mobile: string; email: string | null; facebook: string | null;
  address: string; city: string; province: string;
  emergency_name: string; emergency_relation: string; emergency_mobile: string;
  /** Only under 18 (null otherwise). */
  guardian_name: string | null; guardian_relation: string | null; guardian_mobile: string | null;
  /** Under 18: the parent or guardian is the emergency contact too (the emergency_* fields are then theirs). Null from 18. */
  guardian_is_emergency: boolean | null;
  // 2 Your health
  good_health: YesNoUnsure;
  under_treatment: YesNo; treatment_detail: string | null;
  serious_illness: YesNo; illness_detail: string | null;
  hospitalised: YesNo; hospital_detail: string | null;
  takes_medicines: YesNo;
  /** One per line as typed, cleaned; [] when takes_medicines is 'no'. */
  medicines: string[];
  /** ALLERGIES values; ['none'] for none. */
  allergies: string[]; allergy_other: string | null;
  smoke: YesNo; alcohol_drugs: YesNo;
  /** Null when the pregnancy questions were not shown (male, or under PREGNANCY_FROM_AGE). */
  pregnant: YesNoUnsure | null; nursing: YesNo | null; birth_control: YesNo | null;
  blood_type: string | null; blood_pressure: string | null; bleeding_time: string | null;
  /** CONDITIONS values; ['none'] for none. */
  conditions: string[]; condition_other: string | null;
  // 3 Your teeth
  reason: string; concerns: string[]; concern_other: string | null; nervous: string | null;
  last_visit: string; previous_dentist: string | null;
  // 4 Cards
  philhealth: YesNoUnsure | null;
  /** 12-345678901-2. */
  philhealth_pin: string | null;
  /** An HMO_CHOICES value ('other' with hmo_other), or null for none. */
  hmo: string | null; hmo_other: string | null; hmo_card_no: string | null; hmo_company: string | null;
  // 5 Consent
  treatment_version: string; consent_treatment: true;
  privacy_version: string; consent_privacy: true;
  signed_as: SignedAs; signed_name: string;
}

/** Per field: the sentence to show under it. The key is the field's name; '_form' is the form as a whole. */
export type FieldErrors = Partial<Record<keyof PatientFormValues | '_form', string>>;

/** What was posted, as typed, to fill the form in again when it comes back with errors. */
export type RawValues = Record<string, string | string[]>;

export type ParseResult =
  | { ok: true; value: PatientFormValues; raw: RawValues; nonce: string }
  | {
    ok: false; errors: FieldErrors; raw: RawValues;
    /** The step to open (0–4): the first with an error. */
    step: number;
    /** The honeypot was filled in. */
    bot: boolean;
    /** The form's token as posted, when it is one: draw the form again with it. Null: draw it with a new one (newNonce()). */
    nonce: string | null;
  };

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const realDate = (s: string): boolean => {
  const m = YMD.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** Whole years on `today` (Manila) by this birth date, or null when it is not a date. */
export const ageFrom = (birth: string | null | undefined, today = manilaToday()): number | null =>
  birth && realDate(birth) ? ageOn(birth, today) : null;

/** Under 18 on `today` (Manila) by this birth date. False when it is not a date. */
export const isMinorOn = (birth: string | null | undefined, today = manilaToday()): boolean => {
  const y = ageFrom(birth, today);
  return y !== null && y < 18;
};

/**
 * Characters that are there and not seen: zero-width spaces and joiners, the
 * soft hyphen, direction marks and overrides, the byte-order mark. Dropped
 * from every answer as it is read, so "Mar\u200Bia" is Maria (and matches
 * Maria on file), and a name cannot be drawn backwards in the queue.
 */
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0]/g;
export const visibleOnly = (s: string): string => s.replace(INVISIBLE, '');

/** Jr / jr. / iii → Jr. / III; anything else as typed. */
const tidySuffix = (w: string): string => {
  const s = w.replace(/,$/, '');
  if (/^[ivx]+\.?$/i.test(s)) return s.replace('.', '').toUpperCase();
  if (/^(jr|sr)\.?$/i.test(s)) return s.charAt(0).toUpperCase() + s.slice(1, 2).toLowerCase() + '.';
  return s;
};

/** A list typed in one box: split on new lines, commas and semicolons; cleaned, de-duplicated. */
export const splitList = (s: string | null | undefined): string[] => cleanList(String(s ?? '').split(/[\n,;]+/));

/** Several lines, each cleaned, blank lines out. */
const lines = (v: unknown): string =>
  String(v ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => oneLine(l)).filter(Boolean).join('\n');

/** An answer as `shown()` reads it: a pick, the picks, a tick (true, or '1' from a form), or nothing. */
export type Answer = string | string[] | boolean | null | undefined;

/**
 * Whether a field or section's condition holds, given the answers read so far.
 * `minor` and `age` are the patient's by the birth date typed (age null: no
 * date yet, and a question asked from an age is not asked).
 */
export function shown(s: ShowIf | undefined, get: (name: string) => Answer, minor: boolean, age: number | null = null): boolean {
  if (!s) return true;
  if ('all' in s) return s.all.every((x) => shown(x, get, minor, age));
  if ('not' in s) return !shown(s.not, get, minor, age);
  if ('minor' in s) return s.minor === minor;
  if ('minAge' in s) return age !== null && age >= s.minAge;
  const v = get(s.field);
  const picked = Array.isArray(v) ? v : v === true ? ['1'] : typeof v === 'string' ? [v] : [];
  return picked.some((x) => s.in.includes(x));
}

/** Is this field shown, given the answers? Its own condition and its section's. */
export function fieldShown(f: FieldDef, get: (name: string) => Answer, minor: boolean, age: number | null = null): boolean {
  return shown(FIELD_SECTION[f.name]?.showIf, get, minor, age) && shown(f.showIf, get, minor, age);
}

/**
 * Read and check the posted form. `versions` are the consent versions in
 * force now (lookupForms()); the form must have shown those. `today` is
 * Manila's (for the age and "not after today"). Every field is checked on
 * the server whatever the page's script did.
 */
export function parsePatientForm(form: FormData, opts: { versions: { privacy: string | null; treatment: string | null }; today?: string }): ParseResult {
  const today = opts.today ?? manilaToday();
  const errors: FieldErrors = {};
  const raw: RawValues = {};
  const say = (name: string, text: string) => { if (!(errors as Record<string, string>)[name]) (errors as Record<string, string>)[name] = text; };

  // 1. As posted, trimmed. Checks keep only known values.
  for (const f of Object.values(FIELDS)) {
    if (f.kind === 'checks') {
      const known = new Set((f.choices ?? []).map((c) => c.value));
      raw[f.name] = [...new Set(form.getAll(f.name).map((v) => String(v)).filter((v) => known.has(v)))];
    } else {
      const v = form.get(f.name);
      raw[f.name] = typeof v === 'string' ? (f.kind === 'textarea' ? visibleOnly(v).replace(/\r\n?/g, '\n').trim() : visibleOnly(v).trim()) : '';
    }
  }
  const bot = String(form.get(HONEYPOT_FIELD) ?? '').trim() !== '';
  const posted = String(form.get(NONCE_FIELD) ?? '');
  const nonce = NONCE_SHAPE.test(posted) ? posted : null;
  if (!nonce) say('_form', 'The page had gone stale. Check your answers and send them again.');

  // 2. Each field on its own.
  const out: Record<string, unknown> = {};
  const choiceOk = (f: FieldDef, v: string) => (f.choices ?? []).some((c) => c.value === v);
  for (const f of Object.values(FIELDS)) {
    const r = raw[f.name];
    const tooLong = (s: string) => f.max !== undefined && s.length > f.max;
    switch (f.kind) {
      case 'text': case 'hidden': {
        let s = oneLine(r).normalize('NFC');
        if (tooLong(s)) { say(f.name, `Keep it under ${f.max} characters.`); s = ''; }
        if (f.name === 'suffix' && s) s = tidySuffix(s);
        out[f.name] = s || null;
        break;
      }
      case 'textarea': {
        const s = lines(r).normalize('NFC');
        if (tooLong(s)) say(f.name, `Keep it under ${f.max} characters.`);
        out[f.name] = s && !tooLong(s) ? s : null;
        break;
      }
      case 'date': {
        const s = oneLine(r);
        if (!s) out[f.name] = null;
        else if (!realDate(s)) { say(f.name, 'That is not a real date. Pick it from the calendar.'); out[f.name] = null; }
        else if (s > today) { say(f.name, 'That date is after today. Check the year.'); out[f.name] = null; }
        else if (s < '1900-01-01') { say(f.name, 'That date is before 1900. Check the year.'); out[f.name] = null; }
        else out[f.name] = s;
        break;
      }
      case 'tel': {
        const s = oneLine(r);
        if (!s) { out[f.name] = null; break; }
        const n = normalizePhone(s);
        if (PH_MOBILE.test(n)) out[f.name] = n;
        else if (f.name === 'emergency_mobile' && n.length >= 7 && n.length <= 15) out[f.name] = s.slice(0, 20); // a landline, as typed
        else { say(f.name, 'Write a Philippine mobile number, like 0917 555 0142.'); out[f.name] = null; }
        break;
      }
      case 'email': {
        const s = normalizeEmail(oneLine(r));
        if (!s) out[f.name] = null;
        else if (!EMAIL_ADDRESS.test(s) || s.length > EMAIL_MAX) { say(f.name, 'That does not look like an email address. Leave it blank if you have none.'); out[f.name] = null; }
        else out[f.name] = s;
        break;
      }
      case 'radio': case 'select': {
        const s = String(r ?? '');
        out[f.name] = s && choiceOk(f, s) ? s : null;
        break;
      }
      case 'checks': {
        const list = (r as string[]) ?? [];
        if (f.none && list.includes(f.none) && list.length > 1) {
          const other = (f.choices ?? []).find((c) => c.value !== f.none && list.includes(c.value));
          const noneLabel = (f.choices ?? []).find((c) => c.value === f.none)?.label ?? 'None';
          say(f.name, `“${noneLabel}” is ticked, and so is “${other?.label ?? 'another'}”. Untick one.`);
        }
        out[f.name] = list;
        break;
      }
      case 'agree':
        out[f.name] = r === '1' || r === 'on' || r === 'yes';
        break;
    }
  }

  // 3. What is shown, and so required and kept.
  const birth = (out.birth_date as string | null) ?? null;
  const minor = isMinorOn(birth, today);
  const age = ageFrom(birth, today);
  const get = (name: string) => out[name] as Answer;
  for (const f of Object.values(FIELDS)) {
    if (!fieldShown(f, get, minor, age)) { out[f.name] = f.kind === 'checks' ? [] : null; delete (errors as Record<string, string>)[f.name]; continue; }
    if (!f.required) continue;
    const v = out[f.name];
    const empty = v === null || v === false || (Array.isArray(v) && v.length === 0);
    if (empty) say(f.name, f.need ?? (f.kind === 'radio' || f.kind === 'select' ? 'Choose one.' : f.kind === 'checks' ? 'Tick at least one.' : `Fill in: ${f.label.toLowerCase()}.`));
  }

  // 4. Lists typed in a box, each item short enough for the health record.
  const medicines = out.medicines ? splitList(out.medicines as string) : [];
  if (medicines.some((m) => m.length > ITEM_MAX)) say('medicines', `Keep each medicine under ${ITEM_MAX} characters, one per line.`);
  else if (medicines.length > 20) say('medicines', 'Up to 20 medicines here. Tell the dentist the rest.');
  for (const [name, what] of [['allergy_other', 'allergy'], ['condition_other', 'one']] as const) {
    const list = splitList(out[name] as string | null);
    if (list.some((x) => x.length > ITEM_MAX)) say(name, `Keep each ${what} under ${ITEM_MAX} characters, with commas between them.`);
    else if (list.length > 10) say(name, 'Up to 10 here. Tell the dentist the rest.');
  }

  // 5. Across fields.
  if (out.philhealth_pin) {
    const d = String(out.philhealth_pin).replace(/\D/g, '');
    if (d.length !== 12) say('philhealth_pin', 'A PhilHealth PIN has 12 digits, like 12-345678901-2. Leave it blank if you do not have it here.');
    else out.philhealth_pin = `${d.slice(0, 2)}-${d.slice(2, 11)}-${d.slice(11)}`;
  }
  if (minor && out.signed_as === 'patient') say('signed_as', 'The patient is under 18, so a parent or guardian signs. Choose “A parent or guardian”.');
  // The parent or guardian as the emergency contact: their details, as the record keeps an emergency contact.
  if (minor && out.guardian_is_emergency === true) {
    out.emergency_name = out.guardian_name;
    out.emergency_relation = out.guardian_relation;
    out.emergency_mobile = out.guardian_mobile;
  }
  const signed = out.signed_name as string | null;
  if (signed && signed.length < 2) say('signed_name', 'Type your full name to sign.');
  const tv = out.treatment_version as string | null, pv = out.privacy_version as string | null;
  if (!opts.versions.treatment || tv !== opts.versions.treatment || !TREATMENT_CONSENT[tv]) {
    say('consent_treatment', 'The consent wording was updated while you were filling in. Read it again, and tick it again.');
  }
  if (!opts.versions.privacy || pv !== opts.versions.privacy) {
    say('consent_privacy', 'The privacy notice was updated while you were filling in. Read it again, and tick it again.');
  }

  const failed = Object.keys(errors).length > 0 || bot;
  if (failed) {
    if (bot) say('_form', 'Something in the form did not look right, so it was not sent. Check it and send it again, or ask the desk for help.');
    const steps = Object.keys(errors).filter((k) => k !== '_form').map((k) => FIELD_STEP[k] ?? 0);
    // A robot's filled-in honeypot is never echoed back.
    delete raw[HONEYPOT_FIELD];
    return { ok: false, errors, raw, step: steps.length ? Math.min(...steps) : 0, bot, nonce };
  }

  const value = {
    ...(out as unknown as PatientFormValues),
    v: FORM_VERSION,
    medicines,
    consent_treatment: true as const,
    consent_privacy: true as const,
  };
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_ANSWERS_BYTES) {
    return { ok: false, errors: { _form: 'The answers are too long to send. Shorten the longest ones.' }, raw, step: 0, bot: false, nonce };
  }
  return { ok: true, value, raw, nonce: nonce! };
}

// ---------------------------------------------------------------------------
// Showing the answers: the review queue, the record, the printout
// ---------------------------------------------------------------------------
export interface AnswerRow {
  name: string;
  /** The field's short label. */
  label: string;
  text: string;
  /** Something the dentist should see first (a "yes" to a health question, an allergy, a condition). */
  flag: boolean;
}
export interface AnswerSection { id: string; title: string; rows: AnswerRow[] }
export interface StepAnswers { id: StepId; title: string; sections: AnswerSection[] }

const choiceLabel = (f: FieldDef, v: string) => f.choices?.find((c) => c.value === v)?.label ?? v;

/**
 * Labels in one sentence: every one after the first starts small ("Toothache
 * or pain, bleeding gums"), unless it starts with a short capital word such as
 * HIV or TB, which stays as it is.
 */
export const joinLabels = (labels: readonly string[]): string =>
  labels.map((l, i) => (i > 0 && /^\p{Lu}(?!\p{Lu})/u.test(l) ? l.charAt(0).toLocaleLowerCase('en') + l.slice(1) : l)).join(', ');

/** One answer as words, or null when there is none to show. */
export function answerText(f: FieldDef, v: unknown): string | null {
  if (v === null || v === undefined || v === '' || v === false) return null;
  switch (f.kind) {
    case 'radio': case 'select': return choiceLabel(f, String(v));
    case 'checks': return Array.isArray(v) && v.length ? joinLabels(v.map((x) => choiceLabel(f, String(x)))) : null;
    case 'date': return dateText(String(v)) ?? String(v);
    case 'tel': return prettyPhone(String(v));
    case 'agree': return v === true ? (f.name.startsWith('consent_') ? 'Agreed' : 'Yes') : null;
    case 'textarea': return Array.isArray(v) ? (v.length ? v.join(', ') : null) : String(v).split('\n').join(', ');
    case 'hidden': return String(v);
    default: return Array.isArray(v) ? v.join(', ') : String(v);
  }
}

/**
 * The answers of a stored form, labelled, step by step, section by section,
 * leaving out what was not shown or not answered. The consent step names the
 * versions agreed to; the treatment consent's words are TREATMENT_CONSENT
 * [values.treatment_version] for a printout.
 */
export function answerSections(values: PatientFormValues | Record<string, unknown>): StepAnswers[] {
  const v = values as Record<string, unknown>;
  const minor = isMinorOn(v.birth_date as string | null, manilaToday());
  const age = ageFrom(v.birth_date as string | null, manilaToday());
  const get = (name: string) => v[name] as Answer;
  return STEPS.map((s) => ({
    id: s.id,
    title: s.title,
    sections: s.sections
      .map((sec) => ({
        id: sec.id,
        title: sec.title,
        rows: sec.fields.flatMap((f): AnswerRow[] => {
          // A guardian given on the form stays visible even after the patient turns 18.
          if (f.kind === 'hidden' || (!fieldShown(f, get, minor, age) && (v[f.name] === null || v[f.name] === undefined))) return [];
          let text = answerText(f, v[f.name]);
          if (text === null) return [];
          if (f.name === 'consent_treatment') text = `Agreed (${String(v.treatment_version ?? '')})`;
          if (f.name === 'consent_privacy') text = `Agreed (${String(v.privacy_version ?? '')})`;
          const raw = v[f.name];
          const flag = !!f.flagWhen && (f.flagWhen === 'any'
            ? (Array.isArray(raw) ? raw.some((x) => x !== f.none) : !!raw)
            : typeof raw === 'string' && f.flagWhen.includes(raw));
          return [{ name: f.name, label: f.short ?? f.label, text, flag }];
        }),
      }))
      .filter((sec) => sec.rows.length > 0),
  }));
}

/** "Maria Clara Santos Jr." */
export const formName = (v: Pick<PatientFormValues, 'first_name' | 'middle_name' | 'last_name' | 'suffix'>): string =>
  [v.first_name, v.middle_name, v.last_name, v.suffix].filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Into the health record
// ---------------------------------------------------------------------------
const picks = (key: 'allergies' | 'conditions' | 'medications') => LISTS.find((l) => l.key === key)!.picks;
const recordLabel = (choices: readonly Choice[], value: string) => {
  const c = choices.find((x) => x.value === value);
  return c ? c.record ?? c.label : value;
};

/**
 * The three lists of the health record (medical_history) from the form:
 * allergies and conditions ticked (spelled the desk's way where it has a
 * spelling), plus what was typed under "Something else"; the medicines.
 * [] means answered "none"; a pregnancy ("yes") is a condition, as the desk's
 * own picks have it.
 */
export function healthLists(v: PatientFormValues): { allergies: string[]; conditions: string[]; medications: string[] } {
  const ticked = (list: string[], choices: readonly Choice[], none: string) =>
    list.filter((x) => x !== none && x !== 'other').map((x) => recordLabel(choices, x));
  const allergies = v.allergies.includes('none') ? [] : cleanList([...ticked(v.allergies, ALLERGIES, 'none'), ...splitList(v.allergy_other)], picks('allergies'));
  const conditions = cleanList([
    ...(v.conditions.includes('none') ? [] : [...ticked(v.conditions, CONDITIONS, 'none'), ...splitList(v.condition_other)]),
    ...(v.pregnant === 'yes' ? ['Pregnancy'] : []),
  ], picks('conditions'));
  const medications = v.takes_medicines === 'yes' ? cleanList(v.medicines, picks('medications')) : [];
  return { allergies: allergies.map((x) => x.slice(0, ITEM_MAX)), conditions: conditions.map((x) => x.slice(0, ITEM_MAX)), medications: medications.map((x) => x.slice(0, ITEM_MAX)) };
}

/** The HMO as the patient row keeps it (patient.hmo_name, 026): the list's name, or what was typed for another. */
export function hmoName(v: Pick<PatientFormValues, 'hmo' | 'hmo_other'>): string | null {
  if (!v.hmo) return null;
  if (v.hmo === 'other') return v.hmo_other ? v.hmo_other.slice(0, 80) : null;
  return HMO_CHOICES.find((c) => c.value === v.hmo)?.label ?? null;
}

/** The answers of one step, by field name: what goes into medical_history.answers (health, teeth, cards). */
export function stepAnswers(v: PatientFormValues, step: StepId): Record<string, unknown> {
  const s = STEPS.find((x) => x.id === step)!;
  const rec = v as unknown as Record<string, unknown>;
  return Object.fromEntries(s.sections.flatMap((x) => x.fields.filter((f) => f.kind !== 'hidden').map((f) => [f.name, rec[f.name] ?? null])));
}
