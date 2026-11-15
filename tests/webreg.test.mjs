import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDays, parseTimeRange } from '../dist/webreg.js';
import { planPool, poolFromBin } from '../dist/logic.js';

test('days and times parse the way WebReg prints them', () => {
  assert.deepEqual(parseDays('TTh'), [1, 3]);
  assert.deepEqual(parseDays('MWF'), [0, 2, 4]);
  assert.deepEqual(parseDays('W'), [2]);
  assert.deepEqual(parseDays('T'), [1]);
  assert.deepEqual(parseDays('TBA'), []);
  assert.deepEqual(parseDays(''), []);
  assert.deepEqual(parseTimeRange('01:00pm-02:50pm'), { start: 780, end: 890 });
  assert.deepEqual(parseTimeRange('10:00am-11:50am'), { start: 600, end: 710 });
  assert.deepEqual(parseTimeRange('11:00-12:20pm'), { start: 660, end: 740 });
  assert.deepEqual(parseTimeRange('12:00pm-01:20pm'), { start: 720, end: 800 });
  assert.equal(parseTimeRange('TBA'), null);
});

// Entirely fictional sections.
const section = (id, mode, days, start, end, extra = {}) => ({ id, mode, units: mode === 'Lecture' ? 4 : 0, meetings: [{ days, start, end }], seats: 10, isRegistered: false, ...extra });
const course = (id, units, sections) => ({ id, name: id, units, sections });
const fixture = () => ({ courses: [
  course('AAA-101', 4, [section('10001', 'Lecture', [0, 2, 4], 480, 530), section('10002', 'Lecture', [0, 2, 4], 780, 830), section('10003', 'Discussion', [1], 900, 950)]),
  course('BBB-202', 4, [section('20001', 'Lecture', [1, 3], 780, 860), section('20002', 'Lecture', [1, 3], 600, 680)]),
  course('CCC-303', 4, [section('30001', 'Lecture', [0, 2], 780, 860)]),
  course('DDD-404', 2, [section('40001', 'Lecture', [4], 600, 650, { units: 2, isRegistered: true })]),
] });

test('pool: registered courses are locked; others get lecture plus discussion bundles', () => {
  const { pool, locked } = poolFromBin(fixture());
  assert.deepEqual(locked.map(l => l.course.id), ['DDD-404']);
  assert.equal(pool.find(c => c.id === 'AAA-101').bundles.length, 2);
  assert.ok(pool.find(c => c.id === 'AAA-101').bundles.every(b => b.length === 2));
});

test('planPool respects the unit cap, time preferences and overlaps with registered classes', () => {
  const { pool, locked } = poolFromBin(fixture());
  const result = planPool({ pool, locked, prefs: { units: 12, morning: 600, latest: null, sequence: false } });
  const ids = result.chosen.map(c => c.course.id);
  assert.ok(ids.includes('AAA-101') && ids.includes('BBB-202'));
  assert.equal(result.chosen.find(c => c.course.id === 'AAA-101').sections[0].id, '10002', 'early lecture avoided');
  assert.ok(result.chosen.find(c => c.course.id === 'BBB-202').sections.every(sec => sec.meetings.every(m => m.start >= 600)), 'nothing before 10 AM');
  const units = result.chosen.reduce((n, c) => n + c.course.units, 0) + result.lockedUnits;
  assert.ok(units <= 12);
  assert.ok(result.skipped.some(s => s.course.id === 'CCC-303'), 'third four-unit course does not fit under 12 units');
});

test('planPool never picks two overlapping classes', () => {
  const { pool, locked } = poolFromBin(fixture());
  const result = planPool({ pool, locked, prefs: { units: 18, morning: 0, latest: null, sequence: false } });
  const all = result.chosen.flatMap(c => c.sections.flatMap(s => s.meetings.map(m => ({ ...m, id: s.id }))));
  all.forEach((a, i) => all.slice(i + 1).forEach(b => assert.ok(a.id === b.id || !(a.start < b.end && b.start < a.end && a.days.some(d => b.days.includes(d))), `${a.id} vs ${b.id}`)));
});

test('planPool explains which registered class blocks a saved class', () => {
  const bin = { courses: [
    { id: 'REG-100', name: 'Registered', units: 4, sections: [section('1', 'Lecture', [0, 2], 600, 700, { isRegistered: true })] },
    { id: 'SAVED-200', name: 'Saved', units: 4, sections: [section('2', 'Lecture', [0], 650, 750), section('3', 'Lecture', [2], 660, 740)] },
  ] };
  const { pool, locked } = poolFromBin(bin);
  const result = planPool({ pool, locked, prefs: { units: 18, morning: 0, latest: null, sequence: false } });
  assert.equal(result.chosen.length, 0);
  assert.match(result.skipped[0].reason, /overlaps REG 100, which you are already registered for/);
});
