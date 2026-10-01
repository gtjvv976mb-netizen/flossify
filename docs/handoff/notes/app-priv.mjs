// As the app's own role (DATABASE_URL from .env, flossify_app): reads and inserts on appointment_contact work
// inside a clinic transaction; update and delete are refused; nothing is visible without a tenant.
// Run: node --env-file=.env app-priv.mjs (from the worktree, so .env is the app's own settings).
import pg from 'pg';

const CLINIC = '97c56fa2-6423-4ed8-9c38-1bcaae9c247e';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log('role:', (await c.query('select current_user')).rows[0].current_user);
console.log('rows visible with no tenant:', (await c.query('select count(*)::int as n from appointment_contact')).rows[0].n);
await c.query('begin');
await c.query("select set_config('app.clinic_id', $1, true)", [CLINIC]);
console.log('rows in tenant:', (await c.query('select count(*)::int as n from appointment_contact')).rows[0].n);
for (const [name, sql] of [['update', `update appointment_contact set note = 'x'`], ['delete', 'delete from appointment_contact'], ['truncate', 'truncate appointment_contact']]) {
  await c.query('savepoint s');
  try { await c.query(sql); console.log(`${name}: ALLOWED (bad)`); } catch (e) { console.log(`${name}: refused — ${e.message}`); }
  await c.query('rollback to savepoint s');
}
// An insert for another clinic is refused by the policy's with check.
await c.query('savepoint s');
try {
  await c.query(`insert into appointment_contact (clinic_id, appointment_id, outcome) select c.id, a.id, 'no_answer' from clinic c join appointment a on a.clinic_id = c.id where c.id <> $1 limit 1`, [CLINIC]);
  const n = (await c.query('select count(*)::int as n from appointment_contact')).rows[0].n;
  console.log('insert for another clinic:', n, 'rows now (RLS hides other clinics from the select, so 0 inserted means none matched)');
} catch (e) { console.log('insert for another clinic: refused —', e.message); }
await c.query('rollback to savepoint s');
await c.query('rollback');
await c.end();
