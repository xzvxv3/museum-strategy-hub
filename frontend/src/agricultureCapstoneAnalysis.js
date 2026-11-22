import { CAPSTONE_SOURCE, CAPSTONE_FACILITY, CAPSTONE_SCENARIOS } from './agricultureCapstoneData.js'
import { shiftDate, validDate } from './eventStore.js'

const demographics = [['20대', 'F'], ['20대', 'M'], ['30대', 'F'], ['30대', 'M']]
const sourceLabel = '캡스톤 시연용 가상 방문 데이터'
const beforeShares = [0.20, 0.17, 0.38, 0.25]
const afterShares = [0.21, 0.16, 0.43, 0.20]

function allocate(total, shares) {
  const raw = shares.map(share => total * share)
  const result = raw.map(Math.floor)
  const order = raw.map((value, i) => ({ i, fraction: value - result[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  const remainder = total - result.reduce((sum, n) => sum + n, 0)
  for (let i = 0; i < remainder; i++) result[order[i].i] += 1
  return result
}

export function buildAgricultureCapstoneAnalysis(event, windowDays = 28) {
  const scenario = CAPSTONE_SCENARIOS[event.demoScenario]
  if (event.demoSource !== CAPSTONE_SOURCE || event.facility !== CAPSTONE_FACILITY || !scenario) return null
  if (![7, 14, 28, 56].includes(windowDays) || !validDate(event.start) || !validDate(event.end) || event.start > event.end) return null
  const definitions = [
    ['before', '행사 전', shiftDate(event.start, -windowDays), shiftDate(event.start, -1), 1],
    ['during', '행사 중', event.start, event.end, scenario.duringRate],
    ['after', '행사 후', shiftDate(event.end, 1), shiftDate(event.end, windowDays), scenario.afterRate],
  ]
  const periods = definitions.map(([key, label, start, end, rate]) => {
    const daily = [], audience = demographics.map(([age, sex]) => ({ age, sex, population: 0 }))
    const weekdays = Array.from({ length: 7 }, () => [])
    for (let day = start; day <= end; day = shiftDate(day, 1)) {
      const epoch = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000)
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
      const factor = [0.72, 1.00, 1.06, 1.02, 1.08, 1.10, 0.80][weekday]
      const total = Math.round(scenario.baseline * rate * factor * (1 + ((epoch % 9) - 4) / 300))
      const byGroup = allocate(total, key === 'before' ? beforeShares : afterShares)
      const included = demographics.map(([age, sex], i) => (!event.age || event.age === age) && (!event.sex || event.sex === sex) ? byGroup[i] : 0)
      const population = included.reduce((sum, value) => sum + value, 0)
      included.forEach((value, i) => { audience[i].population += value })
      daily.push({ period: day, population })
      weekdays[weekday].push(population)
    }
    const population = daily.reduce((sum, row) => sum + row.population, 0)
    const adjusted = weekdays.every(values => values.length) ? weekdays.reduce((sum, values) => sum + values.reduce((n, v) => n + v, 0) / values.length, 0) / 7 : null
    return { key, label, start_date: start, end_date: end, calendar_days: daily.length, observed_days: daily.length, coverage: 1, population, daily_average: population / daily.length, weekday_adjusted_average: adjusted, ready: true, reason: null, daily, audience }
  })
  const [before, , after] = periods
  return {
    synthetic: true, source: CAPSTONE_SOURCE, sourceLabel, facility: event.facility, window_days: windowDays,
    periods, comparison_available: true, change_percent: (after.weekday_adjusted_average / before.weekday_adjusted_average - 1) * 100, comparison_reason: null,
    notes: [
      `${sourceLabel}입니다. 실제 기업 CSV·DB에서 산출한 행사 성과가 아닙니다.`,
      '행사 전·중·후 일별 가상 방문 수를 먼저 생성하고 합계·평균·관객 구성·변화율을 같은 자료로 계산합니다.',
      '요일별 평균을 계산한 뒤 7개 요일을 동일 가중치로 평균합니다. 비교 기간을 바꿔도 같은 날짜의 가상 방문 수는 유지됩니다.',
      '개선된 흐름을 보여주기 위한 시나리오이며 실제 효과·인과관계·예측 정확도를 주장하지 않습니다.',
    ],
  }
}
