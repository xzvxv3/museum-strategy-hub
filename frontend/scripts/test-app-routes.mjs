import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_ROUTES, resolveAppRoute, appRouteHref } from '../src/appRoutes.js'

test('every page and analytics tab has a unique round-trippable path', () => {
  assert.equal(new Set(APP_ROUTES.map(route => route.path)).size, APP_ROUTES.length)
  for (const route of APP_ROUTES) {
    const parsed = resolveAppRoute(`http://127.0.0.1:5173${route.path}`)
    assert.equal(parsed.page, route.page)
    assert.equal(parsed.tab, route.tab)
    assert.equal(parsed.typeTab, route.typeTab)
    assert.equal(appRouteHref(parsed), route.path)
  }
})
test('root, aliases and unknown paths resolve safely without external navigation', () => {
  for (const path of ['/', '/missing', '//untrusted.example/path']) assert.equal(appRouteHref(resolveAppRoute(path)), '/dashboard')
  assert.equal(appRouteHref(resolveAppRoute('/analytics/')), '/analytics/visits')
  assert.equal(appRouteHref(resolveAppRoute('/facility-types/')), '/facility-types/patterns')
  assert.equal(appRouteHref(resolveAppRoute('/strategies/')), '/strategies')
})
test('plan IDs, facility scope and status survive encoding and refresh', () => {
  const planId = JSON.stringify(['농업박물관', '2025-01-01', '2025-12-31', '', '', '평일·주말 운영'])
  const href = appRouteHref({ page: '실행 계획', planId, planStatus: '완료', planFacility: '농업박물관' })
  const parsed = resolveAppRoute(href)
  assert.equal(parsed.planId, planId)
  assert.equal(parsed.planStatus, '완료')
  assert.equal(parsed.planFacility, '농업박물관')
  assert.equal(resolveAppRoute('/execution-plans?status=invalid').planStatus, '전체')
})
