function freeStarts(holds, a) {
  if (!a.open) return [];
  const turn = a.turnover ?? 0, limit = a.limit ?? 1, spread = a.spread ?? 0;
  const chairFree = (c, t) => !holds.some((h) => h.chair === c && h.s < t + a.minutes + turn && h.e + turn > t);
  const dentistFree = (d, t) => !holds.some((h) => h.dentistId === d && h.s < t + a.minutes && h.e > t);
  const out = [];
  let prevFree = false, last = -Infinity;
  for (let t = Math.max(a.open[0], a.from); t + a.minutes <= a.open[1] && out.length < limit; t = Math.floor(t / 15) * 15 + 15) {
    const want = a.preferChair ?? null;
    let chair = want !== null && want >= 1 && want <= a.chairs && chairFree(want, t) ? want : null;
    for (let c = 1; c <= a.chairs && chair === null; c++) if (chairFree(c, t)) chair = c;
    const ok = chair !== null && (a.dentistId ? dentistFree(a.dentistId, t) : !a.anyOf?.length || a.anyOf.some((d) => dentistFree(d, t)));
    if (ok && (!prevFree || t >= last + spread)) { out.push({ min: t, chair }); last = t; }
    prevFree = ok;
  }
  return out;
}
const base = { open: [540, 1080], chairs: 2, from: 540, turnover: 10 };
const B = [{ s: 540, e: 580, chair: 1, dentistId: null }, { s: 540, e: 600, chair: 2, dentistId: null }];
console.log('B', JSON.stringify(freeStarts(B, { ...base, minutes: 30, limit: 4, spread: 60 })));
console.log('B0', JSON.stringify(freeStarts(B, { ...base, minutes: 30, turnover: 0 })));
console.log('C', JSON.stringify(freeStarts([{ s: 600, e: 660, chair: 2, dentistId: 'D' }], { ...base, minutes: 30, from: 600, dentistId: 'D' })));
console.log('D', JSON.stringify(freeStarts([], { ...base, chairs: 1, minutes: 30, from: 600 })));
console.log('E', JSON.stringify(freeStarts([{ s: 540, e: 1035, chair: 1, dentistId: null }], { ...base, chairs: 1, minutes: 45 })));
console.log('F', JSON.stringify(freeStarts([{ s: 600, e: 660, chair: 1, dentistId: 'D1' }, { s: 600, e: 660, chair: 2, dentistId: 'D2' }], { ...base, chairs: 3, minutes: 30, from: 600, anyOf: ['D1', 'D2'] })));
console.log('F t0', JSON.stringify(freeStarts([{ s: 600, e: 660, chair: 1, dentistId: 'D1' }, { s: 600, e: 660, chair: 2, dentistId: 'D2' }], { ...base, chairs: 3, minutes: 30, from: 600, anyOf: ['D1', 'D2'], turnover: 0 })));
// solo chair, back to back 45-min visits
console.log('solo', JSON.stringify(freeStarts([{ s: 540, e: 585, chair: 1, dentistId: null }], { ...base, chairs: 1, minutes: 45, limit: 4, spread: 60 })));
// spread: empty day, 30 min
console.log('empty', JSON.stringify(freeStarts([], { ...base, chairs: 4, minutes: 30, limit: 4, spread: 60 })));
// 4 chairs, 4 unplaced web bookings at 10:00-10:45 (chair null, dentist null)
const web = [0,1,2,3].map(() => ({ s: 600, e: 645, chair: null, dentistId: null }));
console.log('unplaced', JSON.stringify(freeStarts(web, { open: [540,1080], chairs: 4, from: 600, minutes: 30, turnover: 10, anyOf: ['DOM'] })));
// solo dentist, 2 chairs, Any-dentist visit in chair 1 at 10:00
console.log('solo-any', JSON.stringify(freeStarts([{ s: 600, e: 645, chair: 1, dentistId: null }], { open: [540,1080], chairs: 2, from: 600, minutes: 30, turnover: 10, anyOf: ['DOM'] })));
// 040-style clinic-wide lunch hold 12:00-13:00
console.log('lunch', JSON.stringify(freeStarts([{ s: 720, e: 780, chair: null, dentistId: null }], { open: [540,1080], chairs: 1, from: 720, minutes: 30, turnover: 10 })));
