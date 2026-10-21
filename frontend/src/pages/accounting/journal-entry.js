const scale = 1000000n
const maximum = 99999999999999999999n

// Integer millionths keep browser totals exact, including values beyond Number's
// safe integer range. The API remains the authority for posting validation.
function units(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return 0n
  if (!/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'))
}
function decimal(value) {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / scale}.${String(absolute % scale).padStart(6, '0')}`
}
export function displayAmount(value) {
  if (value === null) return '—'
  const [whole, fraction] = value.split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`
}
export function analyzeJournalLines(lines) {
  let debit = 0n, credit = 0n, amountsValid = true
  const normalized = []
  const errors = lines.map(line => {
    const left = units(line.debit), right = units(line.credit)
    const problems = []
    if (!line.accountId) problems.push('Choose an account.')
    if (left === null || right === null) {
      amountsValid = false
      problems.push('Use a positive amount with up to 14 integer and 6 decimal digits, without thousands separators.')
    } else {
      debit += left
      credit += right
      if ((left === 0n) === (right === 0n)) problems.push('Enter a positive debit or credit on this line, leaving the other side empty or zero.')
      normalized.push({ accountId: line.accountId, description: line.description.trim(), debit: decimal(left), credit: decimal(right) })
    }
    return problems.join(' ')
  })
  const overflow = debit > maximum || credit > maximum
  const balanced = amountsValid && !overflow && debit > 0n && debit === credit
  const valid = balanced && !errors.some(Boolean) && lines.length >= 2
  return {
    debit: amountsValid ? decimal(debit) : null, credit: amountsValid ? decimal(credit) : null,
    difference: amountsValid ? decimal(debit - credit) : null, balanced, valid, errors,
    totalError: overflow ? 'Journal totals exceed the supported maximum of 99,999,999,999,999.999999.' : '',
    lines: valid ? normalized : null,
  }
}
