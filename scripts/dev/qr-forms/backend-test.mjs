// The patient forms backend, end to end, on the throwaway test database flossify_qr ONLY.
//
//   node --import ./ts-resolve.mjs backend-test.mjs            (from this folder)
//
// The app side runs as flossify_app (row-level security applies) through the real
// libs: src/lib/patient-forms.ts → db.ts / throttle.ts / import.ts / health.ts.
// A second connection as the database owner is used only to backdate rows for the
// purge, to check what the app cannot see, and to clean up what this run made.
// Refuses to run against any database but flossify_qr.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

const REPO = '/Users/michaelkennethbrillantes/flossify-qr';
const DB = 'flossify_qr';

// The app's connection: the repo's DATABASE_URL (flossify_app, the dev password), pointed at flossify_qr.
const envUrl = /^DATABASE_URL=(.+)$/m.exec(readFileSync(`${REPO}/.env`, 'utf8'))?.[1]?.trim();
if (!envUrl) throw new Error('no DATABASE_URL in .env');
const appUrl = new URL(envUrl);
appUrl.pathname = `/${DB}`;
if (!['localhost', '127.0.0.1'].includes(appUrl.hostname)) throw new Error('refusing: not a local database');
process.env.DATABASE_URL = appUrl.href;

const pg = (await import(`${REPO}/node_modules/pg/lib/index.js`)).default;
const owner = new pg.Client({ database: DB });
await owner.connect();
const lib = await import(`${REPO}/src/lib/patient-forms.ts`);
const { pool, withClinic } = await import(`${REPO}/src/lib/db.ts`);

let step = 0;
const ok = (what) => console.log(`  ok ${String(++step).padStart(2)}  ${what}`);
const q1 = async (sql, p = []) => (await owner.query(sql, p)).rows[0];

// --- guards ---------------------------------------------------------------------------
assert.equal((await q1('select current_database() as d')).d, DB);
const who = (await pool.query('select current_database() as d, current_user as u')).rows[0];
assert.deepEqual(who, { d: DB, u: 'flossify_app' });
console.log(`patient forms backend test — ${DB}, app as ${who.u}\n`);

const A = (await q1(`select id from clinic where slug = 'session-road'`)).id;
const B = (await q1(`select id from clinic where slug = 'burnham-smile'`)).id;
const staffA = (await q1(`select id from staff where email = 'liwayway.domingo@example.com'`)).id;
const deskA = (await q1(`select id from staff where email = 'rosa.desk@example.com'`)).id;
const staffB = (await q1(`select id from staff where email = 'carlo.buyagan@example.com'`)).id;

// This run's own people: random mobiles and a random surname, so a run never meets an earlier one.
const run = Math.random().toString(36).slice(2, 7);
const mobiles = [];
const mob = () => { const m = '09' + String(randomInt(100_000_000, 999_999_999)); mobiles.push(m); return m; };
const IP = `198.51.100.${randomInt(1, 254)}`;
const LAST = `Testrun${run[0].toUpperCase()}${run.slice(1)}`;
const adultMobile = mob(), minorMobile = mob(), parentMobile = mob();
const made = { forms: [], patients: [] };

/** A form post as the page would send it. */
function post(fields, door, extra = {}) {
  const fd = new FormData();
  fd.set(lib.NONCE_FIELD, extra.nonce ?? lib.newNonce());
  fd.set('treatment_version', door.consent.treatment.id);
  fd.set('privacy_version', door.consent.privacy.id);
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}
const adult = {
  first_name: 'Maria Clara', middle_name: 'Reyes', last_name: LAST, birth_date: '1988-04-12', sex: 'female', civil_status: 'married',
  occupation: 'Teacher', mobile: adultMobile.replace(/^(\d{4})(\d{3})/, '$1 $2 '), email: '', facebook: 'fb.com/maria.test',
  address: '12 Rizal St., Brgy. Holy Ghost', city: 'Baguio City', province: 'Benguet',
  emergency_name: 'Jose Test', emergency_relation: 'Husband', emergency_mobile: '0918 555 0199',
  good_health: 'yes', under_treatment: 'yes', treatment_detail: 'High blood pressure', serious_illness: 'no', hospitalised: 'no',
  takes_medicines: 'yes', medicines: 'Losartan 50 mg\nVitamin C', allergies: ['penicillin', 'other'], allergy_other: 'Mango, shrimp',
  smoke: 'no', alcohol_drugs: 'no', pregnant: 'no', nursing: 'no', birth_control: 'no', blood_type: 'O+', blood_pressure: '130/85',
  conditions: ['high_bp', 'asthma'], reason: 'Cleaning and a check-up', concerns: ['sensitivity', 'bleeding_gums'], nervous: 'little',
  last_visit: 'y1to2', previous_dentist: 'Dr. Santos, Session Road', philhealth: 'yes', philhealth_pin: '123456789012',
  hmo: 'maxicare', hmo_card_no: 'MX-0099-1234', hmo_company: 'Benguet Electric',
  consent_treatment: '1', consent_privacy: '1', signed_as: 'patient', signed_name: `Maria Clara ${LAST}`,
};
const minor = {
  first_name: 'Paolo', last_name: LAST, birth_date: '2015-03-10', sex: 'male', mobile: minorMobile,
  address: '12 Rizal St., Brgy. Holy Ghost', city: 'Baguio City', province: 'Benguet',
  emergency_name: 'Maria Clara Test', emergency_relation: 'Mother', emergency_mobile: parentMobile,
  good_health: 'yes', under_treatment: 'no', serious_illness: 'no', hospitalised: 'no', takes_medicines: 'no',
  allergies: ['none'], smoke: 'no', alcohol_drugs: 'no', conditions: ['none'], reason: 'Loose tooth', last_visit: 'never',
  consent_treatment: '1', consent_privacy: '1', signed_as: 'guardian', signed_name: `Maria Clara ${LAST}`,
};

try {
  // --- the key -------------------------------------------------------------------------
  const keyA = await withClinic(A, (tx) => lib.formsKey(tx, { clinicId: A, staffId: staffA }));
  const keyA2 = await withClinic(A, (tx) => lib.formsKey(tx, { clinicId: A, staffId: deskA }));
  const keyB = await withClinic(B, (tx) => lib.formsKey(tx, { clinicId: B, staffId: staffB }));
  assert.match(keyA.key, lib.KEY_SHAPE);
  assert.equal(keyA2.key, keyA.key);
  assert.notEqual(keyB.key, keyA.key);
  assert.equal(keyA.url, `https://flossify.ph/f/${keyA.key}/`);
  assert.equal(keyA.short, `flossify.ph/f/${keyA.key}`);
  ok(`formsKey: one live key per clinic, made on first ask and stable (A ${keyA.key}, B ${keyB.key}); url ${keyA.url}`);

  const door = await lib.lookupForms(keyA.key.toUpperCase() + ' ', IP);
  assert.equal(door.status, 'open');
  assert.equal(door.clinic.name, 'Session Road Dental');
  assert.equal(door.consent.privacy.id, 'privacy-2026-09');
  assert.equal(door.consent.treatment.id, 'treatment-2026-09');
  assert.ok(door.consent.treatment.points.length >= 5);
  ok(`lookupForms: open (typed in capitals with a space), clinic "${door.clinic.name}", consents ${door.consent.privacy.id} + ${door.consent.treatment.id}`);

  // --- reading the post ------------------------------------------------------------------
  const empty = lib.parsePatientForm(post({}, door), { versions: { privacy: door.consent.privacy.id, treatment: door.consent.treatment.id } });
  assert.equal(empty.ok, false);
  assert.equal(empty.step, 0);
  for (const f of ['first_name', 'last_name', 'birth_date', 'sex', 'mobile', 'address', 'emergency_name', 'good_health', 'allergies', 'conditions', 'reason', 'last_visit', 'consent_treatment', 'consent_privacy', 'signed_as', 'signed_name']) assert.ok(empty.errors[f], f);
  assert.equal(empty.errors.pregnant, undefined, 'pregnancy is not asked before sex is chosen');
  assert.equal(empty.errors.guardian_name, undefined, 'no guardian before a birth date says under 18');
  ok(`parse: an empty post → ${Object.keys(empty.errors).length} field errors, opens step 1; e.g. mobile: "${empty.errors.mobile}"`);

  const versions = { privacy: door.consent.privacy.id, treatment: door.consent.treatment.id };
  const noGuardian = lib.parsePatientForm(post({ ...minor, signed_as: 'patient' }, door), { versions });
  assert.equal(noGuardian.ok, false);
  assert.ok(noGuardian.errors.guardian_name && noGuardian.errors.guardian_mobile && noGuardian.errors.signed_as);
  ok(`parse: under 18 without a parent or guardian → guardian_* required, signed_as: "${noGuardian.errors.signed_as}"`);

  const odd = lib.parsePatientForm(post({ ...adult, mobile: '12345', email: 'not-an-email', allergies: ['none', 'latex'], philhealth_pin: '123', website: 'http://spam' }, door), { versions });
  assert.equal(odd.ok, false);
  assert.equal(odd.bot, true);
  assert.ok(odd.errors.mobile && odd.errors.email && odd.errors.allergies && odd.errors.philhealth_pin && odd.errors._form);
  assert.equal(odd.raw.website, undefined, 'the honeypot is not echoed');
  ok(`parse: bad mobile, email, "none" + an allergy, short PIN, honeypot filled → refused ("${odd.errors.allergies}")`);

  const stale = lib.parsePatientForm(post(adult, door), { versions: { privacy: 'privacy-2099-01', treatment: door.consent.treatment.id } });
  assert.equal(stale.ok, false);
  assert.ok(stale.errors.consent_privacy);
  assert.equal(stale.step, 4);
  ok('parse: a privacy notice changed since the page was drawn → the consent step, tick again');

  const pa = lib.parsePatientForm(post(adult, door), { versions });
  assert.equal(pa.ok, true, JSON.stringify(pa.errors));
  assert.equal(pa.value.mobile, adultMobile);
  assert.equal(pa.value.philhealth_pin, '12-345678901-2');
  assert.deepEqual(pa.value.medicines, ['Losartan 50 mg', 'Vitamin C']);
  assert.equal(pa.value.guardian_name, null);
  assert.equal(pa.value.consent_treatment, true);
  ok(`parse: the adult's form → typed value (mobile ${pa.value.mobile}, PIN ${pa.value.philhealth_pin}, medicines ${pa.value.medicines.join(' + ')})`);

  // --- the public submit through the definer function -------------------------------------
  const s1 = await lib.submitForms({ key: door.key, nonce: pa.nonce, value: pa.value, ip: IP });
  assert.equal(s1.kind, 'saved');
  assert.match(s1.ref, /^QR-[A-HJKMNP-Z2-9]{4}$/);
  const again = await lib.submitForms({ key: door.key, nonce: pa.nonce, value: pa.value, ip: IP });
  assert.deepEqual(again, { kind: 'again', ref: s1.ref, firstName: 'Maria Clara', signedAs: 'patient' });
  // The same nonce with other answers (a page from the history filled in for a sibling): not saved, not told the ref.
  const sibling = lib.parsePatientForm(post({ ...adult, first_name: 'Someoneelse', birth_date: '1990-02-02', signed_name: 'Someone Else' }, door, { nonce: pa.nonce }), { versions });
  assert.equal(sibling.ok, true, JSON.stringify(sibling.errors));
  const resend = await lib.submitForms({ key: door.key, nonce: sibling.nonce, value: sibling.value, ip: IP });
  assert.deepEqual(resend, { kind: 'resend' });
  assert.equal((await q1(`select count(*)::int as n from patient_form where nonce = $1`, [pa.nonce])).n, 1);
  assert.equal((await q1(`select count(*)::int as n from patient_form where first_name = 'Someoneelse' and last_name = $1`, [LAST])).n, 0);
  ok(`submit (adult): saved ${s1.ref}, "Thank you, ${s1.firstName}"; the same form again → 'again' (same ref, stored name); the same nonce with other answers → 'resend', nothing saved`);
  assert.deepEqual(lib.doneWords('Jericho', 'guardian'), { title: 'Thank you.', lead: 'Please tell the desk Jericho’s forms are in.' });
  assert.deepEqual(lib.doneWords('Andrea', 'patient'), { title: 'Thank you, Andrea.', lead: 'Please tell the desk your forms are in.' });

  const pm = lib.parsePatientForm(post({ ...minor, guardian_name: `Maria Clara ${LAST}`, guardian_relation: 'Mother', guardian_mobile: parentMobile }, door), { versions });
  assert.equal(pm.ok, true, JSON.stringify(pm.errors));
  const s2 = await lib.submitForms({ key: door.key, nonce: pm.nonce, value: pm.value, ip: IP });
  assert.equal(s2.kind, 'saved');
  ok(`submit (minor, signed by a parent): saved ${s2.ref}`);

  // The definer function checks again what the app checked: a crafted post.
  const crafted = async (patch) => (await pool.query('select status from patient_form_submit($1, $2, $3::jsonb)', [door.key, lib.newNonce(), JSON.stringify({ ...pm.value, ...patch })])).rows[0].status;
  assert.equal(await crafted({ signed_as: 'patient' }), 'invalid');
  assert.equal(await crafted({ guardian_name: null }), 'invalid');
  assert.equal(await crafted({ mobile: '12345' }), 'invalid');
  assert.equal(await crafted({ birth_date: '2015-02-30' }), 'invalid');
  assert.equal(await crafted({ consent_privacy: false }), 'invalid');
  assert.equal(await crafted({ treatment_version: 'treatment-1999-01' }), 'changed');
  assert.equal((await pool.query('select status from patient_form_submit($1, $2, $3::jsonb)', ['aaaaaaaaaa', lib.newNonce(), JSON.stringify(pm.value)])).rows[0].status, 'unknown');
  ok('definer: a minor signing for themselves, no guardian, a bad mobile, 30 Feb, no privacy tick → invalid; old wording → changed; no key → unknown');

  // --- row-level security -----------------------------------------------------------------
  const inA = await withClinic(A, (tx) => lib.listForms(tx, { status: 'all' }));
  const inB = await withClinic(B, (tx) => lib.listForms(tx, { status: 'all' }));
  const refs = [s1.ref, s2.ref];
  assert.deepEqual(refs.filter((r) => inA.some((f) => f.ref === r)), refs);
  assert.equal(inB.filter((f) => refs.includes(f.ref)).length, 0);
  const bare = (await pool.query('select count(*)::int as n from patient_form')).rows[0].n;
  assert.equal(bare, 0);
  const idA = inA.find((f) => f.ref === s1.ref).id;
  made.forms.push(idA, inA.find((f) => f.ref === s2.ref).id);
  assert.equal(await withClinic(B, (tx) => lib.getForm(tx, idA)), null);
  await assert.rejects(pool.query(`insert into patient_form (clinic_id, forms_key, ref, nonce, form_version, answers, first_name, last_name, birth_date, phone, signed_by_name, signed_as, privacy_version, treatment_version)
    values ($1, $2, 'QR-ZZZZ', 'xxxxxxxxxxxxxxxxxxxx', 'x', '{}', 'a', 'b', '2000-01-01', '09170000000', 'ab', 'patient', 'privacy-2026-09', 'treatment-2026-09')`, [A, keyA.key]), /permission denied/);
  await assert.rejects(withClinic(A, (tx) => tx.query(`update patient_form set answers = '{}' where id = $1`, [idA])), /permission denied/);
  ok(`RLS: clinic A sees its ${refs.length} forms, clinic B sees none of them (getForm → null), no tenant sees 0 rows; the app cannot insert a form or change answers`);

  const newA = await withClinic(A, lib.countNewForms);
  assert.ok(newA >= 2);
  assert.equal(await lib.newFormsWaiting(A), newA);
  const row1 = inA.find((f) => f.ref === s1.ref);
  assert.equal(row1.name, `Maria Clara Reyes ${LAST}`);
  assert.equal(row1.likely, 0);
  const sections = lib.answerSections((await withClinic(A, (tx) => lib.getForm(tx, idA))).values);
  const flagged = sections.flatMap((s) => s.sections.flatMap((x) => x.rows.filter((r) => r.flag).map((r) => r.label)));
  assert.ok(flagged.includes('Allergies') && flagged.includes('Conditions') && flagged.includes('Under treatment now'));
  ok(`queue: ${newA} new at A (countNewForms = newFormsWaiting); answerSections labels ${sections.reduce((n, s) => n + s.sections.reduce((m, x) => m + x.rows.length, 0), 0)} answers, flags ${flagged.join(', ')}`);

  // --- add as a new patient -------------------------------------------------------------
  const add1 = await withClinic(A, (tx) => lib.addAsNewPatient(tx, { clinicId: A, staffId: deskA, formId: idA, seen: [] }));
  assert.equal(add1.kind, 'added', JSON.stringify(add1));
  made.patients.push(add1.patientId);
  const p1 = await q1(`select * from patient where id = $1`, [add1.patientId]);
  assert.equal(p1.clinic_id, A);
  assert.equal(p1.phone, adultMobile);
  assert.equal(p1.first_name, 'Maria Clara');
  assert.equal(p1.hmo_name, 'Maxicare');
  assert.equal(p1.hmo_member_no, 'MX-0099-1234');
  assert.equal(p1.emergency_name, 'Jose Test');
  assert.equal(p1.occupation, 'Teacher');
  assert.equal(p1.guardian_name, null);
  const h1 = await q1(`select * from medical_history where patient_id = $1`, [add1.patientId]);
  assert.equal(h1.answered_by, 'patient');
  assert.equal(h1.recorded_by, null);
  assert.equal(h1.form_id, idA);
  assert.deepEqual(h1.allergies, ['Penicillin or antibiotics', 'Mango', 'Shrimp']);
  assert.deepEqual(h1.conditions, ['Hypertension', 'Asthma']);
  assert.deepEqual(h1.medications, ['Losartan 50 mg', 'Vitamin C']);
  assert.equal(h1.answers.form.ref, s1.ref);
  assert.equal(h1.answers.cards.philhealth_pin, '12-345678901-2');
  assert.equal(h1.answers.facebook, 'fb.com/maria.test');
  assert.equal(h1.answers.emergency.relation, 'Husband');
  const c1 = (await owner.query(`select version_id, channel, agreed_as, given_by_name, recorded_by, form_id from patient_consent where patient_id = $1 order by version_id`, [add1.patientId])).rows;
  assert.deepEqual(c1.map((c) => [c.version_id, c.channel, c.agreed_as, c.form_id === idA, c.recorded_by === deskA]), [
    ['privacy-2026-09', 'form', 'patient', true, true], ['treatment-2026-09', 'form', 'patient', true, true]]);
  const f1 = await q1(`select status, added_as, patient_id, decided_by from patient_form where id = $1`, [idA]);
  assert.deepEqual([f1.status, f1.added_as, f1.patient_id, f1.decided_by], ['added', 'new', add1.patientId, deskA]);
  ok(`addAsNewPatient: ${add1.chartNo} written — patient row (mobile, HMO, emergency, occupation), medical_history answered_by 'patient' (allergies ${h1.allergies.join(', ')}; conditions ${h1.conditions.join(', ')}), consents ${c1.map((c) => c.version_id).join(' + ')} via 'form'; form added`);

  const health = await withClinic(A, async (tx) => (await import(`${REPO}/src/lib/health.ts`)).readHealth(tx, add1.patientId));
  assert.equal(health.versions[0].answeredBy, 'patient');
  assert.equal(health.versions[0].formRef, s1.ref);
  const privacyOnly = await withClinic(A, async (tx) => (await import(`${REPO}/src/lib/health.ts`)).readConsents(tx, add1.patientId));
  assert.deepEqual(privacyOnly.map((c) => c.version_id), ['privacy-2026-09']);
  ok(`health.ts: readHealth says answeredBy 'patient', formRef ${s1.ref}; readConsents lists the privacy consent only (the treatment one is the form's)`);

  const gone = await withClinic(A, (tx) => lib.addAsNewPatient(tx, { clinicId: A, staffId: deskA, formId: idA }));
  assert.equal(gone.kind, 'gone');
  ok('addAsNewPatient again on the same form → gone, nothing written twice');

  // --- a second form, added to that existing patient -------------------------------------
  const second = { ...adult, email: 'maria.test@example.com', address: '45 Legarda Rd, Brgy. Bakakeng', allergies: ['latex'], allergy_other: '', takes_medicines: 'no', medicines: '', conditions: ['high_bp'] };
  const p2 = lib.parsePatientForm(post(second, door), { versions });
  assert.equal(p2.ok, true, JSON.stringify(p2.errors));
  const s3 = await lib.submitForms({ key: door.key, nonce: p2.nonce, value: p2.value, ip: IP });
  assert.equal(s3.kind, 'saved');
  const id3 = (await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === s3.ref).id;
  made.forms.push(id3);
  const matches = await withClinic(A, async (tx) => lib.likelyMatches(tx, (await lib.getForm(tx, id3)).values));
  assert.equal(matches[0].id, add1.patientId);
  assert.deepEqual([...matches[0].why].sort(), ['mobile', 'name-birth']);
  assert.deepEqual(matches[0].health.allergies, ['Penicillin or antibiotics', 'Mango', 'Shrimp']);
  const listed = (await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === s3.ref);
  assert.equal(listed.likely, 1);
  const ask = await withClinic(A, (tx) => lib.addAsNewPatient(tx, { clinicId: A, staffId: deskA, formId: id3, seen: [] }));
  assert.equal(ask.kind, 'matches');
  ok(`likelyMatches: ${s3.ref} → ${matches[0].chartNo} ${matches[0].name} (same mobile + same name and birth date); "Add as new" without having seen it → asks first`);

  // The email is only offered: unticked, it is not written (compareWithRecord says so first).
  const cmp2 = await withClinic(A, async (tx) => lib.compareWithRecord(tx, (await lib.getForm(tx, id3)).values, add1.patientId));
  assert.deepEqual(cmp2.fills, []);
  assert.deepEqual(cmp2.proposed.map((d) => d.field), ['email']);
  const add2 = await withClinic(A, (tx) => lib.addToPatient(tx, { clinicId: A, staffId: staffA, formId: id3, patientId: add1.patientId, use: ['email', 'first_name'] }));
  assert.equal(add2.kind, 'added', JSON.stringify(add2));
  assert.deepEqual(add2.filled, ['Email']);
  assert.deepEqual(add2.proposed, []);
  assert.deepEqual(add2.kept.map((k) => k.field), ['address_line']);
  assert.deepEqual(add2.allergiesKept, ['Penicillin or antibiotics', 'Mango', 'Shrimp']);
  assert.deepEqual(add2.conditionsKept, ['Asthma']);
  assert.deepEqual(add2.medicationsKept, ['Losartan 50 mg', 'Vitamin C']);
  assert.deepEqual(add2.consents, { privacy: 'already', treatment: 'already' });
  const hist = (await owner.query(`select answered_by, allergies, conditions, medications, form_id from medical_history where patient_id = $1 order by answered_at, id`, [add1.patientId])).rows;
  assert.equal(hist.length, 2);
  assert.deepEqual(hist[1].allergies, ['Latex', 'Penicillin or antibiotics', 'Mango', 'Shrimp']);
  assert.deepEqual(hist[1].conditions, ['Hypertension', 'Asthma']);
  assert.deepEqual(hist[1].medications, ['Losartan 50 mg', 'Vitamin C']);
  assert.equal(hist[1].form_id, id3);
  assert.equal((await q1(`select email from patient where id = $1`, [add1.patientId])).email, 'maria.test@example.com');
  assert.equal((await q1(`select address_line from patient where id = $1`, [add1.patientId])).address_line, '12 Rizal St., Brgy. Holy Ghost');
  assert.equal((await q1(`select count(*)::int as n from patient_consent where patient_id = $1`, [add1.patientId])).n, 2);
  const lines = await withClinic(A, (tx) => lib.patientForms(tx, add1.patientId));
  assert.deepEqual(lines.map((l) => [l.ref, l.addedAs, l.consents.length, l.consentState.privacy, l.consentState.treatment]),
    [[s3.ref, 'existing', 0, 'on-file', 'on-file'], [s1.ref, 'new', 2, 'form', 'form']]);
  ok(`addToPatient: ${s3.ref} → the same record: filled ${add2.filled.join(', ')} (ticked; unticked it is only proposed), kept ${add2.kept.map((k) => `${k.label} (form: ${k.onForm})`).join(', ')}; allergies, conditions (Asthma) and medicines on file kept; consents on file (consentState 'on-file'); patientForms lists both`);

  // "Use <the form's address>" on the record: one detail, from the stored form, audited.
  assert.equal(await withClinic(A, (tx) => lib.useFormDetail(tx, { clinicId: A, staffId: staffA, patientId: add1.patientId, formId: id3, field: 'first_name' })), 'gone');
  assert.equal(await withClinic(A, (tx) => lib.useFormDetail(tx, { clinicId: A, staffId: staffA, patientId: add1.patientId, formId: id3, field: 'birth_date' })), 'gone');
  assert.equal(await withClinic(B, (tx) => lib.useFormDetail(tx, { clinicId: B, staffId: staffB, patientId: add1.patientId, formId: id3, field: 'address_line' })), 'gone');
  assert.equal(await withClinic(A, (tx) => lib.useFormDetail(tx, { clinicId: A, staffId: staffA, patientId: add1.patientId, formId: id3, field: 'address_line' })), 'saved');
  assert.equal((await q1(`select address_line from patient where id = $1`, [add1.patientId])).address_line, '45 Legarda Rd, Brgy. Bakakeng');
  assert.equal(await withClinic(A, (tx) => lib.useFormDetail(tx, { clinicId: A, staffId: staffA, patientId: add1.patientId, formId: id3, field: 'address_line' })), 'same');
  ok('useFormDetail: the address from the form onto the record ("same" the second time); never a name or the birth date; another clinic cannot');

  // The desk typed a health version AFTER the form was sent, BEFORE adding it: the form's version is still the current one,
  // and what the desk's version lists stays in it (regression: answered_at was the sending time, so the desk's version won).
  const late = lib.parsePatientForm(post({ ...adult, first_name: 'Late', mobile: mob(), signed_name: 'Late Person', allergies: ['penicillin', 'other'], allergy_other: 'Shrimp',
    conditions: ['none'], takes_medicines: 'no', medicines: '' }, door), { versions });
  const sL = await lib.submitForms({ key: door.key, nonce: late.nonce, value: late.value, ip: IP });
  assert.equal(sL.kind, 'saved');
  const idL = (await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === sL.ref).id;
  made.forms.push(idL);
  await owner.query(`update patient_form set submitted_at = now() - interval '2 hours' where id = $1`, [idL]);
  const pL = (await q1(`insert into patient (clinic_id, chart_no, first_name, last_name, birth_date, created_by) values ($1, 'T-${run}', 'Late', $2, '1988-04-12', $3) returning id`, [A, LAST, staffA])).id;
  made.patients.push(pL);
  await owner.query(`insert into medical_history (clinic_id, patient_id, answered_at, answered_by, recorded_by, allergies, conditions, medications) values ($1, $2, now() - interval '1 hour', 'staff', $3, '{}', '{"Bleeding disorder"}', '{"Warfarin"}')`, [A, pL, deskA]);
  const addL = await withClinic(A, (tx) => lib.addToPatient(tx, { clinicId: A, staffId: deskA, formId: idL, patientId: pL }));
  assert.equal(addL.kind, 'added', JSON.stringify(addL));
  const hL = await withClinic(A, async (tx) => (await import(`${REPO}/src/lib/health.ts`)).readHealth(tx, pL));
  assert.equal(hL.versions[0].formRef, sL.ref);
  assert.deepEqual(hL.versions[0].allergies, ['Penicillin or antibiotics', 'Shrimp']);
  assert.deepEqual(hL.versions[0].conditions, ['Bleeding disorder']);
  assert.deepEqual(hL.versions[0].medications, ['Warfarin']);
  assert.ok(hL.versions[0].formSentAt && hL.versions[0].formSentAt < hL.versions[0].at);
  ok(`health: a desk version typed after ${sL.ref} was sent → the form's version is still current (allergies ${hL.versions[0].allergies.join(', ')}), and keeps the desk's Bleeding disorder and Warfarin; formSentAt before it`);

  // A patient on file whose birth date makes them a minor, and a form the patient signed: no consent is written, and the record says so.
  const pY = (await q1(`insert into patient (clinic_id, chart_no, first_name, last_name, birth_date, created_by) values ($1, 'Y-${run}', 'Young', $2, '2014-06-01', $3) returning id`, [A, LAST, staffA])).id;
  made.patients.push(pY);
  const yf = lib.parsePatientForm(post({ ...adult, first_name: 'Young', mobile: mob(), signed_name: 'Young Person' }, door), { versions });
  const sY = await lib.submitForms({ key: door.key, nonce: yf.nonce, value: yf.value, ip: IP });
  const idY = (await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === sY.ref).id;
  made.forms.push(idY);
  const addY = await withClinic(A, (tx) => lib.addToPatient(tx, { clinicId: A, staffId: deskA, formId: idY, patientId: pY }));
  assert.deepEqual(addY.consents, { privacy: 'minor', treatment: 'minor' });
  const lineY = (await withClinic(A, (tx) => lib.patientForms(tx, pY)))[0];
  assert.deepEqual(lineY.consentState, { privacy: 'none', treatment: 'none' });
  ok(`consents: a form signed by the patient, added to a record that makes them 14 → nothing written, and patientForms says 'none' (never "already on file")`);

  // --- the minor ------------------------------------------------------------------------
  const idM = made.forms[1];
  const addM = await withClinic(A, (tx) => lib.addAsNewPatient(tx, { clinicId: A, staffId: deskA, formId: idM, seen: [] }));
  assert.equal(addM.kind, 'added', JSON.stringify(addM));
  made.patients.push(addM.patientId);
  const pmRow = await q1(`select guardian_name, guardian_relation, guardian_phone, sex from patient where id = $1`, [addM.patientId]);
  assert.deepEqual(pmRow, { guardian_name: `Maria Clara ${LAST}`, guardian_relation: 'Mother', guardian_phone: parentMobile, sex: 'male' });
  const cM = (await owner.query(`select agreed_as, given_by_name from patient_consent where patient_id = $1`, [addM.patientId])).rows;
  assert.ok(cM.length === 2 && cM.every((c) => c.agreed_as === 'guardian' && c.given_by_name === `Maria Clara ${LAST}`));
  const hM = await q1(`select allergies, conditions, medications from medical_history where patient_id = $1`, [addM.patientId]);
  assert.deepEqual(hM, { allergies: [], conditions: [], medications: [] });
  ok(`minor: ${addM.chartNo} with guardian_* on the patient row, both consents agreed_as 'guardian' by the parent; "none" answers stored as empty lists`);

  // --- the form's own reading: invisible characters, a child's questions, the parent as emergency contact ----------
  const zw = lib.parsePatientForm(post({ ...adult, first_name: 'Mar\u200Bia\u202E', last_name: `\uFEFF${LAST}` }, door), { versions });
  assert.equal(zw.ok, true, JSON.stringify(zw.errors));
  assert.equal(zw.value.first_name, 'Maria');
  assert.equal(zw.value.last_name, LAST);
  const girl6 = { ...minor, first_name: 'Bea', sex: 'female', birth_date: '2020-05-01', guardian_name: 'Ana Test', guardian_relation: 'Mother', guardian_mobile: parentMobile, signed_name: 'Ana Test' };
  const g6 = lib.parsePatientForm(post(girl6, door), { versions });
  assert.equal(g6.ok, true, JSON.stringify(g6.errors));
  assert.deepEqual([g6.value.pregnant, g6.value.nursing, g6.value.birth_control, g6.value.civil_status, g6.value.occupation], [null, null, null, null, null]);
  const g14 = lib.parsePatientForm(post({ ...girl6, birth_date: '2012-01-15' }, door), { versions });
  assert.equal(g14.ok, false);
  assert.ok(g14.errors.pregnant && g14.errors.nursing && g14.errors.birth_control);
  const ge = lib.parsePatientForm(post({ ...girl6, emergency_name: '', emergency_relation: '', emergency_mobile: '', guardian_is_emergency: '1' }, door), { versions });
  assert.equal(ge.ok, true, JSON.stringify(ge.errors));
  assert.deepEqual([ge.value.emergency_name, ge.value.emergency_relation, ge.value.emergency_mobile, ge.value.guardian_is_emergency], ['Ana Test', 'Mother', parentMobile, true]);
  const adultCs = lib.parsePatientForm(post({ ...adult, guardian_is_emergency: '1', emergency_name: '' }, door), { versions });
  assert.equal(adultCs.ok, false);
  assert.ok(adultCs.errors.emergency_name, 'an adult still names an emergency contact');
  assert.equal(lib.answerText(lib.FIELDS.concerns, ['sensitivity', 'broken', 'pain']), 'Sensitive to hot, cold or sweet, a broken or chipped tooth, toothache or pain');
  assert.equal(lib.answerText(lib.FIELDS.conditions, ['asthma', 'hiv', 'tuberculosis']), 'Asthma, HIV or AIDS, tuberculosis (TB)');
  ok('parse: zero-width and direction characters dropped (Mar\u200Bia → Maria); a girl of 6 is not asked about pregnancy, civil status or work, one of 14 is; "the parent is the emergency contact" copies them; answers read as one sentence');

  // --- dismiss, restore ----------------------------------------------------------------
  const junk = lib.parsePatientForm(post({ ...adult, first_name: 'Test', mobile: mob(), signed_name: 'Test Person' }, door), { versions });
  const s4 = await lib.submitForms({ key: door.key, nonce: junk.nonce, value: junk.value, ip: IP });
  const id4 = (await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === s4.ref).id;
  made.forms.push(id4);
  const before = await withClinic(A, lib.countNewForms);
  assert.equal(await withClinic(A, (tx) => lib.dismissForm(tx, { clinicId: A, staffId: deskA, formId: id4 })), 'dismissed');
  assert.equal(await withClinic(A, lib.countNewForms), before - 1);
  assert.equal(await withClinic(B, (tx) => lib.dismissForm(tx, { clinicId: B, staffId: staffB, formId: id4 })), 'gone');
  assert.equal(await withClinic(A, (tx) => lib.restoreForm(tx, { clinicId: A, staffId: deskA, formId: id4 })), 'restored');
  assert.equal(await withClinic(A, (tx) => lib.dismissForm(tx, { clinicId: A, staffId: deskA, formId: id4 })), 'dismissed');
  const d4 = await withClinic(A, (tx) => lib.getForm(tx, id4));
  assert.equal(d4.status, 'dismissed');
  ok(`dismiss: ${s4.ref} leaves the queue (${before} → ${before - 1}); clinic B cannot touch it; restore and dismiss again; deleted on ${d4.deleteOn.toISOString().slice(0, 10)}`);

  // Several at once: only new ones, only this clinic's.
  const bulk = [];
  for (const n of ['One', 'Two']) {
    const pb = lib.parsePatientForm(post({ ...adult, first_name: `Bulk${n}`, mobile: mob(), signed_name: `Bulk ${n}` }, door), { versions });
    const sb = await lib.submitForms({ key: door.key, nonce: pb.nonce, value: pb.value, ip: IP });
    bulk.push((await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === sb.ref).id);
  }
  made.forms.push(...bulk);
  assert.equal(await withClinic(B, (tx) => lib.dismissForms(tx, { clinicId: B, staffId: staffB, formIds: bulk })), 0);
  assert.equal(await withClinic(A, (tx) => lib.dismissForms(tx, { clinicId: A, staffId: deskA, formIds: [...bulk, id4, 'not-a-uuid'] })), 2);
  assert.equal((await q1(`select count(*)::int as n from patient_form where id = any($1::uuid[]) and status = 'dismissed'`, [bulk])).n, 2);
  ok('dismissForms: two picked forms dismissed at once (an already dismissed one and junk ids ignored; another clinic dismisses none)');

  // --- a new QR code retires the old key --------------------------------------------------
  assert.equal(await withClinic(A, (tx) => lib.newFormsKey(tx, { clinicId: A, staffId: staffB })), null, 'staff of another group cannot');
  const fresh = await withClinic(A, (tx) => lib.newFormsKey(tx, { clinicId: A, staffId: staffA }));
  assert.notEqual(fresh.key, keyA.key);
  assert.equal((await lib.lookupForms(keyA.key, IP)).status, 'replaced');
  const refused = await lib.submitForms({ key: keyA.key, nonce: lib.newNonce(), value: pa.value, ip: IP });
  assert.equal(refused.kind, 'replaced');
  assert.equal((await lib.lookupForms(fresh.key, IP)).status, 'open');
  assert.equal((await withClinic(A, (tx) => lib.formsKey(tx, { clinicId: A, staffId: staffA }))).key, fresh.key);
  assert.equal((await q1(`select count(*)::int as n from clinic_forms_key where clinic_id = $1 and retired_at is null`, [A])).n, 1);
  ok(`newFormsKey: refused (null) for staff who cannot edit records here; ${keyA.key} retired → lookup says 'replaced' and a submit through it is refused; ${fresh.key} is the one live key`);

  const unknown = await lib.lookupForms('zzzzzzzzzz', IP);
  assert.equal(unknown.status, 'unknown');
  assert.equal((await lib.lookupForms('not a key', IP)).status, 'unknown');
  ok('lookupForms: a key that does not exist, or cannot be one → unknown (and counted against the address)');

  // Past the miss limit (someone at the same clinic Wi-Fi or carrier address trying links): a real poster still opens.
  await owner.query(`insert into throttle (key, hits, window_start) values ($1, 1000, now()) on conflict (key) do update set hits = 1000, window_start = now()`, [`forms:miss:${IP}`]);
  assert.equal((await lib.lookupForms(fresh.key, IP)).status, 'open');
  assert.equal((await lib.lookupForms('zzzzzzzzzz', IP)).status, 'wait');
  const v6 = '2001:db8:aa:bb:1::5';
  await owner.query(`insert into throttle (key, hits, window_start) values ($1, 1000, now()) on conflict (key) do update set hits = 1000, window_start = now()`, [`forms:miss:2001:db8:aa:bb::/64`]);
  assert.equal((await lib.lookupForms('zzzzzzzzzz', '2001:db8:aa:bb:ffff::9')).status, 'wait', 'counted per /64');
  assert.equal((await lib.lookupForms(fresh.key, v6)).status, 'open');
  ok('lookupForms: over the miss limit, links that do not exist wait (per IPv4 address, per IPv6 /64) while the clinic\'s real link still opens');

  // The privacy gate: on a production server the forms stay closed until a notice that names them is in force.
  const envWas = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(lib.formsNoticeReady('privacy-2026-09'), false);
    assert.equal(await lib.submitForms({ key: fresh.key, nonce: lib.newNonce(), value: pa.value, ip: IP }).then((r) => r.kind), 'closed');
  } finally { if (envWas === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = envWas; }
  assert.equal(lib.formsNoticeReady('privacy-2026-09'), true, 'always open on a development machine');
  ok(`formsNoticeReady: production + privacy-2026-09 → closed (submit says 'closed'); development → open (FORMS_PRIVACY_VERSIONS = [${lib.FORMS_PRIVACY_VERSIONS.join(', ')}])`);

  // Grants: the app can retire a key and nothing else; it cannot change the consent wording.
  await assert.rejects(withClinic(A, (tx) => tx.query(`update clinic_forms_key set key = 'abcdefghjk' where key = $1`, [fresh.key])), /permission denied/);
  await assert.rejects(withClinic(A, (tx) => tx.query(`update clinic_forms_key set retired_at = null where key = $1`, [keyA.key])), /retired key stays retired/);
  await assert.rejects(pool.query(`insert into consent_version (id, title, summary, effective_from) values ('privacy-2099-01', 'x', 'x', '2099-01-01')`), /permission denied/);
  await assert.rejects(pool.query(`update consent_version set summary = 'x' where id = 'privacy-2026-09'`), /permission denied/);
  ok('grants: the app cannot change a key, bring a retired one back, or write consent_version');

  // A flood: 500 new forms through one poster → 'full'; a new QR code opens the forms again.
  const floodKey = fresh.key;
  await owner.query(`insert into patient_form (clinic_id, forms_key, ref, nonce, form_version, answers, first_name, last_name, birth_date, phone, signed_by_name, signed_as, privacy_version, treatment_version)
    select $1, $2, 'QR-' || substr(a, 1 + ((g + $5) / 29791) % 31, 1) || substr(a, 1 + ((g + $5) / 961) % 31, 1) || substr(a, 1 + ((g + $5) / 31) % 31, 1) || substr(a, 1 + (g + $5) % 31, 1),
           'flood' || g || $3 || 'xxxxxxxxxxxx', 'x', '{}', 'Flood', $4, '1990-01-01', '09170000000', 'Flood Person', 'patient', 'privacy-2026-09', 'treatment-2026-09'
      from generate_series(1, 500) g, (select 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'::text as a) x on conflict do nothing`, [A, floodKey, run, LAST, randomInt(0, 900_000)]);
  const floodN = (await q1(`select count(*)::int as n from patient_form where forms_key = $1 and status = 'new'`, [floodKey])).n;
  const pF = lib.parsePatientForm(post({ ...adult, first_name: 'Afterflood', mobile: mob(), signed_name: 'After Flood' }, door), { versions });
  const direct = async (key) => (await pool.query('select status from patient_form_submit($1, $2, $3::jsonb)', [key, lib.newNonce(), JSON.stringify(pF.value)])).rows[0].status;
  if (floodN >= 500) assert.equal(await direct(floodKey), 'full');
  const fresh2 = await withClinic(A, (tx) => lib.newFormsKey(tx, { clinicId: A, staffId: staffA }));
  assert.equal(await direct(fresh2.key), 'saved');
  ok(`flood: ${floodN} new forms through ${floodKey} → 'full' there; after "Make a new QR code" (${fresh2.key}) the forms open again`);

  // --- the purge -------------------------------------------------------------------------
  // Backdate: the dismissed form and a never-added one to 31 days ago, an added one to 40 days ago.
  const pOld = lib.parsePatientForm(post({ ...adult, first_name: 'Old', mobile: mob(), signed_name: 'Old Person' }, door), { versions });
  const s5 = await lib.submitForms({ key: (await withClinic(A, (tx) => lib.formsKey(tx, { clinicId: A, staffId: staffA }))).key, nonce: pOld.nonce, value: pOld.value, ip: IP });
  assert.equal(s5.kind, 'saved');
  const id5 = (await withClinic(A, (tx) => lib.listForms(tx))).find((f) => f.ref === s5.ref).id;
  made.forms.push(id5);
  await owner.query(`update patient_form set submitted_at = now() - interval '31 days' where id = any($1::uuid[])`, [[id4, id5]]);
  await owner.query(`update patient_form set submitted_at = now() - interval '40 days' where id = $1`, [idA]);
  const purged = (await pool.query('select retention_purge() as n')).rows[0].n;
  const left = (await owner.query(`select id, status from patient_form where id = any($1::uuid[])`, [[idA, id4, id5]])).rows;
  assert.ok(purged >= 2);
  assert.deepEqual(left.map((r) => r.id), [idA]);
  ok(`retention_purge() as the app: ${purged} row(s) — the dismissed form and the never-added one (31 days) are gone; the added one (40 days) stays with the record`);

  console.log(`\nall ${step} checks passed`);
} finally {
  // Clean up what this run made (the owner connection; the app cannot delete forms).
  const forms = made.forms, patients = made.patients;
  await owner.query('begin');
  await owner.query(`delete from patient_consent where patient_id = any($1::uuid[]) or form_id = any($2::uuid[])`, [patients, forms]);
  await owner.query(`delete from medical_history where patient_id = any($1::uuid[]) or form_id = any($2::uuid[])`, [patients, forms]);
  await owner.query(`delete from audit_log where entity_id = any($1::uuid[])`, [[...patients, ...forms]]);
  await owner.query(`delete from patient_form where id = any($1::uuid[]) or last_name = $2`, [forms, LAST]);
  await owner.query(`delete from patient where id = any($1::uuid[])`, [patients]);
  await owner.query(`delete from throttle where key = any($1::text[]) or key like $2`, [[`forms:ip:${IP}`, `forms:miss:${IP}`, 'forms:miss:2001:db8:aa:bb::/64', ...mobiles.map((m) => `forms:p:${m}`)], `forms:ip:%:${IP}`]);
  await owner.query('commit');
  console.log(`cleaned up: ${forms.length} forms, ${patients.length} patients (the clinics' keys stay: session-road's live one is new)`);
  await owner.end();
  await pool.end();
}
