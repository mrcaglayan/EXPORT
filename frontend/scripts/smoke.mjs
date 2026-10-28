import {checkVatClaims,checkVatClaimsReader} from './vat-claim-smoke.mjs'
import {checkVatRefunds,checkVatRefundsReader} from './vat-refund-smoke.mjs'
import {checkVatCosts,checkVatCostsReader} from './vat-cost-smoke.mjs'
import {checkVat,checkVatReader} from './vat-smoke.mjs'
import { checkInvoices, checkInvoiceReader } from './invoices-smoke.mjs'
import {checkPurchaseReceipts} from './purchase-receipts-smoke.mjs'
import {checkExports,checkExportReader} from './exports-smoke.mjs'
import {checkExportCompliance,checkExportComplianceReader} from './export-compliance-smoke.mjs'
import { checkPurchasing, checkPurchasingReader } from './purchasing-smoke.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { checkAccounting } from './accounting-smoke.mjs'
import { checkProducts } from './products-smoke.mjs'
import { checkClassification } from './product-classification-smoke.mjs'
import { checkProductUx } from './product-ux-smoke.mjs'
import { checkInventory } from './inventory-smoke.mjs'
import { checkReceipts } from './receipts-smoke.mjs'
import { checkReallocations } from './reallocations-smoke.mjs'
import { checkReservations } from './reservations-smoke.mjs'
import { checkStockClose } from './inventory-close-smoke.mjs'
import { checkCorrections } from './inventory-corrections-smoke.mjs'

const browser = await chromium.launch({
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : { channel: process.env.BROWSER_CHANNEL || 'msedge' }),
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const failures = []
page.on('pageerror', error => failures.push(error.message))
const base = process.env.SMOKE_BASE_URL || 'http://localhost:5173'
const account = process.env.SMOKE_PASSWORD ? {
  tenantCode: process.env.SMOKE_TENANT, email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD,
} : JSON.parse(await readFile(new URL('../../.local/auth/initial-account.json', import.meta.url), 'utf8'))
const artifacts = fileURLToPath(new URL('../../.local/screenshots/', import.meta.url))
await mkdir(artifacts, { recursive: true })

function waitForPageContent(title) {
  const name = title === 'Dashboard' ? /Every export starts with/
    : title === 'Settings' ? 'Workspace connection' : title === 'Accounting' ? 'Chart of accounts' : title === 'Products' ? 'Product catalogue' : title === 'Purchasing' ? 'Purchasing' : title === 'Exports' ? 'Export operations' : title === 'VAT' ? 'VAT register' : title === 'Inventory' ? 'Inventory setup' : `A home for your ${title.toLowerCase()}`
  return page.getByRole('heading', { level: 1, name }).waitFor()
}

try {
  await page.goto(`${base}/inventory`)
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await page.screenshot({ path: `${artifacts}/login-desktop.png`, fullPage: true })
  await page.getByLabel('Workspace code').fill(account.tenantCode)
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Workspace, email or password is incorrect.' }).waitFor()
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await waitForPageContent('Inventory')
  assert.equal(new URL(page.url()).pathname, '/inventory')
  assert.equal(await page.locator('header').count(), 0)
  assert.equal(await page.getByText('Your workspace', { exact: true }).count(), 0)
  if (process.env.SMOKE_SECOND_ENTITY) {
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/auth/context') && response.status() === 200),
      page.locator('aside').getByLabel('Legal entity').selectOption(process.env.SMOKE_SECOND_ENTITY),
    ])
    await page.reload()
    await waitForPageContent('Inventory')
    assert.equal(await page.locator('aside').getByLabel('Legal entity').inputValue(), process.env.SMOKE_SECOND_ENTITY)
    await page.goto(`${base}/settings`)
    await page.getByLabel('Company name').fill('Alpha browser updated')
    await page.getByRole('button', { name: 'Save company name' }).click()
    await page.getByRole('status').filter({ hasText: 'Company name saved.' }).waitFor()
    assert.equal(await page.locator('aside').getByLabel('Legal entity').locator('option:checked').innerText(), 'Alpha browser updated')
  }
  for (const [route, title] of [
    ['/', 'Dashboard'], ['/products', 'Products'], ['/inventory', 'Inventory'],
    ['/purchasing', 'Purchasing'], ['/exports', 'Exports'], ['/vat', 'VAT'], ['/accounting', 'Accounting'], ['/settings', 'Settings'],
  ]) {
    const response = await page.goto(`${base}${route}`)
    assert.equal(response.status(), 200)
    await waitForPageContent(title)
    assert.equal(await page.locator('nav a[aria-current="page"]').innerText(), title)
  }
  await page.goto(base)
  if (process.env.SMOKE_ISOLATED === '1') {
    await checkProducts(page, base, artifacts)
    await checkClassification(page, base, artifacts)
    await checkProductUx(page, base, artifacts)
    await checkAccounting(page, base, artifacts)
    await checkInventory(page, base, artifacts)
    await checkReceipts(page, base, artifacts)
    await checkReallocations(page, base, artifacts, browser)
    await checkReservations(page, base, artifacts)
    await checkStockClose(page, base, artifacts, browser)
    await checkCorrections(page, base, artifacts, browser)
    await checkPurchasing(page, base, artifacts, browser)
    await checkInvoices(page, base, artifacts, browser)
    await checkPurchaseReceipts(page, base, artifacts, browser)
    await checkExports(page, base, artifacts, browser)
    await checkExportCompliance(page, base, artifacts, browser)
    await checkVat(page, base, artifacts, browser)
    await checkVatCosts(page, base, artifacts, browser)
    await checkVatRefunds(page, base, artifacts, browser)
  await checkVatClaims(page,base,artifacts,browser)
    await page.goto(base)
  }
  await page.getByRole('link', { name: 'Explore products', exact: true }).click()
  await waitForPageContent('Products')
  await page.locator('aside').getByRole('link', { name: 'Dashboard', exact: true }).click()
  await waitForPageContent('Dashboard')
  await page.screenshot({ path: `${artifacts}/dashboard-desktop.png`, fullPage: true })

  // An unknown /api path must reach Express and return its structured 404.
  const result = await page.evaluate(async () => {
    const { apiClient } = await import('/src/api/client.js')
    try { await apiClient.get('/unimplemented') } catch (error) {
      return { name: error.name, status: error.status, message: error.message, code: error.code, requestId: error.requestId }
    }
  })
  assert.match(result.requestId, /^[a-zA-Z0-9._-]{1,100}$/)
  assert.deepEqual({ ...result, requestId: undefined }, { name: 'ApiError', status: 404, message: 'Route not found.', code: 'NOT_FOUND', requestId: undefined })
  await page.goto(`${base}/missing-page`)
  await page.getByRole('heading', { name: 'Page not found' }).waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Inventory', exact: true }).click()
  await waitForPageContent('Inventory')
  assert.equal(await page.getByRole('dialog').count(), 0)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: `${artifacts}/inventory-mobile.png`, fullPage: true })
  await page.goto(base)
  await waitForPageContent('Dashboard')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: `${artifacts}/dashboard-mobile.png`, fullPage: true })
  // Exercise pending, unavailable and retry states without altering the real DB.
  let releaseResponse
  const responseGate = new Promise(resolve => { releaseResponse = resolve })
  let simulateReady = false
  await page.route('**/api/v1/ready', async route => {
    if (!simulateReady) {
      await responseGate
      await route.fulfill({ status: 503, json: { error: { code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unavailable.' }, requestId: 'browser-test' } })
    } else {
      await route.fulfill({ status: 200, json: { status: 'ready', checks: { database: 'up', schema: 'current' }, requestId: 'browser-retry' } })
    }
  })
  await page.goto(`${base}/settings`)
  await page.getByRole('status').filter({ hasText: 'Checking your workspace' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Checking…' }).isDisabled(), true)
  releaseResponse()
  await page.getByRole('alert').waitFor()
  simulateReady = true
  await page.getByRole('button', { name: 'Check again' }).click()
  await page.getByRole('status').filter({ hasText: 'Your workspace is connected.' }).waitFor()
  await page.unroute('**/api/v1/ready')
  await page.reload()
  await page.getByRole('status').filter({ hasText: 'Your workspace is connected.' }).waitFor()
  await page.screenshot({ path: `${artifacts}/settings-mobile.png`, fullPage: true })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog').getByLabel('Legal entity').waitFor()
  await page.screenshot({ path: `${artifacts}/account-mobile.png`, fullPage: true })
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await page.screenshot({ path: `${artifacts}/login-mobile.png`, fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  if (process.env.SMOKE_VIEWER_EMAIL) {
    await page.getByLabel('Workspace code').fill(account.tenantCode)
    await page.getByLabel('Email', { exact: true }).fill(process.env.SMOKE_VIEWER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await waitForPageContent('Settings')
    assert.equal(await page.getByRole('button', { name: 'Save company name' }).count(), 0)
    await page.goto(`${base}/accounting`)
    await waitForPageContent('Accounting')
    assert.equal(await page.getByRole('button', { name: 'Add account', exact: true }).count(), 0)
    assert.equal(await page.getByRole('tab', { name: 'Audit trail', exact: true }).count(), 0)
    await page.getByRole('tab', { name: 'Journals', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Post journal', exact: true }).count(), 0)
    await page.goto(`${base}/products`)
    await waitForPageContent('Products')
    assert.equal(await page.getByRole('button', { name: 'Add SKU', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /Edit ZARF/ }).count(), 0)
    assert.equal(await page.getByRole('tab', { name: 'Audit trail', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Details ZARF-A3', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Save specification', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Add GTİP entry', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /Review GTİP/ }).count(), 0)
    await page.getByRole('tab', { name: 'Supplier aliases', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Propose alias', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /Review alias/ }).count(), 0)
    await page.goto(`${base}/inventory`)
    await page.getByRole('heading', { name: 'Access unavailable' }).waitFor()
    await page.getByRole('button', { name: 'Open navigation' }).click()
    assert.equal(await page.getByRole('dialog').getByRole('link', { name: 'Inventory', exact: true }).count(), 0)
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  }
  if (process.env.SMOKE_INVENTORY_READER_EMAIL) {
    await page.getByLabel('Workspace code').fill(account.tenantCode)
    await page.getByLabel('Email', { exact: true }).fill(process.env.SMOKE_INVENTORY_READER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ state: 'hidden' })
    await page.goto(`${base}/inventory`)
    await waitForPageContent('Inventory')
    await page.getByRole('row').filter({ hasText: 'İstanbul warehouse' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Add warehouse', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Edit IST', exact: true }).count(), 0)
    assert.equal(await page.getByRole('tab', { name: 'Audit trail', exact: true }).count(), 0)
    await page.getByRole('tab', { name: 'Destination pools', exact: true }).click()
    await page.getByRole('row').filter({ hasText: 'GENERAL allocation' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Add pool', exact: true }).count(), 0)
    await page.getByRole('tab', { name: 'Receipts', exact: true }).click()
    await page.getByRole('button', { name: 'View receipt BROWSER-RECEIPT', exact: true }).click()
    await page.getByRole('heading', { name: 'Receipt BROWSER-RECEIPT', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /Post receipt|Add receipt|Delete receipt/ }).count(), 0)
    await page.getByRole('tab', { name: 'Allocation & borrowing', exact: true }).click()
    await page.getByRole('button', { name: 'View request BROWSER-BORROW', exact: true }).click()
    await page.getByRole('heading', { name: 'Request BROWSER-BORROW', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /Approve request|Reject request|Cancel request|Execute transfer/ }).count(), 0)
    await page.getByRole('tab', { name: 'Reservations', exact: true }).click()
    await page.getByLabel('Reservation status', { exact: true }).selectOption('')
    await page.getByRole('button', { name: 'View reservation BROWSER-RESERVE', exact: true }).click()
    await page.getByRole('heading', { name: 'Reservation BROWSER-RESERVE', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /New reservation|Post dispatch|Release selected quantities|Cancel remaining reservation/ }).count(), 0)
    assert.equal(await page.getByLabel('Reservation action', { exact: true }).count(), 0)
    await page.getByRole('tab', { name: 'Dispatches', exact: true }).click()
    await page.getByRole('button', { name: 'View dispatch BROWSER-DISPATCH', exact: true }).click()
    await page.getByRole('heading', { name: 'Dispatch BROWSER-DISPATCH', exact: true }).waitFor()
    await page.getByRole('tab', { name: 'Trial balance & close', exact: true }).click()
    await page.getByLabel('Report period', { exact: true }).selectOption({ label: 'FEB — 2026-02-01 → 2026-02-28 · CLOSED' })
    await page.getByText('APPROVED · version 2', { exact: true }).waitFor()
    assert.equal(await page.getByRole('heading', { name: /^Stock and GL comparison:/ }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /Prepare close|Approve close|Request reopen|Edit inventory account mapping/ }).count(), 0)
    await page.getByRole('button', { name: 'Inspect close version 1', exact: true }).click()
    await page.getByText('SUPERSEDED · version 1', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
    await page.getByLabel('Workspace code').fill(account.tenantCode)
    await page.getByLabel('Email', { exact: true }).fill(process.env.SMOKE_INVENTORY_READER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ state: 'hidden' })
    await page.goto(`${base}/inventory`)
    await waitForPageContent('Inventory')
    await page.getByRole('tab', { name: 'Corrections', exact: true }).click()
    await page.getByRole('button', { name: 'View correction BROWSER-REVALUE', exact: true }).click()
    await page.getByRole('heading', { name: 'Correction BROWSER-REVALUE', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /Approve correction|Post correction|Cancel correction|New physical count/ }).count(), 0)
    await page.getByRole('tab', { name: 'Movement history', exact: true }).click()
    await page.getByRole('heading', { name: 'Stock integrity: MATCHED', exact: true }).waitFor()
    await checkPurchasingReader(page, base)
    await checkInvoiceReader(page, base)
    await checkExportReader(page, base)
    await checkExportComplianceReader(page, base)
    await checkVatReader(page, base)
    await checkVatCostsReader(page, base)
    await checkVatRefundsReader(page, base)
  await checkVatClaimsReader(page,base)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
    console.log('PASS: inventory reader can inspect stock, reservations, dispatches and retained close versions without financial detail or write controls.')
  }
  assert.deepEqual(failures, [])
  console.log('PASS: login errors/success, protected return route, eight routes, request IDs, readiness states, mobile account controls, logout and browser runtime; isolated mode also tests entity switching, scoped editing and viewer access.')
} catch (error) {
  console.error('Browser check failed at', new URL(page.url()).pathname, 'with alerts:', await page.getByRole('alert').allTextContents())
  await page.screenshot({ path: `${artifacts}/smoke-failure.png`, fullPage: true })
  throw error
} finally {
  await browser.close()
}
