// The patient pages' icons: the shell's set (src/components/ws/icons.ts) plus
// the few the record needs and the shell does not have — a heart (Health), a
// tooth (Chart), a shield with a tick (Consent) — and the patient forms' own
// (a QR code, a printer, a link, a phone, a filled-in form, make a new one). Drawn the shell's way:
// the inside of a 24×24 <svg>, a 1.75 stroke, round ends, no fill.
import { PATHS, type IconName } from '../../../../../components/ws/icons';

const OWN = {
  // a heart: what the patient told the clinic about their health
  heart: '<path d="M12 19.5c-.5 0-7.5-4.3-7.5-9.6a4.1 4.1 0 0 1 4.1-4.1c1.5 0 2.7.8 3.4 2 .7-1.2 1.9-2 3.4-2a4.1 4.1 0 0 1 4.1 4.1c0 5.3-7 9.6-7.5 9.6z"/>',
  // a molar: the chart
  tooth: '<path d="M7.6 4C5.4 4 4 5.8 4 8c0 2 .8 3.3 1.3 5 .6 2.2.8 6.5 2.5 6.5 1.7 0 1.6-4.5 4.2-4.5s2.5 4.5 4.2 4.5c1.7 0 1.9-4.3 2.5-6.5.5-1.7 1.3-3 1.3-5 0-2.2-1.4-4-3.6-4-1.7 0-2.6 1-4.4 1S9.3 4 7.6 4z"/>',
  // a shield with a tick: privacy consent
  shield: '<path d="M12 3.5l7 2.8v5.1c0 4.4-3 7.7-7 9.1-4-1.4-7-4.7-7-9.1V6.3z"/><path d="M9 12.2l2.1 2.1 4-4.1"/>',
  // a QR code: three finder squares and a few modules (the patient forms' code for the desk)
  qr: '<rect x="4" y="4" width="6" height="6" rx="1.3"/><rect x="14" y="4" width="6" height="6" rx="1.3"/><rect x="4" y="14" width="6" height="6" rx="1.3"/><path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17.5 20H20v-2.5"/>',
  // a printer
  print: '<path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6H7z"/>',
  // a chain link: a link to copy
  link: '<path d="M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path d="M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1"/>',
  // a phone: the patient fills it in on their own
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  // a clipboard with lines: a filled-in form
  form: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  // a refresh arrow: make a new one
  renew: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
} as const;

export type GlyphName = IconName | keyof typeof OWN;
export const glyphPaths = (name: GlyphName): string => (OWN as Record<string, string>)[name] ?? PATHS[name as IconName] ?? PATHS.info;
