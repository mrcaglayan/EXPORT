import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

assert.equal(process.env.SMOKE_ISOLATED, '1', 'Large journal writes require the disposable browser harness.')
const base = process.env.SMOKE_BASE_URL
assert.equal(base, 'http://127.0.0.1:5184')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${base}/login`)
  await page.getByLabel('Workspace code').fill(process.env.SMOKE_TENANT)
  await page.getByLabel('Email', { exact: true }).fill(process.env.SMOKE_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(process.env.SMOKE_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Accounting', exact: true }).waitFor()
  const accounts = await page.evaluate(async () => {
    const { apiClient } = await import('/src/api/client.js')
    const { data: profile } = await apiClient.get('/me')
    const root = `/entities/${profile.activeEntity.id}/accounting`
    const post = async (path, body) => (await apiClient.post(`${root}/${path}`, body, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).data
    await post('settings', { baseCurrency: 'TRY' })
    const debit = (await post('accounts', { code: '100', name: 'Synthetic performance debit', accountType: 'ASSET' })).account.id
    const credit = (await post('accounts', { code: '320', name: 'Synthetic performance credit', accountType: 'LIABILITY' })).account.id
    const year = (await post('fiscal-years', { code: 'PERF2026', startDate: '2026-01-01', endDate: '2026-12-31' })).fiscalYear.id
    await post('periods', { code: 'PERFJAN', fiscalYearId: year, startDate: '2026-01-01', endDate: '2026-01-31' })
    return { debit, credit }
  })
  await page.goto(`${base}/accounting`)
  await page.getByRole('tab', { name: 'Journals', exact: true }).click()
  for (const count of [300, 1000]) {
    await page.getByLabel('Document date').fill('2026-01-10')
    await page.getByLabel('Posting date').fill('2026-01-15')
    await page.getByLabel('Journal description').fill(`Synthetic browser ${count} lines`)
    await page.evaluate(n => {
      const add = [...document.querySelectorAll('button')].find(button => button.textContent === 'Add line')
      for (let i = 2; i < n; i++) add.click()
    }, count)
    await page.getByText(`${count} lines`, { exact: true }).waitFor()
    const first = page.getByRole('button', { name: 'First lines', exact: true })
    if (await first.isEnabled()) await first.click()
    for (let offset = 0; offset < count; offset += 25) {
      assert.ok(await page.locator('fieldset[aria-label^="Journal line "]').count() <= 25)
      await page.evaluate(({ debit, credit }) => {
        const setInput = (input, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        for (const row of document.querySelectorAll('fieldset[aria-label^="Journal line "]')) {
          const number = Number(row.getAttribute('aria-label').split(' ').at(-1))
          const select = row.querySelector('select')
          select.value = number % 2 ? debit : credit
          select.dispatchEvent(new Event('change', { bubbles: true }))
          setInput(row.querySelector('[aria-label^="Description "]'), `Synthetic line ${number}`)
          setInput(row.querySelector('[aria-label^="Debit "]'), number % 2 ? '1' : '')
          setInput(row.querySelector('[aria-label^="Credit "]'), number % 2 ? '' : '1')
        }
      }, accounts)
      if (offset + 25 < count) await page.getByRole('button', { name: 'Next lines', exact: true }).click()
    }
    const post = page.getByRole('button', { name: 'Post journal', exact: true })
    await page.getByRole('status').filter({ hasText: 'Balanced — journal lines are ready.' }).waitFor()
    assert.equal(await post.isEnabled(), true)
    await first.click()
    const editMs = await page.evaluate(async () => {
      const input = document.querySelector('[aria-label="Debit 1"]')
      const started = performance.now()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1.01')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return performance.now() - started
    })
    assert.equal(await post.isDisabled(), true)
    assert.ok((await page.getByLabel('Journal totals', { exact: true }).innerText()).includes('0.01 TRY'))
    await page.getByLabel('Debit 1', { exact: true }).fill('1')
    const started = Date.now()
    const [response] = await Promise.all([
      page.waitForResponse(result => result.url().endsWith('/journals') && result.request().method() === 'POST'), post.click(),
    ])
    const data = await response.json()
    assert.equal(response.status(), 200, JSON.stringify(data.error))
    assert.equal(data.journal.lines.length, count)
    assert.equal(data.journal.totalDebit, `${count / 2}.000000`)
    assert.equal(data.journal.totalCredit, data.journal.totalDebit)
    await page.getByRole('row').filter({ hasText: `Synthetic browser ${count} lines` }).waitFor()
    assert.ok(editMs < 1000, 'Local edit/paint should stay below a generous one-second regression threshold.')
    console.log(`MEASURE: browser ${count} lines, edit-to-paint ${editMs.toFixed(1)} ms; click-to-posted-row ${Date.now() - started} ms; at most 25 rows mounted.`)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: 300/1000-line editing, pagination, balance guards and HTTP posting in the disposable schema.')
} finally { await browser.close() }
