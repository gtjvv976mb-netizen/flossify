// Takes the screenshots back out of an iOS app run's log (see shots-to-log.mjs):
//   gh api repos/OWNER/REPO/actions/jobs/JOB_ID/logs > job.log
//   node scripts/dev/app/shots-from-log.mjs job.log out-dir
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [log, out = 'ios-shots-from-log'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
let name = null, parts = [], n = 0;
for (const raw of readFileSync(log, 'utf8').split('\n')) {
  const line = raw.replace(/^\S+Z /, '').trim(); // the runner's timestamp
  if (line.startsWith('@@SHOT ')) { name = line.slice(7).trim(); parts = []; }
  else if (line === '@@END' && name) {
    writeFileSync(join(out, `${name}.jpg`), Buffer.from(parts.join(''), 'base64')); n++; name = null;
  } else if (name) parts.push(line);
}
console.log(`${n} screenshots in ${out}`);
