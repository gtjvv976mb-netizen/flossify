// Tasks (032; docs/clinic-sites-design.md, P4): to-dos at one branch. Whoever
// may assign tasks (can(ws, 'tasks.assign')) gives them to anyone active at the
// branch; everyone may note one for themselves. The person it is for, and the
// person who gave it, tick it done or back; the giver can take it back
// (cancel). Every read and write runs inside withClinic (row-level security);
// who may touch which task is checked here, in the same transaction.
import { pool, withClinic, type Tx } from './db';
import { manilaToday } from './health';

export const TITLE_MAX = 120;
export const NOTES_MAX = 1000;

export interface Task {
  id: string; title: string; notes: string | null; dueOn: string | null;
  assigneeId: string; assigneeName: string; createdBy: string | null; creatorName: string | null;
  createdAt: Date; doneAt: Date | null; doneByName: string | null;
}

const SELECT = `select t.id, t.title, t.notes, to_char(t.due_on, 'YYYY-MM-DD') as due_on, t.assignee_id, a.full_name as assignee_name,
                       t.created_by, c.full_name as creator_name, t.created_at, t.done_at, d.full_name as done_by_name
                  from clinic_task t
                  join staff a on a.id = t.assignee_id
                  left join staff c on c.id = t.created_by
                  left join staff d on d.id = t.done_by`;
const toTask = (r: Record<string, any>): Task => ({
  id: r.id, title: r.title, notes: r.notes, dueOn: r.due_on, assigneeId: r.assignee_id, assigneeName: r.assignee_name,
  createdBy: r.created_by, creatorName: r.creator_name, createdAt: new Date(r.created_at), doneAt: r.done_at ? new Date(r.done_at) : null,
  doneByName: r.done_by_name,
});
// Open first — overdue, then due soonest, then undated — and what was finished in the last week after.
const ORDER = `order by (t.done_at is not null), t.due_on nulls last, t.created_at`;
const RECENT = `(t.done_at is null or t.done_at > now() - interval '7 days') and t.cancelled_at is null`;

/** Mine: tasks for this person, open and done this week. */
export async function tasksFor(tx: Tx, staffId: string): Promise<Task[]> {
  return (await tx.query(`${SELECT} where t.assignee_id = $1 and ${RECENT} ${ORDER} limit 100`, [staffId])).rows.map(toTask);
}

/** Given: tasks this person gave to others, open and done this week. */
export async function tasksGivenBy(tx: Tx, staffId: string): Promise<Task[]> {
  return (await tx.query(`${SELECT} where t.created_by = $1 and t.assignee_id <> $1 and ${RECENT} ${ORDER} limit 100`, [staffId])).rows.map(toTask);
}

/** How many of this person's tasks are open, for the Dashboard's line. */
export async function openCount(tx: Tx, staffId: string): Promise<number> {
  return (await tx.query(`select count(*)::int as n from clinic_task where assignee_id = $1 and done_at is null and cancelled_at is null`, [staffId])).rows[0].n;
}

/** Who a task can be for at this branch: everyone active with access here. */
export async function assignable(clinicId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await pool.query(
    `select s.id, s.full_name as name from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $1
      where s.disabled_at is null order by s.full_name`, [clinicId]);
  return rows;
}

/** "Due today", "Overdue · 2 days", "Due Thu 1 Oct", or nothing. With a tone for the chip. */
export function dueWords(t: Pick<Task, 'dueOn' | 'doneAt'>, today = manilaToday()): { text: string; tone: 'warn' | 'alert' | 'neutral' } | null {
  if (!t.dueOn || t.doneAt) return null;
  const days = Math.round((Date.parse(`${t.dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `Overdue · ${-days === 1 ? '1 day' : `${-days} days`}`, tone: 'alert' };
  if (days === 0) return { text: 'Due today', tone: 'warn' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'neutral' };
  const d = new Date(`${t.dueOn}T00:00:00+08:00`);
  return { text: `Due ${new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Manila' }).format(d)}`, tone: 'neutral' };
}

export interface TaskInput { title: string; notes: string; dueOn: string; assigneeId: string }
export type TaskResult = { ok: true; id: string } | { ok: false; error: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: string, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '').trim().slice(0, max + 1);

/** Give a task (or note one for yourself). `mayAssign` is can(ws, 'tasks.assign'). */
export async function addTask(a: { clinicId: string; staffId: string; mayAssign: boolean; input: TaskInput }): Promise<TaskResult> {
  const title = clean(a.input.title, TITLE_MAX).replace(/\s+/g, ' ');
  const notes = clean(a.input.notes, NOTES_MAX);
  const due = String(a.input.dueOn ?? '').trim();
  const who = UUID.test(a.input.assigneeId) ? a.input.assigneeId : a.staffId;
  if (!title) return { ok: false, error: 'Write what needs doing.' };
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the task to ${TITLE_MAX} characters; put the rest in the notes.` };
  if (notes.length > NOTES_MAX) return { ok: false, error: `Keep the notes to ${NOTES_MAX} characters.` };
  if (due && (!ISO_DAY.test(due) || Number.isNaN(Date.parse(`${due}T00:00:00Z`)))) return { ok: false, error: 'That due date is not a day on the calendar.' };
  if (who !== a.staffId && !a.mayAssign) return { ok: false, error: 'Your role cannot give tasks to others. You can note one for yourself.' };
  const people = await assignable(a.clinicId);
  if (!people.some((p) => p.id === who)) return { ok: false, error: 'Choose someone who works at this branch.' };
  const id = await withClinic(a.clinicId, async (tx) => (await tx.query(
    `insert into clinic_task (clinic_id, title, notes, due_on, assignee_id, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
    [a.clinicId, title, notes || null, due || null, who, a.staffId])).rows[0].id as string);
  return { ok: true, id };
}

/** Tick done, tick back, or take back. Done and back: the person it is for, or whoever gave it.
 *  Take back: whoever gave it. Returns false when this person may not, or the task is gone. */
export async function taskAct(a: { clinicId: string; staffId: string; taskId: string; act: 'done' | 'undo' | 'cancel' }): Promise<boolean> {
  if (!UUID.test(a.taskId)) return false;
  return withClinic(a.clinicId, async (tx) => {
    const t = (await tx.query('select assignee_id, created_by from clinic_task where id = $1 and cancelled_at is null for update', [a.taskId])).rows[0];
    if (!t) return false;
    const mine = t.assignee_id === a.staffId, gave = t.created_by === a.staffId;
    if (a.act === 'cancel') {
      if (!gave) return false;
      await tx.query('update clinic_task set cancelled_at = now() where id = $1', [a.taskId]);
      return true;
    }
    if (!mine && !gave) return false;
    await tx.query(a.act === 'done'
      ? 'update clinic_task set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, $2) where id = $1'
      : 'update clinic_task set done_at = null, done_by = null where id = $1', a.act === 'done' ? [a.taskId, a.staffId] : [a.taskId]);
    return true;
  });
}
