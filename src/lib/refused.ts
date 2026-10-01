// A post the server refuses, thrown out of a withClinic() transaction so the
// whole transaction rolls back — its rev bump and anything half-written with
// it — and caught by the page outside the transaction, which draws the form
// again with what was typed and these sentences ("Nothing was saved. N things
// to fix:"). The intake (intake.ts) and the consent documents (consent-docs.ts)
// always throw it; they never return a refusal.
//
// Add patient typed in (src/pages/c/[clinic]/patients/new/type.astro) and the
// patient record (src/pages/c/[clinic]/patients/[patient].astro, its outcome as
// the detail) use this one. Two pages still keep a copy of their own, moved
// here as each is next touched: src/pages/api/recall.ts and
// src/pages/c/[clinic]/calls/index.astro.
//
// The sentences are for the person at the page: plain words, never an answer
// a patient typed (a refusal may reach a log as an error's message: it is only
// ever the word "refused").

export class Refused<D = undefined> extends Error {
  /** One sentence per thing to fix, in the order the page shows them. */
  readonly reasons: string[];
  /** What else the page needs to draw the refusal (which panel, what was typed), when it is not the reasons alone. */
  readonly detail: D;

  constructor(reasons: string | readonly string[], ...detail: D extends undefined ? [] : [D]) {
    super('refused');
    this.name = 'Refused';
    this.reasons = typeof reasons === 'string' ? [reasons] : [...reasons];
    this.detail = detail[0] as D;
  }
}

/** True for a Refused, from this module (not a page's own copy). */
export const isRefused = (e: unknown): e is Refused<unknown> => e instanceof Refused;
