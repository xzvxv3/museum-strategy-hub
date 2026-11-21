// Self-contained, deterministic presentation fixtures. Never derived from or written to company CSV/DB.
// Dates and numbers are wholly fictional; they are not forecasts or event-effect estimates.
export const DEMO_WINDOWS = [7, 14, 28, 56]
export const DEMO_GROUPS = ['20대 여성', '20대 남성', '30대 여성', '30대 남성']
export const DEMO_HOURS = ['10~12시', '12~14시', '14~17시', '17~19시']

export const DEMO_SCENARIOS = [
  {
    id: 'special-exhibition', title: '특별 전시 개최', start: '2026-05-15', days: 3,
    baseline: 126, duringRate: 1.78, afterRate: 1.19,
    sharesBefore: [0.29, 0.22, 0.28, 0.21], sharesDuring: [0.38, 0.24, 0.23, 0.15], sharesAfter: [0.34, 0.23, 0.25, 0.18],
    hoursBefore: [0.24, 0.35, 0.30, 0.11], hoursDuring: [0.17, 0.36, 0.39, 0.08], hoursAfter: [0.22, 0.35, 0.34, 0.09],
    description: '특별 전시 기간에 방문이 늘고 종료 후에도 일부 증가가 이어지는 가상 사례',
  },
  {
    id: 'weekend-program', title: '주말 체험 프로그램', start: '2026-06-12', days: 3,
    baseline: 112, duringRate: 1.55, afterRate: 1.06,
    sharesBefore: [0.22, 0.19, 0.32, 0.27], sharesDuring: [0.27, 0.20, 0.32, 0.21], sharesAfter: [0.23, 0.19, 0.34, 0.24],
    hoursBefore: [0.22, 0.34, 0.33, 0.11], hoursDuring: [0.30, 0.41, 0.24, 0.05], hoursAfter: [0.24, 0.36, 0.31, 0.09],
    description: '행사 중에는 방문이 늘지만 종료 이후에는 평소 수준에 가깝게 돌아오는 가상 사례',
  },
  {
    id: 'community-night', title: '지역 협력 문화 행사', start: '2026-08-14', days: 3,
    baseline: 138, duringRate: 1.38, afterRate: 0.94,
    sharesBefore: [0.26, 0.23, 0.28, 0.23], sharesDuring: [0.33, 0.25, 0.25, 0.17], sharesAfter: [0.25, 0.22, 0.29, 0.24],
    hoursBefore: [0.21, 0.36, 0.31, 0.12], hoursDuring: [0.19, 0.30, 0.33, 0.18], hoursAfter: [0.22, 0.35, 0.31, 0.12],
    description: '행사 이후 방문이 평소보다 조금 줄어드는 경우도 함께 살펴보는 가상 사례',
  },
]

export function shiftDemoDate(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

// Allocate integer visits without rounding drift: parts always add exactly to the daily total.
function splitVisits(total, fractions) {
  const fractionsSum = fractions.reduce((sum, value) => sum + value, 0)
  if (!(fractionsSum > 0)) throw new Error('Invalid demo proportions')
  const weighted = fractions.map(value => (value / fractionsSum) * total)
  const base = weighted.map(Math.floor)
  const remainder = total - base.reduce((sum, value) => sum + value, 0)
  const order = weighted.map((value, index) => ({ index, fraction: value - base[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let i = 0; i < remainder; i += 1) base[order[i].index] += 1
  return base
}

function makePeriod(scenario, key, label, startOffset, duration, rate, share, hours) {
  const daily = []
  const audience = Array(DEMO_GROUPS.length).fill(0)
  const timeBands = Array(DEMO_HOURS.length).fill(0)
  for (let index = 0; index < duration; index += 1) {
    const date = shiftDemoDate(scenario.start, startOffset + index)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const weekdayFactor = [1.23, 0.80, 0.86, 0.90, 0.96, 1.10, 1.32][weekday]
    const rhythm = 1 + ((index * 7 + scenario.baseline) % 9 - 4) / 100
    const population = Math.max(0, Math.round(scenario.baseline * rate * weekdayFactor * rhythm))
    const byAudience = splitVisits(population, share)
    const byHour = splitVisits(population, hours)
    byAudience.forEach((value, i) => { audience[i] += value })
    byHour.forEach((value, i) => { timeBands[i] += value })
    daily.push({ period: date, population })
  }
  const total = daily.reduce((sum, row) => sum + row.population, 0)
  return { key, label, startDate: daily[0].period, endDate: daily.at(-1).period,
    days: duration, total, average: total / duration, daily, audience, timeBands }
}

export function buildEventDemo(scenarioId = DEMO_SCENARIOS[0].id, windowDays = 28) {
  if (!DEMO_WINDOWS.includes(windowDays)) throw new Error('지원하지 않는 비교 기간입니다.')
  const scenario = DEMO_SCENARIOS.find(item => item.id === scenarioId)
  if (!scenario) throw new Error('지원하지 않는 시연 시나리오입니다.')
  const periods = [
    makePeriod(scenario, 'before', '행사 전', -windowDays, windowDays, 1, scenario.sharesBefore, scenario.hoursBefore),
    makePeriod(scenario, 'during', '행사 중', 0, scenario.days, scenario.duringRate, scenario.sharesDuring, scenario.hoursDuring),
    makePeriod(scenario, 'after', '행사 후', scenario.days, windowDays, scenario.afterRate, scenario.sharesAfter, scenario.hoursAfter),
  ]
  const [before, during, after] = periods
  const change = (after.average / before.average - 1) * 100
  const duringChange = (during.average / before.average - 1) * 100
  const shareChange = DEMO_GROUPS.map((name, index) => ({
    name,
    before: before.audience[index] / before.total * 100,
    after: after.audience[index] / after.total * 100,
  }))
  const mostChangedGroup = [...shareChange].sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))[0]
  const peakHourIndex = during.timeBands.indexOf(Math.max(...during.timeBands))
  const highestShiftIndex = shareChange.reduce((best, row, idx, arr) =>
    Math.abs(row.after - row.before) > Math.abs(arr[best].after - arr[best].before) ? idx : best, 0)
  const duringShares = DEMO_GROUPS.map((name, index) => ({
    name,
    before: (before.audience[index] / before.total) * 100,
    during: (during.audience[index] / during.total) * 100,
    after: (after.audience[index] / after.total) * 100,
  }))
  const peakBand = DEMO_HOURS[peakHourIndex]
  const peakBandShare = (during.timeBands[peakHourIndex] / during.total) * 100
  const compositionShift = duringShares[highestShiftIndex]
  const insights = [
    {
      title: '방문 규모 변화',
      metric: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
      observation: `행사 후 일평균 ${after.average.toFixed(1)}명, 행사 전 ${before.average.toFixed(1)}명(시연 가상값)`,
      action: change >= 10
        ? '행사 후 흐름이 이어지는 상황을 가정했습니다. 후속 프로그램 시기와 안내 동선을 점검해 보세요.'
        : change >= 0
          ? '행사 중 집중과 종료 후 유지 수준을 구분해 보세요. 재방문 유도 안내를 검토할 수 있습니다.'
          : '종료 후 하락하는 상황도 가능하므로 운영 성과를 행사 중 수치만으로 판단하지 마세요.',
    },
    {
      title: '관객 구성 변화',
      metric: `${compositionShift.after - compositionShift.before >= 0 ? '+' : ''}${(compositionShift.after - compositionShift.before).toFixed(1)}%p`,
      observation: `${compositionShift.name}의 행사 전·후 구성비 차이(시연 가상값)`,
      action: '특정 관객층의 구성비 변화는 그 집단의 방문 인원 증가를 뜻하지 않을 수 있습니다. 홍보 채널별 실제 참여 기록과 함께 살펴보세요.',
    },
    {
      title: '운영 시간대',
      metric: peakBand,
      observation: `행사 중 해당 시간대 비중 ${peakBandShare.toFixed(1)}%(시연 가상값)`,
      action: '행사 중 집중 시간대에 안내 인력과 체험 대기 공간을 배치하는 방안을 점검해 보세요. 실제 개관시간과는 별도 확인이 필요합니다.',
    },
  ]
  const operationTip = change >= 12
    ? '행사 종료 후에도 방문 수준이 높게 유지되는 가상 상황입니다. 후속 전시·홍보 일정과 인력 배치를 검토해 볼 수 있습니다.'
    : change >= 0
      ? '행사 중 증가에 비해 종료 후 변화는 작습니다. 재방문을 유도할 후속 프로그램을 검토해 볼 수 있습니다.'
      : '행사 중 방문이 증가해도 종료 후에는 줄어들 수 있습니다. 평소 방문 추이와 계절·다른 행사 영향을 함께 점검해 보세요.'
  return {
    source: 'synthetic-demo', scenarioId, scenarioTitle: scenario.title,
    description: scenario.description, eventStart: scenario.start,
    eventEnd: shiftDemoDate(scenario.start, scenario.days - 1), windowDays,
    periods, change, duringChange, shareChange, mostChangedGroup,
    peakHourIndex, operationTip, insights, duringShares, highestShiftIndex,
  }
}
