// Small pieces of the soft template for markup the Dashboard builds in the
// browser (the calendar's cards, the patients list, the side panels): a line
// icon, a person's round avatar, a tinted callout. They draw exactly what the
// shell's <Icon>, <Avatar> and .ws-callout draw on the server, so a row made
// here and a row made there look the same. Names and notes go in with
// textContent; only the icons' own fixed markup goes in as HTML.
import { svgFor, type IconName } from '../icons';

/** A decorative line icon (aria-hidden), as an element. */
export function icon(name: IconName, size = 18, cls = ''): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = svgFor(name, size);
  const svg = t.content.firstElementChild as SVGSVGElement;
  if (cls) svg.classList.add(...cls.split(' ').filter(Boolean));
  return svg;
}

const TINTS = ['teal', 'blue', 'green', 'amber', 'violet', 'rose'] as const;
/** "Dr. Liwayway Domingo" → "LD", on the tint Avatar.astro picks for the same name. Decorative beside the name. */
export function avatar(name: string, size: 'sm' | 'md' | 'lg' = 'md'): HTMLSpanElement {
  const words = name.replace(/^(Dr|Dra|Doc)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '·';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const s = document.createElement('span');
  s.className = `ws-avatar ws-avatar-${size}`;
  s.dataset.tint = TINTS[h % TINTS.length];
  s.setAttribute('aria-hidden', 'true');
  s.textContent = initials;
  return s;
}

const TONE_ICON: Record<string, IconName> = { alert: 'alert', warn: 'alert', success: 'check', info: 'info' };
/** Fill a .ws-callout (its data-tone picks the icon) with one sentence, and show it. */
export function callout(box: HTMLElement, text: string, extra: Node[] = []) {
  const words = document.createElement('span');
  words.className = 'min-w-0';
  words.append(text, ...extra);
  box.replaceChildren(icon(TONE_ICON[box.dataset.tone ?? 'info'] ?? 'info'), words);
  box.hidden = false;
}

/** A soft pill (.ws-pill) in one of the template's tints, with an optional icon. */
export function pill(text: string, tint: 'teal' | 'green' | 'amber' | 'blue' | 'red' | 'slate', withIcon?: IconName): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = `ws-pill ws-tint-${tint}`;
  if (withIcon) s.append(icon(withIcon, 13));
  s.append(text);
  return s;
}
