import PageBanner from './PageBanner'
import { useRef, useState } from 'react'
import { Card, Icon, Bars } from './ui'
import { HourChart, Composition, Trend } from './Charts'
import PlanEditor from './PlanEditor'
import PlanModal from './PlanModal'
import { readPlans, storageKey } from './planStore'
import './StrategyWorkspace.css'

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
  const planDialog = useRef(null)
  const openPlan = () => {
    const panel = planDialog.current
    if (!panel) return
    panel.removeAttribute('style')
    panel.showModal()
  }
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
    <PageBanner eyebrow="FROM INSIGHT TO ACTION" title={<>데이터를 읽고,<br/>다음 운영을 설계하세요.</>} variant="strategy" label="운영전략 소개"/>
    <section className="strategy-point-panel"><div className="strategy-hero-point"><span><Icon name="bulb" size={17}/>이번 기간의 운영 포인트</span><strong>{peak ? peak.title : insufficient ? '분석 범위를 넓혀 확인해 주세요' : data.summary.population > 0 ? '현재 방문 패턴 유지·관찰' : '분석할 방문 인구가 없습니다'}</strong><p>{peak ? evidenceText(peak.evidence) : insufficient ? '관측일과 분석 기간이 충분하지 않아 운영 패턴을 확정하지 않았습니다.' : data.summary.population > 0 ? '운영 조정 기준을 넘는 신호가 없어 전략을 일괄 생성하지 않았습니다.' : '시설·분석 기간·관객 조건을 변경해 보세요.'}</p></div></section>
    <FacilityProfile data={data} facility={filters.facility} filters={filters}/>
    <div className="strategy-category-tabs" role="group" aria-label="전략 분류">{['전체', ...Object.keys(categories)].map(value => <button key={value} aria-pressed={category === value} className={category === value ? 'selected' : ''} onClick={() => { setCategory(value); setSelectedGoal(null) }}>{value}<span>{items.filter(row => value === '전체' || categories[value].includes(row.goal)).length}</span></button>)}</div>
    {items.length ? <div className="strategy-workbench"><section className="strategy-picker" aria-label="운영 전략 선택"><div className="strategy-list-heading"><h3>데이터 기반 운영 제안</h3></div><div className="strategy-proposal-grid">{visible.map((strategy, index) => <button key={strategy.goal} className={`strategy-select-card ${selected.goal === strategy.goal ? 'selected' : ''}`} aria-pressed={selected.goal === strategy.goal} onClick={() => setSelectedGoal(strategy.goal)}><span className="strategy-select-top"><span className="strategy-select-icon"><Icon name={icons[strategy.goal]} size={21}/></span><small>0{index + 1} / {strategy.goal}</small><Icon name="arrow" size={16}/></span><strong>{strategy.title}</strong><p>{evidenceText(strategy.evidence)}</p><span className="strategy-select-bottom">근거 확인하고 계획 세우기 <span>→</span></span></button>)}</div></section>
      {selected ? <section className="strategy-detail" aria-label="선택 전략 상세" key={id}><div className="strategy-detail-heading"><span className="eyebrow">{selected.goal}</span><h2>{selected.title}</h2><dl className="strategy-scope" aria-label="선택 전략의 분석 조건">
          <div className="strategy-scope-facility"><dt><Icon name="museum" size={16}/>시설</dt><dd>{scope.facility || '전체 시설'}</dd></div>
          <div><dt><Icon name="calendar" size={16}/>분석 기간</dt><dd><time dateTime={scope.start_date}>{scope.start_date}</time><span aria-hidden="true"> ~ </span><time dateTime={scope.end_date}>{scope.end_date}</time></dd></div>
          <div><dt><Icon name="user" size={16}/>관객</dt><dd>{scope.age || '20·30대'} · {scope.sex === 'F' ? '여성' : scope.sex === 'M' ? '남성' : '전체 성별'}</dd></div>
        </dl></div><div className="strategy-review-grid"><div className="strategy-review-evidence"><div className="strategy-evidence"><span>① 전략 제안 근거</span><strong>{evidenceText(selected.evidence)}</strong></div><Evidence strategy={selected} data={data}/></div><section className="strategy-action-copy" aria-label="권장 실행 방향">
          <header className="strategy-action-heading"><span className="strategy-action-icon"><Icon name="bulb" size={23}/></span><div><span className="strategy-action-eyebrow">② 실행 제안</span><h3>권장 실행 방향</h3></div></header>
          <div className="strategy-action-body"><span className="strategy-action-label">무엇을 할까요?</span><p>{selected.action}</p></div>
          <div className="strategy-action-metric"><span className="strategy-metric-icon"><Icon name="chart" size={19}/></span><div><span>점검할 지표</span><strong>{selected.metric}</strong></div></div>
          <footer className="strategy-action-footer"><button type="button" className="primary strategy-action-start" onClick={openPlan}><Icon name="file" size={16}/><span>{plans[id] ? '저장한 실행 계획 수정하기' : '이 전략으로 계획 만들기'}</span><Icon name="arrow" size={16}/></button></footer>
        </section></div><PlanModal dialogRef={planDialog} title={selected.title}><PlanEditor {...{ id, scope }} strategy={selected} record={plans[id]} onSave={(key, record) => { const saved = save(key, record); if (saved) planDialog.current.close(); return saved }} onCancel={() => planDialog.current.close()} onViewPlans={onViewPlans}/></PlanModal></section> : <div className="card empty">현재 조건에 해당하는 분류의 전략이 없습니다. 다른 분류를 선택하거나 시설·기간을 변경해 주세요.</div>}
    </div> : <div className="card empty">{insufficient ? '관측이 부족해 전략 판정을 보류했습니다. 분석 기간을 넓혀 확인해 주세요.' : '현재 조건에서 운영 조정 기준에 해당하는 신호가 확인되지 않았습니다. 위의 전략 판정 근거에서 항목별 결과를 확인할 수 있습니다.'}</div>}

  </div>
}
