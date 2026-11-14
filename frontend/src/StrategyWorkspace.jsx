import { useState } from 'react'
import { Card, Icon, Bars } from './ui'
import { HourChart, Composition, Trend } from './Charts'
import PlanEditor from './PlanEditor'
import { readPlans, storageKey, scopeLabel } from './planStore'

const fmt = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
const evidenceText = text => text.replace(/(\d[\d,]*(?:\.\d+)?)명/g, (_, n) => `${fmt(n.replaceAll(',', ''))}명`)
const icons = { '시간대 운영': 'calendar', '관객 프로그램': 'user', '방문 규모 점검': 'chart', '평일·주말 운영': 'calendar', '월별 운영 준비': 'calendar', '시설 연계': 'museum', '집계 범위 점검': 'info' }
const categories = { '방문 확대': ['방문 규모 점검'], '운영 배치': ['시간대 운영', '평일·주말 운영', '월별 운영 준비', '집계 범위 점검'], '관객 구성': ['관객 프로그램'], '시설 연계': ['시설 연계'] }
function Evidence({ strategy, data }) {
  if (strategy.chart?.type === 'hours') return <HourChart items={data.breakdowns.hour}/>
  if (strategy.chart?.type === 'monthly') return <Card title="월별 관측일 평균 방문 인구"><Trend mode="막대" items={strategy.chart.items.map(row => ({ period: row.month, population: row.daily_average }))}/><p className="card-sub">월 전체가 선택되고 날짜의 80% 이상이 관측된 월의 평균입니다.</p></Card>
  if (strategy.chart?.type === 'day_types' || strategy.chart?.type === 'relations') {
    const relation = strategy.chart.type === 'relations'
    const rows = strategy.chart.items
    const max = Math.max(1, ...rows.map(row => Number(relation ? row.population : row.daily_average)))
    return <Card title={relation ? '연계 검토 후보 시설' : '평일·주말 관측일 평균 비교'}><Bars rows={rows.map(row => [row.label, Number(relation ? row.population : row.daily_average) / max * 100, `${fmt(relation ? row.population : row.daily_average)}명 · ${relation ? `${row.observed_months}개월` : `${row.observed_days}일`}`])}/><p className="card-sub">{relation ? `${strategy.chart.start_month} ~ ${strategy.chart.end_month} · ${strategy.chart.role || '기준 시설'}: ${strategy.chart.base_facility} · 월 전체 집계` : '평일 10일·주말 4일 이상 관측된 평균을 비교합니다.'}</p>{relation && <p className="chart-hint">{strategy.chart.note}</p>}</Card>
  }
  if (strategy.goal === '시간대 운영') return <HourChart items={data.breakdowns.hour}/>
  if (strategy.goal === '관객 프로그램') return <Composition items={data.audience}/>
  const period = strategy.chart?.type === 'period'
  const values = period ? strategy.chart.items.map(row => ({ ...row, population: row.daily_average })) : [{ label: '이전 기간', population: Number(data.comparison.population || 0), start_date: data.comparison.start_date, end_date: data.comparison.end_date }, { label: '선택 기간', population: Number(data.summary.population), start_date: data.range.start_date, end_date: data.range.end_date }]
  const max = Math.max(1, ...values.map(row => row.population))
  return <Card title={period ? '기간별 관측일 평균 방문 인구' : '동일 길이 기간의 방문 규모 비교'}><div className="period-comparison">{values.map((row, i) => <div key={row.label}><div className="comparison-column"><span style={{ height: `${row.population / max * 100}%`, background: i ? 'var(--primary)' : '#a7c2b7' }}/></div><b>{fmt(row.population)}명</b><span>{row.label}</span><small>{row.start_date} ~ {row.end_date}{row.observed_days != null && ` · 관측 ${row.observed_days}일`}</small></div>)}</div></Card>
}

function FacilityProfile({ data, facility, filters }) {
  const profile = data.facility_profile
  if (!profile) return null
  const recent = profile.recent_comparison
  return <section className="facility-profile" aria-label="시설별 방문 특성"><div className="facility-profile-heading"><h3>{facility || '전체 시설'}의 방문 특성</h3><span>관측 {profile.observed_days}일</span></div><div className="facility-profile-metrics">{[
    ['주말 / 평일 평균', profile.weekend_to_weekday_ratio == null ? '—' : `${profile.weekend_to_weekday_ratio.toFixed(2)}배`],
    ['상위 3시간 비중', `${(profile.top_three_hour_share * 100).toFixed(1)}%`],
    [filters.age || filters.sex ? '관객 집중도 판정' : profile.top_audience, filters.age || filters.sex ? '관객 필터로 제외' : `${(profile.top_audience_share * 100).toFixed(1)}%`],
    [`${recent.items[1]?.label || '비교 기간'} 평균 변화`, recent.change_percent == null ? '—' : `${recent.change_percent > 0 ? '+' : ''}${recent.change_percent.toFixed(1)}%`],
  ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><details className="strategy-diagnostics"><summary>전략 판정 근거 보기</summary><p>운영 검토를 위한 규칙 기준입니다. 통계적 유의성이나 기대 효과를 뜻하지 않습니다.</p>{data.strategy_diagnostics.map(rule => <div key={rule.code}><span className={rule.matched ? 'matched' : ''}>{rule.matched ? '제안' : '보류'}</span><b>{rule.goal}</b><p>{rule.reason}</p></div>)}</details></section>
}

export default function StrategyWorkspace({ data, filters, onViewPlans }) {
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [category, setCategory] = useState('전체')
  const [plans, setPlans] = useState(readPlans)
  const items = data.strategies
  const visible = items.filter(row => category === '전체' || categories[category].includes(row.goal))
  const selected = visible.find(row => row.goal === selectedGoal) || visible[0]
  const scope = { ...filters, start_date: data.range.start_date, end_date: data.range.end_date }
  const id = JSON.stringify([scope.facility, scope.start_date, scope.end_date, scope.age, scope.sex, selected?.goal])
  const save = (key, record) => {
    const next = { ...readPlans(), [key]: { ...record, archived: false } }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPlans(next); return true } catch { return false }
  }
  const peak = items[0]
  const insufficient = data.facility_profile && !data.facility_profile.supported
  return <div className="strategy-workspace">
    <section className="strategy-hero"><div className="strategy-hero-copy"><span className="eyebrow">FROM INSIGHT TO ACTION</span><h2>데이터를 읽고,<br/>다음 운영을 설계하세요.</h2></div><div className="strategy-hero-point"><span><Icon name="bulb" size={17}/>이번 기간의 운영 포인트</span><strong>{peak ? peak.title : insufficient ? '분석 범위를 넓혀 확인해 주세요' : data.summary.population > 0 ? '현재 방문 패턴 유지·관찰' : '분석할 방문 인구가 없습니다'}</strong><p>{peak ? evidenceText(peak.evidence) : insufficient ? '관측일과 분석 기간이 충분하지 않아 운영 패턴을 확정하지 않았습니다.' : data.summary.population > 0 ? '운영 조정 기준을 넘는 신호가 없어 전략을 일괄 생성하지 않았습니다.' : '시설·분석 기간·관객 조건을 변경해 보세요.'}</p></div></section>
    <FacilityProfile data={data} facility={filters.facility} filters={filters}/>
    <div className="strategy-category-tabs" role="group" aria-label="전략 분류">{['전체', ...Object.keys(categories)].map(value => <button key={value} aria-pressed={category === value} className={category === value ? 'selected' : ''} onClick={() => { setCategory(value); setSelectedGoal(null) }}>{value}<span>{items.filter(row => value === '전체' || categories[value].includes(row.goal)).length}</span></button>)}</div>
    {items.length ? <div className="strategy-workbench"><aside className="strategy-picker" aria-label="운영 전략 선택"><div className="strategy-list-heading"><h3>검토할 전략</h3><span>{visible.length}개</span></div>{visible.map((strategy, index) => <button key={strategy.goal} className={`strategy-select-card ${selected.goal === strategy.goal ? 'selected' : ''}`} aria-pressed={selected.goal === strategy.goal} onClick={() => setSelectedGoal(strategy.goal)}><span className="strategy-select-top"><span className="strategy-select-icon"><Icon name={icons[strategy.goal]} size={21}/></span><small>0{index + 1} / {strategy.goal}</small><Icon name="arrow" size={16}/></span><strong>{strategy.title}</strong><p>{evidenceText(strategy.evidence)}</p><span className="strategy-select-bottom">근거와 실행 계획 보기 <span>→</span></span></button>)}<p className="strategy-picker-note">전략 순서는 검토 항목의 분류이며 효과나 성공 확률의 순위가 아닙니다.</p></aside>
      {selected ? <section className="strategy-detail" aria-label="선택 전략 상세" key={id}><div className="strategy-detail-heading"><span className="eyebrow">{selected.goal}</span><h2>{selected.title}</h2><p>{scopeLabel(scope)}</p></div><div className="strategy-evidence"><span>근거 데이터</span><strong>{evidenceText(selected.evidence)}</strong></div><Evidence strategy={selected} data={data}/><div className="strategy-action-copy"><h3><Icon name="bulb" size={16}/>실행 방향</h3><p>{selected.action}</p><div><span>점검할 지표</span><b>{selected.metric}</b></div></div><PlanEditor {...{ id, scope }} strategy={selected} record={plans[id]} onSave={save} onViewPlans={onViewPlans}/></section> : <div className="card empty">현재 조건에 해당하는 분류의 전략이 없습니다. 다른 분류를 선택하거나 시설·기간을 변경해 주세요.</div>}
    </div> : <div className="card empty">{insufficient ? '관측이 부족해 전략 판정을 보류했습니다. 분석 기간을 넓혀 확인해 주세요.' : '현재 조건에서 운영 조정 기준에 해당하는 신호가 확인되지 않았습니다. 위의 전략 판정 근거에서 항목별 결과를 확인할 수 있습니다.'}</div>}

  </div>
}
