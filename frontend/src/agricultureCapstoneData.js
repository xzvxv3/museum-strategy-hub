import strategies from './agricultureCapstoneStrategies.json' with { type: 'json' }

export const CAPSTONE_FACILITY = '농업박물관'
export const CAPSTONE_SOURCE = 'agriculture-capstone-synthetic-v1'
export const CAPSTONE_VERSION = '2026-11-capstone-v1'
export const CAPSTONE_PREFIX = `museum-flow-operator:${CAPSTONE_FACILITY}`
export const CAPSTONE_SCOPE = { facility: CAPSTONE_FACILITY, start_date: '2025-01-01', end_date: '2025-12-31', age: '', sex: '' }
export const CAPSTONE_SCHEDULE_VERSION = 'weekday-2026-11-12-v1'
export const CAPSTONE_WEEKDAY_PERIOD = { start: '2026-11-12', end: '2026-11-23' }

// Fictional operations and outcomes for a capstone presentation. Never actual event records.
export const CAPSTONE_SCENARIOS = {
  'autumn-recovery': { baseline: 200, duringRate: 1.48, afterRate: 1.24, targetAge: '30대', targetSex: 'F' },
  'weekday-experience': { baseline: 260, duringRate: 1.36, afterRate: 1.16, targetAge: '30대', targetSex: 'F' },
}
export const isAgricultureCapstoneScenario = value => value?.demoSource === CAPSTONE_SOURCE &&
  Object.hasOwn(CAPSTONE_SCENARIOS, value.demoScenario || '') &&
  (value.analysisFacility || value.facility || value.scope?.facility) === CAPSTONE_FACILITY
const templates = {
  '방문 규모 점검': {
    owner: '전시홍보팀', executionStart: '2026-04-06', executionEnd: '2026-04-19', workflowStatus: '완료', eventType: '행사', demoScenario: 'autumn-recovery',
    purpose: '최근 방문 감소에 대응해 봄 농업문화 전시 안내와 주말 체험을 묶은 홍보 캠페인을 시범 운영한다. 전시 입구 안내·온라인 게시물·현장 체험 동선을 함께 점검한다.',
    successCriteria: '전시 안내물 3종을 개편하고 체험 안내를 4회 운영한다. 행사 전후 각 28일의 요일 보정 일평균 방문 인구와 현장 의견을 기록한다.',
    memo: '캡스톤 시연용 계획입니다. 1주차에는 안내물과 온라인 홍보를 정비하고, 2주차에는 현장 체험과 전시 해설을 연계합니다. 과거 전체 기간의 전략 근거와 아래 가상 실행 성과는 서로 다른 자료입니다.',
    outcome: '시연 가정: 안내물 3종 개편과 체험 안내 4회를 마쳤다. 가상 방문 자료에서는 행사 후 요일 보정 일평균이 행사 전보다 약 24% 높아진 상황을 구성했다. 실제 측정 성과가 아니며 캠페인의 인과적 효과를 입증하지 않는다.',
  },
  '평일·주말 운영': {
    owner: '교육체험팀', executionStart: CAPSTONE_WEEKDAY_PERIOD.start, executionEnd: CAPSTONE_WEEKDAY_PERIOD.end, workflowStatus: '완료', eventType: '행사', demoScenario: 'weekday-experience',
    purpose: '상대적으로 높은 평일 수요에 맞춰 점심 이후 농기구 해설과 짧은 곡물 체험을 연계한다. 30대 관객을 포함한 방문자의 안내 접근성을 점검한다.',
    successCriteria: '평일 해설·체험을 8회 운영하고 안내 인력 2명을 배치한다. 전후 각 28일의 방문 흐름과 20·30대 관객 구성을 같은 기준으로 비교한다.',
    memo: '캡스톤 시연용 계획입니다. 해설은 13시·15시를 중심으로 운영하고, 체험은 약 15분으로 구성합니다. 휴관일과 중복 일정은 별도로 확인하며 주말 운영 축소를 전제로 하지 않습니다.',
    outcome: '시연 가정: 평일 해설·체험 8회 운영을 완료했다. 가상 방문 자료에서는 행사 후 요일 보정 일평균이 약 16% 높고, 주요 관객 집단의 구성비도 소폭 높아진 예시를 보여준다. 실제 참여자 조사나 실제 행사 성과가 아니다.',
  },
  '월별 운영 준비': {
    owner: '전시운영팀', executionStart: '2027-03-15', executionEnd: '2027-04-04', workflowStatus: '준비', eventType: '',
    purpose: '과거 4월의 집중 수요를 참고해 전시 안내 인력·체험 재료·대기 동선의 월별 운영안을 준비한다. 다음 해에도 같은 수요가 반복된다고 단정하지 않는다.',
    successCriteria: '개관·휴관 일정을 확인하고 인력 배치표 1부, 체험 재료 점검표 1부, 혼잡 시간 대응안을 작성해 담당 팀 검토를 받는다.',
    memo: '캡스톤 시연용 준비 계획입니다. 첫 주에는 운영 일정과 재고를 확인하고, 둘째 주에는 해설 인력과 동선을 검토합니다. 실제 실행 전이므로 실행 결과와 성과 수치는 입력하지 않습니다.',
    outcome: '',
  },
}

export function createCapstonePlans() {
  return Object.fromEntries(strategies.map(strategy => {
    const template = templates[strategy.goal]
    const id = JSON.stringify([CAPSTONE_SCOPE.facility, CAPSTONE_SCOPE.start_date, CAPSTONE_SCOPE.end_date, '', '', strategy.goal])
    return [id, {
      strategy: { ...strategy }, scope: { ...CAPSTONE_SCOPE }, ...template,
      due: template.executionEnd,
      actualStart: template.workflowStatus === '완료' ? template.executionStart : '',
      actualEnd: template.workflowStatus === '완료' ? template.executionEnd : '',
      checks: [false, false, false, false], archived: false,
      linkAnalysis: template.workflowStatus === '완료',
      demoSource: CAPSTONE_SOURCE, updated_at: '2026-11-22T00:00:00.000Z',
    }]
  }))
}

export function createCapstoneEvents() {
  return [
    ['briefing', '팀 운영 브리핑 · 해설 안내 개선 회고', '2026-11-23', '홍보팀·교육팀이 시연 결과와 다음 운영 체크 사항을 공유합니다.'],
    ['signage', '전시 안내물·QR 링크 점검', '2026-11-25', '입구 안내판과 모바일 안내 링크를 짧게 점검합니다.'],
    ['inventory', '체험 재료 재고·안전 점검', '2026-11-27', '곡물 체험 재료 수량과 도구 상태를 확인합니다.'],
    ['planning', '4월 운영안 사전 검토 회의', '2026-12-01', '준비 단계 실행 계획의 담당·일정·필요 인력을 확인합니다.'],
  ].map(([id, title, day, memo]) => ({ id: `agri-capstone-${id}`, title, facility: CAPSTONE_FACILITY, type: '운영', start: day, end: day, age: '', sex: '', memo: `캡스톤 시연용 가상 일정. ${memo}`, demoSource: CAPSTONE_SOURCE }))
}
