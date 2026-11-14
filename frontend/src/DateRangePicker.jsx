import { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'

const iso = date => date.toISOString().slice(0, 10)
const dayDate = (year, month, day) => new Date(Date.UTC(year, month, day))

function RangeDialog({ start, end, min, max, onApply, onClose }) {
  const dialog = useRef(null)
  const [draft, setDraft] = useState({ start, end })
  const [month, setMonth] = useState((start || min).slice(0, 7))
  const [hover, setHover] = useState('')
  useEffect(() => { dialog.current.showModal() }, [])
  const months = []
  for (let cursor = min.slice(0, 7); cursor <= max.slice(0, 7);) {
    months.push(cursor)
    const [year, mon] = cursor.split('-').map(Number)
    cursor = iso(dayDate(year, mon, 1)).slice(0, 7)
  }
  const [year, mon] = month.split('-').map(Number)
  const offset = dayDate(year, mon - 1, 1).getUTCDay()
  const days = dayDate(year, mon, 0).getUTCDate()
  const pending = draft.start && !draft.end
  const previewEnd = draft.end || (pending ? hover : '')
  const rangeStart = previewEnd && previewEnd < draft.start ? previewEnd : draft.start
  const rangeEnd = previewEnd && previewEnd < draft.start ? draft.start : previewEnd
  const choose = date => {
    if (!draft.start || draft.end) setDraft({ start: date, end: '' })
    else setDraft({ start: date < draft.start ? date : draft.start, end: date < draft.start ? draft.start : date })
    setHover('')
  }
  const apply = () => { onApply(draft.start, draft.end); onClose() }
  return <dialog ref={dialog} className="range-dialog" aria-label="분석 기간 선택" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose() }}>
    <div className="range-dialog-body"><div className="range-heading"><div><span className="eyebrow">ANALYSIS PERIOD</span><h2>분석 기간 선택</h2></div><button type="button" className="range-close" aria-label="기간 선택 닫기" onClick={onClose}>✕</button></div>
      <p className="range-instruction" aria-live="polite">{pending ? '종료일을 선택해 주세요. 같은 날짜를 다시 누르면 하루만 선택됩니다.' : !draft.start && !draft.end ? '시작일과 종료일을 선택하세요. 선택 없이 적용하면 전체 기간으로 조회합니다.' : '시작일과 종료일을 달력에서 차례로 선택하세요.'}</p>
      <div className="range-preview"><div className={pending ? '' : 'current'}><span>시작일</span><b>{draft.start || '선택해 주세요'}</b></div><span>→</span><div className={pending ? 'current' : ''}><span>종료일</span><b>{draft.end || '선택해 주세요'}</b></div></div>
      <div className="calendar-toolbar"><button type="button" className="outline" aria-label="이전 달" disabled={month === months[0]} onClick={() => { setMonth(months[months.indexOf(month) - 1]); setHover('') }}>‹</button><select aria-label="달력 월" value={month} onChange={event => { setMonth(event.target.value); setHover('') }}>{months.map(value => <option key={value} value={value}>{value.slice(0, 4)}년 {Number(value.slice(5))}월</option>)}</select><button type="button" className="outline" aria-label="다음 달" disabled={month === months.at(-1)} onClick={() => { setMonth(months[months.indexOf(month) + 1]); setHover('') }}>›</button></div>
      <div className="range-calendar" onMouseLeave={() => setHover('')}><div className="calendar-weekdays" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days" role="group" aria-label={`${month} 날짜 선택`}>
        {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`}/>)}
        {Array.from({ length: days }, (_, i) => {
          const date = iso(dayDate(year, mon - 1, i + 1))
          const endpoint = date === draft.start || date === draft.end
          const between = rangeStart && rangeEnd && date > rangeStart && date < rangeEnd
          return <button type="button" key={date} aria-label={date} aria-pressed={endpoint} disabled={date < min || date > max} className={`calendar-day ${endpoint ? 'endpoint' : ''} ${between ? 'between' : ''}`} onMouseEnter={() => { if (pending) setHover(date) }} onFocus={() => { if (pending) setHover(date) }} onClick={() => choose(date)}>{i + 1}</button>
        })}</div></div>
      <div className="range-footer"><div className="range-selection-actions"><button type="button" className="text-button" onClick={() => { setDraft({ start: '', end: '' }); setHover('') }}>선택 초기화</button><button type="button" className="text-button" onClick={() => { setDraft({ start: min, end: max }); setHover('') }}>제공 기간 전체</button></div><div><button type="button" className="outline" onClick={onClose}>취소</button><button type="button" className="primary" disabled={!!draft.start !== !!draft.end} onClick={apply}>기간 적용</button></div></div>
    </div>
  </dialog>
}

export default function DateRangePicker({ start, end, min, max, onChange }) {
  const [open, setOpen] = useState(false)
  return <div className="date-range-field"><span className="range-field-label">분석 기간</span><button type="button" className="date-range-trigger" aria-label="분석 기간 선택" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="calendar" size={16}/><span>{start || end ? `${start || min} ~ ${end || max}` : '전체 기간'}</span><span aria-hidden="true">⌄</span></button>
    <input type="hidden" name="start_date" value={start}/><input type="hidden" name="end_date" value={end}/>
    {open && <RangeDialog {...{ start, end, min, max }} onApply={onChange} onClose={() => setOpen(false)}/>}
  </div>
}
