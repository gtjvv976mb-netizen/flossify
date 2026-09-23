// The one switch that lets Flossify invoice clinics. src/lib/billing.ts
// re-exports it next to the prices; it lives here, alone, because the SMS
// worker (scripts/sms/worker.ts) reads it under plain Node
// (node --experimental-strip-types), and billing.ts cannot load there: it
// imports src/lib/db.ts, which reads import.meta.env. So: no imports and only
// erasable TypeScript in this file.
//
// While it is false, nobody is invoiced: the worker skips the monthly run and
// says so once when it starts, the operations page has no Issue button, and
// the clinics' Billing pages say the prices are not final and do not state the
// late-payment policy. An invoice still 'due' from before (made at placeholder
// prices) is shown to the clinic as "do not pay", never as owed.
//
// Before you set it true, void those old invoices (status 'void'): once it is
// true, every invoice still 'due' is asked for again, at the price it was made at.

/** Set true only once the prices, the pay-to details, the billing email and the pause policy in src/lib/billing.ts are the real ones. */
export const BILLING_FINAL: boolean = false;
