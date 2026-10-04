// The chart's tooth names and its pictures' turns: every one of the 52 teeth, and what is not a tooth. No database.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs --test src/lib/tooth-name.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toothName, toothTitle } from './tooth-name.ts';
import { pictureKey, flipFor, tiltFor, PICTURES, MOUTH, PIC_W, PIC_H } from './tooth-drawing.ts';

const PERMANENT = ['central incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar', 'second molar', 'third molar'];
const BABY = ['baby central incisor', 'baby lateral incisor', 'baby canine', 'first baby molar', 'second baby molar'];
const SIDE: Record<number, string> = { 1: 'upper right', 2: 'upper left', 3: 'lower left', 4: 'lower right' };
const ALL = [
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => q * 10 + p)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((p) => q * 10 + p)),
];

test('every permanent and baby tooth has its name, by quadrant and place from the midline', () => {
  assert.equal(ALL.length, 52);
  for (const fdi of ALL) {
    const q = Math.floor(fdi / 10), p = fdi % 10;
    const kind = q >= 5 ? BABY[p - 1] : PERMANENT[p - 1];
    assert.equal(toothName(fdi), `${SIDE[((q - 1) % 4) + 1]} ${kind}`, String(fdi));
    assert.equal(toothTitle(fdi), toothName(fdi)[0].toUpperCase() + toothName(fdi).slice(1));
  }
  assert.equal(toothName(36), 'lower left first molar');
  assert.equal(toothName(11), 'upper right central incisor');
  assert.equal(toothName(54), 'upper right first baby molar');
  assert.equal(toothName(73), 'lower left baby canine');
  assert.equal(toothTitle(85), 'Lower right second baby molar');
});

test('what is not a tooth has no name', () => {
  for (const n of [0, 9, 10, 19, 20, 56, 59, 66, 76, 86, 90, 99, 100, -11, 1.5, Number.NaN]) {
    assert.equal(toothName(n), '', String(n));
    assert.equal(toothTitle(n), '', String(n));
  }
});

test('every tooth has a picture, its baby teeth their own', () => {
  for (const fdi of ALL) assert.ok(PICTURES[pictureKey(fdi)], String(fdi));
  assert.equal(Object.keys(PICTURES).length, 26);
  assert.equal(pictureKey(16), 'U6');
  assert.equal(pictureKey(38), 'L8');
  assert.equal(pictureKey(55), 'BU5');
  assert.equal(pictureKey(71), 'BL1');
});

test('the picture is turned so the crown faces the midline and the mesial side faces the middle of the chart', () => {
  // Drawn crown up with the mesial side on the right (the lower right quadrant as the chart shows it).
  const turn = (fdi: number) => flipFor(fdi).match(/-?\d+(\.\d+)?/g)!.map(Number);
  for (const fdi of ALL) {
    const q = ((Math.floor(fdi / 10) - 1) % 4) + 1;
    const [a, , , d, e, f] = turn(fdi);
    const upper = q === 1 || q === 2;
    // The patient's left (2, 3) is on the chart's right: mirrored, so the mesial side faces the midline on the left.
    const mirrored = q === 2 || q === 3;
    assert.equal(a, mirrored ? -1 : 1, `${fdi} mirror`);
    assert.equal(d, upper ? -1 : 1, `${fdi} upside down`);
    assert.equal(e, mirrored ? PIC_W : 0);
    assert.equal(f, upper ? PIC_H : 0);
    // An impacted tooth leans its crown toward the midline: clockwise on the upper left and the lower right.
    assert.equal(tiltFor(fdi), q === 2 || q === 4 ? 'cw' : 'ccw', `${fdi} tilt`);
  }
});

test('the mouth map has every tooth once, the patient\'s right on the left and the upper arch on top', () => {
  const perm = MOUTH.permanent, baby = MOUTH.primary;
  assert.deepEqual(perm.map((t) => t.fdi).sort((x, y) => x - y), ALL.filter((n) => n < 50));
  assert.deepEqual(baby.map((t) => t.fdi).sort((x, y) => x - y), ALL.filter((n) => n > 50));
  const at = (n: number) => [...perm, ...baby].find((t) => t.fdi === n)!;
  for (const [right, left] of [[11, 21], [18, 28], [41, 31], [48, 38], [51, 61], [85, 75]]) assert.ok(at(right).x < at(left).x, `${right} left of ${left}`);
  for (const [up, low] of [[11, 41], [21, 31], [16, 46], [51, 81]]) assert.ok(at(up).y < at(low).y, `${up} over ${low}`);
  // The front teeth at the front of each arch, the molars behind; the baby arch inside the permanent one.
  assert.ok(at(11).y < at(16).y && at(41).y > at(46).y);
  assert.ok(at(51).y > at(11).y && at(81).y < at(41).y);
  // Short numbers on the page: the corner is rounded here.
  for (const t of [...perm, ...baby]) for (const v of [t.x0, t.y0]) assert.equal(v, Math.round(v * 100) / 100);
});
