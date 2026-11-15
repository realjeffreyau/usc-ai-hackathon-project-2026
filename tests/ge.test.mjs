import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustedRating, findGE, geCategoryOf, parseGEGoal } from '../dist/ge.js';
import { listConflicts } from '../dist/logic.js';
import { GE_COURSES, SAMPLE_RATINGS, DEMO_REGISTERED } from '../extension/src/ge-data.js';

const completed = new Set(['MATH-226', 'CSCI-102', 'CHEM-105A']);
const base = { units: 16, morning: 600, latest: null, ratingFirst: true };
const run = (prefs = {}, category = 'GE-B', schedule = DEMO_REGISTERED) =>
  findGE({ category, courses: GE_COURSES, ratings: SAMPLE_RATINGS, schedule, prefs: { ...base, ...prefs }, completed });
const ids = result => result.viable.map(v => `${v.course.id}:${v.sections[0].id}`);

test('sentence parsing: category and "highly rated"', () => {
  assert.equal(geCategoryOf('Find me a GE-B with a highly rated professor'), 'GE-B');
  assert.equal(geCategoryOf('need ge c please'), 'GE-C');
  assert.equal(geCategoryOf('I want a GEOLOGY class'), null);
  assert.deepEqual(parseGEGoal('Find me a GE-B with a highly rated professor, no classes before 10'), { category: 'GE-B', highlyRated: true });
  assert.equal(parseGEGoal('a GE-A').highlyRated, false);
  assert.equal(parseGEGoal('want a great professor').highlyRated, true);
});

test('a single 5.0 review does not outrank dozens of 4.8s', () => {
  assert.ok(adjustedRating({ rating: 5.0, count: 1 }) < adjustedRating({ rating: 4.8, count: 52 }));
  assert.ok(adjustedRating({ rating: 4.5, count: 31 }) < adjustedRating({ rating: 4.8, count: 52 }));
  assert.ok(adjustedRating({ rating: 4.9, count: 61 }) > adjustedRating({ rating: 4.9, count: 12 }));
});

test('GE-B ranking uses the instructor on each specific section and keeps unrated sections visible', () => {
  const result = run();
  assert.deepEqual(ids(result).slice(0, 2), ['HMNT-215:98215', 'HMNT-200:98200']);
  const order = ids(result);
  assert.ok(order.indexOf('HMNT-215:98216') > order.indexOf('HMNT-215:98215'), 'two sections of one course rank by their own instructors');
  assert.ok(order.indexOf('HMNT-120:98120') > order.indexOf('HMNT-230:98230'), 'one 5.0 review ranks below better-reviewed options');
  const unrated = result.viable.find(v => v.course.id === 'HMNT-140');
  assert.ok(unrated && unrated.rating === null && order.at(-1) === 'HMNT-140:98140', 'unrated option is last but visible');
  assert.ok(unrated.notes.some(n => /No rating/.test(n)));
  assert.match(result.viable.find(v => v.course.id === 'HMNT-120').notes.join(' '), /Only 1 review/);
});

test('eligibility: prerequisite not in the audit blocks, and says what to check', () => {
  const result = run();
  const blocked = result.blocked.find(b => b.course.id === 'HMNT-160');
  assert.ok(blocked);
  assert.equal(blocked.reasons[0].kind, 'prereq');
  assert.match(blocked.reasons[0].text, /PHIL 100/);
  assert.match(blocked.reasons[0].text, /advisor/);
  const withCredit = findGE({ category: 'GE-B', courses: GE_COURSES, ratings: SAMPLE_RATINGS, schedule: DEMO_REGISTERED, prefs: base, completed: new Set([...completed, 'PHIL-100']) });
  assert.ok(ids(withCredit).includes('HMNT-160:98160'));
});

test('GE tags decide the category (dual-tagged course appears in both)', () => {
  assert.ok(ids(run({}, 'GE-B')).includes('HMNT-250:98250'));
  assert.ok(ids(run({}, 'GE-C')).includes('HMNT-250:98250'));
  assert.ok(!ids(run({}, 'GE-C')).some(id => id.startsWith('HMNT-1')));
  assert.equal(run({}, 'GE-D').viable.length, 0);
});

test('the real section bundle is checked: a conflicting required discussion is skipped for one that fits', () => {
  const art = run().viable.find(v => v.course.id === 'HMNT-230');
  assert.deepEqual(art.sections.map(s => s.id), ['98230', '98232']);
  assert.equal(listConflicts([...DEMO_REGISTERED, { course: art.course, sections: art.sections }]).length, 0);
});

test('time preference: start-time blocks come with one specific action that works', () => {
  const result = run();
  const cinema = result.blocked.find(b => b.course.id === 'HMNT-180');
  assert.equal(cinema.reasons[0].kind, 'time');
  assert.deepEqual(cinema.reasons[0].action.patch, { morning: 480 });
  assert.ok(ids(run({ morning: 480 })).includes('HMNT-180:98180'));
});

test('overlap with the schedule blocks; the course that clashes is named', () => {
  const result = run({}, 'GE-B', DEMO_REGISTERED);
  const clash = findGE({ category: 'GE-B', courses: GE_COURSES, ratings: SAMPLE_RATINGS, prefs: base, completed,
    schedule: [...DEMO_REGISTERED, { course: { id: 'X-1', units: 0, name: 'x', bundles: [] }, sections: [{ id: '1', mode: 'Lecture', meetings: [{ days: [1, 3], start: 600, end: 680 }] }] }] });
  const ethics = clash.blocked.find(b => b.course.id === 'HMNT-120');
  assert.ok(ethics && ethics.reasons.some(r => r.kind === 'conflict' && /X 1/.test(r.text)));
  assert.ok(result.viable.some(v => v.course.id === 'HMNT-120'));
});

test('unit cap: nothing fits at 8 units, and the suggestion raises the limit and then shows options', () => {
  const result = run({ units: 8 });
  assert.equal(result.viable.length, 0);
  assert.ok(result.blocked.every(b => b.reasons.some(r => r.kind === 'units' || r.kind === 'prereq' || r.kind === 'time')));
  assert.deepEqual(result.suggestion.patch, { units: 12 });
  assert.ok(result.suggestion.wouldShow > 0);
  assert.ok(run({ units: 12 }).viable.length > 0);
});

test('Can I add it: clearance, full and uncertain sections are flagged, with seat counts labeled by source', () => {
  const result = run();
  const by = id => result.viable.find(v => `${v.course.id}:${v.sections[0].id}` === id);
  assert.equal(by('HMNT-200:98200').canAdd.status, 'clearance');
  assert.equal(by('HMNT-260:98260').canAdd.status, 'waitlist');
  assert.match(by('HMNT-260:98260').canAdd.text, /sample seat count/);
  assert.match(by('HMNT-215:98215').canAdd.text, /sample seat count/);
  assert.ok(by('HMNT-260:98260').notes.some(n => /instructor approval/.test(n)), 'uncertain eligibility says what to check');
  assert.match(findGE({ category: 'GE-B', courses: GE_COURSES, ratings: SAMPLE_RATINGS, schedule: [], prefs: base, completed, source: 'Live', ratingLabel: 'Rating' }).viable[0].canAdd.text, /live seat count/);
});

test('explanations answer what it counts for, when, who, and the unit math', () => {
  const top = run().viable[0];
  assert.match(top.explanation, /Fulfills GE-B, meets Mon\/Wed 4:30 PM, fits around your 2 classes, and adds 4 units \(12 of 16\)/);
  assert.equal(top.instructor, 'Ellis Marlowe');
  assert.equal(top.rating.label, 'Sample rating');
});

test('turning off "highly rated first" stops rating from deciding the order', () => {
  const order = ids(run({ ratingFirst: false }));
  assert.notEqual(order[0], 'HMNT-215:98215');
});
