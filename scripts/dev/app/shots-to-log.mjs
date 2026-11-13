// Prints the simulator's final screenshots into the job's log, small (JPEG, 640 px wide) and in base64, one block each:
//   @@SHOT <name>
//   <base64 lines>
//   @@END
// A session that can read a run's log but not download its Artifacts (whose storage some networks block) gets the
// pictures back with scripts/dev/app/shots-from-log.mjs. The full-size PNGs stay in the Artifacts.
//   node scripts/dev/app/shots-to-log.mjs <dir of PNGs>
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sharp = createRequire(join(root, 'mobile/package.json'))('sharp');
const dir = process.argv[2];
const names = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.endsWith('-early.png')).sort();
for (const f of names) {
  const jpg = await sharp(join(dir, f)).resize({ width: 640 }).jpeg({ quality: 70 }).toBuffer();
  const b64 = jpg.toString('base64');
  console.log(`@@SHOT ${f.replace(/\.png$/, '')}`);
  for (let i = 0; i < b64.length; i += 4000) console.log(b64.slice(i, i + 4000));
  console.log('@@END');
}
