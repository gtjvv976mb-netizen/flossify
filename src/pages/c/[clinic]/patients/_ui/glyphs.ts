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
  // a clock with a back-arrow: the Timeline, everything that happened
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/><path d="M12 8v4.2l2.8 1.8"/>',
  // a pen on a line: a clinical note
  pen: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>',
  // a capsule: a prescription
  pill: '<rect x="3.2" y="8.5" width="17.6" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  // a picture: X-rays and photos
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 15.5l-4.5-4.5-8 8"/>',
  // a clipboard with a tick: the treatment plan
  plan: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3.5h6v1M9 13l2 2 4-4"/>',
  // a flask: a lab case
  lab: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 17.6A2 2 0 0 0 7.1 20.5h9.8a2 2 0 0 0 1.7-2.9L13.5 8.7V3.5"/><path d="M7.6 14.5h8.8"/>',
  // a calendar with a tick: the next check-up
  recall: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.2"/><path d="M8 3.5v4M16 3.5v4M4 10h16M9.3 15l1.9 1.9 3.6-3.6"/>',
} as const;

export type GlyphName = IconName | keyof typeof OWN;
export const glyphPaths = (name: GlyphName): string => (OWN as Record<string, string>)[name] ?? PATHS[name as IconName] ?? PATHS.info;
