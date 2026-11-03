// The PRC text to a clinic's owner is one message: GSM-7 only and at most 160 characters, for a dentist's name up to
// the 80 characters People allows (an accent GSM-7 lacks is taken off its letter: María → Maria) and a licence of 4 to
// 12 digits (People takes 4 to 10, /start/ 4 to 12), or none. An owner's name from /start/ has no cap; a name too long
// for any wording goes as the fewest messages, the fullest wording of those. It names the place by its name on screen,
// with a comma for the arrow (docs/glossary.md, "Places"). No database.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs --test src/lib/messages.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texts, smsLength, smsParts, oneText, gsmName } from './messages.ts';
import { isGsm7 } from './text-templates.ts';

const NAMES: Record<number, string> = {
  17: 'Dr. Hazel Tabanao',
  41: 'Dr. Maria Concepcion Dela Cruz-Villanueva',
  55: 'Dr. Maria Concepcion Dela Cruz-Villanueva y Magsaysay',
  67: 'Dr. Maria Concepcion Josefina Dela Cruz-Villanueva y Magsaysay, DMD',
  80: 'Dr. Maria Concepcion Josefina Dela Cruz-Villanueva y Magsaysay-Bautista Jr. III',
};
const LENGTHS = [17, 41, 55, 67, 80];
const sized = (n: number) => NAMES[n].padEnd(n, 'a').slice(0, n);
const NUMBERS = ['0043', '0043321', '0043321999', '004332199912', '(none on file)'];

test('the names are the lengths the test says', () => {
  for (const n of LENGTHS) assert.equal(sized(n).length, n);
});

test('every PRC text is one GSM-7 message, and names Clinic settings, People', () => {
  for (const n of LENGTHS) {
    for (const prc of NUMBERS) {
      const body = texts.prcMismatch(sized(n), prc);
      const at = `${n}-character name, ${prc}: ${body}`;
      assert.ok(isGsm7(body), `not GSM-7 (${at})`);
      assert.deepEqual(smsLength(body), { length: body.length, max: 160 }, at);
      assert.ok(body.length <= 160, `${body.length} characters (${at})`);
      assert.ok(body.startsWith(`Flossify: ${sized(n)}`), `the dentist is named in full (${at})`);
      assert.ok(body.endsWith(' in Clinic settings, People.'), at);
      assert.doesNotMatch(body, /Team|→|http|www\.|reply/i, at);
    }
  }
});

test('the fullest wording that fits is the one sent', () => {
  assert.equal(texts.prcMismatch('Dr. Hazel Tabanao', '0043321'),
    'Flossify: Dr. Hazel Tabanao\'s PRC licence 0043321 did not match PRC\'s records, so their profile says "PRC check pending". Check it in Clinic settings, People.');
  assert.equal(texts.prcMismatch('Dr. Hazel Tabanao', '(none on file)'),
    'Flossify: Dr. Hazel Tabanao has no PRC licence number on file, so their profile says "PRC check pending". Add it in Clinic settings, People.');
  // A number, when it fits; a shorter sentence before the number is dropped.
  assert.match(texts.prcMismatch(sized(55), '0043321999'), /PRC licence 0043321999 did not match PRC's records\. Check it/);
  assert.match(texts.prcMismatch(sized(67), '0043321'), /'s PRC licence 0043321 did not match\. Check it in Clinic settings, People\.$/);
  assert.match(texts.prcMismatch(sized(80), '0043321'), /'s PRC licence did not match\. Check it in Clinic settings, People\.$/);
  assert.match(texts.prcMismatch(sized(80), '(none on file)'), / has no PRC licence number on file\. Add it in Clinic settings, People\.$/);
});

test('the number is kept whenever a wording with it fits in one message', () => {
  for (let n = 1; n <= 80; n++) {
    for (let digits = 4; digits <= 12; digits++) {
      const name = 'x'.repeat(n), prc = '7'.repeat(digits);
      const body = texts.prcMismatch(name, prc);
      const withNumber = `Flossify: ${name}'s PRC licence ${prc} did not match. Check it in Clinic settings, People.`;
      if (withNumber.length <= 160) assert.ok(body.includes(prc), `${n}-character name, ${digits} digits: ${body}`);
      assert.ok(body.length <= 160, `${n}-character name, ${digits} digits: ${body.length}`);
    }
  }
});

test('a curly apostrophe from a phone keyboard does not cost the text its GSM-7', () => {
  for (const name of ['Dr. Ana D’Souza', 'Dr. Ana D´Souza', 'Dr. Ana DʼSouza', 'Dr. Ana D`Souza']) {
    const body = texts.prcMismatch(name, '0043321');
    assert.ok(isGsm7(body), body);
    assert.match(body, /^Flossify: Dr\. Ana D'Souza's PRC licence 0043321 did not match PRC's records, so their profile says/);
  }
});

test('an accent GSM-7 lacks is taken off its letter, and the text keeps its fullest wording', () => {
  assert.equal(gsmName('Dr. María Ramón Concepción'), 'Dr. Maria Ramon Concepcion');
  assert.equal(gsmName('Dr. Jesús Gómez-Sánchez'), 'Dr. Jesus Gomez-Sanchez');
  assert.equal(gsmName('Dr. François Gonçalves'), 'Dr. Francois Goncalves');
  // What GSM-7 has stays as typed.
  assert.equal(gsmName('Dr. José Cariño Müller'), 'Dr. José Cariño Müller');
  assert.equal(gsmName('Dr. Ma. Ñiguez'), 'Dr. Ma. Ñiguez');
  // Decomposed input (a mark typed after its letter) folds the same.
  assert.equal(gsmName('Dr. María'), 'Dr. Maria');
  for (const name of ['Dr. María Ramón Concepción', 'Dr. José Ramírez', 'Dr. Ma. Lourdes Gómez-Sánchez', 'Dr. Jesús Santos', 'María Cruz']) {
    const folded = gsmName(name);
    const full = texts.prcMismatch(name, '0043321');
    assert.ok(isGsm7(full), full);
    assert.ok(full.length <= 160, `${full.length}: ${full}`);
    assert.ok(full.startsWith(`Flossify: ${folded}'s PRC licence 0043321 did not match PRC's records`), full);
    const none = texts.prcMismatch(name, '(none on file)');
    assert.ok(isGsm7(none), none);
    assert.ok(none.length <= 160, `${none.length}: ${none}`);
    assert.equal(none, `Flossify: ${folded} has no PRC licence number on file, so their profile says "PRC check pending". Add it in Clinic settings, People.`);
  }
});

test('a name GSM-7 cannot carry goes as the fewest messages, the fullest wording of those', () => {
  const body = texts.prcMismatch('Dr. Łukasz Nowak', '0043321');
  assert.equal(smsParts(body), 2);
  assert.match(body, /PRC licence 0043321 did not match PRC's records\. Check it/);
  // A name from /start/ past what one message holds: two messages, with everything in them.
  const long = 'Dr. ' + 'Abcdefghij '.repeat(9).trim();
  const both = texts.prcMismatch(long, '0043321');
  assert.equal(smsParts(both), 2);
  assert.match(both, /did not match PRC's records, so their profile says "PRC check pending"\. Check it/);
});

test('smsLength counts as the network does', () => {
  assert.deepEqual(smsLength('a'.repeat(160)), { length: 160, max: 160 });
  assert.deepEqual(smsLength('Cariño, José'), { length: 12, max: 160 });
  assert.deepEqual(smsLength('a{b}'), { length: 6, max: 160 });
  assert.deepEqual(smsLength('Clinic settings → People'), { length: 24, max: 70 });
  assert.deepEqual(smsLength('₱1,500'), { length: 6, max: 70 });
  assert.equal(smsParts('a'.repeat(160)), 1);
  assert.equal(smsParts('a'.repeat(161)), 2);
  assert.equal(smsParts('a'.repeat(307)), 3);
  assert.equal(smsParts('→'.repeat(70)), 1);
  assert.equal(smsParts('→'.repeat(71)), 2);
});

test('oneText takes the first that fits, else the fewest messages, the first of those', () => {
  const long = 'x'.repeat(161), fits = 'y'.repeat(160), short = 'z';
  assert.equal(oneText(long, fits, short), fits);
  assert.equal(oneText(long, long + 'a'), long);
  assert.equal(oneText('x'.repeat(400), long), long);
  assert.equal(oneText('→'.repeat(71), short), short);
  assert.equal(oneText('→'.repeat(70), short), '→'.repeat(70));
});
