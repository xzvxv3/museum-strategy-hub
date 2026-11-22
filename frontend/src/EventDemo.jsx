import { useMemo, useState } from 'react'
import { Trend } from './Charts'
import { buildEventDemo, DEMO_SCENARIOS, DEMO_WINDOWS, DEMO_HOURS } from './eventDemoData.js'
import './EventDemo.css'

const number = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const change = value => `${value > 0 ? '+' : ''}${number(value)}%`

function Summary({ analysis }) {
  const maximum = Math.max(...analysis.periods.map(period => period.average), 1)
  return <div className="event-demo-summary" aria-label="행사 전 중 후 일평균 방문 인구">
    {analysis.periods.map(period => <section key={period.key} className={`event-demo-summary-card event-demo-${period.key}`}>
      <span>{period.label}</span>
      <strong>{number(period.average)}<small>명/일</small></strong>
      <div className="event-demo-track" aria-hidden="true"><i style={{ width: `${period.average / maximum * 100}%` }}/></div>
      <small>{period.startDate} ~ {period.endDate}</small>
    </section>)}
  </div>
}

function DetailTables({ analysis }) {
  const [before, during, after] = analysis.periods
  const timeShare = (period, index) => number(period.timeBands[index] / period.total * 100)
  return <details className="event-demo-details">
    <summary>관객 구성·시간대 자세히 보기</summary>
    <p>행사 전·중·후의 비중을 비교합니다. 구성비 변화는 해당 집단의 방문 인원 변화와 다를 수 있습니다.</p>
    <div className="event-demo-table-layout">
      <div className="event-demo-table-scroll" tabIndex={0} role="region" aria-label="관객 구성 상세표">
        <table><caption>20·30대 관객 구성</caption><thead><tr><th scope="col">관객층</th><th scope="col">전</th><th scope="col">중</th><th scope="col">후</th></tr></thead>
          <tbody>{analysis.duringShares.map(item => <tr key={item.name}><th scope="row">{item.name}</th><td>{number(item.before)}%</td><td>{number(item.during)}%</td><td>{number(item.after)}%</td></tr>)}</tbody>
        </table>
      </div>
      <div className="event-demo-table-scroll" tabIndex={0} role="region" aria-label="시간대 구성 상세표">
        <table><caption>시간대별 방문 비중 · 가상 운영시간 10~19시</caption><thead><tr><th scope="col">시간대</th><th scope="col">전</th><th scope="col">중</th><th scope="col">후</th></tr></thead>
          <tbody>{DEMO_HOURS.map((hour, index) => <tr key={hour}><th scope="row">{hour}</th><td>{timeShare(before, index)}%</td><td>{timeShare(during, index)}%</td><td>{timeShare(after, index)}%</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  </details>
}

export default function EventDemo({ onExit }) {
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id)
  const [windowDays, setWindowDays] = useState(28)
  const [phase, setPhase] = useState('during')
  const analysis = useMemo(() => buildEventDemo(scenarioId, windowDays), [scenarioId, windowDays])
  const selected = analysis.periods.find(period => period.key === phase) || analysis.periods[1]
  const volumeInsight = analysis.insights[0]
  const audienceInsight = analysis.insights[1]
  const timeInsight = analysis.insights[2]

  return <section className="event-demo" aria-label="시연용 가상 데이터 행사 분석">
    <div className="event-demo-intro">
      <div>
        <strong>예시 데이터</strong>
        <h2>가상 데이터로 살펴보는 분석 예시</h2>
        <p>실제 운영 기록이 아닌 예시 데이터입니다. 행사 전·중·후의 방문 변화와 운영 검토 방법을 살펴볼 수 있습니다.</p>
      </div>
      <button type="button" onClick={onExit}>실제 행사 분석으로</button>
    </div>

    <div className="event-demo-controls">
      <label>행사 사례
        <select value={scenarioId} aria-label="가상 행사 사례" onChange={event => { setScenarioId(event.target.value); setPhase('during') }}>
          {DEMO_SCENARIOS.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
        </select>
      </label>
      <label>전·후 비교 기간
        <select value={windowDays} aria-label="행사 전후 비교 기간" onChange={event => setWindowDays(Number(event.target.value))}>
          {DEMO_WINDOWS.map(days => <option key={days} value={days}>각 {days}일</option>)}
        </select>
      </label>
      <span>가상 행사: {analysis.eventStart} ~ {analysis.eventEnd}</span>
    </div>

    <div className="event-demo-heading"><h3>방문 인구는 어떻게 달라졌을까?</h3><p>세 구간의 일평균 방문 인구 · 시연용 가상값</p></div>
    <Summary analysis={analysis}/>
    <div className="event-demo-changes" aria-label="가상 방문 인구 변화율">
      <div><span>행사 중 / 이전</span><strong>{change(analysis.duringChange)}</strong></div>
      <div><span>행사 후 / 이전</span><strong>{change(analysis.change)}</strong></div>
      <p>전·후는 같은 일수로 비교했으며, 수치 차이가 행사의 직접적인 효과를 뜻하지는 않습니다.</p>
    </div>

    <section className="event-demo-chart" aria-labelledby="event-demo-chart-title">
      <div className="event-demo-chart-head">
        <div><h3 id="event-demo-chart-title">일별 방문 흐름</h3><p>살펴볼 기간을 선택하세요.</p></div>
        <div className="event-demo-phase" role="group" aria-label="일별 흐름 구간 선택">
          {analysis.periods.map(period => <button type="button" key={period.key} aria-pressed={phase === period.key} className={phase === period.key ? 'selected' : ''} onClick={() => setPhase(period.key)}>{period.label}</button>)}
        </div>
      </div>
      <p className="event-demo-range" aria-live="polite">{selected.startDate} ~ {selected.endDate} · 가상 방문 인구</p>
      <div className="event-demo-chart-body"><Trend key={`${scenarioId}-${windowDays}-${phase}`} items={selected.daily} mode="막대"/></div>
    </section>

    <section className="event-demo-conclusion" aria-labelledby="event-demo-conclusion-title">
      <h3 id="event-demo-conclusion-title">운영자가 얻을 수 있는 정보</h3>
      <div className="event-demo-findings">
        <p><b>방문 규모</b> {volumeInsight.observation}</p>
        <p><b>관객 변화</b> {audienceInsight.observation}</p>
        <p><b>시간대 특징</b> {timeInsight.observation}</p>
      </div>
      <div className="event-demo-recommendation"><strong>운영 검토 사항</strong><p>{analysis.operationTip}</p></div>
    </section>

    <DetailTables analysis={analysis}/>
    <p className="event-demo-disclaimer">※ 모든 행사·날짜·방문 인구는 시연을 위해 만든 가상 자료입니다. 기업 CSV·DB 및 운영자 일정에는 저장되지 않습니다. 실제 분석에는 행사 참여 기록, 휴관·계절 등 추가 요인 검토가 필요합니다.</p>
  </section>
}
