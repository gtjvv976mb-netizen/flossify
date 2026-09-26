// How a clinic's cover photo behaves as the room behind its page (ClinicRoom.astro). A clinic can
// upload anything, so the photo is looked at once, small, before it is put behind words:
//
//   'busy'  harsh or loud — the brightness varies a lot across the picture, or the colours are
//           strong (stripes, a neon sign, a bright mural). Its room is softened and quietened.
//   'dark'  mostly dark — a dim interior, a night shot. In the light theme its room gets a stronger
//           white wash, so the frost over it stays pale instead of a muddy grey.
//
// Everything else — an ordinary photo of a room, bright and fairly plain — is shown as it is.
// Measured on the 640 file, shrunk to 32x24: the mean and the spread of its brightness (gamma
// luma, 0-1) and its mean colourfulness (the chroma, max - min of r, g, b, 0-1). Real room photos
// sit around luma 0.6-0.8, spread 0.06-0.19 and chroma under 0.1; the harsh test upload (black,
// white, red and blue stripes) at spread 0.32 and chroma 0.37; a dark x-ray still at luma 0.23.
//
// Once per upload: a key names one file that never changes, so the answer is kept (a promise, so
// two requests at once read the file once). sharp is loaded only when a clinic has an upload of its
// own, as savePhoto does; if it cannot be loaded or the file cannot be read, the photo is shown
// the default way, which is readable on its own.
import { join } from 'node:path';
import { UPLOAD_DIR, uploadId } from '../../../lib/uploads';

export type RoomTone = { busy: boolean; dark: boolean };
const PLAIN: RoomTone = { busy: false, dark: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_KEPT = 5000;
const kept = new Map<string, Promise<RoomTone>>();

/** How the room behind a clinic's page should treat this upload key. Never throws. */
export function roomTone(key: string, clinicId: string): Promise<RoomTone> {
  const id = uploadId(key);
  if (!id || !UUID.test(clinicId)) return Promise.resolve(PLAIN);
  const at = `${clinicId}/${id}`;
  let tone = kept.get(at);
  if (!tone) {
    if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value!);
    tone = measure(join(UPLOAD_DIR, clinicId, `${id}-640.webp`));
    kept.set(at, tone);
  }
  return tone;
}

async function measure(file: string): Promise<RoomTone> {
  try {
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(file)
      .flatten({ background: '#ffffff' })
      .resize(32, 24, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let n = 0, sum = 0, sumSq = 0, chroma = 0;
    for (let i = 0; i + 2 < data.length; i += info.channels) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      n++; sum += y; sumSq += y * y;
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
    }
    if (!n) return PLAIN;
    const mean = sum / n;
    const spread = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    return { busy: spread > 0.26 || chroma / n > 0.24, dark: mean < 0.3 };
  } catch {
    return PLAIN;
  }
}
