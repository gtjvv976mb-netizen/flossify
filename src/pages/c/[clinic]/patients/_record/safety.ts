// The record's safety line: what anyone must know before touching the patient, in plain words and never buttons
// (./SafetyLine.astro draws it). The head shows it in full; the tab row pins a copy of it while the record is
// scrolled (./RecordNav.astro): from 768px a compact second line of the row, below it one line of words above the
// five columns. Allergies come first and are never cut short; with none on file the line says which kind of none —
// "No known allergies" (the patient said so) or "Allergies: not asked yet" — so an empty line never passes for safe.
// Then the conditions, the medicines, a blood pressure taken today or out of range, a physician's clearance, and a
// patient under 18. Every item carries its words: colour is never alone.
import type { IconName } from '../../../../../components/ws/icons';

export type SafetyTone = 'alert' | 'warn' | 'neutral' | 'accent' | 'ok';
export type SafetyKind = 'allergy' | 'allergy-none' | 'allergy-unasked' | 'condition' | 'medicine' | 'bp' | 'clearance' | 'minor';
export interface SafetyItem { kind: SafetyKind; text: string; tone: SafetyTone; icon?: IconName }

/** The allergy items: never folded away in the pinned copy, and the lead of the phone's line. */
export const isAllergy = (i: SafetyItem) => i.kind === 'allergy' || i.kind === 'allergy-none' || i.kind === 'allergy-unasked';

export function safetyItems(a: {
  /** null: never asked (no health history, or allergies left unanswered); [] the patient has none. */
  allergies: string[] | null;
  conditions: string[];
  medications: string[];
  bp: { text: string; tone: 'alert' | 'warn' | 'neutral' } | null;
  clearance: { text: string; tone: 'alert' | 'warn' | 'accent' } | null;
  minor: string | null;
}): SafetyItem[] {
  const items: SafetyItem[] = [];
  if (a.allergies === null) items.push({ kind: 'allergy-unasked', text: 'Allergies: not asked yet', tone: 'warn', icon: 'alert' });
  else if (a.allergies.length === 0) items.push({ kind: 'allergy-none', text: 'No known allergies', tone: 'ok', icon: 'check' });
  else for (const x of a.allergies) items.push({ kind: 'allergy', text: `Allergy: ${x}`, tone: 'alert', icon: 'alert' });
  for (const x of a.conditions) items.push({ kind: 'condition', text: x, tone: 'warn' });
  for (const x of a.medications) items.push({ kind: 'medicine', text: `Takes ${x}`, tone: 'neutral' });
  if (a.bp) items.push({ kind: 'bp', text: a.bp.text, tone: a.bp.tone, icon: a.bp.tone === 'neutral' ? undefined : 'alert' });
  if (a.clearance) items.push({ kind: 'clearance', text: a.clearance.text, tone: a.clearance.tone, icon: a.clearance.tone === 'accent' ? 'check' : 'alert' });
  if (a.minor) items.push({ kind: 'minor', text: a.minor, tone: 'warn', icon: 'user' });
  return items;
}

/** The phone's pinned line: the allergies in full ("Allergy: Penicillin", "Allergies: Penicillin, Latex"), or which
 *  kind of none, and how many more alerts the head has (the other items and the note for the dentist). */
export function safetyLine(allergies: string[] | null, items: SafetyItem[], note: string | null): { text: string; tone: SafetyTone; more: number } {
  const more = items.filter((i) => !isAllergy(i)).length + (note ? 1 : 0);
  if (allergies === null) return { text: 'Allergies: not asked yet', tone: 'warn', more };
  if (allergies.length === 0) return { text: 'No known allergies', tone: 'ok', more };
  return { text: `${allergies.length === 1 ? 'Allergy' : 'Allergies'}: ${allergies.join(', ')}`, tone: 'alert', more };
}
