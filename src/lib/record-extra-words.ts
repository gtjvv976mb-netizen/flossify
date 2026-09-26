// Blood pressure and pulse in words (034), with no Node or database imports, so a page's script may import it.
// The bands dental guides commonly use before local anaesthesia (after the AHA's adult categories). A
// guide, not a diagnosis: the page says so, and the dentist decides.
export type BpLevel = 'low' | 'normal' | 'raised' | 'high' | 'crisis';
export interface BpWords { level: BpLevel; label: string; advice: string; tone: 'neutral' | 'warn' | 'alert' }
export function bpWords(sys: number, dia: number): BpWords {
  if (sys >= 180 || dia >= 110) return { level: 'crisis', label: 'Very high', advice: 'Postpone treatment that can wait, and refer to a physician today.', tone: 'alert' };
  if (sys >= 160 || dia >= 100) return { level: 'high', label: 'High', advice: 'Ask for medical clearance before an extraction or surgery.', tone: 'alert' };
  if (sys >= 140 || dia >= 90) return { level: 'raised', label: 'Raised', advice: 'Take it again after a few minutes’ rest, before anaesthesia.', tone: 'warn' };
  if (sys < 90 || dia < 60) return { level: 'low', label: 'Low', advice: 'Ask how they feel; take it again lying back.', tone: 'warn' };
  return { level: 'normal', label: 'In the usual range', advice: '', tone: 'neutral' };
}
export const pulseWords = (p: number) => (p > 100 ? 'fast' : p < 50 ? 'slow' : null);
