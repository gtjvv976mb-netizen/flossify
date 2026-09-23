// The provider seam. Above this file the app thinks "send this body to this
// number and tell me what happened"; below it is one gateway's HTTP. Two
// providers: the console, which prints and sends nothing (development), and
// Semaphore (semaphore.co), a Philippine gateway that sends under a registered
// sender name.
//
// No imports on purpose. The worker (scripts/sms/worker.ts) runs this outside
// Astro on plain Node with global fetch, so nothing here reads import.meta.env
// or pulls in the database.
//
// No links in any body. Philippine telcos drop messages that contain a URL,
// silently; the text that queues them (src/lib/messages.ts) is where that
// rule is kept.

export interface SmsResult {
  ok: boolean;
  /** The gateway's id for the message, kept in message_log.provider_ref. */
  ref?: string | null;
  error?: string;
  /** True when trying again later could work: the gateway was down, the network dropped. */
  retryable?: boolean;
}

export interface SmsProvider {
  name: string;
  /** `kind` is only for the log line; the gateway never sees it. */
  send(to: string, body: string, kind?: string): Promise<SmsResult>;
}

const SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages';
const PH_MOBILE = /^09\d{9}$/;

/** 0917 000 0000 / +63 917 000 0000 / 63917… → '09170000000', the form the gateways take. Anything else comes back as its digits. */
export function localNumber(to: string): string {
  const d = String(to ?? '').replace(/\D/g, '');
  if (/^63\d{10}$/.test(d)) return '0' + d.slice(2);
  if (/^9\d{9}$/.test(d)) return '0' + d;
  return d;
}

const badNumber = (to: string): SmsResult => ({ ok: false, error: `Not a Philippine mobile number: ${to}`, retryable: false });

/** Prints one line per text and sends nothing. The development provider. */
export function consoleProvider(out: (line: string) => void = console.log): SmsProvider {
  let n = 0;
  return {
    name: 'console',
    async send(to, body, kind) {
      const number = localNumber(to);
      if (!PH_MOBILE.test(number)) return badNumber(to);
      n += 1;
      out(`[sms] → ${number} (${kind ?? 'text'}) ${body}`);
      return { ok: true, ref: `console-${n}` };
    },
  };
}

/** Sends through semaphore.co. A 2xx with a JSON array is accepted; 4xx is final; 5xx and no answer are worth another try. */
export function semaphoreProvider(apiKey: string, sender = 'Flossify'): SmsProvider {
  return {
    name: 'semaphore',
    async send(to, body) {
      const number = localNumber(to);
      if (!PH_MOBILE.test(number)) return badNumber(to);
      const form = new URLSearchParams({ apikey: apiKey, number, message: body, sendername: sender });
      let res: Response;
      try {
        res = await fetch(SEMAPHORE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: form,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        return { ok: false, error: `Could not reach Semaphore: ${(e as Error).message}`, retryable: true };
      }
      const full = await res.text().catch(() => '');
      // For error messages only; the full answer is what gets parsed.
      const text = full.slice(0, 300);
      if (res.ok) {
        let parsed: unknown;
        try { parsed = JSON.parse(full); } catch { return { ok: false, error: `Semaphore answered ${res.status} without JSON: ${text}`, retryable: true }; }
        if (Array.isArray(parsed) && parsed.length > 0) {
          const id = (parsed[0] as { message_id?: unknown })?.message_id;
          return { ok: true, ref: id == null ? null : String(id) };
        }
        // Semaphore answers 200 with an object, not an array, when it turns a message down: an unregistered sender name, an empty account.
        return { ok: false, error: `Semaphore did not take it: ${text}`, retryable: false };
      }
      // 429 and 408 are the two 4xx answers that mean "not now" rather than "not ever".
      if (res.status >= 500 || res.status === 429 || res.status === 408) return { ok: false, error: `Semaphore ${res.status}: ${text}`, retryable: true };
      return { ok: false, error: text || `Semaphore ${res.status}`, retryable: false };
    },
  };
}

/** The provider .env asks for. SMS_PROVIDER is `console` (default) or `semaphore`, which needs SMS_API_KEY and a registered SMS_SENDER. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): SmsProvider {
  const which = (env.SMS_PROVIDER ?? 'console').trim().toLowerCase() || 'console';
  if (which === 'console') return consoleProvider();
  if (which === 'semaphore') {
    const key = (env.SMS_API_KEY ?? '').trim();
    if (!key) throw new Error('SMS_PROVIDER is semaphore but SMS_API_KEY is empty. Put the key from semaphore.co in .env, or set SMS_PROVIDER=console.');
    return semaphoreProvider(key, (env.SMS_SENDER ?? '').trim() || 'Flossify');
  }
  throw new Error(`SMS_PROVIDER is "${which}". Use console or semaphore.`);
}
