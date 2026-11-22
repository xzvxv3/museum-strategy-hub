import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { CAPSTONE_PREFIX, CAPSTONE_VERSION, CAPSTONE_SCOPE, createCapstonePlans } from '../src/agricultureCapstoneData.js'

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = [], realEventRequests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/api/events/analysis')) realEventRequests.push(request.url()) })
  await page.goto(process.env.CAPSTONE_BASE_URL || 'http://127.0.0.1:5173')
  await page.evaluate(prefix => {
    localStorage.setItem(`${prefix}:events`, JSON.stringify([{ id: 'old-agriculture-event', title: '교체될 이전 일정' }]))
    localStorage.setItem(`${prefix}:plans`, '{}')
    localStorage.setItem('museum-flow-operator:국립극장:events', '다른 시설의 기존 자료')
  }, CAPSTONE_PREFIX)
  await page.getByRole('button', { name: '농업박물관 운영자 화면 시작', exact: true }).click()
  await page.locator('.home-total-value').waitFor()
  const seeded = await page.evaluate(prefix => ({ plans: JSON.parse(localStorage.getItem(`${prefix}:plans`)), events: JSON.parse(localStorage.getItem(`${prefix}:events`)), filters: JSON.parse(localStorage.getItem(`${prefix}:filters`)), version: localStorage.getItem(`${prefix}:capstone-version`), other: localStorage.getItem('museum-flow-operator:국립극장:events') }), CAPSTONE_PREFIX)
  assert.equal(seeded.version, CAPSTONE_VERSION)
  assert.equal(Object.keys(seeded.plans).length, 3)
  assert.equal(seeded.events.length, 4)
  assert.equal(seeded.other, '다른 시설의 기존 자료')
  assert.deepEqual(seeded.filters, CAPSTONE_SCOPE)

  await page.getByRole('button', { name: '운영전략', exact: true }).click()
  await page.locator('.strategy-select-card').first().waitFor()
  assert.equal(await page.locator('.strategy-select-card').count(), 3)
  const templates = Object.values(createCapstonePlans())
  for (const plan of templates) {
    await page.locator('.strategy-select-card').filter({ hasText: plan.strategy.title }).click()
    await page.locator('.strategy-action-start').click()
    const modal = page.locator('.plan-modal')
    assert.equal(await modal.locator('[name=plan_owner]').inputValue(), plan.owner)
    assert.equal(await modal.locator('[name=plan_start]').inputValue(), plan.executionStart)
    assert.equal(await modal.locator('[name=plan_end]').inputValue(), plan.executionEnd)
    assert.equal(await modal.locator('[name=plan_purpose]').inputValue(), plan.purpose)
    assert.equal(await modal.locator('.plan-status').textContent(), plan.workflowStatus)
    await modal.getByRole('button', { name: '닫기', exact: true }).click()
  }
  await page.screenshot({ path: '/tmp/agriculture-capstone-strategies.png', fullPage: true })

  await page.getByRole('button', { name: '실행 계획', exact: true }).click()
  assert.equal(await page.locator('.saved-plan-card').count(), 3)
  await page.locator('.plan-filter-tabs button').filter({ hasText: '완료' }).click()
  assert.equal(await page.locator('.saved-plan-card').count(), 2)
  await page.locator('.plan-filter-tabs button').filter({ hasText: '준비' }).click()
  assert.equal(await page.locator('.saved-plan-card').count(), 1)

  await page.getByRole('button', { name: '운영 캘린더', exact: true }).click()
  await page.getByLabel('캘린더 월', { exact: true }).fill('2026-11')
  await page.getByRole('button', { name: /2026-11-23, 일정/ }).click()
  assert.ok((await page.locator('.calendar-detail').textContent()).includes('팀 운영 브리핑'))
  await page.screenshot({ path: '/tmp/agriculture-capstone-calendar.png', fullPage: true })

  await page.getByRole('button', { name: '행사 전후 분석', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '실제 행사 분석', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.event-list-item').count(), 2)
  const changes = []
  for (const plan of templates.filter(item => item.workflowStatus === '완료')) {
    await page.locator('.event-list-item').filter({ hasText: plan.strategy.title }).click()
    await page.locator('.capstone-data-notice').waitFor()
    const value = Number((await page.locator('.event-result strong').textContent()).replaceAll(/[+%,]/g, ''))
    assert.ok(value > 10 && value < 30)
    changes.push(value)
    assert.equal(await page.locator('.event-period').count(), 3)
    await page.getByLabel('전후 비교 기간', { exact: true }).selectOption('14')
    assert.ok((await page.locator('.event-period.before').textContent()).includes('14'))
    await page.getByLabel('전후 비교 기간', { exact: true }).selectOption('28')
  }
  assert.deepEqual(changes, [24.1, 16.1])
  assert.equal(realEventRequests.length, 0, 'Synthetic scenarios must never request real event aggregates')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '분석 CSV 다운로드', exact: true }).click()
  const download = await downloadPromise
  assert.ok(download.suggestedFilename().includes('시연용가상'))
  const csv = await readFile(await download.path(), 'utf8')
  assert.ok(csv.includes('캡스톤 시연용 가상 방문 데이터'))
  assert.ok(csv.includes('실제 성과 아님'))
  await page.screenshot({ path: '/tmp/agriculture-capstone-analysis.png', fullPage: true })

  // Editing seeded records keeps their synthetic provenance, and next login preserves the edit.
  await page.getByRole('button', { name: '실행 계획 수정', exact: true }).click()
  const originalMemo = await page.locator('[name=plan_memo]').inputValue()
  await page.locator('[name=plan_memo]').fill(`${originalMemo}\n팀원이 이어서 작성한 시연 메모`)
  await page.getByRole('button', { name: '실행 계획 저장', exact: true }).click()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await page.getByRole('button', { name: '농업박물관 운영자 화면 시작', exact: true }).click()
  await page.locator('.home-total-value').waitFor()
  const edited = await page.evaluate(prefix => Object.values(JSON.parse(localStorage.getItem(`${prefix}:plans`))).find(plan => plan.strategy.goal === '평일·주말 운영'), CAPSTONE_PREFIX)
  assert.ok(edited.memo.includes('팀원이 이어서 작성한 시연 메모'))
  assert.equal(edited.demoSource, 'agriculture-capstone-synthetic-v1')
  await page.getByRole('button', { name: '행사 전후 분석', exact: true }).click()
  assert.equal(await page.locator('.event-list-item').count(), 2)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '/tmp/agriculture-capstone-mobile.png', fullPage: true })

  // A teammate's fresh browser receives the baseline, not this browser's edits.
  const teammate = await browser.newContext()
  const fresh = await teammate.newPage()
  await fresh.goto(process.env.CAPSTONE_BASE_URL || 'http://127.0.0.1:5173')
  await fresh.getByRole('button', { name: '농업박물관 운영자 화면 시작', exact: true }).click()
  await fresh.locator('.home-total-value').waitFor()
  const baseline = await fresh.evaluate(prefix => JSON.parse(localStorage.getItem(`${prefix}:plans`)), CAPSTONE_PREFIX)
  assert.equal(Object.keys(baseline).length, 3)
  assert.ok(Object.values(baseline).every(plan => !plan.memo.includes('팀원이 이어서 작성한 시연 메모')))
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', plans: '완료 2 · 준비 1', calendarNotes: 4, syntheticChanges: changes, realEventRequests: realEventRequests.length, editAndLoginPersistence: true, freshTeammateSeed: true, screenshots: '/tmp/agriculture-capstone-*.png' }))
} finally {
  await browser.close()
}
