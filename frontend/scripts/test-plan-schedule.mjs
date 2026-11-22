import test from 'node:test'
import assert from 'node:assert/strict'
globalThis.sessionStorage = { getItem: key => key === 'museum-flow-account-role' ? 'root' : null }
const { planPeriod, planPeriodLabel, planAnalysisRange, validPlanSchedule, planAnalysisEvents, planReviewItems, validatePlan, parseBackup } = await import('../src/planStore.js')

const scope = { facility: '농업박물관', start_date: '2025-01-01', end_date: '2025-12-31', age: '', sex: '' }
const plan = { strategy: { title: '체험 행사', goal: '관객 프로그램', action: '체험 운영' }, scope, owner: '운영팀', memo: '', due: '2025-02-03', checks: [false, false, false, false], updated_at: '2025-02-04T00:00:00Z', workflowStatus: '완료' }
const linked = { ...plan, executionStart: '2025-02-01', executionEnd: '2025-02-03', eventType: '행사', actualStart: '2025-02-02', actualEnd: '2025-02-04', linkAnalysis: true, outcome: '운영 완료' }

test('legacy due dates remain readable without inventing execution periods', () => {
  assert.deepEqual(planPeriod(plan), { start: plan.due, end: plan.due })
  assert.match(planPeriodLabel(plan), /기존 목표일/)
  assert.ok(validatePlan(plan))
  assert.equal(planAnalysisEvents({ legacy: plan })[0].dateBasis, '기존 목표일(하루)')
})
test('execution ranges support one-day and cross-month plans and reject partial or reversed dates', () => {
  assert.deepEqual(planPeriod(linked), { start: '2025-02-01', end: '2025-02-03' })
  for (const [start, end, expected] of [['2025-01-31', '2025-02-02', true], ['2025-02-01', '2025-02-01', true], ['2025-02-03', '2025-02-01', false], ['2025-02-01', '', false], ['2025-02-30', '2025-03-01', false]]) {
    assert.equal(Boolean(validPlanSchedule({ ...plan, executionStart: start, executionEnd: end })), expected)
  }
})
test('completed events with actual dates are analyzed without an extra link checkbox', () => {
  const events = planAnalysisEvents({ event: linked, pending: { ...linked, workflowStatus: '진행 중' }, archived: { ...linked, archived: true }, unlinked: { ...linked, linkAnalysis: false }, ordinary: { ...linked, eventType: '' }, noFacility: { ...linked, scope: { ...scope, facility: '' } } })
  assert.equal(events.length, 3)
  assert.equal(events[0].planId, 'event')
  assert.equal(events[0].start, linked.actualStart)
  assert.equal(events[0].end, linked.actualEnd)
  assert.equal(planAnalysisEvents({ event: { ...linked, actualStart: '', actualEnd: '' } })[0].start, linked.executionStart)
  assert.equal(Boolean(validPlanSchedule({ ...linked, actualStart: '2023-01-01' })), false)
})
test('backups retain new fields and reject invalid ranges', () => {
  const id = JSON.stringify([scope.facility, scope.start_date, scope.end_date, scope.age, scope.sex, linked.strategy.goal])
  const backup = record => JSON.stringify({ format: 'culture-plans', version: 1, plans: { [id]: record } })
  assert.deepEqual(parseBackup(backup(linked))[id], linked)
  assert.throws(() => parseBackup(backup({ ...linked, executionEnd: '2024-01-01' })))
})

test('completed plans remain discoverable when legacy fields or analysis setup are missing', () => {
  const rows = planReviewItems({ ready: linked, pending: { ...linked, workflowStatus: '준비' }, running: { ...linked, workflowStatus: '진행 중' }, ordinary: { ...linked, eventType: '' }, unconfirmed: { ...linked, linkAnalysis: false }, archived: { ...linked, archived: true }, legacy: plan })
  assert.equal(rows.length, 4)
  assert.equal(rows.find(row => row.planId === 'ready').analysisReady, true)
  const legacy = rows.find(row => row.planId === 'legacy')
  assert.equal(legacy.analysisReady, true)
  assert.equal(legacy.start, plan.due)
  assert.equal(legacy.end, plan.due)
  assert.equal(rows.find(row => row.planId === 'unconfirmed').analysisReady, true)
  assert.ok(rows.every(row => row.workflowStatus === '완료'))
})

test('analysis-specific facility preserves the saved plan scope and backup ID', () => {
  const record = { ...linked, scope: { ...scope, facility: '' }, analysisFacility: '농업박물관' }
  const id = JSON.stringify(['', scope.start_date, scope.end_date, scope.age, scope.sex, linked.strategy.goal])
  assert.equal(planAnalysisEvents({ [id]: record })[0].facility, '농업박물관')
  assert.equal(parseBackup(JSON.stringify({ format: 'culture-plans', version: 1, plans: { [id]: record } }))[id].scope.facility, '')
})

test('automatic analysis prioritizes actual dates, then registered range, then legacy single target date', () => {
  assert.equal(planAnalysisRange(linked).dateBasis, '실제 실행 기간')
  const scheduled = { ...linked, actualStart: '', actualEnd: '' }
  assert.deepEqual(planAnalysisRange(scheduled), { start: linked.executionStart, end: linked.executionEnd, dateBasis: '등록된 실행 기간' })
  assert.equal(planAnalysisRange({ ...scheduled, executionStart: '2099-01-01', executionEnd: '2099-01-02' }), null)
  assert.equal(planAnalysisRange({ ...scheduled, executionStart: '2025-02-30' }), null)
  assert.equal(planAnalysisRange({ ...linked, actualEnd: '' }), null)
})
