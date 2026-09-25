// Photos: the pictures on the clinic's public page — add some, take one down,
// change the order. The bytes go to disk through savePhoto()
// (src/lib/uploads.ts), which re-encodes every upload and drops its metadata;
// the clinic row keeps only the keys, in order, in photo_keys, updated inside
// withClinic() like any other clinic field. The first two keys are what
// /find/<slug>/ shows.
import { withClinic, type Tx } from '../../../../../lib/db';
import { savePhoto, removePhoto, isUploadKey, UploadRefused } from '../../../../../lib/uploads';

export const MAX_PHOTOS = 8;

export const photoKeys = (clinicId: string) =>
  withClinic(clinicId, async (tx) => ((await tx.query('select photo_keys from clinic where id = $1', [clinicId])).rows[0]?.photo_keys ?? []) as string[]);

const audit = (tx: Tx, clinicId: string, staffId: string) =>
  tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'clinic.photos', 'clinic', $1)`, [clinicId, staffId]);

export interface PhotosRefused { error: string; notice: string }

export async function photoAction(o: { clinicId: string; staffId: string; base: string; form: FormData }): Promise<Response | PhotosRefused> {
  const { form, clinicId, staffId } = o;
  const action = String(form.get('action') ?? '');
  const key = String(form.get('key') ?? '');
  const back = (q: string) => new Response(null, { status: 303, headers: { location: `${o.base}?photos=${q}#photos` } });

  if (action === 'upload') {
    const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    const have = await photoKeys(clinicId);
    if (!files.length) return { error: 'Choose a photo first.', notice: '' };
    if (have.length >= MAX_PHOTOS) return { error: `A clinic can have up to ${MAX_PHOTOS} photos. Remove one to add another.`, notice: '' };
    if (have.length + files.length > MAX_PHOTOS) return { error: `A clinic can have up to ${MAX_PHOTOS} photos and this branch has ${have.length}, so choose up to ${MAX_PHOTOS - have.length} more.`, notice: '' };
    // Each file stands on its own: the ones that convert are kept, and each one that does not gets its sentence.
    const added: string[] = [];
    const refused: string[] = [];
    for (const f of files) {
      try { added.push((await savePhoto(clinicId, f)).key); }
      catch (e) { if (e instanceof UploadRefused) refused.push(e.message); else throw e; }
    }
    if (added.length) {
      await withClinic(clinicId, async (tx) => {
        await tx.query('update clinic set photo_keys = photo_keys || $2::text[] where id = $1', [clinicId, added]);
        await audit(tx, clinicId, staffId);
      });
    }
    if (!refused.length) return back(`added&n=${added.length}`);
    return { error: refused.join(' '), notice: added.length ? `Added ${added.length === 1 ? 'one photo' : `${added.length} photos`}.` : '' };
  }
  if (action === 'remove' || action === 'up') {
    const have = await photoKeys(clinicId);
    const i = have.indexOf(key);
    if (!key || i < 0) return { error: 'That photo is already gone.', notice: '' };
    if (action === 'remove') {
      await withClinic(clinicId, async (tx) => {
        await tx.query('update clinic set photo_keys = array_remove(photo_keys, $2) where id = $1', [clinicId, key]);
        await audit(tx, clinicId, staffId);
      });
      // The row no longer points at the files, so they can go. A house still has no files of its own.
      if (isUploadKey(key)) await removePhoto(clinicId, key);
      return back('removed');
    }
    if (i > 0) {
      const next = [...have];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      await withClinic(clinicId, async (tx) => {
        await tx.query('update clinic set photo_keys = $2::text[] where id = $1', [clinicId, next]);
        await audit(tx, clinicId, staffId);
      });
    }
    return back('moved');
  }
  return { error: 'Choose what to do with the photo.', notice: '' };
}
