// The patient pages' icons: the shell's set (src/components/ws/icons.ts) plus
// three the record needs and the shell does not have — a heart (Health), a
// tooth (Chart) and a shield with a tick (Consent). Drawn the shell's way:
// the inside of a 24×24 <svg>, a 1.75 stroke, round ends, no fill.
import { PATHS, type IconName } from '../../../../../components/ws/icons';

const OWN = {
  // a heart: what the patient told the clinic about their health
  heart: '<path d="M12 19.5c-.5 0-7.5-4.3-7.5-9.6a4.1 4.1 0 0 1 4.1-4.1c1.5 0 2.7.8 3.4 2 .7-1.2 1.9-2 3.4-2a4.1 4.1 0 0 1 4.1 4.1c0 5.3-7 9.6-7.5 9.6z"/>',
  // a molar: the chart
  tooth: '<path d="M7.6 4C5.4 4 4 5.8 4 8c0 2 .8 3.3 1.3 5 .6 2.2.8 6.5 2.5 6.5 1.7 0 1.6-4.5 4.2-4.5s2.5 4.5 4.2 4.5c1.7 0 1.9-4.3 2.5-6.5.5-1.7 1.3-3 1.3-5 0-2.2-1.4-4-3.6-4-1.7 0-2.6 1-4.4 1S9.3 4 7.6 4z"/>',
  // a shield with a tick: privacy consent
  shield: '<path d="M12 3.5l7 2.8v5.1c0 4.4-3 7.7-7 9.1-4-1.4-7-4.7-7-9.1V6.3z"/><path d="M9 12.2l2.1 2.1 4-4.1"/>',
} as const;

export type GlyphName = IconName | keyof typeof OWN;
export const glyphPaths = (name: GlyphName): string => (OWN as Record<string, string>)[name] ?? PATHS[name as IconName] ?? PATHS.info;
