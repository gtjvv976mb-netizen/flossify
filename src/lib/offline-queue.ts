// Chart changes kept on the device until the server has them. Browser only.
//
// Brownouts are real: the odontogram writes every change here first and then
// sends it (POST /api/chart). A change that cannot go — offline, a timeout, a
// 5xx, the rate limit — stays in IndexedDB and goes again when the browser
// comes back online, when a chart page loads, and every 30 seconds while
// anything is waiting. The server takes each change once however often it
// arrives (the change id), and keeps a colleague's newer finding over an
// older change made offline, saying which tooth; see src/pages/api/chart.ts.
//
// One record per staff member + clinic + patient + tooth, the latest state
// winning: a change replaces the tooth's whole finding (its condition and all
// of its surfaces at once), so the tooth is the unit — keyed by surface, one
// change would split in two and could arrive half-applied. A clear of the
// whole chart is one record (…|all) that replaces every record for that
// patient. Each record carries a client-made id, the device's id and running
// count (ordering), the device's clock when it was made, and `base`: the
// server's time as of which the chart it was made on showed that tooth (when
// the page was drawn, or later when an answer brought the tooth's state), so
// the server can tell a colleague's finding the person never saw from one
// they chose to replace.
//
// After the server answers, a record stays as `synced` with the server's
// time and what it did (applied it, or kept a colleague's newer finding), so
// a copy of the page the service worker kept (public/sw.js) can still show
// changes saved after that copy was made, and a chart open in another tab
// keeps showing them. A page drawn later already has them and skips them; they
// are deleted after 12 hours or at sign-out, never because a page was drawn.
// Answers the person must hear about — a tooth someone else changed later, a
// change the server refused — are `notice` records, shown on that patient's
// chart until the person presses Got it; then only a stub without teeth or
// names stays, so the chart's status line still knows the last change was
// not saved.
//
// Whose changes, and under which sign-in: every change carries the staff
// member and the tag of the sign-in (`sid`, chartSession() in
// src/pages/api/chart.ts) that the server drew the chart under — both come
// from the session on the server, never from the device. The server saves a
// change only under that same sign-in. So a chart tab left open after its
// person signed out can never file a tap under their name later, however the
// device found out (or failed to): the change waits, and when that person
// signs in again, the chart it belongs to shows it marked, with Save and
// Delete — nothing from an earlier sign-in is saved unless they choose to.
// Only the current sign-in's changes are sent on their own.
//
// A chart also refuses taps once its sign-in has ended on this device
// (SignedOut: enqueue() compares the chart's person and sign-in with meta
// 'who'), and says so at once. 'who' is the person and sign-in the last
// freshly drawn chart, or the server itself (serverWho: GET /api/chart), said
// is signed in here. Every sign-in, sign-out and sign-up replaces it with
// "nobody, since <at>" — the service worker at the POST, guardSignOut() here
// before it posts (marked `leaving` while the sign-out is on its way, so
// charts say "Signing out…" rather than that the sign-in has ended), a 401
// from the chart API, and any workspace page drawn for someone else
// (keepSending) — and a chart asks the server again when it is looked at,
// when a tooth is opened, on reconnect and every 30 seconds. "Nobody since"
// is kept rather than deleted so a slow answer from before the sign-out
// cannot bring the old sign-in back (follow()).
//
// A change is kept on the device at the tap, before anything is asked, so a
// tab dropped a moment later (a brownout with the Wi-Fi still up, where every
// request hangs) still has it. It is kept `unconfirmed` until the answer to
// the question asked when its tooth was opened is in (at most 4 seconds):
// then it is confirmed (confirmKept()), or — when the server named someone else
// or nobody — deleted, and the chart says the tap was not saved. So a
// sign-in on top of this one in another tab is caught at the tap even with
// no service worker and no sign-out to tell the device. An unconfirmed change
// is never sent. One left unconfirmed because its page closed first is
// confirmed by the server's later word that the same sign-in is still live
// (follow(), or a page it has just drawn under that sign-in: setCurrentUser),
// which proves that sign-in was live when the tap was made — one sign-in's
// cookie cannot come back once another has replaced it. From a sign-in that
// has ended, it waits for that person's next sign-in, marked on its chart as
// a change that may not be theirs, with Save and Delete.
//
// Privacy on a shared front-desk tablet: records hold the patient's id, tooth
// numbers and findings, and colleagues' names in notices — never a patient's
// name. They are scoped to the staff member who made them: another person
// signed in on the same device never sees them, and the server refuses to
// take them under anyone else's session (code 'owner'). Sign-out goes
// through guardSignOut() below — the odontogram attaches it on the patient
// record, and keepSending() (one line in the Clinic layout) on every
// workspace page, where it also keeps sending what waits, not only from a
// chart. It sends what waits under the live sign-in first, then asks the
// server to sign out, and clears the device only once the server has: every
// record of the person signed out (waiting changes, sent ones, answers),
// after asking before deleting anything unsent or unread. When the server
// cannot be reached nothing is deleted, and the person is told they are
// still signed in — within about 10 seconds on a line that hangs. Records
// already sent, and answers, are also dropped after their keeping time
// whoever they belong to (tidy). The page copy the service worker kept goes
// at every sign-in and sign-out (public/sw.js, and here for a sign-out sent
// from the page), and whenever the server tells a page that nobody is signed
// in here (follow(): signed out elsewhere, sign-in run out, password changed,
// account switched off). Without IndexedDB (some private windows)
// records live in memory: they last while the page is open, and the chart
// says so.
//
// The database layout is shared with public/sw.js: name 'flossify-offline',
// version 1, stores 'changes' (keyPath 'key') and 'meta' (keyPath 'k'), and
// meta 'who' = { staff, sid, at, leaving? } (at: this device's clock when it
// was said; staff and sid null for "nobody since at"; leaving: a sign-out
// from a page is on its way). Changes to 'who' are also posted on the
// 'flossify-offline' BroadcastChannel as { who: staff | null, sid, at, leaving? },
// so open charts lock at once and pages without IndexedDB keep their
// in-memory copy in step. Change one, change both. (Pages also post
// { drawnFor: staff, at } — a workspace page drawn for that person — which
// only pages read.)

export type ToothBody = { fdi: number; condition: string | null; surfaces: string[] };
export type ClearBody = { clear: true; keep?: ToothBody[] };
export type Body = ToothBody | ClearBody;
export type Hold = 'auth' | 'csrf' | 'owner' | 'session';

/** Whose chart: the staff member, the sign-in it was drawn under (sid), the clinic and the patient. */
export interface Scope { staff: string; sid: string; clinic: string; patient: string }
/** Who is signed in on this device, as the server or the last freshly drawn chart said. */
export interface SignedIn { staff: string; sid: string }

export interface NoticeItem { fdi: number; by: string | null; you: boolean; at: string | null }
export interface Notice {
  /** kept: someone changed the tooth after this change was made. dropped: the server refused it for good. */
  kind: 'kept' | 'dropped';
  clear: boolean;
  /** When the change was made (ms), on the server's clock when the server said so. */
  madeAt: number;
  items: NoticeItem[];
  /** The tooth, when a single-tooth change was dropped. */
  fdi?: number;
  error?: string;
}

export interface Entry extends Scope {
  key: string;
  kind: 'change' | 'notice';
  id: string;
  url: string;
  state?: 'pending' | 'synced';
  body?: Body;
  /** The device's clock when the change was made. */
  madeAt: number;
  device: string;
  seq: number;
  /** Server time (ms) as of which the chart this change was made on showed the tooth (see the top of this file). */
  base?: number;
  /** For a clear: teeth the device had heard about later than `base`, fdi → server ms. */
  known?: Record<number, number>;
  /** Failed sends so far. */
  tries?: number;
  /** Held until the person acts: signed out ('auth'), the page's token is stale
   *  ('csrf'), someone else is signed in on this device now ('owner'), or it was
   *  made under an earlier sign-in ('session'; any change whose sid is not the
   *  current sign-in's is treated so, held or not). */
  hold?: Hold | null;
  /** Kept at the tap, before the server's word on who is signed in was in: never sent until confirmed (see the top of this file). */
  unconfirmed?: boolean;
  /** Server time (ms) the answer came back, for synced records and notices. */
  at?: number;
  /** Server time (ms) the synced state of this tooth (or chart) is current as of. */
  seen?: number;
  /** Synced records: what the server did — applied the change, or kept a colleague's newer finding. */
  outcome?: 'applied' | 'kept';
  /** This device's clock when the answer came back (synced records and notices): which answer was the last. */
  answered?: number;
  /** A notice the person has read (Got it). What is left of it names no tooth and no colleague. */
  read?: boolean;
  notice?: Notice;
}

/** The chart this change was made on belongs to a sign-in that has ended on this device. */
export class SignedOut extends Error {
  constructor() {
    super('This page belongs to a sign-in that has ended.');
    this.name = 'SignedOut';
  }
}

const DB_NAME = 'flossify-offline';
const DB_VERSION = 1;
const CHANGES = 'changes';
const META = 'meta';
const TIMEOUT_MS = 10_000;
const WHO_TIMEOUT_MS = 4_000;
// Signing out on a bad line. At most 6 s to ask who is signed in (a line that takes 4 or 5 seconds a request is
// slow, not gone: what waits is still sent first), 5 s to send what waits, and 5 s for the sign-out itself — 4 s
// when the question got no answer at all, so a line that hangs is told "still signed in" within about 10
// seconds, never 20.
const SIGN_OUT_WHO_MS = 6_000;
const SIGN_OUT_SEND_MS = 5_000;
const SIGN_OUT_POST_MS = 5_000;
const SIGN_OUT_POST_HUNG_MS = 4_000;
/** How long a sign-out from a page may take (the three limits above, and some): past it, "signing out" is "signed out". */
export const LEAVING_MS = 15_000;
export const RETRY_MS = 30_000;
const SYNCED_KEEP_MS = 12 * 3_600_000;
const NOTICE_KEEP_MS = 7 * 24 * 3_600_000;
const LOCK = 'flossify-chart-sync';

const prefix = (...parts: string[]) => parts.join('|') + '|';
const range = (p: string) => IDBKeyRange.bound(p, p + '\uffff');
const toothKey = (s: Scope, body: Body) => prefix(s.staff, s.clinic, s.patient) + ('clear' in body ? 'all' : `t${body.fdi}`);

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- storage ----------------------------------------------------------------
// IndexedDB when it opens; otherwise two Maps with the same shape, so every
// function below works either way.

let opening: Promise<IDBDatabase | null> | null = null;
const memChanges = new Map<string, Entry>();
const memMeta = new Map<string, any>();

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CHANGES)) db.createObjectStore(CHANGES, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'k' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** False when records only last while this page is open. */
export async function persistent(): Promise<boolean> {
  return (await open()) !== null;
}

const done = (req: IDBRequest) => new Promise<any>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const finished = (t: IDBTransaction) => new Promise<void>((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
});

/** Every record whose key starts with p. */
async function listPrefix(p: string): Promise<Entry[]> {
  const db = await open();
  if (!db) return [...memChanges.values()].filter((e) => e.key.startsWith(p));
  return done(db.transaction(CHANGES).objectStore(CHANGES).getAll(range(p)));
}

interface Store {
  get(k: string): Promise<Entry | undefined>;
  put(e: Entry): void;
  del(k: string): void;
  list(p: string): Promise<Entry[]>;
  meta(k: string): Promise<any>;
  setMeta(v: { k: string; [x: string]: unknown }): void;
  delMeta(k: string): void;
}

/** Read-modify-write on both stores in one transaction. `fn` gets a tiny store API; a throw writes nothing. */
async function write(fn: (s: Store) => Promise<void>) {
  const db = await open();
  if (!db) {
    await fn({
      get: async (k) => memChanges.get(k),
      put: (e) => { memChanges.set(e.key, e); },
      del: (k) => { memChanges.delete(k); },
      list: async (p) => [...memChanges.values()].filter((e) => e.key.startsWith(p)),
      meta: async (k) => memMeta.get(k),
      setMeta: (v) => { memMeta.set(v.k, v); },
      delMeta: (k) => { memMeta.delete(k); },
    });
    return;
  }
  const t = db.transaction([CHANGES, META], 'readwrite');
  const store = t.objectStore(CHANGES);
  const meta = t.objectStore(META);
  const end = finished(t);
  try {
    await fn({
      get: (k) => done(store.get(k)),
      put: (e) => { store.put(e); },
      del: (k) => { store.delete(k); },
      list: (p) => done(store.getAll(range(p))),
      meta: (k) => done(meta.get(k)),
      setMeta: (v) => { meta.put(v); },
      delMeta: (k) => { meta.delete(k); },
    });
  } catch (err) {
    try { t.abort(); } catch { /* already finished */ }
    await end.catch(() => {});
    throw err;
  }
  await end;
}

async function metaGet(k: string): Promise<any> {
  const db = await open();
  if (!db) return memMeta.get(k);
  return done(db.transaction(META).objectStore(META).get(k));
}

/** The device's id and the next number in its count, inside a write (atomic across tabs). */
async function bump(s: Store, fresh = false): Promise<{ device: string; seq: number }> {
  const cur = await s.meta('device');
  const next = { k: 'device', id: fresh || !cur?.id ? uuid() : cur.id, seq: (cur?.seq ?? 0) + 1 };
  s.setMeta(next);
  return { device: next.id, seq: next.seq };
}

/** A fresh device id and count, for a change whose number was taken. */
async function stamp(fresh = false): Promise<{ device: string; seq: number }> {
  let out!: { device: string; seq: number };
  await write(async (s) => { out = await bump(s, fresh); });
  return out;
}

// --- telling pages ----------------------------------------------------------
// Every tab showing a chart repaints when the records change, in this tab or
// another one, and re-checks whose sign-in this device is on.

type Listener = () => void;
const listeners = new Set<Listener>();
const channel: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('flossify-offline');
if (channel) {
  channel.onmessage = (ev) => {
    const m = ev.data;
    if (m && typeof m === 'object' && 'who' in m) heardWho(m.who ? { staff: String(m.who), sid: String(m.sid ?? '') } : null, Number(m.at) || 0, !m.who && !!m.leaving);
    else if (m && typeof m === 'object' && 'drawnFor' in m) heardDrawnFor(String(m.drawnFor), Number(m.at) || 0);
    else listeners.forEach((fn) => fn());
  };
}

/** Another tab was just drawn by the server for `staff`: nobody else is signed in here. Pages without IndexedDB
 *  keep their own copy of 'who' in step (with IndexedDB the drawing tab has written it already). */
async function heardDrawnFor(staff: string, at: number) {
  if (!(await open().catch(() => null))) {
    const cur = memMeta.get('who');
    if (cur?.staff && cur.staff !== staff && !(Number(cur.at) > at)) memMeta.set('who', nobody(at));
  }
  listeners.forEach((fn) => fn());
}

/** Another tab or the service worker said who is signed in here now (null: nobody). */
async function heardWho(who: SignedIn | null, at: number, leaving = false) {
  // Without IndexedDB each page has its own copy of 'who': keep it in step, the later word winning.
  if (!(await open().catch(() => null))) {
    const cur = memMeta.get('who');
    if (!cur || !(Number(cur.at) > at)) memMeta.set('who', who ? { k: 'who', staff: who.staff, sid: who.sid, at } : nobody(at, leaving));
  }
  listeners.forEach((fn) => fn());
}

/** "Nobody is signed in here since `at`": kept, not deleted, so an older word cannot overwrite it. `leaving`: a
 *  sign-out sent from a page is on its way (guardSignOut), so charts say "Signing out…" until it is done. */
const nobody = (at: number, leaving = false) => (leaving ? { k: 'who', staff: null, sid: null, at, leaving: true } : { k: 'who', staff: null, sid: null, at });

function changed() {
  listeners.forEach((fn) => fn());
  channel?.postMessage('changed');
}

function toldWho(who: SignedIn | null, at: number, leaving = false) {
  listeners.forEach((fn) => fn());
  channel?.postMessage({ who: who?.staff ?? null, sid: who?.sid ?? null, at, ...(leaving && !who ? { leaving: true } : {}) });
}

/** Inside a write: the server (or a page it has just drawn) says `who` is signed in here, as of `before` on this
 *  device's clock. Their changes kept unconfirmed under that same sign-in, made by then, were made while it was live
 *  (a sign-in's cookie cannot come back once another has replaced it): confirmed, and they go. True if any were. */
async function confirmUnder(s: Store, who: SignedIn, before: number): Promise<boolean> {
  let any = false;
  for (const e of await s.list(prefix(who.staff))) {
    if (e.kind !== 'change' || e.state !== 'pending' || !e.unconfirmed || e.sid !== who.sid || !(e.madeAt <= before)) continue;
    s.put({ ...e, unconfirmed: false });
    any = true;
  }
  return any;
}

/** Call fn whenever the records change, here or in another tab. Returns the way to stop. */
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- the queue --------------------------------------------------------------

/** True for a page the server has just drawn: not the service worker's kept copy, not one shown again from history. */
function drawnJustNow(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.hasAttribute('data-offline-copy')) return false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') return false;
  } catch {
    /* no navigation timing: take the page as drawn now */
  }
  return true;
}

/** When this page was asked of the server, on this device's clock: the start of the request that
 *  brought it (after any redirect that led here, such as a sign-in's). The server drew it for whoever
 *  was signed in at some moment after that. */
function requestedAt(): number {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && performance.timeOrigin > 0) return performance.timeOrigin + Math.max(nav.fetchStart, nav.redirectEnd);
  } catch {
    /* no navigation timing */
  }
  return Date.now();
}

/** This page was just drawn for `who` (the server's session, rendered into the page), so they are the
 *  one signed in on this device now, under that sign-in: their changes are the ones kept and sent
 *  here, and sign-out clears theirs. A page shown from the service worker's copy or from history
 *  proves nothing and claims nothing — except without IndexedDB, where 'who' lives in this page
 *  alone and nothing else could say it: there the page's changes die with it, and a later sign-in
 *  or sign-out still reaches it (the channel). The claim is dated when the page was asked for, not
 *  when its script runs, and a later word stands: a page asked for before a sign-out (or a sign-in
 *  on top) but whose script runs after it was drawn for the sign-in that ended, and must not unlock
 *  that person's open charts. `confirmed`: the server has just said so (serverWho), which holds
 *  whatever the page is. */
export async function setCurrentUser(who: SignedIn, confirmed = false) {
  // Only a page the server has just drawn (or the server's own word) is proof the sign-in is live.
  const proof = confirmed || drawnJustNow();
  if (!proof && (await persistent())) return;
  const at = confirmed ? Date.now() : Math.min(Date.now(), requestedAt());
  let moved = false;
  let settled = false;
  await write(async (s) => {
    const cur = await s.meta('who');
    if (!confirmed && cur && Number(cur.at) > at) return;
    moved = cur?.staff !== who.staff || cur?.sid !== who.sid;
    s.setMeta({ k: 'who', staff: who.staff, sid: who.sid, at });
    if (proof) settled = await confirmUnder(s, who, at);
  });
  if (moved) toldWho(who, at);
  else if (settled) changed();
}

/** Who is signed in on this device, as far as it knows; null when nobody has been since the last sign-in or sign-out. */
export async function currentUser(): Promise<SignedIn | null> {
  return (await signInState()).who;
}

/** currentUser(), and, when nobody is, since when a sign-out sent from a page has been on its way (null when none is). */
export async function signInState(): Promise<{ who: SignedIn | null; leavingSince: number | null }> {
  const w = await metaGet('who');
  if (w?.staff) return { who: { staff: String(w.staff), sid: String(w.sid ?? '') }, leavingSince: null };
  return { who: null, leavingSince: w?.leaving ? Number(w.at) || null : null };
}

/** The server's word on who is signed in on this browser now: them, null when nobody is (signed out,
 *  sign-in run out, password changed elsewhere), undefined when it could not be asked (offline, slow
 *  line, an answer that is not ours). Never throws. When the server names someone other than the
 *  device thought, or nobody, the device's 'who' follows it and open charts hear so at once. */
export async function serverWho(timeoutMs = WHO_TIMEOUT_MS): Promise<SignedIn | null | undefined> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const asked = Date.now();
  try {
    const res = await fetch('/api/chart', { credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal });
    const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => null) : null;
    let who: SignedIn | null | undefined;
    if (res.ok && data?.ok && typeof data.staff === 'string' && typeof data.sid === 'string') who = { staff: data.staff, sid: data.sid };
    else if (res.status === 401 && data?.code === 'auth') who = null;
    else return undefined;
    await follow(who, asked);
    return who;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The server said who is signed in, as of `asked` (this device's clock when it was asked). Nobody: the service
 *  worker's copy of a patient record goes too — the sign-in it was drawn under is over (signed out elsewhere, run
 *  out, password changed, account switched off), and the copy must not stay on the device for an outage. */
async function follow(who: SignedIn | null, asked: number) {
  let moved = false;
  let settled = false;
  let over = false;
  await write(async (s) => {
    const cur = await s.meta('who');
    // A later word (a page drawn, a sign-in or sign-out) since the question went out stands.
    if (cur && Number(cur.at) > asked) return;
    if (who) {
      moved = cur?.staff !== who.staff || cur?.sid !== who.sid;
      if (moved) s.setMeta({ k: 'who', staff: who.staff, sid: who.sid, at: asked });
      settled = await confirmUnder(s, who, asked);
    } else {
      over = true;
      if (cur?.staff || !cur) {
        moved = !!cur?.staff;
        s.setMeta(nobody(asked));
      }
    }
  }).catch(() => {});
  if (moved) toldWho(who, asked);
  else if (settled) changed();
  if (over) await dropRecordCopies().catch(() => {});
}

/** Whoever is signed in on this device is signing out now: every open chart locks at once, service worker or not.
 *  `leaving`: the sign-out is on its way from this page, and may yet fail — charts say "Signing out…" meanwhile.
 *  Returns who the device had signed in until now, for undoSignedOut. */
export async function signedOutHere(at = Date.now(), leaving = false): Promise<SignedIn | null> {
  let moved = false;
  let was: SignedIn | null = null;
  await write(async (s) => {
    const cur = await s.meta('who');
    if (cur && Number(cur.at) > at) return;
    moved = !!cur?.staff || !!cur?.leaving !== leaving;
    if (cur?.staff) was = { staff: String(cur.staff), sid: String(cur.sid ?? '') };
    s.setMeta(nobody(at, leaving));
  });
  if (moved) toldWho(null, at, leaving);
  return was;
}

/** The sign-out that signedOutHere(at, true) announced did not happen (the server could not be reached): `was` is
 *  signed in here still, and their open charts unlock — unless anything has said who since. */
async function undoSignedOut(was: SignedIn | null, at: number) {
  let moved = false;
  let back: SignedIn | null = null;
  await write(async (s) => {
    const cur = await s.meta('who');
    if (!cur || cur.staff || Number(cur.at) !== at) return;
    // Nobody was known to be signed in before: then nobody is, with no sign-out on its way.
    s.setMeta(was ? { k: 'who', staff: was.staff, sid: was.sid, at } : nobody(at));
    back = was;
    moved = true;
  });
  if (moved) toldWho(back, at);
}

/** The sign-out that signedOutHere(at, true) announced went through: nobody is signed in here, and it is no longer on its way. */
async function signedOutDone(at: number) {
  let moved = false;
  await write(async (s) => {
    const cur = await s.meta('who');
    if (!cur || cur.staff || !cur.leaving || Number(cur.at) !== at) return;
    s.setMeta(nobody(at));
    moved = true;
  });
  if (moved) toldWho(null, at);
}

/** A workspace page the server has just drawn for `staff` (data-staff on its sign-out form): whoever else this device
 *  took to be signed in is not, so their open charts lock now. This is how a sign-in on top of another person's, in
 *  another tab, with no sign-out and no service worker to say so, reaches their charts before anyone taps them. It
 *  only ever locks: a chart page says who is signed in itself, with the sign-in's tag. */
async function pageDrawnFor(staff: string) {
  if (!drawnJustNow()) return;
  const at = Date.now();
  await write(async (s) => {
    const cur = await s.meta('who');
    if (cur?.staff && cur.staff !== staff && !(Number(cur.at) > at)) s.setMeta(nobody(at));
  });
  listeners.forEach((fn) => fn());
  channel?.postMessage({ drawnFor: staff, at });
}

/** True when this change was made under the sign-in `sid` (a record from before sign-ins were tagged never is). */
export const sameSignIn = (e: Entry, sid: string) => !!e.sid && e.sid === sid;

/** How far a record says the device knew its tooth's state (server ms): an answer's, or what the change was made on. */
const knew = (e: Entry | undefined) => (!e || e.kind !== 'change' ? 0 : e.state === 'synced' ? (e.seen ?? 0) : (e.base ?? 0));

/** Keep a change on the device. The latest change to a tooth replaces the one before it.
 *  `base` is when the server drew the chart it was made on (server ms; data-rendered-at).
 *  `unconfirmed`: kept before the server's word on who is signed in is in — not sent until
 *  confirmKept() (or the server's later word, confirmUnder) settles it. Throws SignedOut when that
 *  chart's person and sign-in are not the ones signed in on this device any more. */
export async function enqueue(scope: Scope, url: string, body: Body, base: number | null = null, unconfirmed = false): Promise<Entry> {
  let entry!: Entry;
  await write(async (s) => {
    const who = await s.meta('who');
    if (!scope.sid || who?.staff !== scope.staff || who?.sid !== scope.sid) throw new SignedOut();
    const { device, seq } = await bump(s);
    const key = toothKey(scope, body);
    const here = prefix(scope.staff, scope.clinic, scope.patient);
    // What the chart showed, and as of when: the page, or a later answer about this chart or tooth.
    let b = base === null ? undefined : Math.max(base, knew(await s.get(here + 'all')));
    let known: Record<number, number> | undefined;
    if ('clear' in body) {
      // A clear replaces everything this person had waiting or kept for this patient's chart,
      // after noting the teeth whose state the device heard about later than the chart as a whole.
      for (const e of await s.list(here)) {
        if (e.kind !== 'change') continue;
        if (b !== undefined && e.body && !('clear' in e.body) && knew(e) > b) (known ??= {})[e.body.fdi] = knew(e);
        s.del(e.key);
      }
    } else if (b !== undefined) {
      b = Math.max(b, knew(await s.get(key)));
    }
    entry = { ...scope, key, kind: 'change', id: uuid(), url, state: 'pending', body, madeAt: Date.now(), device, seq, base: b, known, tries: 0, hold: null, ...(unconfirmed ? { unconfirmed: true } : {}) };
    s.put(entry);
  });
  changed();
  return entry;
}

/** The answer to the question asked when this change's tooth was opened is in (or could not come in time): the
 *  change, kept unconfirmed at the tap, is confirmed if the device still takes its chart's person and sign-in to be
 *  the ones signed in here — the server's answer has already been written there (follow). Otherwise it is deleted
 *  and SignedOut is thrown: the tap was made on a page whose sign-in had ended. Nothing happens to a change that is
 *  already confirmed, or replaced by a later change to the same tooth, or gone (a sign-out). */
export async function confirmKept(scope: Scope, e: Entry): Promise<void> {
  let refused = false;
  let touched = false;
  await write(async (s) => {
    const cur = await s.get(e.key);
    if (!cur || cur.id !== e.id || cur.kind !== 'change' || cur.state !== 'pending' || !cur.unconfirmed) return;
    const who = await s.meta('who');
    touched = true;
    if (scope.sid && cur.sid === scope.sid && who?.staff === scope.staff && who?.sid === scope.sid) s.put({ ...cur, unconfirmed: false });
    else { s.del(e.key); refused = true; }
  });
  if (touched) changed();
  if (refused) throw new SignedOut();
}

/** Every record for this patient's chart (changes and notices), oldest change first. */
export async function recordsFor(scope: Scope): Promise<Entry[]> {
  return (await listPrefix(prefix(scope.staff, scope.clinic, scope.patient))).sort((a, b) => a.seq - b.seq);
}

/** Changes this person has waiting, on any chart, oldest first. */
export async function waiting(staff: string): Promise<Entry[]> {
  return (await listPrefix(prefix(staff))).filter((e) => e.kind === 'change' && e.state === 'pending').sort((a, b) => a.seq - b.seq);
}

/** What this person must look at on other patients' charts: answers (notices), and changes made
 *  under an earlier sign-in, which wait there for Save or Delete. */
export async function noticesElsewhere(scope: Scope): Promise<Entry[]> {
  const here = prefix(scope.staff, scope.clinic, scope.patient);
  return (await listPrefix(prefix(scope.staff))).filter((e) => !e.key.startsWith(here)
    && ((e.kind === 'notice' && !e.read) || (e.kind === 'change' && e.state === 'pending' && !sameSignIn(e, scope.sid))));
}

/** The person chose to save changes made under an earlier sign-in (they are on the chart in front of
 *  them, marked): they go now, under this sign-in. Only this chart's, and only while it is still theirs. */
export async function adopt(scope: Scope, keys: string[]) {
  await write(async (s) => {
    const who = await s.meta('who');
    if (who?.staff !== scope.staff || who?.sid !== scope.sid) throw new SignedOut();
    const here = prefix(scope.staff, scope.clinic, scope.patient);
    for (const k of keys) {
      const e = await s.get(k);
      if (!e || !k.startsWith(here) || e.kind !== 'change' || e.state !== 'pending') continue;
      s.put({ ...e, sid: scope.sid, hold: null, tries: 0, unconfirmed: false });
    }
  });
  changed();
}

/** The person chose to delete changes made under an earlier sign-in, on the chart in front of them. Only
 *  those: a change made since on the same tooth (it replaced the record under the same key) stays. */
export async function forget(scope: Scope, keys: string[]) {
  await write(async (s) => {
    const here = prefix(scope.staff, scope.clinic, scope.patient);
    for (const k of keys) {
      const e = await s.get(k);
      if (e && k.startsWith(here) && e.kind === 'change' && e.state === 'pending' && !sameSignIn(e, scope.sid)) s.del(k);
    }
  });
  changed();
}

/** Anything past its keeping time goes, whoever it belongs to — someone who never signed out here does not leave
 *  their sent changes and answers on the device (their unsent changes stay for them): sent changes and read answers
 *  after 12 hours, unread answers after 7 days. A sent change is never deleted because a page was drawn that shows
 *  it: a chart open in another tab may have been drawn before it, and shows it only from here. */
export async function tidy() {
  const now = Date.now();
  let dropped = false;
  await write(async (s) => {
    for (const e of await s.list('')) {
      const age = now - (e.kind === 'notice' ? (e.answered ?? e.at ?? 0) : (e.at ?? 0));
      const stale = e.kind === 'change' && e.state === 'synced' && age > SYNCED_KEEP_MS;
      const old = e.kind === 'notice' && age > (e.read ? SYNCED_KEEP_MS : NOTICE_KEEP_MS);
      if (stale || old) { s.del(e.key); dropped = true; }
    }
  });
  if (dropped) changed();
}

/** The person has read these notices (Got it). A stub stays, naming no tooth and no colleague, so the chart's status
 *  line still knows the last answer was not a save; it goes with the sent changes (12 hours, or sign-out). */
export async function dismiss(keys: string[]) {
  await write(async (s) => {
    for (const k of keys) {
      const e = await s.get(k);
      if (!e || e.kind !== 'notice') continue;
      const n = e.notice;
      s.put({ ...e, read: true, notice: n ? { kind: n.kind, clear: n.clear, madeAt: n.madeAt, items: [] } : undefined });
    }
  });
  changed();
}

/** Delete everything this person has on the device — waiting changes, sent ones, answers — and note when, so the
 *  answer to a change already on its way is not written back for them afterwards (settle). `keepUnsent`: their
 *  waiting changes and unread answers stay, for their next sign-in here (they were signed out without being asked).
 *  If they were the one signed in here, nobody is now. */
export async function clearStaff(staff: string, keepUnsent = false) {
  let was = false;
  const at = Date.now();
  await write(async (s) => {
    for (const e of await s.list(prefix(staff))) {
      const unsent = (e.kind === 'change' && e.state === 'pending') || (e.kind === 'notice' && !e.read);
      if (!(keepUnsent && unsent)) s.del(e.key);
    }
    if (!keepUnsent) s.setMeta({ k: 'cleared|' + staff, at });
    if ((await s.meta('who'))?.staff === staff) { s.setMeta(nobody(at)); was = true; }
  });
  if (was) toldWho(null, at);
  else changed();
}

// --- sending ----------------------------------------------------------------

type Result =
  | { kind: 'done'; data: any }
  | { kind: 'retry' }
  | { kind: 'hold'; hold: Hold }
  | { kind: 'renumber' }
  | { kind: 'drop'; error: string };

async function send(e: Entry, csrf: string): Promise<Result> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(e.url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'X-CSRF': csrf },
      body: JSON.stringify({
        clinic: e.clinic, patientId: e.patient, ...(e.body as object),
        change: { id: e.id, staff: e.staff, sid: e.sid, device: e.device, seq: e.seq, madeAt: e.madeAt, sentAt: Date.now(), base: e.base, known: e.known },
      }),
    });
    const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => null) : null;
    if (res.ok && data?.ok) return { kind: 'done', data };
    // A 5xx, the rate limit, or anything that is not our API answering (a
    // captive portal's page, a proxy's error) is the line, not the change.
    if (!data || res.status >= 500 || data.code === 'rate') return { kind: 'retry' };
    if (data.code === 'auth') return { kind: 'hold', hold: 'auth' };
    if (data.code === 'csrf') return { kind: 'hold', hold: 'csrf' };
    if (data.code === 'owner') return { kind: 'hold', hold: 'owner' };
    if (data.code === 'session') return { kind: 'hold', hold: 'session' };
    if (data.code === 'resequence') return { kind: 'renumber' };
    return { kind: 'drop', error: String(data.error ?? 'The server would not take it.') };
  } catch {
    return { kind: 'retry' };
  } finally {
    clearTimeout(timer);
  }
}

/** Replace the record `e` with `next` (or delete it with null), but only if it
 *  is still that change: a newer change to the same tooth made while this one
 *  was in flight wins. Adds the notice, if any, either way (a clear of the
 *  chart made meanwhile still hears that this change was not applied) —
 *  except when everything of this person was cleared from the device (their
 *  sign-out) after `startedAt`, when this send began: then nothing of theirs
 *  is written back. */
async function settle(e: Entry, next: Partial<Entry> | null, notice?: Notice, startedAt?: number) {
  await write(async (s) => {
    if (startedAt !== undefined && Number((await s.meta('cleared|' + e.staff))?.at) >= startedAt) return;
    const cur = await s.get(e.key);
    if (cur && cur.id === e.id) {
      if (next) s.put({ ...cur, ...next });
      else s.del(e.key);
    }
    if (notice && (!cur || cur.id === e.id)) {
      const now = Date.now();
      s.put({ key: prefix(e.staff, e.clinic, e.patient) + 'n|' + e.id, kind: 'notice', id: e.id, url: e.url, staff: e.staff, sid: e.sid, clinic: e.clinic, patient: e.patient, madeAt: e.madeAt, device: e.device, seq: e.seq, at: now, answered: now, notice });
    }
  });
}

/** What the server said, turned into the synced record and the notice to show. */
async function record(e: Entry, data: any, startedAt: number) {
  const at = Date.parse(data.at) || Date.now();
  const answered = Date.now();
  // As of when the chart now shows the server's state for this tooth (or chart): the next change's base.
  const seen = Date.parse(data.seen) || e.base;
  const madeAt = Date.parse(data.madeAt) || e.madeAt;
  const item = (n: any, fdi: number): NoticeItem => ({ fdi, by: n?.by ?? null, you: !!n?.you, at: n?.at ?? null });
  if (e.body && 'clear' in e.body) {
    const kept: any[] = Array.isArray(data.kept) ? data.kept : [];
    const keep = kept.map((t) => ({ fdi: Number(t.fdi), condition: t.condition ?? null, surfaces: t.surfaces ?? [] }));
    const notice: Notice | undefined = kept.length
      ? { kind: 'kept', clear: true, madeAt, items: kept.map((t) => item(t.newer, Number(t.fdi))) }
      : undefined;
    await settle(e, { state: 'synced', at, seen, answered, outcome: data.outcome === 'kept' ? 'kept' : 'applied', tries: 0, hold: null, body: { clear: true, keep } }, notice, startedAt);
    return;
  }
  const body = e.body as ToothBody;
  if (data.outcome === 'kept') {
    const t = data.tooth ?? { fdi: body.fdi, condition: null, surfaces: [] };
    const notice: Notice = { kind: 'kept', clear: false, madeAt, items: [item(data.newer, body.fdi)] };
    await settle(e, { state: 'synced', at, seen, answered, outcome: 'kept', tries: 0, hold: null, body: { fdi: body.fdi, condition: t.condition ?? null, surfaces: t.surfaces ?? [] } }, notice, startedAt);
    return;
  }
  await settle(e, { state: 'synced', at, seen, answered, outcome: 'applied', tries: 0, hold: null }, undefined, startedAt);
}

let again = false;
let running: Promise<void> | null = null;
// The latest ask wins: a flush asked for while one runs goes again with these.
let asked: { staff: string; sid: string; csrf: string } | null = null;

async function drain(staff: string, sid: string, csrf: string) {
  const tried = new Set<string>();
  let renumbered = 0;
  for (;;) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    // Before the list is read: a sign-out that clears this person after this moment also stops this send's answer
    // from being written back (settle).
    const startedAt = Date.now();
    // Only this sign-in's changes go on their own. One made under an earlier sign-in waits on its
    // chart for the person to look at it (adopt); it never holds up the ones behind it.
    const e = (await waiting(staff)).find((x) => !tried.has(x.id) && sameSignIn(x, sid));
    // A change still waiting for the word on who is signed in is not sent, and the ones behind it wait with it
    // (in order: a clear must not arrive after a change made on top of it). Its page, or the server's next word,
    // settles it within seconds, and sends it.
    if (!e || e.unconfirmed) return;
    tried.add(e.id);
    const sentAt = Date.now();
    const r = await send(e, csrf);
    if (r.kind === 'done') await record(e, r.data, startedAt);
    else if (r.kind === 'drop') {
      const body = e.body!;
      await settle(e, null, { kind: 'dropped', clear: 'clear' in body, madeAt: e.madeAt, items: [], fdi: 'clear' in body ? undefined : body.fdi, error: r.error }, startedAt);
    } else if (r.kind === 'renumber' && renumbered++ < 3) {
      // The id or the count is taken (never by this change: the server looked). New ones, and go again.
      const fresh = await stamp(true);
      await settle(e, { id: uuid(), device: fresh.device, seq: fresh.seq }, undefined, startedAt);
    } else {
      // Keep the order: a later change must not overtake one that could not go.
      await settle(e, { tries: (e.tries ?? 0) + 1, hold: r.kind === 'hold' ? r.hold : null }, undefined, startedAt);
      // The server says this sign-in has ended ('auth'), or is not the one signed in here now: the device
      // takes its word, so every chart drawn under that sign-in locks now instead of taking more taps.
      if (r.kind === 'hold' && r.hold === 'auth') await follow(null, sentAt);
      else if (r.kind === 'hold' && (r.hold === 'owner' || r.hold === 'session')) await serverWho();
      changed();
      return;
    }
    changed();
  }
}

/** Send what this person has waiting under the sign-in `sid`, oldest first,
 *  stopping at the first change the line will not take. One tab sends at a
 *  time (Web Locks: a second tab waits its turn, then finds little or nothing
 *  left); every tab repaints from what was written. */
export function flush(staff: string, sid: string, csrf: string): Promise<void> {
  asked = { staff, sid, csrf };
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do {
        again = false;
        const a = asked!;
        const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
        if (locks?.request) await locks.request(LOCK, () => drain(a.staff, a.sid, a.csrf));
        else await drain(a.staff, a.sid, a.csrf);
      } while (again);
    } catch {
      /* storage or the lock failed: the records are where they were, and the next try picks them up */
    } finally {
      running = null;
      changed();
    }
  })();
  return running;
}

// --- every workspace page ---------------------------------------------------

let sending = false;

/** True when anything, anyone's, waits on this device: the server is asked who is signed in only then. */
async function anythingWaiting(): Promise<boolean> {
  return (await listPrefix('')).some((e) => e.kind === 'change' && e.state === 'pending');
}

/**
 * For the workspace layout, once per page: a change made offline goes as soon
 * as the line is back even when the person has moved on from that chart —
 * at page load, when the browser comes back online, and every 30 seconds
 * while anything waits — and the sign-out form is guarded (guardSignOut).
 * Whose changes go is the server's word, asked each time (serverWho: GET
 * /api/chart): the person signed in now, and only what they made under this
 * sign-in. Anything from an earlier sign-in waits on its chart for them to
 * look at; anyone else's waits for them. The server is asked only while the
 * person it drew this page for (data-staff on the sign-out form) has
 * something waiting. The token is the sign-out form's own (the same
 * double-submit token the chart sends). A page with a saving chart sends its
 * own person's changes itself, so there only the sign-out guard is attached.
 * A page without a chart that the server has just drawn also tells open
 * charts of anyone else on this device that their sign-in is over here
 * (pageDrawnFor). Answers come back as notices on that patient's chart and
 * in the sign-out question.
 *
 *   <script>import { keepSending } from '../lib/offline-queue'; keepSending();</script>
 */
export function keepSending(root: ParentNode = document) {
  guardSignOut(root);
  if (sending || root.querySelector('[data-odontogram][data-staff]')) return;
  sending = true;
  const form = root.querySelector<HTMLFormElement>('form[action="/auth/logout"]');
  const mine = form?.dataset.staff;
  if (mine) pageDrawnFor(mine).catch(() => {});
  // Sent changes and answers past their keeping time go, whoever they belong to.
  const ready = tidy().catch(() => {});
  const go = async () => {
    try {
      await ready;
      if (navigator.onLine === false) return;
      // Nothing of this page's person waits (or, on a page that does not say, nobody's): nothing to ask about.
      if (mine ? !(await waiting(mine)).length : !(await anythingWaiting())) return;
      const csrf = form?.querySelector<HTMLInputElement>('input[name="_csrf"]')?.value;
      if (!csrf) return;
      // Asked every time: a sign-out or sign-in in another tab since the last try changes the answer.
      const who = await serverWho();
      if (!who || !(await waiting(who.staff)).some((e) => sameSignIn(e, who.sid))) return;
      await flush(who.staff, who.sid, csrf);
    } catch {
      /* the next try picks it up */
    }
  };
  go();
  addEventListener('online', () => { go(); });
  addEventListener('pageshow', (e) => { if (e.persisted) go(); });
  setInterval(go, RETRY_MS);
}

// --- sign-out ---------------------------------------------------------------

/** Where the server sends a browser it has signed out (src/pages/auth/logout.ts). Change one, change both. */
const SIGNED_OUT = '/auth/login/?done=out';
/** The service worker's copy of a patient record lives in the cache 'flossify-record-<version>' (public/sw.js). */
const RECORD_CACHE = 'flossify-record-';

/** Post the sign-out form without leaving the page: 'out' when the server signed this browser out (it answers
 *  with its redirect), 'refused' when it answered anything else (a stale form), 'failed' when it could not be
 *  reached in time. */
async function postSignOut(form: HTMLFormElement, timeoutMs = SIGN_OUT_POST_MS): Promise<'out' | 'refused' | 'failed'> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(form.action, {
      method: 'POST', body: new FormData(form), credentials: 'same-origin', cache: 'no-store', redirect: 'manual', signal: ctrl.signal,
    });
    return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400) ? 'out' : 'refused';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/** The service worker drops its copy of a patient record when a sign-out form posts as a page; a sign-out sent
 *  from here has to drop it itself. */
async function dropRecordCopies() {
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) if (name.startsWith(RECORD_CACHE)) await caches.delete(name);
}

/** "one chart change" / "3 chart changes". */
const changesWord = (n: number) => (n === 1 ? 'one chart change' : `${n} chart changes`);

/**
 * For the workspace layout: signing out never loses a chart change to a bad
 * line, and on a line that hangs the person hears within about 10 seconds.
 * In order:
 *  1. Ask the server who is signed in (serverWho, 6 seconds: a slow line is
 *     not "no answer"). That is whose sign-in this ends; when it cannot be
 *     asked, the person the server drew this page for (data-staff on the
 *     form), then the device's last word. The question also confirms changes
 *     kept a moment ago (confirmUnder).
 *  2. Send what waits under the live sign-in (up to 5 seconds): the server's
 *     word, or when it could not be asked, the device's last word for this
 *     page's person — the server saves a change only under the sign-in it
 *     was made under, whoever sends it. Not when the question in step 1 went
 *     unanswered for its whole 6 seconds: a hung line would only add more
 *     waiting before the person hears anything.
 *  3. Only when the server answered in step 1: ask before anything unsent or
 *     unread would be deleted.
 *  4. Lock every open chart (signedOutHere; they say "Signing out…" while it
 *     is on its way), then post the sign-out from here, with 5 seconds to
 *     answer (4 when step 1 got no answer): a sign-out is the one thing still
 *     worth trying on a line that barely answers, and it is tried once.
 *     Nothing is deleted until the server has signed this browser out. If it
 *     cannot be reached — offline, or a brownout with the Wi-Fi still up —
 *     nothing is deleted, charts unlock, and the person is told in one line
 *     that they are still signed in.
 *  5. Signed out: every record of that person leaves the device (clearStaff);
 *     if the server could not be asked in step 1, their unsent changes and
 *     unread answers stay for their next sign-in here, and they are told so.
 *     The service worker's record copy goes too. Then the sign-in page.
 * Anything unexpected falls back to posting the form as a page, so this
 * never stands between a person and signing out. Attaching it twice to one
 * form is harmless (the second does nothing), so the odontogram and the
 * layout can both call it.
 *
 *   <script>import { guardSignOut } from '../lib/offline-queue'; guardSignOut();</script>
 */
export function guardSignOut(root: ParentNode = document) {
  root.querySelectorAll<HTMLFormElement>('form[action="/auth/logout"]').forEach((form) => {
    if (form.dataset.queueGuard) return;
    form.dataset.queueGuard = 'on';
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      // A second press while the first is still going waits for the first.
      if (form.dataset.queueGuard === 'busy') return;
      form.dataset.queueGuard = 'busy';
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
      const label = button?.textContent ?? '';
      const show = (text: string) => { if (button) button.textContent = text; };
      (async (): Promise<'stay' | 'done' | 'post'> => {
        try {
          show('Signing out…');
          const offline = navigator.onLine === false;
          const asked = Date.now();
          const who = offline ? undefined : await serverWho(SIGN_OUT_WHO_MS);
          // The question got no answer in its whole 6 seconds: the line hangs, and a change sent now would too.
          // Nothing is sent; what waits stays on the device (step 5), and the sign-out is tried once, briefly.
          const hung = who === undefined && Date.now() - asked >= SIGN_OUT_WHO_MS - 500;
          const last = await currentUser().catch(() => null);
          const pageStaff = form.dataset.staff || null;
          const staff = who?.staff ?? pageStaff ?? last?.staff ?? null;
          const csrf = (form.elements.namedItem('_csrf') as HTMLInputElement | null)?.value ?? '';
          const live = who !== undefined ? who : last && (!pageStaff || last.staff === pageStaff) ? last : null;
          if (!offline && !hung && live && (await waiting(live.staff)).some((e) => sameSignIn(e, live.sid))) {
            show('Sending chart…');
            await Promise.race([flush(live.staff, live.sid, csrf), new Promise((r) => setTimeout(r, SIGN_OUT_SEND_MS))]);
            show('Signing out…');
          }
          const unsent = staff ? (await waiting(staff)).length : 0;
          if (who !== undefined && staff) {
            const lines = (await listPrefix(prefix(staff)))
              .filter((e) => e.kind === 'notice' && e.notice && !e.read)
              .flatMap((e) => signOutLines(e.notice!));
            if (unsent) {
              lines.push(`The server has not confirmed ${changesWord(unsent)} yet. Signing out deletes ${unsent === 1 ? 'it' : 'them'} from this device.`);
            }
            if (lines.length) {
              const shown = lines.length > 6 ? [...lines.slice(0, 5), `And ${lines.length - 5} more.`] : lines;
              if (!confirm(`Before you sign out:\n\n${shown.join('\n')}\n\nSign out anyway?`)) return 'stay';
            }
          }
          const at = Date.now();
          const was = await signedOutHere(at, true);
          const out = await postSignOut(form, hung ? SIGN_OUT_POST_HUNG_MS : SIGN_OUT_POST_MS);
          if (out === 'failed') {
            await undoSignedOut(was, at).catch(() => {});
            const kept = !unsent ? '' : unsent === 1 ? ' Your chart change stays on this device.' : ` Your ${unsent} chart changes stay on this device.`;
            alert(`No connection, so you are still signed in.${kept} Try signing out again when the line is back.`);
            return 'stay';
          }
          if (out === 'refused') return 'post';
          await signedOutDone(at).catch(() => {});
          if (staff) await clearStaff(staff, who === undefined);
          await dropRecordCopies().catch(() => {});
          if (who === undefined && unsent) {
            alert(unsent === 1
              ? 'You are signed out. One chart change could not be sent and stays on this device. Sign in here again to save it.'
              : `You are signed out. ${unsent} chart changes could not be sent and stay on this device. Sign in here again to save them.`);
          }
          return 'done';
        } catch {
          return 'post';
        }
      })().then(async (next) => {
        show(label);
        if (next === 'stay') { form.dataset.queueGuard = 'on'; return; }
        if (next === 'done') { location.replace(SIGNED_OUT); return; }
        // Posted as a page, the way the form would without this guard (the service worker drops its record copy).
        await signedOutHere().catch(() => {});
        form.submit();
      });
    });
  });
}

// How the chart names a tooth (FDI, Universal or Palmer, as the person set it),
// so the sign-out question uses the same numbers the chart showed.
let toothName = (fdi: number) => String(fdi);
/** The odontogram on this page tells the sign-out question how to name teeth. */
export function nameTeeth(fn: (fdi: number) => string) {
  toothName = fn;
}

/** An answer the person has not dismissed, in one sentence each, for the sign-out question. */
function signOutLines(n: Notice): string[] {
  if (n.kind === 'dropped') {
    const why = n.error ? ` ${n.error}` : '';
    return [n.clear || n.fdi == null ? `The chart was not cleared.${why}` : `Tooth ${toothName(n.fdi)} was not saved.${why}`];
  }
  return n.items.map((it) => {
    const who = it.you ? 'you changed it on another screen' : `${it.by ?? 'someone else'} changed it`;
    return n.clear ? `Tooth ${toothName(it.fdi)} was not cleared: ${who}.` : `Your change to tooth ${toothName(it.fdi)} was not saved: ${who}.`;
  });
}
