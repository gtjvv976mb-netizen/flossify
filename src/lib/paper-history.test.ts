// The paper record's dental and medical history: the choices, the reader, sameness, the words. No database.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-register.mjs --test src/lib/paper-history.test.ts
// (the register hook lets health.ts's own imports resolve; paper-history.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPER_CONDITIONS, PROBLEMS, PAPER_FIELDS, LIST_WORDS, pickWords, canonicalWord, labelOf, readPartialDate, partialDateText, laterDate,
  readPaperHistory, paperTyped, mergePaper, paperToStored, paperFromStored, samePaper, paperChanges, paperAfterOwn, pregnancyTwin,
  paperBoxes, asksPregnancy, showsPregnancy, rebasePaper, emptyPaper, PAPER_VERSION, type PaperAnswers, type BoxesIn,
} from './paper-history.ts';
import { LISTS, readHealthForm, cleanList, changes, versionChanges, sameAnswers, answered, type HealthAnswers, type HealthVersion } from './health.ts';

const TODAY = '2026-10-03';
/** A FormData-like post from pairs (a name may repeat). */
const post = (pairs: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of pairs) f.append(k, v);
  return f;
};
const paper = (o: Partial<PaperAnswers>): PaperAnswers => ({ ...emptyPaper(), ...o });

test('the paper’s lists: 23 conditions and 12 problems, in the paper’s order and words', () => {
  assert.equal(PAPER_CONDITIONS.length, 23);
  assert.deepEqual(PAPER_CONDITIONS.slice(0, 4).map((c) => c.label), ['Anemia', 'Arthritis/rheumatism', 'Artificial heart valves', 'Artificial joints']);
  assert.equal(PAPER_CONDITIONS.at(-1)!.label, 'Ulcer');
  assert.equal(PROBLEMS.length, 12);
  assert.equal(PROBLEMS[0].label, 'Bad breath');
  assert.equal(PROBLEMS.at(-1)!.label, 'Sores or growths in the mouth');
  // Sentence case: no label in capitals beyond its first letter, but for initialisms.
  for (const w of [...PAPER_CONDITIONS.map((c) => c.label), ...PROBLEMS.map((p) => p.label), ...PAPER_FIELDS.map((f) => f.label)]) {
    assert.ok(!/^[A-Z][a-z]+ [A-Z][a-z]/.test(w), `sentence case: ${w}`);
  }
  // Every stored word is unique within its list.
  for (const [k, list] of Object.entries(LIST_WORDS)) assert.equal(new Set(list.map((w) => w.word.toLowerCase())).size, list.length, k);
});

test('the picks keep the words the record already stores, so old rows and the forms still tick them', () => {
  const c = pickWords('conditions');
  for (const w of ['Hypertension', 'Heart condition', 'Anaemia', 'Asthma', 'Diabetes', 'Hepatitis', 'HIV or AIDS', 'Tuberculosis (TB)', 'Ulcer', 'Bleeding disorder', 'Epilepsy', 'Pregnancy']) {
    assert.ok(c.includes(w), w);
  }
  assert.deepEqual(LISTS.find((l) => l.key === 'conditions')!.picks, c);
  assert.equal(c[12], 'Hypertension', 'High blood pressure is the 13th box on the paper');
  assert.deepEqual(pickWords('allergies').slice(0, 7), ['Penicillin', 'Latex', 'Metals', 'Plastic', 'Local anaesthetic', 'Foods', 'Pollen']);
});

test('canonicalWord and labelOf: the paper’s words and other spellings to the stored word, and back', () => {
  assert.equal(canonicalWord('conditions', 'high blood pressure'), 'Hypertension');
  assert.equal(canonicalWord('conditions', 'HYPERTENSION'), 'Hypertension');
  assert.equal(canonicalWord('conditions', 'Anemia'), 'Anaemia');
  assert.equal(canonicalWord('conditions', 'hiv/aids'), 'HIV or AIDS');
  assert.equal(canonicalWord('conditions', 'TB'), 'Tuberculosis (TB)');
  assert.equal(canonicalWord('conditions', 'Mango'), null);
  assert.equal(canonicalWord('allergies', 'local anesthetic'), 'Local anaesthetic');
  assert.equal(canonicalWord('medications', 'Insulin'), 'Insulin');
  assert.equal(labelOf('conditions', 'Hypertension'), 'High blood pressure');
  assert.equal(labelOf('conditions', 'Breathing problems'), 'Respiratory disease');
  assert.equal(labelOf('conditions', 'Fainting spells'), 'Fainting spells');
  assert.equal(labelOf('allergies', 'Local anaesthetic'), 'Local anaesthetic');
});

test('canonicalWord only re-spells: a broader or narrower word on file stays its own', () => {
  // Never "Anesthetic" → "Local anaesthetic", "Ulcer" → "Stomach ulcers", "HIV" → "HIV or AIDS", "Arthritis" → "Arthritis or rheumatism".
  for (const [k, w] of [['allergies', 'Anesthetic'], ['allergies', 'Anaesthetics'], ['conditions', 'HIV'], ['conditions', 'AIDS'], ['conditions', 'Stomach ulcers'], ['conditions', 'Arthritis']]) {
    assert.equal(canonicalWord(k, w), null, w);
  }
  // The paper's "Ulcer" is stored as the paper says it; a box's word is never narrower than its label.
  assert.equal(canonicalWord('conditions', 'ulcers'), 'Ulcer');
  for (const w of LIST_WORDS.conditions) assert.equal(canonicalWord('conditions', w.label), w.word, w.label);
  // The health form as drawn (HealthLists posts each chip's canonicalWord ?? word), saved untouched: the same lists, word for word.
  const onFile: HealthAnswers = { allergies: ['Anesthetic'], conditions: ['Ulcer', 'HIV', 'Stomach ulcers'], medications: null, note: null };
  const drawn = (k: string, list: string[]) => list.map((v) => [k, canonicalWord(k, v) ?? v] as [string, string]);
  const r = readHealthForm(post([...drawn('allergies', onFile.allergies!), ...drawn('conditions', onFile.conditions!)]), TODAY);
  assert.deepEqual(r.answers.allergies, ['Anesthetic']);
  assert.deepEqual(r.answers.conditions, ['Ulcer', 'HIV', 'Stomach ulcers']);
});

test('an untouched Save of older spellings is a check, not a change', () => {
  const onFile: HealthAnswers = { allergies: ['Local anesthetic'], conditions: ['High blood pressure', 'Anemia', 'Gout'], medications: null, note: null };
  const drawn = (k: string, list: string[]) => list.map((v) => [k, canonicalWord(k, v) ?? v] as [string, string]);
  const r = readHealthForm(post([...drawn('allergies', onFile.allergies!), ...drawn('conditions', onFile.conditions!)]), TODAY);
  assert.deepEqual(r.answers.conditions, ['Hypertension', 'Anaemia', 'Gout']);
  assert.ok(sameAnswers(onFile, r.answers));
  assert.deepEqual(changes(onFile, r.answers), []);
  // A real change is still named once, in the paper's words.
  assert.deepEqual(changes(onFile, { ...r.answers, conditions: ['Hypertension', 'Asthma'] }), ['Conditions: added Asthma; removed Anemia, Gout']);
});

test('answered: a version with only the paper’s answers is answered (saveHealth’s rule)', () => {
  const none = { allergies: null, conditions: null, medications: null, note: null };
  assert.equal(answered(none), false);
  assert.equal(answered({ ...none, paper: null }), false);
  assert.equal(answered({ ...none, paper: paper({ physician_name: 'Dr. Jose Rizal' }) }), true);
  assert.equal(answered({ ...none, allergies: [] }), true);
});

test('cleanList with the table: one word per condition, however it was typed', () => {
  const canon = (v: string) => canonicalWord('conditions', v);
  assert.deepEqual(cleanList(['Hypertension', 'high blood pressure', 'anemia', 'gout'], pickWords('conditions'), canon), ['Hypertension', 'Anaemia', 'Gout']);
  // Without the table (the patient forms), nothing changes.
  assert.deepEqual(cleanList(['high blood pressure'], pickWords('conditions')), ['High blood pressure']);
});

test('readPartialDate: a year, a month, a day; never after today, not before 1900', () => {
  const ok = (s: string) => { const r = readPartialDate(s, TODAY); return 'ok' in r ? r.ok : r.bad; };
  assert.equal(ok('2024'), '2024');
  assert.equal(ok('Mar 2024'), '2024-03');
  assert.equal(ok('march, 2024'), '2024-03');
  assert.equal(ok('Sept 2025'), '2025-09');
  assert.equal(ok('03/2024'), '2024-03');
  assert.equal(ok('3-2024'), '2024-03');
  assert.equal(ok('12 Mar 2024'), '2024-03-12');
  assert.equal(ok('Mar 12, 2024'), '2024-03-12');
  assert.equal(ok('2024-03-12'), '2024-03-12');
  assert.equal(ok('2024-3-5'), '2024-03-05');
  assert.equal(ok('2026-10-03'), '2026-10-03');
  assert.equal(ok('Oct 2026'), '2026-10');
  assert.equal(ok('2026'), '2026');
  assert.equal(ok('2026-10-04'), 'future');
  assert.equal(ok('Nov 2026'), 'future');
  assert.equal(ok('2027'), 'future');
  assert.equal(ok('1899'), 'old');
  assert.equal(ok('03/12/2024'), 'form', 'a day in numbers alone reads two ways');
  assert.equal(ok('31 Feb 2024'), 'form');
  assert.equal(ok('Smarch 2024'), 'form');
  assert.equal(ok('13/2024'), 'form');
  assert.equal(ok('last year'), 'form');
  assert.equal(partialDateText('2024'), '2024');
  assert.equal(partialDateText('2024-03'), 'Mar 2024');
  assert.equal(partialDateText('2024-03-05'), '5 Mar 2024');
  assert.equal(partialDateText('2024-13'), null);
  assert.equal(partialDateText('soon'), null);
  assert.equal(laterDate('2024', '2025-03-12'), '2025-03-12');
  assert.equal(laterDate('2025-04', '2025-03-12'), '2025-04');
  assert.equal(laterDate('2025', '2025-03-12'), '2025-03-12');
  assert.equal(laterDate(null, '2025'), '2025');
});

test('readPaperHistory: an older form carries nothing, so the saved answers stay', () => {
  const r = readPaperHistory(post([['allergies', 'Latex']]), TODAY);
  assert.equal(r.paper, undefined);
  assert.deepEqual(r.problems, []);
});

test('readPaperHistory: every field read, capped, and refused in words', () => {
  const r = readPaperHistory(post([
    ['has_paper', '1'], ['has_paper_pregnancy', '1'],
    ['ph_dentist_name', '  Dr.  Reyes '], ['ph_dentist_place', 'Baguio'], ['ph_dentist_phone', '(074) 442 1234'],
    ['ph_last_care', 'Mar 2024'], ['ph_last_xray', '2023'], ['ph_flossing', 'weekly'], ['ph_brushing', 'twice'],
    ['ph_problems', 'sens_cold'], ['ph_problems', 'bad_breath'], ['ph_problems', 'forged'],
    ['ph_physician_name', 'Dr. Cruz'], ['ph_physician_visit', '12 Aug 2026'],
    ['ph_transfusion', 'yes'], ['ph_transfusion_when', '2010'],
    ['ph_pregnant', 'no'], ['ph_nursing', ''], ['ph_pill', 'maybe'],
    ['ph_illnesses', 'Appendectomy 2015'],
  ]), TODAY);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.paper, {
    dentist_name: 'Dr. Reyes', dentist_place: 'Baguio', dentist_phone: '(074) 442 1234', last_care: '2024-03', last_xray: '2023',
    flossing: 'weekly', brushing: 'twice', problems: ['bad_breath', 'sens_cold'],
    physician_name: 'Dr. Cruz', physician_place: null, physician_visit: '2026-08-12', transfusion: 'yes', transfusion_when: '2010',
    pregnant: 'no', nursing: null, pill: null, illnesses: 'Appendectomy 2015',
  });
  // What was typed comes back as typed, to draw the form again.
  assert.equal(r.typed.ph_last_care, 'Mar 2024');
  assert.deepEqual(r.typed.ph_problems, ['bad_breath', 'sens_cold']);

  const bad = readPaperHistory(post([
    ['has_paper', '1'], ['ph_dentist_name', 'x'.repeat(121)], ['ph_last_xray', 'next week'], ['ph_physician_visit', '2027'],
    ['ph_dentist_phone', '12345'], ['ph_problems', 'grinding'], ['ph_problems_none', '1'], ['ph_pregnant', 'yes'],
  ]), TODAY);
  assert.equal(bad.problems.length, 5, bad.problems.join(' | '));
  assert.ok(bad.problems.some((p) => p.startsWith('Former dentist: keep it under 120 characters')));
  assert.ok(bad.problems.some((p) => p.startsWith('Last dental X-ray: write a year (2024)')));
  assert.ok(bad.problems.some((p) => p.startsWith('Last visit to the physician: that is after today')));
  assert.ok(bad.problems.some((p) => p.startsWith('Former dentist’s contact number:')));
  assert.ok(bad.problems.some((p) => p.includes('“None of these” is ticked, and so is Grinding teeth')));
  // The pregnancy questions were not drawn: they are not read, so the saved ones stay.
  assert.equal(bad.paper!.pregnant, undefined);
  // A transfusion date stands only beside a Yes.
  const no = readPaperHistory(post([['has_paper', '1'], ['ph_transfusion', 'no'], ['ph_transfusion_when', '2010']]), TODAY);
  assert.equal(no.paper!.transfusion_when, null);
  // None of these is an answer: [].
  const none = readPaperHistory(post([['has_paper', '1'], ['ph_problems_none', '1']]), TODAY);
  assert.deepEqual(none.paper!.problems, []);
});

test('mergePaper, stored and read back: a key the form did not carry stays; nothing answered is no paper', () => {
  const saved = paper({ pregnant: 'yes', last_care: '2024', problems: ['grinding'] });
  assert.equal(mergePaper(saved, undefined), saved);
  const m = mergePaper(saved, { ...emptyPaper(), pregnant: undefined, last_care: null, problems: [] } as never)!;
  assert.equal(m.pregnant, 'yes');
  assert.equal(m.last_care, null);
  assert.deepEqual(m.problems, []);
  assert.equal(mergePaper(null, { ...emptyPaper() }), null);
  const stored = paperToStored(m)!;
  assert.deepEqual(stored, { v: PAPER_VERSION, problems: [], pregnant: 'yes' });
  assert.ok(samePaper(paperFromStored(JSON.parse(JSON.stringify(stored))), m));
  assert.equal(paperToStored(null), null);
  assert.equal(paperFromStored(null), null);
  assert.equal(paperFromStored({ v: PAPER_VERSION }), null);
  // Anything outside the paper's shape is no answer.
  const odd = paperFromStored({ v: 'x', pregnant: 'perhaps', last_care: 'last year', problems: ['grinding', 'nope'], flossing: 'daily', dentist_name: 7 })!;
  assert.deepEqual([odd.pregnant, odd.last_care, odd.problems, odd.flossing, odd.dentist_name], [null, null, ['grinding'], 'daily', null]);
  // The form's fields hold the answers on file as a person reads them.
  const t = paperTyped(paper({ last_care: '2024-03', problems: [], transfusion: 'no' }));
  assert.deepEqual([t.ph_last_care, t.ph_problems, t.ph_problems_none, t.ph_transfusion, t.ph_dentist_name], ['Mar 2024', [], '1', 'no', '']);
});

test('samePaper and paperChanges: what Earlier versions says', () => {
  const a = paper({ problems: ['grinding', 'sores'], brushing: 'once', illnesses: 'Asthma attack 2019' });
  assert.ok(samePaper(a, paper({ problems: ['sores', 'grinding'], brushing: 'once', illnesses: 'Asthma attack 2019' })));
  assert.ok(samePaper(null, null));
  assert.ok(!samePaper(null, a));
  const b = paper({ problems: ['sores', 'bad_breath'], brushing: 'twice', last_xray: '2025-02', illnesses: 'Asthma attack 2019, appendix out' });
  assert.deepEqual(paperChanges(a, b), [
    'Last dental X-ray: Feb 2025', 'Brushing: Twice a day or more', 'Dental problems: added Bad breath; removed Grinding teeth',
    'Other serious illnesses or operations changed',
  ]);
  assert.deepEqual(paperChanges(b, paper({ problems: [] })).slice(0, 3), ['Last dental X-ray: answer cleared', 'Brushing: answer cleared', 'Dental problems: none of these']);
  assert.deepEqual(paperChanges(a, a), []);
});

test('paperAfterOwn: the patient’s newer answer to the same question replaces the desk’s', () => {
  const desk = paper({ pregnant: 'no', nursing: 'no', pill: 'no', last_care: '2023', dentist_name: 'Dr. Reyes', dentist_place: 'Baguio', brushing: 'twice' });
  const after = paperAfterOwn(desk, { pregnant: 'yes', nursing: null, birth_control: 'no' }, { last_visit: 'lt6m', previous_dentist: 'Smile Clinic' })!;
  assert.deepEqual([after.pregnant, after.nursing, after.pill, after.last_care, after.dentist_name, after.dentist_place, after.brushing],
    [null, 'no', null, null, null, null, 'twice']);
  // The same dentist named again keeps the desk's location and number.
  const same = paperAfterOwn(desk, null, { previous_dentist: 'dr. reyes' })!;
  assert.equal(same.dentist_place, 'Baguio');
  // The same dentist in another spelling keeps them too.
  assert.equal(paperAfterOwn(desk, null, { previous_dentist: 'Dr Reyes' })!.dentist_place, 'Baguio');
  // A location and number the desk wrote with no name stay beside the forms' name.
  const noName = paperAfterOwn(paper({ dentist_place: 'Baguio', dentist_phone: '0917 555 0101' }), null, { previous_dentist: 'Dr. Cruz' })!;
  assert.deepEqual([noName.dentist_name, noName.dentist_place, noName.dentist_phone], [null, 'Baguio', '0917 555 0101']);
  assert.equal(paperAfterOwn(null, { pregnant: 'yes' }, null), null);
  assert.equal(paperAfterOwn(paper({ pregnant: 'no' }), { pregnant: 'unsure' }, null), null);
});

test('pregnancyTwin: a Yes puts Pregnancy on the conditions list, a No takes it off, no answer leaves it', () => {
  assert.deepEqual(pregnancyTwin(null, 'yes'), ['Pregnancy']);
  assert.deepEqual(pregnancyTwin(['Asthma'], 'yes'), ['Asthma', 'Pregnancy']);
  assert.deepEqual(pregnancyTwin(['Asthma', 'pregnancy'], 'yes'), ['Asthma', 'pregnancy']);
  assert.deepEqual(pregnancyTwin(['Asthma', 'Pregnancy'], 'no'), ['Asthma']);
  assert.deepEqual(pregnancyTwin(['Pregnancy'], 'no'), []);
  assert.deepEqual(pregnancyTwin(null, 'no'), null);
  assert.deepEqual(pregnancyTwin(['Pregnancy'], null), ['Pregnancy']);
  assert.ok(asksPregnancy('female', 30) && asksPregnancy(null, null) && asksPregnancy('female', 12));
  assert.ok(!asksPregnancy('male', 30) && !asksPregnancy('female', 11));
});

const ownText = (name: string, v: unknown) => ({ last_visit: { m6to12: '6 to 12 months ago' }, pregnant: { yes: 'Yes', no: 'No', unsure: 'Not sure' } } as Record<string, Record<string, string>>)[name]?.[String(v)]
  ?? (Array.isArray(v) ? v.join(', ') : String(v));
const boxesIn = (o: Partial<BoxesIn>): BoxesIn => ({ latest: null, own: null, ownText, reason: null, visitToday: false, ask: true, ...o });
const byKey = (b: { key: string }[], k: string) => b.find((x) => x.key === k)!;

test('paperBoxes: the paper’s order, the desk’s answers, ticks in the paper’s words', () => {
  const latest = {
    allergies: ['Penicillin'], conditions: ['Hypertension', 'Asthma', 'Epilepsy', 'Pregnancy'], medications: [], note: null,
    paper: paper({ problems: ['sens_cold', 'bad_breath'], last_xray: '2024', brushing: 'twice', transfusion: 'yes', transfusion_when: '2010', pregnant: 'yes' }),
  };
  const { dental, medical } = paperBoxes(boxesIn({ latest, reason: 'Cleaning', visitToday: true, xrayHere: '2025-06-01' }));
  assert.deepEqual(dental.map((b) => b.key), ['reason', 'dentist_name', 'dentist_place', 'dentist_phone', 'last_care', 'last_xray', 'flossing', 'brushing', 'problems']);
  assert.deepEqual(medical.map((b) => b.key), ['physician_name', 'physician_place', 'physician_visit', 'transfusion', 'pregnant', 'nursing', 'pill', 'conditions', 'illnesses', 'medications', 'allergies', 'note']);
  // Each row of the paper fills the four columns.
  for (const list of [dental, medical]) assert.equal(list.reduce((n, b) => n + b.span, 0) % 4, 0);
  assert.equal(byKey(dental, 'reason').text, 'Cleaning');
  assert.equal(byKey(dental, 'last_xray').text, '1 Jun 2025, here', 'an X-ray taken here later than the one on the paper');
  assert.deepEqual(byKey(dental, 'problems').ticks, ['Bad breath', 'Sensitivity to cold']);
  assert.equal(byKey(dental, 'brushing').text, 'Twice a day or more');
  assert.equal(byKey(medical, 'transfusion').text, 'Yes, about 2010');
  assert.equal(byKey(medical, 'pregnant').text, 'Yes');
  const c = byKey(medical, 'conditions');
  assert.deepEqual(c.ticks, ['Asthma', 'High blood pressure']);
  assert.deepEqual(c.also, ['Epilepsy'], 'Pregnancy is the Pregnant box’s Yes');
  assert.equal(byKey(medical, 'allergies').alert, true);
  assert.equal(byKey(medical, 'allergies').edit, 'Add to allergies');
  assert.equal(byKey(medical, 'allergies').field, 'allergies_add');
  assert.equal(byKey(medical, 'medications').text, 'None');
  assert.equal(byKey(medical, 'note').text, null);
  assert.equal(byKey(dental, 'dentist_name').edit, 'Add the former dentist’s name');
  assert.equal(byKey(dental, 'dentist_name').field, 'ph_dentist_name');
  assert.equal(byKey(dental, 'reason').field, null);
});

test('paperBoxes: where the desk has nothing, the patient forms’ own words, marked as theirs', () => {
  const own = {
    health: { under_treatment: 'yes', treatment_detail: 'thyroid', pregnant: 'unsure', nursing: 'no', birth_control: null, illness_detail: 'Dengue 2019', hospitalised: 'yes', hospital_detail: 'Dengue' },
    healthAt: '2026-09-26T02:00:00Z',
    teeth: { reason: 'Toothache', concerns: ['Sensitive to hot, cold or sweet'], last_visit: 'm6to12', previous_dentist: 'Smile Clinic' },
    teethAt: '2026-09-26T02:00:00Z',
  };
  const latest = { allergies: null, conditions: ['Pregnancy'], medications: null, note: null, paper: null };
  const { dental, medical } = paperBoxes(boxesIn({ latest, own }));
  assert.equal(byKey(dental, 'reason').text, 'Toothache');
  assert.equal(byKey(dental, 'reason').from?.what, 'form');
  assert.equal(byKey(dental, 'last_care').text, '6 to 12 months ago');
  assert.equal(byKey(dental, 'dentist_name').text, 'Smile Clinic');
  assert.equal(byKey(dental, 'dentist_name').edit, 'Add the former dentist’s name', 'the desk has none');
  // A merged tick is never spread over the paper's boxes: the form's own words.
  assert.equal(byKey(dental, 'problems').text, 'Sensitive to hot, cold or sweet');
  assert.equal(byKey(dental, 'problems').ticks, undefined);
  assert.equal(byKey(medical, 'physician_name').text, 'Under a doctor’s care now, for thyroid');
  assert.equal(byKey(medical, 'pregnant').text, 'Not sure');
  // Beside a "Not sure", Pregnancy stays on the list, so both are seen.
  assert.deepEqual(byKey(medical, 'conditions').also, ['Pregnancy']);
  assert.equal(byKey(medical, 'illnesses').text, 'Dengue 2019; In hospital: Dengue');
  assert.equal(byKey(medical, 'allergies').empty, 'Not asked yet');
  assert.equal(byKey(medical, 'allergies').text, null);
  // No visit today and nothing from the forms.
  assert.equal(byKey(paperBoxes(boxesIn({})).dental, 'reason').empty, 'No visit today');
});

test('paperBoxes: the pregnancy questions only where they apply, unless answered', () => {
  const male = paperBoxes(boxesIn({ ask: false, latest: { allergies: [], conditions: [], medications: [], note: null, paper: null } })).medical;
  assert.ok(!male.some((b) => b.key === 'pregnant'));
  assert.equal(byKey(male, 'transfusion').span, 4);
  assert.equal(byKey(male, 'conditions').text, 'None');
  assert.equal(byKey(male, 'allergies').text, 'None known');
  const answered = paperBoxes(boxesIn({ ask: false, latest: { allergies: null, conditions: ['Pregnancy'], medications: null, note: null, paper: null } })).medical;
  assert.equal(byKey(answered, 'pregnant').text, 'Yes');
  // Pregnancy alone on the list stays on it, so the box never says None for a list nobody asked beyond it.
  assert.deepEqual(byKey(answered, 'conditions').also, ['Pregnancy']);
});

test('showsPregnancy: one rule for the boxes and the health form, so an answer on file can always be changed', () => {
  const none = { conditions: ['Asthma'], paper: null };
  assert.equal(showsPregnancy(true, null, null), true);
  assert.equal(showsPregnancy(false, none, null), false);
  assert.equal(showsPregnancy(false, { conditions: null, paper: paper({ nursing: 'no' }) }, null), true, 'a saved answer');
  assert.equal(showsPregnancy(false, { conditions: ['pregnancy'], paper: null }, null), true, 'the list');
  assert.equal(showsPregnancy(false, none, { birth_control: 'yes' }), true, 'the patient’s own words');
  assert.equal(showsPregnancy(false, none, { pregnant: '' }), false);
  // The boxes follow it: a male patient with a saved answer has all three, each with its field on the form.
  const male = paperBoxes(boxesIn({ ask: false, latest: { allergies: null, conditions: null, medications: null, note: null, paper: paper({ pregnant: 'yes' }) } })).medical;
  assert.deepEqual(male.filter((b) => ['pregnant', 'nursing', 'pill'].includes(b.key)).map((b) => b.field), ['ph_pregnant', 'ph_nursing', 'ph_pill']);
});

test('paperBoxes: the patient’s own words name the forms they came from', () => {
  const own = { health: { pregnant: 'no' }, healthAt: '2026-10-01T02:00:00Z', healthFrom: { kind: 'intake' as const, ref: 'IN-PRB7' }, teeth: { reason: 'Toothache' }, teethAt: '2026-09-26T02:00:00Z', teethFrom: { kind: 'form' as const, ref: 'QR-7K2F' } };
  const { dental, medical } = paperBoxes(boxesIn({ own }));
  assert.deepEqual(byKey(medical, 'pregnant').from, { what: 'intake', ref: 'IN-PRB7', at: '2026-10-01T02:00:00Z' });
  assert.deepEqual(byKey(dental, 'reason').from, { what: 'form', ref: 'QR-7K2F', at: '2026-09-26T02:00:00Z' });
});

test('rebasePaper: after a conflict, what is on file now, with only this person’s own changes kept', () => {
  const base = paper({ flossing: 'daily' });
  const latest = paper({ flossing: 'daily', physician_name: 'Dr. Santos', pregnant: 'yes' });
  // This person changed Brushing on a form drawn from `base` (no pregnancy questions on it).
  const mine = readPaperHistory(post([['has_paper', '1'], ['ph_flossing', 'daily'], ['ph_brushing', 'twice']]), TODAY);
  const re = rebasePaper(mine.typed, mine.paper, base, latest);
  assert.equal(re.typed.ph_brushing, 'twice');
  assert.equal(re.typed.ph_physician_name, 'Dr. Santos', 'the colleague’s answer stays');
  assert.equal(re.typed.ph_pregnant, 'yes');
  assert.deepEqual(re.clash, []);
  // Saved again from the form as drawn: the colleague's answer and this person's both stand.
  const again = readPaperHistory(post([['has_paper', '1'], ['has_paper_pregnancy', '1'], ...Object.entries(re.typed).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]]))]), TODAY);
  const saved = mergePaper(latest, again.paper)!;
  assert.deepEqual([saved.physician_name, saved.brushing, saved.flossing, saved.pregnant], ['Dr. Santos', 'twice', 'daily', 'yes']);
  // Both changed the same question to different answers: this person's stays in the form, and the callout names the other.
  const both = readPaperHistory(post([['has_paper', '1'], ['ph_flossing', 'daily'], ['ph_physician_name', 'Dr. Cruz']]), TODAY);
  const r2 = rebasePaper(both.typed, both.paper, base, latest);
  assert.equal(r2.typed.ph_physician_name, 'Dr. Cruz');
  assert.deepEqual(r2.clash, ['physician_name']);
  // An older form (no paper fields): everything as on file now.
  assert.deepEqual(rebasePaper({}, undefined, base, latest).typed, paperTyped(latest));
});

test('readHealthForm: the desk’s typing read through the table, and the paper read beside it', () => {
  const r = readHealthForm(post([
    ['conditions', 'Hypertension'], ['conditions_add', 'high blood pressure, anemia'], ['allergies_none', '1'],
    ['has_paper', '1'], ['ph_last_care', '2025'],
  ]), TODAY);
  assert.deepEqual(r.answers.conditions, ['Hypertension', 'Anaemia']);
  assert.deepEqual(r.answers.allergies, []);
  assert.equal(r.paper!.last_care, '2025');
  assert.deepEqual(r.problems, []);
  // An older form: no paper.
  assert.equal(readHealthForm(post([['conditions', 'Asthma']]), TODAY).paper, undefined);
  // Every paper box can be ticked.
  const all = readHealthForm(post(PAPER_CONDITIONS.map((c) => ['conditions', c.word] as [string, string])), TODAY);
  assert.deepEqual(all.problems, []);
  assert.equal(all.answers.conditions!.length, 23);
});

test('Earlier versions: conditions in the paper’s words, then the paper’s answers', () => {
  assert.deepEqual(changes({ allergies: null, conditions: ['Asthma'], medications: null, note: null }, { allergies: null, conditions: ['Asthma', 'Hypertension'], medications: null, note: null }),
    ['Conditions: added High blood pressure']);
  const v = (o: Partial<HealthVersion>): HealthVersion => ({
    id: 'x', at: new Date(), by: null, answeredBy: 'staff', formRef: null, intakeRef: null, formSentAt: null, birthChange: null,
    allergies: null, conditions: null, medications: null, note: null, paper: null, ...o,
  });
  assert.deepEqual(versionChanges(v({}), v({ paper: paper({ flossing: 'never' }) })), ['Flossing: Never']);
  assert.deepEqual(versionChanges(null, v({ paper: paper({ flossing: 'never' }) })), []);
});
