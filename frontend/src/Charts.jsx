import { useState } from 'react'
import { Card } from './ui'

const number = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
const palette = ['#176B68', '#5688A8', '#9B7440', '#7964A0']
const groupColor = row => palette[(row.age === '30대' ? 2 : 0) + (row.sex === 'M' ? 1 : 0)]

export function WeekHourHeatmap({ items = [], audience = [], hourStart = 0, hourEnd = 23 }) {
  const [active, setActive] = useState(null)
  const [picked, setPicked] = useState(null)
  const days = ['월', '화', '수', '목', '금', '토', '일']
  const cells = new Map(items.map(row => [`${row.weekday}-${row.hour}`, row]))
  const maximum = Math.max(0, ...items.map(row => Number(row.population)))
  const peak = items.find(row => Number(row.population) === maximum && maximum > 0)
  const describe = key => {
    const [day, hour] = key.split('-').map(Number)
    const row = cells.get(key)
    const prefix = `${days[day - 1]}요일 ${String(hour).padStart(2, '0')}시`
    if (hour < hourStart || hour > hourEnd) return `${prefix} · 선택 시간 범위 밖`
    if (!row) return `${prefix} · 데이터 없음 (0명과 다름)`
    return `${prefix} · ${number(row.population)}명 · 관측 ${row.observed_days}일 (${number(row.observed_rows)}행)`
  }
  const readout = active ? describe(active) : peak ? `최다 ${describe(`${peak.weekday}-${peak.hour}`)}` : '방문 인구가 없거나 관측 행이 없습니다.'
  const pickedCell = picked ? cells.get(picked) : null
  const detail = picked ? audience.filter(row => `${row.weekday}-${row.hour}` === picked) : []
  return <Card title="요일 × 시간대 방문 히트맵" className="heatmap-card">
    <div className="heatmap-readout" aria-live="polite">{readout}</div>
    <div className="heatmap-scroll" tabIndex="0" role="region" aria-label="요일 시간대 히트맵 표, 작은 화면에서 좌우로 스크롤">
      <table className="heatmap-table"><caption className="sr-only">요일별 00~23시 방문 인구 합계. 각 칸을 선택하면 값을 확인할 수 있습니다.</caption>
        <thead><tr><th scope="col">요일 / 시</th>{Array.from({ length: 24 }, (_, hour) => <th scope="col" key={hour}>{String(hour).padStart(2, '0')}</th>)}</tr></thead>
        <tbody>{days.map((day, index) => <tr key={day}><th scope="row">{day}</th>{Array.from({ length: 24 }, (_, hour) => {
          const key = `${index + 1}-${hour}`
          const row = cells.get(key)
          const outside = hour < hourStart || hour > hourEnd
          const value = Number(row?.population || 0)
          const isPeak = row && maximum > 0 && value === maximum
          const level = value > 0 ? Math.min(5, Math.max(1, Math.ceil(value / maximum * 5))) : 0
          return <td key={hour}><button type="button" className={`heat-cell ${outside ? 'excluded' : !row || value === 0 ? 'empty-value' : `level-${level}`} ${isPeak ? 'is-peak' : ''} ${picked === key ? 'is-selected' : ''}`} aria-label={describe(key)} aria-pressed={picked === key} title={describe(key)} onMouseEnter={() => setActive(key)} onFocus={() => setActive(key)} onClick={() => { setActive(key); setPicked(key) }}>{outside ? '×' : !row || value === 0 ? '' : isPeak ? '★' : ''}</button></td>
        })}</tr>)}</tbody>
      </table>
    </div>
    <div className="heatmap-legend"><span>적음</span>{[1, 2, 3, 4, 5].map(level => <i key={level} className={`level-${level}`} aria-hidden="true"/>)}<span>많음 · 최대 {number(maximum)}명</span><span>★ 최다</span></div>
    {picked && <section className="heatmap-detail" aria-label="선택 시간대 상세"><div className="detail-heading"><div><span className="eyebrow">SELECTED SEGMENT</span><h3>{describe(picked)}</h3></div><button className="outline" onClick={() => { setPicked(null); setActive(null) }}>선택 해제</button></div>{pickedCell ? <><div className="detail-metrics"><div><span>방문 인구</span><strong>{number(pickedCell.population)}<small>명</small></strong></div><div><span>관측일 수</span><strong>{pickedCell.observed_days}<small>일</small></strong></div><div><span>선택 범위 내 비중</span><strong>{items.reduce((s, r) => s + Number(r.population), 0) > 0 ? (pickedCell.population / items.reduce((s, r) => s + Number(r.population), 0) * 100).toFixed(1) : '—'}<small>%</small></strong></div></div><Composition items={detail}/></> : <p className="definition-note">선택 시간 범위 밖이거나 관측 행이 없어 상세 구성을 표시할 수 없습니다.</p>}</section>}
  </Card>
}

function scaleFor(values) {
  const max = Math.max(1, ...values.map(Number))
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map(n => n * magnitude).find(n => n >= rough))
  const top = Math.ceil(max / step) * step
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
}

export function Trend({ items, mode }) {
  const [active, setActive] = useState(null)
  const { top, ticks } = scaleFor(items.map(r => r.population))
  const x = i => 78 + i * 608 / Math.max(1, items.length - 1)
  const y = v => 220 - Number(v) / top * 170
  const peak = items.reduce((best, row, i) => Number(row.population) > Number(items[best]?.population ?? -1) ? i : best, 0)
  if (!items.length) return <p className="empty">해당 기간의 관측 행이 없습니다.</p>
  if (mode === '원형') {
    const total = items.reduce((s, r) => s + Number(r.population), 0)
    let cumulative = 0
    const slices = items.map((r, i) => { const start = cumulative; cumulative += total ? Number(r.population) / total * 100 : 0; return `hsl(${135 + i * 27} 28% 55%) ${start}% ${cumulative}%` })
    return <div className="donut-wrap live-donut-wrap"><div className="donut" style={{ background: total ? `conic-gradient(${slices.join(',')})` : '#edf2e7' }}><div><strong>{number(total)}</strong><small>방문 인구 합계</small></div></div><div className="pie-legend">{items.map((r, i) => <p className="pie-label" key={r.period}><i style={{ background: `hsl(${135 + i * 27} 28% 55%)` }}/>{r.period}<b>{total ? (r.population / total * 100).toFixed(1) : '0.0'}%</b></p>)}</div></div>
  }
  const selected = active == null ? null : items[active]
  return <div className="analytical-chart" style={{ '--chart-color': '#5688a8' }}><div className="chart-readout"><span><i/>방문 인구 <small>단위: 명</small></span><b>{selected ? `${selected.period} · ${number(selected.population)}명` : `최다 ${items[peak].period} · ${number(items[peak].population)}명`}</b></div>
    <svg className="trend enhanced-trend" viewBox="0 0 720 260" role="img" aria-label="선택 기간 방문 인구 추이" onMouseLeave={() => setActive(null)}>
      {ticks.map(tick => <g key={tick}><line x1="70" x2="700" y1={y(tick)} y2={y(tick)} stroke="#e2e9e2"/><text x="61" y={y(tick) + 4} textAnchor="end">{number(tick)}</text></g>)}
      {mode === '선형' && <><path d={`M${x(0)},220 ${items.map((r, i) => `L${x(i)},${y(r.population)}`).join(' ')} L${x(items.length - 1)},220 Z`} fill="var(--chart-color)" opacity=".11"/><polyline points={items.map((r, i) => `${x(i)},${y(r.population)}`).join(' ')} fill="none" stroke="var(--chart-color)" strokeWidth="2.5" strokeLinejoin="round"/></>}
      {active != null && <line x1={x(active)} x2={x(active)} y1="40" y2="220" stroke="#8da592" strokeDasharray="4 4"/>}
      {items.map((r, i) => <g key={r.period}>
        {mode === '막대' ? <rect x={x(i) - Math.min(13, 230 / items.length)} y={y(r.population)} width={Math.min(26, 460 / items.length)} height={220 - y(r.population)} fill={i === peak ? '#bd8b47' : '#8fb0ca'} rx="3"/> : <circle cx={x(i)} cy={y(r.population)} r={i === peak || active === i ? 4 : items.length > 60 ? 1 : 2.5} fill={i === peak ? '#bd8b47' : 'var(--chart-color)'}/>}
        {(i % Math.max(1, Math.ceil(items.length / 6)) === 0 || i === items.length - 1) && <text x={x(i)} y="245" textAnchor="middle">{r.period.slice(5)}</text>}
        <rect className="chart-hit" x={x(i) - 304 / Math.max(1, items.length - 1)} width={608 / Math.max(1, items.length - 1)} y="35" height="190" fill="transparent" tabIndex="0" aria-label={`${r.period}, ${number(r.population)}명`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}><title>{r.period}: {number(r.population)}명</title></rect>
      </g>)}
    </svg></div>
}

export function HourChart({ items }) {
  const [active, setActive] = useState(null)
  const maximum = Math.max(0, ...items.map(r => Number(r.population)))
  const total = items.reduce((s, r) => s + Number(r.population), 0)
  const byHour = new Map(items.map(r => [Number(r.category), r]))
  const selected = byHour.get(active)
  return <Card title="시간대별 방문 집중도" className="hour-chart-card"><div className="chart-readout"><span><i/>방문 인구 <small>단위: 명</small></span><b>{selected ? `${String(active).padStart(2, '0')}시 · ${number(selected.population)}명` : active != null ? `${String(active).padStart(2, '0')}시 · 데이터 없음 (0명과 다름)` : '진한 막대: 최다 시간'}</b></div>
    {!items.length ? <p className="empty">해당 조건의 관측 행이 없습니다.</p> : <><div className="hour-columns">{Array.from({ length: 24 }, (_, hour) => {
      const row = byHour.get(hour)
      const value = Number(row?.population || 0)
      return <button key={hour} className={`hour-column ${row ? '' : 'unobserved'} ${value === maximum && maximum > 0 ? 'peak' : ''}`} aria-label={`${hour}시: ${row ? `${number(value)}명, ${total ? (value / total * 100).toFixed(1) : '0.0'}%` : '관측 행 없음'}`} onMouseEnter={() => setActive(hour)} onFocus={() => setActive(hour)} onBlur={() => setActive(null)}><span className="hour-track"><i style={{ height: `${maximum ? value / maximum * 100 : 0}%` }}/>{!row && <em>·</em>}</span><small>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</small></button>
    })}</div><div className="hour-axis"><span>00시</span><span>시간대 →</span><span>23시</span></div></>}
  </Card>
}

export function Composition({ items }) {
  const total = items.reduce((s, row) => s + Number(row.population), 0)
  return <Card title="연령·성별 구성비">{total > 0 ? <><div className="composition-strip" role="img" aria-label="연령·성별 구성비">{items.map(row => {
    const share = Number(row.population) / total * 100
    const label = `${row.age} ${row.sex === 'F' ? '여성' : '남성'}`
    return <div key={label} style={{ width: `${share}%`, background: groupColor(row) }} title={`${label} ${share.toFixed(1)}%`}><span>{share >= 12 ? `${share.toFixed(1)}%` : ''}</span></div>
  })}</div><div className="composition-legend">{items.map(row => <div key={`${row.age}-${row.sex}`}><i style={{ background: groupColor(row) }}/><span>{row.age} {row.sex === 'F' ? '여성' : '남성'}</span><b>{number(row.population)}명</b><small>{(row.population / total * 100).toFixed(1)}%</small></div>)}</div></> : <p className="empty">구성비를 계산할 방문 인구가 없습니다.</p>}</Card>
}
