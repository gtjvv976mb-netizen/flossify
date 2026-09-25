// GET /c/<slug>/patients/template/patients.csv · patients.xlsx · visits.csv · visits.xlsx
// — the empty spreadsheets the import page offers: the header row the import
// matches by itself, and (in the .xlsx) a second sheet saying what goes in
// each column, with this branch's dentists and fee guide for the Visits one.
// Money columns only for people who may bill here (canBill), the same rule
// the import keeps. Behind the workspace gate like every clinic page; no
// patient data is in them.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireWorkspace } from '../../../../../lib/workspace';
import { withClinic } from '../../../../../lib/db';
import { canBill } from '../../../../../lib/invoices';
import { template, type Kind } from '../../../../../lib/import';

const FILES: Record<string, { kind: Kind; ext: 'csv' | 'xlsx' }> = {
  'patients.csv': { kind: 'patients', ext: 'csv' }, 'patients.xlsx': { kind: 'patients', ext: 'xlsx' },
  'visits.csv': { kind: 'visits', ext: 'csv' }, 'visits.xlsx': { kind: 'visits', ext: 'xlsx' },
};

export const GET: APIRoute = async (ctx) => {
  const want = FILES[ctx.params.file ?? ''];
  if (!want) return new Response('No such template', { status: 404 });
  const ws = await requireWorkspace(ctx as any);
  if (ws instanceof Response) return ws;
  const { clinic, session } = ws;
  const extra = want.kind === 'visits'
    ? await withClinic(clinic.id, async (tx) => ({
        services: (await tx.query(`select name from procedure_catalog where active order by name`)).rows.map((r) => r.name as string),
        dentists: (await tx.query(
          `select s.full_name from staff s where s.group_id = $1 and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
              and (exists (select 1 from staff_access a where a.staff_id = s.id and a.clinic_id = $2)
                   or exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = $2)) order by s.full_name`,
          [clinic.group_id, clinic.id])).rows.map((r) => r.full_name as string),
      }))
    : { services: [], dentists: [] };
  const t = template(want.kind, canBill(session.role, clinic.can_view_finance), extra);
  const name = `flossify-${want.kind}-template.${want.ext}`;
  return new Response(want.ext === 'csv' ? t.csv : new Uint8Array(t.xlsx), {
    headers: {
      'content-type': want.ext === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
};
