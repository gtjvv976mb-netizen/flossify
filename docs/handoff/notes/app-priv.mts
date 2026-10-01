// As the app's own role (DATABASE_URL, flossify_app): reads and inserts on appointment_contact work inside a
// clinic transaction; update and delete are refused; nothing is visible without a tenant.
import '/home/user/flossify/.claude/worktrees/agent-a74d7331d264413bc/src/lib/dotenv.ts';
import { pool, withClinic } from '/home/user/flossify/.claude/worktrees/agent-a74d7331d264413bc/src/lib/db.ts';

const CLINIC = '97c56fa2-6423-4ed8-9c38-1bcaae9c247e';
const who = await pool.query('select current_user');
console.log('role:', who.rows[0].current_user);
console.log('rows visible with no tenant:', (await pool.query('select count(*)::int as n from appointment_contact')).rows[0].n);
const r = await withClinic(CLINIC, async (tx) => {
  const n = (await tx.query('select count(*)::int as n from appointment_contact')).rows[0].n;
  const out: Record<string, string> = { select: `ok (${n} rows)` };
  for (const [name, sql] of [['update', `update appointment_contact set note = 'x'`], ['delete', 'delete from appointment_contact']]) {
    await tx.query('savepoint s');
    try { await tx.query(sql); out[name] = 'ALLOWED (bad)'; } catch (e: any) { out[name] = `refused: ${e.message}`; }
    await tx.query('rollback to savepoint s');
  }
  return out;
});
console.log(r);
await pool.end();
