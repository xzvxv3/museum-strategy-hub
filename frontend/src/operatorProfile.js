// UI demonstration only. Server-side account authorization is not implemented.
// Facilities present in the supplied 2025 visit dataset.
export const demoOperators = [
  {
    "facility": "구세군역사박물관"
  },
  {
    "facility": "국립극장"
  },
  {
    "facility": "국토발전전시관"
  },
  {
    "facility": "농업박물관"
  },
  {
    "facility": "동대문역사문화공원동대문운동장기념관"
  },
  {
    "facility": "배재학당역사박물관"
  },
  {
    "facility": "샬트르성바오로수녀회역사박물관"
  },
  {
    "facility": "서소문성지역사박물관"
  },
  {
    "facility": "서울도시건축전시관"
  },
  {
    "facility": "서울시종합자료관"
  },
  {
    "facility": "손기정기념관"
  },
  {
    "facility": "은행사박물관"
  },
  {
    "facility": "이화여자고등학교유관순기념관"
  },
  {
    "facility": "종이나라박물관"
  },
  {
    "facility": "초전섬유앤퀄트박물관"
  },
  {
    "facility": "한국금융사박물관"
  },
  {
    "facility": "한국은행본점화폐금융박물관"
  }
].sort((a, b) => a.facility.localeCompare(b.facility, 'ko'))
export const quickOperators = [
  { facility: '농업박물관', note: '평일 중심 집계' },
  { facility: '종이나라박물관', note: '방문 규모 비교' },
  { facility: '은행사박물관', note: '시간대 패턴 비교' },
]
const defaultFacility = '농업박물관'
export const operatorSessionKey = 'museum-flow-operator-facility'
function rootSession() {
  try { return sessionStorage.getItem('museum-flow-account-role') === 'root' } catch { return false }
}
const isRoot = rootSession()
function currentFacility() {
  if (isRoot) return ''
  try {
    const saved = sessionStorage.getItem(operatorSessionKey)
    return demoOperators.some(operator => operator.facility === saved) ? saved : defaultFacility
  } catch { return defaultFacility }
}
export const operatorProfile = { facility: currentFacility(), isRoot, role: isRoot ? '총괄 운영자' : '운영 담당자' }
export const operatorStorage = suffix => operatorProfile.isRoot ? `museum-flow-root:${suffix}` : `museum-flow-operator:${operatorProfile.facility}:${suffix}`

export function startOperatorDemo(facility) {
  if (!demoOperators.some(operator => operator.facility === facility)) throw new Error('제공된 운영자 데모를 선택해 주세요.')
  // Reload initializes all facility-bound stores and page state for the chosen account.
  sessionStorage.setItem('museum-flow-account-role', 'operator')
  sessionStorage.setItem(operatorSessionKey, facility)
  sessionStorage.setItem('museum-flow-session', 'active')
  window.location.reload()
}

export function startRootDemo() {
  sessionStorage.setItem('museum-flow-account-role', 'root')
  sessionStorage.setItem('museum-flow-session', 'active')
  window.location.reload()
}
