// Every time in the clinic film, in one place.
//
// The film is two generated shots joined without a cut (docs/generation.md):
// an exterior approach from the street to the open front door, then the
// 30-second interior take from that door to the dental chair. `lead` is how
// long the approach runs before the take begins; every moment inside the
// building is `lead` plus its time in the take, so re-cutting the approach is
// a one-number change here.

/** Seconds of exterior approach before the interior take's first frame. */
export const LEAD = 9.767;
/** Length of the interior take, seconds. */
export const TAKE = 30;
/** Length of the whole film. */
export const FILM = LEAD + TAKE;

/** Moments in the interior take, read off its frame sheet (seconds from the door). */
const TAKE_AT = { door: 0, reception: 5.1, corridor: 12.6, chair: 24, deskHold: 9.0, walkFrom: 2.0 } as const;

/** Where each room begins, as a fraction of the whole film: the home page's rail switches here. */
export const ROOM_FROM = {
  outside: 0,
  reception: (LEAD + TAKE_AT.reception) / FILM,
  corridor: (LEAD + TAKE_AT.corridor) / FILM,
  chair: (LEAD + TAKE_AT.chair) / FILM,
} as const;

/** The sign-in walk: from just outside the door to the reception desk, then hold. */
export const SIGNIN_WALK = { from: LEAD + TAKE_AT.walkFrom, to: LEAD + TAKE_AT.deskHold, rate: 0.85 } as const;
