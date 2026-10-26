import assert from 'node:assert/strict'

export async function checkStockClose(page, base, artifacts, browser) {
  assert.equal(process.env.SMOKE_ISOLATED, '1')
  const refs = await page.evaluate(async () => {
    const { apiClient } = await import('/src/api/client.js')
    const { data: me } = await apiClient.get('/me')
    const root = `/entities/${me.activeEntity.id}`, write = async (path, body) => (await apiClient.post(`${root}/${path}`, body, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).data
    const asset = (await write('accounting/accounts', { code: '153C', name: 'Synthetic stock close asset', accountType: 'ASSET' })).account
    const payable = (await write('accounting/accounts', { code: '320C', name: 'Synthetic close offset', accountType: 'LIABILITY' })).account
    const period = (await apiClient.get(`${root}/inventory/periods`)).data.items.find(p => p.code === 'FEB')
    return { root, assetId: asset.id, payableId: payable.id, periodId: period.id }
  })
  const selectPeriod = async target => {
    await target.getByRole('tab', { name: 'Trial balance & close', exact: true }).click()
    await target.getByLabel('Report period', { exact: true }).selectOption(refs.periodId)
  }
  await selectPeriod(page)
  await page.getByRole('heading', { name: 'Stock and GL comparison: NOT_CONFIGURED', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Prepare close', exact: true }).isDisabled(), true)
  await page.getByText('Inventory asset accounts', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit inventory account mapping', exact: true }).click()
  await page.getByLabel('Inventory asset account', { exact: true }).selectOption(refs.assetId)
  await page.getByRole('button', { name: 'Add asset account', exact: true }).click()
  await page.getByLabel('Account mapping reason', { exact: true }).fill('Explicit synthetic asset mapping')
  await page.getByRole('button', { name: 'Save asset accounts', exact: true }).click()
  await page.getByRole('heading', { name: 'Stock and GL comparison: MISMATCH', exact: true }).waitFor()
  await page.evaluate(async refs => {
    const { apiClient } = await import('/src/api/client.js')
    const report = (await apiClient.get(`${refs.root}/inventory/reconciliation`, { params: { periodId: refs.periodId } })).data
    if (report.summary.stockValue !== '29000.000000') throw new Error('Unexpected synthetic stock value')
    // Explicit test journal; the close workflow never creates balancing journals.
    await apiClient.post(`${refs.root}/accounting/journals`, { sourceModule: 'MANUAL', sourceId: 'BROWSER-CLOSE-GL', documentDate: '2026-02-28', postingDate: '2026-02-28', currency: 'TRY', description: 'Explicit synthetic close comparison', lines: [
      { accountId: refs.assetId, description: 'Synthetic asset balance', debit: '29000', credit: '0' },
      { accountId: refs.payableId, description: 'Synthetic offset', debit: '0', credit: '29000' },
    ] }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
  }, refs)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByRole('heading', { name: 'Stock and GL comparison: MATCHED', exact: true }).waitFor()
  await page.getByLabel('Group stock by', { exact: true }).selectOption('sku')
  await page.getByText('58.000000', { exact: true }).first().waitFor()
  await page.getByRole('row').filter({ hasText: 'ZARF-A3' }).getByRole('button', { name: /^View movements / }).click()
  await page.getByRole('heading', { name: 'Period movements', exact: true }).waitFor()
  await page.getByRole('cell', { name: '-42.000000', exact: true }).waitFor()
  await page.screenshot({ path: `${artifacts}/trial-balance-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.equal(await page.locator('header').count(), 0)
  await page.screenshot({ path: `${artifacts}/trial-balance-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Close or reopen reason', { exact: true }).fill('February stock checked')
  await page.getByRole('button', { name: 'Prepare close', exact: true }).click()
  await page.getByText('IN_REVIEW · version 1', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Approve close', exact: true }).isDisabled(), true)
  const reviewer = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    await reviewer.goto(`${base}/inventory`)
    await reviewer.getByLabel('Workspace code').fill(process.env.SMOKE_TENANT)
    await reviewer.getByLabel('Email', { exact: true }).fill(process.env.SMOKE_INVENTORY_REVIEWER_EMAIL)
    await reviewer.getByLabel('Password', { exact: true }).fill(process.env.SMOKE_PASSWORD)
    await reviewer.getByRole('button', { name: 'Sign in', exact: true }).click()
    await reviewer.getByRole('heading', { name: 'Inventory setup', exact: true }).waitFor()
    await selectPeriod(reviewer)
    await reviewer.getByRole('button', { name: 'Inspect pending snapshot', exact: true }).click()
    await reviewer.getByLabel('Close or reopen reason', { exact: true }).fill('Independent stock and GL review')
    await reviewer.getByRole('button', { name: 'Approve close', exact: true }).click()
    await reviewer.getByText('APPROVED · version 1', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByText('APPROVED · version 1', { exact: true }).waitFor()
    await page.getByLabel('Close or reopen reason', { exact: true }).fill('Authorized correction review')
    await page.getByRole('button', { name: 'Request reopen', exact: true }).click()
    await page.getByRole('button', { name: /^View reopen / }).click()
    await page.getByRole('heading', { name: 'Reopen review · REQUESTED', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Approve reopen', exact: true }).isDisabled(), true)
    await reviewer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await reviewer.getByRole('button', { name: /^View reopen / }).click()
    await reviewer.getByLabel('Reopen review reason', { exact: true }).fill('Approved; preserve and recalculate close')
    await reviewer.getByRole('button', { name: 'Approve reopen', exact: true }).click()
    await reviewer.getByText('LIVE · not approved', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByRole('button', { name: 'Inspect close version 1', exact: true }).click()
    await page.getByText('SUPERSEDED · version 1', { exact: true }).waitFor()
    await page.screenshot({ path: `${artifacts}/stock-close-history-desktop.png`, fullPage: true })
    await page.getByRole('button', { name: 'Show current report', exact: true }).click()
    await page.getByLabel('Close or reopen reason', { exact: true }).fill('Recalculated February close')
    await page.getByRole('button', { name: 'Prepare close', exact: true }).click()
    await page.getByText('IN_REVIEW · version 2', { exact: true }).waitFor()
    await reviewer.getByRole('button', { name: 'Refresh', exact: true }).click()
    await reviewer.getByRole('button', { name: 'Inspect pending snapshot', exact: true }).click()
    await reviewer.getByLabel('Close or reopen reason', { exact: true }).fill('Second version checked')
    await reviewer.getByRole('button', { name: 'Approve close', exact: true }).click()
    await reviewer.getByText('APPROVED · version 2', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByText('APPROVED · version 2', { exact: true }).waitFor()
  } finally { await reviewer.close() }
  console.log('PASS: trial balance and movements, explicit GL mapping/mismatch, independent close/reopen, retained snapshot versions and responsive layout.')
}
