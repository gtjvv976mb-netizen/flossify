// The record's sections, grouped and colour-coded so a person always knows where they are: the same hue on
// the section's button in the record's index, its banner, its cards' top edge and icons, and its lines on
// the Timeline. Five groups, each a hue the workspace already has in both themes — teal for the patient,
// rose for health, blue for clinical work, violet for documents, green for money — and never amber or red,
// which keep their meanings ("needs attention", "blocked"). Colour is never alone: every button, banner
// and card also says its group and name in words.
import type { GlyphName } from '../_ui/glyphs';

export type Hue = 'teal' | 'rose' | 'blue' | 'violet' | 'green';
export interface SectionMeta { group: string; hue: Hue; icon: GlyphName; blurb: string }

export const GROUPS: { name: string; hue: Hue }[] = [
  { name: 'Patient', hue: 'teal' },
  { name: 'Health', hue: 'rose' },
  { name: 'Clinical', hue: 'blue' },
  { name: 'Documents', hue: 'violet' },
  { name: 'Billing', hue: 'green' },
];

export const SECTION_META: Record<string, SectionMeta> = {
  overview: { group: 'Patient', hue: 'teal', icon: 'user', blurb: 'Who they are, the next check-up, and each part of the record in short.' },
  timeline: { group: 'Patient', hue: 'teal', icon: 'history', blurb: 'Everything on the record, newest first.' },
  visits: { group: 'Patient', hue: 'teal', icon: 'calendar', blurb: 'Every booking and visit, past and coming.' },
  health: { group: 'Health', hue: 'rose', icon: 'heart', blurb: 'Blood pressure, allergies, conditions and medicines. Check before treatment.' },
  chart: { group: 'Clinical', hue: 'blue', icon: 'tooth', blurb: 'The teeth as they are. Every change saves as you make it.' },
  treatment: { group: 'Clinical', hue: 'blue', icon: 'plan', blurb: 'The plan, work done, lab cases, HMO approvals and payment plans.' },
  notes: { group: 'Clinical', hue: 'blue', icon: 'pen', blurb: 'What the dentist found and did at each visit.' },
  files: { group: 'Clinical', hue: 'blue', icon: 'image', blurb: 'X-rays, photos and scanned papers.' },
  rx: { group: 'Documents', hue: 'violet', icon: 'pill', blurb: 'Prescriptions, certificates, referrals and clearance requests to print.' },
  consent: { group: 'Documents', hue: 'violet', icon: 'shield', blurb: 'The privacy notice, the treatment consent and the patient forms.' },
  texts: { group: 'Documents', hue: 'violet', icon: 'message', blurb: 'Texts sent to and from this patient.' },
  money: { group: 'Billing', hue: 'green', icon: 'money', blurb: 'Statements, payments and what is owed.' },
};
