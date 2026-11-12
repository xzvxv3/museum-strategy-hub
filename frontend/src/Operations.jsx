import { useEffect, useState } from 'react'
import { Card, Icon } from './ui'
import { Trend } from './Charts'
import { readPlans, status } from './planStore'
import { dateString, readEvents, writeEvents, parseEventsBackup, validateEvent, eventKey, readDraft, storeDraft, clearDraft, overlappingEvents } from './eventStore'
import { downloadFile, downloadCsv } from './downloads'
import useAnalysis from './useAnalysis'

const fmt = v => v == null ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const pct = v => v == null ? '—' : `${v > 0 ? '+' : ''}${fmt(v)}%`
const groups = [['20대', 'F'], ['20대', 'M'], ['30대', 'F'], ['30대', 'M']]
function load() { try { return { items: readEvents(), error: '' } } catch (e) { return { items: [], error: e.message } } }
function EventForm({ initial, draft, onDraft, facilities, onSave, onCancel }) {
  const [error, setError] = useState('')
  const set = e => onDraft({ ...draft, [e.target.name]: e.target.value })
  const options = [...new Set([...facilities, draft.facility].filter(Boolean))]
  return <section className="card event-form" aria-label="일정 편집">
    <div className="card-heading"><h3>{initial.id ? '일정 수정' : '새 일정 등록'}</h3><button className="text-button" onClick={onCancel}>취소</button></div>
    <form onSubmit={e => { e.preventDefault(); const value = { ...draft, title: draft.title.trim(), id: draft.id || crypto.randomUUID() }; if (!validateEvent(value)) { setError('시설·제목·날짜를 확인해 주세요. 일정은 최대 366일입니다.'); return } onSave(value) }}>
      <div className="ops-form-grid">
        <label className="ops-field ops-span-2">일정 이름<input name="title" value={draft.title} onChange={set} required maxLength={100} placeholder="실제 전시·행사·휴관 이름" autoFocus/></label>
        <label className="ops-field">일정 유형<select name="type" value={draft.type} onChange={set}><option>전시</option><option>행사</option><option>휴관</option></select></label>
        <label className="ops-field">시설<select name="facility" value={draft.facility} onChange={set} required><option value="">시설 선택</option>{options.map(f => <option key={f}>{f}</option>)}</select></label>
        <label className="ops-field">시작일<input name="start" type="date" min="1901-01-01" max="2099-12-31" value={draft.start} onChange={set} required/></label>
        <label className="ops-field">종료일<input name="end" type="date" min={draft.start} max="2099-12-31" value={draft.end} onChange={set} required/></label>
        <label className="ops-field">분석 대상 연령<select name="age" value={draft.age} onChange={set}><option value="">20·30대 전체</option><option>20대</option><option>30대</option></select></label>
        <label className="ops-field">분석 대상 성별<select name="sex" value={draft.sex} onChange={set}><option value="">전체 성별</option><option value="F">여성</option><option value="M">남성</option></select></label>
        <label className="ops-field ops-span-all">운영 메모<textarea name="memo" rows={3} value={draft.memo} onChange={set} maxLength={2000} placeholder="진행 내용, 운영 조건, 함께 확인할 사항"/></label>
      </div>
      {error && <p role="alert" className="ops-error">{error}</p>}
      <p className="ops-note">분석 대상은 방문 집계를 필터링하는 조건이며 실제 행사 참가자를 식별하지 않습니다. 제공 기간 밖 일정도 기록할 수 있습니다.</p>
      <button className="primary" type="submit">일정 저장</button>
    </form>
  </section>
}
function EventAnalysis({ event, events }) {
  const [windowDays, setWindowDays] = useState(28)
  const [period, setPeriod] = useState('during')
  const resource = useAnalysis('events/analysis', { facility: event.facility, start_date: event.start, end_date: event.end, age: event.age, sex: event.sex, window_days: windowDays }, event.type !== '휴관')
  const data = resource.data
  const overlaps = overlappingEvents(event, events, windowDays)
  if (event.type === '휴관') return <p className="ops-note">휴관 일정은 운영 캘린더에서 확인합니다. 휴관 중에도 주변 활동 등 방문 인구가 집계될 수 있으므로 실제 입장객으로 해석하지 않습니다.</p>
  const exportReport = () => downloadCsv(`${event.title}_전후분석.csv`, [
    ['일정', '시설', '대상 연령', '대상 성별', '구간', '시작일', '종료일', '방문 인구 합계', '관측일', '달력일', '관측일 평균', '요일 보정 평균', '비교 가능', '부족 사유'],
    ...data.periods.map(p => [event.title, event.facility, event.age || '20·30대', event.sex || '전체', p.label, p.start_date, p.end_date, p.population, p.observed_days, p.calendar_days, p.daily_average, p.weekday_adjusted_average, p.ready ? '예' : '아니오', p.reason]),
    ['전후 변화율(%)', data.change_percent, data.comparison_reason || '', '행사 효과나 인과관계를 뜻하지 않습니다.'],
    ...overlaps.map(e => ['비교 구간 내 다른 일정', e.type, e.title, e.start, e.end]),
  ])
  const selected = data?.periods.find(p => p.key === period)
  const before = data?.periods[0], after = data?.periods[2]
  return <div className="event-analysis">
    <div className="ops-toolbar"><label className="ops-field">전후 비교 기간<select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}>{[7, 14, 28, 56].map(d => <option key={d} value={d}>행사 전·후 각각 {d}일</option>)}</select></label>{data && <button className="outline" onClick={exportReport}>분석 CSV 다운로드</button>}</div>
    {resource.loading && <p role="status">전후 방문 데이터를 분석하는 중…</p>}
    {resource.error && <div className="ops-error" role="alert"><p>{resource.error}</p><button className="outline" onClick={resource.retry}>다시 시도</button></div>}
    {overlaps.length > 0 && <div className="ops-overlap" role="note"><strong>비교 구간에 다른 일정 {overlaps.length}개가 있습니다</strong><p>등록된 같은 시설의 기록 기준입니다. 휴관이나 다른 행사가 전후 방문 변화에 영향을 줄 수 있어 함께 확인해야 합니다. 집계에서 자동으로 제외하지 않습니다.</p><ul>{overlaps.map(e => <li key={e.id}>{e.type} · {e.title} · {e.start} ~ {e.end}</li>)}</ul></div>}
    {data && <>
      <div className="event-result"><div><span>요일 구성을 보정한 전후 변화</span><strong>{pct(data.change_percent)}</strong></div><p>{data.comparison_available ? '행사 후 평균과 행사 전 평균을 비교한 관측 변화입니다. 행사 자체의 효과를 의미하지 않습니다.' : data.comparison_reason}</p></div>
      <div className="event-periods">{data.periods.map(p => <div key={p.key} className={`event-period ${p.key}`}><span>{p.label}</span><small>{p.start_date} ~ {p.end_date}</small><strong>{fmt(p.daily_average)}<em>명 / 관측일</em></strong><p>관측 {p.observed_days} / {p.calendar_days}일 · {fmt(p.coverage * 100)}%</p>{p.key !== 'during' && <p>요일 보정 평균 {fmt(p.weekday_adjusted_average)}명</p>}{p.reason && <small className="ops-warning">{p.reason}</small>}</div>)}</div>
      <Card title="구간별 일별 방문 추이" action={<div className="segmented">{data.periods.map(p => <button key={p.key} className={period === p.key ? 'selected' : ''} onClick={() => setPeriod(p.key)}>{p.label}</button>)}</div>}><p className="ops-note">관측된 날짜만 표시합니다. 누락일을 0으로 채우지 않습니다.</p><Trend key={`${event.id}-${windowDays}-${period}`} items={selected.daily} mode="막대"/></Card>
      <div className="ops-table-scroll"><table><caption>행사 전후 관객 구성 · 각 기간 방문 인구 합계 기준</caption><thead><tr><th>관객 집단</th><th>행사 전 비중</th><th>행사 후 비중</th><th>차이 (%p)</th></tr></thead><tbody>{groups.map(([age, sex]) => {
        const share = p => { const row = p.audience.find(r => r.age === age && r.sex === sex); return row && p.population > 0 ? row.population / p.population * 100 : null }
        const a = share(before), b = share(after)
        return <tr key={age + sex}><th>{age} {sex === 'F' ? '여성' : '남성'}</th><td>{a == null ? '—' : fmt(a) + '%'}</td><td>{b == null ? '—' : fmt(b) + '%'}</td><td>{data.comparison_available && a != null && b != null ? `${b - a > 0 ? '+' : ''}${fmt(b - a)}` : '—'}</td></tr>
      })}</tbody></table></div>
      <details className="ops-method"><summary>계산 기준과 해석 범위</summary>{data.notes.map(n => <p key={n}>{n}</p>)}</details>
    </>}
  </div>
}
function Calendar({ events, plans, month, setMonth, selectedDay, setSelectedDay, filter, setFilter, facilities, onNew, onEvent, onPlan }) {
  const [year, m] = month.split('-').map(Number)
  const start = new Date(year, m - 1, 1)
  const offset = (start.getDay() + 6) % 7
  const count = new Date(year, m, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => i >= offset && i < offset + count ? `${month}-${String(i - offset + 1).padStart(2, '0')}` : null)
  const scopedEvents = events.filter(e => !filter || e.facility === filter)
  const scopedPlans = Object.entries(plans).filter(([, p]) => !p.archived && p.due && (!filter || p.scope.facility === filter))
  const onDay = day => [...scopedEvents.filter(e => e.start <= day && day <= e.end).map(e => ({ key: e.id, type: e.type, title: e.title, event: e })), ...scopedPlans.filter(([, p]) => p.due === day).map(([id, p]) => ({ key: `plan-${id}`, type: '계획', title: p.strategy.title, plan: p, id }))]
  const items = onDay(selectedDay)
  const move = delta => { const next = new Date(year, m - 1 + delta, 1); if (next.getFullYear() >= 1901 && next.getFullYear() <= 2099) { const day = dateString(next); setMonth(day.slice(0, 7)); setSelectedDay(day) } }
  return <>
    <div className="ops-toolbar"><div className="ops-month-nav"><button className="outline" aria-label="이전 달" onClick={() => move(-1)}>‹</button><label className="ops-field"><span className="sr-only">캘린더 월</span><input aria-label="캘린더 월" type="month" min="1901-01" max="2099-12" value={month} onChange={e => { if (/^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value >= '1901-01') { setMonth(e.target.value); setSelectedDay(e.target.value + '-01') } }}/></label><button className="outline" aria-label="다음 달" onClick={() => move(1)}>›</button><button className="text-button" onClick={() => { const today = dateString(new Date()); setMonth(today.slice(0, 7)); setSelectedDay(today) }}>오늘</button></div><label className="ops-field">캘린더 시설<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">전체 시설</option>{facilities.map(f => <option key={f}>{f}</option>)}</select></label></div>
    <div className="ops-calendar-layout"><section className="card ops-calendar" aria-label="월간 운영 일정"><div className="calendar-weekdays">{['월', '화', '수', '목', '금', '토', '일'].map(d => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{cells.map((day, i) => {
      const dayItems = day ? onDay(day) : []
      return day ? <button key={day} className={`calendar-day ${day === selectedDay ? 'active' : ''} ${day === dateString(new Date()) ? 'today' : ''}`} aria-label={`${day}, 일정 ${dayItems.length}개`} aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}><b>{Number(day.slice(-2))}</b>{dayItems.slice(0, 2).map(item => <span key={item.key} className={`calendar-chip ${item.type === '휴관' ? 'closed' : item.type === '계획' ? 'plan' : ''}`}><i>{item.type}</i>{item.title}</span>)}{dayItems.length > 2 && <small>+{dayItems.length - 2}개</small>}</button> : <div key={`blank-${i}`} className="calendar-day blank"/>
    })}</div><div className="calendar-legend"><span>● 전시·행사</span><span>● 휴관</span><span>● 실행 계획 목표일</span></div></section>
    <Card title={`${selectedDay} 일정`} className="calendar-detail" action={<button className="text-button" onClick={() => onNew(selectedDay)}>+ 등록</button>}>{items.length ? items.map(item => <button className="calendar-detail-item" key={item.key} onClick={() => item.event ? onEvent(item.event) : onPlan(item.id)}><span className="badge">{item.type}</span><strong>{item.title}</strong><small>{item.event ? `${item.event.facility} · ${item.event.start} ~ ${item.event.end}` : `${item.plan.owner || '담당자 미지정'} · ${status(item.plan.checks)}`}</small><span>상세 보기 →</span></button>) : <div className="ops-empty"><Icon name="calendar" size={32}/><p>등록된 일정이 없습니다.</p><button className="outline" onClick={() => onNew(selectedDay)}>이 날짜에 일정 등록</button></div>}</Card></div>
  </>
}
export default function Operations({ view, metadata, onNavigate, onPlan }) {
  const [initial] = useState(load)
  const [events, setEvents] = useState(initial.items)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initial.error)
  const [draftEntry, setDraftEntry] = useState(readDraft)
  const editing = draftEntry?.value || null
  const [deleted, setDeleted] = useState(null)
  const [activeId, setActiveId] = useState(initial.items[0]?.id || '')
  const [deleteId, setDeleteId] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => dateString(new Date()))
  const [month, setMonth] = useState(() => dateString(new Date()).slice(0, 7))
  const plans = readPlans()
  const facilities = [...new Set([...(metadata?.facilities || []), ...events.map(e => e.facility), ...Object.values(plans).map(p => p.scope.facility).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ko'))
  useEffect(() => {
    const changed = e => { if (e.key === eventKey || e.key === null) setError('다른 탭에서 저장된 일정이 변경되었습니다. 다시 불러온 뒤 확인해 주세요.') }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  const setDraft = entry => {
    setDraftEntry(entry)
    try { if (entry) storeDraft(entry); else clearDraft() }
    catch { setError('임시 저장 공간을 사용할 수 없습니다. 이 화면을 떠나기 전에 일정을 저장해 주세요.') }
  }
  const saveAll = next => { try { writeEvents(next, events); setEvents(next); setError(''); return true } catch (e) { setError(`저장하지 못했습니다: ${e.message}`); return false } }
  const reloadEvents = () => { try { setEvents(readEvents()); setError(''); setMessage('저장된 일정을 다시 불러왔습니다. 작성 중인 내용은 유지했습니다.') } catch (e) { setError(e.message) } }
  const newEvent = (day = dateString(new Date())) => { if (editing) { setMessage('작성 중인 일정을 먼저 저장하거나 취소해 주세요.'); return } setDraft({ value: { id: '', title: '', facility: filter || facilities[0] || '', type: '행사', start: day, end: day, age: '', sex: '', memo: '' }, base: null }); setMessage('') }
  const showEvent = e => { setActiveId(e.id); setSearch(''); setFilter(''); setDeleteId(''); onNavigate('행사 전후 분석') }
  const editEvent = e => { if (editing) { setMessage('작성 중인 일정을 먼저 저장하거나 취소해 주세요.'); return } setDraft({ value: { ...e }, base: { ...e } }) }
  const backup = () => { try { downloadFile('CulturePlus_일정백업.json', JSON.stringify({ format: 'culture-events', version: 1, events: readEvents() }, null, 2), 'application/json') } catch (e) { setError(e.message) } }
  const importBackup = async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 32 * 1024 * 1024) throw new Error('백업은 32MB 이하 파일을 선택해 주세요.'); const incoming = parseEventsBackup(await file.text()); const known = new Set(events.map(v => v.id)); const added = incoming.filter(v => !known.has(v.id)); if (saveAll([...events, ...added])) { setMessage(`${added.length}개 일정을 가져왔습니다. 같은 ID의 기존 기록은 유지했습니다.`); if (!activeId && added.length) setActiveId(added[0].id) } } catch (e) { setError(e.message) } }
  const visible = events.filter(e => (!filter || e.facility === filter) && `${e.title} ${e.facility} ${e.memo}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.start.localeCompare(a.start))
  const active = visible.find(e => e.id === activeId) || visible[0]
  return <div className="ops-page">
    <div className="ops-intro"><span className="eyebrow">{view === '운영 캘린더' ? 'OPERATIONS CALENDAR' : 'EVENT REVIEW'}</span><h2>{view === '운영 캘린더' ? '전시부터 실행 계획까지, 한 달의 운영 일정' : '행사를 기록하고, 전후의 변화를 확인하세요'}</h2><p>전시·행사·휴관 기록과 기존 실행 계획을 연결합니다. 기록은 이 브라우저에 저장되며 기기 간 공유는 백업으로 옮길 수 있습니다.</p></div>
    <div className="ops-toolbar"><div className="ops-actions"><button className="primary" onClick={() => newEvent()}>+ 일정 등록</button><button className="outline" onClick={() => onNavigate(view === '운영 캘린더' ? '행사 전후 분석' : '운영 캘린더')}>{view === '운영 캘린더' ? '행사 전후 분석' : '운영 캘린더'} 보기</button></div><div className="ops-actions"><button className="text-button" onClick={backup}>일정 백업</button><label className="ops-upload">백업 가져오기<input type="file" accept=".json,application/json" onChange={importBackup}/></label></div></div>
    {error && <div className="ops-error" role="alert"><p>{error}</p><button className="outline" onClick={reloadEvents}>저장된 일정 다시 불러오기</button></div>}{message && <p className="ops-success" role="status">{message}</p>}
    {metadata && <p className="ops-note">제공 방문 데이터: {metadata.visits.start_date} ~ {metadata.visits.end_date}. 제공 기간 밖 일정은 저장할 수 있지만 방문 분석은 대기 상태로 표시됩니다.</p>}
    {!metadata && <p className="ops-note">분석 서버 연결을 확인해 주세요. 저장된 일정·실행 계획은 확인할 수 있으며, 새로운 시설 목록과 방문 분석은 서버 연결이 필요합니다.</p>}
    {deleted && <div className="ops-success" role="status">‘{deleted.title}’ 삭제됨 <button className="outline" onClick={() => { if (events.some(e => e.id === deleted.id)) { setError('같은 ID의 기록이 이미 있어 덮어쓰지 않았습니다.'); return } if (saveAll([...events, deleted])) { setActiveId(deleted.id); setDeleted(null); setMessage('삭제한 일정을 복구했습니다.') } }}>삭제한 일정 복구</button><p>마지막 삭제 1건을 이 화면에 머무는 동안 복구할 수 있습니다.</p></div>}
    {editing && <><p className="ops-note">작성 내용은 이 탭에 임시 저장됩니다. 메뉴 이동·새로고침 후 이어서 작성할 수 있습니다. 취소하면 임시 내용은 버려집니다.</p><EventForm key={editing.id || 'new'} initial={draftEntry.base || {}} draft={editing} onDraft={value => setDraft({ ...draftEntry, value })} facilities={facilities} onCancel={() => setDraft(null)} onSave={value => {
      if (draftEntry.base && JSON.stringify(events.find(e => e.id === draftEntry.base.id)) !== JSON.stringify(draftEntry.base)) { setError('편집 중 원래 일정이 변경되거나 삭제되었습니다. 입력 내용을 복사한 뒤 취소하고 최신 일정을 다시 열어 주세요.'); return }
      const next = draftEntry.base ? events.map(e => e.id === value.id ? value : e) : [...events, value]
      if (saveAll(next)) { setDraft(null); setActiveId(value.id); setSearch(''); setFilter(''); setMonth(value.start.slice(0, 7)); setSelectedDay(value.start); setMessage('일정을 저장했습니다.') }
    }}/></>}
    {view === '운영 캘린더' ? <Calendar {...{ events, plans, month, setMonth, selectedDay, setSelectedDay, filter, setFilter, facilities, onPlan }} onNew={newEvent} onEvent={showEvent}/> : <>
      <div className="ops-toolbar"><label className="ops-field ops-search">일정 검색<input value={search} onChange={e => setSearch(e.target.value)} placeholder="일정 이름, 시설, 메모"/></label><label className="ops-field">시설 필터<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">전체 시설</option>{facilities.map(f => <option key={f}>{f}</option>)}</select></label><span>{visible.length}개 일정</span></div>
      <div className="event-workspace"><section className="card event-list" aria-label="등록된 일정">{visible.length ? visible.map(e => <button key={e.id} className={`event-list-item ${e.id === active?.id ? 'active' : ''}`} onClick={() => { setActiveId(e.id); setDeleteId('') }}><span className="badge">{e.type}</span><strong>{e.title}</strong><small>{e.facility}</small><small>{e.start} ~ {e.end}</small></button>) : <div className="ops-empty"><Icon name="file" size={32}/><h3>{events.length ? '검색 결과가 없습니다' : '첫 일정을 기록해 보세요'}</h3><p>실제 진행한 전시나 행사를 등록하면 제공 데이터 범위에서 전후 변화를 확인할 수 있습니다.</p><button className="outline" onClick={() => newEvent()}>일정 등록하기</button></div>}</section>
      <section className="card event-detail" aria-label="선택 일정 상세">{active ? <><div className="card-heading"><div><span className="eyebrow">{active.facility} / {active.type}</span><h3>{active.title}</h3></div><div className="ops-actions"><button className="text-button" onClick={() => editEvent(active)}>수정</button><button className="text-button" onClick={() => setDeleteId(active.id)}>삭제</button></div></div><p>{active.start} ~ {active.end} · {active.age || '20·30대'} · {active.sex === 'F' ? '여성' : active.sex === 'M' ? '남성' : '전체 성별'}</p>{active.memo && <p className="event-memo">{active.memo}</p>}
        {deleteId === active.id && <div className="ops-delete" role="alert"><p>‘{active.title}’ 일정을 삭제할까요?</p><button className="outline" onClick={() => { if (saveAll(events.filter(e => e.id !== active.id))) { setActiveId(events.find(e => e.id !== active.id)?.id || ''); setDeleteId(''); setDeleted(active); if (editing?.id === active.id) setDraft(null); setMessage('일정을 삭제했습니다.') } }}>삭제 확인</button><button className="text-button" onClick={() => setDeleteId('')}>취소</button></div>}
        <EventAnalysis key={active.id} event={active} events={events}/>
      </> : <div className="ops-empty"><Icon name="chart" size={40}/><h3>분석할 일정을 선택하세요</h3><p>실제 기록을 선택하면 행사 전·중·후 집계와 관객 구성이 표시됩니다.</p>{metadata && <p>제공 데이터: {metadata.visits.start_date} ~ {metadata.visits.end_date}</p>}</div>}</section></div>
    </>}
  </div>
}
