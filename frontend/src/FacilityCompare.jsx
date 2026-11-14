import { useState } from 'react'
import { operatorProfile } from './operatorProfile.js'
import { Card } from './ui'
import useAnalysis from './useAnalysis'
import DateRangePicker from './DateRangePicker'
import { downloadCsv } from './downloads'

const fmt = v => v == null ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const colors = ['#176b68', '#5688a8', '#9b7440', '#7964a0']
const groups = [['20대', 'F'], ['20대', 'M'], ['30대', 'F'], ['30대', 'M']]
function CompareCard({ facility, filters, onSelect, facilities, selected, index }) {
  const resource = useAnalysis('dashboard', { ...filters, facility }, !!facility)
  const data = resource.data
  const calendarDays = data ? Math.round((Date.parse(data.range.end_date) - Date.parse(data.range.start_date)) / 86400000) + 1 : 0
  const total = data?.summary.population || 0
  const observed = data?.summary.observed_days || 0
  const hours = data?.breakdowns.hour || []
  const max = Math.max(0, ...hours.map(r => r.population))
  const weekdays = data?.breakdowns.weekday || []
  const weekend = weekdays.filter(r => r.category >= 6).reduce((s, r) => s + r.population, 0)
  const exportCard = () => downloadCsv(`${facility}_시설비교.csv`, [
    ['시설', '시작일', '종료일', '연령', '성별', '방문 인구 합계', '관측일', '선택 기간 일수', '관측일 비율(%)', '관측일 평균', '주말 비중(%)'],
    [facility, data.range.start_date, data.range.end_date, filters.age || '20·30대', filters.sex || '전체', observed ? total : '', observed, calendarDays, calendarDays ? observed / calendarDays * 100 : '', observed ? total / observed : '', total ? weekend / total * 100 : ''],
  ])
  return <section className="card compare-card">
    <div className="compare-number">{index === 0 ? (operatorProfile.isRoot ? '기준 시설' : '우리 박물관 · 기준 시설') : `비교 시설 ${index}`}</div>
    <label className="ops-field">시설 선택 {index + 1}<select disabled={!operatorProfile.isRoot && index === 0} value={facility} onChange={e => onSelect(e.target.value)}>{facilities.map(f => <option key={f} value={f} disabled={selected.includes(f) && f !== facility}>{f}</option>)}</select></label>
    {resource.loading && <p role="status">시설 데이터를 불러오는 중…</p>}
    {resource.error && <div role="alert"><p>{resource.error}</p><button className="outline" onClick={resource.retry}>다시 시도</button></div>}
    {data && <>
      <div className="compare-main"><span>관측일 평균 방문 인구</span><strong>{observed ? fmt(total / observed) : '—'}<small>명 / 일</small></strong><p>{observed}일 관측 · 합계 {observed ? fmt(total) : '—'}명</p></div>
      <div className="ops-coverage"><span>관측일 비율</span><strong>{calendarDays ? fmt(observed / calendarDays * 100) : '—'}%</strong><meter min="0" max={calendarDays || 1} value={observed} aria-label={`${facility} 관측일 비율`}/><small>{observed} / {calendarDays}일 · 하루에 하나 이상의 관측 행이 있는 날짜 기준</small>{observed < calendarDays && <p>일부 날짜에 관측이 없습니다. 다른 시설과 비교할 때 누락일 차이를 확인하세요.</p>}</div>
      <div className="ops-stat-line"><span>주말 방문 비중</span><b>{total > 0 ? `${fmt(weekend / total * 100)}%` : '—'}</b></div>
      <div className="ops-stat-line"><span>선택 기간</span><b>{data.range.start_date}<br/>{data.range.end_date}</b></div>
      <h3 className="ops-small-title">관객 구성</h3>
      <div className="compare-stack" role="img" aria-label={`${facility} 관객 구성`}>{groups.map(([age, sex], i) => {
        const value = data.audience.find(r => r.age === age && r.sex === sex)?.population || 0
        return <span key={age + sex} style={{ width: `${total ? value / total * 100 : 0}%`, background: colors[i] }}/>
      })}</div>
      <div className="compare-legend">{groups.map(([age, sex], i) => {
        const row = data.audience.find(r => r.age === age && r.sex === sex)
        return <div key={age + sex}><span><i style={{ background: colors[i] }}/>{age} {sex === 'F' ? '여성' : '남성'}</span><b>{row && total ? `${fmt(row.population / total * 100)}%` : '—'}</b></div>
      })}</div>
      <h3 className="ops-small-title">시간대 패턴 <small>시설 내부 최대값 기준</small></h3>
      <div className="compare-hours">{Array.from({ length: 24 }, (_, hour) => {
        const row = hours.find(r => r.category === hour)
        return <div key={hour} tabIndex="0" title={`${hour}시 · ${row ? fmt(row.population) + '명' : '관측 없음'}`} aria-label={`${hour}시 · ${row ? fmt(row.population) + '명' : '관측 없음'}`}><i style={{ height: `${row && max ? row.population / max * 100 : 0}%` }}/>{!row && <em>·</em>}</div>
      })}</div><div className="ops-axis"><span>00시</span><span>12시</span><span>23시</span></div>
      {!observed && <p className="ops-note">이 조건에 관측 행이 없습니다.</p>}
      <button className="outline" onClick={exportCard}>이 시설 비교값 CSV</button>
    </>}
  </section>
}
export default function FacilityCompare({ metadata, filters, onChange }) {
  const facilities = metadata.facilities
  const [selected, setSelected] = useState(() => {
    const base = operatorProfile.isRoot ? filters.facility || facilities[0] : operatorProfile.facility
    return [base, ...facilities.filter(f => f !== base)].slice(0, Math.min(3, facilities.length))
  })
  return <div className="ops-page">
    <div className="ops-intro"><span className="eyebrow">FACILITY BENCHMARK</span><h2>다른 시설과 나란히, 우리 관객의 특성 찾기</h2><p>규모·관객 구성·시간대 패턴을 동일한 기간과 관객 조건으로 비교합니다.</p></div>
    <Card title="공통 비교 조건"><div className="ops-form-grid">
      <div className="ops-span-2"><DateRangePicker start={filters.start_date} end={filters.end_date} min={metadata.visits.start_date} max={metadata.visits.end_date} onChange={(start, end) => onChange({ ...filters, start_date: start, end_date: end })}/></div>
      <label className="ops-field">연령<select value={filters.age} onChange={e => onChange({ ...filters, age: e.target.value })}><option value="">20·30대 전체</option><option>20대</option><option>30대</option></select></label>
      <label className="ops-field">성별<select value={filters.sex} onChange={e => onChange({ ...filters, sex: e.target.value })}><option value="">전체 성별</option><option value="F">여성</option><option value="M">남성</option></select></label>
    </div></Card>
    <div className="compare-grid">{selected.map((facility, index) => <CompareCard key={index} {...{ facility, facilities, filters, selected, index }} onSelect={value => setSelected(v => v.map((f, i) => i === index ? value : f))}/>)}</div>
    <p className="ops-note">20·30대 집계이며 고유 방문자 수가 아닙니다. 주말 비중은 합계 기준으로 요일별 일수를 보정하지 않습니다. 관측일 수와 누락 정도가 다른 시설의 단순 우열을 판단하지 마세요. —는 관측 없음 또는 비율 계산 불가입니다.</p>
  </div>
}
