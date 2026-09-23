// Clinic photos a clinic uploads itself. The bytes live on disk under
// UPLOAD_DIR, never in the database: the clinic row keeps a key per photo in
// photo_keys, 'up:<uuid>', next to the house keys ('tray', 'xray') the seed
// uses. Every upload is re-encoded through sharp into two WebP widths, which
// also drops the metadata a phone writes into a JPEG — the GPS position of
// the clinic's back room is not something to publish.
//
// Layout on disk:   <UPLOAD_DIR>/<clinic id>/<uuid>-1600.webp
//                   <UPLOAD_DIR>/<clinic id>/<uuid>-640.webp
// Served at:        /uploads/<clinic id>/<uuid>-<640|1600>.webp
//
// Nothing here joins a string it was handed into a path without matching it
// against the uuid shape first; the route that serves the files does the same.

import './dotenv';
import { mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { photo, PHOTO_ALT } from '../data/directory.ts';

/** Where the files go, resolved from the process's working directory. Read from process.env when the
 *  server starts, never import.meta.env, which the build would freeze (src/lib/dotenv.ts). */
export const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const PHOTO_WIDTHS = [1600, 640] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UPLOAD_KEY = /^up:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The uuid inside an 'up:' key, or null for anything else. */
export const uploadId = (key: string): string | null => UPLOAD_KEY.exec(String(key ?? ''))?.[1] ?? null;
export const isUploadKey = (key: string) => uploadId(key) !== null;

/** A refusal the page can show as it is. Anything else thrown here is a fault, not the person's doing. */
export class UploadRefused extends Error {}

/** Convert one uploaded file into the two WebP sizes and return its key. Throws UploadRefused with a sentence. */
export async function savePhoto(clinicId: string, file: File): Promise<{ key: string }> {
  if (!UUID.test(clinicId)) throw new Error('savePhoto: clinic id is not a uuid');
  const name = file.name || 'That file';
  if (!PHOTO_TYPES.has(file.type)) throw new UploadRefused(`${name} is not a JPEG, PNG or WebP picture.`);
  if (file.size === 0) throw new UploadRefused(`${name} is empty.`);
  if (file.size > MAX_PHOTO_BYTES) throw new UploadRefused(`${name} is larger than 8 MB. Export a smaller copy and try again.`);

  const bytes = Buffer.from(await file.arrayBuffer());
  // Loaded here rather than at the top so the public pages, which only build
  // URLs from keys, never pull the native module in.
  const { default: sharp } = await import('sharp');
  const id = randomUUID();
  const dir = join(UPLOAD_DIR, clinicId);
  await mkdir(dir, { recursive: true });
  try {
    await Promise.all(PHOTO_WIDTHS.map((w) =>
      // rotate() with no angle applies the EXIF orientation before the
      // metadata is dropped, so a phone photo does not come out sideways.
      sharp(bytes).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(dir, `${id}-${w}.webp`)),
    ));
  } catch {
    await removeFiles(clinicId, id);
    throw new UploadRefused(`${name} could not be read as a picture.`);
  }
  return { key: `up:${id}` };
}

/** The URL for one width of a photo. House keys resolve to the house stills; the width picks which of their two files. */
export function photoUrl(key: string, clinicId: string, w: PhotoWidth): string {
  const id = uploadId(key);
  if (id && UUID.test(clinicId)) return `/uploads/${clinicId}/${id}-${w}.webp`;
  const p = photo(key);
  return w === 640 ? p.small : p.src;
}

/** What an <img> on a public page needs for a key: an upload or a house still. */
export function publicPhoto(key: string, clinicId: string, clinicName: string) {
  if (isUploadKey(key)) {
    return {
      upload: true,
      src: photoUrl(key, clinicId, 1600),
      srcset: `${photoUrl(key, clinicId, 640)} 640w, ${photoUrl(key, clinicId, 1600)} 1600w`,
      alt: `${clinicName} — a room`,
    };
  }
  const p = photo(key);
  return { upload: false, src: p.src, srcset: p.srcset, alt: PHOTO_ALT[p.key] };
}

/** Delete both files of an upload. Refuses any key that is not 'up:<uuid>'; a file already gone is not an error. */
export async function removePhoto(clinicId: string, key: string): Promise<void> {
  const id = uploadId(key);
  if (!id) throw new Error('removePhoto: not an upload key');
  if (!UUID.test(clinicId)) throw new Error('removePhoto: clinic id is not a uuid');
  await removeFiles(clinicId, id);
}

async function removeFiles(clinicId: string, id: string) {
  await Promise.all(PHOTO_WIDTHS.map((w) =>
    unlink(join(UPLOAD_DIR, clinicId, `${id}-${w}.webp`)).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; }),
  ));
}
