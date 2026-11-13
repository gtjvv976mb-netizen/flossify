// The calendar file from a booking: escaped, folded, with an end and a place. No database.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs --test src/lib/ics.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsText, icsFold, icsAddMinutes, icsNextDay, icsVisit } from './ics.ts';

const NOW = new Date('2026-09-20T01:02:03.456Z');
/** The file as a calendar reads it: folds undone, one property a line. */
const unfold = (s: string) => s.replace(/\r\n /g, '').split('\r\n');

test('text is escaped: backslash first, then comma and semicolon, and a line break is \\n', () => {
  assert.equal(icsText('Smile & Co., Unit 2; G/F'), 'Smile & Co.\\, Unit 2\\; G/F');
  assert.equal(icsText('a\\b'), 'a\\\\b');
  assert.equal(icsText('one\r\ntwo\nthree'), 'one\\ntwo\\nthree');
});

test('a line folds at 75 octets, never inside a character, and unfolds to itself', () => {
  const line = 'SUMMARY:' + 'Dentist — Ñ '.repeat(20);
  const folded = icsFold(line);
  const enc = new TextEncoder();
  for (const part of folded.split('\r\n')) assert.ok(enc.encode(part).length <= 75, `${enc.encode(part).length} octets`);
  assert.equal(folded.replace(/\r\n /g, ''), line);
  // Cut inside a character, the bytes would no longer read back as the line.
  assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(enc.encode(folded)).replace(/\r\n /g, ''), line);
  assert.equal(icsFold('SUMMARY:short'), 'SUMMARY:short');
});

test('the end is clock arithmetic on the wall time: over midnight, a month and a year', () => {
  assert.equal(icsAddMinutes('20260924T090000', 45), '20260924T094500');
  assert.equal(icsAddMinutes('20260930T233000', 45), '20261001T001500');
  assert.equal(icsAddMinutes('20261231T233000', 60), '20270101T003000');
  assert.equal(icsNextDay('20280228'), '20280229');
  assert.equal(icsNextDay('20261231'), '20270101');
  assert.throws(() => icsAddMinutes('2026-09-24', 30));
});

test('a booking: Manila start and end, the same on any device', () => {
  const f = unfold(icsVisit({ ref: 'FLS-ABC123', start: '2026-09-24T09:00:00+08:00', minutes: 45, summary: 'Dentist — Session Road Dental', description: 'Cleaning with Dr. Reyes. Ref FLS-ABC123.', location: 'Session Road Dental, 12 Session Rd, Baguio; 2/F', now: NOW }));
  assert.deepEqual(f, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flossify//Visit//EN', 'BEGIN:VEVENT',
    'UID:FLS-ABC123@flossify', 'DTSTAMP:20260920T010203Z',
    'DTSTART;TZID=Asia/Manila:20260924T090000', 'DTEND;TZID=Asia/Manila:20260924T094500',
    'SUMMARY:Dentist — Session Road Dental', 'DESCRIPTION:Cleaning with Dr. Reyes. Ref FLS-ABC123.',
    'LOCATION:Session Road Dental\\, 12 Session Rd\\, Baguio\\; 2/F', 'END:VEVENT', 'END:VCALENDAR']);
});

test('a request has no time yet: the whole day, ending on the next', () => {
  const f = unfold(icsVisit({ ref: 'R1', start: '2026-12-31 Morning', summary: 's', description: 'd', location: 'l', now: NOW }));
  assert.ok(f.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(f.includes('DTEND;VALUE=DATE:20270101'));
  assert.ok(!f.some((l) => l.includes('TZID')));
});

test('every line of the file ends CRLF and none is over 75 octets', () => {
  const file = icsVisit({ ref: 'R2', start: '2026-09-24T09:00', minutes: 30, summary: 'Dentist — ' + 'Very Long Clinic Name, '.repeat(6), description: 'x', location: 'y', now: NOW });
  assert.ok(!/[^\r]\n/.test(file));
  for (const l of file.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75);
});
