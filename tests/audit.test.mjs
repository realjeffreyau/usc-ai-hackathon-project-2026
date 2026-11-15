import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudit, readAuditPdf } from '../dist/audit.js';
import { fictionalAudit, makePdf } from './pdf-fixture.mjs';

test('fictional audit text parses into separate unit fields and statuses', () => {
  const audit = parseAudit(fictionalAudit.join('\n'));
  assert.equal(audit.total, 128);
  assert.equal(audit.earned, 66);
  assert.equal(audit.progress, 12);
  assert.equal(audit.remaining, 50);
  assert.deepEqual(audit.completed.sort(), ['CSCI-102', 'MATH-226']);
  assert.ok(audit.suggested.includes('MATH-245'));
  assert.deepEqual([...new Set(audit.requirements.map(r => r.status))].sort(), ['complete', 'progress', 'remaining']);
});

test('missing unit fields come back absent, not invented', () => {
  const audit = parseAudit('NO   ENGINEERING MATH\nSELECT FROM: MATH 245');
  assert.equal(audit.total, null);
  assert.equal(audit.earned, undefined);
});

test('input limits and garbage are rejected', () => {
  assert.throws(() => parseAudit('x'.repeat(400001)), /400,000/);
  assert.throws(() => parseAudit('hello world'), /No STARS requirement rows/);
  assert.throws(() => parseAudit(42), /400,000/);
});

test('invalid PDFs are rejected with clear messages', async () => {
  const file = (bytes, name = 'a.pdf') => new File([bytes], name);
  await assert.rejects(readAuditPdf(file('not a pdf at all')), /could not be read as a PDF/);
  await assert.rejects(readAuditPdf(file('%PDF-1.4 hello', 'a.txt')), /Choose a text-based PDF/);
  await assert.rejects(readAuditPdf(file(new Uint8Array(0))), /Choose a text-based PDF/);
  await assert.rejects(readAuditPdf(file(new Uint8Array(5 * 1024 * 1024 + 1))), /5 MB/);
  await assert.rejects(readAuditPdf(null), /Choose a text-based PDF/);
});

test('fixture PDF is a well-formed PDF header', () => {
  assert.equal(makePdf(fictionalAudit).subarray(0, 5).toString(), '%PDF-');
});
