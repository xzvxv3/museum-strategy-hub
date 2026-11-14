import { useState } from 'react'
import { Card } from './ui'
import { pct } from './clusterUtils'
import './Cluster.css'

const prefixSums = values => values.map((_, i) => values.slice(0, i).reduce((s, v) => s + (v || 0), 0))

export function ClusterGate({ resource, title, scope, runNote, children }) {
  if (resource.running) return <div className="card data-state" role="status">군집 분석을 실행하고 있습니다… 처음 분석은 {runNote} 결과는 저장되어 다음부터 바로 표시됩니다.</div>
  if (resource.loading) return <div className="card data-state" role="status">군집 분석 결과를 불러오고 있습니다…</div>
  if (resource.error) return <div className="warning" role="alert"><strong>군집 분석 결과를 가져오지 못했습니다.</strong><p>{resource.error}</p><p>조건을 넓히거나 백엔드 서버(8000)가 실행 중인지 확인해 주세요.</p><button className="outline" onClick={resource.retry}>다시 시도</button></div>
  if (!resource.data.available) return <Card title={title} className="cluster-run-card">
    <p className="card-sub">학습 범위: {scope}</p>
    <p className="definition-note">{resource.data.reason} 시설 필터는 학습 범위를 바꾸지 않고, 결과에서 선택 시설을 강조하는 데만 쓰입니다.</p>
    <button className="primary" onClick={resource.run}>이 조건으로 군집 분석 실행</button>
    <p className="definition-note">{runNote} 한 번 실행한 조건은 저장되어 다음부터 바로 표시됩니다.</p>
  </Card>
  return children(resource.data)
}

export function StatCards({ items }) {
  return <div className="kpis">{items.map(([label, value, unit, sub]) => <div className="card kpi stat-card" key={label}><h3 className="stat-title">{label}</h3><strong className="stat-value">{value}<small>{unit}</small></strong><p className="stat-support">{sub}</p></div>)}</div>
}

export function Segmented({ label, value, options, onChange }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map(([id, text]) => <button key={id} className={value === id ? 'selected' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>
}

export function ChartTable({ head, rows }) {
  return <details className="chart-table"><summary>차트 수치 보기</summary><div className="table-scroll"><DataTable head={head} rows={rows}/></div></details>
}

export function DataTable({ head, rows }) {
  return <table className="cluster-table"><thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>
}

function Legend({ items }) {
  return <div className="chart-color-key cluster-legend">{items.map(s => <span key={s.name}><i className={s.dashed ? 'dashed' : ''} style={{ background: s.dashed ? undefined : s.color }}/>{s.name}</span>)}</div>
}

function niceTicks(lo, hi) {
  if (hi - lo < 1e-9) hi = lo + 1
  const rough = (hi - lo) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map(n => n * magnitude).find(n => n >= rough)
  const start = Math.floor(lo / step + 1e-9) * step
  const end = Math.ceil(hi / step - 1e-9) * step
  const ticks = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return { lo: start, hi: end, ticks }
}

const W = 720, L = 56, R = 14, T = 12, B = 30

function frameFor(categories, values, height, bounds = {}) {
  const { lo, hi, ticks } = niceTicks(bounds.min ?? Math.min(0, ...values), bounds.max ?? Math.max(0, ...values))
  const pw = W - L - R, ph = height - T - B, band = pw / Math.max(1, categories.length)
  return { ticks, ph, band, y: v => T + ph - (v - lo) / (hi - lo) * ph, cx: i => L + band * (i + 0.5) }
}

function Frame({ label, height, frame, categories, format, active, setActive, describe, children }) {
  const every = Math.max(1, Math.ceil(categories.length / 12))
  return <><div className="chart-readout"><span>{label}</span><b>{active == null ? '항목에 마우스를 올리면 수치가 보입니다' : describe(active)}</b></div>
    <svg className="cluster-svg" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} onMouseLeave={() => setActive(null)}>
      {frame.ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={frame.y(t)} y2={frame.y(t)} className={t === 0 ? 'zero' : 'grid'}/><text x={L - 8} y={frame.y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
      {categories.map((c, i) => i % every === 0 && <text key={i} x={frame.cx(i)} y={height - 10} textAnchor="middle">{c}</text>)}
      {active != null && <line x1={frame.cx(active)} x2={frame.cx(active)} y1={T} y2={T + frame.ph} className="cursor"/>}
      {children}
      {categories.map((c, i) => <rect key={`hit-${i}`} className="chart-hit" x={frame.cx(i) - frame.band / 2} y={T} width={frame.band} height={frame.ph} fill="transparent" tabIndex="0" aria-label={describe(i)} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}><title>{describe(i)}</title></rect>)}
    </svg></>
}

const describer = (categories, series, format) => i => `${categories[i]} · ${series.filter(s => s.values[i] != null).map(s => `${s.name} ${format(s.values[i])}`).join(' · ')}`

/** series: [{ name, color, values, dashed? }] */
export function LineChart({ label, categories, series, format, height = 250, min, max }) {
  const [active, setActive] = useState(null)
  const frame = frameFor(categories, series.flatMap(s => s.values).filter(v => v != null), height, { min, max })
  return <div className="cluster-chart"><Frame {...{ label, height, frame, categories, format, active, setActive }} describe={describer(categories, series, format)}>
    {series.map(s => <g key={s.name}>
      <polyline points={s.values.map((v, i) => v == null ? null : `${frame.cx(i)},${frame.y(v)}`).filter(Boolean).join(' ')} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.4} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round"/>
      {s.values.map((v, i) => v != null && <circle key={i} cx={frame.cx(i)} cy={frame.y(v)} r={active === i ? 4 : 2.6} fill={s.color}/>)}
    </g>)}
  </Frame><Legend items={series}/></div>
}

/** Side-by-side bars per category; values may be negative. */
export function GroupedBars({ label, categories, series, format, height = 250 }) {
  const [active, setActive] = useState(null)
  const frame = frameFor(categories, series.flatMap(s => s.values), height)
  const width = Math.min(18, frame.band * 0.8 / series.length)
  return <div className="cluster-chart"><Frame {...{ label, height, frame, categories, format, active, setActive }} describe={describer(categories, series, format)}>
    {series.map((s, j) => s.values.map((v, i) => <rect key={`${j}-${i}`} x={frame.cx(i) - width * series.length / 2 + j * width} y={Math.min(frame.y(v), frame.y(0))} width={width - 1} height={Math.abs(frame.y(v) - frame.y(0))} fill={s.color} opacity={active == null || active === i ? 1 : 0.45} rx="2"/>))}
  </Frame><Legend items={series}/></div>
}

/** 100% stacked columns (shares 0..1) with optional overlay lines. */
export function StackedColumns({ label, categories, series, overlay = [], height = 270 }) {
  const [active, setActive] = useState(null)
  const frame = frameFor(categories, [0, 1], height, { min: 0, max: 1 })
  const width = Math.max(2, frame.band * 0.72)
  const format = v => pct(v, 0)
  return <div className="cluster-chart"><Frame {...{ label, height, frame, categories, format, active, setActive }} describe={describer(categories, [...series, ...overlay], format)}>
    {categories.map((c, i) => {
      const values = series.map(s => s.values[i] || 0)
      const bottoms = prefixSums(values)
      return <g key={i} opacity={active == null || active === i ? 1 : 0.6}>{series.map((s, j) =>
        <rect key={s.name} x={frame.cx(i) - width / 2} y={frame.y(bottoms[j] + values[j])} width={width} height={frame.y(bottoms[j]) - frame.y(bottoms[j] + values[j])} fill={s.color}/>)}</g>
    })}
    {overlay.map(s => {
      const points = s.values.map((v, i) => v == null ? null : `${frame.cx(i)},${frame.y(v)}`).filter(Boolean).join(' ')
      return <g key={s.name}><polyline points={points} fill="none" stroke="#fff" strokeWidth="5"/><polyline points={points} fill="none" stroke={s.color} strokeWidth="2.5"/></g>
    })}
  </Frame><Legend items={series}/>{overlay.length > 0 && <p className="definition-note">막대 = 전체 시설의 구성, 흰 테두리 선 = 선택 시설의 월별 구성</p>}</div>
}

/** One 100% bar per row; rows: [{ key, label, values, highlight, empty }] */
export function StackedRows({ rows, series }) {
  const anyHighlight = rows.some(r => r.highlight)
  return <div className="stack-rows">{rows.map(r => <div key={r.key} className={`stack-row ${r.highlight ? 'highlighted' : anyHighlight ? 'dimmed' : ''}`}>
    <span title={r.label}>{r.highlight ? '▶ ' : ''}{r.label}</span>
    <div className="stack-strip" role="img" aria-label={`${r.label}: ${r.empty ? '분석 단위 없음' : series.map((s, j) => `${s.name} ${pct(r.values[j])}`).join(', ')}`}>
      {r.empty ? <em>분석 단위 없음</em> : r.values.map((v, j) => v > 0 && <i key={j} style={{ width: `${v * 100}%`, background: series[j].color }} title={`${series[j].name} ${pct(v)}`}/>)}
    </div></div>)}<Legend items={series}/></div>
}

/** items: [{ name, color, value }] with values summing to 1. */
export function Donut({ items, center, caption }) {
  const starts = prefixSums(items.map(item => item.value))
  const slices = items.map((item, i) => `${item.color} ${starts[i] * 100}% ${(starts[i] + item.value) * 100}%`)
  return <div className="donut-wrap live-donut-wrap"><div className="donut" role="img" aria-label={items.map(i => `${i.name} ${pct(i.value)}`).join(', ')} style={{ background: `conic-gradient(${slices.join(',')})` }}><div><strong>{center}</strong><small>{caption}</small></div></div>
    <div className="pie-legend">{items.map(item => <p className="pie-label" key={item.name}><i style={{ background: item.color }}/>{item.name}<b>{pct(item.value)}</b></p>)}</div></div>
}
