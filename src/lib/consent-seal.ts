// Freezing what was signed (039): the snapshot of a consent form as it was
// drawn at the moment of the decision, its fingerprints, and the checks that
// say a stored copy is unchanged.
//
// - The snapshot is the canonical JSON of the rendered document plus who,
//   when and what was decided (snapshotText). Canonical: object keys sorted,
//   no whitespace, strings in Unicode NFC, integers only. The server renders it
//   (renderDocument in consent-library.ts); it never comes from the browser.
// - The database computes both fingerprints itself whatever the caller passes
//   (the consent_signing trigger): snapshot_sha256 = sha256 of the snapshot's
//   UTF-8 bytes, and the seal = consent_seal(snapshot_sha256, the ink, the
//   signer's name, as whom, how, when) — sealHex below is the same sum, so a
//   copy can be checked outside the database too.
// - Once a form is on a patient's record its seal joins the clinic's chain
//   (consent_chain): each link is sha256(previous ‖ seal ‖ number). Editing a
//   stored snapshot, even as a superuser, turns its check red and breaks every
//   link after it. The patient's copy and the Close the day sheet carry short
//   seals (shortSeal), kept outside the database.
// - The library's words are pinned the same way: consent_version.body_sha256
//   is libraryHash(template), and templatesInForce offers a template only when
//   the two agree.
//
// Nothing here logs a snapshot, a signature or an answer.

import { createHash } from 'node:crypto';
import type { Tx } from './db';
import { TEMPLATES, CODES, type Template, type Rendered } from './consent-library';

// ---------------------------------------------------------------------------
// Canonical JSON and fingerprints
// ---------------------------------------------------------------------------
/**
 * One way to write a value, whoever writes it: keys sorted (by UTF-16 code
 * unit, after NFC), no whitespace, strings in NFC with JSON's own escaping,
 * safe integers only (a fraction, NaN or Infinity is refused: amounts are
 * centavos), booleans and null. A property whose value is undefined is left
 * out, as JSON.stringify does; undefined in a list, a Date, a function or a
 * bigint is refused.
 */
export function canonicalJson(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean': return v ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(v)) throw new Error('canonicalJson: integers only');
      return String(v === 0 ? 0 : v);
    case 'string': return JSON.stringify(v.normalize('NFC'));
    case 'object': {
      if (Array.isArray(v)) {
        return `[${v.map((x) => { if (x === undefined) throw new Error('canonicalJson: undefined in a list'); return canonicalJson(x); }).join(',')}]`;
      }
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('canonicalJson: plain objects only');
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).filter((k) => o[k] !== undefined).map((k) => [k.normalize('NFC'), k] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      for (let i = 1; i < keys.length; i++) if (keys[i][0] === keys[i - 1][0]) throw new Error('canonicalJson: two keys the same after NFC');
      return `{${keys.map(([n, k]) => `${JSON.stringify(n)}:${canonicalJson(o[k])}`).join(',')}}`;
    }
    default: throw new Error(`canonicalJson: cannot write a ${typeof v}`);
  }
}

/** SHA-256 of a string's UTF-8 bytes, as 64 lowercase hex characters. */
export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** The fingerprint of a template's words: what consent_version.body_sha256 holds for its version. */
export const libraryHash = (t: Template): string => sha256Hex(canonicalJson(t));

// ---------------------------------------------------------------------------
// The snapshot (§3.7)
// ---------------------------------------------------------------------------
export interface SnapshotMeta {
  /** consent_document.id */
  document: string;
  /** CF-7K2FQ */
  ref: string;
}

/**
 * The snapshot of a rendered, decided page: the words as drawn and every fact
 * the print shows, with the document it belongs to and its words' hash.
 * `schema` numbers this shape.
 */
export function snapshotOf(r: Rendered, meta: SnapshotMeta) {
  const t = TEMPLATES[r.version];
  if (!t) throw new Error(`snapshotOf: no words for ${r.version}`);
  return {
    schema: 1,
    document: meta.document,
    ref: meta.ref,
    version: r.version,
    code: r.code,
    library: libraryHash(t),
    langs: r.langs,
    clinic: r.clinic,
    patient: r.patient,
    dentist: r.dentist,
    attested: r.attested,
    title: r.title,
    for: r.for,
    in_short: r.in_short,
    sections: r.sections,
    ticks: r.ticks,
    answers: r.answers,
    initials: r.initials,
    fields: r.fields,
    decision: r.decision,
    decision_words: r.decision_words,
    signer: r.signer
      ? { name: r.signer.name, as: r.signer.as, method: r.signer.method, relation: r.signer.relation, authority: r.signer.authority, ground: r.signer.ground, note: r.signer.note, statement: r.signer.statement }
      : null,
    read: r.read,
    explained_in: r.explained_in,
    meaning: r.meaning,
    date: r.date,
  };
}
export type Snapshot = ReturnType<typeof snapshotOf>;

/** The snapshot as the text the database stores and hashes. */
export const snapshotText = (r: Rendered, meta: SnapshotMeta): string => canonicalJson(snapshotOf(r, meta));

// ---------------------------------------------------------------------------
// The seal and the chain (the same sums as consent_seal() and the chain trigger in 039)
// ---------------------------------------------------------------------------
/** What was drawn or put on paper: the strokes as compact JSON, "paper <day> <scan id>", or "none" (a photos refusal). */
export function inkOf(a: { strokes?: readonly (readonly (readonly [number, number])[])[] | null; paper?: { signedOn: string; attachmentId: string } | null }): string {
  if (a.paper) return `paper ${a.paper.signedOn} ${a.paper.attachmentId}`;
  if (!a.strokes) return 'none';
  return JSON.stringify(a.strokes);
}

/** The seal of a signing: sha256 of its lines, as consent_seal() writes them. `signedAt` to the millisecond, as the database keeps it. */
export function sealHex(a: { snapshotSha256: string; ink: string; name: string; as: string; method: string; signedAt: Date | string }): string {
  const at = new Date(a.signedAt).toISOString();
  return sha256Hex(['flossify-seal-1', a.snapshotSha256, a.ink, a.name, a.as, a.method, at].join('\n'));
}

/** One link of a clinic's chain: sha256(previous ‖ seal ‖ number). The first link's previous is 64 zeros. */
export const chainHex = (prev: string, seal: string, seq: number | string): string => sha256Hex(`${prev}${seal}${seq}`);
export const CHAIN_START = '0'.repeat(64);

const SEAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/**
 * A seal short enough to print and read aloud: ten characters with no
 * look-alikes, from the seal's first 52 bits, as 3F9A-KQ72-MD. Printed on the
 * patient's copy and the Close the day sheet, kept outside the database; a
 * match says the long seal behind it is the one stored.
 */
export function shortSeal(hex: string): string {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('shortSeal: not a seal');
  let n = BigInt('0x' + hex.slice(0, 13));
  let s = '';
  for (let i = 0; i < 10; i++) { s = SEAL_ALPHABET[Number(n % 31n)] + s; n /= 31n; }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

// ---------------------------------------------------------------------------
// With the database
// ---------------------------------------------------------------------------
type Q = Pick<Tx, 'query'>;

/**
 * The templates in force on this server: each code's version in force today
 * (current_document_of; the general consent is the treatment consent in force)
 * whose words this server has AND whose stored hash is the hash of those
 * words. A version with other words in the database, or none here, is not
 * offered (the page says to ask the desk). Ordered as the pages come.
 */
export async function templatesInForce(q: Q): Promise<Template[]> {
  const { rows } = await q.query<{ id: string | null; body_sha256: string | null }>(
    `select (current_document_of(c)).id as id, (current_document_of(c)).body_sha256 as body_sha256 from unnest($1::text[]) as c`, [CODES]);
  return rows
    .map((r) => (r.id ? TEMPLATES[r.id] : undefined))
    .filter((t, i): t is Template => !!t && rows[i].body_sha256 === libraryHash(t))
    .sort((a, b) => a.order - b.order);
}

/**
 * Is a stored signing unchanged? Recomputed in the database from what it
 * holds: the snapshot's hash, the seal from the signing's own columns, and
 * its chain link (null while the form is not on a record yet). Null when
 * there is no such signing here (row-level security).
 */
export async function verifySigning(tx: Q, id: string): Promise<{ snapshotOk: boolean; sealOk: boolean; chainOk: boolean | null } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const r = (await tx.query<{ snapshot_ok: boolean | null; seal_ok: boolean | null; chain_ok: boolean | null }>(
    'select snapshot_ok, seal_ok, chain_ok from consent_signing_verify($1)', [id])).rows[0];
  if (!r || r.snapshot_ok === null) return null;
  return { snapshotOk: r.snapshot_ok, sealOk: !!r.seal_ok, chainOk: r.chain_ok };
}
