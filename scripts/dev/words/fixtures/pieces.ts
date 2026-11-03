// The words check's fixture module for words made of pieces and the calls around them (words.test.mjs).
declare const el: HTMLElement, side: HTMLElement, fd: FormData, x: string;
declare function pill(t: string, tone: string): HTMLElement;
declare function make(tag: string, cls: string, text: string): HTMLElement;
const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

side.append(pill('In lobby', 'amber'));
el.append('Open the Team page');
fd.append('booking_ref', x);
el.textContent = `${n(3, 'appointment', 'appointments')} today`;
el.title = `Then 3 more ${x ? 'appointment' : 'appointments'} with you`;
el.textContent = 'Open the call ' + 'list';
Object.assign(el, { textContent: 'Still owed' });
Object.assign(el.style, { margin: '0.5rem 0 1rem' });
el.innerHTML = '<button title="Booking reference" aria-label="Open the call list">Go</button>';
const r = new Response(JSON.stringify({ error: 'That slot has just gone. Pick another.' }));
document.querySelectorAll('[data-x]').forEach((b) => { b.textContent = 'No show'; });
const prose = [`balance: ${x}`, `${x}: appointments only`, 'walk-in appointment', 'Completed:', '(Completed)', 'Invoice/receipt'];
const code = ['ws-pill ws-tint-teal', 'cal-slot is-open', 'login:e:x', 'recall-set'];
if (matchMedia('(max-width: 767px)').matches) console.log('appointment');
side.append(make('span', 'unit', ' slots'));
el.textContent = x ? 'slot' : 'slots';
