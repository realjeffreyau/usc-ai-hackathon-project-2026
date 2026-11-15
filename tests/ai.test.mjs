import test from 'node:test';
import assert from 'node:assert/strict';
import { aiAvailability, closeAI, interpretWithAI, sanitize } from '../extension/src/ai.js';

test.beforeEach(() => closeAI());

test('sanitize keeps only valid, in-range settings', () => {
  assert.deepEqual(sanitize('{"maxUnits":15,"avoidBefore":"10:00","avoidAfter":"17:00","prioritizePrerequisites":true}'), { units: 15, morning: 600, latest: 1020, sequence: true });
  assert.deepEqual(sanitize({ maxUnits: 0, avoidBefore: '', avoidAfter: '', prioritizePrerequisites: false }), {});
  assert.deepEqual(sanitize({ maxUnits: 40, avoidBefore: '03:00', avoidAfter: '25:99', prioritizePrerequisites: 'yes' }), {}, 'out-of-range, malformed and non-boolean values are dropped');
  assert.deepEqual(sanitize('not json'), {});
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize({ maxUnits: 12.5 }), {});
});

const fakeModel = (answer, status = 'available') => {
  const calls = [];
  return {
    calls,
    availability: async () => status,
    create: async options => { calls.push(['create', options.initialPrompts[0].role]); return { prompt: async (text, opts) => { calls.push(['prompt', text, Object.keys(opts)]); return typeof answer === 'function' ? answer() : answer; }, destroy() {} }; },
  };
};

test('interpretWithAI sends only the typed sentence and returns a sanitized patch', async () => {
  const model = fakeModel('{"maxUnits":12,"avoidBefore":"10:00","avoidAfter":"","prioritizePrerequisites":false}');
  const result = await interpretWithAI('a light semester with no early classes', { model });
  assert.deepEqual(result, { patch: { units: 12, morning: 600 }, reader: 'Chrome AI' });
  const prompt = model.calls.find(call => call[0] === 'prompt');
  assert.equal(prompt[1], 'a light semester with no early classes');
  assert.deepEqual(prompt[2], ['responseConstraint']);
});

test('interpretWithAI refuses when Chrome AI is missing or unavailable, so the caller can fall back', async () => {
  assert.equal(await aiAvailability(undefined), 'unsupported');
  await assert.rejects(interpretWithAI('x', { model: undefined }), /unsupported/);
  await assert.rejects(interpretWithAI('x', { model: fakeModel('{}', 'unavailable') }), /unavailable/);
});

test('GE category and highly-rated preference are validated', () => {
  assert.deepEqual(sanitize({ maxUnits: 16, avoidBefore: '10:00', avoidAfter: '', prioritizePrerequisites: false, geCategory: 'B', preferHighlyRated: true }), { units: 16, morning: 600, geCategory: 'GE-B', ratingFirst: true });
  assert.deepEqual(sanitize({ geCategory: 'ge-c' }), { geCategory: 'GE-C' });
  assert.deepEqual(sanitize({ geCategory: 'Z', preferHighlyRated: 'yes' }), {});
  assert.deepEqual(sanitize({ geCategory: '<script>' }), {});
});

test('hostile model output cannot widen what the planner accepts', async () => {
  const model = fakeModel('{"maxUnits":9999,"avoidBefore":"00:00","avoidAfter":"99:99","prioritizePrerequisites":"true","extra":"<script>"}');
  const { patch } = await interpretWithAI('anything', { model });
  assert.deepEqual(patch, {});
});

test('after Chrome AI fails to start it reports unavailable instead of retrying', async () => {
  const broken = { availability: async () => 'available', create: async () => { throw new Error('service is not running'); } };
  await assert.rejects(interpretWithAI('x', { model: broken }), /not running/);
  assert.equal(await aiAvailability(broken), 'unavailable');
});
