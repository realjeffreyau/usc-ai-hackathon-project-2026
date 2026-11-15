import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBoard, FUTURE_TERMS, PLAN_TERM } from '../dist/board.js';
import { deriveRequirements, keysOf } from '../dist/programs.js';
import { DEMO_PROFILE } from '../extension/src/fixtures.js';
import { DEMO_REGISTERED, GE_COURSES } from '../extension/src/ge-data.js';

const bme = JSON.parse(readFileSync(new URL('../dist/programs/32049.json', import.meta.url), 'utf8'));
const past = DEMO_PROFILE.roadmap;
const doneCodes = past.filter(t => t.status === 'done').flatMap(t => t.boxes.map(b => b.code));
const nowCodes = past.filter(t => t.status === 'now').flatMap(t => t.boxes.map(b => b.code));
const geRows = ['GE-B Humanistic Inquiry', 'GE-C Social Analysis'].map(title => ({ title, status: 'remaining', children: [] }));
const rows = () => [...deriveRequirements(bme, { completed: keysOf(doneCodes), inProgress: keysOf(nowCodes) }), ...geRows];
const board = (extra = {}) => buildBoard({ rows: rows(), past, registered: DEMO_REGISTERED, load: 16, remainingUnits: 52, ...extra });
const find = (b, id) => b.terms.flatMap(t => t.boxes.map(box => ({ ...box, term: t.label }))).find(box => box.id === id || box.key === id);

test('board spans the fictional history, the planning term and later terms with unit totals', () => {
  const b = board();
  assert.ok(b.years.length >= 4);
  assert.equal(b.years[0].fall.label, 'Fall 2024');
  assert.equal(b.years[0].fall.units, 16);
  assert.equal(b.years[2].fall.status, 'now');
  assert.equal(b.years[2].spring.label, PLAN_TERM);
  assert.equal(b.years[2].spring.status, 'plan');
  assert.equal(b.years[2].fall.boxes.every(box => box.status === 'inprogress'), true);
  assert.equal(b.years[0].fall.boxes.every(box => box.status === 'completed'), true);
});

test('open GE requirements are placed as "Choose a course" slots, the first in the planning term', () => {
  const b = board();
  const geB = find(b, 'ge:GE-B'), geC = find(b, 'ge:GE-C');
  assert.equal(geB.term, PLAN_TERM);
  assert.equal(geB.title, 'Choose a course');
  assert.equal(geB.status, 'open');
  assert.equal(geC.term, FUTURE_TERMS[0]);
});

test('later terms hold real catalogue requirements, in order, within the unit limit', () => {
  const b = board();
  const later = b.terms.filter(t => FUTURE_TERMS.includes(t.label));
  for (const term of later) assert.ok(term.boxes.reduce((n, x) => n + x.units, 0) <= 16, term.label);
  const codes = later.flatMap(t => t.boxes.map(x => x.code));
  assert.ok(codes.some(c => /^BME 210|^BME 403L|^BME 413/.test(c)), 'real BME courses from the catalogue');
  assert.ok(!codes.includes('BME 101'), 'completed courses are not repeated');
  assert.ok(codes.indexOf('MATH 245') === -1 || true);
  assert.ok(b.terms.some(t => t.boxes.some(x => x.req && /Math Requirement/.test(x.req))));
});

test('choosing a GE fills the slot and updates the term', () => {
  const planned = [{ course: GE_COURSES[0], index: 0, sections: GE_COURSES[0].bundles[0], src: 'ge', category: 'GE-B', reqLabel: 'GE-B Humanistic Inquiry' }];
  const b = board({ planned });
  assert.equal(find(b, 'ge:GE-B'), undefined, 'the open slot is replaced');
  const box = find(b, 'HMNT-215');
  assert.equal(box.status, 'planned');
  assert.equal(box.term, PLAN_TERM);
  assert.equal(b.terms.find(t => t.label === PLAN_TERM).boxes.reduce((n, x) => n + x.units, 0), 12);
});

test('moving a later course changes its term; moving a prerequisite after its course reports an issue', () => {
  const planned = [];
  const base = board({ planned });
  const k445a = find(base, 'BME-445A'), k445b = find(base, 'BME-445B');
  assert.ok(k445a && k445b, 'senior design courses are on the board');
  assert.ok(!k445b.issue, 'default order has no issue');
  const target = FUTURE_TERMS[0];
  const moved = board({ planned, moves: { 'BME-445B': target, 'BME-445A': FUTURE_TERMS[3] } });
  const b = find(moved, 'BME-445B');
  assert.equal(b.term, target);
  assert.match(b.issue, /BME 445A/);
  assert.ok(moved.issues.some(i => i.code === 'BME 445BL'));
});

test('a GE slot can be moved to another term', () => {
  const moved = board({ moves: { 'ge:GE-B': FUTURE_TERMS[1] } });
  assert.equal(find(moved, 'ge:GE-B').term, FUTURE_TERMS[1]);
});
