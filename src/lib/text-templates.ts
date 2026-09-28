// The texts a clinic really sends, ready to fill in: the Messages page's
// "Text a patient" panel offers each as a chip, and the desk edits the words
// before sending. No Node or database imports, so the page's own script can
// import it and fill the box in the browser from the chosen patient's facts.
//
// The rules every text on this site keeps (CLAUDE.md, Backend): no link in
// any text (Philippine telcos drop them), and no text asks for a reply (the
// sender is one-way, so a reply reaches nobody). When a text asks the patient
// to act, it names the clinic's number to call. Every body is GSM-7 only: a
// plain apostrophe, no curly quotes, no en dash, no peso sign ("PHP 1,500"),
// because one character outside that set turns the whole text into UCS-2 and
// halves what fits in one message. The page prepends "<Clinic name>: "; each
// body filled in with ordinary values stays under 160 characters with it
// (scripts/text-templates-check in the session scratchpad measured every one
// with a 30-letter clinic name).
//
// Placeholders: {first} the patient's first name, {phone} the clinic's number,
// {time} and {day} of the visit the text is about, {dentist} its dentist,
// {amount} the balance as "PHP 1,500". A value the page does not have becomes
// plain words ("the clinic", "your dentist"), never a blank or a bracket.

export interface TextTemplate {
  id: string;
  label: string;
  body: string;
  /** What the text is really about, so the page can say when the chosen patient shows none of it. */
  needs?: 'balance' | 'visit' | 'lab';
}

export const TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: 'late', label: 'Running late', needs: 'visit',
    body: 'Hi {first}, we are about 15 minutes behind and expect to seat you at about {time}. Sorry for the wait.',
  },
  {
    id: 'lab', label: 'Lab work back', needs: 'lab',
    body: 'Hi {first}, your lab work is back. Call {phone} to book the fitting.',
  },
  {
    id: 'hmo', label: 'Bring your HMO card',
    body: 'Hi {first}, please bring your HMO card and a government ID to your visit, so the HMO can be charged for it.',
  },
  {
    id: 'away', label: 'Dentist away', needs: 'visit',
    body: 'Hi {first}, {dentist} is away on {day}, so your visit needs a new day. Please call {phone} to pick one.',
  },
  {
    id: 'recall', label: 'Check-up due',
    body: 'Hi {first}, your check-up and cleaning is due. Call {phone} to book.',
  },
  {
    id: 'balance', label: 'Balance', needs: 'balance',
    body: 'Hi {first}, your account has a balance of {amount}. Settle it at your next visit or by GCash at the desk.',
  },
  {
    id: 'missed', label: 'Missed visit',
    body: 'Hi {first}, we missed you today. Call {phone} to book another time.',
  },
  {
    id: 'thanks', label: 'Thank you',
    body: 'Hi {first}, thank you for visiting us today. If anything hurts or does not feel right, call {phone}.',
  },
];

export interface TemplateValues {
  first: string;
  phone: string | null;
  time?: string | null;
  day?: string | null;
  dentist?: string | null;
  amount?: string | null;
}

/** The plain words used where a value is missing, so a text never carries a blank or a bracket. */
const FALLBACK: Record<keyof TemplateValues, string> = {
  first: 'there',
  phone: 'the clinic',
  time: '15 minutes after your booking',
  day: 'the day of your visit',
  dentist: 'your dentist',
  amount: 'the amount on your statement',
};

/** Whitespace squeezed to one space, so a value pasted with a line break cannot break the text. */
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The template's words with the patient's facts in them; a fact that is missing becomes plain words. */
export function fillTemplate(t: TextTemplate, v: TemplateValues): string {
  return t.body.replace(/\{(\w+)\}/g, (m, key: string) => {
    if (!Object.hasOwn(FALLBACK, key)) return m;
    const k = key as keyof TemplateValues;
    const val = v[k];
    const s = val == null ? '' : clean(String(val));
    return s || FALLBACK[k];
  });
}

/** "PHP 1,500" or "PHP 850.50": pesos for a text, where the peso sign would cost the whole message its GSM encoding. */
export function phpAmount(n: number | string): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return FALLBACK.amount;
  const whole = Math.abs(x % 1) < 0.005;
  return `PHP ${x.toLocaleString('en-PH', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** True when every character is in the GSM-7 basic set (the extension set — { } [ ] ~ ^ | € \ — costs two each and is refused too). */
const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r]*$/;
export const isGsm7 = (s: string) => GSM7.test(s);
