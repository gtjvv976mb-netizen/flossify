// GET /uploads/<clinic id>/<uuid>-<640|1600>.webp
// Serves a clinic's uploaded photos from UPLOAD_DIR. The path has to match the
// exact shape savePhoto() writes — two uuids, one of two widths, .webp — or it
// is a 404, so nothing a visitor types can walk the disk. The files are
// immutable (a new upload is a new uuid), hence the year-long cache.
export const prerender = false;

import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOAD_DIR } from '../../lib/uploads';

const SHAPE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}-(640|1600)\.webp$/;

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? '';
  if (!SHAPE.test(path)) return notFound();
  let bytes: Buffer;
  try {
    bytes = await readFile(join(UPLOAD_DIR, path));
  } catch {
    return notFound();
  }
  return new Response(bytes, {
    headers: {
      'content-type': 'image/webp',
      'content-length': String(bytes.length),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
