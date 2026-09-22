// One-time codes, texted to a staff member's mobile. Six digits, because the
// person reads it off one phone and types it into another; short-lived and
// five tries, because six digits is not many. Stored as an HMAC so a copy of
// the table is not a copy of the codes. One live code per purpose per person:
// asking again voids the last one.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { pool } from './db';

const SECRET = import.meta.env.SESSION_SECRET ?? process.env.SESSION_SECRET ?? '';

export type Purpose = 'reset' | 'invite';
export const CODE_TTL_MIN: Record<Purpose, number> = { reset: 15, invite: 24 * 60 };
const TRIES = 5;

const digest = (staffId: string, code: string) => createHmac('sha256', SECRET).update(`${staffId}:${code}`).digest('hex');

/** Mint a code for this person and purpose. The caller texts it; it is never stored in clear. */
export async function issueCode(staffId: string, purpose: Purpose): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await pool.query(`update one_time_code set used_at = now() where staff_id = $1 and purpose = $2 and used_at is null`, [staffId, purpose]);
  await pool.query(
    `insert into one_time_code (staff_id, purpose, code_hash, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [staffId, purpose, digest(staffId, code), CODE_TTL_MIN[purpose]]);
  return code;
}

export type Redeem = 'ok' | 'wrong' | 'expired' | 'none';

/** Burn the code on a match; count the try on a miss. Five misses and it is dead. */
export async function redeemCode(staffId: string, purpose: Purpose, code: string): Promise<Redeem> {
  const { rows } = await pool.query(
    `select id, code_hash, attempts, expires_at from one_time_code
      where staff_id = $1 and purpose = $2 and used_at is null order by created_at desc limit 1`, [staffId, purpose]);
  const t = rows[0];
  if (!t) return 'none';
  if (new Date(t.expires_at).getTime() < Date.now() || t.attempts >= TRIES) return 'expired';
  const want = Buffer.from(t.code_hash, 'hex'), got = Buffer.from(digest(staffId, String(code).replace(/\D/g, '')), 'hex');
  if (want.length === got.length && timingSafeEqual(want, got)) {
    await pool.query('update one_time_code set used_at = now() where id = $1', [t.id]);
    return 'ok';
  }
  await pool.query('update one_time_code set attempts = attempts + 1 where id = $1', [t.id]);
  return 'wrong';
}

/** What to tell the person. */
export const REDEEM_TEXT: Record<Exclude<Redeem, 'ok'>, string> = {
  // The same sentence for every miss on the public form, so the answer never says whether a number is known.
  wrong: 'That code is not right, or it has expired. Check the text, or ask for a new one.',
  expired: 'That code is not right, or it has expired. Check the text, or ask for a new one.',
  none: 'That code is not right, or it has expired. Check the text, or ask for a new one.',
};
