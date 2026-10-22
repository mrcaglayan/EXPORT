import assert from 'node:assert/strict'

export async function checkReceipts(page, base, artifacts) {
  assert.equal(process.env.SMOKE_ISOLATED, '1')
  await page.goto(`${base}/inventory`)
  await page.getByRole('heading', { name: 'Inventory setup', exact: true }).waitFor()
  const expected = await page.evaluate(async () => {
    const { apiClient } = await import('/src/api/client.js')
    const { data: me } = await apiClient.get('/me')
    const root = `/entities/${me.activeEntity.id}/inventory`
    const products = `/entities/${me.activeEntity.id}/products`
    const write = async (path, body) => (await apiClient.post(path, body, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).data
    const { data: { items: warehouses } } = await apiClient.get(`${root}/warehouses`)
    const { data: { items: pools } } = await apiClient.get(`${root}/pools`)
    const af = pools.find(pool => pool.code === 'AF')
    await apiClient.patch(`${root}/pools/${af.id}`, { name: af.name, active: true }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
    const { item: movement } = await write(`${root}/movement-types`, { code: 'RECEIVE', name: 'Goods receipt', effect: 'RECEIPT' })
    const { data: { items: skus } } = await apiClient.get(`${products}/skus`, { params: { active: 'true' } })
    const sku = skus.find(item => item.code === 'ZARF-A3')
    const { item: second } = await write(`${products}/skus`, { code: 'ZARF-A5', name: 'A5 envelope', description: '', familyId: sku.familyId, baseUnitId: sku.baseUnitId })
    const body = { sourceId: 'BROWSER-RECEIPT', documentDate: '2026-02-09', postingDate: '2026-02-10', warehouseId: warehouses[0].id, movementTypeId: movement.id, currency: 'TRY', description: 'Synthetic multi-SKU receipt', lines: [
      { sourceLineKey: '1', skuId: sku.id, quantity: '100', unitCost: '500', description: 'Purchased envelopes', allocations: pools.map(pool => ({ poolId: pool.id, quantity: pool.code === 'GENERAL' ? '60' : pool.code === 'AF' ? '30' : '10' })) },
      { sourceLineKey: '2', skuId: second.id, quantity: '3', unitCost: '0', description: 'Free samples', allocations: [{ poolId: af.id, quantity: '3' }] },
    ] }
    const first = await write(`${root}/receipts`, body)
    const replay = await write(`${root}/receipts`, body)
    if (first.receipt.id !== replay.receipt.id) throw new Error('Duplicate receipt created')
    return { cm: pools.find(pool => pool.code === 'CM').id }
  })
  const tab = async name => {
    await page.getByRole('tab', { name, exact: true }).click()
    await page.getByRole('tab', { name, exact: true, selected: true }).waitFor()
  }
  await tab('Receipts')
  await page.getByRole('button', { name: 'View receipt BROWSER-RECEIPT', exact: true }).click()
  await page.getByRole('heading', { name: 'Receipt BROWSER-RECEIPT', exact: true }).waitFor()
  await page.getByRole('row').filter({ hasText: 'Free samples' }).getByRole('cell', { name: '0.000000 TRY', exact: true }).first().waitFor()
  assert.equal(await page.getByRole('row').count(), 3)
  await page.screenshot({ path: `${artifacts}/receipt-details-desktop.png`, fullPage: true })
  await page.getByRole('button', { name: 'Back to stock records' }).click()
  await page.getByLabel('Search receipts').fill('not-a-receipt')
  await page.getByText('No matching stock records. Change or clear the filters.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Clear stock filters' }).click()
  await page.getByRole('button', { name: 'View receipt BROWSER-RECEIPT', exact: true }).waitFor()
  await tab('Stock balances')
  await page.getByRole('cell', { name: '100.000000', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Filter SKU ZARF-A3', exact: true }).click()
  await page.getByText('1–1 of 1', { exact: true }).last().waitFor()
  await page.getByRole('button', { name: 'View source BROWSER-RECEIPT line 1', exact: true }).click()
  await page.getByRole('heading', { name: 'Receipt BROWSER-RECEIPT', exact: true }).waitFor()
  await tab('Pool balances')
  await page.getByText('Filter stock records', { exact: true }).click()
  await page.getByLabel('Pool filter', { exact: true }).selectOption(expected.cm)
  await page.getByRole('cell', { name: '10.000000', exact: true }).waitFor()
  await page.getByRole('cell', { name: '5000.000000 TRY', exact: true }).waitFor()
  for (const name of ['Source layers', 'Physical ledger', 'Pool ledger']) {
    await tab(name)
    await page.getByRole('button', { name: 'View source BROWSER-RECEIPT line 1', exact: true }).first().waitFor()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => {
    const rect = document.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth
  })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.equal(await page.locator('header').count(), 0)
  await page.screenshot({ path: `${artifacts}/pool-ledger-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await tab('Receipts')
  await page.getByRole('button', { name: 'View receipt BROWSER-RECEIPT', exact: true }).waitFor()
  const entity = page.locator('aside').getByLabel('Legal entity')
  const current = await entity.inputValue()
  const other = await entity.locator('option').evaluateAll((options, id) => options.find(option => option.value !== id).value, current)
  await entity.selectOption(other)
  await page.getByRole('tab', { name: 'Warehouses', exact: true, selected: true }).waitFor()
  await tab('Receipts')
  await page.getByText('No posted stock records yet.', { exact: true }).waitFor()
  await entity.selectOption(current)
  await page.getByRole('tab', { name: 'Warehouses', exact: true, selected: true }).waitFor()
  await tab('Receipts')
  await page.getByRole('button', { name: 'View receipt BROWSER-RECEIPT', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: /Post receipt|Add receipt|Delete receipt/ }).count(), 0)
  console.log('PASS: receipt provenance, multi-SKU/free goods, source replay, physical/pool balances, filters, layer/ledger drill-down, mobile and company isolation.')
}
