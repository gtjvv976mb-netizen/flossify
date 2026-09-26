// Two sample patient forms waiting at Session Road (flossify_qr only), for building the queue against.
import { readFileSync } from 'node:fs';
const REPO = '/Users/michaelkennethbrillantes/flossify-qr';
const u = new URL(/^DATABASE_URL=(.+)$/m.exec(readFileSync(`${REPO}/.env`, 'utf8'))[1].trim());
u.pathname = '/flossify_qr';
process.env.DATABASE_URL = u.href;
const lib = await import(`${REPO}/src/lib/patient-forms.ts`);
const { pool, withClinic } = await import(`${REPO}/src/lib/db.ts`);
if ((await pool.query('select current_database() as d')).rows[0].d !== 'flossify_qr') throw new Error('not flossify_qr');
const A = (await pool.query(`select public_clinic_id('session-road') as id`)).rows[0].id;
const key = await withClinic(A, async (tx) => (await tx.query('select key from clinic_forms_key where retired_at is null')).rows[0]?.key);
const door = await lib.lookupForms(key, '192.0.2.10');
const versions = { privacy: door.consent.privacy.id, treatment: door.consent.treatment.id };
const post = (f) => { const fd = new FormData(); fd.set(lib.NONCE_FIELD, lib.newNonce()); fd.set('treatment_version', versions.treatment); fd.set('privacy_version', versions.privacy); for (const [k, v] of Object.entries(f)) for (const x of [v].flat()) fd.append(k, x); return fd; };
const base = { address: '27 Assumption Rd, Brgy. Session Road Area', city: 'Baguio City', province: 'Benguet', good_health: 'yes', serious_illness: 'no', hospitalised: 'no', smoke: 'no', alcohol_drugs: 'no', consent_treatment: '1', consent_privacy: '1' };
const forms = [
  { ...base, first_name: 'Andrea', middle_name: 'Lopez', last_name: 'Villanueva', birth_date: '1991-07-22', sex: 'female', civil_status: 'married', occupation: 'Nurse',
    mobile: '0917 555 0161', email: 'andrea.v@example.com', emergency_name: 'Ramon Villanueva', emergency_relation: 'Husband', emergency_mobile: '0917 555 0162',
    under_treatment: 'no', takes_medicines: 'yes', medicines: 'Ferrous sulfate', allergies: ['penicillin'], pregnant: 'no', nursing: 'yes', birth_control: 'no',
    conditions: ['anaemia'], reason: 'Cleaning, and a filling fell out', concerns: ['sensitivity', 'broken'], nervous: 'little', last_visit: 'gt2y',
    philhealth: 'yes', hmo: 'intellicare', hmo_card_no: 'IC-4471-0021', signed_as: 'patient', signed_name: 'Andrea Lopez Villanueva' },
  { ...base, first_name: 'Miguel', last_name: 'Villanueva', birth_date: '2016-11-03', sex: 'male', mobile: '0917 555 0161',
    emergency_name: 'Ramon Villanueva', emergency_relation: 'Father', emergency_mobile: '0917 555 0162',
    guardian_name: 'Andrea Villanueva', guardian_relation: 'Mother', guardian_mobile: '0917 555 0161',
    under_treatment: 'no', takes_medicines: 'no', allergies: ['none'], conditions: ['asthma'], reason: 'A loose baby tooth', concerns: ['loose'], nervous: 'very',
    last_visit: 'lt6m', signed_as: 'guardian', signed_name: 'Andrea Villanueva' },
];
for (const f of forms) {
  const p = lib.parsePatientForm(post(f), { versions });
  if (!p.ok) throw new Error(JSON.stringify(p.errors));
  const r = await lib.submitForms({ key, nonce: p.nonce, value: p.value, ip: '192.0.2.10' });
  console.log(`${f.first_name} ${f.last_name}: ${r.kind} ${r.ref ?? ''}`);
}
await pool.query(`select 1`);
console.log(`live key at session-road: ${key}  →  ${lib.formsUrl(key)}`);
await pool.end();
