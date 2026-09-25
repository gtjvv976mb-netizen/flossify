// Bringing patients in: the rules Add patient (/c/<slug>/patients/new/) and
// the spreadsheet import (/c/<slug>/patients/import/) share. The pages own
// their forms; this file owns reading files, matching columns, reading dates
// and names, deciding what each row becomes, and writing it.
//
// Rules kept:
// - Nothing here guesses silently. A row that cannot be read is left out with
//   its reasons in plain words; a value that was read in a way worth checking
//   (a two-digit year, a landline where a mobile goes) is kept with a note.
// - A date like 03/04/1985 is ambiguous. The file's dates are read in one
//   order, month/day/year (the Philippine habit) unless the file itself shows
//   day/month/year (a 25/12/1990 somewhere), and the preview says which, with
//   an example, for the desk to confirm or switch. ISO dates (1985-04-03),
//   month names ("3 Apr 1985", "April 3, 1985", Filipino names too) and
//   Excel's own date cells are never ambiguous.
// - Re-importing the same file changes nothing: a patient is matched by chart
//   number, or mobile + name (+ birth date when both have one), or name + birth
//   date; a row with only a name, by that name when exactly one patient on file
//   has it (and its suffix), and a second row of the same name in one file is
//   left out; a visit by its
//   import_key (patient, day, service, dentist), unique per clinic (026); its
//   statement and payment by a form_key derived from that key; an opening
//   balance by one derived from the patient; a paper form by (patient, day).
// - A matched patient is never overwritten: only fields that are empty on
//   file are filled, health answers only when none were ever recorded (a file
//   is older than what the desk has typed since), an opening balance once.
// - Money is numeric, never a float: centavos as bigint (src/lib/invoices.ts),
//   statements numbered in the clinic's own series (SERIES), in one block
//   taken from invoice_series under its row lock. A visit's statement is
//   dated the day of the visit and marked imported_at; its payment is dated
//   the same day. How it was paid, when the old records do not say, is
//   'unrecorded' (026).
// - Every write runs in the caller's withClinic() transaction, after
//   lockClinic(): the same advisory lock the schedule and the booking API
//   take, so a chart number or a statement number cannot be handed out twice.
// - Every write leaves audit_log rows.

import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';
import type { Tx } from './db';
import { normalizePhone, PH_MOBILE } from './messages';
import { EMAIL_ADDRESS, EMAIL_MAX, normalizeEmail } from './email';
import { LISTS, cleanList, oneLine, manilaToday, sameAnswers, NOTE_MAX, type HealthAnswers } from './health';
import { SERIES, parseMoney, pesos, toDb, METHODS, methodLabel, type Cents } from './invoices';

export const FILE_MAX = 5 * 1024 * 1024;
export const ROWS_MAX = 5000;
/** A file wider than this is not a list of patients: the template has 25 columns, old systems' exports a few dozen. */
export const COLS_MAX = 200;
/** The longest cell read: longer than any field Flossify keeps (notes, 1,000). */
export const CELL_MAX = 1000;
/** Uploads a person may make, [how many, in seconds]: reading a file is the heaviest thing a page here does. */
export const UPLOAD_LIMIT: [number, number] = [20, 10 * 60];
export const NAME_PART_MAX = 60;
export const SERVICE_MAX = 120;
export const VISIT_NOTE_MAX = 500;
export const NOTES_MAX = 1000;

export type Kind = 'patients' | 'visits';
export type DateOrder = 'mdy' | 'dmy';

// ---------------------------------------------------------------------------
// The fields a column can be
// ---------------------------------------------------------------------------
export interface Field {
  key: string;
  label: string;
  kinds: Kind[];
  /** Money: only for people with finance access here. */
  money?: boolean;
  /** Header words that mean this field, in English and Filipino. */
  words: string[];
  /** What to write in it, for the template's notes and the import page. */
  hint: string;
  example: string;
}

export const FIELDS: Field[] = [
  { key: 'chart_no', label: 'Chart no.', kinds: ['patients', 'visits'], words: ['chart', 'chart no', 'chart number', 'chart #', 'patient no', 'patient number', 'patient id', 'record no', 'file no', 'pid', 'id no'], hint: 'The number on the patient’s card. Leave it blank and Flossify gives the next free P- number.', example: 'P-0107' },
  { key: 'full_name', label: 'Full name', kinds: ['patients', 'visits'], words: ['name', 'full name', 'patient name', 'patient', 'complete name', 'pangalan', 'buong pangalan'], hint: 'Use this or the separate name columns. “Santos, Maria Clara” or “Maria Clara Santos”.', example: 'Santos, Maria Clara' },
  { key: 'last_name', label: 'Last name', kinds: ['patients', 'visits'], words: ['last name', 'surname', 'family name', 'lastname', 'lname', 'apelyido', 'apilyido'], hint: 'Family name, with dela, de los, San and the like.', example: 'Dela Cruz' },
  { key: 'first_name', label: 'First name', kinds: ['patients', 'visits'], words: ['first name', 'given name', 'firstname', 'fname', 'given names', 'unang pangalan'], hint: 'Given names, all of them.', example: 'Ma. Theresa' },
  { key: 'middle_name', label: 'Middle name', kinds: ['patients'], words: ['middle name', 'middle initial', 'mi', 'middlename', 'gitnang pangalan'], hint: 'Or the middle initial.', example: 'Reyes' },
  { key: 'suffix', label: 'Suffix', kinds: ['patients'], words: ['suffix', 'name extension', 'ext', 'extension'], hint: 'Jr., Sr., III.', example: 'Jr.' },
  { key: 'birth_date', label: 'Birth date', kinds: ['patients', 'visits'], words: ['birth date', 'birthdate', 'birthday', 'date of birth', 'dob', 'bday', 'b day', 'kaarawan', 'petsa ng kapanganakan'], hint: 'Any common way: 1985-04-03, 04/03/1985, 3 Apr 1985. The preview shows how each was read.', example: '1985-04-03' },
  { key: 'sex', label: 'Sex', kinds: ['patients'], words: ['sex', 'gender', 'kasarian'], hint: 'Female, Male, or blank. F, M, Babae and Lalaki work too.', example: 'Female' },
  { key: 'mobile', label: 'Mobile', kinds: ['patients', 'visits'], words: ['mobile', 'mobile no', 'mobile number', 'cellphone', 'cellphone no', 'cp', 'cp no', 'cell', 'cell no', 'phone', 'phone no', 'contact', 'contact no', 'contact number', 'telephone', 'tel', 'numero', 'number'], hint: 'A Philippine mobile: 0917 555 0142 or +63 917 555 0142. Reminders go to it.', example: '0917 555 0142' },
  { key: 'email', label: 'Email', kinds: ['patients'], words: ['email', 'e mail', 'email address'], hint: '', example: 'maria@example.com' },
  { key: 'address', label: 'Address', kinds: ['patients'], words: ['address', 'home address', 'street', 'street address', 'tirahan'], hint: 'House, street and barangay.', example: '12 Kisad Rd, Brgy. Harrison' },
  { key: 'city', label: 'City or town', kinds: ['patients'], words: ['city', 'town', 'municipality', 'city town', 'lungsod', 'bayan'], hint: '', example: 'Baguio City' },
  { key: 'province', label: 'Province', kinds: ['patients'], words: ['province', 'lalawigan'], hint: '', example: 'Benguet' },
  { key: 'hmo_name', label: 'HMO', kinds: ['patients'], words: ['hmo', 'hmo name', 'hmo provider', 'health card', 'insurance', 'healthcard'], hint: 'The HMO’s name as the card says.', example: 'Maxicare' },
  { key: 'hmo_member_no', label: 'HMO member no.', kinds: ['patients'], words: ['hmo no', 'hmo number', 'member no', 'member number', 'member id', 'hmo id', 'card no', 'card number', 'policy no'], hint: '', example: '1234-5678-90' },
  { key: 'emergency_name', label: 'Emergency contact', kinds: ['patients'], words: ['emergency contact', 'emergency contact name', 'contact person', 'in case of emergency', 'icoe', 'emergency name', 'person to contact'], hint: 'Who to call.', example: 'Jose Santos' },
  { key: 'emergency_relation', label: 'Relation', kinds: ['patients'], words: ['relation', 'relationship', 'emergency relation', 'relationship to patient'], hint: 'Of the emergency contact to the patient.', example: 'Husband' },
  { key: 'emergency_phone', label: 'Emergency contact’s number', kinds: ['patients'], words: ['emergency phone', 'emergency number', 'emergency mobile', 'emergency contact no', 'emergency contact number', 'contact person no', 'contact person number'], hint: '', example: '0918 555 0199' },
  { key: 'allergies', label: 'Allergies', kinds: ['patients'], words: ['allergies', 'allergy', 'allergic to', 'drug allergy', 'allergies drug'], hint: 'Separated by commas. “None” means asked and none; blank means not asked.', example: 'Penicillin, Latex' },
  { key: 'conditions', label: 'Conditions', kinds: ['patients'], words: ['conditions', 'condition', 'medical conditions', 'medical history', 'illnesses', 'illness', 'sakit'], hint: 'Separated by commas. “None” or blank, as above.', example: 'Hypertension' },
  { key: 'medicines', label: 'Medicines taken now', kinds: ['patients'], words: ['medicines', 'medicine', 'medications', 'medication', 'maintenance', 'maintenance meds', 'current medication', 'gamot'], hint: 'Separated by commas.', example: 'Losartan' },
  { key: 'health_note', label: 'Note for the dentist', kinds: ['patients'], words: ['health note', 'medical note', 'medical remarks', 'alert', 'alerts', 'warning'], hint: 'One line the dentist must read first.', example: 'Faints at injections' },
  { key: 'notes', label: 'Other notes', kinds: ['patients'], words: ['notes', 'note', 'remarks', 'comments', 'other notes'], hint: 'Anything else, kept on the record.', example: '' },
  { key: 'paper_consent', label: 'Consent signed on paper', kinds: ['patients'], words: ['consent', 'consent date', 'consent signed', 'date consent signed', 'consent signed on', 'waiver', 'waiver date'], hint: 'The date on the clinic’s own consent form, if the patient signed one. Kept as that form, not as consent to Flossify’s privacy notice.', example: '2019-03-12' },
  { key: 'opening_balance', label: 'Opening balance', kinds: ['patients'], money: true, words: ['opening balance', 'balance', 'amount due', 'unpaid', 'outstanding', 'outstanding balance', 'utang', 'balance due'], hint: 'What the patient still owes from before, in pesos. It becomes one statement.', example: '1500' },
  { key: 'balance_as_of', label: 'Balance as of', kinds: ['patients'], money: true, words: ['balance as of', 'as of', 'balance date'], hint: 'The day the balance was counted. Blank means today.', example: '2026-09-01' },
  { key: 'visit_date', label: 'Visit date', kinds: ['visits'], words: ['date', 'visit date', 'date of visit', 'visit', 'treatment date', 'appointment date', 'date seen', 'petsa'], hint: 'The day of the visit. Past days only.', example: '2023-03-12' },
  { key: 'dentist', label: 'Dentist', kinds: ['visits'], words: ['dentist', 'doctor', 'dr', 'attending', 'attending dentist', 'dentist name', 'provider', 'doktor'], hint: 'As the record names them. Matched to your team by name; anyone else is kept as written.', example: 'Dr. Ramon Cariño' },
  { key: 'service', label: 'Service', kinds: ['visits'], words: ['service', 'procedure', 'treatment', 'treatment done', 'work done', 'description', 'services rendered', 'procedure done', 'serbisyo'], hint: 'Matched to the fee guide by name; anything else is kept as written.', example: 'Oral prophylaxis' },
  { key: 'teeth', label: 'Teeth', kinds: ['visits'], words: ['teeth', 'tooth', 'tooth no', 'tooth number', 'teeth no', 'ngipin'], hint: 'FDI numbers (11–48, milk teeth 51–85), separated by commas.', example: '16, 26' },
  { key: 'visit_notes', label: 'Notes', kinds: ['visits'], words: ['notes', 'note', 'remarks', 'findings', 'clinical notes', 'comments'], hint: '', example: 'Mild gingivitis' },
  { key: 'charged', label: 'Amount charged', kinds: ['visits'], money: true, words: ['charged', 'amount charged', 'amount', 'fee', 'price', 'total', 'bill', 'charge', 'singil'], hint: 'In pesos. It becomes a statement dated the day of the visit.', example: '1500' },
  { key: 'paid', label: 'Amount paid', kinds: ['visits'], money: true, words: ['paid', 'amount paid', 'payment', 'bayad', 'amount received'], hint: 'In pesos, no more than was charged. It becomes a payment on that statement.', example: '1500' },
  { key: 'paid_by', label: 'Paid by', kinds: ['visits'], money: true, words: ['paid by', 'payment method', 'method', 'mode of payment', 'mop', 'paid via', 'paid thru'], hint: 'Cash, GCash, Maya, Card, Bank transfer, HMO, PhilHealth or Cheque. Blank: not in the old records.', example: 'Cash' },
];

export const fieldsFor = (kind: Kind, money: boolean) => FIELDS.filter((f) => f.kinds.includes(kind) && (money || !f.money));
export const fieldByKey = (key: string) => FIELDS.find((f) => f.key === key);

/** The template's columns, in order. */
export const TEMPLATE: Record<Kind, string[]> = {
  patients: ['chart_no', 'last_name', 'first_name', 'middle_name', 'suffix', 'birth_date', 'sex', 'mobile', 'email', 'address', 'city', 'province',
    'hmo_name', 'hmo_member_no', 'emergency_name', 'emergency_relation', 'emergency_phone', 'allergies', 'conditions', 'medicines', 'health_note',
    'notes', 'paper_consent', 'opening_balance', 'balance_as_of'],
  visits: ['chart_no', 'last_name', 'first_name', 'birth_date', 'mobile', 'visit_date', 'dentist', 'service', 'teeth', 'visit_notes', 'charged', 'paid', 'paid_by'],
};

// ---------------------------------------------------------------------------
// Words: comparing names, headers and services the way people mean them
// ---------------------------------------------------------------------------
/** "Peña" and "Pena", "DELA CRUZ" and "dela cruz": lower case, accents off, letters and digits only, single spaces. */
export const fold = (s: string): string =>
  String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** One line, NFC, at most `max` characters, or null when empty. */
const clean = (v: unknown, max = 200): string | null => {
  const s = oneLine(v).normalize('NFC');
  return s ? s.slice(0, max) : null;
};

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------
export interface Table {
  headers: string[]; rows: string[][]; notes: string[];
  /** The spreadsheet row the headers are on (1 unless rows above it are empty). */
  headerRow: number;
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** The most a workbook's XML may come to once unzipped. 5,000 rows of 60 columns is about 25 MB. */
export const XLSX_XML_MAX = 40 * 1024 * 1024;
/** The longest run of text between two tags in that XML: no cell Flossify keeps is near it. */
const XML_TEXT_MAX = 64 * 1024;
const TOO_BIG_XLSX = 'Opened, that workbook comes to more than 40 MB, far more than 5,000 rows of patients take, so Flossify does not read it. Save the sheet you mean as CSV UTF-8, or copy just its rows into a new workbook, and upload that.';
const LONG_XLSX = 'That workbook has more than 64,000 characters in one cell or setting, far more than any patient’s details, so Flossify does not read it. Check the file, or save the sheet as CSV UTF-8 and upload that.';

/**
 * An .xlsx is a zip of XML files. Before any XML is parsed, its XML parts are unzipped here from the
 * zip's own directory, all of them together under XLSX_XML_MAX however small the file is (a "zip bomb"
 * is refused, whatever sizes it claims), then packed again, uncompressed, for read-excel-file. So what
 * it reads is exactly what was counted: nothing the directory does not list, nothing past the cap.
 */
export function repackXlsx(b: Uint8Array): { zip: Buffer } | { problem: string } {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  const unreadable = { problem: 'That file could not be read as an Excel workbook. Open it in Excel or Google Sheets and save it again as .xlsx or CSV.' };
  // The end-of-directory record: in the last 22 bytes, or before a comment of up to 65,535.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return unreadable;
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdAt = buf.readUInt32LE(eocd + 16);
  // Zip64 (a workbook of gigabytes) or a directory outside the file.
  if (count === 0xffff || cdAt === 0xffffffff || cdAt + cdSize > eocd || count > 10000) return unreadable;
  const files: { name: string; data: Buffer }[] = [];
  let total = 0, at = cdAt;
  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || buf.readUInt32LE(at) !== 0x02014b50) return unreadable;
    const flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10), packed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    at += 46 + nameLen + extraLen + commentLen;
    // Only XML is read (read-excel-file skips pictures and printer settings too).
    if (!/\.(xml|rels)$/i.test(name)) continue;
    if (flags & 1) return unreadable;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return unreadable;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length) return unreadable;
    const raw = buf.subarray(start, start + packed);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: XLSX_XML_MAX - total + 1 }); }
      catch (e) { return (e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError ? { problem: TOO_BIG_XLSX } : unreadable; }
    } else return unreadable;
    total += data.length;
    if (total > XLSX_XML_MAX) return { problem: TOO_BIG_XLSX };
    files.push({ name, data });
  }
  if (!files.length) return unreadable;
  // A single run of text far longer than any cell (one 30 MB "name") is what makes an XML parser crawl.
  for (const f of files) {
    let last = 0;
    for (let i = f.data.indexOf(0x3c); i >= 0; i = f.data.indexOf(0x3c, i + 1)) {
      if (i - last > XML_TEXT_MAX) return { problem: LONG_XLSX };
      last = i;
    }
    if (f.data.length - last > XML_TEXT_MAX) return { problem: LONG_XLSX };
  }
  return { zip: zip(files, { store: true }) };
}

/**
 * A request's form, read up to `max` bytes whatever its Content-Length says (a chunked upload has none),
 * so no upload is held in memory past the limit: null when the body is longer. A body that is not a
 * form reads as an empty one (its CSRF check then fails, as it should).
 */
export async function formUpTo(req: Request, max: number): Promise<FormData | null> {
  if (!req.body) return new FormData();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData().catch(() => new FormData());
}

/** Bytes as text: UTF-8 (with or without its mark), UTF-16 (Excel's "Unicode text"), else Windows-1252 (Excel's CSV on Windows). */
function decode(b: Uint8Array): { text: string; note: string | null } {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(b.subarray(3)), note: null };
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), note: null };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), note: null };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), note: null };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(b), note: 'The file is not UTF-8, so it was read as Windows text (what Excel saves on Windows). Check that names with ñ and accents look right below.' };
  }
}

/** RFC 4180, forgiving: the delimiter the first line uses most (comma, semicolon or tab), quotes, "" inside quotes, any line ending. */
export function parseCsv(text: string): string[][] {
  let t = text.replace(/^﻿/, '');
  // Excel's "sep=;" line names the delimiter.
  let delim = '';
  const sep = /^sep=(.)\r?\n/i.exec(t);
  if (sep) { delim = sep[1]; t = t.slice(sep[0].length); }
  if (!delim) {
    const nl = t.search(/\r?\n/);
    const first = nl < 0 ? t : t.slice(0, nl);
    const count = (c: string) => first.split('"').filter((_, i) => i % 2 === 0).join('').split(c).length - 1;
    const scores = [',', ';', '\t'].map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1]);
    delim = scores[0][1] > 0 ? scores[0][0] : ',';
  }
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, i = 0;
  while (i < t.length) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; i++; continue; }
    if (c === delim) { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
      if (c === '\r' && t[i + 1] === '\n') i++;
      i++; continue;
    }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** An Excel cell as the text the preview shows and the rules read. A date cell becomes YYYY-MM-DD: never ambiguous. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    // read-excel-file gives a date cell as UTC midnight of that day.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/**
 * The file as a table: the header row (the first row with anything in it) and
 * the rows under it, every cell a trimmed string, empty rows dropped. CSV or
 * .xlsx; anything else is a sentence saying what to do.
 */
export async function readTable(bytes: Uint8Array, fileName: string): Promise<Table | { problem: string }> {
  if (bytes.length === 0) return { problem: 'That file is empty.' };
  if (bytes.length > FILE_MAX) return { problem: `That file is ${(bytes.length / 1048576).toFixed(1)} MB. The most one import takes is 5 MB: split it into two files.` };
  const notes: string[] = [];
  let grid: string[][];
  if (isOle(bytes)) return { problem: 'This is an older Excel file (.xls). In Excel choose File › Save As, pick “Excel Workbook (.xlsx)” or “CSV UTF-8”, and upload that.' };
  if (isZip(bytes)) {
    const packed = repackXlsx(bytes);
    if ('problem' in packed) return { problem: /\.(numbers|ods)$/i.test(fileName) ? 'Flossify reads .xlsx and .csv. Export the sheet as Excel (.xlsx) or CSV and upload that.' : packed.problem };
    try {
      const { default: readXlsx } = await import('read-excel-file/node');
      const sheets = await readXlsx(packed.zip);
      const withData = sheets.filter((s) => s.data.some((r) => r.some((c) => cellText(c).trim() !== '')));
      const sheet = withData[0];
      if (!sheet) return { problem: 'That workbook has no filled cells on any sheet.' };
      if (withData.length > 1) notes.push(`Read the first sheet with anything on it, “${sheet.sheet}”. The ${withData.length - 1 === 1 ? 'other sheet was' : `other ${withData.length - 1} sheets were`} left alone.`);
      grid = sheet.data.map((r) => r.map(cellText));
    } catch {
      return { problem: /\.(numbers|ods)$/i.test(fileName)
        ? 'Flossify reads .xlsx and .csv. Export the sheet as Excel (.xlsx) or CSV and upload that.'
        : 'That file could not be read as an Excel workbook. Open it in Excel or Google Sheets and save it again as .xlsx or CSV.' };
    }
  } else {
    // A text file: refuse anything that is plainly binary (a PDF, a photo).
    const head = bytes.subarray(0, 2048);
    const zeros = head.filter((x) => x === 0).length;
    const utf16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
    if (!utf16 && (zeros > 8 || /^%PDF/.test(new TextDecoder('latin1').decode(head.subarray(0, 4))))) {
      return { problem: 'That file is not a spreadsheet. Upload a CSV file or an Excel workbook (.xlsx).' };
    }
    const { text, note } = decode(bytes);
    if (note) notes.push(note);
    grid = parseCsv(text);
  }
  // No cell Flossify keeps is longer than 1,000 characters: a longer one is cut here, once, and said so.
  let cut = 0;
  const trimmed = grid.map((r) => r.map((c) => {
    const v = String(c ?? '').replace(/ /g, ' ').trim();
    if (v.length <= CELL_MAX) return v;
    cut++;
    return v.slice(0, CELL_MAX);
  }));
  const filled = (r: string[]) => r.some((c) => c !== '');
  const start = trimmed.findIndex(filled);
  if (start < 0) return { problem: 'That file has nothing in it.' };
  const headers = trimmed[start];
  // Columns past the last header with a name, or any filled cell, are dropped: the width is the furthest filled cell.
  let width = 0;
  for (let i = start; i < trimmed.length; i++) {
    const r = trimmed[i];
    for (let c = r.length - 1; c >= width; c--) if (r[c] !== '') { width = c + 1; break; }
  }
  if (width > COLS_MAX) return { problem: `That file has ${width.toLocaleString('en')} columns. Flossify reads up to ${COLS_MAX}: is it the right file? If it is, delete the columns it does not need and upload it again.` };
  if (cut) notes.push(`${cut === 1 ? 'One cell was' : `${cut.toLocaleString('en')} cells were`} longer than ${CELL_MAX.toLocaleString('en')} characters; only the first ${CELL_MAX.toLocaleString('en')} characters of ${cut === 1 ? 'it are' : 'each are'} read.`);
  // Keep the row numbers true to the file: only trailing empty rows go.
  let end = trimmed.length;
  while (end > start + 1 && !filled(trimmed[end - 1])) end--;
  const count = end - start - 1;
  if (count === 0) return { problem: 'The file has a header row and nothing under it.' };
  if (count > ROWS_MAX) return { problem: `The file has ${count.toLocaleString('en')} rows. One import takes up to ${ROWS_MAX.toLocaleString('en')}: split it into files of ${ROWS_MAX.toLocaleString('en')} or fewer.` };
  const rows = trimmed.slice(start + 1, end).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  if (start > 0) notes.push(`The first ${start === 1 ? 'row was' : `${start} rows were`} empty; the headers are on row ${start + 1}.`);
  return { headers: headers.slice(0, width).map((h, i) => h || `Column ${i + 1}`), rows, notes, headerRow: start + 1 };
}

/** The spreadsheet row number of a data row: the header is on the first filled row, usually row 1. */
export const rowNumber = (index: number, headerRow = 1) => headerRow + 1 + index;

// ---------------------------------------------------------------------------
// Matching columns to fields
// ---------------------------------------------------------------------------
export type Mapping = Record<string, string>;

/** Headers that say only "name": beside a first or last name column, they are the other part. */
const BARE_NAME = new Set(['name', 'names', 'pangalan']);

/** Which field each header most likely is. Exact words first, then the longest phrase inside the header; a field is used once. */
export function autoMap(headers: string[], kind: Kind, money: boolean): Mapping {
  const fields = fieldsFor(kind, money);
  const scored: { col: number; key: string; score: number }[] = [];
  headers.forEach((h, col) => {
    const f = fold(h);
    if (!f) return;
    for (const field of fields) {
      for (const w of [field.label, ...field.words].map(fold)) {
        if (!w) continue;
        if (f === w) scored.push({ col, key: field.key, score: 100 + w.length });
        else if (` ${f} `.includes(` ${w} `)) scored.push({ col, key: field.key, score: w.length });
      }
    }
  });
  scored.sort((a, b) => b.score - a.score || a.col - b.col);
  const out: Mapping = {};
  const usedCols = new Set<number>(), usedKeys = new Set<string>();
  for (const s of scored) {
    if (usedCols.has(s.col) || usedKeys.has(s.key)) continue;
    out[String(s.col)] = s.key;
    usedCols.add(s.col); usedKeys.add(s.key);
  }
  // A full name and separate first/last columns both matched: the separate ones win. But a bare "Name" or
  // "Pangalan" next to a surname column is the other half of the name ("Apelyido | Pangalan", "Surname | Name").
  const keys = Object.values(out);
  if (keys.includes('full_name') && (keys.includes('last_name') || keys.includes('first_name'))) {
    const other = !keys.includes('first_name') ? 'first_name' : !keys.includes('last_name') ? 'last_name' : null;
    for (const [c, k] of Object.entries(out)) {
      if (k !== 'full_name') continue;
      if (other && BARE_NAME.has(fold(headers[Number(c)]))) out[c] = other;
      else delete out[c];
    }
  }
  return out;
}

/** What a file of this kind cannot do without: the fields no column is matched to yet, as labels. */
export function missingFields(kind: Kind, mapping: Mapping): string[] {
  const keys = new Set(Object.values(mapping));
  const out: string[] = [];
  const named = keys.has('full_name') || (keys.has('last_name') && keys.has('first_name'));
  if (kind === 'patients') {
    if (!named) out.push(keys.has('last_name') ? 'First name' : keys.has('first_name') ? 'Last name' : 'Full name, or First name and Last name');
  } else {
    if (!keys.has('chart_no') && !named) out.push('Chart no., or the patient’s name');
    if (!keys.has('visit_date')) out.push('Visit date');
    if (!keys.has('service')) out.push('Service');
  }
  return out;
}

/** A visits file has a visit date or a service; a patients file has neither. */
export function guessKind(headers: string[]): Kind {
  const m = autoMap(headers, 'visits', true);
  const keys = new Set(Object.values(m));
  return keys.has('visit_date') && (keys.has('service') || keys.has('charged') || keys.has('dentist')) ? 'visits' : 'patients';
}

/** A mapping from a form or the database, kept to fields this kind and this person may use, each once. */
export function cleanMapping(raw: Record<string, unknown>, width: number, kind: Kind, money: boolean): Mapping {
  const allowed = new Set(fieldsFor(kind, money).map((f) => f.key));
  const out: Mapping = {};
  const used = new Set<string>();
  for (let c = 0; c < width; c++) {
    const k = String(raw[String(c)] ?? '');
    if (!allowed.has(k) || used.has(k)) continue;
    out[String(c)] = k;
    used.add(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, enero: 1, feb: 2, february: 2, peb: 2, pebrero: 2, mar: 3, march: 3, marso: 3,
  apr: 4, april: 4, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, june: 6, hun: 6, hunyo: 6,
  jul: 7, july: 7, hul: 7, hulyo: 7, aug: 8, august: 8, ago: 8, agosto: 8, sep: 9, sept: 9, september: 9, set: 9, setyembre: 9,
  oct: 10, october: 10, okt: 10, oktubre: 10, nov: 11, november: 11, nob: 11, nobyembre: 11, dec: 12, december: 12, dis: 12, disyembre: 12,
};
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const realYmd = (y: number, m: number, d: number) => {
  if (!(m >= 1 && m <= 12 && d >= 1 && y >= 1000 && y <= 9999)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
/** "2014-06-21" → "21 Jun 2014". */
export const ymdText = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${MONTH_SHORT[m - 1]} ${y}`; };

/** `year`: the cell is only a year (1985), which a birth date can keep in the notes. */
export type DateRead = { ymd: string; note?: string } | { problem: string; year?: number };

/**
 * One cell as a calendar date. `order` settles 03/04/1985; `past` (birth dates and visits) reads a
 * two-digit year as the latest year that is not after this one. Empty is null.
 */
export function readDate(raw: string, order: DateOrder, today = manilaToday()): DateRead | null {
  const s0 = String(raw ?? '').trim();
  if (!s0) return null;
  // A time after the date (2023-03-12 00:00:00, 2023-03-12T09:00) is not part of the day.
  const s = s0.toLowerCase().replace(/[t\s]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(am|pm)?z?$/i, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const thisYear = +today.slice(0, 4);
  const year = (y: string): { y: number; note?: string } => {
    if (y.length === 4) return { y: +y };
    const n = +y, full = 2000 + n <= thisYear ? 2000 + n : 1900 + n;
    return { y: full, note: `the two-digit year ${y} was read as ${full}` };
  };
  const done = (y: number, m: number, d: number, note?: string): DateRead =>
    realYmd(y, m, d) ? { ymd: `${y}-${pad(m)}-${pad(d)}`, ...(note ? { note } : {}) } : { problem: `“${s0}” is not a date on the calendar` };
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return done(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)) && +m[1] >= 1900) return done(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) {
    const a = +m[1], b = +m[2], y = year(m[3]);
    if (a > 12 && b > 12) return { problem: `“${s0}” is not a date: neither ${a} nor ${b} is a month` };
    const [mo, d] = a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'mdy' ? [a, b] : [b, a];
    if (!realYmd(y.y, mo, d)) return { problem: `“${s0}” is not a date on the calendar` };
    if (order === 'mdy' && a > 12) return { problem: `“${s0}” is day/month/year, but the dates are being read as month/day/year` };
    if (order === 'dmy' && b > 12) return { problem: `“${s0}” is month/day/year, but the dates are being read as day/month/year` };
    return done(y.y, mo, d, y.note);
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([a-z]+)\.?[\s\-/.]+(\d{2}|\d{4})$/.exec(s)) && MONTHS[m[2]]) {
    const y = year(m[3]); return done(y.y, MONTHS[m[2]], +m[1], y.note);
  }
  if ((m = /^([a-z]+)\.?[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+(\d{2}|\d{4})$/.exec(s)) && MONTHS[m[1]]) {
    const y = year(m[3]); return done(y.y, MONTHS[m[1]], +m[2], y.note);
  }
  // Only a year: never a day, and never Excel's day number 1985 (7 Jun 1905).
  if (/^\d{4}$/.test(s) && +s >= 1900 && +s <= thisYear) return { problem: `“${s0}” is only a year. Write the whole date, like ${s}-04-03`, year: +s };
  // Excel's day count (a date cell that lost its format), from 7,000 (1 Mar 1919): a smaller number is no date anyone here has.
  if ((m = /^(\d{4,5})(\.0+)?$/.exec(s)) && +m[1] >= 7000 && +m[1] <= 73050) {
    const t = new Date(Date.UTC(1899, 11, 30) + +m[1] * 86_400_000);
    return { ymd: t.toISOString().slice(0, 10), note: `${m[1]} was read as Excel’s day number for ${ymdText(t.toISOString().slice(0, 10))}` };
  }
  return { problem: `“${s0}” is not a date Flossify can read. Write it like 1985-04-03 or 3 Apr 1985` };
}

export interface DateEvidence {
  /** Dates that can only be month/day/year (12/25/1990), only day/month/year (25/12/1990), or either (03/04/1985). */
  mdyOnly: number; dmyOnly: number; either: number;
  /** One ambiguous value, to show how it reads. */
  sample: string | null;
  /** One that settles it, when there is one. */
  mdySample: string | null; dmySample: string | null;
}

/** What the file's own dates say about their order. */
export function dateEvidence(values: string[]): DateEvidence {
  const e: DateEvidence = { mdyOnly: 0, dmyOnly: 0, either: 0, sample: null, mdySample: null, dmySample: null };
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(String(v ?? '').trim());
    if (!m) continue;
    const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    // Only a real date is evidence: 31/02/1990 is no date in either order.
    if (a > 12 && b <= 12) { if (realYmd(y, b, a)) { e.dmyOnly++; e.dmySample ??= v; } }
    else if (b > 12 && a <= 12) { if (realYmd(y, a, b)) { e.mdyOnly++; e.mdySample ??= v; } }
    else if (a <= 12 && b <= 12 && a !== b) { e.either++; e.sample ??= v; }
  }
  return e;
}

/** The order the file shows, or the Philippine habit (month/day/year) when nothing settles it. */
export const suggestedOrder = (e: DateEvidence): DateOrder => (e.dmyOnly > e.mdyOnly ? 'dmy' : 'mdy');

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
/** Jr., Sr., III as they are written. */
export function tidySuffix(raw: string | null): string | null {
  const w = oneLine(raw ?? '').replace(/,$/, '');
  if (!w) return null;
  if (/^[ivx]+\.?$/i.test(w)) return w.replace('.', '').toUpperCase();
  if (/^(jr|sr)\.?$/i.test(w)) return w.charAt(0).toUpperCase() + w.slice(1, 2).toLowerCase() + '.';
  return w.slice(0, 10);
}

const PARTICLES = new Set(['de', 'del', 'dela', 'della', 'delas', 'delos', 'di', 'da', 'van', 'von', 'san', 'santa', 'sta', 'sto', 'santo', 'la', 'las', 'los', 'mc']);
const SUFFIX = /^(jr|sr|ii|iii|iv|v|vi)\.?$/i;

/** "Santos, Maria Clara" or "Maria Clara Dela Cruz Jr." as first / last / suffix. One word is a last name alone. */
export function splitName(full: string): { first: string; last: string; suffix: string | null } {
  const s = oneLine(full).normalize('NFC');
  let suffix: string | null = null;
  const takeSuffix = (words: string[]) => {
    while (words.length > 1 && SUFFIX.test(words[words.length - 1].replace(/,$/, ''))) {
      suffix = suffix ?? tidySuffix(words.pop()!);
    }
    return words;
  };
  if (s.includes(',')) {
    const [lastPart, ...rest] = s.split(',');
    const firstWords = takeSuffix(rest.join(' ').split(' ').filter(Boolean));
    const lastWords = takeSuffix(lastPart.split(' ').filter(Boolean));
    return { first: firstWords.join(' '), last: lastWords.join(' '), suffix };
  }
  const words = takeSuffix(s.split(' ').filter(Boolean));
  if (words.length <= 1) return { first: '', last: words[0] ?? '', suffix };
  // The last name starts at the first particle after the first word (Dela Cruz, De los Santos), else it is the last word.
  let at = words.length - 1;
  for (let i = 1; i < words.length - 1; i++) if (PARTICLES.has(fold(words[i]))) { at = i; break; }
  return { first: words.slice(0, at).join(' '), last: words.slice(at).join(' '), suffix };
}

/** Name words as typed, but an all-capitals or all-lower name gets capitals: "DELA CRUZ" → "Dela Cruz", "ma. theresa" → "Ma. Theresa". */
export function tidyName(s: string): string {
  const v = oneLine(s).normalize('NFC');
  if (v !== v.toLocaleUpperCase('en') && v !== v.toLocaleLowerCase('en')) return v;
  return v.toLocaleLowerCase('en').replace(/(^|[\s\-'.(])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('en'));
}

export const nameKey = (first: string, last: string) => `${fold(first)}|${fold(last)}`;

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------
/** A Philippine mobile as 09XXXXXXXXX, or what was typed when it is something else. */
export function readPhone(raw: string): { mobile: string | null; other: string | null } {
  const t = oneLine(raw);
  if (!t) return { mobile: null, other: null };
  const n = normalizePhone(t);
  return PH_MOBILE.test(n) ? { mobile: n, other: null } : { mobile: null, other: t.slice(0, 40) };
}

export function readSex(raw: string): 'female' | 'male' | 'other' | 'undisclosed' | null | 'bad' {
  const f = fold(raw);
  if (!f) return null;
  if (['f', 'female', 'babae', 'b', 'woman', 'girl'].includes(f)) return 'female';
  if (['m', 'male', 'lalaki', 'l', 'man', 'boy'].includes(f)) return 'male';
  if (['other', 'iba'].includes(f)) return 'other';
  if (['undisclosed', 'prefer not to say', 'not said', 'n a', 'na', 'unknown'].includes(f)) return 'undisclosed';
  return 'bad';
}

const NONE_WORDS = new Set(['none', 'none known', 'nka', 'nkda', 'no', 'wala', 'n a', 'na', 'nil', 'nothing', 'no known allergies']);
/** A list cell: blank is "not asked" (null), "none"/"wala"/"N/A" is asked-and-none ([]), else the items. */
export function readList(raw: string, picks: readonly string[]): string[] | null {
  const t = oneLine(raw);
  if (!t || t === '-' || t === '—') return null;
  if (NONE_WORDS.has(fold(t))) return [];
  return cleanList(t.split(/[,;/\n]| and /), picks);
}

/** FDI tooth numbers: permanent 11–48, milk teeth 51–85. */
export const isFdi = (n: number) => { const q = Math.floor(n / 10), t = n % 10; return (q >= 1 && q <= 4 && t >= 1 && t <= 8) || (q >= 5 && q <= 8 && t >= 1 && t <= 5); };
export function readTeeth(raw: string): { teeth: number[] | null } | { problem: string } {
  const t = oneLine(raw);
  if (!t || t === '-' || t === '—') return { teeth: null };
  const parts = t.split(/[\s,;/&+]+|\band\b/).map((x) => x.replace(/^#/, '')).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{2}$/.test(p) || !isFdi(+p)) return { problem: `“${p}” is not a tooth number. Teeth are FDI numbers: 11 to 48, milk teeth 51 to 85` };
    if (!out.includes(+p)) out.push(+p);
  }
  return { teeth: out.length ? out : null };
}

const METHOD_WORDS: Record<string, string> = {
  cash: 'cash', gcash: 'gcash', 'g cash': 'gcash', maya: 'maya', paymaya: 'maya', card: 'card', 'credit card': 'card', 'debit card': 'card',
  bank: 'bank_transfer', 'bank transfer': 'bank_transfer', 'bank deposit': 'bank_transfer', transfer: 'bank_transfer', hmo: 'hmo',
  philhealth: 'philhealth', 'phil health': 'philhealth', cheque: 'cheque', check: 'cheque',
};
export function readMethod(raw: string): string | null | 'bad' {
  const f = fold(raw);
  if (!f) return null;
  return METHOD_WORDS[f] ?? 'bad';
}

/** A peso amount from a cell: "1,500", "₱1500.50", "PHP 800". Blank or zero is none. */
export function readMoney(raw: string): { cents: Cents } | { problem: string } | null {
  const t = oneLine(raw);
  if (!t || t === '-' || t === '—') return null;
  if (/^-/.test(t.replace(/[₱\s]|php/gi, ''))) return { problem: `“${t}” is below zero` };
  const c = parseMoney(t);
  // parseMoney refuses more than one statement holds (₱999,999.99) the same way it refuses words: say which it was.
  if (c === null && /^\d{7,}(\.\d{1,2})?$/.test(t.replace(/[₱,\s]/g, '').replace(/^php/i, ''))) return { problem: `“${t}” is more than one statement can hold (₱999,999.99). Split it, or check the amount` };
  if (c === null) return { problem: `“${t}” is not a peso amount. Write it like 1500 or 1,500.50` };
  return c === 0n ? null : { cents: c };
}

// ---------------------------------------------------------------------------
// What the clinic already has, for matching and for not doing anything twice
// ---------------------------------------------------------------------------
export interface OnFile {
  id: string; chart_no: string; first_name: string; last_name: string; birth: string | null; phone: string | null;
  middle_name: string | null; suffix: string | null; sex: string | null; email: string | null; address_line: string | null; city: string | null; province: string | null;
  hmo_name: string | null; hmo_member_no: string | null; emergency_name: string | null; emergency_relation: string | null; emergency_phone: string | null;
  notes: string | null; has_health: boolean;
  /** The newest health answers on file, to tell a file that says the same from one that says something else. */
  health: HealthAnswers | null;
}
export interface Dentist { id: string; full_name: string; active: boolean }
export interface Service { id: string; code: string; name: string; local_name: string | null }

export interface Snapshot {
  patients: OnFile[];
  /** Every chart number in use here, archived records' too: a new patient never takes one. */
  takenCharts: Set<string>;
  /** Archived records by chart number: a number that is theirs is refused in words, never matched. */
  archivedByChart: Map<string, { name: string; chartNo: string }>;
  dentists: Dentist[];
  services: Service[];
  visitKeys: Set<string>;
  formKeys: Set<string>;
  paperDays: Set<string>;
  byChart: Map<string, OnFile>;
  byPhoneName: Map<string, OnFile[]>;
  byName: Map<string, OnFile[]>;
}

export const chartKey = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** Read everything a plan needs, once. Inside withClinic(): row-level security keeps it to this clinic. */
export async function snapshot(tx: Tx, groupId: string, opts: { visitKeys?: boolean } = {}): Promise<Snapshot> {
  const all = (await tx.query<OnFile & { archived: boolean }>(
    `select p.id, p.chart_no, p.first_name, p.last_name, to_char(p.birth_date, 'YYYY-MM-DD') as birth, p.phone,
            p.middle_name, p.suffix, p.sex, p.email::text as email, p.address_line, p.city, p.province,
            p.hmo_name, p.hmo_member_no, p.emergency_name, p.emergency_relation, p.emergency_phone, p.notes,
            exists (select 1 from medical_history h where h.patient_id = p.id) as has_health,
            (select json_build_object('allergies', h.allergies, 'conditions', h.conditions, 'medications', h.medications, 'note', h.note)
               from medical_history h where h.patient_id = p.id order by h.answered_at desc, h.id desc limit 1) as health,
            p.archived_at is not null as archived
       from patient p`)).rows;
  // An archived record is never matched or filled in, but its chart number stays its own (unique per clinic).
  const patients: OnFile[] = all.filter((p) => !p.archived);
  const takenCharts = new Set(all.map((p) => chartKey(p.chart_no)));
  const archivedByChart = new Map(all.filter((p) => p.archived).map((p) => [chartKey(p.chart_no), { name: `${p.first_name} ${p.last_name}`, chartNo: p.chart_no }]));
  // Staff is keyed by group, not under RLS: the dentists of this group, past ones too, for visits they saw.
  const dentists = (await tx.query<Dentist>(
    `select id, full_name, disabled_at is null as active from staff
      where group_id = $1 and role in ('owner', 'dentist', 'associate') order by disabled_at is null desc, full_name`, [groupId])).rows;
  const services = (await tx.query<Service>(`select id, code, name, local_name from procedure_catalog order by active desc, name`)).rows;
  const visitKeys = new Set<string>(opts.visitKeys === false ? [] : (await tx.query(`select import_key from appointment where import_key is not null`)).rows.map((r) => r.import_key));
  const formKeys = new Set<string>((await tx.query(`select form_key::text as k from invoice where imported_at is not null and form_key is not null`)).rows.map((r) => r.k));
  const paperDays = new Set<string>((await tx.query(`select patient_id::text || '|' || signed_on::text as k from patient_paper_consent`)).rows.map((r) => r.k));
  const byChart = new Map<string, OnFile>(), byPhoneName = new Map<string, OnFile[]>(), byName = new Map<string, OnFile[]>();
  const push = (m: Map<string, OnFile[]>, k: string, p: OnFile) => { const a = m.get(k); if (a) a.push(p); else m.set(k, [p]); };
  for (const p of patients) {
    byChart.set(chartKey(p.chart_no), p);
    const nk = nameKey(p.first_name, p.last_name);
    push(byName, nk, p);
    const ph = p.phone ? normalizePhone(p.phone) : '';
    if (PH_MOBILE.test(ph)) push(byPhoneName, `${ph}|${nk}`, p);
  }
  return { patients, takenCharts, archivedByChart, dentists, services, visitKeys, formKeys, paperDays, byChart, byPhoneName, byName };
}

/** A chart number that belongs to an archived record, as a sentence; null when it does not. */
export function archivedChart(s: Snapshot, chartNo: string | null): string | null {
  const a = chartNo ? s.archivedByChart.get(chartKey(chartNo)) : undefined;
  return a ? `Chart no. ${a.chartNo} belongs to an archived record (${a.name}), so it is not used again.` : null;
}

/**
 * The same person on file: chart number; else mobile + name, birth dates agreeing when both have one; else name + birth date.
 * `near` is someone who is probably the same person but does not agree in full, so the row is never a silent second record:
 * the same name and birth date with another mobile ('mobile'), or the same name and mobile with another birth date and the
 * same suffix ('birth': a date read in the wrong order, or a typo). A Jr. and his father on one mobile differ by the suffix.
 * A row with only a name is never matched here; plan() takes it to be the one patient of that name and suffix ('name').
 */
export function findOnFile(s: Snapshot, who: { chartNo: string | null; first: string; last: string; birth: string | null; mobile: string | null; suffix?: string | null }):
  { match: OnFile; by: 'chart' | 'mobile' | 'birth' | 'name' } | { clash: OnFile } | { near: OnFile; differs: 'mobile' | 'birth' | 'many' } | null {
  const nk = nameKey(who.first, who.last);
  if (who.chartNo) {
    const p = s.byChart.get(chartKey(who.chartNo));
    if (p) {
      // The row may name the patient a little differently ("Ma. Clara" for "Maria Clara"): the last name and the first word of the first name agree.
      const same = nameKey(p.first_name, p.last_name) === nk || (fold(p.last_name) === fold(who.last) && fold(p.first_name).split(' ')[0] === fold(who.first).split(' ')[0]);
      const noName = !who.first && !who.last;
      return same || noName ? { match: p, by: 'chart' } : { clash: p };
    }
  }
  if (who.mobile) {
    const all = s.byPhoneName.get(`${who.mobile}|${nk}`) ?? [];
    const list = all.filter((p) => !p.birth || !who.birth || p.birth === who.birth);
    if (list.length === 1) return { match: list[0], by: 'mobile' };
    const sameSuffix = (p: OnFile) => fold(p.suffix ?? '') === fold(who.suffix ?? '');
    if (list.length > 1) {
      // A father and his Jr. on one mobile, and no birth date to tell them apart: the suffix may.
      const one = who.suffix !== undefined ? list.filter(sameSuffix) : [];
      if (one.length === 1) return { match: one[0], by: 'mobile' };
      return { near: list[0], differs: 'many' };
    }
    if (who.suffix !== undefined) {
      const other = all.find(sameSuffix);
      if (other) return { near: other, differs: 'birth' };
    }
  }
  if (who.birth) {
    const list = (s.byName.get(nk) ?? []).filter((p) => p.birth === who.birth);
    const phoneAgrees = (p: OnFile) => !p.phone || !who.mobile || normalizePhone(p.phone) === who.mobile;
    const agree = list.filter(phoneAgrees);
    if (agree.length === 1) return { match: agree[0], by: 'birth' };
    if (list.length) return { near: list[0], differs: 'mobile' };
  }
  return null;
}

/** People on file who look like this person: for Add patient's check before saving. */
export function lookAlikes(s: Snapshot, who: { first: string; last: string; birth: string | null; mobile: string | null; chartNo?: string | null }): OnFile[] {
  const nk = nameKey(who.first, who.last);
  const out = new Set<OnFile>();
  if (who.chartNo) { const p = s.byChart.get(chartKey(who.chartNo)); if (p) out.add(p); }
  for (const p of s.byName.get(nk) ?? []) if (!p.birth || !who.birth || p.birth === who.birth) out.add(p);
  if (who.mobile) {
    for (const p of s.patients) {
      if (p.phone && normalizePhone(p.phone) === who.mobile && fold(p.last_name) === fold(who.last)) out.add(p);
    }
  }
  return [...out].slice(0, 5);
}

/**
 * A row with only a name (no chart no., mobile or birth date): the one patient on file of that name and suffix
 * ('match'); more than one ('many'); or one whose suffix differs, a Jr. and his father ('other'). Null: nobody.
 */
export function byNameOnly(s: Snapshot, first: string, last: string, suffix: string | null):
  { match: OnFile } | { many: OnFile[] } | { other: OnFile } | null {
  const same = s.byName.get(nameKey(first, last)) ?? [];
  const exact = same.filter((p) => fold(p.suffix ?? '') === fold(suffix ?? ''));
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) return { many: exact };
  return same.length ? { other: same[0] } : null;
}
const nameOnlyNote = (p: OnFile) => `Taken as ${p.chart_no} ${PERSON_LABEL(p.first_name, p.last_name, p.suffix)} on file: the same name, and the row has no chart no., mobile or birth date to say otherwise.`;
const nameOnlyWords = (f: { many: OnFile[] } | { other: OnFile }, first: string, last: string, suffix: string | null, fix: (chartNo: string) => string) => {
  const n = 'many' in f ? f.many[0] : f.other, who = `${n.chart_no} ${PERSON_LABEL(n.first_name, n.last_name, n.suffix)}`;
  return 'many' in f
    ? `${f.many.length} patients on file are named ${PERSON_LABEL(first, last, suffix)} (${who} is one), and nothing in the row tells which. Add their chart no., mobile or birth date.`
    : `${who} is on file, and nothing in the row says whether this is them. ${fix(n.chart_no)}`;
};

export function matchDentist(s: Snapshot, raw: string): { id: string | null; name: string | null } {
  const t = clean(raw, 120);
  if (!t) return { id: null, name: null };
  const strip = (x: string) => fold(x).replace(/^(dr|dra|doc|doctor)\s+/, '').replace(/\s+(dmd|dds|md)$/, '').trim();
  const want = strip(t);
  if (!want) return { id: null, name: t };
  const exact = s.dentists.filter((d) => strip(d.full_name) === want);
  if (exact.length === 1) return { id: exact[0].id, name: null };
  const words = want.split(' ');
  const partial = s.dentists.filter((d) => { const have = strip(d.full_name).split(' '); return words.every((w) => have.includes(w)); });
  if (partial.length === 1) return { id: partial[0].id, name: null };
  return { id: null, name: t };
}

/**
 * The fee guide's row for a service as the old record words it. The same name, code or Filipino name is that row, named as
 * the fee guide names it. Otherwise, when exactly one row's name, code or Filipino name is a whole phrase inside the words
 * ("Oral prophylaxis" holds the code prophylaxis, "Tooth extraction" holds Extraction), the visit keeps the old record's
 * words and is linked to that row (`linked`, for the preview to say so). Anything else is kept as written, unlinked.
 */
export function matchService(s: Snapshot, raw: string): { id: string | null; name: string; linked?: string } | null {
  const t = clean(raw, SERVICE_MAX);
  if (!t) return null;
  const f = fold(t);
  const terms = (x: Service) => [x.name, x.code, x.local_name].filter((w): w is string => !!w).map(fold).filter((w) => w.length >= 4);
  const hit = s.services.find((x) => fold(x.name) === f || fold(x.code) === f || (x.local_name && fold(x.local_name) === f));
  if (hit) return { id: hit.id, name: hit.name };
  const inside = s.services
    .map((x) => ({ x, len: Math.max(0, ...terms(x).filter((w) => ` ${f} `.includes(` ${w} `)).map((w) => w.length)) }))
    .filter((c) => c.len > 0)
    .sort((a, b) => b.len - a.len);
  if (inside.length === 1 || (inside.length > 1 && inside[0].len > inside[1].len)) return { id: inside[0].x.id, name: t, linked: inside[0].x.name };
  return { id: null, name: t };
}

// ---------------------------------------------------------------------------
// Keys that make a second import of the same thing do nothing
// ---------------------------------------------------------------------------
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** A UUID made from a string, so the same thing always gets the same one (invoice.form_key, payment.form_key). */
export const keyUuid = (s: string) => {
  const h = sha(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const visitKey = (clinicId: string, patientId: string, date: string, service: string, dentist: string) =>
  sha(`visit|${clinicId}|${patientId}|${date}|${fold(service)}|${fold(dentist)}`).slice(0, 40);
export const openingKey = (clinicId: string, patientId: string) => keyUuid(`opening|${clinicId}|${patientId}`);

// ---------------------------------------------------------------------------
// What a patient and a visit are, once read
// ---------------------------------------------------------------------------
export interface PatientIn {
  chartNo: string | null;
  first: string; middle: string | null; last: string; suffix: string | null;
  birth: string | null; sex: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null; province: string | null;
  hmoName: string | null; hmoMemberNo: string | null;
  emergencyName: string | null; emergencyRelation: string | null; emergencyPhone: string | null;
  notes: string | null;
  /** null: nothing was asked. */
  health: HealthAnswers | null;
  opening: { cents: Cents; asOf: string } | null;
  /** The clinic's own paper consent form, signed on this day. */
  paperForm: string | null;
}

export interface VisitIn {
  date: string;
  dentistId: string | null; dentistName: string | null;
  catalogId: string | null; service: string;
  teeth: number[] | null;
  notes: string | null;
  charged: Cents; paid: Cents; method: string;
}

/** The fields filled on a matched patient: only where the record has nothing. */
const FILLABLE: [keyof PatientIn, keyof OnFile, string][] = [
  ['middle', 'middle_name', 'middle name'], ['suffix', 'suffix', 'suffix'], ['birth', 'birth', 'birth date'], ['sex', 'sex', 'sex'],
  ['phone', 'phone', 'mobile'], ['email', 'email', 'email'], ['address', 'address_line', 'address'], ['city', 'city', 'city'], ['province', 'province', 'province'],
  ['hmoName', 'hmo_name', 'HMO'], ['hmoMemberNo', 'hmo_member_no', 'HMO member no.'], ['emergencyName', 'emergency_name', 'emergency contact'],
  ['emergencyRelation', 'emergency_relation', 'relation'], ['emergencyPhone', 'emergency_phone', 'emergency contact’s number'], ['notes', 'notes', 'notes'],
];

// ---------------------------------------------------------------------------
// Planning a file: every row, what it becomes, and why not
// ---------------------------------------------------------------------------
export interface RowPlan {
  /** The row's number in the spreadsheet. */
  row: number;
  status: 'new' | 'match' | 'same' | 'out';
  name: string;
  chartNo: string | null;
  /** Shown in the preview: the birth date or visit date as read. */
  date: string | null;
  mobile: string | null;
  /** On file: who it matched. */
  onFile: { id: string; name: string; chartNo: string } | null;
  problems: string[];
  notes: string[];
  /** What will change on a matched patient. */
  fills: string[];
  /** What comes in with a new row besides the row itself: health answers, a balance, a paper form, a statement. */
  brings: string[];
  /** Visits: the service as the row words it, for a row left out (a planned visit carries its own). */
  what?: string | null;
  patient?: PatientIn;
  visit?: VisitIn;
  /** For visits: the key, and whether money goes with it. */
  key?: string;
}

export interface Plan {
  kind: Kind;
  rows: RowPlan[];
  counts: {
    rows: number; out: number;
    newPatients: number; matched: number; filled: number; health: number; openings: number; paper: number;
    newVisits: number; sameVisits: number; statements: number; payments: number; charged: string; paid: string;
  };
  /** Things about the whole file: money columns left out, dates, encoding. */
  fileNotes: string[];
  dates: { evidence: DateEvidence; order: DateOrder; sample: { raw: string; read: string } | null; columns: string[] };
}

const PERSON_LABEL = (first: string, last: string, suffix?: string | null) => [first, last, suffix].filter(Boolean).join(' ');

/** Why a row that is probably someone on file is left out, and what to do: never a silent second record, never a guess. */
function nearWords(f: { near: OnFile; differs: 'mobile' | 'birth' | 'many' }, birth: string | null, of: 'patient' | 'visit'): string {
  const n = f.near, who = `${n.chart_no} ${PERSON_LABEL(n.first_name, n.last_name, n.suffix)}`;
  const fix = of === 'patient'
    ? `If it is them, put ${n.chart_no} in the chart no. column; if not, add them with Add patient.`
    : `Put their chart no. in the row (${n.chart_no}, if it is them).`;
  if (f.differs === 'mobile') return `Same name and birth date as ${who} on file, with another mobile. ${fix}`;
  if (f.differs === 'many') return `More than one patient on file has this name and mobile (${who} is one), and nothing in the row tells which. ${of === 'patient' ? 'Add the birth date or the chart no.' : 'Add the chart no. or the birth date.'}`;
  return `Same name and mobile as ${who} on file, who was born ${n.birth ? ymdText(n.birth) : '(no date on file)'}, not ${birth ? ymdText(birth) : '(no date)'}. Check the date order above. ${fix}`;
}

interface PlanInput {
  kind: Kind; headers: string[]; rows: string[][]; mapping: Mapping; order: DateOrder;
  money: boolean; clinicId: string; today?: string; headerRow?: number;
}

/** Decide what every row becomes. Pure, apart from reading the snapshot: the preview and the run share it. */
export function plan(s: Snapshot, input: PlanInput): Plan {
  const today = input.today ?? manilaToday();
  const colOf = new Map<string, number>(Object.entries(input.mapping).map(([c, k]) => [k, Number(c)]));
  const has = (k: string) => colOf.has(k);
  const cell = (r: string[], k: string) => (colOf.has(k) ? r[colOf.get(k)!] ?? '' : '');
  const dateKeys = input.kind === 'patients' ? ['birth_date', 'paper_consent', 'balance_as_of'] : ['visit_date', 'birth_date'];
  const dateValues = dateKeys.flatMap((k) => (has(k) ? input.rows.map((r) => cell(r, k)) : []));
  const evidence = dateEvidence(dateValues);
  const sampleRaw = evidence.sample;
  const sampleRead = sampleRaw ? readDate(sampleRaw, input.order, today) : null;
  const fileNotes: string[] = [];
  const out: RowPlan[] = [];
  const counts = { rows: input.rows.filter((r) => r.some((c) => String(c ?? '').trim())).length, out: 0, newPatients: 0, matched: 0, filled: 0, health: 0, openings: 0, paper: 0, newVisits: 0, sameVisits: 0, statements: 0, payments: 0, charged: '0', paid: '0' };
  let charged = 0n, paid = 0n;

  const nameOf = (r: string[], problems: string[]) => {
    let first = tidyName(cell(r, 'first_name')), last = tidyName(cell(r, 'last_name'));
    let suffix = clean(cell(r, 'suffix'), 10);
    if (!first && !last && has('full_name')) {
      const sp = splitName(cell(r, 'full_name'));
      first = tidyName(sp.first); last = tidyName(sp.last); suffix = suffix ?? sp.suffix;
    }
    if (!first && !last) problems.push('No name. Fill in the first and last name, or a full name.');
    else if (!last) problems.push(`Only “${first}”: add the last name.`);
    else if (!first) problems.push(`Only “${last}”: add the first name.`);
    if (first.length > NAME_PART_MAX || last.length > NAME_PART_MAX) problems.push(`The name is longer than ${NAME_PART_MAX} characters a part. Check the row.`);
    return { first, last, suffix: tidySuffix(suffix) };
  };
  const dateOf = (r: string[], k: string, label: string, problems: string[], notes: string[]) => {
    const d = readDate(cell(r, k), input.order, today);
    if (!d) return null;
    if ('problem' in d) { problems.push(`${label}: ${d.problem}.`); return null; }
    if (d.note) notes.push(`${label}: ${d.note}.`);
    return d.ymd;
  };
  /** A birth date cell that holds only a year (1985): the year, else null. */
  const birthYearOf = (r: string[]) => { const d = readDate(cell(r, 'birth_date'), input.order, today); return d && 'year' in d && d.year ? d.year : null; };

  if (!input.money) {
    // The columns that are money, as someone with finance access would have them matched.
    const full = autoMap(input.headers, input.kind, true);
    const left = input.headers.filter((_, i) => fieldByKey(input.mapping[String(i)] ?? full[String(i)] ?? '')?.money);
    if (left.length) fileNotes.push(`Money is left out (${left.join(', ')}): your account does not see finances at this branch. Someone who does can import the same file again to bring it in; nothing else will be added twice.`);
  }

  if (input.kind === 'patients') {
    const seenChart = new Map<string, number>(), seenPerson = new Map<string, number>(), seenName = new Map<string, number>();
    const picks = Object.fromEntries(LISTS.map((l) => [l.key, l.picks]));
    input.rows.forEach((r, i) => {
      if (r.every((c) => !String(c ?? '').trim())) return;
      const row = rowNumber(i, input.headerRow);
      const problems: string[] = [], notes: string[] = [];
      const { first, last, suffix } = nameOf(r, problems);
      const chartNo = clean(cell(r, 'chart_no'), 20);
      if (chartNo && !/^[\p{L}\p{N}][\p{L}\p{N} ._\/-]*$/u.test(chartNo)) problems.push(`Chart no. “${chartNo}” has characters a chart number does not use.`);
      const archived = archivedChart(s, chartNo);
      if (archived) problems.push(`${archived} Leave the chart no. blank for a new number, or give the one on the card.`);
      // Only a year (old index cards): no birthday is made up from it; the year goes in the record's notes.
      const birthYear = birthYearOf(r);
      if (birthYear) notes.push(`Birth date: only the year, ${birthYear}, so no birth date is recorded.`);
      const birth = birthYear ? null : dateOf(r, 'birth_date', 'Birth date', problems, notes);
      if (birth && birth > today) problems.push(`Birth date ${ymdText(birth)} is after today.`);
      else if (birth && birth < '1900-01-01') problems.push(`Birth date ${ymdText(birth)} is before 1900.`);
      const sexRaw = readSex(cell(r, 'sex'));
      if (sexRaw === 'bad') notes.push(`Sex “${cell(r, 'sex')}” was left out: write Female, Male, or leave it blank.`);
      const phone = readPhone(cell(r, 'mobile'));
      let extraNote: string | null = null;
      if (phone.other) { notes.push(`${phone.other} is not a Philippine mobile, so texts cannot reach it. It is kept in the notes instead.`); extraNote = `Phone from the old records: ${phone.other}`; }
      const emailRaw = clean(cell(r, 'email'), EMAIL_MAX + 1);
      let email: string | null = null;
      if (emailRaw) { const e = normalizeEmail(emailRaw); if (EMAIL_ADDRESS.test(e) && e.length <= EMAIL_MAX) email = e; else notes.push(`“${emailRaw}” is not an email address; left out.`); }
      const ePhoneRaw = clean(cell(r, 'emergency_phone'), 40);
      const ePhone = ePhoneRaw ? (readPhone(ePhoneRaw).mobile ?? ePhoneRaw.slice(0, 20)) : null;
      const health: HealthAnswers = {
        allergies: readList(cell(r, 'allergies'), picks.allergies), conditions: readList(cell(r, 'conditions'), picks.conditions),
        medications: readList(cell(r, 'medicines'), picks.medications), note: clean(cell(r, 'health_note'), NOTE_MAX),
      };
      for (const l of LISTS) { const v = health[l.key]; if (v && v.some((x) => x.length > 60)) problems.push(`${l.label}: one item is longer than 60 characters. Split it with commas.`); if (v && v.length > 20) problems.push(`${l.label}: more than 20 items.`); }
      const anyHealth = LISTS.some((l) => health[l.key] !== null) || !!health.note;
      let opening: PatientIn['opening'] = null;
      if (input.money) {
        const m = readMoney(cell(r, 'opening_balance'));
        if (m && 'problem' in m) problems.push(`Opening balance: ${m.problem}.`);
        else if (m) {
          const asOf = dateOf(r, 'balance_as_of', 'Balance as of', problems, notes) ?? today;
          if (asOf > today) problems.push(`Balance as of ${ymdText(asOf)} is after today.`);
          opening = { cents: m.cents, asOf };
        }
      }
      const paperForm = dateOf(r, 'paper_consent', 'Consent signed on paper', problems, notes);
      if (paperForm && paperForm > today) problems.push(`Consent signed on paper ${ymdText(paperForm)} is after today.`);
      const notesText = [clean(cell(r, 'notes'), NOTES_MAX), extraNote, birthYear ? `Born in ${birthYear} (the old records give only the year)` : null].filter(Boolean).join(' · ') || null;
      const patient: PatientIn = {
        chartNo, first, middle: tidyName(cell(r, 'middle_name')).slice(0, NAME_PART_MAX) || null, last, suffix,
        birth, sex: sexRaw === 'bad' ? null : sexRaw, phone: phone.mobile, email,
        address: clean(cell(r, 'address'), 200), city: clean(cell(r, 'city'), 80), province: clean(cell(r, 'province'), 80),
        hmoName: clean(cell(r, 'hmo_name'), 80), hmoMemberNo: clean(cell(r, 'hmo_member_no'), 40),
        emergencyName: clean(tidyName(cell(r, 'emergency_name')), 120), emergencyRelation: clean(cell(r, 'emergency_relation'), 40), emergencyPhone: ePhone,
        notes: notesText, health: anyHealth ? health : null, opening, paperForm,
      };
      const plan: RowPlan = { row, status: 'new', name: PERSON_LABEL(first, last, suffix), chartNo, date: birth, mobile: phone.mobile, onFile: null, problems, notes, fills: [], brings: [], patient };

      // The same person twice in the file.
      if (chartNo) { const k = chartKey(chartNo); if (seenChart.has(k)) problems.push(`Same chart no. as row ${seenChart.get(k)}.`); else seenChart.set(k, row); }
      const personKey = `${nameKey(first, last)}|${phone.mobile ?? ''}|${birth ?? ''}`;
      if (first && last && (phone.mobile || birth)) { if (seenPerson.has(personKey)) problems.push(`Same name, mobile and birth date as row ${seenPerson.get(personKey)}.`); else seenPerson.set(personKey, row); }
      // A row with only a name (no chart no., mobile or birth date) is told apart from others by nothing else:
      // after a row of the same name, it may be that person again, so it is never a second record by itself.
      const nameOnly = !!(first && last) && !chartNo && !phone.mobile && !birth;
      const sameNameKey = `${nameKey(first, last)}|${fold(suffix ?? '')}`;
      if (first && last) {
        const earlier = seenName.get(sameNameKey);
        if (earlier === undefined) seenName.set(sameNameKey, row);
        else if (nameOnly) problems.push(`Same name as row ${earlier}, and nothing in this row tells them apart. If it is the same patient, delete the row; if not, add a chart no., mobile or birth date.`);
      }

      if (!problems.length) {
        let found = findOnFile(s, { chartNo, first, last, birth, mobile: phone.mobile, suffix });
        // Only a name: the one patient on file of that name (and suffix) is taken to be them, and the row says so;
        // with more than one, or one whose suffix differs (a Jr. and his father), the row is left out: never a guess.
        if (!found && nameOnly) {
          const b = byNameOnly(s, first, last, suffix);
          if (b && 'match' in b) found = { match: b.match, by: 'name' };
          else if (b) problems.push(nameOnlyWords(b, first, last, suffix, (c) => `If it is, put ${c} in the chart no. column; if not, add a mobile or birth date.`));
        }
        if (found && 'clash' in found) {
          problems.push(`Chart no. ${found.clash.chart_no} is ${PERSON_LABEL(found.clash.first_name, found.clash.last_name)} on file, not ${plan.name}. Check the number.`);
        } else if (found && 'match' in found) {
          const p = found.match;
          plan.onFile = { id: p.id, name: PERSON_LABEL(p.first_name, p.last_name, p.suffix), chartNo: p.chart_no };
          if (found.by === 'name') notes.push(nameOnlyNote(p));
          for (const [from, to, label] of FILLABLE) {
            const v = patient[from] as string | null;
            const have = p[to] as string | null;
            if (v && (have === null || have === '')) plan.fills.push(label);
          }
          if (patient.health && !p.has_health) plan.fills.push('health answers');
          else if (patient.health && p.has_health && !sameAnswers(p.health, patient.health)) notes.push('The record already has health answers, and they differ from the file’s: the file’s are left out, as the record may be newer. Check them on the record.');
          if (opening) {
            if (s.formKeys.has(openingKey(input.clinicId, p.id))) { notes.push('An opening balance was brought in for this patient before; this one is left out.'); patient.opening = null; }
            else plan.fills.push(`opening balance ${pesos(opening.cents)}`);
          }
          if (paperForm) {
            if (s.paperDays.has(`${p.id}|${paperForm}`)) patient.paperForm = null;
            else plan.fills.push('paper consent');
          }
          plan.status = plan.fills.length ? 'match' : 'same';
        } else if (found && 'near' in found) {
          // Probably the same person with a new number, or a birth date read another way: never a silent second record.
          problems.push(nearWords(found, birth, 'patient'));
        }
      }

      if (problems.length) { plan.status = 'out'; counts.out++; }
      else if (plan.status === 'new') {
        if (patient.health) plan.brings.push('health answers');
        if (patient.opening) plan.brings.push(`an opening balance of ${pesos(patient.opening.cents)}`);
        if (patient.paperForm) plan.brings.push(`the clinic’s own consent form, signed ${ymdText(patient.paperForm)}`);
        if (birthYear) plan.brings.push(`the year of birth, ${birthYear}, in its notes`);
        counts.newPatients++;
        if (patient.health) counts.health++;
        if (patient.opening) { counts.openings++; charged += patient.opening.cents; }
        if (patient.paperForm) counts.paper++;
      } else {
        counts.matched++;
        if (plan.status === 'match') counts.filled++;
        const p = s.patients.find((x) => x.id === plan.onFile!.id)!;
        if (patient.health && !p.has_health) counts.health++;
        if (patient.opening) { counts.openings++; charged += patient.opening.cents; }
        if (patient.paperForm) counts.paper++;
      }
      out.push(plan);
    });
  } else {
    const seenKey = new Map<string, number>();
    input.rows.forEach((r, i) => {
      if (r.every((c) => !String(c ?? '').trim())) return;
      const row = rowNumber(i, input.headerRow);
      const problems: string[] = [], notes: string[] = [];
      const chartNo = clean(cell(r, 'chart_no'), 20);
      const hasName = has('full_name') || has('first_name') || has('last_name');
      const nameProblems: string[] = [];
      const { first, last, suffix } = hasName ? nameOf(r, nameProblems) : { first: '', last: '', suffix: null };
      const birthYear = birthYearOf(r);
      if (birthYear) notes.push(`Birth date: only the year, ${birthYear}, so it is not used to find the patient.`);
      const birth = birthYear ? null : dateOf(r, 'birth_date', 'Birth date', problems, notes);
      const phone = readPhone(cell(r, 'mobile'));
      const date = dateOf(r, 'visit_date', 'Visit date', problems, notes);
      if (!cell(r, 'visit_date')) problems.push('No visit date.');
      else if (date && date > today) problems.push(`Visit date ${ymdText(date)} is after today. Only past visits come in this way; book coming ones on the Dashboard.`);
      else if (date && date < '1900-01-01') problems.push(`Visit date ${ymdText(date)} is before 1900.`);
      const service = matchService(s, cell(r, 'service'));
      if (!service) problems.push('No service. Say what was done.');
      const dentist = matchDentist(s, cell(r, 'dentist'));
      const teeth = readTeeth(cell(r, 'teeth'));
      if ('problem' in teeth) problems.push(`Teeth: ${teeth.problem}.`);
      const vnotes = clean(cell(r, 'visit_notes'), VISIT_NOTE_MAX);
      let chargedC = 0n, paidC = 0n, method = 'unrecorded';
      if (input.money) {
        const c = readMoney(cell(r, 'charged')), p = readMoney(cell(r, 'paid'));
        if (c && 'problem' in c) problems.push(`Amount charged: ${c.problem}.`); else if (c) chargedC = c.cents;
        if (p && 'problem' in p) problems.push(`Amount paid: ${p.problem}.`); else if (p) paidC = p.cents;
        if (paidC > 0n && chargedC === 0n) problems.push('An amount paid with no amount charged. Put what the visit cost too.');
        else if (paidC > chargedC) problems.push(`Paid ${pesos(paidC)} is more than the ${pesos(chargedC)} charged.`);
        const m = readMethod(cell(r, 'paid_by'));
        if (m === 'bad') problems.push(`Paid by “${cell(r, 'paid_by')}”: write one of ${[...Object.values(METHODS), 'Cheque'].join(', ')}, or leave it blank.`);
        else if (m) method = m;
      }

      // Whose visit: chart number, or the name with a mobile or a birth date, or the name alone when one patient has it.
      let who: OnFile | null = null;
      const archived = archivedChart(s, chartNo);
      if (!chartNo && !(first && last)) problems.push(...(nameProblems.length ? nameProblems : ['No chart no. and no name: say whose visit it is.']));
      else if (archived) problems.push(`${archived} Its visits are not brought in.`);
      else {
        const found = findOnFile(s, { chartNo, first, last, birth, mobile: phone.mobile, suffix });
        if (found && 'match' in found) who = found.match;
        else if (found && 'near' in found) problems.push(nearWords(found, birth, 'visit'));
        else if (found && 'clash' in found) problems.push(`Chart no. ${found.clash.chart_no} is ${PERSON_LABEL(found.clash.first_name, found.clash.last_name)} on file, not ${PERSON_LABEL(first, last)}.`);
        else if (chartNo) problems.push(`No patient with chart no. ${chartNo} here. Import the Patients file first, or check the number.`);
        else if (!phone.mobile && !birth) {
          // Only a name, as a Patients file with only names brought them in: the one patient of that name, said so.
          const b = byNameOnly(s, first, last, suffix);
          if (b && 'match' in b) { who = b.match; notes.push(nameOnlyNote(b.match)); }
          else if (b) problems.push(nameOnlyWords(b, first, last, suffix, (c) => `Put their chart no. in the row (${c}, if it is them), or their mobile or birth date.`));
          else problems.push(`No patient named ${PERSON_LABEL(first, last, suffix)} on file. Import the Patients file first, or add their chart no., mobile or birth date.`);
        }
        else problems.push(`No patient named ${PERSON_LABEL(first, last)} with that ${phone.mobile ? 'mobile' : 'birth date'} on file. Import the Patients file first.`);
      }

      const plan: RowPlan = {
        row, status: 'new', name: who ? PERSON_LABEL(who.first_name, who.last_name, who.suffix) : PERSON_LABEL(first, last) || (chartNo ?? ''),
        chartNo: who?.chart_no ?? chartNo, date, mobile: phone.mobile, onFile: who ? { id: who.id, name: PERSON_LABEL(who.first_name, who.last_name, who.suffix), chartNo: who.chart_no } : null,
        problems, notes, fills: [], brings: [], what: service?.name ?? null,
      };
      if (dentist.name && cell(r, 'dentist')) notes.push(`${dentist.name} is not on the team here; kept as written.`);
      if (service && !service.id) notes.push(`“${service.name}” is not in the fee guide; kept as written.`);
      else if (service?.linked) notes.push(`“${service.name}” is kept as written and linked to ${service.linked} in the fee guide.`);
      if (who && date && service && !problems.length) {
        const key = visitKey(input.clinicId, who.id, date, service.name, dentist.id ?? dentist.name ?? '');
        if (seenKey.has(key)) problems.push(`Same patient, day, service and dentist as row ${seenKey.get(key)}.`);
        else seenKey.set(key, row);
        plan.key = key;
        plan.visit = {
          date, dentistId: dentist.id, dentistName: dentist.name, catalogId: service.id, service: service.name,
          teeth: 'teeth' in teeth ? teeth.teeth : null, notes: vnotes, charged: chargedC, paid: paidC, method: paidC > 0n ? method : 'unrecorded',
        };
        if (!problems.length && s.visitKeys.has(key)) {
          // Brought in before, perhaps by someone who does not see finances: its charge can still come in, once.
          if (chargedC > 0n && !s.formKeys.has(keyUuid(`charge|${key}`))) { plan.status = 'match'; plan.fills.push(`its charge, ${pesos(chargedC)}`); notes.unshift('The visit is already on file from an earlier import.'); }
          else { plan.status = 'same'; notes.unshift('Already on file from an earlier import; left as it is.'); }
        }
      }
      if (problems.length) { plan.status = 'out'; counts.out++; }
      else if (plan.status === 'same') counts.sameVisits++;
      else if (plan.status === 'match') {
        counts.sameVisits++; counts.statements++; charged += chargedC;
        if (paidC > 0n) { counts.payments++; paid += paidC; }
      } else {
        if (chargedC > 0n) plan.brings.push(`a statement for ${pesos(chargedC)}, ${paidC === 0n ? 'unpaid' : `${pesos(paidC)} paid${method === 'unrecorded' ? '' : ` by ${methodLabel(method)}`}`}`);
        counts.newVisits++;
        if (chargedC > 0n) { counts.statements++; charged += chargedC; }
        if (paidC > 0n) { counts.payments++; paid += paidC; }
      }
      out.push(plan);
    });
  }
  counts.charged = toDb(charged); counts.paid = toDb(paid);
  return {
    kind: input.kind, rows: out, counts, fileNotes,
    dates: {
      evidence, order: input.order,
      sample: sampleRaw && sampleRead && 'ymd' in sampleRead ? { raw: sampleRaw, read: ymdText(sampleRead.ymd) } : null,
      columns: dateKeys.filter(has).map((k) => fieldByKey(k)!.label),
    },
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
/** The lock the schedule and the booking API take: one writer of patients and numbers per clinic at a time. */
export const lockClinic = (tx: Tx, clinicId: string) => tx.query('select pg_advisory_xact_lock(hashtext($1))', [clinicId]);

/** The next free desk chart numbers, P-0007 on, stepping past any taken. */
export function nextChartNos(taken: Iterable<string>, n: number): string[] {
  const used = new Set([...taken].map(chartKey));
  const out: string[] = [];
  let i = 1;
  while (out.length < n) {
    const c = `P-${String(i).padStart(4, '0')}`;
    if (!used.has(chartKey(c))) { out.push(c); used.add(chartKey(c)); }
    i++;
  }
  return out;
}

interface Ctx { clinicId: string; staffId: string; importId: string | null }

const auditMany = async (tx: Tx, ctx: Ctx, rows: { action: string; entity: string; id: string }[]) => {
  if (!rows.length) return;
  await tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id)
     select $1, $2, x.action, x.entity, x.id from jsonb_to_recordset($3::jsonb) as x(action text, entity text, id uuid)`,
    [ctx.clinicId, ctx.staffId, JSON.stringify(rows)]);
};

/** New patients, in one insert. Chart numbers must already be set and free. Returns their ids in order. */
export async function insertPatients(tx: Tx, ctx: Ctx, list: (PatientIn & { chartNo: string })[]): Promise<string[]> {
  if (!list.length) return [];
  const { rows } = await tx.query<{ id: string; chart_no: string }>(
    `insert into patient (clinic_id, chart_no, first_name, middle_name, last_name, suffix, birth_date, sex, phone, email, address_line, city, province,
                          hmo_name, hmo_member_no, emergency_name, emergency_relation, emergency_phone, notes, created_by, import_id)
     select $1, x.chart_no, x.first_name, x.middle_name, x.last_name, x.suffix, x.birth_date, x.sex, x.phone, x.email, x.address_line, x.city, x.province,
            x.hmo_name, x.hmo_member_no, x.emergency_name, x.emergency_relation, x.emergency_phone, x.notes, $2, $3
       from jsonb_to_recordset($4::jsonb) as x(chart_no text, first_name text, middle_name text, last_name text, suffix text, birth_date date, sex text,
            phone text, email text, address_line text, city text, province text, hmo_name text, hmo_member_no text, emergency_name text,
            emergency_relation text, emergency_phone text, notes text)
     returning id, chart_no`,
    [ctx.clinicId, ctx.staffId, ctx.importId, JSON.stringify(list.map((p) => ({
      chart_no: p.chartNo, first_name: p.first, middle_name: p.middle, last_name: p.last, suffix: p.suffix, birth_date: p.birth, sex: p.sex,
      phone: p.phone, email: p.email, address_line: p.address, city: p.city, province: p.province, hmo_name: p.hmoName, hmo_member_no: p.hmoMemberNo,
      emergency_name: p.emergencyName, emergency_relation: p.emergencyRelation, emergency_phone: p.emergencyPhone, notes: p.notes,
    })))]);
  const byChart = new Map(rows.map((r) => [chartKey(r.chart_no), r.id]));
  const ids = list.map((p) => byChart.get(chartKey(p.chartNo))!);
  await auditMany(tx, ctx, ids.map((id) => ({ action: 'patient.create', entity: 'patient', id })));
  return ids;
}

/** Fill what is empty on matched patients, never more. A birth date filled in is a medical_history version too (health.ts's rule). */
export async function fillPatients(tx: Tx, ctx: Ctx, list: { id: string; p: PatientIn }[]): Promise<void> {
  if (!list.length) return;
  const data = list.map(({ id, p }) => ({
    id, middle_name: p.middle, suffix: p.suffix, birth_date: p.birth, sex: p.sex, phone: p.phone, email: p.email, address_line: p.address, city: p.city,
    province: p.province, hmo_name: p.hmoName, hmo_member_no: p.hmoMemberNo, emergency_name: p.emergencyName, emergency_relation: p.emergencyRelation,
    emergency_phone: p.emergencyPhone, notes: p.notes,
  }));
  // Which birth dates are being filled (none on file yet), before the update.
  const births = (await tx.query<{ id: string; birth: string }>(
    `select x.id, x.birth_date::text as birth from jsonb_to_recordset($1::jsonb) as x(id uuid, birth_date date)
       join patient p on p.id = x.id where p.birth_date is null and x.birth_date is not null`, [JSON.stringify(data)])).rows;
  const e = (c: string) => `${c} = coalesce(nullif(p.${c}::text, ''), x.${c})`;
  await tx.query(
    `update patient p set ${['middle_name', 'suffix', 'sex', 'phone', 'address_line', 'city', 'province', 'hmo_name', 'hmo_member_no', 'emergency_name', 'emergency_relation', 'emergency_phone', 'notes'].map(e).join(', ')},
            email = coalesce(p.email, x.email::citext), birth_date = coalesce(p.birth_date, x.birth_date), updated_at = now()
       from jsonb_to_recordset($1::jsonb) as x(id uuid, middle_name text, suffix text, birth_date date, sex text, phone text, email text, address_line text,
            city text, province text, hmo_name text, hmo_member_no text, emergency_name text, emergency_relation text, emergency_phone text, notes text)
      where p.id = x.id`, [JSON.stringify(data)]);
  if (births.length) {
    await tx.query(
      `insert into medical_history (clinic_id, patient_id, answered_by, recorded_by, allergies, conditions, medications, note, answers)
       select $1, x.id, 'staff', $2, h.allergies, h.conditions, h.medications, h.note, jsonb_build_object('birth_date', jsonb_build_object('from', null, 'to', x.birth))
         from jsonb_to_recordset($3::jsonb) as x(id uuid, birth text)
         left join lateral (select m.allergies, m.conditions, m.medications, m.note from medical_history m where m.patient_id = x.id
                             order by m.answered_at desc, m.id desc limit 1) h on true`, [ctx.clinicId, ctx.staffId, JSON.stringify(births)]);
  }
  await auditMany(tx, ctx, [
    ...list.map(({ id }) => ({ action: 'patient.update', entity: 'patient', id })),
    ...births.map(({ id }) => ({ action: 'patient.birth_date', entity: 'patient', id })),
  ]);
}

/** A first health version for each patient, recorded by the person importing. Only for patients with none yet. */
export async function insertHealth(tx: Tx, ctx: Ctx, list: { id: string; h: HealthAnswers }[]): Promise<void> {
  if (!list.length) return;
  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_by, recorded_by, allergies, conditions, medications, note, answers)
     select $1, x.id, 'staff', $2, x.allergies, x.conditions, x.medications, x.note, '{}'::jsonb
       from jsonb_to_recordset($3::jsonb) as x(id uuid, allergies text[], conditions text[], medications text[], note text)
      where not exists (select 1 from medical_history m where m.patient_id = x.id)`,
    [ctx.clinicId, ctx.staffId, JSON.stringify(list.map(({ id, h }) => ({ id, allergies: h.allergies, conditions: h.conditions, medications: h.medications, note: h.note })))]);
  await auditMany(tx, ctx, list.map(({ id }) => ({ action: 'health.update', entity: 'patient', id })));
}

/** The clinic's own paper consent forms, one per patient per day. */
export async function insertPaperForms(tx: Tx, ctx: Ctx, list: { id: string; day: string; by?: string | null; agreedAs?: string | null }[]): Promise<number> {
  if (!list.length) return 0;
  const { rows } = await tx.query<{ patient_id: string }>(
    `insert into patient_paper_consent (clinic_id, patient_id, signed_on, signed_by_name, agreed_as, recorded_by, import_id)
     select $1, x.id, x.day, x.by, x.agreed_as, $2, $3 from jsonb_to_recordset($4::jsonb) as x(id uuid, day date, by text, agreed_as text)
     on conflict (clinic_id, patient_id, signed_on) do nothing returning patient_id`,
    [ctx.clinicId, ctx.staffId, ctx.importId, JSON.stringify(list.map((x) => ({ id: x.id, day: x.day, by: x.by ?? null, agreed_as: x.agreedAs ?? null })))]);
  await auditMany(tx, ctx, rows.map((r) => ({ action: 'consent.paper_form', entity: 'patient', id: r.patient_id })));
  return rows.length;
}

/** Completed visits from before Flossify. A key already on file is skipped. Returns the new visits' ids by key. */
export async function insertVisits(tx: Tx, ctx: Ctx, list: { patientId: string; key: string; v: VisitIn }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { rows } = await tx.query<{ id: string; import_key: string }>(
    `insert into appointment (clinic_id, patient_id, dentist_id, dentist_name, starts_at, ends_at, reason, catalog_id, teeth, notes, status, source,
                              date_only, created_by, import_id, import_key)
     select $1, x.patient_id, x.dentist_id, x.dentist_name, (x.day + time '12:00') at time zone 'Asia/Manila', (x.day + time '12:00') at time zone 'Asia/Manila',
            x.service, x.catalog_id, x.teeth, x.notes, 'completed', 'import', true, $2, $3, x.key
       from jsonb_to_recordset($4::jsonb) as x(patient_id uuid, dentist_id uuid, dentist_name text, day date, service text, catalog_id uuid, teeth smallint[], notes text, key text)
     on conflict (clinic_id, import_key) where import_key is not null do nothing
     returning id, import_key`,
    [ctx.clinicId, ctx.staffId, ctx.importId, JSON.stringify(list.map(({ patientId, key, v }) => ({
      patient_id: patientId, dentist_id: v.dentistId, dentist_name: v.dentistId ? null : v.dentistName, day: v.date, service: v.service,
      catalog_id: v.catalogId, teeth: v.teeth, notes: v.notes, key,
    })))]);
  for (const r of rows) out.set(r.import_key, r.id);
  await auditMany(tx, ctx, rows.map((r) => ({ action: 'appointment.import', entity: 'appointment', id: r.id })));
  return out;
}

export interface MoneyIn {
  patientId: string;
  /** Derived, so the same charge brought in twice is one statement. */
  formKey: string;
  day: string;
  appointmentId: string | null;
  line: { desc: string; catalogId: string | null };
  charged: Cents;
  paid: Cents;
  method: string;
}

/**
 * Statements (and a payment each, when something was paid) for charges from
 * before Flossify. Numbers in the clinic's own series, one block for the lot,
 * oldest first; a form_key already used is skipped before a number is taken,
 * so the series stays without gaps.
 */
export async function insertMoney(tx: Tx, ctx: Ctx, list: MoneyIn[]): Promise<{ statements: number; payments: number }> {
  if (!list.length) return { statements: 0, payments: 0 };
  const have = new Set((await tx.query(`select form_key::text as k from invoice where form_key = any($1::uuid[])`, [list.map((m) => m.formKey)])).rows.map((r) => r.k));
  const todo = list.filter((m) => !have.has(m.formKey) && m.charged > 0n).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!todo.length) return { statements: 0, payments: 0 };
  const n = todo.length;
  const { rows: [first] } = await tx.query<{ first: string }>(
    `insert into invoice_series (clinic_id, prefix, next_number) values ($1, $2, 1 + $3::bigint)
     on conflict (clinic_id, prefix) do update set next_number = invoice_series.next_number + $3::bigint
     returning (next_number - $3::bigint)::text as first`, [ctx.clinicId, SERIES, n]);
  const start = BigInt(first.first);
  const inv = todo.map((m, i) => ({
    patient_id: m.patientId, number: String(start + BigInt(i)), day: m.day, total: toDb(m.charged), form_key: m.formKey, appointment_id: m.appointmentId,
    status: m.paid >= m.charged ? 'paid' : m.paid > 0n ? 'partly_paid' : 'issued',
  }));
  const { rows: made } = await tx.query<{ id: string; form_key: string }>(
    `insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, discount, discount_kind, vat_rate, vat_amount, total,
                          payor_share, status, created_by, form_key, imported_at, import_id, appointment_id)
     select $1, x.patient_id, $2, x.number, (x.day + time '12:00') at time zone 'Asia/Manila', x.total, 0, 'none', 0, 0, x.total,
            0, x.status, $3, x.form_key, now(), $4, x.appointment_id
       from jsonb_to_recordset($5::jsonb) as x(patient_id uuid, number bigint, day date, total numeric, form_key uuid, appointment_id uuid, status text)
     returning id, form_key::text`, [ctx.clinicId, SERIES, ctx.staffId, ctx.importId, JSON.stringify(inv)]);
  const idOf = new Map(made.map((r) => [r.form_key, r.id]));
  await tx.query(
    `insert into invoice_line (clinic_id, invoice_id, catalog_id, description, quantity, unit_price, amount, line_no)
     select $1, x.invoice_id, x.catalog_id, x.description, 1, x.amount, x.amount, 1
       from jsonb_to_recordset($2::jsonb) as x(invoice_id uuid, catalog_id uuid, description text, amount numeric)`,
    [ctx.clinicId, JSON.stringify(todo.map((m) => ({ invoice_id: idOf.get(m.formKey), catalog_id: m.line.catalogId, description: m.line.desc.slice(0, 120), amount: toDb(m.charged) })))]);
  const pays = todo.filter((m) => m.paid > 0n).map((m) => ({
    invoice_id: idOf.get(m.formKey), patient_id: m.patientId, method: m.method, amount: toDb(m.paid), day: m.day, form_key: keyUuid(`paid|${m.formKey}`),
  }));
  const paidRows = pays.length ? (await tx.query<{ id: string }>(
    `insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_by, paid_on, seq, form_key, imported_at, import_id)
     select $1, x.invoice_id, x.patient_id, x.method, x.amount, null, x.day, 1, x.form_key, now(), $2
       from jsonb_to_recordset($3::jsonb) as x(invoice_id uuid, patient_id uuid, method text, amount numeric, day date, form_key uuid)
     returning id`, [ctx.clinicId, ctx.importId, JSON.stringify(pays)])).rows : [];
  await auditMany(tx, ctx, [
    ...made.map((r) => ({ action: 'invoice.import', entity: 'invoice', id: r.id })),
    ...paidRows.map((r) => ({ action: 'payment.import', entity: 'payment', id: r.id })),
  ]);
  return { statements: made.length, payments: paidRows.length };
}

export const OPENING_LINE = 'Balance brought forward from the clinic’s earlier records';
/** A visit's statement line: the service, and the teeth when there are any. */
export const visitLine = (v: VisitIn) => (v.teeth?.length ? `${v.service} · teeth ${v.teeth.join(', ')}` : v.service).slice(0, 120);

// ---------------------------------------------------------------------------
// Running a planned file
// ---------------------------------------------------------------------------
export interface RunResult {
  newPatients: { id: string; name: string; chartNo: string }[];
  filled: number; matched: number; health: number; openings: number; paper: number;
  newVisits: number; sameVisits: number; statements: number; payments: number;
  out: { row: number; why: string[] }[];
}

/** Write a plan made inside this same transaction (after lockClinic and a fresh snapshot). */
export async function runPlan(tx: Tx, ctx: Ctx, s: Snapshot, p: Plan): Promise<RunResult> {
  const res: RunResult = { newPatients: [], filled: 0, matched: 0, health: 0, openings: 0, paper: 0, newVisits: 0, sameVisits: 0, statements: 0, payments: 0, out: [] };
  res.out = p.rows.filter((r) => r.status === 'out').map((r) => ({ row: r.row, why: r.problems }));
  if (p.kind === 'patients') {
    const fresh = p.rows.filter((r) => r.status === 'new');
    const numbers = nextChartNos([...s.takenCharts, ...fresh.map((r) => r.patient!.chartNo).filter((c): c is string => !!c)],
      fresh.filter((r) => !r.patient!.chartNo).length);
    let k = 0;
    const list = fresh.map((r) => ({ ...r.patient!, chartNo: r.patient!.chartNo ?? numbers[k++] }));
    const ids = await insertPatients(tx, ctx, list);
    res.newPatients = list.map((x, i) => ({ id: ids[i], name: PERSON_LABEL(x.first, x.last, x.suffix), chartNo: x.chartNo }));
    const matched = p.rows.filter((r) => r.status === 'match' || r.status === 'same');
    res.matched = matched.length;
    const fills = matched.filter((r) => r.status === 'match').map((r) => ({ id: r.onFile!.id, p: r.patient! }));
    await fillPatients(tx, ctx, fills);
    res.filled = fills.length;
    const hasHealth = new Set(s.patients.filter((x) => x.has_health).map((x) => x.id));
    const health = [
      ...fresh.map((r, i) => ({ id: ids[i], h: r.patient!.health })),
      ...matched.map((r) => ({ id: r.onFile!.id, h: hasHealth.has(r.onFile!.id) ? null : r.patient!.health })),
    ].filter((x): x is { id: string; h: HealthAnswers } => !!x.h);
    await insertHealth(tx, ctx, health);
    res.health = health.length;
    const both = [...fresh.map((r, i) => ({ id: ids[i], p: r.patient! })), ...matched.map((r) => ({ id: r.onFile!.id, p: r.patient! }))];
    res.paper = await insertPaperForms(tx, ctx, both.filter((x) => x.p.paperForm).map((x) => ({ id: x.id, day: x.p.paperForm! })));
    const money = await insertMoney(tx, ctx, both.filter((x) => x.p.opening).map((x) => ({
      patientId: x.id, formKey: openingKey(ctx.clinicId, x.id), day: x.p.opening!.asOf, appointmentId: null,
      line: { desc: OPENING_LINE, catalogId: null }, charged: x.p.opening!.cents, paid: 0n, method: 'unrecorded',
    })));
    res.openings = money.statements;
  } else {
    const rows = p.rows.filter((r) => r.status === 'new');
    res.sameVisits = p.rows.filter((r) => r.status === 'same' || r.status === 'match').length;
    const made = await insertVisits(tx, ctx, rows.map((r) => ({ patientId: r.onFile!.id, key: r.key!, v: r.visit! })));
    res.newVisits = made.size;
    // Visits already on file whose charge had not come in: their appointment, by key.
    const late = p.rows.filter((r) => r.status === 'match');
    if (late.length) {
      for (const r of (await tx.query<{ id: string; import_key: string }>(`select id, import_key from appointment where import_key = any($1::text[])`, [late.map((r) => r.key!)])).rows) made.set(r.import_key, r.id);
      rows.push(...late);
    }
    const money = await insertMoney(tx, ctx, rows.filter((r) => made.has(r.key!) && r.visit!.charged > 0n).map((r) => ({
      patientId: r.onFile!.id, formKey: keyUuid(`charge|${r.key}`), day: r.visit!.date, appointmentId: made.get(r.key!) ?? null,
      line: { desc: visitLine(r.visit!), catalogId: r.visit!.catalogId }, charged: r.visit!.charged, paid: r.visit!.paid, method: r.visit!.method,
    })));
    res.statements = money.statements; res.payments = money.payments;
  }
  return res;
}

// ---------------------------------------------------------------------------
// The person, from a form: Add patient, and Edit details on the record
// ---------------------------------------------------------------------------
export const SEXES = [
  { id: 'female', label: 'Female' }, { id: 'male', label: 'Male' }, { id: 'other', label: 'Other' }, { id: 'undisclosed', label: 'Prefer not to say' },
] as const;

export interface PersonIn {
  chartNo: string | null; first: string; middle: string | null; last: string; suffix: string | null; sex: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null; province: string | null;
  hmoName: string | null; hmoMemberNo: string | null; emergencyName: string | null; emergencyRelation: string | null; emergencyPhone: string | null;
  notes: string | null;
}

/** The person fields as posted, and every problem with them in plain words. The birth date is the health form's (readHealthForm). */
export function readPersonForm(form: FormData): { person: PersonIn; problems: string[] } {
  const problems: string[] = [];
  const g = (k: string, max = 200) => clean(form.get(k), max);
  const first = oneLine(form.get('first_name')).normalize('NFC');
  const last = oneLine(form.get('last_name')).normalize('NFC');
  if (!last) problems.push('Write the last name.');
  if (!first) problems.push('Write the first name.');
  if (first.length > NAME_PART_MAX || last.length > NAME_PART_MAX) problems.push(`Keep each name under ${NAME_PART_MAX} characters.`);
  const chartNo = g('chart_no', 21);
  if (chartNo && (chartNo.length > 20 || !/^[\p{L}\p{N}][\p{L}\p{N} ._\/-]*$/u.test(chartNo))) problems.push('A chart no. is up to 20 letters and numbers, like P-0107.');
  const sexRaw = String(form.get('sex') ?? '');
  const sex = SEXES.some((x) => x.id === sexRaw) ? sexRaw : null;
  const mobileTyped = oneLine(form.get('mobile'));
  let phone: string | null = null;
  if (mobileTyped) {
    const n = normalizePhone(mobileTyped);
    if (PH_MOBILE.test(n)) phone = n; else problems.push('The mobile is a Philippine mobile, like 0917 555 0142, or leave it blank. Reminders go to it.');
  }
  const emailTyped = oneLine(form.get('email'));
  let email: string | null = null;
  if (emailTyped) {
    const e = normalizeEmail(emailTyped);
    if (EMAIL_ADDRESS.test(e) && e.length <= EMAIL_MAX) email = e; else problems.push('The email does not look like an email address.');
  }
  const ePhoneTyped = g('emergency_phone', 21);
  if (ePhoneTyped && (ePhoneTyped.length > 20 || ePhoneTyped.replace(/\D/g, '').length < 7)) problems.push('The emergency contact’s number needs at least seven digits.');
  // A mobile is kept the one way the import keeps it (09…); a landline as typed.
  const ePhone = ePhoneTyped && PH_MOBILE.test(normalizePhone(ePhoneTyped)) ? normalizePhone(ePhoneTyped) : ePhoneTyped;
  const notes = String(form.get('notes') ?? '').replace(/\r\n/g, '\n').trim().normalize('NFC');
  if (notes.length > NOTES_MAX) problems.push(`Keep the notes under ${NOTES_MAX} characters.`);
  const middle = g('middle_name', NAME_PART_MAX + 1);
  const suffix = tidySuffix(g('suffix', 11));
  const relation = g('emergency_relation', 41);
  if (relation && relation.length > 40) problems.push('Keep the relation under 40 characters.');
  const hmoName = g('hmo_name', 81), hmoNo = g('hmo_member_no', 41);
  if ((hmoName?.length ?? 0) > 80 || (hmoNo?.length ?? 0) > 40) problems.push('The HMO name or member no. is too long.');
  return {
    person: {
      chartNo, first, middle: middle?.slice(0, NAME_PART_MAX) ?? null, last, suffix, sex, phone, email,
      address: g('address'), city: g('city', 80), province: g('province', 80), hmoName: hmoName?.slice(0, 80) ?? null, hmoMemberNo: hmoNo?.slice(0, 40) ?? null,
      emergencyName: g('emergency_name', 120), emergencyRelation: relation?.slice(0, 40) ?? null, emergencyPhone: ePhone?.slice(0, 20) ?? null,
      notes: notes ? notes.slice(0, NOTES_MAX) : null,
    },
    problems,
  };
}

/** Save Edit details. The chart no. may change only to one that is free. Returns false when the patient is not here. */
export async function updateDetails(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; p: PersonIn }): Promise<'saved' | 'none' | { taken: string }> {
  const row = (await tx.query<{ chart_no: string }>(`select chart_no from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!row) return 'none';
  const chart = a.p.chartNo ?? row.chart_no;
  if (chartKey(chart) !== chartKey(row.chart_no)) {
    const other = (await tx.query<{ name: string }>(`select concat_ws(' ', first_name, last_name) as name from patient where upper(replace(chart_no, ' ', '')) = $1 and id <> $2`, [chartKey(chart), a.patientId])).rows[0];
    if (other) return { taken: `Chart no. ${chart} is ${other.name}’s.` };
  }
  await tx.query(
    `update patient set chart_no = $2, first_name = $3, middle_name = $4, last_name = $5, suffix = $6, sex = $7, phone = $8, email = $9, address_line = $10,
            city = $11, province = $12, hmo_name = $13, hmo_member_no = $14, emergency_name = $15, emergency_relation = $16, emergency_phone = $17, notes = $18,
            updated_at = now()
      where id = $1`,
    [a.patientId, chart, a.p.first, a.p.middle, a.p.last, a.p.suffix, a.p.sex, a.p.phone, a.p.email, a.p.address, a.p.city, a.p.province,
     a.p.hmoName, a.p.hmoMemberNo, a.p.emergencyName, a.p.emergencyRelation, a.p.emergencyPhone, a.p.notes]);
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'patient.update', 'patient', $3)`, [a.clinicId, a.staffId, a.patientId]);
  return 'saved';
}

/** The HMO names this branch deals with, for the HMO field's suggestions: its payors, and the HMOs it ticked in Settings. */
export async function hmoSuggestions(tx: Tx, names: Map<string, string>): Promise<string[]> {
  const a = (await tx.query(`select name from hmo_provider where active and kind = 'hmo' order by name`)).rows.map((r) => r.name as string);
  const b = (await tx.query(`select hmo_id from clinic_hmo order by hmo_id`)).rows.map((r) => names.get(r.hmo_id)).filter((n): n is string => !!n);
  return [...new Set([...a, ...b])];
}

// ---------------------------------------------------------------------------
// The templates: a CSV, and a small .xlsx written here (no library needed to
// write one: a zip of six XML parts). The header row carries the field labels,
// which autoMap matches exactly; text columns (chart no., mobile, member no.)
// are formatted as text so a spreadsheet keeps the leading 0 of 0917….
// ---------------------------------------------------------------------------
const TEXT_FIELDS = new Set(['chart_no', 'mobile', 'emergency_phone', 'hmo_member_no', 'teeth']);
const xmlEsc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

interface SheetIn { name: string; rows: string[][]; widths: number[]; textCols?: number[]; boldRows?: number[] }

function sheetXml(s: SheetIn): string {
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${s.textCols?.includes(i) ? ' style="2"' : ''}/>`).join('');
  const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === '' ? '' :
    `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${s.boldRows?.includes(ri) ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

/** A zip of these files: deflated, or stored as they are (`store`, for repackXlsx: quicker, and read at once). */
function zip(files: { name: string; data: Buffer }[], opts: { store?: boolean } = {}): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  // 1 Jan 2026, 00:00 in DOS time: a fixed stamp, so the same template is the same bytes.
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const method = opts.store ? 0 : 8;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const body = opts.store ? f.data : deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12); cd.writeUInt16LE(date, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    central.push(cd, name);
    offset += local.length + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

export function xlsxFile(sheets: SheetIn[]): Buffer {
  const ns = 'http://schemas.openxmlformats.org';
  const x = (s: string) => Buffer.from(s, 'utf8');
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    { name: '[Content_Types].xml', data: x(`${head}<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: x(`${head}<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: x(`${head}<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: x(`${head}<Relationships xmlns="${ns}/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: x(`${head}<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x(sheetXml(s)) })),
  ]);
}

/** A template for a kind of file: the columns this person may use, and a sheet saying what goes in each. */
export function template(kind: Kind, money: boolean, extra: { services: string[]; dentists: string[] }): { csv: string; xlsx: Buffer } {
  const keys = TEMPLATE[kind].filter((k) => money || !fieldByKey(k)!.money);
  const fields = keys.map((k) => fieldByKey(k)!);
  const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = '﻿' + fields.map((f) => csvCell(f.label)).join(',') + '\r\n';
  const notes: string[][] = [['Column', 'What to write', 'Example'], ...fields.map((f) => [f.label, f.hint, f.example])];
  notes.push([], ['Dates', 'Any common way works. The import shows how each date was read before anything is saved, and 03/04/1985 is read as month/day/year unless you switch it.', ''],
    ['Leave out', 'Any column you do not have. Only the name is needed' + (kind === 'visits' ? ', with the visit date and the service.' : '.'), ''],
    ['Again', 'Importing the same file twice adds nothing twice.', '']);
  if (kind === 'visits') {
    if (extra.dentists.length) notes.push([], ['Your dentists', 'Written like this, they are matched to the team:', ''], ...extra.dentists.map((d) => ['', d, '']));
    if (extra.services.length) notes.push([], ['Your fee guide', 'Written like this, a service is matched to the fee guide:', ''], ...extra.services.map((s) => ['', s, '']));
  }
  const xlsx = xlsxFile([
    { name: kind === 'patients' ? 'Patients' : 'Visits', rows: [fields.map((f) => f.label)], widths: fields.map((f) => Math.max(12, Math.min(28, f.label.length + 4))), textCols: keys.map((k, i) => (TEXT_FIELDS.has(k) ? i : -1)).filter((i) => i >= 0), boldRows: [0] },
    { name: 'How to fill it in', rows: notes, widths: [26, 90, 22], boldRows: [0] },
  ]);
  return { csv, xlsx };
}
