// Forms to add (plan 1.12): every form a patient sent that nobody has added to a patient yet, whichever way it came,
// in one list — the desk poster forms (patient_form status 'new', 028) and the step-by-step forms sent and not added
// (intake status 'sent', 039). Only a new patient's step-by-step forms can wait here: intake_send() puts a patient on
// file's forms on their record at Send (status 'added', never 'sent'), and a new patient's wait as 'sent' when Send
// could not add them — someone on file looks like them, the forms were started from a visit, or the person who handed
// them over may no longer add patients (addAtSend).
//
// We merge the list, not the adding. A row opens its own way's page: a desk poster form its form page
// (patients/forms/<id>/: addAsNewPatient, addToPatient, dismissForm), a step-by-step form its Screen F
// (patients/intake/<id>/: addIntake, dismissIntake with a reason, intakeLookAlikes). Each keeps its own look-alike
// check (a row's "May already be on file" counts by it), its consent signings and seals, and its deletion rule, which
// this module only says:
//   - a desk poster form nobody added: 30 days after it was sent (FORM_KEEP_DAYS, patient-forms.ts);
//   - a step-by-step form sent and not added: 30 days after Send (INTAKE_KEEP_DAYS), unless held (INTAKE_HELD_SQL).
// Both are retention_purge() (039), which the worker runs on every pass.
//
// listForms, countNewForms and newFormsWaiting (patient-forms.ts) and countSentIntakes (intake.ts) stay as they are
// (desk poster forms only, and sent intakes only): scripts/dev/qr-forms/backend-test.mjs pins their meaning.
//
// Everything runs inside the caller's withClinic(): row-level security keeps both tables to the branch (intake and
// patient_form force it). Who may read this is the caller's rule: canEditRecords, Add patient's own.
import { withClinic, type Tx } from './db';
import { ageOn, manilaToday } from './health';
import { prettyPhone } from './messages';
import { listForms, formName, type PatientFormValues } from './patient-forms';
import { intakeName, intakeLookAlikes } from './intake';

type Q = Pick<Tx, 'query'>;

/** Days a step-by-step form sent and not added is kept, unless held (retention_purge(), 039). */
export const INTAKE_KEEP_DAYS = 30;

/**
 * When a sent step-by-step form is kept past its 30 days (alias i: the intake). WORD FOR WORD the "held" clause of
 * retention_purge() in src/data/migrations/039_patient_intake.sql: the two change together (a new migration and
 * this string), or the list says "Deleted <day>" on a form the purge keeps, or the reverse.
 * scripts/dev/intake/db-test.mjs checks that they agree.
 */
export const INTAKE_HELD_SQL = `exists (select 1 from consent_signing s where s.intake_id = i.id)
                     and (i.appointment_id is not null
                          or exists (select 1 from patient p
                                      where p.clinic_id = i.clinic_id and p.archived_at is null
                                        and ((lower(btrim(p.first_name)) = lower(btrim(i.answers ->> 'first_name'))
                                              and lower(btrim(p.last_name)) = lower(btrim(i.answers ->> 'last_name'))
                                              and (p.birth_date is null or to_char(p.birth_date, 'YYYY-MM-DD') = i.answers ->> 'birth_date'))
                                          or (length(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g')) >= 10
                                              and right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10)
                                                  = right(regexp_replace(coalesce(i.answers ->> 'mobile', ''), '\\D', '', 'g'), 10)))))`;

/** Forms to add at this branch: desk poster forms not added or dismissed, and step-by-step forms sent and not added. */
export async function countFormsToAdd(q: Q): Promise<number> {
  return (await q.query<{ n: number }>(
    `select ((select count(*) from patient_form where status = 'new') + (select count(*) from intake where status = 'sent'))::int as n`)).rows[0]?.n ?? 0;
}

/** The same count for a page that has no transaction open: its own, and never breaks the page (null when unread). */
export async function formsToAddWaiting(clinicId: string): Promise<number | null> {
  try {
    return await withClinic(clinicId, countFormsToAdd);
  } catch (e) {
    console.error('forms to add: could not count', (e as Error).message);
    return null;
  }
}

/** Forms being filled in: step-by-step forms still being prepared, or out with the patient. */
export async function countFormsBeingFilled(q: Q): Promise<number> {
  return (await q.query<{ n: number }>(`select count(*)::int as n from intake where status in ('preparing', 'out')`)).rows[0]?.n ?? 0;
}

/** One row of Forms to add, whichever way it came. */
export interface ToAddRow {
  /** 'poster': the desk poster forms (QR-…); 'steps': the step-by-step forms (IN-…). */
  way: 'poster' | 'steps';
  id: string;
  ref: string;
  /** The full name as the forms have it (a patient on file: the record's). */
  name: string;
  /** Whole years on the day it was sent. */
  age: number | null;
  minor: boolean;
  mobile: string | null;
  /** A parent or guardian who signed for a minor, when the forms say. */
  signedByName: string | null;
  /** Patients on file who may be this person, by its own way's rule: listForms' for a desk poster form, Screen F's
   *  (intakeLookAlikes: the same mobile, or the same name and birth date, and the visit's patient) for a step-by-step form. */
  likely: number;
  /** Desk poster forms: sent through a QR code the clinic has since replaced. */
  viaOldCode: boolean;
  sentAt: Date;
  /** When the purge deletes it; null while held. */
  deleteOn: Date | null;
  /** Step-by-step forms only: kept until added or dismissed (039's hold). */
  held: boolean;
  /** Its own page, where it is added or dismissed. */
  href: string;
}

const DAY = 86_400_000;
const ymdManila = (d: Date) => manilaToday(d);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Forms to add, newest first by when they were sent: at most `limit` (100). `more` when there may be others (either
 * way filled its share, or the merge was cut). `base` is the Patients tab's address (/c/<slug>/patients/).
 */
export async function listFormsToAdd(tx: Tx, a: { base: string; limit?: number }): Promise<{ rows: ToAddRow[]; more: boolean }> {
  const limit = Math.min(Math.max(1, a.limit ?? 100), 200);
  const posters = await listForms(tx, { status: 'new', limit });
  // A sent step-by-step form is a new patient's (see the top): its name, birth date and mobile are page 1's answers.
  const steps = (await tx.query<{
    id: string; ref: string; sent_at: Date; label: string | null; answers: (Partial<PatientFormValues> & Record<string, unknown>) | null;
    privacy_as: string | null; privacy_by_name: string | null; visit_patient: string | null; held: boolean;
  }>(
    `select i.id, i.ref, coalesce(i.sent_at, i.created_at) as sent_at, i.label, i.answers, i.privacy_as, i.privacy_by_name,
            a.patient_id as visit_patient,
            (${INTAKE_HELD_SQL}) as held
       from intake i left join appointment a on a.id = i.appointment_id
      where i.status = 'sent'
      order by coalesce(i.sent_at, i.created_at) desc
      limit $1`, [limit])).rows;
  // Screen F's own look-alike rule, row by row (a few rows: Send adds a new patient's forms unless something holds them).
  const likely = new Map<string, number>();
  for (const r of steps) {
    likely.set(r.id, (await intakeLookAlikes(tx, { answers: r.answers, appointment: r.visit_patient ? { patientId: r.visit_patient } : null })).length);
  }

  const rows: ToAddRow[] = [
    ...posters.map((f): ToAddRow => ({
      way: 'poster', id: f.id, ref: f.ref, name: f.name, age: f.age, minor: f.minor, mobile: f.mobile || null,
      signedByName: f.minor && f.signedAs === 'guardian' ? f.signedByName : null,
      likely: f.likely, viaOldCode: f.viaOldCode, sentAt: new Date(f.submittedAt),
      deleteOn: f.deleteOn, held: false, href: `${a.base}forms/${f.id}/`,
    })),
    ...steps.map((r): ToAddRow => {
      const ans = r.answers ?? {};
      const name = text(ans.first_name)
        ? formName({ first_name: text(ans.first_name) ?? '', middle_name: text(ans.middle_name) ?? '', last_name: text(ans.last_name) ?? '', suffix: text(ans.suffix) ?? '' })
        : intakeName({ patient: null, label: r.label, answers: r.answers });
      const birth = text(ans.birth_date);
      const sentAt = new Date(r.sent_at);
      const age = birth ? ageOn(birth, ymdManila(sentAt)) : null;
      const phone = text(ans.mobile);
      const guardian = r.privacy_as === 'parent' || r.privacy_as === 'court_guardian';
      return {
        way: 'steps', id: r.id, ref: r.ref, name, age, minor: age !== null && age < 18, mobile: phone ? prettyPhone(phone) : null,
        signedByName: guardian ? r.privacy_by_name : null,
        likely: likely.get(r.id) ?? 0, viaOldCode: false, sentAt,
        deleteOn: r.held ? null : new Date(sentAt.getTime() + INTAKE_KEEP_DAYS * DAY), held: r.held,
        href: `${a.base}intake/${r.id}/`,
      };
    }),
  ].sort((x, y) => y.sentAt.getTime() - x.sentAt.getTime());

  return { rows: rows.slice(0, limit), more: posters.length >= limit || steps.length >= limit || rows.length > limit };
}

