import { CAPSTONE_FACILITY, CAPSTONE_VERSION, CAPSTONE_PREFIX, CAPSTONE_SCOPE, createCapstonePlans, createCapstoneEvents } from './agricultureCapstoneData.js'

export function initializeAgricultureCapstone(profile, local, session) {
  if (profile.isRoot || profile.facility !== CAPSTONE_FACILITY) return { status: 'skipped' }
  try {
    if (session.getItem('museum-flow-session') !== 'active') return { status: 'skipped' }
    const marker = `${CAPSTONE_PREFIX}:capstone-version`
    if (local.getItem(marker) === CAPSTONE_VERSION) return { status: 'existing' }
    const keys = ['plans', 'events', 'filters'].map(suffix => `${CAPSTONE_PREFIX}:${suffix}`)
    const previous = Object.fromEntries(keys.map(key => [key, local.getItem(key)]))
    const backupKey = `${CAPSTONE_PREFIX}:before-${CAPSTONE_VERSION}`
    // Retain one local backup before the user-authorized, one-time replacement.
    if (!local.getItem(backupKey)) local.setItem(backupKey, JSON.stringify(previous))
    try {
      local.setItem(keys[0], JSON.stringify(createCapstonePlans()))
      local.setItem(keys[1], JSON.stringify(createCapstoneEvents()))
      local.setItem(keys[2], JSON.stringify(CAPSTONE_SCOPE))
      local.setItem(marker, CAPSTONE_VERSION)
    } catch (error) {
      for (const [key, value] of Object.entries(previous)) {
        try { if (value === null) local.removeItem(key); else local.setItem(key, value) } catch { /* Retry next login; version marker has not been written. */ }
      }
      throw error
    }
    try {
      for (const raw of [previous[keys[0]], local.getItem('culture-execution-plans-v1')]) {
        let plans
        try { plans = JSON.parse(raw || '{}') } catch { continue }
        for (const [id, plan] of Object.entries(plans || {})) {
          if (plan?.scope?.facility === CAPSTONE_FACILITY) session.removeItem(`culture-plan-draft:${id}`)
        }
      }
      session.removeItem(`${CAPSTONE_PREFIX}:event-draft`)
    } catch { /* Saved seed data remains usable when optional draft cleanup fails. */ }
    return { status: 'created' }
  } catch {
    return { status: 'error', error: '농업박물관 시연 자료를 준비하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 새로고침해 주세요.' }
  }
}
