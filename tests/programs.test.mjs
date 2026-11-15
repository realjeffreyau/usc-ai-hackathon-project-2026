import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { courseKey, deriveRequirements, keysOf } from '../dist/programs.js';

const load = id => JSON.parse(readFileSync(new URL(`../dist/programs/${id}.json`, import.meta.url), 'utf8'));

test('catalogue codes normalize to registrar-style keys', () => {
  assert.equal(courseKey('MATH 125g'), 'MATH-125');
  assert.equal(courseKey('PHYS 151Lg'), 'PHYS-151');
  assert.equal(courseKey('CHEM 105aLg'), 'CHEM-105A');
  assert.equal(courseKey('EE 202L'), 'EE-202');
  assert.equal(courseKey('BME 445bL'), 'BME-445B');
  assert.equal(courseKey('WRIT 340'), 'WRIT-340');
  assert.equal(courseKey('not a course'), null);
  assert.deepEqual([...keysOf(['CHEM 105A', 'PHYS-151L', 'MATH-226'])].sort(), ['CHEM-105A', 'MATH-226', 'PHYS-151']);
});

test('the bundled snapshot is the 2026-2027 catalogue with majors and minors', () => {
  const index = JSON.parse(readFileSync(new URL('../dist/programs/index.json', import.meta.url), 'utf8'));
  assert.match(index.catalog, /2026-2027/);
  assert.ok(index.programs.filter(p => p.kind === 'major').length >= 150);
  assert.ok(index.programs.filter(p => p.kind === 'minor').length >= 200);
  assert.ok(index.programs.some(p => p.name === 'Biomedical Engineering (BS)'));
  assert.ok(index.programs.some(p => p.name === 'Philosophy Minor'));
  for (const p of index.programs.slice(0, 40)) { const d = load(p.id); assert.equal(d.id, p.id); assert.match(d.source, /^https:\/\/catalogue\.usc\.edu\//); }
});

test('Biomedical Engineering (BS): statuses come from completed and in-progress courses', () => {
  const bme = load(32049);
  const rows = deriveRequirements(bme, { completed: keysOf(['MATH 125', 'MATH 126', 'MATH 226', 'CHEM 105A', 'WRIT 150']), inProgress: keysOf(['WRIT 340']) });
  const by = title => rows.find(r => r.title === title);
  assert.equal(by('Composition/Writing Requirement').status, 'progress', 'WRIT 150 done, WRIT 340 in progress');
  const math = by('Pre-Major Requirements · Math Requirement');
  assert.equal(math.status, 'remaining');
  assert.deepEqual(math.children.map(c => c.status), ['complete', 'complete', 'complete', 'remaining'], 'OR slots: 126 or 129, 226 or 229');
  assert.match(math.children[1].title, /MATH 126 or MATH 129/);
  assert.ok(math.remaining === 4, 'one 4-unit slot left');
  const one = by('Major Requirements · Biomedical Engineering');
  assert.ok(one.children.length >= 10);
  assert.equal(rows.some(r => /general education/i.test(r.title)), false, 'GE categories are not invented from the catalogue');
});

test('"one course from the following" needs only one slot', () => {
  const bme = load(32049);
  const rows = deriveRequirements(bme, { completed: keysOf(['BME 430']), inProgress: new Set() });
  const electives = rows.find(r => r.children.some(c => /BME 430/.test(c.title)));
  assert.ok(electives);
  assert.equal(electives.status, 'complete');
  assert.equal(electives.children.filter(c => c.optional).length, electives.children.length - 1);
});

test('minors and empty programs derive without errors', () => {
  const minor = load(31878);
  const rows = deriveRequirements(minor, { completed: keysOf(['PHIL 315']), inProgress: new Set() });
  assert.ok(rows.length >= 1);
  const empties = readdirSync(new URL('../dist/programs/', import.meta.url)).filter(f => /^\d+\.json$/.test(f));
  assert.ok(empties.length >= 400);
  for (const f of empties) assert.ok(Array.isArray(deriveRequirements(JSON.parse(readFileSync(new URL(`../dist/programs/${f}`, import.meta.url), 'utf8'))).map(x => x)), f);
});
