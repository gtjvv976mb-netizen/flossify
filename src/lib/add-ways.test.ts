// Add patient's one chooser (plan 1.11): only the ways open on this server, "Easiest" only beside an open one, and
// straight to typing when typing is the only way. No database.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs --test src/lib/add-ways.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWays, type WayGates } from './add-ways.ts';

// What intakeGates() gives on each kind of server today.
const LIVE: WayGates = { templates: 0, phoneOpen: true, page1Open: false }; // CONSENT_REVIEWED and FORMS_PRIVACY_VERSIONS empty
const REVIEWED: WayGates = { templates: 11, phoneOpen: true, page1Open: false }; // consent forms read; the notice not yet
const DEV: WayGates = { templates: 11, phoneOpen: true, page1Open: true }; // a development machine opens both
const easiest = (w: { pill: string | null }[]) => w.filter((x) => x.pill === 'Easiest').length;

test('the live site today: typing only, so no chooser and no Easiest', () => {
  const { ways, onlyTyping } = addWays(LIVE, null);
  assert.deepEqual(ways.map((w) => w.value), ['type']);
  assert.equal(onlyTyping, true);
  assert.equal(easiest(ways), 0);
});

test('consent forms reviewed, the notice not covering the patient information: at the clinic and typing, no Easiest', () => {
  const { ways, onlyTyping } = addWays(REVIEWED, null);
  assert.deepEqual(ways.map((w) => w.value), ['clinic', 'type']);
  assert.equal(onlyTyping, false);
  assert.equal(easiest(ways), 0);
  // At the clinic says the details are typed first.
  assert.match(ways[0].line, /^Type their details first/);
  assert.ok(ways.every((w) => w.off === null));
});

test('everything open: on their phone (Easiest), at the clinic, typing', () => {
  const { ways, onlyTyping } = addWays(DEV, null);
  assert.deepEqual(ways.map((w) => w.value), ['phone', 'clinic', 'type']);
  assert.equal(onlyTyping, false);
  assert.equal(easiest(ways), 1);
  assert.equal(ways[0].pill, 'Easiest');
  assert.ok(ways.every((w) => w.off === null));
});

test('the phone path not built: left out, and Easiest with it', () => {
  const { ways } = addWays({ ...DEV, phoneOpen: false }, null);
  assert.deepEqual(ways.map((w) => w.value), ['clinic', 'type']);
  assert.equal(easiest(ways), 0);
});

test('a patient on file with no birth date: both ways shown off with the sentence, no Easiest, no typing', () => {
  const { ways, onlyTyping } = addWays(DEV, { firstName: 'Ana', birth: null });
  assert.deepEqual(ways.map((w) => w.value), ['phone', 'clinic']);
  assert.equal(onlyTyping, false);
  assert.equal(easiest(ways), 0);
  assert.match(ways[0].off ?? '', /^Add Ana’s birth date to their record first/);
  assert.match(ways[1].off ?? '', /^Add Ana’s birth date to their record first/);
});

test('a patient on file with a birth date: the phone is open even while the notice does not cover a new patient', () => {
  const { ways } = addWays(REVIEWED, { firstName: 'Ana', birth: '1990-02-03' });
  assert.deepEqual(ways.map((w) => w.value), ['phone', 'clinic']);
  assert.equal(easiest(ways), 1);
  assert.equal(ways[1].line, 'On the clinic’s tablet, or hand this device to them.');
});

test('a patient on file and no consent form offered: no way at all (the page says to sign on paper), never typing', () => {
  const { ways, onlyTyping } = addWays(LIVE, { firstName: 'Ana', birth: '1990-02-03' });
  assert.deepEqual(ways, []);
  assert.equal(onlyTyping, false);
});

test('Easiest is only ever beside an open way', () => {
  for (const g of [LIVE, REVIEWED, DEV, { ...DEV, phoneOpen: false }]) {
    for (const p of [null, { firstName: 'Ana', birth: null }, { firstName: 'Ana', birth: '1990-02-03' }]) {
      const { ways } = addWays(g, p);
      assert.ok(easiest(ways) <= 1);
      for (const w of ways) if (w.pill) assert.equal(w.off, null, `${w.value} is Easiest while off`);
    }
  }
});
