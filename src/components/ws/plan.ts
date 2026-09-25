// The group's Flossify plan in one line, or null: trial days left, an invoice
// due, an invoice overdue; nothing when the group is active with nothing to
// pay, which is most days. The layout asks once and hands the answer to
// <BillingNotice> (the line in the person menu) and to the person button,
// which is described by the line only when there is one.
//
// It starts the trial the first time a group's workspace is opened (state()
// ensures the subscription). It never breaks the page: if billing cannot be
// read, there is no line.
import { state, describe, type Notice } from '../../lib/billing';

export type { Notice };

export async function planLine(groupId: string): Promise<Notice | null> {
  try {
    const s = await state(groupId);
    return describe(s.sub, s.invoices);
  } catch (e) {
    console.error('plan line: could not read billing', e);
    return null;
  }
}
