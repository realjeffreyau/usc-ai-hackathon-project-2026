import test from 'node:test';
import assert from 'node:assert/strict';
import { sample } from '../dist/sample.js';
import { courses } from '../dist/catalog.js';
import { conflictsFor, graduationOutlook, meets, parseCourseBin, planSemester } from '../dist/planner.js';
import * as L from '../dist/logic.js';

const GOAL = 'Prioritize prerequisites, stay under 16 units, and avoid classes before 10 am';
const demoPlan = () => {
  const goal = L.readGoal(GOAL);
  const chosen = planSemester(new Set(sample.completed), new Set(sample.suggested), goal.prefs);
  return { goal, plan: chosen.map(o => ({ course: o.course, index: o.index })) };
};

test('goal: demo sentence is understood, "under 16" is strict', () => {
  const { prefs, strictLimit } = L.readGoal(GOAL);
  assert.equal(prefs.units, 15);
  assert.equal(strictLimit, 16);
  assert.equal(prefs.morning, 600);
  assert.equal(prefs.sequence, true);
  assert.deepEqual(L.describeGoal(L.readGoal(GOAL)), ['Under 16 units (at most 15)', 'No classes before 10:00 AM', 'Prioritize courses that unlock later requirements']);
});

test('goal: blank and unrecognized text fall back to defaults and say so', () => {
  assert.equal(L.readGoal('').prefs.understood, false);
  assert.equal(L.readGoal('xyzzy plugh').prefs.understood, false);
  assert.equal(L.readGoal('no classes after 3pm').prefs.latest, 900);
  assert.equal(L.readGoal('at most 12 units').prefs.units, 12);
});

test('plan: respects units, time preference, prerequisites, corequisites and has no conflicts', () => {
  const { goal, plan } = demoPlan();
  const items = L.itemsOf(plan);
  assert.ok(items.length >= 3);
  assert.ok(items.reduce((s, i) => s + i.course.units, 0) <= goal.prefs.units);
  const completed = new Set(sample.completed);
  const ids = new Set(items.map(i => i.course.id));
  for (const item of items) {
    assert.ok(meets(item.course.prereq, completed), item.course.id + ' prereq');
    assert.ok(meets(item.course.coreq, new Set([...completed, ...ids])), item.course.id + ' coreq');
  }
  assert.equal(conflictsFor(items).length, 0);
  // Time preferences are soft: the report must say honestly whether they were met.
  const rows = L.preferenceReport(goal, items);
  const early = items.flatMap(i => i.sections.flatMap(s => s.meetings.filter(m => m.start < 600)));
  const morning = rows.find(row => /before 10:00 AM/.test(row.text));
  assert.equal(morning.level, early.length ? 'missed' : 'met');
  assert.equal(rows.find(row => /Unit limit/.test(row.text)).level, 'met');
  assert.equal(rows.find(row => /Prerequisites prioritized/.test(row.text)).level, 'met');
});

test('plan: unconfirmed credit is never used (prereqs blocked)', () => {
  const chosen = planSemester(new Set(), new Set(sample.suggested), L.readGoal('').prefs);
  assert.ok(!chosen.some(o => o.course.id === 'MATH-245'));
  assert.ok(!chosen.some(o => o.course.id === 'BME-210'), 'coreq MATH-245 unavailable');
});

test('swap: some alternate section option creates a deterministic conflict', () => {
  const { plan } = demoPlan();
  const items = L.itemsOf(plan);
  let found = null;
  items.forEach((item, position) => item.course.bundles.forEach((bundle, index) => {
    if (found || index === item.index) return;
    const swapped = items.map((it, i) => (i === position ? { course: it.course, sections: bundle } : it));
    if (L.listConflicts(swapped).length) found = { course: item.course.id, index };
  }));
  assert.ok(found, 'a conflicting swap exists in the demo');
});

test('validation: missing prerequisite and corequisite are reported as problems', () => {
  const math = courses.find(c => c.id === 'MATH-245'), bme = courses.find(c => c.id === 'BME-210');
  assert.equal(L.checkCourse({ course: math, sections: math.bundles[0] }, new Set(), new Set()).find(c => c.level === 'error').text.startsWith('Prerequisite not confirmed'), true);
  const co = L.checkCourse({ course: bme, sections: bme.bundles[0] }, new Set(), new Set());
  assert.ok(co.some(c => c.level === 'error' && /Corequisite missing: MATH 245/.test(c.text)));
  assert.ok(L.checkCourse({ course: bme, sections: bme.bundles[0] }, new Set(), new Set(['MATH-245'])).every(c => c.level !== 'error'));
});

test('myCourseBin: known, unknown, bad format, incomplete bundle', () => {
  const parsed = parseCourseBin('29200D, 29212R 99999 39605');
  assert.deepEqual(parsed.unknown, ['99999']);
  assert.equal(parsed.existing.length, 2);
  assert.throws(() => parseCourseBin('29200 hello'), /five-digit/);
  const bme = parseCourseBin('29200').existing[0];
  assert.equal(L.bundleStatus(bme.course, bme.sections).level, 'warn');
  const full = parseCourseBin('29200 29212').existing[0];
  assert.equal(L.bundleStatus(full.course, full.sections).level, 'ok');
  const mixed = parseCourseBin('39601 39606').existing[0];
  assert.equal(L.bundleStatus(mixed.course, mixed.sections).level, 'error');
});

test('myCourseBin: sections overlapping the proposed plan are flagged', () => {
  const { plan } = demoPlan();
  const items = L.itemsOf(plan);
  // Find a catalog section from a course not in the plan that overlaps a planned meeting.
  const planned = new Set(items.map(i => i.course.id));
  const hit = courses.filter(c => !planned.has(c.id)).flatMap(c => c.bundles.flat()).find(s => L.binReport(parseCourseBin(s.id), items).conflicts.length);
  assert.ok(hit, 'at least one non-plan section overlaps');
  const report = L.binReport(parseCourseBin(hit.id), items);
  assert.match(L.describeConflict(report.conflicts[0]), /overlaps/);
});

test('calendar layout puts overlapping events side by side', () => {
  const events = L.layoutColumns([{ start: 600, end: 650 }, { start: 620, end: 700 }, { start: 800, end: 850 }]);
  assert.deepEqual(events.map(e => [e.col, e.cols]), [[0, 2], [1, 2], [0, 1]]);
});

test('unit summary: separate fields, missing fields, derived remaining and mismatches', () => {
  assert.deepEqual(L.unitSummary(sample).notes, []);
  const missing = L.unitSummary({ total: 128, earned: 60 });
  assert.equal(missing.remaining, 68);
  assert.equal(missing.derived, true);
  assert.ok(missing.notes.some(n => /not reported/.test(n)));
  assert.ok(L.unitSummary({}).notes.length >= 3);
  assert.ok(L.unitSummary({ total: 128, earned: 60, progress: 10, remaining: 50 }).notes.some(n => /differs/.test(n)));
});

test('graduation outlook is units based', () => {
  assert.deepEqual(graduationOutlook(52, 16), { term: 'Fall 2028', semesters: 4 });
  assert.equal(graduationOutlook(0, 16).term, null);
  assert.equal(graduationOutlook(NaN, 16), null);
});

test('professor and seat helpers', () => {
  assert.equal(L.rmpUrl("David D'Argenio"), 'https://www.ratemyprofessors.com/search/professors/1381?q=David%20D\'Argenio');
  assert.match(L.seatText({ seats: 7 }), /snapshot/);
  assert.match(L.seatText({ seats: 0 }), /snapshot/);
  assert.match(L.seatText({ seats: null }), /snapshot/);
});

// ---- Requirement-driven planning (extension) ----
const doneSet = new Set(sample.completed);
const noPrefs = { units: 16, morning: 0, latest: null, sequence: false };
const sampleBin = () => parseCourseBin('29202').existing;

test('planTargets prefers courses named by remaining requirements', () => {
  assert.deepEqual([...L.planTargets(sample)].sort(), ['BME-210', 'EE-202', 'HBIO-301', 'MATH-245']);
  assert.ok(L.planTargets({ requirements: [], suggested: ['EE-109', 'XXX-999'] }).has('EE-109'));
});

test('requirementCourses reads codes from the requirement rows', () => {
  const math = sample.requirements.find(r => r.title === 'Engineering math');
  assert.deepEqual(L.requirementCourses(math, sample), { ids: ['MATH-245'], source: 'named' });
  const core = sample.requirements.find(r => r.title === 'Biomedical engineering core');
  assert.deepEqual(L.requirementCourses(core, sample).ids, ['BME-210', 'EE-202']);
  const writing = sample.requirements.find(r => r.title === 'Writing');
  assert.equal(L.requirementCourses(writing, sample).source, 'none');
  const vague = { title: 'Technical electives', status: 'remaining', children: [] };
  assert.equal(L.requirementCourses(vague, sample).source, 'suggested');
  assert.deepEqual(L.courseRequirements('EE-202', sample), ['Biomedical engineering core']);
});

test('planForFocus puts the requirement first and adds the corequisite it needs', () => {
  const { plan } = L.planForFocus({ completed: doneSet, focusIds: ['BME-210'], targets: L.planTargets(sample), prefs: noPrefs });
  const roles = Object.fromEntries(plan.map(p => [p.course.id, p.role]));
  assert.equal(roles['BME-210'], 'focus');
  assert.equal(roles['MATH-245'], 'support');
  assert.ok(L.itemsOf(plan).reduce((s, i) => s + i.course.units, 0) <= 16);
  assert.equal(L.listConflicts(L.itemsOf(plan)).length, 0);
});

test('avoid-morning firmly removes optional courses that start too early', () => {
  const { plan, excluded } = L.planForFocus({ completed: doneSet, focusIds: ['MATH-245'], targets: L.planTargets(sample), prefs: { ...noPrefs, morning: 600 } });
  const fill = L.itemsOf(plan.filter(p => p.role === 'fill'));
  assert.ok(fill.every(i => i.sections.every(s => s.meetings.every(m => m.start >= 600))));
  assert.ok(excluded.includes('HBIO-301'), 'HBIO 301 has only 9 AM lectures');
  assert.ok(plan.some(p => p.role === 'fill'), 'other requirement courses still fill the plan');
});

test('plan responds to preferences', () => {
  const plan = prefs => L.planForFocus({ completed: doneSet, focusIds: ['MATH-245'], targets: L.planTargets(sample), prefs }).plan;
  const light = L.itemsOf(plan({ ...noPrefs, units: 12 }));
  assert.ok(light.reduce((s, i) => s + i.course.units, 0) <= 12);
  const full = L.itemsOf(plan({ ...noPrefs, units: 18 }));
  assert.ok(full.reduce((s, i) => s + i.course.units, 0) > light.reduce((s, i) => s + i.course.units, 0));
});

test('demo conflict: sample bin overlaps the default MATH 245 section and has a valid swap', () => {
  for (const prefs of [noPrefs, { ...noPrefs, morning: 600 }, { units: 15, morning: 600, latest: null, sequence: true }]) {
    const items = L.itemsOf(L.planForFocus({ completed: doneSet, focusIds: ['MATH-245'], targets: L.planTargets(sample), prefs }).plan);
    const report = L.binReport({ existing: sampleBin(), unknown: [] }, items);
    assert.ok(report.conflicts.length >= 1, 'conflict present');
    const position = items.findIndex(i => i.course.id === 'MATH-245');
    const options = L.swapOptions(items, position, sampleBin(), prefs);
    const best = L.bestSwap(options, items[position].index);
    assert.ok(best, 'valid alternative exists');
    items[position] = { ...items[position], index: best.index, sections: best.bundle };
    assert.equal(L.binReport({ existing: sampleBin(), unknown: [] }, items).conflicts.length, 0, 'swap clears the conflict');
  }
});

test('swap prefers an option that respects the morning preference', () => {
  const items = L.itemsOf(L.planForFocus({ completed: doneSet, focusIds: ['MATH-245'], targets: L.planTargets(sample), prefs: { ...noPrefs, morning: 600 } }).plan);
  const position = items.findIndex(i => i.course.id === 'MATH-245');
  const best = L.bestSwap(L.swapOptions(items, position, sampleBin(), { ...noPrefs, morning: 600 }), items[position].index);
  assert.equal(best.early, 0);
});

test('section numbers are unique and ordered; graduation projection counts the planned term', () => {
  const items = L.itemsOf(L.planForFocus({ completed: doneSet, focusIds: ['MATH-245'], targets: L.planTargets(sample), prefs: noPrefs }).plan);
  const ids = L.sectionNumbers(items);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^\d{5}$/.test(id)));
  assert.deepEqual(L.projectGraduation(52, 16, 16), { term: 'Fall 2028', extraSemesters: 3, restUnits: 36 });
  assert.equal(L.projectGraduation(14, 16, 16).term, 'Spring 2027');
  assert.equal(L.projectGraduation(NaN, 16, 16), null);
});

// ---- Roadmap ----
import { DEMO_PROFILE, demoBin, demoRating } from '../extension/src/fixtures.js';

test('demo roadmap fixture matches the sample audit totals', () => {
  const sum = t => t.boxes.reduce((n, b) => n + b.units, 0);
  const done = DEMO_PROFILE.roadmap.filter(t => t.status === 'done').reduce((n, t) => n + sum(t), 0);
  const now = DEMO_PROFILE.roadmap.filter(t => t.status === 'now').reduce((n, t) => n + sum(t), 0);
  assert.equal(done, sample.earned);
  assert.equal(now, sample.progress);
});

test('roadmap: four years, planned courses in Spring 2027, later terms fill remaining units', () => {
  const { plan } = L.planForFocus({ completed: doneSet, focusIds: ['MATH-245'], targets: L.planTargets(sample), prefs: noPrefs });
  const planned = L.itemsOf(plan);
  const groups = L.buildRoadmap({ audit: sample, past: DEMO_PROFILE.roadmap, planned, bin: demoBin().existing, completed: doneSet, load: 16 });
  assert.deepEqual(groups.slice(0, 4).map(g => g.label), ['First year', 'Second year', 'Third year', 'Fourth year']);
  const spring = groups[2].spring;
  assert.equal(spring.label, 'Spring 2027');
  assert.ok(spring.boxes.filter(b => b.kind === 'plan').length === planned.length);
  assert.ok(spring.boxes.some(b => b.kind === 'bin'));
  const later = groups.flatMap(g => [g.fall, g.spring]).filter(t => t && t.status === 'later');
  const laterUnits = later.reduce((n, t) => n + t.boxes.reduce((m, b) => m + b.units, 0), 0);
  assert.equal(laterUnits + planned.reduce((n, i) => n + i.course.units, 0), sample.remaining);
  const last = later.at(-1).label;
  assert.equal(last, L.projectGraduation(sample.remaining, planned.reduce((n, i) => n + i.course.units, 0), 16).term);
  const order = later.flatMap(t => t.boxes.map(b => b.code));
  assert.ok(order.indexOf('BME 445A') < order.indexOf('BME 445B'), 'prerequisite order respected');
});

test('roadmap without a fixture history starts at Spring 2027', () => {
  const groups = L.buildRoadmap({ audit: sample, completed: doneSet, load: 16 });
  assert.equal(groups[0].fall, null);
  assert.equal(groups[0].spring.label, 'Spring 2027');
  assert.match(groups[0].label, /^2026-27$/);
});

test('demo ratings stay in a plausible band and are stable', () => {
  for (const name of ["David D'Argenio", 'Susan Schober', 'Cristina Zavaleta']) {
    const r = demoRating(name);
    assert.ok(r.score >= 3.6 && r.score <= 4.8);
    assert.deepEqual(r, demoRating(name));
  }
});
