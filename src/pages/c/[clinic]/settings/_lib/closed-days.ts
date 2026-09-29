// Closed days (040): the dated blocks a clinic adds from Clinic settings — the clinic closed for a holiday, a
// typhoon or a meeting, a dentist away on leave or at a seminar. Whole Manila days only here (from and until,
// until blank for one day); a few hours, and a chair out of use, are blocked from the calendar's Block time.
// The list shows every block ahead, whichever screen added it, and removes any of them.
//
// Two forms, `closed-add` and `closed-remove`, dispatched by Settings like every section (CSRF, settings.edit).
// The work is src/lib/blocks.ts, the same the calendar's /api/schedule/blocks calls: readWholeDays checks what
// was sent (its words are p07's §3.3), addBlock and removeBlock take the book's lock, check the dentist, write,
// audit (schedule.block, schedule.unblock), and say which visits are already booked inside. Nothing is texted,
// moved or cancelled: those visits are listed on Calls → In closed time.
import { withClinic } from '../../../../../lib/db';
import { addBlock, removeBlock, readWholeDays, upcomingBlocks, BlockRefused, type BlockRange } from '../../../../../lib/blocks';
import { UUID } from './common';

/** What the Add form holds: as posted when it comes back refused, empty otherwise. */
export interface ClosedValues { kind: 'closed' | 'leave'; dentist: string; from: string; until: string; note: string }
export const emptyClosed = (): ClosedValues => ({ kind: 'closed', dentist: '', from: '', until: '', note: '' });
export interface ClosedRefused { problems: string[]; values: ClosedValues; form: 'closed-add' | 'closed-remove' }

const see = (location: string) => new Response(null, { status: 303, headers: { location } });

/** Add or remove a closed day. A redirect to the section when done; the problem and what was typed when not. */
export async function closedDaysAction(o: { clinicId: string; staffId: string; base: string; form: FormData }): Promise<Response | ClosedRefused> {
  const { form } = o;
  const which = String(form.get('form') ?? '') === 'closed-remove' ? 'closed-remove' : 'closed-add';
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const values: ClosedValues = which === 'closed-add'
    ? { kind: s('kind') === 'leave' ? 'leave' : 'closed', dentist: s('dentist'), from: s('from'), until: s('until'), note: String(form.get('note') ?? '') }
    : emptyClosed();
  const refuse = (problem: string): ClosedRefused => ({ problems: [problem], values, form: which });
  try {
    if (which === 'closed-remove') {
      const id = s('id').toLowerCase();
      if (!UUID.test(id)) return refuse('That block is not on this book.');
      await withClinic(o.clinicId, (tx) => removeBlock(tx, o.clinicId, o.staffId, id));
      return see(`${o.base}?saved=closed&block=removed#closed`);
    }
    const nb = readWholeDays(form, { now: new Date() });
    if ('error' in nb) return refuse(nb.error);
    const { block, inside } = await withClinic(o.clinicId, (tx) => addBlock(tx, o.clinicId, o.staffId, nb));
    return see(`${o.base}?saved=closed&block=added&id=${block.id}&inside=${inside.length}#closed`);
  } catch (e) {
    if (e instanceof BlockRefused) return refuse(e.message);
    throw e;
  }
}

/** The dated blocks ahead, soonest first (100 at most). */
export const loadClosedDays = (clinicId: string): Promise<BlockRange[]> => withClinic(clinicId, (tx) => upcomingBlocks(tx, clinicId));

/** The dentists a leave can be for: people who treat patients and can open this branch or have days here (isDentistHere's rule). */
export async function dentistsHere(clinicId: string): Promise<{ id: string; name: string }[]> {
  // staff_schedule is clinic data: read under this branch's tenant (staff and staff_access are group tables).
  const { rows } = await withClinic(clinicId, (tx) => tx.query<{ id: string; name: string }>(
    `select s.id, s.full_name as name from staff s
      where s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
        and (exists (select 1 from staff_access a where a.staff_id = s.id and a.clinic_id = $1)
          or exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = $1))
      order by s.role = 'owner' desc, s.full_name`, [clinicId]));
  return rows;
}
