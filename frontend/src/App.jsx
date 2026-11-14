import PageBanner from './PageBanner'
import { useEffect, useRef, useState } from 'react'
import { getApi } from './api'
import { Icon, Mascot, Card, Bars } from './ui'
import { Trend, HourChart, WeekHourHeatmap } from './Charts'
import AudienceDonut from './AudienceDonut'
import HomeHub from './HomeHub'
import DateRangePicker from './DateRangePicker'
import StrategyWorkspace from './StrategyWorkspace'
import ExecutionPlans from './ExecutionPlans'
import ClusterPattern from './ClusterPattern'
import SimilarMuseums from './SimilarMuseums'
import { downloadCsv, exportVisits } from './downloads'
import FacilityCompare from './FacilityCompare'
import Operations from './Operations'
import Login from './Login'
import { operatorProfile, operatorStorage, startRootDemo } from './operatorProfile.js'
import './App.css'
import './Operations.css'

const fmt = v => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
const pct = (v, total) => total > 0 ? `${(v / total * 100).toFixed(1)}%` : '—'
const sexLabel = v => ({ F: '여성', M: '남성' })[v] || v
const initial = { facility: operatorProfile.facility, start_date: '', end_date: '', sex: '', age: '' }
const tabs = ['방문 현황', '관객 구성', '시설 비교·연관 방문']
const typeTabs = ['방문 패턴', '유사 박물관']

function useResource(path, params = {}) {
  const key = JSON.stringify(params)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', path: '', data: null, error: '', loading: true })
  useEffect(() => {
    const controller = new AbortController()
    getApi(path, JSON.parse(key), controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, path, data, error: '', loading: false })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, path, data: null, error: error.message, loading: false })
    })
    return () => controller.abort()
  }, [path, key, attempt])
  const current = state.key === key && state.path === path
  return { ...state, data: current ? state.data : null, error: current ? state.error : '', loading: !current || state.loading,
    retry: () => { setState({ key, path, data: null, error: '', loading: true }); setAttempt(x => x + 1) } }
}

function ResourceState({ resource, children }) {
  if (resource.loading) return <div className="card data-state" role="status">데이터를 불러오고 있습니다…</div>
  if (resource.error) return <div className="warning" role="alert"><strong>데이터를 불러오지 못했습니다.</strong><p>{resource.error}</p><button className="outline" onClick={resource.retry}>다시 시도</button></div>
  return children
}

function Breakdown({ title, items, label = v => v, variant = '' }) {
  const maximum = Math.max(0, ...items.map(x => Number(x.population)))
  const total = items.reduce((s, x) => s + Number(x.population), 0)
  const color = items.map(item => variant === 'weekday' ? (Number(item.category) >= 6 ? '#bd8b47' : '#648eaa') : variant === 'age' ? (item.category === '20대' ? '#5688a8' : '#8871ac') : variant === 'sex' ? (item.category === 'F' ? '#3b8b7a' : '#658caf') : 'var(--primary)')
  return <Card title={title} className={`breakdown-card ${variant ? `breakdown-${variant}` : ''}`}><p className="card-sub">최대값 기준</p>{items.length ? <Bars color={color} rows={items.map(x => [label(x.category), maximum ? x.population / maximum * 100 : 0, `${fmt(x.population)} · ${pct(x.population, total)}`])}/> : <p className="empty">해당 조건의 관측 행이 없습니다.</p>}{variant === 'weekday' && <div className="chart-color-key"><span><i style={{ background: '#648eaa' }}/>평일</span><span><i style={{ background: '#bd8b47' }}/>주말</span></div>}</Card>
}

function Filters({ value, onChange, metadata }) {
  const set = e => onChange({ ...value, [e.target.name]: e.target.value })
  return <div className={`card live-filters ${operatorProfile.isRoot ? 'root-filters' : ''}`} aria-label="공통 분석 필터">

    {operatorProfile.isRoot && <label className="filter-field filter-facility">시설<select name="facility" value={value.facility} onChange={set}><option value="">전체 시설</option>{metadata.facilities.map(facility => <option key={facility}>{facility}</option>)}</select></label>}
    <DateRangePicker start={value.start_date} end={value.end_date} min={metadata.visits.start_date} max={metadata.visits.end_date} onChange={(start, end) => onChange({ ...value, start_date: start, end_date: end })}/>
    <label className="filter-field filter-age">연령<select name="age" value={value.age} onChange={set}><option value="">20·30대 전체</option>{metadata.ages.map(v => <option key={v}>{v}</option>)}</select></label>
    <label className="filter-field filter-sex">성별<select name="sex" value={value.sex} onChange={set}><option value="">전체 성별</option><option value="F">여성</option><option value="M">남성</option></select></label>
    <button className="outline filter-reset" onClick={() => onChange({ ...initial })}><span aria-hidden="true">↻</span>초기화</button>
  </div>
}

function Kpis({ data }) {
  const { summary: s, comparison: c, breakdowns: b } = data
  const peak = [...b.hour].sort((a, b) => b.population - a.population)[0]
  return <div className="kpis">{[
    ['방문 인구 합계', fmt(s.population), '명', '20·30대 집계 · 고유 방문자 수 아님'],
    ['관측일 평균 방문 인구', s.observed_days ? fmt(s.population / s.observed_days) : '—', '명', `관측 행이 있는 ${s.observed_days}일 기준`],
    ['이전 동일 기간 대비', c.change_percent == null ? '—' : `${c.change_percent > 0 ? '+' : ''}${Number(c.change_percent).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`, c.change_percent == null ? '' : '%', c.available ? `이전 합계 ${fmt(c.population)}명${c.population === 0 ? ' · 0 기준 증감률 산출 불가' : ''}` : c.reason],
    ['최다 방문 시간', peak && s.population > 0 ? `${String(peak.category).padStart(2, '0')}시` : '—', '', peak && s.population > 0 ? `${fmt(peak.population)}명 · ${pct(peak.population, s.population)}` : '방문 인구가 없습니다'],
  ].map(([label, v, unit, sub]) => <div className="card kpi stat-card" key={label}><h3 className="stat-title">{label}</h3><strong className="stat-value">{v}<small>{unit}</small></strong><p className="stat-support">{sub}</p></div>)}</div>
}

function Visits({ data, chart, setChart, granularity, setGranularity, hourStart, hourEnd }) {
  return <><Kpis data={data}/><div className="chart-grid"><Card title="방문 인구 추이" className="visit-trend-card" action={<div className="chart-controls"><select aria-label="집계 단위" value={granularity} onChange={e => setGranularity(e.target.value)}><option value="day">일별</option><option value="week">주별</option><option value="month">월별</option></select><div className="segmented">{['선형', '막대', '원형'].map(v => <button key={v} className={chart === v ? 'selected' : ''} onClick={() => setChart(v)}>{v}</button>)}</div></div>}>
    <Trend items={data.trends[granularity]} mode={chart}/>
    <details className="chart-table"><summary>차트 수치 보기</summary><div className="table-scroll"><table><thead><tr><th>기간 시작일</th><th>방문 인구</th></tr></thead><tbody>{data.trends[granularity].map(r => <tr key={r.period}><td>{r.period}</td><td>{fmt(r.population)}</td></tr>)}</tbody></table></div></details></Card>
    <Breakdown variant="weekday" title="요일별 방문 인구" items={data.breakdowns.weekday} label={v => ['월', '화', '수', '목', '금', '토', '일'][v - 1] + '요일'}/>
    <HourChart items={data.breakdowns.hour}/><Breakdown variant="age" title="연령별 방문 인구" items={data.breakdowns.age}/><WeekHourHeatmap items={data.heatmap} audience={data.heatmap_audience} hourStart={hourStart} hourEnd={hourEnd}/></div></>
}

function Audience({ data }) {
  return <><div className="type-grid">{data.audience.map(r => <div className="card type-card stat-card" key={`${r.age}-${r.sex}`}><h3 className="stat-title">{r.age} {sexLabel(r.sex)}</h3><strong className="stat-value">{fmt(r.population)}<small>명</small></strong><b className="stat-support">선택 범위 비중 {pct(r.population, data.summary.population)}</b></div>)}</div><AudienceDonut data={data}/><div className="two-col"><Breakdown variant="age" title="연령 구성" items={data.breakdowns.age}/><Breakdown variant="sex" title="성별 구성" items={data.breakdowns.sex} label={sexLabel}/></div></>
}

function FacilityRankList({ items, facility, pairs = false }) {
  const [expanded, setExpanded] = useState(false)
  const maximum = Math.max(0, ...items.map(row => row.population))
  const shown = expanded ? items : items.slice(0, 5)
  return <>{items.length ? <ol className="facility-rank-list">{shown.map((row, index) => <li key={row.key || row.category} className={row.category === facility ? 'highlighted' : ''}><span className="facility-rank-number">{String(index + 1).padStart(2, '0')}</span><div className="facility-rank-body"><div className="facility-rank-label"><div><span>{row.category}</span>{pairs && row.related && <small>상대 · {row.related}</small>}</div><strong>{fmt(row.population)}<small>명</small></strong></div><div className="facility-rank-track"><span style={{ width: `${maximum ? row.population / maximum * 100 : 0}%` }}/></div></div></li>)}</ol> : <p className="empty">해당 조건의 관측 행이 없습니다.</p>}{items.length > 5 && <button className="rank-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '상위 5개만 보기' : `전체 ${items.length}개 보기`}<span aria-hidden="true">{expanded ? '−' : '+'}</span></button>}</>
}

function Relations({ filters, metadata }) {
  const [role, setRole] = useState('base')
  const params = { start_month: (filters.start_date || metadata.visits.start_date).slice(0, 7), end_month: (filters.end_date || metadata.visits.end_date).slice(0, 7), [role === 'base' ? 'base_facility' : 'related_facility']: filters.facility, sex: filters.sex, age: filters.age }
  const resource = useResource('relations', params)
  const comparison = useResource('visits/breakdown', { dimension: 'facility', start_date: filters.start_date, end_date: filters.end_date, sex: filters.sex, age: filters.age })
  const pairs = new Map()
  for (const row of resource.data?.items || []) {
    const key = JSON.stringify([row.base_facility, row.related_facility])
    const current = pairs.get(key) || { key, category: filters.facility ? (role === 'base' ? row.related_facility : row.base_facility) : row.base_facility, related: filters.facility ? null : row.related_facility, population: 0 }
    current.population += Number(row.population)
    pairs.set(key, current)
  }
  const ranking = [...pairs.values()].sort((a, b) => b.population - a.population || a.key.localeCompare(b.key))
  const facilities = [...(comparison.data?.items || [])].sort((a, b) => b.population - a.population || a.category.localeCompare(b.category))
  const selectedIndex = facilities.findIndex(row => row.category === filters.facility)
  const selected = facilities[selectedIndex]
  return <section className="facility-comparison-page" aria-label="시설 비교와 연관 방문">
    <div className="facility-comparison-grid"><Card title="시설 방문 순위" className="facility-ranking-card" action={<span className="comparison-tag">일별 방문 합계</span>}><p className="comparison-period">{range}</p>
      <ResourceState resource={comparison}>{comparison.data && <>{filters.facility ? <div className="facility-selection-summary"><span>{filters.facility}</span><div><strong>{selected ? fmt(selected.population) : '—'}<small>명</small></strong><b>{selected ? `${selectedIndex + 1}위 / ${facilities.length}개 시설` : '관측 없음'}</b></div></div> : <div className="facility-list-caption">동일 기간·관객 조건의 {facilities.length}개 시설</div>}<button className="text-button" onClick={() => downloadCsv('시설방문순위.csv', [['시설', '방문 인구', '시작일', '종료일', '연령', '성별'], ...facilities.map(row => [row.category, row.population, filters.start_date || metadata.visits.start_date, filters.end_date || metadata.visits.end_date, filters.age || '20·30대', filters.sex || '전체'])])}>집계 CSV 다운로드</button><FacilityRankList items={facilities} facility={filters.facility}/></>}</ResourceState>
    </Card>
    <Card title={filters.facility ? '함께 살펴볼 연관 시설' : '연관 방문 상위 시설 쌍'} className="facility-relation-card" action={<span className="comparison-tag warm">월별 시설 쌍 집계</span>}><p className="comparison-period relation-scope">{params.start_month} ~ {params.end_month} · 월 전체</p>
      <div className="relation-controls"><span>{filters.facility || '전체 시설'}</span>{filters.facility && <select aria-label="연관 방문 조회 역할" value={role} onChange={event => setRole(event.target.value)}><option value="base">기준 시설로 조회</option><option value="related">상대 시설로 조회</option></select>}</div>
      <ResourceState resource={resource}>{resource.data && <><div className="facility-list-caption">{filters.facility ? `연관 시설 ${ranking.length}곳` : `시설 쌍 ${ranking.length}개`}</div><FacilityRankList items={ranking} pairs={!filters.facility}/></>}</ResourceState>
    </Card></div>
    <section className="relation-export-panel" aria-label="연관 방문 데이터 다운로드">
      <div className="relation-export-copy"><span className="relation-export-icon"><Icon name="file" size={21}/></span><div><h3>연관 방문 데이터 내보내기</h3><p>{params.start_month} ~ {params.end_month} · {filters.facility || '전체 시설'} · 월별 시설 쌍 집계 CSV</p></div></div>
      <button className="outline relation-export-button" disabled={resource.loading || !!resource.error || !resource.data?.items?.length} onClick={() => downloadCsv('연관방문.csv', [['월', '기준 시설', '상대 시설', '연령 조건', '성별 조건', '방문 인구'], ...(resource.data?.items || []).map(row => [row.month, row.base_facility, row.related_facility, filters.age || '20·30대', filters.sex || '전체', row.population])])}><Icon name="file" size={17}/>집계 CSV 다운로드</button>
    </section>
  </section>
}

function saved(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
function Settings({ chart, setChart, primary, sidebar, setTheme, metadata, quality, notify }) {
  const [notifications, setNotifications] = useState(() => saved('culture-notifications', [true, true, true, false]))
  const account = saved('culture-account', {})
  return <div className="settings-grid"><div><Card title="계정 정보 (이 기기 저장)"><form onSubmit={e => { e.preventDefault(); localStorage.setItem('culture-account', JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))); notify('계정 정보를 이 기기에 저장했습니다.') }}><label>아이디<input value={operatorProfile.isRoot ? 'root' : operatorProfile.facility + ' 운영자'} disabled/></label><label>이름<input name="name" defaultValue={account.name || '운영 담당자'} required/></label><label>이메일<input name="email" type="email" defaultValue={account.email || ''} required/></label><button className="outline account-save">계정 정보 저장</button></form><div className="divider"/><p className="card-sub">로그인은 데모이며 실제 인증·비밀번호 변경은 제공하지 않습니다.</p></Card><Card title="분석 데이터"><p>분석 대상 시설 {metadata.facilities.length}개</p><p className="card-sub">시설 권한 관리와 연결 계정 인증은 제공하지 않습니다.</p></Card><Card title="알림 환경설정 (이 기기 저장)">{['데이터 갱신 완료', '데이터 검증 경고', '새 개선 기회 발견', '이메일로도 받기'].map((label, i) => <div className="notification-row" key={label}><b>{label}</b><button className={`switch ${notifications[i] ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={!!notifications[i]} onClick={() => { const next = [...notifications]; next[i] = !next[i]; setNotifications(next); localStorage.setItem('culture-notifications', JSON.stringify(next)) }}><span/></button></div>)}<p className="card-sub">선호만 저장합니다. 실제 알림·이메일 발송 기능은 없습니다.</p></Card></div><div><Card title="화면 테마" action={<button className="text-button" onClick={() => { setTheme('primary', '#176b68'); setTheme('sidebar', '#163638') }}>기본값 복원</button>}>{[['primary', '메인 컬러', primary], ['sidebar', '사이드바 컬러', sidebar]].map(([key, label, value]) => <label className="theme-field" key={key}>{label}<input aria-label={label} type="color" value={value} onChange={e => setTheme(key, e.target.value)}/><code>{value}</code></label>)}</Card><Card title="기본 차트 형태"><div className="segmented">{['선형', '막대', '원형'].map(v => <button key={v} className={chart === v ? 'selected' : ''} onClick={() => setChart(v)}>{v}</button>)}</div></Card><Card title="실제 데이터 검증"><ResourceState resource={quality}>{quality.data && <><p>{quality.data.startup_validation}</p><table><thead><tr><th>원본</th><th>행 수</th><th>0값 행</th></tr></thead><tbody>{Object.entries(quality.data.datasets).map(([name, item]) => <tr key={name}><td>{name === 'visits' ? 'FST' : 'SECD'}</td><td>{fmt(item.rows)}</td><td>{fmt(item.zero_rows)}</td></tr>)}</tbody></table><p className="card-sub">전체 원본 기준</p></>}</ResourceState></Card></div></div>
}

function DataGuide({ children, onClose }) {
  const ref = useRef(null)
  const [previous] = useState(() => document.activeElement)
  useEffect(() => {
    ref.current.showModal()
    return () => { queueMicrotask(() => { if (previous?.isConnected) previous.focus() }) }
  }, [previous])
  return <dialog ref={ref} className="modal card data-guide-dialog" aria-label="데이터 기준 안내" onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...ref.current.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); ref.current.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose() }}>{children}</dialog>
}

function readFilters() {
  try { const value = JSON.parse(localStorage.getItem(operatorStorage('filters')) || '{}'); return Object.fromEntries(Object.keys(initial).map(key => [key, typeof value?.[key] === 'string' && (key === 'facility' ? value[key].length <= 100 : key === 'age' ? ['', '20대', '30대'].includes(value[key]) : key === 'sex' ? ['', 'F', 'M'].includes(value[key]) : value[key] === '' || /^2025-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value[key])) ? value[key] : ''])) } catch { return initial }
}

function App() {
  const [page, setPage] = useState('홈'), [tab, setTab] = useState(tabs[0])
  const [typeTab, setTypeTab] = useState(typeTabs[0])
  const [planToOpen, setPlanToOpen] = useState(null)
  const [planStatus, setPlanStatus] = useState('전체')
  const [planFacility, setPlanFacility] = useState('')
  const [filters, setFilterValues] = useState(() => { const saved = readFilters(); return operatorProfile.isRoot ? saved : { ...saved, facility: operatorProfile.facility } }), [granularity, setGranularity] = useState('month')
  const setFilters = value => setFilterValues(operatorProfile.isRoot ? value : { ...value, facility: operatorProfile.facility })
  const [chart, setChartValue] = useState(() => localStorage.getItem('culture-chart') || '선형')
  const [primary, setPrimary] = useState(() => (!localStorage.getItem('culture-primary') || localStorage.getItem('culture-primary') === '#416c50') ? '#176b68' : localStorage.getItem('culture-primary'))
  const [sidebar, setSidebar] = useState(() => (!localStorage.getItem('culture-sidebar') || localStorage.getItem('culture-sidebar') === '#243e32') ? '#163638' : localStorage.getItem('culture-sidebar'))
  const [logged, setLogged] = useState(() => { try { return sessionStorage.getItem('museum-flow-session') === 'active' } catch { return false } }), [loginError, setLoginError] = useState(''), [attempts, setAttempts] = useState(5)
  const [modal, setModal] = useState(false), [toast, setToast] = useState('')
  const metadata = useResource('metadata'), dashboard = useResource('dashboard', filters), quality = useResource('quality')
  useEffect(() => { try { localStorage.setItem(operatorStorage('filters'), JSON.stringify(filters)) } catch { /* Filters still work without storage. */ } }, [filters])
  const setChart = v => { setChartValue(v); localStorage.setItem('culture-chart', v) }
  const setTheme = (key, v) => { (key === 'primary' ? setPrimary : setSidebar)(v); localStorage.setItem(`culture-${key}`, v) }
  const notify = v => { setToast(v); setTimeout(() => setToast(''), 3500) }
  const navigate = v => { if (v === '실행 계획') { setPlanToOpen(null); setPlanStatus('전체'); setPlanFacility('') } setPage(v); window.scrollTo(0, 0) }
  const openPlans = (id = null, status = '전체', facilityScope = '') => { setPlanToOpen(id); setPlanStatus(status); setPlanFacility(facilityScope); setPage('실행 계획'); window.scrollTo(0, 0) }
  const luminance = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
  const lightSide = luminance(sidebar) > .3
  const style = { '--primary': primary, '--primary-text': luminance(primary) > .179 ? '#172536' : '#fff', '--sidebar': sidebar, '--side-text': lightSide ? '#294333' : '#f1f4e8', '--side-muted': lightSide ? '#6e8072' : '#b0c4b4', '--side-active': lightSide ? '#36553c10' : '#dcebc5' }
  const facility = filters.facility || '전체 시설'
  const range = `${filters.start_date || metadata.data?.visits.start_date || '—'} ~ ${filters.end_date || metadata.data?.visits.end_date || '—'}`
  if (!logged) return <Login style={style} error={loginError} attempts={attempts} onLogin={e => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    if (form.get('id') === 'root' && form.get('password') === '1234') {
      try {
        if (form.get('remember')) localStorage.setItem('culture-id', 'root')
        else localStorage.removeItem('culture-id')
        startRootDemo()
      } catch {
        setLoginError('로그인 상태를 저장할 수 없습니다. 브라우저 저장 공간 설정을 확인해 주세요.')
      }
    } else {
      setAttempts(x => Math.max(0, x - 1))
      setLoginError('아이디 또는 비밀번호를 확인해 주세요.')
    }
  }}/>

  return <div className="app" style={style}><aside className="sidebar"><a className="logo" onClick={() => navigate('홈')}><span className="brand-mascot"><Mascot/></span><span className="brand-wordmark">Museum <span>Flow</span></span></a><div className="institution facility-profile-card" title={facility}><div className="institution-icon"><Icon name="museum"/></div><div className="facility-profile-copy"><span className="facility-profile-caption">{operatorProfile.isRoot ? '분석 중인 시설' : '담당 시설'}</span><b>{facility}</b><small className="facility-scope-badge"><i aria-hidden="true"/>{operatorProfile.role}</small></div></div><nav>{[['홈', 'home'], ['데이터 분석', 'chart'], ['시설·방문 유형', 'compass'], ['운영전략', 'bulb'], ['실행 계획', 'file'], ['시설 비교', 'museum'], ['행사 전후 분석', 'chart'], ['운영 캘린더', 'calendar']].map(([label, icon]) => <button key={label} className={page === label ? 'active' : ''} onClick={() => navigate(label)} aria-label={label}><Icon name={icon}/><span>{label}</span></button>)}</nav><div className="side-bottom"><button onClick={() => navigate('설정')} aria-label="설정"><Icon name="settings"/>설정</button><button aria-label="로그아웃" onClick={() => { try { sessionStorage.removeItem('museum-flow-session') } catch { /* Storage may be unavailable. */ } setLogged(false); setAttempts(5); setLoginError('') }}><Icon name="logout"/>로그아웃</button></div><div className="side-footer">MUSEUM FLOW<br/><span>박물관의 내일을 위한 데이터</span></div></aside><div className="workspace"><header><span className="workspace-identity"><Icon name="museum" size={18}/>{operatorProfile.isRoot ? (filters.facility ? `${filters.facility} 분석 중` : '전체 시설 관리 워크스페이스') : `${operatorProfile.facility} 운영 워크스페이스`}</span></header><main><div className="page-heading"><div><h1>{page === '홈' ? `${facility} 운영 현황` : page}</h1></div><div className={`heading-actions ${page === '홈' ? 'home-heading-actions' : ''}`}><button className={page === '홈' ? 'text-button home-data-guide' : 'outline'} onClick={() => setModal(true)}>데이터 기준 안내</button>{page === '데이터 분석' && (tab === tabs[0] || tab === tabs[1]) && <button className="outline" disabled={!dashboard.data} onClick={() => exportVisits(dashboard.data, filters)}>집계 CSV 다운로드</button>}{page === '운영전략' && <button className="primary" disabled={!dashboard.data} onClick={() => window.print()}>PDF 보고서 내보내기</button>}</div></div>
    {['운영 캘린더', '행사 전후 분석'].includes(page) ? <Operations view={page} metadata={metadata.data} onNavigate={navigate} onPlan={openPlans}/> : page === '시설 비교' ? <ResourceState resource={metadata}>{metadata.data && <FacilityCompare metadata={metadata.data} filters={filters} onChange={setFilters}/>}</ResourceState> : page === '실행 계획' ? <ExecutionPlans initialId={planToOpen} initialStatus={planStatus} initialFacility={planFacility || operatorProfile.facility} onExplore={() => navigate('운영전략')}/> : <ResourceState resource={metadata}>{metadata.data && <>{page !== '설정' && <Filters value={filters} onChange={setFilters} metadata={metadata.data}/>}{page === '설정' ? <Settings {...{ chart, setChart, primary, sidebar, setTheme, quality, notify }} metadata={metadata.data}/> : <>
            {page === '데이터 분석' && (
        <PageBanner eyebrow="DISCOVER YOUR VISITORS" title={<>방문의 흐름을 읽고,<br/>우리 박물관을 이해하세요.</>} variant="investigate" label="방문 데이터 분석 소개"/>
      )}

      {page === '데이터 분석' && <div className="tabs" role="tablist" aria-label="분석 종류">{tabs.map(label => <button key={label} role="tab" aria-selected={tab === label} className={tab === label ? 'selected' : ''} onClick={() => setTab(label)}>{label}</button>)}</div>}
      {page === '시설·방문 유형' && <>
        <PageBanner eyebrow={typeTab === typeTabs[0] ? 'FIND THE PATTERN' : 'EXPLORE THE CONNECTION'} title={typeTab === typeTabs[0] ? <>방문의 패턴을 찾고,<br/>관객의 하루를 이해하세요.</> : <>닮은 박물관을 만나고,<br/>새로운 가능성을 발견하세요.</>} variant={typeTab === typeTabs[0] ? 'pattern' : 'explorer'} label="시설·방문 유형 소개"/>
        <div className="tabs" role="tablist" aria-label="시설·방문 유형 분석">{typeTabs.map(label => <button key={label} role="tab" aria-selected={typeTab === label} className={typeTab === label ? 'selected' : ''} onClick={() => setTypeTab(label)}>{label}</button>)}</div>
      </>}
      {page === '데이터 분석' && tab === tabs[2] ? <Relations filters={filters} metadata={metadata.data}/>
        : page === '시설·방문 유형' && typeTab === typeTabs[0] ? <ClusterPattern filters={filters} metadata={metadata.data}/>
        : page === '시설·방문 유형' && typeTab === typeTabs[1] ? <SimilarMuseums filters={filters} metadata={metadata.data}/> : <ResourceState resource={dashboard}>{dashboard.data && <>
        {!dashboard.data.summary.observed_rows && <div className="info-banner">선택 조건의 관측 행이 없습니다. 필터를 변경해 주세요. 누락값을 실제 방문 0으로 단정하지 않습니다.</div>}
        {page === '홈' && <HomeHub data={dashboard.data} filters={filters} onAnalyze={() => { setTab(tabs[0]); navigate('데이터 분석') }} onStrategies={() => navigate('운영전략')} onPlans={(id, status) => openPlans(id, status, filters.facility)}/>}
        {page === '데이터 분석' && tab === tabs[0] && <Visits data={dashboard.data} hourStart={0} hourEnd={23} {...{ chart, setChart, granularity, setGranularity }}/>}
        {page === '데이터 분석' && tab === tabs[1] && <Audience data={dashboard.data}/>}
        {page === '운영전략' && <StrategyWorkspace data={dashboard.data} filters={filters} onViewPlans={openPlans}/>}
      </>}</ResourceState>}
    </>}</>}</ResourceState>}
    </main><footer>Museum <span>Flow</span><p>데이터로 연결하는 더 나은 관람 경험</p></footer></div>{toast && <div className="toast" role="status">{toast}</div>}
    {modal && <DataGuide onClose={() => setModal(false)}><div className="card-heading"><h2>데이터 기준 안내</h2><button onClick={() => setModal(false)} aria-label="닫기">✕</button></div><p>FST는 일·시설·시간·성별·연령별 방문 인구, SECD는 월·기준 시설·상대 시설·성별·연령별 방문 인구입니다.</p>{metadata.data?.notes.map(n => <p className="definition-note" key={n}>{n}</p>)}<p className="definition-note">FST와 SECD는 별도 지표입니다. 두 파일의 합산·교차방문율·이동 방향·체류시간은 제공하지 않습니다.</p><p className="definition-note">이전 기간 비교는 동일 길이의 직전 기간이 CSV 범위에 포함될 때만 제공합니다. 이전 값이 0이면 증감률을 계산하지 않습니다.</p><p className="definition-note">요일 차트는 합계입니다. 요일별 일수나 누락 행의 차이를 보정한 평균이 아닙니다.</p></DataGuide>}
  </div>
}
export default App
