// The email seam, beside the text one (src/lib/sms.ts). Above this file the
// app thinks "send this subject and body to this address and tell me what
// happened"; below it is one service's HTTP. Two providers: the console, which
// prints and sends nothing (development), and Resend (resend.com), which sends
// from an address on a domain verified there.
//
// Email is optional. EMAIL_PROVIDER unset (or "off") means there is no email
// channel at all: the forgot page offers texts only, invitations go by text
// only, and the worker claims no email rows. Everything that asks goes through
// emailEnabled() below, so the web server and the worker read the same rule.
//
// No imports on purpose, like sms.ts: the worker (scripts/sms/worker.ts) runs
// this outside Astro on plain Node with global fetch, and pages import it for
// emailEnabled() and the address check.
//
// No body in any log on a production server. Bodies carry sign-in codes
// (reset, invite); a log line is read by whoever can read the logs, and a code
// is an account. The console provider prints the address, the kind and the
// subject, and the body only on the owner's machine; it refuses to run on a
// production server at all (src/lib/env.ts refuses the same for the web
// server). The Resend provider takes the body, any six-digit code and the key
// out of any error text it passes up (the worker logs those and stores them in
// message_log.failed_reason).
//
// The subject never carries the code: it shows on lock screens and in
// notification previews, and the Messages page may show it.

export interface EmailResult {
  ok: boolean;
  /** The service's id for the email, kept in message_log.provider_ref. */
  ref?: string | null;
  error?: string;
  /** True when trying again later could work: the service was down or busy, the network dropped. */
  retryable?: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. The HTML part is made from it. */
  body: string;
  /** Only for the log line; the service never sees it. */
  kind?: string;
  /**
   * The same key for every try of one email (the worker passes the
   * message_log id), so a try that timed out after the service took it is not
   * sent a second time. Resend keeps a key for 24 hours.
   */
  idempotencyKey?: string;
}

export interface EmailProvider {
  name: string;
  send(m: EmailMessage): Promise<EmailResult>;
}

const RESEND_URL = 'https://api.resend.com/emails';

/** Good enough to refuse a typo, loose enough for every real address. The service has the last word. */
export const EMAIL_ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
export const EMAIL_MAX = 120;

/** ' Ana@Clinic.PH ' → 'ana@clinic.ph'. */
export const normalizeEmail = (s: string) => String(s ?? '').trim().toLowerCase();

/** 'liwayway.domingo@example.com' → 'li…@example.com', for log lines. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '…';
  return `${address.slice(0, Math.min(2, at))}…${address.slice(at)}`;
}

/** 'Flossify <no-reply@flossify.ph>' or 'no-reply@flossify.ph' → the address, or null when it is neither. */
export function fromAddress(from: string): string | null {
  const s = from.trim();
  const named = /^[^<>]*<([^<>\s]+)>$/.exec(s);
  const address = named ? named[1] : s;
  return EMAIL_ADDRESS.test(address) ? address : null;
}

/**
 * A production server: never the astro CLI; otherwise NODE_ENV=production, or
 * the built server unless NODE_ENV says development or test. The same rule as
 * isProduction() in src/lib/env.ts and src/lib/sms.ts, repeated because this
 * file imports nothing.
 */
function isProduction(env: Record<string, string | undefined> = process.env): boolean {
  const script = process.argv[1] ?? '';
  if (/(^|[\\/])astro(\.m?js)?$/.test(script)) return false;
  const mode = (env.NODE_ENV ?? '').trim();
  if (mode === 'production') return true;
  return /(^|[\\/])dist[\\/]server[\\/]entry\.mjs$/.test(script) && !/^(development|test)$/i.test(mode);
}

/** Which provider EMAIL_PROVIDER names: '' when email is off. */
export function emailProviderName(env: Record<string, string | undefined> = process.env): string {
  const which = (env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  return which === 'off' || which === 'none' ? '' : which;
}

/** Is there an email channel? Unset or "off" means no. Read when asked, never when loaded. */
export function emailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return emailProviderName(env) !== '';
}

/** Takes the body, and anything shaped like a six-digit code, out of text that is about to be logged or stored as an error. */
function scrub(text: string, body: string): string {
  let out = text;
  if (body.length >= 4) out = out.split(body).join('[message]');
  return out.replace(/(^|\D)\d{6}(?!\d)/g, '$1[code]');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The HTML part: the plain text, one paragraph per blank-line block, in the
 * reader's own font at a size a phone reads without zooming. No images, no
 * tracking, nothing remote: it looks the same with pictures off.
 */
export function htmlFromText(body: string): string {
  const paragraphs = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`);
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111">${paragraphs.join('')}</body></html>`;
}

/**
 * Prints one line per email and sends nothing. On the owner's machine the line
 * carries the body, because that is how a developer reads the code they were
 * just sent. Anywhere else, only its length.
 */
export function consoleEmailProvider(out: (line: string) => void = console.log, opts: { showBodies?: boolean } = {}): EmailProvider {
  const showBodies = opts.showBodies ?? !isProduction();
  let n = 0;
  return {
    name: 'console',
    async send(m) {
      const to = normalizeEmail(m.to);
      if (!EMAIL_ADDRESS.test(to)) return { ok: false, error: 'Not an email address.', retryable: false };
      n += 1;
      out(`[email] → ${showBodies ? to : maskEmail(to)} (${m.kind ?? 'email'}) "${m.subject}" ${showBodies ? `\n${m.body}` : `[${m.body.length} characters, not shown in production]`}`);
      return { ok: true, ref: `console-email-${n}` };
    },
  };
}

/**
 * Sends through Resend's HTTP API (POST /emails, Bearer key, JSON). A 200 with
 * an id is accepted. 429 (too fast, or the day's or month's quota), 5xx, 408,
 * a concurrent request on the same idempotency key (409) and no answer at all
 * are worth another try; every other 4xx is final (a bad address, an
 * unverified domain, a revoked key).
 */
export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: 'resend',
    async send(m) {
      const to = normalizeEmail(m.to);
      if (!EMAIL_ADDRESS.test(to)) return { ok: false, error: 'Not an email address.', retryable: false };
      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      };
      if (m.idempotencyKey) headers['idempotency-key'] = m.idempotencyKey.slice(0, 256);
      let res: Response;
      try {
        res = await fetch(RESEND_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ from, to: [to], subject: m.subject, text: m.body, html: htmlFromText(m.body) }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        return { ok: false, error: `Could not reach Resend: ${(e as Error).message}`, retryable: true };
      }
      const full = await res.text().catch(() => '');
      let parsed: { id?: unknown; name?: unknown; message?: unknown } | null = null;
      try { parsed = JSON.parse(full); } catch { /* not JSON: reported below */ }
      if (res.ok) {
        const id = parsed && typeof parsed === 'object' ? parsed.id : null;
        if (typeof id === 'string' && id) return { ok: true, ref: id };
        // 200 without an id: it may have gone. Not retried, so it is never sent twice.
        return { ok: false, error: `Resend answered ${res.status} without an email id.`, retryable: false };
      }
      // For error text only. The worker logs errors and stores them, so neither the body nor the key may be in them.
      const said = parsed && typeof parsed === 'object'
        ? [parsed.name, parsed.message].filter((x) => typeof x === 'string' && x).join(': ')
        : full.slice(0, 300);
      const scrubbed = scrub(String(said).slice(0, 300), m.body);
      const text = apiKey ? scrubbed.split(apiKey).join('[key]') : scrubbed;
      const busy = parsed && typeof parsed === 'object' && parsed.name === 'concurrent_idempotent_requests';
      const retryable = res.status >= 500 || res.status === 429 || res.status === 408 || (res.status === 409 && !!busy);
      return { ok: false, error: `Resend ${res.status}${text ? `: ${text}` : ''}`, retryable };
    },
  };
}

/**
 * The provider EMAIL_PROVIDER asks for, or null when email is off.
 * `console` prints (the owner's machine only: refused on a production server).
 * `resend` needs EMAIL_API_KEY and EMAIL_FROM, a sender on a domain verified at
 * Resend, like "Flossify <no-reply@flossify.ph>".
 */
export function emailProviderFromEnv(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  const which = emailProviderName(env);
  if (!which) return null;
  const production = isProduction(env);
  if (which === 'console') {
    if (production) throw new Error('EMAIL_PROVIDER is console on a production server: emails would be printed, not sent, so nobody could reset a password by email. Set EMAIL_PROVIDER=resend with EMAIL_API_KEY and EMAIL_FROM, or remove EMAIL_PROVIDER to turn email off.');
    return consoleEmailProvider(console.log, { showBodies: true });
  }
  if (which === 'resend') {
    const key = (env.EMAIL_API_KEY ?? '').trim();
    if (!key) throw new Error('EMAIL_PROVIDER is resend but EMAIL_API_KEY is empty. Put the API key from resend.com in EMAIL_API_KEY, or remove EMAIL_PROVIDER to turn email off.');
    const from = (env.EMAIL_FROM ?? '').trim();
    if (!from || !fromAddress(from)) throw new Error('EMAIL_FROM is not set or is not an address. Use a sender on the domain verified at Resend, like: Flossify <no-reply@flossify.ph>');
    return resendProvider(key, from);
  }
  throw new Error(`EMAIL_PROVIDER is "${which}". Use resend, or console on this machine, or remove it to turn email off.`);
}
