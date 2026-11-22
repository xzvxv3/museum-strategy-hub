import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { APP_ROUTES, appRouteHref } from '../src/appRoutes.js'
import { createCapstonePlans } from '../src/agricultureCapstoneData.js'

const base = process.env.CAPSTONE_BASE_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto(`${base}/strategies`)
  assert.equal(response.status(), 200)
  await page.getByRole('button', { name: '농업박물관 운영자 화면 시작', exact: true }).click()
  await page.locator('.strategy-select-card').first().waitFor()
  assert.equal(new URL(page.url()).pathname, '/strategies', 'Login must retain the requested page')

  for (const route of APP_ROUTES) {
    await page.getByRole('button', { name: route.page, exact: true }).click()
    if (route.tab) await page.getByRole('tab', { name: route.tab, exact: true }).click()
    if (route.typeTab) await page.getByRole('tab', { name: route.typeTab, exact: true }).click()
    await page.waitForURL(`${base}${route.path}`)
    assert.ok((await page.title()).includes(route.page))
    const reload = await page.reload()
    assert.equal(reload.status(), 200)
    await page.getByRole('button', { name: route.page, exact: true }).waitFor()
    if (route.tab || route.typeTab) assert.equal(await page.getByRole('tab', { name: route.tab || route.typeTab, exact: true }).getAttribute('aria-selected'), 'true')
  }
  await page.getByRole('button', { name: '운영전략', exact: true }).click()
  await page.getByRole('button', { name: '운영 캘린더', exact: true }).click()
  await page.getByRole('button', { name: '행사 전후 분석', exact: true }).click()
  await page.goBack()
  await page.waitForURL(`${base}/calendar`)
  assert.equal(await page.locator('main h1').textContent(), '운영 캘린더')
  await page.goBack()
  await page.waitForURL(`${base}/strategies`)
  assert.equal(await page.locator('main h1').textContent(), '운영전략')
  await page.goForward()
  await page.waitForURL(`${base}/calendar`)

  const [id, plan] = Object.entries(createCapstonePlans())[0]
  const planLink = appRouteHref({ page: '실행 계획', planId: id, planStatus: '완료', planFacility: '농업박물관' })
  await page.goto(`${base}${planLink}`)
  await page.locator('.execution-detail').waitFor()
  assert.ok((await page.locator('.execution-detail').textContent()).includes(plan.strategy.title))
  assert.equal(await page.locator('.saved-plan-card').count(), 2)
  await page.reload()
  await page.locator('.execution-detail').waitFor()
  assert.ok((await page.locator('.execution-detail').textContent()).includes(plan.strategy.title))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '행사 전후 분석', exact: true }).click()
  await page.locator('.event-result').waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.goto(`${base}/unknown-page`)
  await page.waitForURL(`${base}/dashboard`)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', routes: APP_ROUTES.length, directLogin: true, reloads: true, backAndForward: true, linkedPlan: true, mobile: true }))
} finally { await browser.close() }
