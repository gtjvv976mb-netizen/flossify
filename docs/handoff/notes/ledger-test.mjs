// src/lib/health.ts
var YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateText(ymd) {
  const m = YMD.exec(ymd ?? "");
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : null;
}

// src/lib/invoices.ts
function fromDb(v) {
  if (v === null || v === void 0 || v === "") return 0n;
  if (typeof v === "bigint") return v * 100n;
  const s = String(v).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`not an amount: ${s}`);
  const frac = (m[3] ?? "").padEnd(2, "0");
  const c = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2)) + (frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n);
  return m[1] ? -c : c;
}
function toDb(c) {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}
var PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
var PESO_WHOLE = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
var pesos = (c) => PESO.format(typeof c === "bigint" ? toDb(c) : c);
var METHODS = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  bank_transfer: "Bank transfer",
  hmo: "HMO",
  philhealth: "PhilHealth"
};
var PAYOR_METHODS = /* @__PURE__ */ new Set(["hmo", "philhealth"]);
var methodLabel = (m) => METHODS[m] ?? (m === "cheque" ? "Cheque" : m);
var DISCOUNTS = {
  none: { label: "No discount", line: "" },
  senior: { label: "Senior citizen, 20%", line: "Senior citizen discount, 20%" },
  pwd: { label: "Person with disability, 20%", line: "PWD discount, 20%" }
};
var statementNo = (prefix, n) => `${prefix}-${String(n).padStart(6, "0")}`;
function sumsOf(s, payments) {
  const live = payments.filter((p) => !p.voided_at);
  const paid = live.reduce((n, p) => n + fromDb(p.amount), 0n);
  const payorPaid = live.filter((p) => PAYOR_METHODS.has(p.method)).reduce((n, p) => n + fromDb(p.amount), 0n);
  const balance = s.status === "void" ? 0n : fromDb(s.total) - paid;
  const owedByPayor = fromDb(s.payor_share) - payorPaid;
  const payorDue = s.status === "void" || balance <= 0n || owedByPayor <= 0n ? 0n : owedByPayor < balance ? owedByPayor : balance;
  const patientDue = balance - payorDue;
  return { paid, payorPaid, balance, payorDue, patientDue: patientDue > 0n ? patientDue : 0n };
}

// src/lib/treatment-record.ts
var TZ = "Asia/Manila";
var dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
var timeWords = (d) => new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d)).toLowerCase();
var endOfDay = (day) => new Date(Date.parse(`${day}T00:00:00+08:00`) + 864e5);
var tooth = (fdi, surface) => fdi ? [`${fdi}${surface ? ` ${surface}` : ""}`] : [];
var blank = (kind, words) => ({ kind, teeth: [], words, detail: null, status: null, quiet: false, dentist: null, charged: null, paid: null, balance: null, next: null });
var clip = (s, n) => s ? s.length > n ? `${s.slice(0, n).trimEnd()}\u2026` : s : null;
function holds(v) {
  const out = [];
  const roots = v.notes.filter((n) => !n.amends).length;
  if (roots) out.push(roots === 1 ? "Clinical note" : `${roots} clinical notes`);
  if (v.rx.length) out.push(v.rx.length === 1 ? "prescription" : `${v.rx.length} prescriptions`);
  if (v.letters.length) out.push(v.letters.length === 1 ? "letter" : `${v.letters.length} letters`);
  if (v.vitals.length) out.push("blood pressure");
  if (v.files.length) out.push(v.files.length === 1 ? "one file" : `${v.files.length} files`);
  return out;
}
var holdsNothing = (v) => holds(v).length === 0 && v.procs.length === 0 && v.adjustments.length === 0 && v.consents.length === 0;
var sentence = (xs) => xs.length ? xs.join(", ").replace(/^./, (c) => c.toUpperCase()) : null;
function buildLedger(i) {
  const { visits, clinical: c, extra: x, recalls } = i;
  const onFile = fromDb(i.onFile ?? 0);
  const past = visits.filter((v) => !v.future);
  const today = dayKey(/* @__PURE__ */ new Date());
  const openable = (v) => !v.future && !(v.status === "cancelled" && holdsNothing(v));
  const byDay = /* @__PURE__ */ new Map();
  const slot = (day) => {
    let d = byDay.get(day);
    if (!d) {
      d = { clinical: [], money: [] };
      byDay.set(day, d);
    }
    return d;
  };
  const m = i.money;
  const stmtDay = /* @__PURE__ */ new Map();
  const stmtNo = /* @__PURE__ */ new Map();
  const linesOf = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  if (m) {
    for (const s of m.statements) {
      stmtDay.set(s.id, dayKey(s.issued_at));
      stmtNo.set(s.id, statementNo(s.series_prefix, s.number));
    }
    for (const l of m.lines) {
      const a = linesOf.get(l.invoice_id) ?? [];
      a.push(l);
      linesOf.set(l.invoice_id, a);
    }
  }
  const chargedFor = (d, day) => {
    if (!m) return null;
    let sum = 0n, any = false;
    for (const l of m.lines) {
      if (l.procedure_id !== d.id || used.has(l.id) || stmtDay.get(l.invoice_id) !== day) continue;
      sum += fromDb(l.amount);
      any = true;
      used.add(l.id);
    }
    return any ? sum : null;
  };
  const dentistOnDay = (day) => past.find((v) => v.day === day && v.dentist)?.dentist ?? null;
  let count = 0;
  for (const v of past) {
    for (const d of v.procs) {
      const r2 = blank("done", d.name);
      r2.teeth = tooth(d.fdi, d.surface);
      const doneDay = dayKey(d.at);
      r2.detail = [clip(d.note, 140), doneDay !== v.day ? `done ${dateText(doneDay)}` : null].filter(Boolean).join(" \xB7 ") || null;
      r2.dentist = d.dentist;
      r2.charged = chargedFor(d, v.day);
      slot(v.day).clinical.push({ row: r2, at: +new Date(d.at), order: 0 });
      count++;
    }
    if (v.procs.length || v.adjustments.length) continue;
    if (v.status === "cancelled" && holdsNothing(v)) continue;
    if (!v.id && holds(v).length === 0) continue;
    const r = blank("visit", "No treatment recorded");
    const what = holds(v);
    r.dentist = v.dentist;
    if (!v.id) r.detail = ["At the clinic, no booking", ...what].join(" \xB7 ");
    else if (v.source === "import") {
      r.words = v.reason || "Visit";
      r.detail = "From old records";
      r.teeth = v.asked.map(String);
    } else if (v.status === "completed") r.detail = [v.reason, sentence(what)].filter(Boolean).join(" \xB7 ") || null;
    else if (v.status === "no_show") {
      r.status = "no_show";
      r.quiet = true;
      r.words = "";
      r.detail = v.reason;
    } else if (v.status === "cancelled") {
      r.status = "cancelled";
      r.quiet = true;
      r.words = "";
      r.detail = sentence(what);
    } else if (v.status === "booked" || v.status === "confirmed") {
      r.status = v.status;
      r.words = "";
      r.detail = [v.day === today ? "Not marked yet" : "Not marked done or missed", v.reason].filter(Boolean).join(" \xB7 ");
    } else if (v.status) {
      r.status = v.status;
      r.words = "";
      r.detail = v.reason;
    }
    if (m && v.id) {
      const s = m.statements.find((s2) => s2.appointment_id === v.id && stmtDay.get(s2.id) === v.day && (linesOf.get(s2.id) ?? []).length === 1);
      const l = s ? linesOf.get(s.id)[0] : null;
      if (l && !used.has(l.id)) {
        r.charged = fromDb(l.amount);
        used.add(l.id);
        if (v.status === "completed" || !v.status) {
          r.words = l.description;
          r.detail = [v.reason !== l.description ? v.reason : null, sentence(what)].filter(Boolean).join(" \xB7 ") || null;
        } else r.detail = [r.detail, `Charged: ${l.description}`].filter(Boolean).join(" \xB7 ");
      }
    }
    slot(v.day).clinical.push({ row: r, at: +new Date(v.at), order: 1 });
  }
  for (const p of x.plans) for (const a of p.adjustments) {
    if (!a.on) continue;
    const r = blank("adjust", "Braces adjustment");
    r.detail = clip(a.note, 140);
    r.dentist = dentistOnDay(a.on);
    slot(a.on).clinical.push({ row: r, at: Date.parse(`${a.on}T12:00:00+08:00`), order: 0 });
    count++;
  }
  const procById = new Map(c.done.map((d) => [d.id, d]));
  const payRowDay = /* @__PURE__ */ new Map();
  if (m) {
    let n = 0;
    for (const s of m.statements) {
      const day = stmtDay.get(s.id);
      const no = stmtNo.get(s.id);
      const at = +new Date(s.issued_at);
      const lines = (linesOf.get(s.id) ?? []).slice().sort((a, b) => (a.line_no ?? 1e9) - (b.line_no ?? 1e9));
      for (const l of lines) {
        if (used.has(l.id)) continue;
        used.add(l.id);
        const d = l.procedure_id ? procById.get(l.procedure_id) : void 0;
        const r = blank("charge", l.description);
        if (d) {
          r.teeth = tooth(d.fdi, d.surface);
          r.dentist = d.dentist;
        }
        const doneDay = d ? dayKey(d.at) : null;
        r.detail = [no, doneDay && doneDay !== day ? `done ${dateText(doneDay)}` : null].filter(Boolean).join(" \xB7 ");
        r.charged = fromDb(l.amount);
        slot(day).money.push({ row: r, at, order: n++ });
      }
      const discount = fromDb(s.discount);
      if (discount > 0n) {
        const r = blank("discount", s.discount_kind && DISCOUNTS[s.discount_kind]?.line || "Discount");
        r.detail = no;
        r.charged = -discount;
        slot(day).money.push({ row: r, at, order: n++ });
      }
      const linesTotal = lines.reduce((t, l) => t + fromDb(l.amount), 0n);
      const other = fromDb(s.total) - (linesTotal - discount);
      if (other !== 0n) {
        const r = lines.length ? blank("other", `Other change on ${no}`) : blank("charge", `Statement ${no}`);
        if (!lines.length) r.detail = "No items listed on it";
        r.charged = other;
        slot(day).money.push({ row: r, at, order: n++ });
      }
      const share = fromDb(s.payor_share);
      if (share > 0n) {
        const r = blank("payor", `${s.payor_name ?? "HMO"}\u2019s part: ${pesos(share)}`);
        r.detail = `${no} \xB7 not owed by the patient`;
        slot(day).money.push({ row: r, at, order: n++ });
      }
    }
    for (const y of m.payments) {
      const s = y.invoice_id ? m.statements.find((s2) => s2.id === y.invoice_id) : void 0;
      const own = y.paid_on ?? dayKey(y.received_at);
      const sDay = s ? stmtDay.get(s.id) : null;
      const day = sDay && sDay > own ? sDay : own;
      payRowDay.set(y.id, day);
      const payor = PAYOR_METHODS.has(y.method);
      const r = blank("payment", payor ? `Payment from ${s?.payor_name ?? methodLabel(y.method)}` : `Payment \xB7 ${methodLabel(y.method)}`);
      r.detail = [payor ? "its part" : null, s ? stmtNo.get(s.id) : null, day !== own ? `paid ${dateText(own)}` : null].filter(Boolean).join(" \xB7 ") || null;
      r.paid = fromDb(y.amount);
      slot(day).money.push({ row: r, at: +new Date(y.received_at) + 1e12, order: n++ });
    }
  }
  const balanceAt = (day) => {
    if (!m) return 0n;
    let total = 0n;
    for (const s of m.statements) {
      if (day !== null && stmtDay.get(s.id) > day) continue;
      const pays = m.payments.filter((y) => y.invoice_id === s.id && (day === null || payRowDay.get(y.id) <= day)).map((y) => ({ amount: y.amount, method: y.method, voided_at: null }));
      const r = sumsOf(s, pays);
      total += r.balance - r.payorDue;
    }
    for (const y of m.payments) if (!y.invoice_id && (day === null || payRowDay.get(y.id) <= day)) total -= fromDb(y.amount);
    return total;
  };
  let balance = "none";
  if (m) {
    if (!m.complete) balance = "too-many";
    else if (balanceAt(null) !== onFile) {
      balance = "mismatch";
      console.warn("treatment-record balance mismatch", i.patientId);
    } else balance = "ok";
  }
  const openKeys = /* @__PURE__ */ new Set();
  const days = [...byDay.keys()].sort().map((day) => {
    const g = byDay.get(day);
    const rows = [
      ...g.clinical.sort((a, b) => a.at - b.at || a.order - b.order).map((k) => k.row),
      ...g.money.sort((a, b) => a.at - b.at || a.order - b.order).map((k) => k.row)
    ];
    const here = past.filter((v) => v.day === day && openable(v)).sort((a, b) => +a.at - +b.at);
    const open = here.map((v) => ({ key: v.key, time: v.dateOnly ? "" : timeWords(v.at) }));
    open.forEach((o) => openKeys.add(o.key));
    const last = rows[rows.length - 1];
    const moved = rows.some((r) => r.charged !== null || r.paid !== null) || !!m && m.statements.some((s) => stmtDay.get(s.id) === day);
    if (balance === "ok" && moved) last.balance = balanceAt(day);
    if (here.length) {
      const end = endOfDay(day);
      const nextVisit = visits.filter((v) => v.id && +v.at >= +end && v.bookedAt && +new Date(v.bookedAt) <= +end).sort((a, b) => +a.at - +b.at)[0];
      if (nextVisit) {
        const tail = nextVisit.status === "cancelled" ? " \xB7 cancelled" : nextVisit.status === "no_show" ? " \xB7 did not come" : "";
        last.next = { text: `${dateText(nextVisit.day)}${tail}`, visitKey: nextVisit.key };
        if (!nextVisit.future && openable(nextVisit)) openKeys.add(nextVisit.key);
      } else {
        const rc = recalls.filter((r) => r.setOn === day).sort((a, b) => a.due < b.due ? -1 : 1)[0];
        const adj = x.plans.flatMap((p) => p.adjustments).find((a) => a.on === day && a.nextOn);
        if (rc) last.next = { text: `Check-up due ${dateText(rc.due)}`, visitKey: null };
        else if (adj) last.next = { text: `Adjustment due ${dateText(adj.nextOn)}`, visitKey: null };
      }
    }
    return { day, open, rows };
  });
  const capped = c.done.length >= 300 || visits.filter((v) => v.id).length >= 300;
  return { days, count, balance, onFile, capped, openKeys };
}

// ../../../tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/ledger-test.ts
var now = Date.now();
var inHalfHour = new Date(now + 30 * 6e4);
var tenMinAgo = new Date(now - 10 * 6e4);
var visit = {
  key: "a1",
  id: "a1",
  day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(now)),
  at: inHalfHour,
  end: null,
  dateOnly: false,
  status: "in_chair",
  reason: "Toothache",
  dentist: "Dr A",
  chair: "1",
  source: "staff",
  ref: null,
  bookedBy: null,
  arrivedAt: tenMinAgo,
  seatedAt: tenMinAgo,
  asked: [],
  procs: [],
  notes: [],
  rx: [],
  letters: [],
  vitals: [],
  files: [],
  adjustments: [],
  consents: [],
  agreed: [],
  texts: [],
  money: null,
  teeth: [],
  future: true,
  bookedAt: new Date(now - 864e5)
};
var done = { id: "d1", at: tenMinAgo, name: "Extraction", fdi: 36, surface: null, note: null, dentist: "Dr A", visitId: "a1" };
visit.procs.push(done);
var led = buildLedger({ visits: [visit], clinical: { done: [done], plan: [], notes: [], rx: [], files: [], labs: [], recall: null }, extra: { plans: [], vitals: [], letters: [], loas: [] }, recalls: [], money: null, onFile: 0, patientId: "p" });
console.log(JSON.stringify({ days: led.days.length, count: led.count, openKeys: [...led.openKeys] }));
