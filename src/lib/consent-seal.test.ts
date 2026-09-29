// npm run test:consent — the seal's sums: canonical JSON, the fingerprints, short seals, the snapshot.
// No database; the database's own sums are checked against these by scripts/dev/intake/db-test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalJson, sha256Hex, libraryHash, shortSeal, sealHex, inkOf, chainHex, CHAIN_START, snapshotOf, snapshotText,
} from './consent-seal.ts';
import { TEMPLATES, renderDocument, readClinicPart, readPatientPart } from './consent-library.ts';

test('canonicalJson: keys sorted at every depth, no whitespace', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: 'x' } }), '{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}');
  assert.equal(canonicalJson([]), '[]');
  assert.equal(canonicalJson({}), '{}');
  // The same value written in two key orders is one text.
  assert.equal(canonicalJson({ x: 1, y: [1, 2], z: { b: 2, a: 1 } }), canonicalJson({ z: { a: 1, b: 2 }, y: [1, 2], x: 1 }));
});

test('canonicalJson: strings in NFC, escaped as JSON escapes them', () => {
  const composed = 'José', decomposed = 'José';
  assert.notEqual(composed, decomposed);
  assert.equal(canonicalJson({ n: decomposed }), canonicalJson({ n: composed }));
  assert.equal(canonicalJson('a"b\\c\n\u0001'), JSON.stringify('a"b\\c\n\u0001'));
  assert.equal(canonicalJson('₱3,000 · tooth 36'), '"₱3,000 · tooth 36"');
});

test('canonicalJson: integers only, undefined properties left out, anything else refused', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined, c: -0, d: 500000000 }), '{"a":1,"c":0,"d":500000000}');
  assert.throws(() => canonicalJson(1.5), /integers only/);
  assert.throws(() => canonicalJson(Number.NaN), /integers only/);
  assert.throws(() => canonicalJson(2 ** 60), /integers only/);
  assert.throws(() => canonicalJson([undefined]), /undefined in a list/);
  assert.throws(() => canonicalJson(new Date(0)), /plain objects only/);
  assert.throws(() => canonicalJson(() => 1), /cannot write/);
  assert.throws(() => canonicalJson(1n), /cannot write/);
});

test('canonicalJson: reading its own text back writes the same text', () => {
  const v = { schema: 1, list: [{ b: 'é', a: [1, 2, 3] }], t: true, n: null };
  const s = canonicalJson(v);
  assert.equal(canonicalJson(JSON.parse(s)), s);
});

test('sha256Hex: the standard test vector and UTF-8 bytes', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex('₱'), createHash('sha256').update(Buffer.from('₱', 'utf8')).digest('hex'));
});

test('libraryHash: stable, and one changed word changes it', () => {
  for (const t of Object.values(TEMPLATES)) {
    assert.match(libraryHash(t), /^[0-9a-f]{64}$/);
    assert.equal(libraryHash(t), libraryHash(JSON.parse(JSON.stringify(t))));
  }
  const t = TEMPLATES['extraction-2026-10'];
  const copy = JSON.parse(JSON.stringify(t));
  copy.sections[2].lines[0].en[0] = String(copy.sections[2].lines[0].en[0]).replace('Pain', 'Ache');
  assert.notEqual(libraryHash(copy), libraryHash(t));
});

test('shortSeal: ten characters with no look-alikes, from the seal, the same every time', () => {
  const a = sha256Hex('one'), b = sha256Hex('two');
  assert.match(shortSeal(a), /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{2}$/);
  assert.equal(shortSeal(a), shortSeal(a));
  assert.notEqual(shortSeal(a), shortSeal(b));
  assert.throws(() => shortSeal('xyz'), /not a seal/);
  assert.throws(() => shortSeal(a.toUpperCase()), /not a seal/);
});

test('sealHex, inkOf, chainHex: the lines the database sums', () => {
  const strokes = [[[1, 2], [300, 40]], [[5, 6]]] as const;
  assert.equal(inkOf({ strokes: strokes as unknown as [number, number][][] }), '[[[1,2],[300,40]],[[5,6]]]');
  assert.equal(inkOf({ strokes: null }), 'none');
  assert.equal(inkOf({ paper: { signedOn: '2026-10-02', attachmentId: '00000000-0000-0000-0000-000000000009' } }), 'paper 2026-10-02 00000000-0000-0000-0000-000000000009');
  const at = new Date('2026-10-02T02:42:00.123Z');
  const seal = sealHex({ snapshotSha256: 'a'.repeat(64), ink: 'none', name: 'Juan dela Cruz', as: 'patient', method: 'sign', signedAt: at });
  assert.equal(seal, sha256Hex(['flossify-seal-1', 'a'.repeat(64), 'none', 'Juan dela Cruz', 'patient', 'sign', '2026-10-02T02:42:00.123Z'].join('\n')));
  assert.equal(sealHex({ snapshotSha256: 'a'.repeat(64), ink: 'none', name: 'Juan dela Cruz', as: 'patient', method: 'sign', signedAt: '2026-10-02T10:42:00.123+08:00' }), seal);
  assert.equal(chainHex(CHAIN_START, seal, 1), sha256Hex(`${'0'.repeat(64)}${seal}1`));
});

test('the snapshot: canonical, of the rendered page, and its words’ hash inside', () => {
  const t = TEMPLATES['extraction-2026-10'];
  const { fields } = readClinicPart(t, { teeth: '36', type: 'simple', estimate_kind: 'amount', estimate_from: '2500' }, { minor: false, dentist: true });
  const part = readPatientPart(t, {
    decision: 'agree', tick_explained: '1', tick_risks: '1', tick_history: '1', initials_rare: 'JDC', explained_lang: 'Filipino', read: 'self', signer_as: 'patient',
  }, { minor: false, device: 'clinic', patientName: 'Juan dela Cruz', fields });
  assert.deepEqual(part.errors, {});
  const ctx = {
    langs: ['en'] as ('en' | 'fil')[], minor: false, confirmed: true, clinic: { name: 'Session Road Dental', address: null, phone: null },
    patient: { name: 'Juan dela Cruz', birth: '1990-01-02' }, dentist: { name: 'Ana Reyes', prc: '0123456' },
    attested: { at: '2026-10-02T02:20:00.000Z', lang: 'Filipino', interpreter: null, assent: null }, language: 'Filipino',
    answers: part.answers, initials: part.initials, decision: part.decision, signer: part.signer, read: part.read, explainedIn: part.explainedIn, date: '2026-10-02',
  };
  const r = renderDocument(t, fields, ctx);
  const meta = { document: '00000000-0000-0000-0000-00000000000a', ref: 'CF-7K2FQ' };
  const text = snapshotText(r, meta);
  const snap = snapshotOf(r, meta);
  assert.equal(text, canonicalJson(snap));
  assert.equal(canonicalJson(JSON.parse(text)), text);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(snap)));
  assert.equal(snap.library, libraryHash(t));
  assert.equal(snap.signer?.name, 'Juan dela Cruz');
  assert.equal(snap.meaning, 'By signing, I, Juan dela Cruz, agree to the extraction of tooth 36 by Dr Ana Reyes as described above. 2 Oct 2026.');
  // Drawn again from the same facts, the same text: the renderer is pure.
  assert.equal(snapshotText(renderDocument(t, fields, ctx), meta), text);
  assert.ok(Buffer.byteLength(text) < 64 * 1024);
});
