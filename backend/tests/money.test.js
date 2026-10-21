import assert from 'node:assert/strict';
import { test } from 'node:test';
import { amount, sumAmounts, multiplyAmounts } from '../src/shared/money.js';
import { date, journal } from '../src/validators/accounting.validators.js';

test('decimal sums and products retain exact precision and deterministic rounding', () => {
  assert.equal(sumAmounts(['0.1', '0.2']), '0.300000');
  assert.equal(sumAmounts(['99999999999999.999998', '0.000001']), '99999999999999.999999');
  assert.equal(multiplyAmounts('0.000001', '0.5'), '0.000001');
  assert.equal(multiplyAmounts('0.000001', '0.499999'), '0.000000');
  assert.equal(multiplyAmounts('12345678.123456', '2'), '24691356.246912');
  assert.equal(amount('0'), '0.000000');
});
test('money rejects floats, exponents, truncation, negatives and overflow', () => {
  for (const value of [0.1, null, NaN, 'NaN', 'Infinity', '1e2', '-1', '-0', '00.10', '1.0000001', '100000000000000', '', ' 1', '1.']) {
    assert.throws(() => amount(value), { code: 'INVALID_AMOUNT' });
  }
  assert.throws(() => sumAmounts(['99999999999999.999999', '0.000001']), { code: 'INVALID_AMOUNT' });
});
test('calendar dates and balanced journal line constraints reject invalid data', () => {
  assert.equal(date('2024-02-29'), '2024-02-29');
  for (const value of ['2026-02-29', '2026-13-01', '2026-01-01T00:00:00Z', '2026-00-01']) assert.throws(() => date(value));
  const base = { documentDate: '2026-01-01', postingDate: '2026-02-01', currency: 'TRY', description: 'Synthetic',
    sourceModule: 'TEST', sourceId: 'line-test', lines: [
      { accountId: '11111111-1111-4111-8111-111111111111', debit: '0.3', credit: '0' },
      { accountId: '22222222-2222-4222-8222-222222222222', debit: '0', credit: '0.3' },
    ] };
  assert.equal(journal(base).lines[0].debit, '0.300000');
  assert.throws(() => journal({ ...base, lines: [base.lines[0], { ...base.lines[1], credit: '0.2' }] }), { code: 'UNBALANCED_JOURNAL' });
  assert.throws(() => journal({ ...base, lines: [{ ...base.lines[0], credit: '1' }, base.lines[1]] }), { code: 'INVALID_JOURNAL_LINE' });
});
