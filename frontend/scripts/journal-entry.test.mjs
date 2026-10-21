import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeJournalLines, displayAmount } from '../src/pages/accounting/journal-entry.js'

const line = (debit = '', credit = '', accountId = 'account', description = '') => ({ accountId, debit, credit, description })
test('goods, input VAT and payable form one exact three-line journal', () => {
  const result = analyzeJournalLines([line('50000', '', '153'), line('5000', '', '191.10'), line('', '55000', '320')])
  assert.equal(result.valid, true)
  assert.equal(result.debit, '55000.000000')
  assert.equal(result.credit, '55000.000000')
  assert.equal(result.difference, '0.000000')
  assert.equal(result.lines.length, 3)
  assert.equal(result.lines[0].credit, '0.000000')
})
test('several item descriptions and repeated accounts remain separate lines', () => {
  const result = analyzeJournalLines([
    line('30000', '', '153', 'Item A'), line('20000', '', '153', 'Item B'),
    line('3000', '', '191.10', 'VAT A'), line('4000', '', '191.20', 'VAT B'), line('', '57000', '320', 'Supplier'),
  ])
  assert.equal(result.valid, true)
  assert.equal(result.debit, '57000.000000')
  assert.deepEqual(result.lines.map(item => item.description), ['Item A', 'Item B', 'VAT A', 'VAT B', 'Supplier'])
})
test('six-place totals stay exact beyond binary float precision', () => {
  assert.equal(analyzeJournalLines([line('0.1'), line('0.2'), line('', '0.3')]).valid, true)
  const largest = '99999999999999.999999'
  assert.equal(analyzeJournalLines([line(largest), line('', largest)]).valid, true)
  const difference = analyzeJournalLines([line('99999999999999.999998'), line('', largest)])
  assert.equal(difference.difference, '-0.000001')
  assert.equal(difference.valid, false)
})
test('malformed, negative, numeric and over-precision input cannot submit', () => {
  for (const value of ['1e3', '-1', '+1', 'NaN', 'Infinity', '1,000.00', '1,5', '.5', '01', '0.0000001', '100000000000000', 50000]) {
    const result = analyzeJournalLines([line(value), line('', '1')])
    assert.equal(result.valid, false, String(value))
    assert.equal(result.lines, null)
    assert.equal(result.debit, null)
  }
})
test('empty rows, missing accounts, two-sided and zero-sided rows block posting', () => {
  for (const lines of [
    [line(), line()], [line('10', '', ''), line('', '10')],
    [line('10', '1'), line('1', '10')], [line('10'), line('', '10'), line('0', '0')],
  ]) assert.equal(analyzeJournalLines(lines).valid, false)
})
test('total overflow and minimum line count are enforced without a business ceiling', () => {
  const max = '99999999999999.999999'
  const overflow = analyzeJournalLines([line(max), line('0.000001'), line('', max), line('', '0.000001')])
  assert.equal(overflow.valid, false)
  assert.ok(overflow.totalError)
  assert.equal(analyzeJournalLines([line('1')]).valid, false)
  assert.equal(analyzeJournalLines([...Array.from({ length: 199 }, () => line('1')), line('', '199')]).valid, true)
  assert.equal(analyzeJournalLines([...Array.from({ length: 999 }, () => line('1')), line('', '999')]).valid, true)
})
test('display formatting preserves six-place differences and large values', () => {
  assert.equal(displayAmount('55000.000000'), '55,000.00')
  assert.equal(displayAmount('0.300000'), '0.30')
  assert.equal(displayAmount('-0.000001'), '-0.000001')
  assert.equal(displayAmount('99999999999999.999999'), '99,999,999,999,999.999999')
  assert.equal(displayAmount(null), '—')
})
