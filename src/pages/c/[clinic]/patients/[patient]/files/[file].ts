// GET /c/<slug>/patients/<patient>/files/<file>/ — one X-ray, photo or document from a patient's record
// (src/lib/record.ts). Behind the workspace gate like every clinic page, read inside withClinic so row-level
// security decides whether the patient and the file are this clinic's; never cached (no-store, as every /c/
// response). ?thumb=1 is the small preview the Files grid shows; ?download=1 saves it instead of opening it.
// Opening or saving a whole file is written to the audit log (a preview is not: the grid shows many at once).
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireWorkspace } from '../../../../../../lib/workspace';
import { withClinic } from '../../../../../../lib/db';
import { readRecordFile } from '../../../../../../lib/record';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async (ctx) => {
  const patientId = ctx.params.patient ?? '', fileId = ctx.params.file ?? '';
  if (!UUID.test(patientId) || !UUID.test(fileId)) return new Response('No such file', { status: 404 });
  const ws = await requireWorkspace(ctx as any);
  if (ws instanceof Response) return ws;
  const { clinic, session } = ws;
  const thumb = ctx.url.searchParams.get('thumb') === '1';
  const download = ctx.url.searchParams.get('download') === '1';
  const f = await withClinic(clinic.id, async (tx) => {
    const got = await readRecordFile(tx, clinic.id, patientId, fileId, thumb);
    if (got && !thumb) {
      await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'attachment', $4)`,
        [clinic.id, session.staffId, download ? 'record.file_download' : 'record.file_view', fileId]);
    }
    return got;
  });
  if (!f) return new Response('No such file', { status: 404 });
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      'content-type': f.mime,
      'content-length': String(f.bytes.length),
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${f.name}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      // A picture opened on its own runs nothing (a PDF keeps the browser's own viewer, which a strict policy can block).
      ...(f.mime.startsWith('image/') ? { 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
    },
  });
};
