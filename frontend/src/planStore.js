export const storageKey = 'culture-execution-plans-v1'
export const steps = {
  '시간대 운영': ['선택 시간대의 운영 가능 여부 확인', '안내·해설 인력과 프로그램 구성', '프로그램 시범 운영', '같은 조건으로 시간대별 방문 변화 점검'],
  '관객 프로그램': ['주요 관객 집단과 프로그램 대상 검토', '전시 소개·프로그램 내용 구성', '대상 프로그램 시범 운영', '연령·성별 방문 구성 변화 점검'],
  '방문 규모 점검': ['비교 기간과 누락 데이터 확인', '방문 변화에 대한 운영 가설 정리', '전시 안내·홍보 개선안 시범 운영', '다음 동일 길이 기간의 방문 변화 점검'],
  '평일·주말 운영': ['평일·주말의 관측일과 수요 차이 확인', '해설·체험 프로그램의 운영 요일 검토', '평일·주말 프로그램 시범 운영', '관측일 평균 방문 인구 변화 점검'],
  '월별 운영 준비': ['비교 월의 관측일 수와 운영 일정 확인', '방문 수요가 높았던 월의 인력·프로그램 준비', '월별 운영안 시범 적용', '월별 관측일 평균과 관객 구성 점검'],
  '시설 연계': ['시설 쌍 집계의 기간·기준 시설 확인', '후보 시설과 협력 가능 여부 검토', '공동 관람 안내 시범 운영', '시설 쌍별 월 집계 변화를 관찰'],
  '집계 범위 점검': ['새벽 집계의 시간·관객 분포 확인', '집계 범위와 실제 운영시간 내부 검토', '관람과 주변 활동을 구분할 수 있는지 점검', '점검 결과를 기록한 뒤 운영 전략 재검토'],
}
export const scopeLabel = scope => `${scope.facility || '전체 시설'} · ${scope.start_date} ~ ${scope.end_date} · ${scope.age || '20·30대'} · ${scope.sex === 'F' ? '여성' : scope.sex === 'M' ? '남성' : '전체 성별'}`
export const status = checks => checks.every(Boolean) ? '완료' : checks.some(Boolean) ? '진행 중' : '준비'

export function readPlans() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}')
    if (!value || Array.isArray(value) || typeof value !== 'object') return {}
    return Object.fromEntries(Object.entries(value).filter(([, plan]) => plan?.strategy?.goal && plan.scope && typeof plan.updated_at === 'string' && Array.isArray(plan.checks) && plan.checks.length === 4))
  } catch { return {} }
}


export function validatePlan(plan) {
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  return plan && typeof plan === 'object' && typeof plan.strategy?.title === 'string' && plan.strategy.title.length <= 500 && Object.hasOwn(steps, plan.strategy.goal) && typeof plan.strategy.action === 'string' && plan.strategy.action.length <= 10000 && typeof plan.scope?.facility === 'string' && date(plan.scope.start_date) && date(plan.scope.end_date) && plan.scope.start_date <= plan.scope.end_date && ['', '20대', '30대'].includes(plan.scope.age) && ['', 'F', 'M'].includes(plan.scope.sex) && typeof plan.owner === 'string' && plan.owner.length <= 80 && typeof plan.memo === 'string' && plan.memo.length <= 2000 && (plan.due === '' || date(plan.due)) && Array.isArray(plan.checks) && plan.checks.length === 4 && plan.checks.every(value => typeof value === 'boolean') && typeof plan.updated_at === 'string' && !Number.isNaN(Date.parse(plan.updated_at)) && (plan.archived === undefined || typeof plan.archived === 'boolean')
}

export function parseBackup(text) {
  const backup = JSON.parse(text)
  if (backup?.format !== 'culture-plans' || backup.version !== 1 || !backup.plans || typeof backup.plans !== 'object' || Array.isArray(backup.plans)) throw new Error('Museum Flow 실행 계획 백업 파일을 선택해 주세요.')
  const entries = Object.entries(backup.plans)
  if (entries.length > 5000 || entries.some(([id, plan]) => !validatePlan(plan) || id !== JSON.stringify([plan.scope.facility, plan.scope.start_date, plan.scope.end_date, plan.scope.age, plan.scope.sex, plan.strategy.goal]))) throw new Error('계획 형식이나 값이 올바르지 않아 가져오지 않았습니다.')
  return Object.fromEntries(entries)
}
