import assert from 'node:assert/strict'
export async function checkCorrections(page, base, artifacts, browser) {
  assert.equal(process.env.SMOKE_ISOLATED, '1')
  const refs = await page.evaluate(async () => {
    const { apiClient } = await import('/src/api/client.js'), me = (await apiClient.get('/me')).data, root = `/entities/${me.activeEntity.id}`
    const years = (await apiClient.get(`${root}/accounting/fiscal-years`)).data.items
    const p = (await apiClient.post(`${root}/accounting/periods`, { code: 'MAR', fiscalYearId: years.find(y => y.code === 'FY2026').id, startDate: '2026-03-01', endDate: '2026-03-31' }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).data.period
    await apiClient.post(`${root}/inventory/periods`, { accountingPeriodId: p.id }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
    return { root }
  })
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByRole('tab', { name: 'Corrections', exact: true }).click()
  await page.getByRole('button', { name: 'Reverse a movement', exact: true }).click()
  await page.getByRole('button', { name: 'Select reversal event BROWSER-DISPATCH', exact: true }).first().click()
  const form = async (reference, reason) => {
    await page.getByLabel('Correction reference', { exact: true }).fill(reference)
    await page.getByLabel('Correction posting date', { exact: true }).fill('2026-03-10')
    await page.getByLabel('Correction reason', { exact: true }).fill(reason)
    await page.getByLabel('Evidence reference', { exact: true }).fill('Synthetic evidence BROWSER-02F')
    await page.getByRole('button', { name: 'Submit correction', exact: true }).click()
    await page.getByRole('heading', { name: `Correction ${reference}`, exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Approve correction', exact: true }).isDisabled(), true)
  }
  await form('BROWSER-REVERSE', 'Return the synthetic dispatch to original source pools')
  const reviewer = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    await reviewer.goto(`${base}/inventory`)
    await reviewer.getByLabel('Workspace code').fill(process.env.SMOKE_TENANT)
    await reviewer.getByLabel('Email', { exact: true }).fill(process.env.SMOKE_INVENTORY_REVIEWER_EMAIL)
    await reviewer.getByLabel('Password', { exact: true }).fill(process.env.SMOKE_PASSWORD)
    await reviewer.getByRole('button', { name: 'Sign in', exact: true }).click()
    await reviewer.getByRole('heading', { name: 'Inventory setup', exact: true }).waitFor()
    const approvePost = async reference => {
      await reviewer.getByRole('tab', { name: 'Corrections', exact: true }).click()
      await reviewer.getByRole('button', { name: 'Refresh', exact: true }).click()
      await reviewer.getByRole('button', { name: `View correction ${reference}`, exact: true }).click()
      await reviewer.getByLabel('Correction action reason', { exact: true }).fill('Independent evidence and sources checked')
      await reviewer.getByRole('button', { name: 'Approve correction', exact: true }).click()
      await reviewer.getByText('APPROVED', { exact: true }).waitFor()
      assert.equal(await reviewer.getByRole('button', { name: 'Post correction', exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.getByLabel('Correction action reason', { exact: true }).fill('Post the approved stock change')
      await page.getByRole('button', { name: 'Post correction', exact: true }).click()
      await page.getByText('POSTED', { exact: true }).waitFor()
      await reviewer.getByRole('button', { name: 'Back to corrections', exact: true }).click()
    }
    await approvePost('BROWSER-REVERSE')
    await page.screenshot({ path: `${artifacts}/correction-reversal-desktop.png`, fullPage: true })
    await page.getByRole('button', { name: 'Back to corrections', exact: true }).click()
    await page.getByRole('button', { name: 'New physical count', exact: true }).click()
    const stock = await page.evaluate(async refs => {
      const { apiClient } = await import('/src/api/client.js')
      return (await apiClient.get(`${refs.root}/inventory/pool-balances`)).data.items.find(l => l.skuCode === 'ZARF-A3' && l.poolCode === 'GENERAL')
    }, refs)
    const source = `${stock.sourceId} / ${stock.sourceLineKey} / ${stock.poolCode}`
    await page.getByRole('button', { name: `Add source ${source}`, exact: true }).click()
    await page.getByLabel(`Observed quantity ${source}`, { exact: true }).fill(String(Number(stock.quantity) + 1))
    await form('BROWSER-COUNT', 'One additional unit observed in the existing source lot')
    await approvePost('BROWSER-COUNT')
    await page.getByRole('button', { name: 'Back to corrections', exact: true }).click()
    await page.getByRole('button', { name: 'New revaluation', exact: true }).click()
    await page.getByRole('button', { name: `Add source ${source}`, exact: true }).click()
    await page.getByLabel(`Target value ${source}`, { exact: true }).fill(String(Number(stock.value) + 600))
    await form('BROWSER-REVALUE', 'Approved value change with unchanged quantity')
    await approvePost('BROWSER-REVALUE')
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `${artifacts}/correction-detail-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('tab', { name: 'Movement history', exact: true }).click()
    await page.getByRole('heading', { name: 'Stock integrity: MATCHED', exact: true }).waitFor()
    await page.getByRole('cell', { name: 'REVALUATION', exact: true }).waitFor()
    await page.screenshot({ path: `${artifacts}/movement-history-desktop.png`, fullPage: true })
    await page.getByRole('tab', { name: 'Trial balance & close', exact: true }).click()
    await page.getByLabel('Report period', { exact: true }).selectOption({ label: 'FEB — 2026-02-01 → 2026-02-28 · CLOSED' })
    await page.getByText('APPROVED · version 2', { exact: true }).waitFor()
    await page.getByText('Closing stock value in this view: 29000.000000 TRY', { exact: true }).waitFor()
  } finally { await reviewer.close() }
  console.log('PASS: exact reversal, count, value-only revaluation, independent reviewer, retained close, movement history, integrity and mobile correction details.')
}
