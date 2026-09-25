// Queueing texts. Nothing here sends: rows go into message_log and the worker
// (scripts/sms/worker.ts) sends them, retries them, and records what the
// provider said. Every text is written inside a clinic transaction, so the
// row belongs to a clinic and the desk can see it on their Messages page.
//
// No links in any text. Philippine telcos drop messages with URLs in them, and
// a bare domain (anything.gov.ph) can read as one to their filters: name the
// place in words instead.
//
// No text asks for a reply. Semaphore sends from a registered sender name, one
// way; a reply reaches nobody. Say what happens and whom to call.

import type { Tx } from './db';
import { EMAIL_ADDRESS, EMAIL_MAX, normalizeEmail } from './email';

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

export interface OutgoingEmail {
  clinicId: string;
  to: string;
  subject: string;
  body: string;
  /** Sign-in codes only, for now: reset and invite. */
  kind: 'reset' | 'invite';
  staffId?: string | null;
  dedupeKey?: string | null;
}

/**
 * Queue one email in the same log as texts (channel 'email'), so the Messages
 * page and retention treat it like a text. The worker sends it when
 * EMAIL_PROVIDER is set (src/lib/email.ts); the caller checks emailEnabled()
 * before promising anyone an email. Returns the row id, or null when the
 * dedupe key already had one.
 */
export async function queueEmail(tx: Tx, m: OutgoingEmail): Promise<string | null> {
  const to = normalizeEmail(m.to);
  if (!EMAIL_ADDRESS.test(to) || to.length > EMAIL_MAX) throw new Error('Not an email address.');
  const { rows } = await tx.query(
    `insert into message_log (clinic_id, staff_id, channel, to_address, subject, body, status, kind, dedupe_key)
     values ($1, $2, 'email', $3, $4, $5, 'queued', $6, $7)
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning id`,
    [m.clinicId, m.staffId ?? null, to, m.subject.slice(0, 200), m.body.slice(0, 4000), m.kind, m.dedupeKey ?? null]);
  return rows[0]?.id ?? null;
}

/**
 * The emails. Same voice as the texts: the fact, then what to do, then what
 * to ignore. The subject never carries the code (lock screens show it). The
 * body may name the page by its address: an email is not dropped for a link
 * the way a text is. `page` is the code page's address, built by the caller
 * from the site's own configured address (Astro.site), never from the
 * request's Host header: a forged Host would otherwise put someone else's
 * site in a real reset email.
 */
export const emails = {
  reset: (code: string, page: string) => ({
    subject: 'Your Flossify password reset code',
    body: [
      `Your password reset code is ${code}`,
      `It works for 15 minutes. Open this page and enter your email, the code and a new password:\n${page}`,
      'If you did not ask for it, ignore this email. Your password stays as it is.',
      'Flossify',
    ].join('\n\n'),
  }),
  /** `texted`: the same code also went to their mobile. */
  invite: (by: string, clinic: string, code: string, page: string, texted: boolean) => ({
    subject: `${by} added you to ${clinic} on Flossify`,
    body: [
      `${by} added you to ${clinic} on Flossify. Your code is ${code}`,
      `It works for 24 hours. Open this page and enter your email, the code and the password you want:\n${page}`,
      ...(texted ? ['We also texted this code to your mobile. It is the same code, and it works once.'] : []),
      'Flossify',
    ].join('\n\n'),
  }),
};

/**
 * The code page's address for an email, from the site's configured address (astro.config.mjs
 * `site`, https://flossify.ph): /auth/code/ with the Email half already chosen. Every reset and
 * invitation email carries it, so email is turned on only once that address opens the site.
 */
export const codePageFor = (site: URL | string | undefined) => new URL('/auth/code/?via=email', site ?? 'https://flossify.ph').href;

/** The texts a clinic sends read like a person wrote them: the clinic's name first, then the fact, then what to do. */
export const texts = {
  reset: (code: string) => `Flossify: your password reset code is ${code}. It works for 15 minutes. If you did not ask for it, ignore this text.`,
  invite: (by: string, clinic: string, code: string) => `Flossify: ${by} added you to ${clinic}. On the Flossify staff sign-in page choose "I have a code" and enter ${code}. It works for 24 hours.`,
  patientCode: (code: string) => `Flossify: your sign-in code is ${code}. It works for 15 minutes. If you did not ask for it, ignore this text.`,
  /**
   * To the clinic's owner, after a person at Flossify found the licence did not match
   * PRC's records. `prc` may be '(none on file)': then the text says there is no number.
   * No domain (a filter can read one as a link) and no reply asked for (none arrives).
   * It promises only what exists: in Settings, Team the owner corrects the number, or
   * saves it as it is when it is right, and either way it goes back on Flossify's check
   * list by itself (team.astro). One message for a name of ordinary length: 149
   * characters with "Dr. Hazel Tabanao" and a seven-digit number, all GSM. "Settings,
   * Team" rather than an arrow: one non-GSM character turns the whole text into UCS-2
   * and halves what fits in one message.
   */
  prcMismatch: (dentist: string, prc: string) =>
    /\d/.test(prc)
      ? `Flossify: ${dentist}'s PRC licence ${prc} did not match PRC's records, so their profile says "PRC check pending". Check it in Settings, Team.`
      : `Flossify: ${dentist} has no PRC licence number on file, so their profile says "PRC check pending". Add it in Settings, Team.`,
};
