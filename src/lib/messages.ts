// Queueing texts. Nothing here sends: rows go into message_log and the worker
// (scripts/sms/worker.ts) sends them, retries them, and records what the
// provider said. Every text is written inside a clinic transaction, so the
// row belongs to a clinic and the desk can see it on their Messages page.
//
// No links in any text. Philippine telcos drop messages with URLs in them.

import type { Tx } from './db';

/** 0917 000 0000 / +63 917 000 0000 / 63917… → '09170000000'. Anything else comes back as its digits. */
export function normalizePhone(s: string): string {
  const d = String(s ?? '').replace(/\D/g, '');
  if (/^63\d{10}$/.test(d)) return '0' + d.slice(2);
  if (/^9\d{9}$/.test(d)) return '0' + d;
  return d;
}
export const PH_MOBILE = /^09\d{9}$/;
/** For display: 0917 000 0000. */
export const prettyPhone = (s: string) => { const n = normalizePhone(s); return PH_MOBILE.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : s; };

export type Kind = 'confirmation' | 'reminder' | 'reset' | 'invite' | 'manual';

export interface Outgoing {
  clinicId: string;
  to: string;
  body: string;
  kind: Kind;
  patientId?: string | null;
  staffId?: string | null;
  appointmentId?: string | null;
  /** Set it to make a text happen at most once, e.g. 'reminder:<appointment id>'. */
  dedupeKey?: string | null;
}

/** Queue one text. Returns the row id, or null when the dedupe key already had one. */
export async function queueText(tx: Tx, m: Outgoing): Promise<string | null> {
  const to = normalizePhone(m.to);
  if (!PH_MOBILE.test(to)) throw new Error(`Not a Philippine mobile number: ${m.to}`);
  const { rows } = await tx.query(
    `insert into message_log (clinic_id, patient_id, staff_id, appointment_id, channel, to_address, body, status, kind, dedupe_key)
     values ($1, $2, $3, $4, 'sms', $5, $6, 'queued', $7, $8)
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning id`,
    [m.clinicId, m.patientId ?? null, m.staffId ?? null, m.appointmentId ?? null, to, m.body.slice(0, 480), m.kind, m.dedupeKey ?? null]);
  return rows[0]?.id ?? null;
}

/** The texts a clinic sends read like a person wrote them: the clinic's name first, then the fact, then what to do. */
export const texts = {
  reset: (code: string) => `Flossify: your password reset code is ${code}. It works for 15 minutes. If you did not ask for it, ignore this text.`,
  invite: (by: string, clinic: string, code: string) => `Flossify: ${by} added you to ${clinic}. On the Flossify staff sign-in page choose "I have a code" and enter ${code}. It works for 24 hours.`,
  patientCode: (code: string) => `Flossify: your sign-in code is ${code}. It works for 15 minutes. If you did not ask for it, ignore this text.`,
  prcMismatch: (dentist: string, prc: string) => `Flossify: we could not match ${dentist}'s PRC licence ${prc} at verification.prc.gov.ph. Until it is sorted the public profile says "PRC check pending". Reply to this text or write to ops at Flossify.`,
};
