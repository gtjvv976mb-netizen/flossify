// The patient intake's database (039), checked: row-level security on every new table, the grants (insert-only
// where the spec says; consent_signing never updated or deleted by the app), each trigger's refusals, the public
// definers answering with status words and never an error, the fingerprints against the app's own sums
// (src/lib/consent-seal.ts), the chain, and retention_purge().
//
//   node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs scripts/dev/intake/db-test.mjs
//   DB=flossify_intake (default) · PGHOST (default /var/run/postgresql) · PGUSER (default: the OS user; a superuser)
//
// Part A runs in ONE transaction that is rolled back at the end: it moves the ten forms' effective date to
// today, makes its own staff and patients, and leaves nothing behind. The app's side runs as flossify_app
// (SET ROLE) with app.clinic_id set, so row-level security and the grants apply exactly as for the app.
// Part B commits (two connections race), on the general consent only, and deletes what it made.
// Refuses a database that is not on this machine. Never prints an answer, a token or a secret.
import assert from 'node:assert/strict';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import pg from 'pg';
import { TEMPLATES, renderDocument } from '../../../src/lib/consent-library.ts';
import { snapshotText, sha256Hex, sealHex, inkOf, chainHex, CHAIN_START, templatesInForce, verifySigning, libraryHash } from '../../../src/lib/consent-seal.ts';

const DB = process.env.DB ?? 'flossify_intake';
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const connect = async () => { const c = new pg.Client({ host: HOST, user: process.env.PGUSER, database: DB }); await c.connect(); return c; };
const c = await connect();
const who = (await c.query('select current_database() as d, rolsuper as su from pg_roles where rolname = current_user')).rows[0];
assert.equal(who.d, DB);
assert.equal(who.su, true, 'run as a superuser: the fixtures and the tamper checks need it');
console.log(`patient intake database checks — ${DB}\n`);

let step = 0;
const ok = (what) => console.log(`  ok ${String(++step).padStart(2)}  ${what}`);
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
const q1 = async (sql, p = []) => (await c.query(sql, p)).rows[0];

// As the app: flossify_app, one clinic's tenant, inside a savepoint so a refusal does not end the transaction.
let sp = 0;
async function app(sql, params = [], clinic = A) {
  const name = `s${++sp}`;
  await c.query(`savepoint ${name}`);
  try {
    await c.query('set local role flossify_app');
    await c.query(`select set_config('app.clinic_id', $1, true)`, [clinic ?? '']);
    const r = await c.query(sql, params);
    await c.query('reset role');
    await c.query(`release savepoint ${name}`);
    return r.rows;
  } catch (e) {
    await c.query(`rollback to savepoint ${name}`);
    await c.query('reset role');
    throw e;
  }
}
const app1 = async (sql, params, clinic) => (await app(sql, params, clinic))[0];
/** A statement the app must be refused: the error's message or code matches `re`. */
async function refused(sql, params, re, clinic = A) {
  let err = null;
  try { await app(sql, params, clinic); } catch (e) { err = e; }
  assert.ok(err, `expected a refusal: ${sql.slice(0, 90)}`);
  assert.match(`${err.code} ${err.message}`, re, `${sql.slice(0, 90)} → ${err.code} ${err.message}`);
  return err;
}
/** As the owner, in a savepoint (for a tamper that must not leak into later checks). */
async function asOwner(fn) {
  const name = `o${++sp}`;
  await c.query(`savepoint ${name}`);
  try { return await fn(); } finally { await c.query(`rollback to savepoint ${name}`); }
}

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const REF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const token = () => Array.from({ length: 26 }, () => ALPHA[randomInt(31)]).join('');
const refOf = (p, n) => `${p}-${Array.from({ length: n }, () => REF[randomInt(31)]).join('')}`;
const device = () => { const secret = randomBytes(32).toString('base64url'); return createHash('sha256').update(secret).digest('hex'); };
const nonce = () => randomBytes(18).toString('base64url');
const STROKES = [[[10, 10], [200, 120], [400, 60], [640, 200]]];

// ---------------------------------------------------------------------------------------------------------
// Part A
// ---------------------------------------------------------------------------------------------------------
await c.query('begin');
await c.query(`update consent_version set effective_from = (now() at time zone 'Asia/Manila')::date - 1 where kind = 'document'`);
const A = (await q1(`select id, group_id from clinic where slug = 'session-road'`)).id;
const B = (await q1(`select id from clinic where slug = 'burnham-smile'`)).id;
const groupA = (await q1(`select group_id from clinic where id = $1`, [A])).group_id;
const OWNER = (await q1(`select id from staff where email = 'liwayway.domingo@example.com'`)).id;
const HAZEL = (await q1(`select id, full_name, prc_licence from staff where email = 'hazel.tabanao@example.com'`));
const RAMON = (await q1(`select id from staff where email = 'ramon.cari.o@example.com'`)).id;
const OWNER_B = (await q1(`select id from staff where email = 'carlo.buyagan@example.com'`)).id;
const mkStaff = async (name, role, prc, canEdit) => {
  const id = (await q1(`insert into staff (group_id, full_name, email, role, prc_licence, home_clinic_id) values ($1, $2, $3, $4, $5, $6) returning id`,
    [groupA, name, `${name.replace(/\W/g, '').toLowerCase()}.${randomInt(1e6)}@example.test`, role, prc, A])).id;
  await c.query(`insert into staff_access (staff_id, clinic_id, can_edit_records) values ($1, $2, $3)`, [id, A, canEdit]);
  return id;
};
const NOREC = await mkStaff('Nora Norecords', 'secretary', null, false);
const DESK = await mkStaff('Dina Desk', 'secretary', null, true);
const NOPRC = await mkStaff('Noel Noprc', 'dentist', null, true);
const mkPatient = async (clinic, first, last, birth, phone = null) => (await q1(
  `insert into patient (clinic_id, chart_no, first_name, last_name, birth_date, phone) values ($1, $2, $3, $4, $5, $6) returning id`,
  [clinic, `T-${randomInt(1e8)}`, first, last, birth, phone])).id;
const PA = await mkPatient(A, 'Tessa', 'Intaketest', '1990-05-06', '09170000401');
const PM = await mkPatient(A, 'Nico', 'Intaketest', '2014-02-03');
const P12 = await mkPatient(A, 'Mira', 'Intaketest', '2012-07-08');
const PB = await mkPatient(B, 'Bea', 'Intaketest', '1985-01-01');
const mkFile = async (patient, when = 'now()') => (await q1(
  `insert into attachment (clinic_id, patient_id, kind, storage_key, bytes, mime, uploaded_by, created_at) values ($1, $2, 'document', 'records/x', 10, 'application/pdf', $3, ${when}) returning id`,
  [A, patient, OWNER])).id;
const today = (await q1(`select to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as d`)).d;

// 1. The library
{
  const rows = await q(`select id, kind, code, body_sha256 from consent_version where kind in ('treatment', 'document') order by id`);
  assert.equal(rows.length, 11);
  for (const r of rows) assert.equal(r.body_sha256, libraryHash(TEMPLATES[r.id]), `${r.id}: the row's words are not the library's`);
  const inForce = await templatesInForce({ query: (s, p) => c.query(s, p) });
  assert.deepEqual(inForce.map((t) => t.code), ['general', 'anaesthesia', 'extraction', 'root_canal', 'restoration', 'periodontal', 'denture', 'implant', 'ortho', 'whitening', 'photos']);
  assert.equal((await q1(`select (current_document_of('extraction')).id as id`)).id, 'extraction-2026-10');
  assert.equal((await q1(`select (current_document_of('general')).id as id`)).id, 'treatment-2026-09');
  assert.equal((await q1(`select (current_consent_version()).id as id`)).id, 'privacy-2026-09');
  await asOwner(async () => {
    await assert.rejects(c.query(`insert into consent_version (id, title, summary, effective_from, kind, code, body_sha256) values ('x-2026-10', 'x', 'x', '2026-10-01', 'document', 'extraction', 'HASH')`), /document_shape/);
  });
  await asOwner(async () => {
    await c.query(`update consent_version set body_sha256 = $1 where id = 'extraction-2026-10'`, ['0'.repeat(64)]);
    const again = await templatesInForce({ query: (s, p) => c.query(s, p) });
    assert.equal(again.some((t) => t.code === 'extraction'), false);
  });
  ok('library: 11 rows whose body_sha256 is libraryHash of the words; templatesInForce lists all 11 (and drops one whose stored hash differs); a placeholder hash is refused');
}

// 2. Grants: insert-only where the spec says; the definers' columns and tables are theirs alone
{
  await refused(`insert into consent_version (id, title, summary, effective_from, kind) values ('p', 'p', 'p', '2026-01-01', 'privacy')`, [], /permission denied/);
  for (const t of ['consent_signing', 'consent_attestation', 'consent_confirmation', 'capacity_note', 'consent_withdrawal', 'consent_override', 'consent_chain', 'intake_event']) {
    await refused(`update ${t} set clinic_id = clinic_id`, [], /permission denied/);
    await refused(`delete from ${t}`, [], /permission denied/);
  }
  await refused(`insert into consent_chain (clinic_id, seq, signing_id, seal_sha256, prev_sha256, chain_sha256) values ($1, 1, gen_random_uuid(), $2, $2, $2)`, [A, '0'.repeat(64)], /permission denied/);
  await refused(`insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev) values (gen_random_uuid(), gen_random_uuid(), $1, 'reading', 0)`, [A], /permission denied/);
  await refused(`update intake_page set state = 'agreed'`, [], /permission denied/);
  for (const col of ['answers = null', 'page1_done_at = now()', 'privacy_as = null', 'id_tries = 0', 'verified_at = now()', 'sent_at = now()', 'send_nonce = null', 'created_by = created_by']) {
    await refused(`update intake set ${col}`, [], /permission denied/);
  }
  await refused(`delete from intake`, [], /permission denied/);
  await refused(`delete from consent_document`, [], /permission denied/);
  await refused(`delete from intake_link`, [], /permission denied/);
  await refused(`update intake_link set claimed_at = now()`, [], /permission denied/);
  await refused(`update intake_link set last_seen_at = now()`, [], /permission denied/);
  await refused(`update consent_document set rev = 0`, [], /permission denied/);
  await refused(`update consent_document set dentist_name = 'x'`, [], /permission denied/);
  await refused(`update consent_document set version_id = version_id`, [], /permission denied/);
  await refused(`update clinic_tablet set secret_sha256 = secret_sha256`, [], /permission denied/);
  await refused(`select * from intake_gate('x', null)`, [], /permission denied/);
  await refused(`insert into intake (clinic_id, ref, target, form_version, created_by, answers) values ($1, 'IN-AAAA', 'new', 'v', $2, '{}')`, [A, OWNER], /permission denied/);
  ok('grants: consent_version, the chain and intake_page are not the app’s to write; update and delete refused on all 8 insert-only tables (consent_signing included); intake’s answers, page 1, privacy, tries and Send columns, a link’s claim, a form’s rev and dentist name are the definers’ and the trigger’s; intake_gate is granted to nobody');
}

// 3. The desk prepares an intake (a new patient) and its forms; the triggers’ refusals
const I1 = await app1(`insert into intake (clinic_id, ref, target, form_version, created_by, desk_minor, came_with) values ($1, $2, 'new', 'intake-2026-10', $3, 'no', 'nobody') returning id, ref, status`,
  [A, refOf('IN', 4), OWNER]);
assert.equal(I1.status, 'preparing');
await refused(`insert into intake (clinic_id, ref, target, form_version, created_by) values ($1, $2, 'new', 'intake-2026-10', $3)`, [A, refOf('IN', 4), NOREC], /may edit records/);
await refused(`insert into intake (clinic_id, ref, target, form_version, created_by, patient_id) values ($1, $2, 'existing', 'intake-2026-10', $3, $4)`, [A, refOf('IN', 4), OWNER, PB], /not on file at this clinic/);
await refused(`insert into intake (clinic_id, ref, target, form_version, created_by) values ($1, $2, 'existing', 'intake-2026-10', $3)`, [A, refOf('IN', 4), OWNER], /check/);
const doc = async (intake, version, extra = {}) => app1(
  `insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, fields, dentist_id, explained_in, sort, prepared_by)
   values ($1, $2, $3, $4, $5, $6, $7, 'en', $8, $9) returning *`,
  [A, refOf('CF', 5), version, intake, extra.patient ?? null, JSON.stringify(extra.fields ?? {}), extra.dentist ?? null, TEMPLATES[version].order, extra.by ?? OWNER]);
const G1 = await doc(I1.id, 'treatment-2026-09');
const X1 = await doc(I1.id, 'extraction-2026-10', { dentist: HAZEL.id, fields: { teeth: [36], type: 'simple', estimate: { kind: 'later' } } });
const F1 = await doc(I1.id, 'photos-2026-10', { fields: { uses: ['specialist', 'social'] } });
const W1 = await doc(I1.id, 'whitening-2026-10', { dentist: HAZEL.id, fields: { method: 'clinic', estimate: { kind: 'later' } } });
assert.equal(X1.dentist_name, HAZEL.full_name);
assert.equal(X1.dentist_prc, HAZEL.prc_licence);
await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, sort, prepared_by) values ($1, $2, 'extraction-2026-10', $3, 30, $4)`, [A, refOf('CF', 5), I1.id, OWNER], /names the dentist/);
await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, dentist_id, sort, prepared_by) values ($1, $2, 'extraction-2026-10', $3, $4, 30, $5)`, [A, refOf('CF', 5), I1.id, NOPRC, OWNER], /PRC licence/);
await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, dentist_id, sort, prepared_by) values ($1, $2, 'extraction-2026-10', $3, $4, 30, $5)`, [A, refOf('CF', 5), I1.id, DESK, OWNER], /not a treating dentist/);
await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, dentist_id, sort, prepared_by) values ($1, $2, 'extraction-2026-10', $3, $4, 30, $5)`, [A, refOf('CF', 5), I1.id, OWNER_B, OWNER], /not a treating dentist/);
await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, sort, prepared_by) values ($1, $2, 'privacy-2026-09', $3, 10, $4)`, [A, refOf('CF', 5), I1.id, OWNER], /not a consent form/);
await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, sort, prepared_by) values ($1, $2, 'treatment-2026-09', $3, 10, $4)`, [A, refOf('CF', 5), I1.id, NOREC], /may edit records/);
await refused(`insert into consent_document (clinic_id, ref, version_id, patient_id, sort, prepared_by) values ($1, $2, 'treatment-2026-09', $3, 10, $4)`, [A, refOf('CF', 5), PB, OWNER], /not on file at this clinic/);
// A change to the fields bumps rev (and the trigger, not the caller, says so).
const bumped = await app1(`update consent_document set fields = $2 where id = $1 returning rev, changed_at`, [X1.id, JSON.stringify({ teeth: [36], type: 'simple', estimate: { kind: 'later' } })]);
assert.equal(bumped.rev, 0);
const bumped2 = await app1(`update consent_document set fields = $2 where id = $1 returning rev`, [X1.id, JSON.stringify({ teeth: [36], type: 'surgical', estimate: { kind: 'later' } })]);
assert.equal(bumped2.rev, 1);
X1.rev = 1; X1.fields = { teeth: [36], type: 'surgical', estimate: { kind: 'later' } };
await refused(`update intake set status = 'added' where id = $1`, [I1.id], /cannot go from preparing to added/);
ok('desk: an intake and four forms prepared; refused: someone without records.edit, another clinic’s patient, an existing-patient intake with no patient, a procedure form with no dentist, a dentist without a PRC licence, a desk member or another clinic’s owner as dentist, a privacy notice as a form; the dentist’s name and licence copied by the trigger; rev bumped only by a real change; preparing → added refused');

// 4. The link, claimed by the first device
const T1 = token(), DEV1 = device(), DEV2 = device();
await refused(`insert into intake_link (token, clinic_id, intake_id, device, created_by) values ($1, $2, $3, 'desk', $4)`, [token(), A, I1.id, OWNER], /needs its secret/);
const L1 = await app1(`insert into intake_link (token, clinic_id, intake_id, device, created_by) values ($1, $2, $3, 'phone', $4) returning claimed_at, open_by - created_at as window`, [T1, A, I1.id, OWNER]);
assert.equal(L1.claimed_at, null);
assert.equal(L1.window.minutes, 15);
await refused(`insert into intake_link (token, clinic_id, intake_id, device, created_by) values ($1, $2, $3, 'phone', $4)`, [token(), A, I1.id, OWNER], /intake_link_live|duplicate/);
await app(`update intake set status = 'out', rev = rev + 1 where id = $1`, [I1.id]);
const view = async (t, d) => (await app1(`select intake_view($1, $2) as v`, [t, d], null)).v;
const call = async (fn, args) => Object.values(await app1(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args, null))[0];
let v = await view(T1, null);
assert.equal(v.status, 'welcome');
assert.equal(v.parts, 5);
assert.equal(v.pages, undefined);
assert.equal(v.clinic.name.length > 0, true);
assert.equal(await call('intake_claim', [T1, DEV1]), 'open');
assert.equal(await call('intake_claim', [T1, DEV2]), 'taken');
assert.equal((await view(T1, DEV2)).status, 'taken');
assert.equal((await view(T1, DEV2)).pages, undefined);
v = await view(T1, DEV1);
assert.equal(v.status, 'open');
assert.deepEqual(v.pages.map((p) => [p.code, p.signable]), [['general', true], ['extraction', false], ['whitening', false], ['photos', true]]);
ok('link: made for 15 minutes; one live link per intake; a desk link needs its secret; the view shows the clinic and "5 parts" before the claim, nothing else; the first device claims it, a second is "taken" and sees no page; the claiming device sees the pages, each saying whether it can be signed now');

// 5. Page 1 on the definer: screens, the age check, who agrees, the notice in force
const page1 = {
  v: 'intake-2026-10', first_name: 'Rhea', middle_name: null, last_name: 'Intaketest', suffix: null, birth_date: '1991-03-04', sex: 'female', occupation: 'Nurse',
  mobile: '09170000402', email: null, address: '1 Road', city: 'Baguio City', province: 'Benguet', guardian_name: null, guardian_relation: null, guardian_mobile: null,
  guardian_is_emergency: null, emergency_name: 'Joy', emergency_relation: 'Sister', emergency_mobile: '09170000403',
  good_health: 'yes', under_treatment: 'no', treatment_detail: null, serious_illness: 'no', illness_detail: null, hospitalised: 'no', hospital_detail: null,
  takes_medicines: 'no', medicines: [], allergies: ['none'], allergy_other: null, smoke: 'no', alcohol_drugs: 'no', pregnant: 'no', nursing: 'no', birth_control: 'no',
  blood_type: null, blood_pressure: null, bleeding_time: null, conditions: ['none'], condition_other: null, hmo: null, hmo_other: null, hmo_card_no: null,
};
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const save1 = (screen, a) => call('intake_save_page1', [T1, DEV1, screen, JSON.stringify(a)]);
assert.equal(await save1('you', { ...pick(page1, ['first_name', 'last_name']), nonsense: 1 }), 'invalid');
assert.equal(await save1('elsewhere', {}), 'invalid');
assert.equal(await call('intake_decide', [T1, DEV1, G1.id, 0, 'agreed', '{}', '{}']), 'order');
assert.equal(await save1('you', { ...pick(page1, ['v', 'first_name', 'middle_name', 'last_name', 'suffix', 'sex', 'occupation']), birth_date: '2013-03-04' }), 'age_check');
assert.equal(await save1('privacy', { privacy_as: 'none' }), 'age_check');
assert.ok((await q(`select 1 from intake_event where intake_id = $1 and kind = 'age_check'`, [I1.id])).length);
assert.equal((await q1(`select cancelled_at is not null as c, cancel_why from consent_document where id = $1`, [W1.id])).c, true, 'whitening cancelled for a minor');
await app(`update intake set desk_minor = 'unsure', rev = rev + 1 where id = $1`, [I1.id]);
assert.equal(await save1('you', pick(page1, ['v', 'first_name', 'middle_name', 'last_name', 'suffix', 'birth_date', 'sex', 'occupation'])), 'saved');
assert.equal(await save1('contact', pick(page1, ['mobile', 'email', 'address', 'city', 'province', 'guardian_name', 'guardian_relation', 'guardian_mobile', 'guardian_is_emergency', 'emergency_name', 'emergency_relation', 'emergency_mobile'])), 'saved');
assert.equal(await save1('health', pick(page1, ['good_health', 'under_treatment', 'treatment_detail', 'serious_illness', 'illness_detail', 'hospitalised', 'hospital_detail', 'takes_medicines', 'medicines', 'allergies', 'allergy_other', 'smoke', 'alcohol_drugs', 'pregnant', 'nursing', 'birth_control', 'blood_type', 'blood_pressure', 'bleeding_time', 'conditions', 'condition_other'])), 'saved');
const priv = { hmo: null, hmo_other: null, hmo_card_no: null, privacy_version: 'privacy-2026-09', privacy_as: 'patient', privacy_by_name: 'Rhea Intaketest', privacy_relation: null, consent_privacy: true };
assert.equal(await save1('privacy', { ...priv, privacy_version: 'privacy-2025-01' }), 'changed');
assert.equal(await save1('privacy', { ...priv, privacy_as: 'parent', privacy_by_name: 'Someone', privacy_relation: 'Mother' }), 'invalid');
assert.equal(await save1('privacy', { ...priv, privacy_by_name: 'Somebody Else' }), 'invalid');
assert.equal(await save1('privacy', { ...priv, consent_privacy: false }), 'invalid');
assert.equal(await save1('privacy', priv), 'page1');
const i1 = await q1(`select page1_done_at is not null as done, privacy_as, privacy_by_name, privacy_version, privacy_at is not null as at from intake where id = $1`, [I1.id]);
assert.deepEqual(i1, { done: true, privacy_as: 'patient', privacy_by_name: 'Rhea Intaketest', privacy_version: 'privacy-2026-09', at: true });
ok('page 1: unknown keys and screens refused; a form before page 1 is "order"; a birth date that makes a minor while the desk said adult is "age_check" (saved, noted, page 1 held, whitening cancelled for the minor); a stale notice "changed"; a parent for an adult, a name not the server’s, no tick: "invalid"; then page 1 is done, agreed by the patient under the name page 1 holds');

// 6. Deciding pages: the general consent, then a dentist's form after "I explained this", then photos
const PNAME = 'Rhea Intaketest';
const renderSnap = (d, decision, signer, att, extra = {}) => snapshotText(renderDocument(TEMPLATES[d.version_id], d.fields, {
  langs: ['en'], minor: false, confirmed: !!att, clinic: { name: 'Session Road Dental', address: null, phone: null }, patient: { name: PNAME, birth: '1991-03-04' },
  dentist: d.dentist_name ? { name: d.dentist_name, prc: d.dentist_prc } : null,
  attested: att ? { at: att.attested_at, lang: att.explained_in, interpreter: null, assent: null } : null, language: att?.explained_in ?? 'English',
  decision, signer, read: { self: true }, explainedIn: 'English', answers: extra.answers ?? {}, initials: extra.initials ?? null, date: today,
}), { document: d.id, ref: d.ref });
const ME = { name: PNAME, as: 'patient', method: 'sign', relation: null, authority: null, ground: null, note: null };
const pageOf = (s = ME, more = {}) => JSON.stringify({ signed_by_name: s.name, signed_as: s.as, method: s.method, relation: s.relation, authority: s.authority,
  authority_ground: s.ground, authority_note: s.note, explained_in: 'English', read_by: null, initials: more.initials ?? null, answers: more.answers ?? {}, strokes: more.strokes === undefined ? STROKES : more.strokes, over21: more.over21 ?? false });
const decide = (d, rev, decision, page, snap) => call('intake_decide', [T1, DEV1, d.id, rev, decision, page, snap]);
assert.equal(await call('intake_mark_page', [T1, DEV1, G1.id, 0, 'opened']), 'saved');
assert.equal(await decide(G1, 0, 'agreed', pageOf(), renderSnap({ ...G1, id: X1.id }, 'agreed', ME, null)), 'invalid', 'a snapshot of another form');
assert.equal(await decide(G1, 0, 'agreed', pageOf({ ...ME, name: 'Rhea Other' }), renderSnap(G1, 'agreed', { ...ME, name: 'Rhea Other' }, null)), 'invalid', 'not the server’s name');
assert.equal(await decide(G1, 0, 'agreed', pageOf({ ...ME, method: 'mark' }), renderSnap(G1, 'agreed', { ...ME, method: 'mark' }, null)), 'invalid', 'a mark on a phone');
assert.equal(await decide(G1, 0, 'agreed', pageOf(ME, { strokes: [[[1, 1]], [[2000, 5]]] }), renderSnap(G1, 'agreed', ME, null)), 'invalid', 'strokes outside the box');
assert.equal(await decide(G1, 0, 'agreed', pageOf(ME, { strokes: null }), renderSnap(G1, 'agreed', ME, null)), 'invalid', 'no signature');
assert.equal(await decide(G1, 7, 'agreed', pageOf(), renderSnap(G1, 'agreed', ME, null)), 'changed', 'an old rev');
assert.equal(await decide(G1, 0, 'agreed', pageOf(), renderSnap(G1, 'agreed', ME, null)), 'saved');
// The dentist's form: read now, signed after the named dentist explains it.
assert.equal(await decide(X1, 1, 'agreed', pageOf(), renderSnap(X1, 'agreed', ME, null)), 'not_ready');
assert.equal(await call('intake_mark_page', [T1, DEV1, X1.id, 1, 'read']), 'saved');
await refused(`insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, fields_sha256) values ($1, $2, $3, 'x', 'x', 'English', $4)`, [A, X1.id, RAMON, '0'.repeat(64)], /only the dentist named/);
await refused(`insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, fields_sha256) values ($1, $2, $3, 'x', 'x', 'English', $4)`, [A, G1.id, HAZEL.id, '0'.repeat(64)], /not explained and confirmed by a dentist/);
const att = await app1(`insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, fields_sha256)
  values ($1, $2, $3, 'Forged Name', 'forged', 'Filipino', $4) returning dentist_name, dentist_prc, fields_sha256, to_char(attested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as attested_at, explained_in`,
  [A, X1.id, HAZEL.id, '0'.repeat(64)]);
assert.equal(att.dentist_name, HAZEL.full_name);
assert.notEqual(att.fields_sha256, '0'.repeat(64));
await refused(`insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, fields_sha256) values ($1, $2, $3, 'x', 'x', 'English', $4)`, [A, X1.id, HAZEL.id, '0'.repeat(64)], /duplicate|unique/);
for (const set of [`fields = '{}'`, `dentist_id = '${RAMON}'`, `explained_in = 'fil'`, `interpreter = 'someone'`, `sort = 31`, `plan_item_id = gen_random_uuid()`]) {
  await refused(`update consent_document set ${set} where id = $1`, [X1.id], /fixed|violates foreign key/);
}
v = await view(T1, DEV1);
const vx = v.pages.find((p) => p.code === 'extraction');
assert.equal(vx.signable, true);
assert.equal(vx.attestation.attested_at, att.attested_at);
const XI = { initials: 'RI' };
assert.equal(await decide(X1, 1, 'agreed', pageOf(ME, XI), renderSnap(X1, 'agreed', ME, { ...att, attested_at: '2020-01-01T00:00:00.000Z' }, XI)), 'invalid', 'a snapshot of another confirmation');
assert.equal(await decide(X1, 1, 'agreed', pageOf(ME, XI), renderSnap(X1, 'agreed', ME, att, XI)), 'saved');
// Photos: "Decide later" is kept unsigned (043: a minor's parent may not be there); "No, thank you" needs no signature.
assert.equal(await call('intake_decide', [T1, DEV1, F1.id, 0, 'later', '{}', null]), 'saved', 'photos may be left for later (043)');
assert.equal((await q1(`select state, strokes, snapshot from intake_page where intake_id = $1 and document_id = $2`, [I1.id, F1.id])).state, 'later');
assert.equal(await decide(F1, 0, 'refused', pageOf(ME, { strokes: null }), renderSnap(F1, 'refused', ME, null)), 'saved');
ok('decisions: a snapshot of another form, a name not the server’s, a mark on a phone, strokes outside the box, no signature, an old rev: refused as words; the general consent saved; the extraction "not_ready" until Dr Hazel (not Dr Ramon) confirms it, then read-only fields frozen (6 columns refused) and signed; photos left for later (043), then refused without strokes');

// 6b. 043: which device a link was for, told only to that device; what the patient said while the age is not known
{
  assert.equal(await call('intake_device', [T1, DEV1]), 'phone');
  assert.equal(await call('intake_device', [T1, DEV2]), null);
  assert.equal(await call('intake_device', [token(), DEV1]), null);
  assert.equal(await call('intake_device', ['not a token', DEV1]), null);
  // The app may call it; nobody else (revoked from public).
  assert.equal((await q1(`select has_function_privilege('public', 'intake_device(text, text)', 'execute') as p`)).p, false);
  for (const [dm, need] of [['unsure', true], ['yes', true], [null, true], ['no', false]]) {
    const In = await app1(`insert into intake (clinic_id, ref, target, form_version, created_by, desk_minor) values ($1, $2, 'new', 'intake-2026-10', $3, $4) returning id`, [A, refOf('IN', 4), OWNER, dm]);
    const Xn = await doc(In.id, 'anaesthesia-2026-10', { dentist: HAZEL.id, fields: { area: 'tooth 36', technique: 'infiltration' } });
    const ins = `insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, assent, fields_sha256) values ($1, $2, $3, 'x', 'x', 'English', $4, $5) returning assent`;
    if (need) {
      await refused(ins, [A, Xn.id, HAZEL.id, null, '0'.repeat(64)], /say what the patient said/);
      assert.equal((await app1(ins, [A, Xn.id, HAZEL.id, 'agreed', '0'.repeat(64)])).assent, 'agreed');
    } else {
      assert.equal((await app1(ins, [A, Xn.id, HAZEL.id, null, '0'.repeat(64)])).assent, null);
    }
  }
  ok('043: intake_device names the link’s device for its own device only (not another device, a made-up token or a bad one); what the patient said is required while the age is not known unless the desk said 18 or over, and stored');
}

// 7. Send, and what it wrote: the fingerprints are the app’s own sums
assert.equal(await call('intake_send', [T1, DEV1, 'short']), 'invalid');
const N1 = nonce();
assert.equal(await call('intake_send', [T1, DEV1, N1]), 'sent');
assert.equal(await call('intake_send', [T1, DEV1, N1]), 'again');
assert.equal(await call('intake_send', [T1, DEV1, nonce()]), 'finished');
assert.equal((await view(T1, DEV1)).status, 'finished');
const signings = await q(`select s.*, to_char(s.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at from consent_signing s where intake_id = $1 order by signed_at`, [I1.id]);
assert.equal(signings.length, 3);
for (const s of signings) {
  assert.equal(s.snapshot_sha256, sha256Hex(s.snapshot));
  assert.equal(s.seal_sha256, sealHex({ snapshotSha256: s.snapshot_sha256, ink: inkOf({ strokes: s.strokes }), name: s.signed_by_name, as: s.signed_as, method: s.method, signedAt: s.at }));
  assert.equal(s.link_by, OWNER);
  assert.equal(s.channel, 'phone');
  assert.equal(s.needs_confirm, null);
}
assert.equal(signings.find((s) => s.document_id === F1.id).strokes, null);
assert.equal((await q1(`select status from intake where id = $1`, [I1.id])).status, 'sent');
assert.equal((await q1(`select retired_why from intake_link where token = $1`, [T1])).retired_why, 'sent');
assert.equal((await q(`select 1 from consent_chain c join consent_signing s on s.id = c.signing_id where s.intake_id = $1`, [I1.id])).length, 0);
ok('send: a bad nonce is "invalid"; sent; the same nonce "again", another "finished"; 3 signings (the whitening cancelled, the photos refusal without strokes), each snapshot_sha256 = sha256Hex(snapshot) and seal = sealHex(…) from the app; not chained before the forms are on a record');

// 8. Add: the forms join the record and the clinic’s chain
const PN = await mkPatient(A, 'Rhea', 'Intaketest', '1991-03-04', '09170000402');
const before = (await q1(`select coalesce(max(seq), 0)::int as n from consent_chain where clinic_id = $1`, [A])).n;
for (const d of [G1, X1, F1]) await app(`update consent_document set patient_id = $2 where id = $1`, [d.id, PN]);
await app(`update intake set status = 'added', patient_id = $2, added_as = 'new', decided_by = $3, decided_at = now(), rev = rev + 1 where id = $1`, [I1.id, PN, OWNER]);
const chain = await q(`select c.* from consent_chain c where clinic_id = $1 and seq > $2 order by seq`, [A, before]);
assert.equal(chain.length, 3);
let prev = before ? (await q1(`select chain_sha256 from consent_chain where clinic_id = $1 and seq = $2`, [A, before])).chain_sha256 : CHAIN_START;
for (const l of chain) { assert.equal(l.prev_sha256, prev); assert.equal(l.chain_sha256, chainHex(prev, l.seal_sha256, l.seq)); prev = l.chain_sha256; }
for (const s of signings) assert.deepEqual(await verifySigning({ query: (s2, p) => app(s2, p).then((rows) => ({ rows })) }, s.id), { snapshotOk: true, sealOk: true, chainOk: true });
assert.deepEqual((await app1(`select * from consent_chain_check($1)`, [A])), { ok: true, links: String(before + 3), first_bad: null });
const head = await app1(`select seq from consent_chain_head($1, $2::date)`, [A, today]);
assert.equal(Number(head.seq), before + 3);
const states = Object.fromEntries((await app(`select d.version_id, consent_document_state(d.id) as s from consent_document d where d.patient_id = $1`, [PN])).map((r) => [r.version_id, r.s]));
assert.deepEqual(states, { 'treatment-2026-09': 'agreed', 'extraction-2026-10': 'agreed', 'photos-2026-10': 'no_photos' });
await refused(`update intake set label = 'x' where id = $1`, [I1.id], /does not change/);
await refused(`update consent_document set patient_id = $2 where id = $1`, [X1.id, PM], /set once/);
await refused(`update consent_document set cancelled_at = now(), cancel_why = 'removed', cancelled_by = $2 where id = $1`, [X1.id, OWNER], /signed form cannot be cancelled/);
ok('add: the three forms given the patient join the chain as links n+1…n+3, each prev = the last link and chain = chainHex(prev, seal, seq); verifySigning is all true; consent_chain_check walks it clean; the Close the day head is the last link; states agreed / agreed / no_photos; an added intake, a form’s patient and a signed form’s cancel are fixed');

// 9. Row-level security on every new table
{
  const tables = ['intake', 'clinic_tablet', 'intake_link', 'consent_document', 'intake_page', 'consent_signing', 'consent_attestation', 'consent_confirmation',
    'capacity_note', 'consent_withdrawal', 'consent_override', 'consent_chain', 'intake_event'];
  const seen = {};
  for (const t of tables) {
    const a = Number((await app1(`select count(*) as n from ${t}`, [], A)).n);
    const b = Number((await app1(`select count(*) as n from ${t} where clinic_id = $1`, [A], B)).n);
    const none = Number((await app1(`select count(*) as n from ${t}`, [], '')).n);
    assert.equal(b, 0, `${t}: clinic B sees clinic A's rows`);
    assert.equal(none, 0, `${t}: no tenant sees rows`);
    seen[t] = a;
    const forced = await q1(`select relrowsecurity and relforcerowsecurity as f from pg_class where relname = $1`, [t]);
    assert.equal(forced.f, true, `${t}: RLS not forced`);
  }
  await refused(`insert into intake (clinic_id, ref, target, form_version, created_by) values ($1, $2, 'new', 'intake-2026-10', $3)`, [A, refOf('IN', 4), OWNER], /row-level security/, B);
  await refused(`insert into intake_event (clinic_id, intake_id, kind) values ($1, $2, 'seen')`, [A, I1.id], /row-level security/, B);
  assert.equal((await app(`select * from consent_signing_verify($1)`, [signings[0].id], B))[0].snapshot_ok, null);
  ok(`RLS: forced on all 13 tables; clinic B and no tenant see none of A's rows (A sees ${seen.intake} intakes, ${seen.consent_signing} signings, ${seen.consent_chain} links, ${seen.intake_event} events); B cannot write A's rows; B cannot verify A's signing`);
}

// 10. Paper, and the hashes a caller supplies
const X2 = await doc(null, 'restoration-2026-10', { patient: PA, dentist: HAZEL.id, fields: { kind: ['filling'], teeth: [16], estimate: { kind: 'later' } } });
const earlyScan = await mkFile(PA, `now() - interval '1 hour'`);
await app(`insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, fields_sha256) values ($1, $2, $3, 'x', 'x', 'English', $4)`, [A, X2.id, HAZEL.id, '0'.repeat(64)]);
const paperRow = (scan, extra = {}) => [A, X2.id, extra.decision ?? 'agreed', extra.snapshot ?? '{}', 'Tessa Intaketest', 'patient', extra.on ?? today, scan, OWNER];
const paperSql = `insert into consent_signing (clinic_id, document_id, decision, channel, snapshot, snapshot_sha256, seal_sha256, signed_by_name, signed_as, signed_on, attachment_id, recorded_by, decided_at)
                  values ($1, $2, $3, 'paper', $4, '${'a'.repeat(64)}', '${'b'.repeat(64)}', $5, $6, $7, $8, $9, now()) returning *`;
await refused(paperSql, paperRow(earlyScan), /print the form for signing first/);
await app(`update consent_document set paper_printed_at = now() where id = $1`, [X2.id]);
await refused(`update consent_document set paper_printed_at = now() + interval '1 minute' where id = $1`, [X2.id], /printed once/);
await refused(paperSql, paperRow(null), /check|scan/);
await refused(paperSql, paperRow(earlyScan), /uploaded after the print/);
const scan = await mkFile(PA);
await refused(paperSql, paperRow(scan), /snapshot is not of this form/);
const attX2 = await q1(`select to_char(attested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as attested_at, explained_in from consent_attestation where document_id = $1`, [X2.id]);
const x2 = await q1(`select * from consent_document where id = $1`, [X2.id]);
const snapP = snapshotText(renderDocument(TEMPLATES[x2.version_id], x2.fields, {
  langs: ['en'], minor: false, confirmed: true, clinic: { name: 'Session Road Dental', address: null, phone: null }, patient: { name: 'Tessa Intaketest', birth: '1990-05-06' },
  dentist: { name: x2.dentist_name, prc: x2.dentist_prc }, attested: { at: attX2.attested_at, lang: 'English', interpreter: null, assent: null }, language: 'English',
  decision: 'agreed', signer: { ...ME, name: 'Tessa Intaketest' }, read: { self: true }, explainedIn: 'English', date: today,
}), { document: x2.id, ref: x2.ref });
const paper = await app1(paperSql, paperRow(scan, { snapshot: snapP }));
assert.notEqual(paper.snapshot_sha256, 'a'.repeat(64));
assert.equal(paper.snapshot_sha256, sha256Hex(snapP));
assert.equal(paper.seal_sha256, sealHex({ snapshotSha256: paper.snapshot_sha256, ink: inkOf({ paper: { signedOn: today, attachmentId: scan } }), name: 'Tessa Intaketest', as: 'patient', method: 'sign', signedAt: paper.signed_at }));
assert.equal(paper.intake_id, null);
await refused(`update consent_document set fields = '{}' where id = $1`, [X2.id], /fixed/);
await refused(paperSql, paperRow(scan, { snapshot: snapP }), /already agreed/);
ok('paper: refused before the print, printed once, without a scan, with a scan from before the print, with a snapshot of nothing; then saved with the hashes the caller passed replaced by the database’s (= sha256Hex and sealHex with "paper <day> <scan>"); a second agreement over a standing one refused');

// 11. Withdrawal, confirmation, capacity, re-signing, overrides
{
  await refused(`insert into consent_withdrawal (clinic_id, signing_id, told_by_name, how, recorded_by) values ($1, $2, 'Tessa', 'phone', $3)`,
    [A, signings.find((s) => s.document_id === F1.id).id, OWNER], /latest agreement/);
  await refused(`insert into consent_withdrawal (clinic_id, signing_id, told_by_name, how, recorded_by) values ($1, $2, 'Tessa', 'phone', $3)`, [A, paper.id, NOREC], /may edit records/);
  await app(`insert into consent_withdrawal (clinic_id, signing_id, told_by_name, how, recorded_by) values ($1, $2, 'Tessa Intaketest', 'phone', $3)`, [A, paper.id, OWNER]);
  assert.equal((await app1(`select consent_document_state($1) as s`, [X2.id])).s, 'withdrawn');
  await refused(`insert into consent_withdrawal (clinic_id, signing_id, told_by_name, how, recorded_by) values ($1, $2, 'Tessa', 'phone', $3)`, [A, paper.id, OWNER], /duplicate|unique/);
  await refused(`insert into consent_confirmation (clinic_id, signing_id, kind, staff_id) values ($1, $2, 'witness', $3)`, [A, paper.id, OWNER], /does not need that/);
  // Capacity: a treating dentist with a licence, about an adult with a birth date.
  await refused(`insert into capacity_note (clinic_id, patient_id, dentist_id, reason) values ($1, $2, $3, 'Cannot decide')`, [A, PA, NOPRC], /PRC licence/);
  await refused(`insert into capacity_note (clinic_id, patient_id, dentist_id, reason) values ($1, $2, $3, 'Cannot decide')`, [A, PM, HAZEL.id], /only for an adult/);
  await app(`insert into capacity_note (clinic_id, patient_id, dentist_id, reason) values ($1, $2, $3, 'Cannot decide for themself today')`, [A, PA, HAZEL.id]);
  // Overrides: a reason, someone who may edit records.
  await refused(`insert into consent_override (clinic_id, document_id, context, state_then, reason, staff_id) values ($1, $2, 'plan_done', 'withdrawn', ' ', $3)`, [A, X2.id, OWNER], /check/);
  await refused(`insert into consent_override (clinic_id, document_id, context, state_then, reason, staff_id) values ($1, $2, 'plan_done', 'withdrawn', 'Asked', $3)`, [A, X2.id, NOREC], /may edit records/);
  await app(`insert into consent_override (clinic_id, document_id, context, state_then, reason, staff_id) values ($1, $2, 'plan_done', 'withdrawn', 'Talked it through again', $3)`, [A, X2.id, OWNER]);
  ok('withdrawal only of the latest agreement, once, by someone who may edit records ("withdrawn" after); a confirmation the signing does not need refused; a capacity note only by a licensed treating dentist about an adult; an override needs a reason and records.edit');
}

// 12. A patient on file, on the clinic tablet: marks and representatives, then a minor with a substitute
const TAB_SECRET = device();
const TAB = await app1(`insert into clinic_tablet (clinic_id, name, secret_sha256, created_by) values ($1, 'Tablet 1', $2, $3) returning id`, [A, TAB_SECRET, OWNER]);
async function tabletIntake(patient, versions) {
  const i = await app1(`insert into intake (clinic_id, ref, target, patient_id, form_version, created_by) values ($1, $2, 'existing', $3, 'intake-2026-10', $4) returning id`, [A, refOf('IN', 4), patient, OWNER]);
  const docs = [];
  for (const [ver, fields, dentist] of versions) docs.push(await doc(i.id, ver, { patient, fields, dentist }));
  const t = token();
  const l = await app1(`insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by) values ($1, $2, $3, 'tablet', $4, $5) returning claimed_at, device_sha256`, [t, A, i.id, TAB.id, OWNER]);
  assert.notEqual(l.claimed_at, null);
  assert.equal(l.device_sha256, TAB_SECRET);
  await app(`update intake set status = 'out', rev = rev + 1 where id = $1`, [i.id]);
  return { id: i.id, token: t, docs };
}
const poll = await app1(`select tablet_poll($1) as r`, [TAB_SECRET], null);
assert.equal(poll.r.status, 'ready');
const T2 = await tabletIntake(PA, [['treatment-2026-09', {}, null]]);
assert.equal((await app1(`select tablet_poll($1) as r`, [TAB_SECRET], null)).r.status, 'link');
assert.equal((await app1(`select tablet_poll($1) as r`, [device()], null)).r.status, 'unknown');
const vt = await app1(`select intake_view($1, $2) as v`, [T2.token, TAB_SECRET], null);
assert.equal(vt.v.status, 'open');
assert.equal(vt.v.patient.first_name, 'Tessa');
const G2 = { ...T2.docs[0] };
const tSnap = (d, decision, s) => snapshotText(renderDocument(TEMPLATES[d.version_id], d.fields, {
  langs: ['en'], minor: false, confirmed: false, clinic: { name: 'S', address: null, phone: null }, patient: { name: 'Tessa Intaketest', birth: '1990-05-06' },
  dentist: null, attested: null, language: 'English', decision, signer: s, read: { self: true }, explainedIn: 'English', date: today,
}), { document: d.id, ref: d.ref });
const MARK = { name: 'Tessa Intaketest', as: 'patient', method: 'mark', relation: null, authority: null, ground: null, note: null };
const REP = { name: 'Ramil Intaketest', as: 'guardian', method: 'sign', relation: 'Son', authority: 'representative', ground: null, note: null };
assert.equal(await call('intake_decide', [T2.token, TAB_SECRET, G2.id, 0, 'agreed', pageOf(REP), tSnap(G2, 'agreed', REP)]), 'saved', 'a representative with a capacity note (recorded above)');
assert.equal(await call('intake_decide', [T2.token, TAB_SECRET, G2.id, 0, 'agreed', pageOf(MARK), tSnap(G2, 'agreed', MARK)]), 'saved');
assert.equal(await call('intake_send', [T2.token, TAB_SECRET, nonce()]), 'added');
const markSig = await q1(`select * from consent_signing where intake_id = $1`, [T2.id]);
assert.equal(markSig.needs_confirm, 'witness');
assert.equal((await app1(`select consent_document_state($1) as s`, [G2.id])).s, 'to_confirm');
await refused(`insert into consent_confirmation (clinic_id, signing_id, kind, staff_id) values ($1, $2, 'authority', $3)`, [A, markSig.id, DESK], /does not need that/);
await refused(`insert into consent_confirmation (clinic_id, signing_id, kind, staff_id) values ($1, $2, 'witness', $3)`, [A, markSig.id, NOREC], /may edit records/);
await app(`insert into consent_confirmation (clinic_id, signing_id, kind, staff_id) values ($1, $2, 'witness', $3)`, [A, markSig.id, DESK]);
assert.equal((await app1(`select consent_document_state($1) as s`, [G2.id])).s, 'agreed');
assert.equal((await app1(`select status, added_as, decided_by from intake where id = $1`, [T2.id])).added_as, 'existing');
// A representative without a capacity note: another patient.
const PR = await mkPatient(A, 'Rico', 'Intaketest', '1950-01-01');
const T3 = await tabletIntake(PR, [['treatment-2026-09', {}, null]]);
const G3 = T3.docs[0];
const REP3 = { ...REP, name: 'Rina Intaketest' };
assert.equal(await call('intake_decide', [T3.token, TAB_SECRET, G3.id, 0, 'agreed', pageOf(REP3), snapshotText(renderDocument(TEMPLATES[G3.version_id], G3.fields, {
  langs: ['en'], minor: false, confirmed: false, clinic: { name: 'S', address: null, phone: null }, patient: { name: 'Rico Intaketest', birth: '1950-01-01' }, dentist: null, attested: null,
  language: 'English', decision: 'agreed', signer: REP3, read: { self: true }, explainedIn: 'English', date: today }), { document: G3.id, ref: G3.ref })]), 'invalid');
// A minor, on the tablet: never as the patient; a substitute needs a ground, a category and 21 or over.
const T4 = await tabletIntake(PM, [['treatment-2026-09', {}, null]]);
const G4 = T4.docs[0];
const mSnap = (s) => snapshotText(renderDocument(TEMPLATES[G4.version_id], G4.fields, {
  langs: ['en'], minor: true, confirmed: false, clinic: { name: 'S', address: null, phone: null }, patient: { name: 'Nico Intaketest', birth: '2014-02-03' }, dentist: null, attested: null,
  language: 'English', decision: 'agreed', signer: s, read: { self: true }, explainedIn: 'English', date: today }), { document: G4.id, ref: G4.ref });
const decide4 = (s, more) => call('intake_decide', [T4.token, TAB_SECRET, G4.id, 0, 'agreed', pageOf(s, more), mSnap(s)]);
assert.equal(await decide4({ ...ME, name: 'Nico Intaketest' }), 'invalid', 'a minor as the patient');
const SUB = { name: 'Lorna Intaketest', as: 'guardian', method: 'sign', relation: 'Aunt', authority: 'substitute', ground: null, note: 'custodian_21' };
assert.equal(await decide4(SUB), 'invalid', 'no ground');
assert.equal(await decide4({ ...SUB, ground: 'absent' }), 'invalid', 'not 21 or over');
assert.equal(await decide4({ ...SUB, ground: 'absent' }, { over21: true }), 'saved');
assert.equal(await call('intake_send', [T4.token, TAB_SECRET, nonce()]), 'added');
assert.equal((await q1(`select needs_confirm from consent_signing where intake_id = $1`, [T4.id])).needs_confirm, 'authority');
ok('clinic tablet: "ready", then its link; an unknown secret "unknown"; the tablet’s link is made claimed with its secret; a patient on file opens without a birth date on the clinic device; a mark (needs a witness: "to confirm" until a staff member other than the signer confirms it) and a representative with a capacity note sign; without one, refused; a minor never signs as the patient, a substitute needs a ground and 21 or over (needs its papers checked)');

// 13. A patient on file on a phone: nothing before the birth date; three misses lock it; expiry and idle; replaced
{
  const i = await app1(`insert into intake (clinic_id, ref, target, patient_id, form_version, created_by) values ($1, $2, 'existing', $3, 'intake-2026-10', $4) returning id`, [A, refOf('IN', 4), PA, OWNER]);
  await doc(i.id, 'treatment-2026-09', { patient: PA });
  const t = token(), d = device();
  await app(`insert into intake_link (token, clinic_id, intake_id, device, created_by) values ($1, $2, $3, 'phone', $4)`, [t, A, i.id, OWNER]);
  await app(`update intake set status = 'out', rev = rev + 1 where id = $1`, [i.id]);
  assert.equal(await call('intake_claim', [t, d]), 'verify');
  const vv = await app1(`select intake_view($1, $2) as v`, [t, d], null);
  assert.equal(vv.v.status, 'verify');
  assert.equal(vv.v.patient, undefined);
  assert.equal(vv.v.pages, undefined);
  assert.equal(await call('intake_verify', [t, d, '1990-05-07']), 'wrong');
  assert.equal(await call('intake_verify', [t, d, 'not a date']), 'wrong');
  assert.equal(await call('intake_verify', [t, d, '1990-13-45']), 'locked');
  assert.equal((await app1(`select intake_view($1, $2) as v`, [t, d], null)).v.status, 'locked');
  // A new code gives three new tries; the right date opens it.
  await app(`update intake_link set retired_at = now(), retired_why = 'replaced' where intake_id = $1 and retired_at is null`, [i.id]);
  const t2 = token();
  await app(`insert into intake_link (token, clinic_id, intake_id, device, created_by) values ($1, $2, $3, 'phone', $4)`, [t2, A, i.id, OWNER]);
  assert.equal((await q1(`select id_tries from intake where id = $1`, [i.id])).id_tries, 0);
  assert.equal(await call('intake_claim', [t2, d]), 'verify');
  assert.equal(await call('intake_verify', [t2, d, '1990-05-06']), 'open');
  assert.equal((await app1(`select intake_view($1, $2) as v`, [t2, d], null)).v.patient.first_name, 'Tessa');
  assert.equal(await call('intake_ping', [t, d]), 'locked');
  // Idle: 21 minutes unseen. Expired: a phone link unclaimed past its 15 minutes.
  await c.query(`update intake_link set last_seen_at = now() - interval '21 minutes' where token = $1`, [t2]);
  assert.equal(await call('intake_ping', [t2, d]), 'idle');
  const t3 = token();
  await app(`insert into intake_link (token, clinic_id, intake_id, device, created_by) values ($1, $2, $3, 'phone', $4)`, [t3, A, i.id, OWNER]);
  await c.query(`alter table intake_link disable trigger intake_link_guard`);
  await c.query(`update intake_link set open_by = now() - interval '1 minute' where token = $1`, [t3]);
  await c.query(`alter table intake_link enable trigger intake_link_guard`);
  assert.equal((await app1(`select intake_view($1, null) as v`, [t3], null)).v.status, 'expired');
  assert.equal((await q1(`select retired_why from intake_link where token = $1`, [t3])).retired_why, 'expired');
  assert.equal((await app1(`select intake_view($1, null) as v`, [t], null)).v.status, 'locked');
  ok('patient on file, phone: claimed → "verify", nothing about the patient drawn; two misses "wrong", the third "locked" (link retired, stays locked); a new code resets the tries and the right birth date opens it; 21 minutes unseen "idle"; unclaimed past 15 minutes "expired"; each retired in the database');
}

// 14. The definers never raise: junk in, a status word out
{
  // (A NUL byte cannot be sent as text at all: the driver refuses it before any function runs, so it is not here.)
  const junk = [null, '', 'x', 'A'.repeat(5000), '\u202e\u200b', "'; drop table intake; --", token()];
  const jsonJunk = [null, '[]', '{"a":', '"str"', JSON.stringify({ v: 'x'.repeat(30000) })];
  let calls = 0;
  const tryCall = async (fn, args) => {
    calls++;
    try { await app(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args, null); }
    catch (e) { throw new Error(`${fn} raised ${e.code}: ${e.message.slice(0, 80)}`); }
  };
  for (const a of junk) for (const b of [null, 'x', DEV1]) {
    await tryCall('intake_view', [a, b]); await tryCall('intake_claim', [a, b]); await tryCall('intake_ping', [a, b]);
    await tryCall('intake_verify', [a, b, a]); await tryCall('tablet_poll', [a]);
    await tryCall('intake_send', [a, b, a]);
    for (const j of jsonJunk) {
      try { await tryCall('intake_save_page1', [a, b, 'you', j]); } catch (e) { if (!/invalid input syntax for type json/.test(e.message)) throw e; }
    }
    await tryCall('intake_mark_page', [a, b, '00000000-0000-0000-0000-000000000000', 0, a]);
    await tryCall('intake_decide', [a, b, '00000000-0000-0000-0000-000000000000', 0, a, '{}', a]);
  }
  // On a live link: a signer name of 500 characters, an initials box of 9, a 70 KB snapshot, a relation of 90: words, not errors.
  const i = await app1(`insert into intake (clinic_id, ref, target, patient_id, form_version, created_by) values ($1, $2, 'existing', $3, 'intake-2026-10', $4) returning id`, [A, refOf('IN', 4), PR, OWNER]);
  const g = await doc(i.id, 'treatment-2026-09', { patient: PR });
  const t = token();
  await app(`insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by) values ($1, $2, $3, 'tablet', $4, $5)`, [t, A, i.id, TAB.id, OWNER]);
  await app(`update intake set status = 'out', rev = rev + 1 where id = $1`, [i.id]);
  const long = { ...ME, name: 'R'.repeat(500) };
  for (const [page, snap] of [[pageOf(long), '{}'], [pageOf({ ...ME, name: 'Rico Intaketest' }, { initials: 'ABCDEFGHI' }), '{}'], [pageOf({ ...REP, relation: 'x'.repeat(90) }), '{}'], [pageOf(), 'x'.repeat(70000)]]) {
    assert.equal(await call('intake_decide', [t, TAB_SECRET, g.id, 0, 'agreed', page, snap]), 'invalid');
  }
  ok(`definers: ${calls} calls with junk tokens, devices, dates, JSON and ids answer a status word, never an error; on a live link an overlong name, initials, relation or snapshot is "invalid" (the failing row never reaches an error message)`);
}

// 15. Events hold no answers; the record functions
{
  const details = (await q(`select distinct kind, detail from intake_event where intake_id = any($1::uuid[])`, [[I1.id, T2.id, T4.id]]));
  const allowed = new Set([null, 'birth date matched', 'details changed', 'form changed', 'whitening: under 18', 'at send', 'later', 'agreed', 'refused', 'patient', 'parent', 'court_guardian', 'none']);
  for (const e of details) assert.ok(allowed.has(e.detail), `event detail "${e.detail}"`);
  // visit_treatment_consented: a visit's general consent form, agreed.
  const appt = (await q1(`insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, status) values ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 30 minutes', 'booked') returning id`, [A, PA, HAZEL.id])).id;
  assert.equal((await app1(`select visit_treatment_consented($1) as v`, [appt])).v, false);
  const i = await app1(`insert into intake (clinic_id, ref, target, patient_id, appointment_id, form_version, created_by) values ($1, $2, 'existing', $3, $4, 'intake-2026-10', $5) returning id`, [A, refOf('IN', 4), PA, appt, OWNER]);
  const gd = await app1(`insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, appointment_id, sort, prepared_by) values ($1, $2, 'treatment-2026-09', $3, $4, $5, 10, $6) returning *`, [A, refOf('CF', 5), i.id, PA, appt, OWNER]);
  await refused(`insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, appointment_id, sort, prepared_by) values ($1, $2, 'treatment-2026-09', $3, $4, $5, 10, $6)`, [A, refOf('CF', 5), i.id, PM, appt, OWNER], /visit is not this patient/);
  const t = token();
  await app(`insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by) values ($1, $2, $3, 'tablet', $4, $5)`, [t, A, i.id, TAB.id, OWNER]);
  await app(`update intake set status = 'out', rev = rev + 1 where id = $1`, [i.id]);
  const s = { ...ME, name: 'Tessa Intaketest' };
  assert.equal(await call('intake_decide', [t, TAB_SECRET, gd.id, 0, 'agreed', pageOf(s), snapshotText(renderDocument(TEMPLATES[gd.version_id], gd.fields, {
    langs: ['en'], minor: false, confirmed: false, clinic: { name: 'S', address: null, phone: null }, patient: { name: 'Tessa Intaketest', birth: '1990-05-06' }, dentist: null,
    attested: null, language: 'English', decision: 'agreed', signer: s, read: { self: true }, explainedIn: 'English', date: today }), { document: gd.id, ref: gd.ref })]), 'saved');
  assert.equal(await call('intake_send', [t, TAB_SECRET, nonce()]), 'added');
  assert.equal((await app1(`select visit_treatment_consented($1) as v`, [appt])).v, true);
  ok('events: every detail is a fixed word, never an answer; a form for another patient’s visit refused; visit_treatment_consented false, then true once the visit’s general consent form is agreed on the tablet');
}

// 16. The chain, tampered with as a superuser
await asOwner(async () => {
  const s = signings.find((x) => x.document_id === X1.id);
  await c.query(`update consent_signing set snapshot = snapshot || ' ' where id = $1`, [s.id]);
  const vr = await verifySigning({ query: (s2, p) => app(s2, p).then((rows) => ({ rows })) }, s.id);
  assert.deepEqual(vr, { snapshotOk: false, sealOk: false, chainOk: false });
  const link = (await q1(`select seq from consent_chain where signing_id = $1`, [s.id])).seq;
  const chk = await app1(`select * from consent_chain_check($1)`, [A]);
  assert.equal(chk.ok, false);
  assert.equal(chk.first_bad, link);
  ok(`tamper: one stored snapshot edited as a superuser → verifySigning all false; consent_chain_check red from link ${link} on`);
});

// 17. Retention: exactly the fixtures, and texts still go when the intake block fails
{
  const mk = async (status, age, opts = {}) => {
    const i = await q1(`insert into intake (clinic_id, ref, target, form_version, created_by, answers) values ($1, $2, 'new', 'intake-2026-10', $3, $4) returning id`,
      [A, refOf('IN', 4), OWNER, JSON.stringify(opts.answers ?? { first_name: 'Zed', last_name: `Purge${randomInt(1e6)}`, birth_date: '1980-01-01', mobile: '09179990000' })]);
    const set = { preparing: `status = 'preparing'`, out: `status = 'out'`, cancelled: `status = 'cancelled', cancelled_at = now()`, sent: `status = 'sent', sent_at = now() - interval '${age}'`, added: `status = 'added'` }[status];
    if (opts.signed) {
      const d = (await q1(`insert into consent_document (clinic_id, ref, version_id, intake_id, sort, prepared_by) values ($1, $2, 'treatment-2026-09', $3, 10, $4) returning id`, [A, refOf('CF', 5), i.id, OWNER]));
      await c.query(`alter table consent_signing disable trigger consent_signing_check`);
      await c.query(`insert into consent_signing (clinic_id, document_id, intake_id, decision, channel, snapshot, snapshot_sha256, seal_sha256, signed_by_name, signed_as, strokes, decided_at)
                     values ($1, $2, $3, 'agreed', 'phone', '{}', $4, $4, 'Zed Purge', 'patient', $5, now())`, [A, d.id, i.id, 'c'.repeat(64), JSON.stringify(STROKES)]);
      await c.query(`alter table consent_signing enable trigger consent_signing_check`);
      if (opts.onRecord) await c.query(`update consent_document set patient_id = $2 where id = $1`, [d.id, PA]);
      i.doc = d.id;
    }
    await c.query(`alter table intake disable trigger intake_guard`);
    await c.query(`update intake set ${set}, created_at = now() - interval '${age}' ${opts.appt ? `, appointment_id = '${opts.appt}'` : ''} ${status === 'added' ? `, sent_at = now(), patient_id = '${PA}', decided_at = now(), added_as = 'new'` : ''} where id = $1`, [i.id]);
    await c.query(`alter table intake enable trigger intake_guard`);
    await c.query(`insert into intake_event (clinic_id, intake_id, kind) values ($1, $2, 'started')`, [A, i.id]);
    return i;
  };
  const appt = (await q1(`insert into appointment (clinic_id, patient_id, starts_at, ends_at, status) values ($1, $2, now(), now() + interval '30 minutes', 'booked') returning id`, [A, PA])).id;
  const f = {
    prep25: await mk('preparing', '25 hours'), out23: await mk('out', '23 hours'), cancelled25: await mk('cancelled', '25 hours'),
    sent31bare: await mk('sent', '31 days'), sent31unmatched: await mk('sent', '31 days', { signed: true }),
    sent31lookalike: await mk('sent', '31 days', { signed: true, answers: { first_name: 'tessa', last_name: 'INTAKETEST', birth_date: '1990-05-06', mobile: '0' } }),
    sent31mobile: await mk('sent', '31 days', { signed: true, answers: { first_name: 'Other', last_name: 'Name', birth_date: '2000-01-01', mobile: '09170000401' } }),
    sent31visit: await mk('sent', '31 days', { signed: true, appt }), sent29: await mk('sent', '29 days', { signed: true }),
    added40: await mk('added', '40 days'), cancelledOnRecord: await mk('cancelled', '25 hours', { signed: true, onRecord: true }),
  };
  await c.query(`insert into message_log (clinic_id, channel, direction, to_address, body, kind, status, created_at) values ($1, 'sms', 'out', '09170000000', 'old', 'custom', 'sent', now() - interval '2 years 1 day')`, [A]);
  const texts = Number((await q1(`select count(*) as n from message_log where created_at < now() - interval '2 years'`)).n);
  const forms = Number((await q1(`select count(*) as n from patient_form where status <> 'added' and submitted_at < now() - interval '30 days'`)).n);
  const n = (await app1(`select retention_purge() as n`, [], null)).n;
  const gone = Object.fromEntries(await Promise.all(Object.entries(f).map(async ([k, i]) => [k, !(await q1(`select 1 as x from intake where id = $1`, [i.id]))])));
  assert.deepEqual(gone, {
    prep25: true, out23: false, cancelled25: true, sent31bare: true, sent31unmatched: true, sent31lookalike: false, sent31mobile: false, sent31visit: false,
    sent29: false, added40: false, cancelledOnRecord: true,
  });
  assert.equal(n, texts + forms + 5, `retention_purge() returned ${n}`);
  assert.equal((await q1(`select count(*)::int as n from consent_document where id = $1`, [f.sent31unmatched.doc])).n, 0, 'a purged intake’s form with no patient goes');
  const kept = await q1(`select intake_id from consent_document where id = $1`, [f.cancelledOnRecord.doc]);
  assert.equal(kept.intake_id, null, 'a form on a record stays, its intake cleared');
  assert.equal((await q1(`select count(*)::int as n from consent_signing where document_id = $1`, [f.cancelledOnRecord.doc])).n, 1);
  assert.equal((await q1(`select count(*)::int as n from intake_event where intake_id = $1`, [f.prep25.id])).n, 0);
  // The intake block fails: texts still go, and the warning names no row.
  await asOwner(async () => {
    await c.query(`create function pg_temp.no_delete() returns trigger language plpgsql as $$ begin raise exception 'blocked'; end $$`);
    await c.query(`create trigger no_delete before delete on intake for each row execute function pg_temp.no_delete()`);
    await c.query(`insert into message_log (clinic_id, channel, direction, to_address, body, kind, status, created_at) values ($1, 'sms', 'out', '09170000000', 'old', 'custom', 'sent', now() - interval '3 years')`, [A]);
    const texts2 = Number((await q1(`select count(*) as n from message_log where created_at < now() - interval '2 years'`)).n);
    await mk('preparing', '30 hours');
    const warnings = [];
    c.on('notice', (m) => warnings.push(m.message));
    const n2 = (await q1(`select retention_purge() as n`)).n;
    c.removeAllListeners('notice');
    assert.equal(n2, texts2);
    assert.equal(Number((await q1(`select count(*) as n from message_log where created_at < now() - interval '2 years'`)).n), 0);
    assert.ok(warnings.some((w) => /intakes were not purged this pass \(P0001\)/.test(w)), JSON.stringify(warnings));
  });
  ok(`retention: ${n} rows (texts ${texts} + forms ${forms} + 5 intakes): preparing/cancelled past 24 h and sent past 30 days go; held (a look-alike by name and birth date, or by mobile, or a visit), 23 h, 29 days and added stay; a purged form without a patient goes with its signing; a form on a record stays with its intake cleared; with the intake block failing, texts still go and the warning names only the error code`);
}

await c.query('rollback');

// ---------------------------------------------------------------------------------------------------------
// Part B: two connections at once (committed, then deleted). The general consent only: in force without moving dates.
// ---------------------------------------------------------------------------------------------------------
{
  const made = { intakes: [], patients: [], tablet: null };
  const b1 = await connect(), b2 = await connect();
  const asApp = async (cl, sql, p = []) => { await cl.query('begin'); await cl.query('set local role flossify_app'); await cl.query(`select set_config('app.clinic_id', $1, true)`, [A]); const r = await cl.query(sql, p); await cl.query('commit'); return r.rows; };
  try {
    const tabSecret = device();
    made.tablet = (await asApp(c, `insert into clinic_tablet (clinic_id, name, secret_sha256, created_by) values ($1, 'Race tablet', $2, $3) returning id`, [A, tabSecret, OWNER]))[0].id;
    const ready = async () => {
      const pid = (await c.query(`insert into patient (clinic_id, chart_no, first_name, last_name, birth_date) values ($1, $2, 'Race', 'Intaketest', '1980-02-02') returning id`, [A, `T-${randomInt(1e8)}`])).rows[0].id;
      made.patients.push(pid);
      const i = (await asApp(c, `insert into intake (clinic_id, ref, target, patient_id, form_version, created_by) values ($1, $2, 'existing', $3, 'intake-2026-10', $4) returning id`, [A, refOf('IN', 4), pid, OWNER]))[0];
      made.intakes.push(i.id);
      const d = (await asApp(c, `insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, sort, prepared_by) values ($1, $2, 'treatment-2026-09', $3, $4, 10, $5) returning *`, [A, refOf('CF', 5), i.id, pid, OWNER]))[0];
      const t = token();
      await asApp(c, `insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by) values ($1, $2, $3, 'tablet', $4, $5)`, [t, A, i.id, made.tablet, OWNER]);
      await asApp(c, `update intake set status = 'out', rev = rev + 1 where id = $1`, [i.id]);
      const s = { ...ME, name: 'Race Intaketest' };
      const snap = snapshotText(renderDocument(TEMPLATES[d.version_id], d.fields, { langs: ['en'], minor: false, confirmed: false, clinic: { name: 'S', address: null, phone: null },
        patient: { name: 'Race Intaketest', birth: '1980-02-02' }, dentist: null, attested: null, language: 'English', decision: 'agreed', signer: s, read: { self: true }, explainedIn: 'English', date: today }),
      { document: d.id, ref: d.ref });
      const r = (await asApp(c, `select intake_decide($1, $2, $3, 0, 'agreed', $4, $5) as r`, [t, tabSecret, d.id, pageOf(s), snap]))[0].r;
      assert.equal(r, 'saved');
      return { i: i.id, t, d: d.id };
    };
    // Two Sends at once, different nonces: one set of signings; the other is told it is finished.
    const r1 = await ready();
    const [s1, s2] = await Promise.all([asApp(b1, `select intake_send($1, $2, $3) as r`, [r1.t, tabSecret, nonce()]), asApp(b2, `select intake_send($1, $2, $3) as r`, [r1.t, tabSecret, nonce()])]);
    assert.deepEqual([s1[0].r, s2[0].r].sort(), ['added', 'finished']);
    assert.equal(Number((await c.query(`select count(*) as n from consent_signing where intake_id = $1`, [r1.i])).rows[0].n), 1);
    // Send against the desk's Stop: the intake is locked first by both; whichever is second sees the first's result.
    for (const order of ['stop-first', 'send-first']) {
      const r2 = await ready();
      await b1.query('begin'); await b1.query('set local role flossify_app'); await b1.query(`select set_config('app.clinic_id', $1, true)`, [A]);
      if (order === 'stop-first') {
        await b1.query(`select id from intake where id = $1 for update`, [r2.i]);
        await b1.query(`select token from intake_link where intake_id = $1 and retired_at is null for update`, [r2.i]);
        const send = asApp(b2, `select intake_send($1, $2, $3) as r`, [r2.t, tabSecret, nonce()]);
        await new Promise((res) => setTimeout(res, 300));
        await b1.query(`update intake_link set retired_at = now(), retired_why = 'stopped' where intake_id = $1 and retired_at is null`, [r2.i]);
        await b1.query(`update intake set status = 'preparing', rev = rev + 1 where id = $1`, [r2.i]);
        await b1.query('commit');
        assert.equal((await send)[0].r, 'closed');
        assert.equal((await c.query(`select status from intake where id = $1`, [r2.i])).rows[0].status, 'preparing');
        assert.equal(Number((await c.query(`select count(*) as n from consent_signing where intake_id = $1`, [r2.i])).rows[0].n), 0);
      } else {
        await b2.query('begin'); await b2.query('set local role flossify_app'); await b2.query(`select set_config('app.clinic_id', $1, true)`, [A]);
        const sent = (await b2.query(`select intake_send($1, $2, $3) as r`, [r2.t, tabSecret, nonce()])).rows[0].r;
        const stop = b1.query(`select id from intake where id = $1 for update`, [r2.i]);
        await new Promise((res) => setTimeout(res, 300));
        await b2.query('commit');
        await stop;
        const now = (await b1.query(`select status from intake where id = $1`, [r2.i])).rows[0].status;
        await b1.query('rollback');
        assert.equal(sent, 'added');
        assert.equal(now, 'added');
      }
    }
    ok('races (committed, two connections): two Sends with different nonces → one "added", one "finished", one signing; the desk’s Stop holding the intake → the waiting Send answers "closed" and writes nothing; a Send holding it → the desk then sees it added. No deadlock either way');
  } finally {
    await b1.end().catch(() => {}); await b2.end().catch(() => {});
    // Clean up as the owner: chain links, signings, pages, documents, links, events, intakes, patients, the tablet.
    const ids = made.intakes;
    await c.query(`delete from consent_chain where signing_id in (select id from consent_signing where intake_id = any($1::uuid[]))`, [ids]);
    await c.query(`delete from consent_signing where intake_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from intake_page where intake_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from intake_event where intake_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from consent_document where intake_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from intake_link where intake_id = any($1::uuid[])`, [ids]);
    await c.query(`delete from intake where id = any($1::uuid[])`, [ids]);
    await c.query(`delete from patient where id = any($1::uuid[])`, [made.patients]);
    if (made.tablet) await c.query(`delete from clinic_tablet where id = $1`, [made.tablet]);
    await c.query(`delete from audit_log where entity_id = any($1::uuid[])`, [[...ids, ...made.patients]]);
  }
}

const left = (await c.query(`select (select count(*) from intake) + (select count(*) from consent_document) + (select count(*) from consent_signing) + (select count(*) from consent_chain) + (select count(*) from clinic_tablet) as n`)).rows[0].n;
console.log(`\nall ${step} checks passed · rows left behind: ${left}`);
await c.end();
