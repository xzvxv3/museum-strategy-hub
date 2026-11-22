import test from 'node:test'
import assert from 'node:assert/strict'
import { initializeAgricultureCapstone } from '../src/agricultureCapstoneSeed.js'
import { CAPSTONE_PREFIX, CAPSTONE_VERSION, CAPSTONE_SOURCE, CAPSTONE_SCHEDULE_VERSION, createCapstonePlans, createCapstoneEvents } from '../src/agricultureCapstoneData.js'
import { buildAgricultureCapstoneAnalysis } from '../src/agricultureCapstoneAnalysis.js'
import { planAnalysisEvents, validatePlan, parseBackup } from '../src/planStore.js'
import { validateEvent } from '../src/eventStore.js'
import { buildExpectedEffects } from '../src/eventEffectInsights.js'

function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }
}
const profile = { facility: '농업박물관', isRoot: false }
const activeSession = () => storage({ 'museum-flow-session': 'active' })

test('seed is restricted to an authenticated agriculture operator', () => {
  const local = storage()
  for (const [account, session] of [[profile, storage()], [{ ...profile, isRoot: true }, activeSession()], [{ ...profile, facility: '국립극장' }, activeSession()]]) {
    assert.equal(initializeAgricultureCapstone(account, local, session).status, 'skipped')
    assert.equal(local.getItem(`${CAPSTONE_PREFIX}:plans`), null)
  }
})
test('one-time replacement seeds three valid full-period plans and minor calendar notes', () => {
  const oldPlans = JSON.stringify({ old: { scope: { facility: '농업박물관' } } })
  const local = storage({ [`${CAPSTONE_PREFIX}:plans`]: oldPlans, [`${CAPSTONE_PREFIX}:events`]: '[]', 'museum-flow-operator:국립극장:plans': 'other museum', 'museum-flow-root:plans': 'root records' })
  const session = activeSession()
  session.setItem('culture-plan-draft:old', 'obsolete draft')
  assert.equal(initializeAgricultureCapstone(profile, local, session).status, 'created')
  const plans = JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:plans`))
  assert.equal(Object.keys(plans).length, 3)
  assert.equal(Object.values(plans).filter(plan => plan.workflowStatus === '완료').length, 2)
  assert.equal(Object.values(plans).filter(plan => plan.workflowStatus === '준비').length, 1)
  assert.ok(Object.values(plans).every(plan => validatePlan(plan) && plan.scope.start_date === '2025-01-01' && plan.scope.end_date === '2025-12-31'))
  assert.equal(Object.keys(parseBackup(JSON.stringify({ format: 'culture-plans', version: 1, plans }))).length, 3)
  const events = JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:events`))
  assert.equal(events.length, 4)
  assert.ok(events.every(event => validateEvent(event) && event.type === '운영'))
  assert.equal(session.getItem('culture-plan-draft:old'), null)
  assert.equal(local.getItem('museum-flow-operator:국립극장:plans'), 'other museum')
  assert.equal(local.getItem('museum-flow-root:plans'), 'root records')
  assert.equal(JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:before-${CAPSTONE_VERSION}`))[`${CAPSTONE_PREFIX}:plans`], oldPlans)
})
test('next login retains edits, deletions and selected filters instead of reseeding', () => {
  const local = storage()
  initializeAgricultureCapstone(profile, local, activeSession())
  const plans = JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:plans`))
  const [first, second] = Object.keys(plans)
  plans[first].memo = '팀원이 이어서 작성한 메모'
  delete plans[second]
  local.setItem(`${CAPSTONE_PREFIX}:plans`, JSON.stringify(plans))
  local.setItem(`${CAPSTONE_PREFIX}:events`, '[]')
  local.setItem(`${CAPSTONE_PREFIX}:filters`, '{"age":"30대"}')
  assert.equal(initializeAgricultureCapstone(profile, local, activeSession()).status, 'existing')
  assert.deepEqual(JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:plans`)), plans)
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:events`), '[]')
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:filters`), '{"age":"30대"}')
})
test('storage failure restores records and does not mark initialization complete', () => {
  const local = storage({ [`${CAPSTONE_PREFIX}:plans`]: '{}', [`${CAPSTONE_PREFIX}:events`]: '[]' })
  const save = local.setItem
  local.setItem = (key, value) => { if (key === `${CAPSTONE_PREFIX}:events` && value.includes('agri-capstone')) throw new Error('quota'); save(key, value) }
  assert.equal(initializeAgricultureCapstone(profile, local, activeSession()).status, 'error')
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:plans`), '{}')
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:events`), '[]')
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:capstone-version`), null)
  local.setItem = save
  assert.equal(initializeAgricultureCapstone(profile, local, activeSession()).status, 'created')
})
test('synthetic analyses reconcile daily totals, audience shares and weekday-adjusted uplift', () => {
  const events = planAnalysisEvents(createCapstonePlans())
  assert.equal(events.length, 2)
  for (const event of events) {
    for (const days of [7, 14, 28, 56]) {
      const result = buildAgricultureCapstoneAnalysis(event, days)
      assert.equal(result.source, CAPSTONE_SOURCE)
      assert.equal(result.synthetic, true)
      assert.ok(result.change_percent > 10 && result.change_percent < 30)
      for (const period of result.periods) {
        assert.equal(period.population, period.daily.reduce((sum, row) => sum + row.population, 0))
        assert.equal(period.population, period.audience.reduce((sum, row) => sum + row.population, 0))
        assert.equal(period.daily_average, period.population / period.observed_days)
      }
      const [before, , after] = result.periods
      assert.equal(result.change_percent, (after.weekday_adjusted_average / before.weekday_adjusted_average - 1) * 100)
    }
    const short = buildAgricultureCapstoneAnalysis(event, 7)
    const long = buildAgricultureCapstoneAnalysis(event, 56)
    const known = new Map(long.periods.flatMap(period => period.daily).map(row => [row.period, row.population]))
    assert.ok(short.periods.flatMap(period => period.daily).every(row => known.get(row.period) === row.population))
    const filtered = buildAgricultureCapstoneAnalysis({ ...event, age: '30대', sex: 'F' }, 28)
    const all = buildAgricultureCapstoneAnalysis(event, 28)
    assert.ok(filtered.periods.every((period, i) => period.population === all.periods[i].audience.find(row => row.age === '30대' && row.sex === 'F').population))
  }
})
test('ordinary records, another museum and operational notes never receive synthetic analysis', () => {
  const event = planAnalysisEvents(createCapstonePlans())[0]
  assert.equal(buildAgricultureCapstoneAnalysis({ ...event, demoSource: undefined }), null)
  assert.equal(buildAgricultureCapstoneAnalysis({ ...event, facility: '국립극장' }), null)
  assert.equal(buildAgricultureCapstoneAnalysis({ ...event, demoScenario: 'unknown' }), null)
  assert.equal(buildAgricultureCapstoneAnalysis(createCapstoneEvents()[0]), null)
})
test('old weekday schedule migrates once without replacing edits, drafts or other records', () => {
  const plans = createCapstonePlans()
  const id = Object.keys(plans).find(key => plans[key].demoScenario === 'weekday-experience')
  const other = Object.keys(plans).find(key => plans[key].demoScenario === 'autumn-recovery')
  Object.assign(plans[id], { executionStart: '2026-10-12', executionEnd: '2026-10-23', actualStart: '2026-10-12', actualEnd: '2026-10-23', due: '2026-10-23', memo: '저장한 팀 메모' })
  const local = storage({ [`${CAPSTONE_PREFIX}:capstone-version`]: CAPSTONE_VERSION, [`${CAPSTONE_PREFIX}:plans`]: JSON.stringify(plans), [`${CAPSTONE_PREFIX}:events`]: '기존 일정 유지', [`${CAPSTONE_PREFIX}:filters`]: '기존 필터 유지' })
  const session = activeSession()
  session.setItem(`culture-plan-draft:${id}`, JSON.stringify({ base: plans[id].updated_at, memo: '작성 중인 팀 메모' }))
  assert.equal(initializeAgricultureCapstone(profile, local, session).status, 'updated')
  const next = JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:plans`))
  assert.equal(next[id].executionStart, '2026-11-12')
  assert.equal(next[id].executionEnd, '2026-11-23')
  assert.equal(next[id].actualEnd, '2026-11-23')
  assert.equal(next[id].due, '2026-11-23')
  assert.equal(next[id].memo, '저장한 팀 메모')
  assert.deepEqual(next[other], plans[other])
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:events`), '기존 일정 유지')
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:filters`), '기존 필터 유지')
  assert.equal(local.getItem(`${CAPSTONE_PREFIX}:capstone-schedule-version`), CAPSTONE_SCHEDULE_VERSION)
  const draft = JSON.parse(session.getItem(`culture-plan-draft:${id}`))
  assert.equal(draft.memo, '작성 중인 팀 메모')
  assert.equal(draft.base, next[id].updated_at)
  assert.equal(draft.executionStart, '2026-11-12')
  next[id].executionStart = '2026-11-13'
  local.setItem(`${CAPSTONE_PREFIX}:plans`, JSON.stringify(next))
  assert.equal(initializeAgricultureCapstone(profile, local, session).status, 'existing')
  assert.equal(JSON.parse(local.getItem(`${CAPSTONE_PREFIX}:plans`))[id].executionStart, '2026-11-13')
})
test('future fictional dates are allowed only for the explicitly marked capstone scenario', () => {
  const plan = Object.values(createCapstonePlans()).find(plan => plan.demoScenario === 'weekday-experience')
  const future = { ...plan, actualStart: '2027-01-01', actualEnd: '2027-01-12' }
  assert.equal(planAnalysisEvents({ future }).length, 1)
  assert.equal(planAnalysisEvents({ future: { ...future, demoSource: undefined } }).length, 0)
  assert.equal(planAnalysisEvents({ future: { ...future, scope: { ...future.scope, facility: '국립극장' } } }).length, 0)
})
test('expected-effect suggestions use observed changes and do not promise uplift for a decline', () => {
  const data = buildAgricultureCapstoneAnalysis(planAnalysisEvents(createCapstonePlans())[0])
  const effects = buildExpectedEffects(data)
  assert.equal(effects.length, 3)
  assert.match(effects[0].evidence, /전후 변화 \+24.1%/)
  assert.match(effects[1].evidence, /30대 여성/)
  assert.match(buildExpectedEffects({ ...data, change_percent: -20 })[0].title, /방문 회복/)
  assert.match(buildExpectedEffects({ ...data, change_percent: 0 })[0].title, /현재 방문 수준/)
  assert.deepEqual(buildExpectedEffects({ ...data, comparison_available: false }), [])
  assert.deepEqual(buildExpectedEffects({ ...data, change_percent: null }), [])
})
