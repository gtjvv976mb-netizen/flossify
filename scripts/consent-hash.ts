// npm run consent:hash — the fingerprint of every consent template's words (libraryHash in
// src/lib/consent-seal.ts), for the consent_version rows: 039 inserts the ten forms with these and
// sets the general consent's. A change of words is a new version id and a new row, in one change,
// with the hash this prints; the unit test (npm run test:consent) fails while a row and its words
// disagree.
//
//   npm run consent:hash            version, code and hash, one per line
//   npm run consent:hash -- --sql   the same as SQL values, to paste into a migration
import { TEMPLATES } from '../src/lib/consent-library.ts';
import { libraryHash } from '../src/lib/consent-seal.ts';

const sql = process.argv.includes('--sql');
const rows = Object.values(TEMPLATES).sort((a, b) => a.order - b.order);
for (const t of rows) {
  const h = libraryHash(t);
  if (sql) console.log(`  ('${t.version}', '${t.kind}', ${t.kind === 'document' ? `'${t.code}'` : 'null'}, '${h}'),  -- ${t.title.en}`);
  else console.log(`${t.version.padEnd(22)} ${t.code.padEnd(12)} ${h}`);
}
