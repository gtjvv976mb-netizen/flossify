// Add patient's one chooser (plan 1.11): which ways in it offers, worked out from what is open on this server and,
// for a patient on file, what their record has. Pure: no Node or database imports, so the page and the unit tests
// (src/lib/add-ways.test.ts) read the same rule.
//
//   On their phone · Easiest — a QR code only this patient can use (the step-by-step forms on their own phone).
//   At the clinic — a clinic tablet, or the desk's device handed to them.
//   Type it in yourself — the typing form (new patients only).
//
// A way closed on this server is left out, never shown greyed: no consent form offered (CONSENT_REVIEWED, on a
// production server until a dentist and the lawyer have read them), the phone path not built, or — a new patient on
// their phone — the privacy notice in force not covering what the patient information asks (formsNoticeReady). A way
// closed only for this patient (a patient on file with no birth date: they type it to open the forms) stays, off,
// with the sentence that says how to open it, because the desk can fix that on the record. "Easiest" is shown only
// beside a way that is open. When typing is the only way left for a new patient, the chooser is no screen at all: the
// page goes straight to the typing form.

export type WayValue = 'phone' | 'clinic' | 'type';

export interface Way {
  value: WayValue;
  title: string;
  /** What it is, or how it opens (off). */
  line: string;
  pill: 'Easiest' | null;
  /** Why it cannot be chosen for this patient; null when it can. */
  off: string | null;
}

export interface WayGates {
  /** Consent forms offered here (intakeGates().templates.length). */
  templates: number;
  /** The phone path is built (PHONE_PATH_BUILT). */
  phoneOpen: boolean;
  /** A new patient's patient information is covered by the privacy notice in force. */
  page1Open: boolean;
}

export interface WayPatient { firstName: string; birth: string | null }

export function addWays(g: WayGates, patient: WayPatient | null): { ways: Way[]; onlyTyping: boolean } {
  const forms = g.templates > 0;
  const noBirth = patient !== null && !patient.birth;
  const first = patient?.firstName ?? '';
  const ways: Way[] = [];
  if (forms && g.phoneOpen && (patient || g.page1Open)) {
    const off = noBirth ? `Add ${first}’s birth date to their record first: they type it to open the forms.` : null;
    ways.push({
      value: 'phone', title: 'On their phone', pill: off ? null : 'Easiest', off,
      line: 'A QR code only this patient can use. They fill in and sign on their own phone.',
    });
  }
  if (forms) {
    ways.push({
      value: 'clinic', title: 'At the clinic', pill: null,
      off: noBirth ? `Add ${first}’s birth date to their record first.` : null,
      // A new patient while their patient information is closed: the desk types the details first.
      line: !patient && !g.page1Open
        ? 'Type their details first, then prepare their consent forms on the clinic’s tablet or this device.'
        : 'On the clinic’s tablet, or hand this device to them.',
    });
  }
  if (!patient) ways.push({ value: 'type', title: 'Type it in yourself', pill: null, off: null, line: 'For a phone call or a paper form.' });
  return { ways, onlyTyping: !patient && ways.every((w) => w.value === 'type') };
}
