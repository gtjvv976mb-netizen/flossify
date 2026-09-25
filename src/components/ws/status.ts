// The workspace's status colours, in one place. A visit's status uses the
// Today page's queue colours exactly (CLAUDE.md, "The schedule": they are the
// only status colours), and every chip carries its word: status is never
// colour alone. Used by <Chip status="…"> and by any script that draws a card
// in the browser (import { STATUS } from '…/components/ws/status').
//
// The class strings are written out whole so Tailwind finds them here.

export type Tone = 'neutral' | 'muted' | 'accent' | 'solid' | 'warn' | 'alert';

export const TONE: Record<Tone, string> = {
  neutral: 'bg-bg-soft text-ink-2',
  muted: 'bg-bg-soft text-muted',
  accent: 'bg-accent/10 text-accent-deep',
  solid: 'bg-accent text-surface',
  warn: 'bg-crown/20 text-crown',
  alert: 'bg-caries/15 text-caries',
};

/** appointment.status → the word and the queue colour. */
export const STATUS: Record<string, { label: string; tone: Tone; cls: string }> = {
  in_chair: { label: 'In chair', tone: 'solid', cls: TONE.solid },
  in_lobby: { label: 'In lobby', tone: 'warn', cls: TONE.warn },
  arrived: { label: 'Arrived', tone: 'warn', cls: TONE.warn },
  confirmed: { label: 'Confirmed', tone: 'neutral', cls: TONE.neutral },
  booked: { label: 'Booked', tone: 'neutral', cls: TONE.neutral },
  completed: { label: 'Completed', tone: 'muted', cls: TONE.muted },
  no_show: { label: 'No show', tone: 'alert', cls: TONE.alert },
  cancelled: { label: 'Cancelled', tone: 'muted', cls: TONE.muted },
};

export const statusOf = (s: string | null | undefined) => STATUS[s ?? ''] ?? STATUS.booked;
