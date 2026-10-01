// npm run test:consent — the consent library: the words pinned to 039's fingerprints, the rules the words keep,
// reading the clinic's and the patient's parts, drawing a page, and page 1's definition on the forms' engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TEMPLATES, CONSENT_REVIEWED, CODES, readClinicPart, readPatientPart, renderDocument, meaningSentence, consentsForCatalog, offered, langsFor,
  readTeeth, readPesos, valueText, signerChoices, type Template, type RenderCtx, type Fields,
} from './consent-library.ts';
import { libraryHash } from './consent-seal.ts';
import { TREATMENT_CONSENT, parseForm, parseScreen, valuesAsForm, FIELDS } from './patient-forms-def.ts';
import { INTAKE_DEF, INTAKE_FORM_VERSION, INTAKE_STEPS } from './intake-def.ts';

const MIGRATION = new URL('../data/migrations/039_patient_intake.sql', import.meta.url);
/** The migrations that pin the words, newest first: the newest that names a version sets its fingerprint. */
const PINS = [new URL('../data/migrations/043_intake_fixes.sql', import.meta.url), MIGRATION];

/** Every word a template shows, English and Filipino, as plain strings. */
function words(t: Template): string[] {
  const out: string[] = [t.title.en, t.title.fil ?? ''];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(t);
  return out;
}

test('the words are the ones the migrations pinned: libraryHash equals each row’s body_sha256, as the newest migration sets it', () => {
  const sqls = PINS.map((u) => readFileSync(u, 'utf8'));
  for (const t of Object.values(TEMPLATES)) {
    const h = libraryHash(t);
    const pinned = sqls.map((sql) => new RegExp(`"${t.version}": "([0-9a-f]{64})"`).exec(sql)?.[1]).find(Boolean);
    assert.equal(pinned, h, `${t.version}: the words changed since a migration pinned them. New words are a new version id and a new row (npm run consent:hash).`);
  }
  // 039 agrees with itself: each row it inserts or sets is the one its own check names.
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const t of Object.values(TEMPLATES)) {
    const row = new RegExp(`'${t.version}',[^\\n]*'([0-9a-f]{64})'\\)`).exec(sql)?.[1]
      ?? new RegExp(`set body_sha256 = '([0-9a-f]{64})' where id = '${t.version}'`).exec(sql)?.[1];
    assert.equal(new RegExp(`"${t.version}": "${row}"`).test(sql), true, `${t.version}: 039's own check names another fingerprint`);
  }
  assert.equal(Object.keys(TEMPLATES).length, 11);
});

test('the library: ten forms and the general consent, each whole', () => {
  const byCode = new Map(Object.values(TEMPLATES).map((t) => [t.code, t]));
  assert.deepEqual([...byCode.keys()].sort(), [...CODES].sort());
  const orders = Object.values(TEMPLATES).map((t) => t.order);
  assert.equal(new Set(orders).size, orders.length);
  for (const [v, t] of Object.entries(TEMPLATES)) {
    assert.equal(t.version, v);
    assert.equal(t.kind, t.code === 'general' ? 'treatment' : 'document');
    assert.equal(t.attest, !['general', 'photos'].includes(t.code), `${v}: attest`);
    assert.ok(t.minutes >= 1 && t.minutes <= 3);
    if (!t.attest) continue;
    // Every procedure form: risks with initials; ends with other choices (a "no" among them), if you do not have it, cost, your rights.
    assert.ok(t.sections.some((s) => (s.role === 'risks' || s.role === 'rare') && s.initials), `${v}: initials on the risks`);
    const tail = t.sections.map((s) => s.role).filter((r) => ['choices', 'without', 'cost', 'rights'].includes(r));
    assert.deepEqual(tail, ['choices', 'without', 'cost', 'rights'], `${v}: the closing sections`);
    const choices = t.sections.find((s) => s.role === 'choices')!.lines.map((l) => l.en.join(''));
    assert.ok(choices.some((c) => /^No (treatment|replacement|numbing)/.test(c)), `${v}: "no treatment" is a choice`);
    assert.deepEqual(t.ticks.map((k) => k.id).slice(0, 2), ['explained', 'risks']);
    assert.ok(t.inShort.length >= 3);
    assert.ok(t.clinicFields.every((f) => f.who === 'desk' || f.who === 'dentist'));
  }
  assert.equal(TEMPLATES['whitening-2026-10'].minors, 'not_under_18');
  assert.equal(TEMPLATES['photos-2026-10'].refuseUnsigned, true);
  assert.equal(TEMPLATES['photos-2026-10'].validDays, null);
  assert.deepEqual(TEMPLATES['anaesthesia-2026-10'].ticks.map((k) => k.id), ['explained', 'risks', 'history']);
});

test('the general consent is TREATMENT_CONSENT, word for word: six sections and one tick', () => {
  const g = TEMPLATES['treatment-2026-09'];
  const w = TREATMENT_CONSENT['treatment-2026-09'];
  assert.equal(g.title.en, w.title);
  assert.deepEqual(g.sections.map((s) => [s.head.en, s.lines.map((l) => l.en.join('')).join('')]), w.points.map((p) => [p.head, p.body]));
  assert.deepEqual(g.ticks.map((k) => k.line.en.join('')), [w.tick]);
  assert.equal(g.clinicFields.length, 0);
});

test('clauses never used (§3.9), and no precise success claims', () => {
  const banned = [/attorney/i, /waive/i, /liabilit/i, /collection cost/i, /no further questions/i, /dismiss/i, /\brequired\b/i, /religion/i, /9\d ?%/, /\bguarantee(d|s)? (a|the) result/i];
  for (const t of Object.values(TEMPLATES)) for (const w of words(t)) for (const b of banned) assert.equal(b.test(w), false, `${t.version}: "${w}" matches ${b}`);
});

test('nothing is published as reviewed; development offers everything, production nothing yet', () => {
  assert.deepEqual(CONSENT_REVIEWED, []);
  for (const t of Object.values(TEMPLATES)) {
    assert.equal(offered(t, false), true);
    assert.equal(offered(t, true), false);
    assert.deepEqual(langsFor(t, true), ['en']);
    assert.deepEqual(langsFor(t, false), ['en', 'fil']);
  }
});

test('readTeeth and readPesos', () => {
  assert.deepEqual(readTeeth(['38, 36 36']), [36, 38]);
  assert.deepEqual(readTeeth(['85', '51']), [51, 85]);
  assert.equal(readTeeth(['19']), null);
  assert.equal(readTeeth(['36, 99']), null);
  assert.equal(readPesos('3,000'), 300000);
  assert.equal(readPesos('₱ 2500.5'), 250050);
  assert.equal(readPesos('5000000'), 500000000);
  assert.equal(readPesos('5000000.01'), null);
  assert.equal(readPesos('-5'), null);
  assert.equal(readPesos('1e3'), null);
});

test('readClinicPart: every kind read and bounded, declared names only', () => {
  const t = TEMPLATES['extraction-2026-10'];
  const r = readClinicPart(t, {
    teeth: '38, 36', type: 'surgical', reason: 'other', reason_other: 'A cracked​ root', xray: ['nerve', 'sinus'], risk_factors: ['none'],
    follow_up: '  A check-up   in 7 days ', estimate_kind: 'range', estimate_from: '3,000', estimate_to: '5000', estimate_includes: 'the X-ray', junk: 'x',
  }, { minor: false, dentist: true });
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.fields, {
    teeth: [36, 38], type: 'surgical', reason: { other: 'A cracked root' }, xray: ['nerve', 'sinus'], risk_factors: ['none'],
    follow_up: 'A check-up in 7 days', estimate: { kind: 'range', from: 300000, to: 500000, includes: 'the X-ray' },
  });
  // "None noted" goes alone; a bad tooth; an amount out of bounds; a choice not on the list.
  const bad = readClinicPart(t, { teeth: '36, 19', type: 'wild', xray: ['nerve', 'none'], estimate_kind: 'amount', estimate_from: '9000000' }, { minor: false, dentist: true });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['estimate', 'teeth', 'type', 'xray']);
  // Later only where allowed; a money field without it.
  const rc = TEMPLATES['root-canal-2026-10'];
  assert.equal(readClinicPart(rc, { teeth: '36, 37' }, { minor: false, dentist: true }).errors.teeth, 'One tooth per form.');
  assert.deepEqual(readClinicPart(rc, { estimate_after_kind: 'later' }, { minor: false, dentist: false }).fields.estimate_after, { kind: 'later' });
});

test('readClinicPart: the dentist’s fields are proposals until the dentist confirms', () => {
  const t = TEMPLATES['extraction-2026-10'];
  const desk = readClinicPart(t, { teeth: '36', estimate_kind: 'later' }, { minor: false, dentist: false });
  assert.deepEqual(desk.errors, {});
  assert.deepEqual(desk.proposed, ['teeth']);
  const dentist = readClinicPart(t, { teeth: '36', estimate_kind: 'later' }, { minor: false, dentist: true });
  assert.deepEqual(Object.keys(dentist.errors), ['type']);
  // The desk's own required fields are required either way.
  assert.deepEqual(Object.keys(readClinicPart(t, {}, { minor: false, dentist: false }).errors), ['estimate']);
});

test('readClinicPart: a field whose condition does not hold is stored as null; one of two; not for a minor', () => {
  const r = TEMPLATES['restoration-2026-10'];
  const f = readClinicPart(r, { kind: ['filling'], teeth: '16', bridge_teeth: '15, 17', temporary: 'yes', estimate_kind: 'later' }, { minor: false, dentist: true });
  assert.equal(f.fields.bridge_teeth, null);
  assert.equal(f.fields.temporary, null);
  assert.deepEqual(f.errors, {});
  const b = readClinicPart(r, { kind: ['bridge'], teeth: '16', estimate_kind: 'later' }, { minor: false, dentist: true });
  assert.ok(b.errors.bridge_teeth);
  const an = TEMPLATES['anaesthesia-2026-10'];
  assert.ok(readClinicPart(an, {}, { minor: false, dentist: true }).errors.area);
  assert.deepEqual(readClinicPart(an, { area_text: 'the lower left' }, { minor: false, dentist: true }).errors, {});
  assert.equal(readClinicPart(TEMPLATES['whitening-2026-10'], { method: 'clinic', estimate_kind: 'later' }, { minor: true, dentist: true }).errors._form,
    'Not for under 18: the product label says so.');
  const big = readClinicPart(TEMPLATES['ortho-2026-10'], { fees: 'x'.repeat(201) }, { minor: false, dentist: false });
  assert.ok(big.errors.fees);
});

test('readPatientPart: who may sign, by age and device', () => {
  assert.deepEqual(signerChoices(false, 'phone'), ['patient']);
  assert.deepEqual(signerChoices(true, 'phone'), ['parent']);
  assert.deepEqual(signerChoices(true, 'clinic'), ['parent', 'court_guardian', 'substitute', 'written']);
  assert.deepEqual(signerChoices(false, 'clinic'), ['patient', 'mark', 'court_guardian', 'representative']);
  const t = TEMPLATES['treatment-2026-09'];
  const base = { decision: 'agree', tick_general: '1', read: 'self' };
  const ctx = { minor: true, device: 'phone' as const, patientName: 'Paolo Cruz', fields: {} };
  assert.ok(readPatientPart(t, { ...base, signer_as: 'patient' }, ctx).errors.signer_as);
  assert.ok(readPatientPart(t, { ...base, signer_as: 'substitute' }, ctx).errors.signer_as);
  const parent = readPatientPart(t, { ...base, signer_as: 'parent', signer_name: 'Maria Cruz', signer_relation: 'Mother' }, ctx);
  assert.deepEqual(parent.errors, {});
  assert.deepEqual(parent.signer, { name: 'Maria Cruz', as: 'guardian', method: 'sign', relation: 'Mother', authority: 'parent', ground: null, note: null });
  const sub = readPatientPart(t, { ...base, signer_as: 'substitute', signer_name: 'Lola Cruz', signer_relation: 'Grandmother', signer_ground: 'died', signer_who: 'custodian_21' },
    { ...ctx, device: 'clinic' });
  assert.ok(sub.errors.signer_over21);
  const adult = readPatientPart(t, { ...base, signer_as: 'patient', signer_name: 'Someone Else' }, { ...ctx, minor: false });
  assert.equal(adult.signer?.name, 'Paolo Cruz');
});

test('readPatientPart: ticks and initials to agree, none to ask first; stops; the photos’ yes', () => {
  const t = TEMPLATES['extraction-2026-10'];
  const ctx = { minor: false, device: 'clinic' as const, patientName: 'Juan Cruz', fields: { teeth: [38] } };
  const agree = readPatientPart(t, { decision: 'agree', signer_as: 'patient', read: 'self', explained_lang: 'English', initials_rare: 'JC', initials_wisdom: 'jd' }, ctx);
  assert.deepEqual(Object.keys(agree.errors).sort(), ['initials', 'tick_explained', 'tick_history', 'tick_risks']);
  const later = readPatientPart(t, { decision: 'later' }, ctx);
  assert.deepEqual(later.errors, {});
  assert.equal(later.signer, null);
  const w = TEMPLATES['whitening-2026-10'];
  const stop = readPatientPart(w, { decision: 'agree', tick_explained: '1', tick_risks: '1', initials_risks: 'JC', read: 'self', explained_lang: 'English', signer_as: 'patient',
    pregnant: 'unsure', smoke_drink: 'no', recent_work: 'no' }, { ...ctx, fields: {} });
  assert.ok(stop.stopped);
  assert.ok(stop.errors.decision);
  const p = TEMPLATES['photos-2026-10'];
  const pctx = { ...ctx, fields: { uses: ['specialist', 'social'] } };
  assert.ok(readPatientPart(p, { decision: 'agree', read: 'self', signer_as: 'patient', use_specialist: 'no', use_social: 'no' }, pctx).errors.decision);
  assert.deepEqual(readPatientPart(p, { decision: 'agree', read: 'self', signer_as: 'patient', use_specialist: 'yes', use_social: 'no' }, pctx).errors, {});
  assert.deepEqual(readPatientPart(p, { decision: 'refuse', read: 'self', signer_as: 'patient' }, pctx).errors, {});
  // "Decide later" on the photos too (043): unsigned, nothing else asked — a minor's parent may not be there.
  const photosLater = readPatientPart(p, { decision: 'later' }, { ...pctx, minor: true });
  assert.deepEqual(photosLater.errors, {});
  assert.equal(photosLater.decision, 'later');
  assert.equal(photosLater.signer, null);
});

test('renderDocument: to be confirmed until attested; the meaning sentence; Filipino only when shown', () => {
  const t = TEMPLATES['extraction-2026-10'];
  const fields: Fields = { teeth: [36, 37], type: 'simple', estimate: { kind: 'amount', from: 250000 } };
  const ctx: RenderCtx = {
    langs: ['en'], minor: true, confirmed: false, clinic: { name: 'C', address: null, phone: null }, patient: { name: 'Paolo Cruz', birth: '2014-01-02' },
    dentist: { name: 'Ana Reyes', prc: '1' }, attested: null, language: null, date: '2026-10-02',
  };
  const draft = renderDocument(t, fields, ctx);
  assert.match(draft.sections[0].lines[0].en, /teeth 36 and 37 \(to be confirmed by the dentist\)/);
  assert.equal(draft.meaning, null);
  assert.ok(draft.for.every((f) => f.label === 'Estimate' ? f.confirmed : !f.confirmed));
  assert.ok(draft.sections.every((s) => s.lines.every((l) => !l.fil)));
  const signed = renderDocument(t, fields, {
    ...ctx, langs: ['en', 'fil'], confirmed: true, decision: 'agreed',
    signer: { name: 'Maria Cruz', as: 'guardian', method: 'sign', relation: 'mother', authority: 'parent', ground: null, note: null },
  });
  assert.equal(meaningSentence(signed), 'By signing, I, Maria Cruz, mother of Paolo Cruz, agree for Paolo Cruz to have the extraction of teeth 36 and 37 by Dr Ana Reyes as described above. 2 Oct 2026.');
  assert.equal(signed.signer?.statement?.en, 'I am the patient’s parent, and I have the right to consent for them.');
  assert.ok(signed.sections.find((s) => s.role === 'rights')!.lines[0].fil);
  // The upper-back-teeth and wisdom sections follow the teeth.
  assert.equal(renderDocument(t, { ...fields, teeth: [16] }, ctx).sections.some((s) => s.id === 'sinus'), true);
  assert.equal(renderDocument(t, { ...fields, teeth: [38] }, ctx).sections.some((s) => s.id === 'wisdom'), true);
  assert.equal(renderDocument(t, fields, ctx).sections.some((s) => s.id === 'wisdom' || s.id === 'sinus'), false);
  assert.equal(valueText(t.clinicFields[0], [36], 'tooth'), 'tooth 36');
  // Refusing reads "as described above" too.
  const refused = renderDocument(t, fields, { ...ctx, confirmed: true, decision: 'refused', signer: { name: 'Paolo Cruz', as: 'patient', method: 'sign', relation: null, authority: null, ground: null, note: null } });
  assert.equal(meaningSentence(refused), 'By signing, I, Paolo Cruz, do not agree to the extraction of teeth 36 and 37 by Dr Ana Reyes as described above. 2 Oct 2026.');
});

test('the meaning sentence a parent signs reads for the general consent and the photos; an unsigned "No, thank you" has none', () => {
  const mother = { name: 'Maria Santos', as: 'guardian' as const, method: 'sign' as const, relation: 'mother', authority: 'parent' as const, ground: null, note: null };
  const ctx: RenderCtx = {
    langs: ['en'], minor: true, confirmed: false, clinic: { name: 'C', address: null, phone: null }, patient: { name: 'Ana Santos', birth: '2014-01-02' },
    dentist: null, attested: null, language: null, date: '2026-10-02',
  };
  const g = TEMPLATES['treatment-2026-09'];
  assert.equal(meaningSentence(renderDocument(g, {}, { ...ctx, decision: 'agreed', signer: mother })),
    'By signing, I, Maria Santos, mother of Ana Santos, agree for Ana Santos to be examined, and to have treatment once the dentist has explained it, as described above. 2 Oct 2026.');
  assert.equal(meaningSentence(renderDocument(g, {}, { ...ctx, decision: 'refused', signer: mother })),
    'By signing, I, Maria Santos, mother of Ana Santos, do not agree for Ana Santos to be examined, or to have treatment, as described above. 2 Oct 2026.');
  const p = TEMPLATES['photos-2026-10'];
  const fields: Fields = { uses: ['social'] };
  assert.equal(meaningSentence(renderDocument(p, fields, { ...ctx, decision: 'agreed', signer: mother })),
    'By signing, I, Maria Santos, mother of Ana Santos, agree to the choices on this form about the photos and records of Ana Santos. 2 Oct 2026.');
  assert.equal(renderDocument(p, fields, { ...ctx, decision: 'refused', signer: mother, unsigned: true }).meaning, null);
  for (const t of Object.values(TEMPLATES)) {
    for (const d of ['agreed', 'refused'] as const) {
      const m = meaningSentence(renderDocument(t, {}, { ...ctx, decision: d, signer: mother }));
      assert.doesNotMatch(m, /to have be |to have the choices|about my /, `${t.version} ${d}: ${m}`);
    }
  }
});

test('consentsForCatalog: the fee guide’s procedures suggest forms', () => {
  assert.deepEqual(consentsForCatalog('extraction', 'Tooth extraction', 'surgery'), ['extraction', 'anaesthesia']);
  assert.deepEqual(consentsForCatalog('wisdom', 'Wisdom tooth removal', 'surgery'), ['extraction', 'anaesthesia']);
  assert.deepEqual(consentsForCatalog('rootcanal', 'Root canal', 'restore'), ['root_canal', 'anaesthesia']);
  assert.deepEqual(consentsForCatalog('restoration', 'Filling', 'restore'), ['restoration']);
  assert.deepEqual(consentsForCatalog('crown', 'Crown', 'restore'), ['restoration']);
  assert.deepEqual(consentsForCatalog('dentures', 'Dentures', 'prosth'), ['denture']);
  assert.deepEqual(consentsForCatalog('braces', 'Braces', 'ortho'), ['ortho']);
  assert.deepEqual(consentsForCatalog('whitening', 'Whitening', 'cosmetic'), ['whitening']);
  assert.deepEqual(consentsForCatalog('prophylaxis', 'Cleaning', 'preventive'), []);
  assert.deepEqual(consentsForCatalog(null, 'Deep scaling and root planing', null), ['periodontal', 'anaesthesia']);
  assert.deepEqual(consentsForCatalog(null, 'Implant crown', null), ['implant', 'anaesthesia']);
  assert.deepEqual(consentsForCatalog('xray', 'Periapical X-ray', 'diagnostic'), []);
});

test('page 1 (intake-def.ts) on the forms’ engine: screens, the whole, who agrees', () => {
  assert.equal(INTAKE_DEF.version, INTAKE_FORM_VERSION);
  assert.deepEqual(INTAKE_STEPS.map((s) => s.id), ['you', 'contact', 'health', 'privacy']);
  for (const name of Object.keys(INTAKE_DEF.fields)) if (FIELDS[name]) assert.equal(INTAKE_DEF.fields[name].label, FIELDS[name].label);
  for (const left of ['civil_status', 'facebook', 'philhealth_pin', 'hmo_company', 'reason', 'signed_name']) assert.equal(INTAKE_DEF.fields[left], undefined);
  const today = '2026-10-02';
  const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
  const you = parseScreen<Record<string, unknown>, { privacyVersion: string; today: string }>(INTAKE_DEF, fd({ first_name: 'Paolo', last_name: 'Cruz', birth_date: '2014-03-10', sex: 'male' }), 'you', { privacyVersion: 'privacy-2026-09', today });
  assert.equal(you.ok, true);
  const prior = you.ok ? you.value : {};
  // Under 18 by the saved birth date: the parent is asked on the contact screen.
  const contact = parseScreen(INTAKE_DEF, fd({ mobile: '0917 555 0142', address: '1 Road', city: 'Baguio', province: 'Benguet', emergency_name: 'Ana', emergency_relation: 'Aunt', emergency_mobile: '0917 555 0143' }),
    'contact', { privacyVersion: 'privacy-2026-09', today, prior });
  assert.equal(contact.ok, false);
  assert.ok(!contact.ok && contact.errors.guardian_name);
  const saved = {
    ...prior, mobile: '09175550142', email: null, address: '1 Road', city: 'Baguio', province: 'Benguet', guardian_name: 'Maria Cruz', guardian_relation: 'Mother',
    guardian_mobile: '09175550144', guardian_is_emergency: true, good_health: 'yes', under_treatment: 'no', serious_illness: 'no', hospitalised: 'no', takes_medicines: 'no',
    allergies: ['none'], smoke: 'no', alcohol_drugs: 'no', conditions: ['none'],
  };
  const privacy = (o: Record<string, string>) => parseForm<Record<string, unknown>, { privacyVersion: string; today: string }>(INTAKE_DEF,
    valuesAsForm(INTAKE_DEF, saved, { form: fd(o), step: 'privacy' }), { privacyVersion: 'privacy-2026-09', today });
  const asPatient = privacy({ privacy_version: 'privacy-2026-09', privacy_as: 'patient', consent_privacy: '1' });
  assert.ok(!asPatient.ok && asPatient.errors.privacy_as);
  const asParent = privacy({ privacy_version: 'privacy-2026-09', privacy_as: 'parent', privacy_by_name: 'Maria Cruz', privacy_relation: 'Mother', consent_privacy: '1' });
  assert.ok(asParent.ok, JSON.stringify(!asParent.ok && asParent.errors));
  if (asParent.ok) {
    assert.equal(asParent.value.emergency_name, 'Maria Cruz');
    assert.equal(asParent.value.v, INTAKE_FORM_VERSION);
    assert.deepEqual(asParent.value.medicines, []);
  }
  const nobody = privacy({ privacy_version: 'privacy-2026-09', privacy_as: 'none' });
  assert.ok(nobody.ok && nobody.value.consent_privacy === false && nobody.value.privacy_version === null);
  const stale = privacy({ privacy_version: 'privacy-2025-01', privacy_as: 'parent', privacy_by_name: 'Maria Cruz', privacy_relation: 'Mother', consent_privacy: '1' });
  assert.ok(!stale.ok && stale.errors.consent_privacy);
});
