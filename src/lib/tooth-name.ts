// A tooth's name from its FDI number, for the chart's labels, its palette and the mouth map: "lower left first molar",
// "upper right second baby molar". Pure (no Node imports): the chart's script imports it too.
//
// FDI: the first digit is the quadrant as the patient has it — 1 upper right, 2 upper left, 3 lower left, 4 lower
// right; 5–8 the same for the baby teeth — and the second the tooth's place counted from the midline.

const PERMANENT = ['', 'central incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar', 'second molar', 'third molar'];
const BABY = ['', 'baby central incisor', 'baby lateral incisor', 'baby canine', 'first baby molar', 'second baby molar'];
const SIDE = ['', 'upper right', 'upper left', 'lower left', 'lower right'];

/** "lower left first molar" (lower case, to follow a number: "Tooth 36, lower left first molar"); '' for a number that is
 *  not a tooth. */
export function toothName(fdi: number): string {
  const q = Math.floor(fdi / 10);
  const pos = fdi % 10;
  if (!Number.isInteger(fdi) || q < 1 || q > 8) return '';
  const baby = q >= 5;
  const kind = (baby ? BABY : PERMANENT)[pos];
  if (!kind || pos < 1) return '';
  return `${SIDE[((q - 1) % 4) + 1]} ${kind}`;
}

/** "Lower left first molar": the name on its own, as a title. */
export function toothTitle(fdi: number): string {
  const n = toothName(fdi);
  return n ? n[0].toUpperCase() + n.slice(1) : '';
}
