import assert from 'node:assert/strict'

export async function checkAccounting(page, base, artifacts) {
  await page.goto(`${base}/accounting`)
  await page.getByRole('button', { name: 'Set base currency', exact: true }).click()
  await page.getByRole('tab', { name: 'Chart of accounts', exact: true }).waitFor()
  for (const [code, name, type] of [
    ['100', 'Synthetic cash', 'ASSET'], ['153', 'Synthetic goods', 'ASSET'],
    ['191.10', 'Synthetic input VAT 10', 'ASSET'], ['191.20', 'Synthetic input VAT 20', 'ASSET'],
    ['320', 'Synthetic payable', 'LIABILITY'],
  ]) {
    await page.getByLabel('Account code', { exact: true }).fill(code)
    await page.getByLabel('Account name', { exact: true }).fill(name)
    await page.getByLabel('Account type', { exact: true }).selectOption(type)
    await page.getByRole('button', { name: 'Add account', exact: true }).click()
    await page.getByRole('row').filter({ hasText: name }).waitFor()
  }
  await page.getByRole('tab', { name: 'Fiscal calendar', exact: true }).click()
  await page.getByLabel('Fiscal year code').fill('FY2026')
  await page.getByLabel('Year start', { exact: true }).fill('2026-01-01')
  await page.getByLabel('Year end', { exact: true }).fill('2026-12-31')
  await page.getByRole('button', { name: 'Add fiscal year', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Fiscal year created.' }).waitFor()
  await page.getByLabel('Fiscal year', { exact: true }).selectOption({ label: 'FY2026 · 2026-01-01 – 2026-12-31' })
  await page.getByLabel('Period code').fill('JAN')
  await page.getByLabel('Period start', { exact: true }).fill('2026-01-01')
  await page.getByLabel('Period end', { exact: true }).fill('2026-01-31')
  await page.getByRole('button', { name: 'Add period', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'JAN' }).waitFor()
  const entry = page.getByRole('form', { name: 'New journal', exact: true })
  const fillJournal = async (description, rows = [
    ['100 · Synthetic cash', '0.3', '', 'Debit'], ['320 · Synthetic payable', '', '0.3', 'Credit'],
  ]) => {
    await page.getByLabel('Document date', { exact: true }).fill('2025-12-31')
    await page.getByLabel('Posting date', { exact: true }).fill('2026-01-15')
    await page.getByLabel('Journal description').fill(description)
    while (await entry.getByRole('button', { name: /^Remove line/ }).count() < rows.length) await page.getByRole('button', { name: 'Add line', exact: true }).click()
    while (await entry.getByRole('button', { name: /^Remove line/ }).count() > rows.length) await entry.getByRole('button', { name: /^Remove line/ }).last().click()
    for (const [index, [account, debit, credit, lineDescription]] of rows.entries()) {
      await page.getByLabel(`Account ${index + 1}`, { exact: true }).selectOption({ label: account })
      await page.getByLabel(`Debit ${index + 1}`, { exact: true }).fill(debit)
      await page.getByLabel(`Credit ${index + 1}`, { exact: true }).fill(credit)
      await page.getByLabel(`Description ${index + 1}`, { exact: true }).fill(lineDescription)
    }
  }
  await page.getByRole('tab', { name: 'Journals', exact: true }).click()
  await fillJournal('Synthetic browser journal')
  await page.getByRole('button', { name: 'Post journal', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Synthetic browser journal' }).waitFor()
  await page.getByRole('row').filter({ hasText: 'Synthetic browser journal' }).getByRole('button', { name: 'View lines', exact: true }).click()
  await page.getByRole('button', { name: 'Close details', exact: true }).waitFor()
  assert.ok((await page.locator('body').innerText()).includes('0.300000'))
  await page.screenshot({ path: `${artifacts}/accounting-journal-desktop.png`, fullPage: true })
  await page.getByRole('button', { name: 'Close details', exact: true }).click()
  const purchase = [
    ['153 · Synthetic goods', '50000', '', 'Goods purchase'],
    ['191.10 · Synthetic input VAT 10', '5000', '', 'Input VAT'],
    ['320 · Synthetic payable', '', '55000', 'Supplier payable'],
  ]
  await fillJournal('Synthetic three-line purchase', purchase)
  assert.equal(await page.getByRole('status').filter({ hasText: 'Journal posted.' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Post journal', exact: true }).isEnabled(), true)
  await page.getByLabel('Credit 3', { exact: true }).fill('55001')
  assert.equal(await page.getByRole('button', { name: 'Post journal', exact: true }).isDisabled(), true)
  assert.ok((await entry.innerText()).includes('-1.00 TRY'))
  await page.getByLabel('Credit 3', { exact: true }).fill('55000')
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Post journal', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: 'Remove line 4', exact: true }).click()
  await page.getByLabel('Credit 1', { exact: true }).fill('1')
  assert.equal(await page.getByRole('button', { name: 'Post journal', exact: true }).isDisabled(), true)
  await page.getByLabel('Credit 1', { exact: true }).fill('')
  await page.getByLabel('Debit 1', { exact: true }).fill('99999999999999.9999999')
  assert.equal(await page.getByLabel('Debit 1', { exact: true }).inputValue(), '99999999999999.9999999')
  assert.equal(await page.getByRole('button', { name: 'Post journal', exact: true }).isDisabled(), true)
  await page.getByLabel('Debit 1', { exact: true }).fill('50000')
  assert.ok((await entry.innerText()).includes('55,000.00 TRY'))
  await page.screenshot({ path: `${artifacts}/accounting-multiline-desktop.png`, fullPage: true })
  const [purchaseResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/journals') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Post journal', exact: true }).click(),
  ])
  const savedPurchase = (await purchaseResponse.json()).journal
  assert.equal(savedPurchase.totalDebit, '55000.000000')
  assert.equal(savedPurchase.lines.length, 3)
  await page.getByRole('row').filter({ hasText: 'Synthetic three-line purchase' }).getByRole('button', { name: 'View lines', exact: true }).click()
  await page.getByRole('cell', { name: 'Goods purchase', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'Input VAT', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'Supplier payable', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close details', exact: true }).click()
  const multipleItems = [
    ['153 · Synthetic goods', '30000', '', 'SKU-A goods'], ['153 · Synthetic goods', '20000', '', 'SKU-B goods'],
    ['191.10 · Synthetic input VAT 10', '3000', '', 'SKU-A VAT'], ['191.20 · Synthetic input VAT 20', '4000', '', 'SKU-B VAT'],
    ['320 · Synthetic payable', '', '57000', 'Invoice payable'],
  ]
  await fillJournal('Synthetic multi-item purchase', multipleItems)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: `${artifacts}/accounting-multiline-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const [multipleResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/journals') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Post journal', exact: true }).click(),
  ])
  const savedMultiple = (await multipleResponse.json()).journal
  assert.equal(savedMultiple.totalDebit, '57000.000000')
  assert.equal(savedMultiple.lines.length, 5)
  assert.equal(savedMultiple.lines[0].accountId, savedMultiple.lines[1].accountId)
  assert.deepEqual(savedMultiple.lines.map(line => line.description), multipleItems.map(row => row[3]))
  await fillJournal('Synthetic queued journal')
  await page.getByLabel('Posting action').selectOption('posting-requests')
  await page.getByRole('button', { name: 'Queue request', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Posting request queued.' }).waitFor()
  await page.getByRole('tab', { name: 'Posting requests', exact: true }).click()
  await page.getByText('PENDING', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Chart of accounts', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Synthetic cash' }).getByRole('button', { name: 'Deactivate' }).click()
  await page.getByRole('row').filter({ hasText: 'Synthetic cash' }).getByRole('button', { name: 'Activate' }).waitFor()
  await page.getByRole('tab', { name: 'Posting requests', exact: true }).click()
  await page.getByRole('button', { name: 'Process request', exact: true }).click()
  await page.getByText('FAILED', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Fiscal calendar', exact: true }).click()
  await page.getByRole('button', { name: 'Close period', exact: true }).click()
  await page.getByLabel('Closing reason').fill('Synthetic browser close')
  await page.getByRole('button', { name: 'Confirm close', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Resolve pending or failed posting requests' }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('tab', { name: 'Chart of accounts', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Synthetic cash' }).getByRole('button', { name: 'Activate' }).click()
  await page.getByRole('row').filter({ hasText: 'Synthetic cash' }).getByRole('button', { name: 'Deactivate' }).waitFor()
  await page.getByRole('tab', { name: 'Posting requests', exact: true }).click()
  await page.getByRole('button', { name: 'Retry posting', exact: true }).click()
  await page.getByText('POSTED', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Fiscal calendar', exact: true }).click()
  await page.getByRole('button', { name: 'Close period', exact: true }).click()
  await page.getByLabel('Closing reason').fill('Synthetic browser close')
  await page.getByRole('button', { name: 'Confirm close', exact: true }).click()
  await page.getByRole('cell', { name: 'CLOSED', exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Journals', exact: true }).click()
  await fillJournal('Should be rejected')
  await page.getByRole('button', { name: 'Post journal', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Posting into a closed period is not allowed.' }).waitFor()
  assert.equal(await page.getByLabel('Journal description').inputValue(), 'Should be rejected')
  assert.equal(await page.getByLabel('Debit 1', { exact: true }).inputValue(), '0.3')
  await page.getByRole('tab', { name: 'Audit trail', exact: true }).click()
  await page.getByRole('cell', { name: 'period.closed', exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: `${artifacts}/accounting-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  console.log('PASS: accounting setup, accounts, fiscal calendar, two/three/five-line journals, repeated goods accounts and line descriptions, balance guards, PENDING/FAILED/POSTED retry, close guards, audit and mobile layout.')
}
