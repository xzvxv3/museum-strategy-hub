import { useEffect, useState } from 'react'
import { Icon } from './ui'
import { validDate, dateString } from './eventStore'
import { status } from './planStore'
import DateRangePicker from './DateRangePicker'

export default function PlanEditor({ id, strategy, scope, record, onSave, onViewPlans, onCancel }) {
  const draftKey = `culture-plan-draft:${id}`
  const [draft] = useState(() => { try { const value = JSON.parse(sessionStorage.getItem(draftKey)); return value?.base === (record?.updated_at || '') ? value : null } catch { return null } })
  const [owner, setOwner] = useState(draft?.owner ?? record?.owner ?? '')
  const [executionStart, setExecutionStart] = useState(draft?.executionStart ?? record?.executionStart ?? '')
  const [executionEnd, setExecutionEnd] = useState(draft?.executionEnd ?? record?.executionEnd ?? draft?.due ?? record?.due ?? '')
  const [eventType, setEventType] = useState(draft?.eventType ?? record?.eventType ?? '')
  const [actualStart, setActualStart] = useState(draft?.actualStart ?? record?.actualStart ?? '')
  const [actualEnd, setActualEnd] = useState(draft?.actualEnd ?? record?.actualEnd ?? '')
  const [memo, setMemo] = useState(draft?.memo ?? record?.memo ?? '')
  const [purpose, setPurpose] = useState(draft?.purpose ?? record?.purpose ?? '')
  const [successCriteria, setSuccessCriteria] = useState(draft?.successCriteria ?? record?.successCriteria ?? '')
  const checks = record?.checks ?? [false, false, false, false]
  const [workflowStatus, setWorkflowStatus] = useState(draft?.workflowStatus ?? record?.workflowStatus ?? status(record?.checks ?? [false, false, false, false]))
  const [outcome, setOutcome] = useState(draft?.outcome ?? record?.outcome ?? '')
  const [message, setMessage] = useState('')
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ base: record?.updated_at || '', owner, executionStart, executionEnd, eventType, actualStart, actualEnd, memo, purpose, successCriteria, workflowStatus, outcome })) } catch { /* Manual save remains available. */ }
  }, [draftKey, record?.updated_at, owner, executionStart, executionEnd, eventType, actualStart, actualEnd, memo, purpose, successCriteria, workflowStatus, outcome])
  const dirty = () => setMessage('')
  const persist = nextStatus => {
    if ((executionStart || executionEnd) && (!validDate(executionStart) || !validDate(executionEnd) || executionStart > executionEnd)) {
      setMessage('실행 시작일과 종료일을 확인해 주세요. 종료일은 시작일 이후여야 합니다.')
      return
    }
    if ((actualStart || actualEnd) && (!validDate(actualStart) || !validDate(actualEnd) || actualStart > actualEnd || actualEnd > dateString(new Date()))) {
      setMessage('실제 실행 기간을 확인해 주세요. 종료일은 시작일 이후이며 오늘까지의 날짜여야 합니다.')
      return
    }
    if (nextStatus === '진행 중' && (!owner.trim() || !executionStart || !executionEnd || !purpose.trim() || !successCriteria.trim())) {
      setMessage('실행을 시작하려면 담당자, 실행 기간, 실행 목적과 완료 기준을 입력해 주세요.')
      return
    }
    if (nextStatus === '완료' && !outcome.trim()) {
      setMessage('완료하려면 실행 결과를 기록해 주세요.')
      return
    }
    const saved = onSave(id, { strategy, scope, owner: owner.trim(), due: executionEnd, executionStart, executionEnd, eventType, actualStart, actualEnd, linkAnalysis: !!(eventType && actualStart && actualEnd), ...(record?.analysisFacility ? { analysisFacility: record.analysisFacility } : {}), memo: memo.trim(), purpose: purpose.trim(), successCriteria: successCriteria.trim(), checks, workflowStatus: nextStatus, outcome: outcome.trim(), updated_at: new Date().toISOString() })
    if (saved) {
      setWorkflowStatus(nextStatus)
      try { sessionStorage.removeItem(draftKey) } catch { /* Optional draft storage. */ }
    }
    setMessage(saved ? '' : '저장 공간에 접근하지 못했습니다. 브라우저 설정을 확인해 주세요.')
  }
  return <section className="plan-editor" aria-label="실행 계획 편집"><div className="plan-editor-heading"><div><span className="eyebrow">ACTION PLAN</span><h3>{record ? '실행 계획 편집' : '실행 계획 만들기'}</h3></div><span className={`plan-status ${workflowStatus === '완료' ? 'complete' : ''}`}>{workflowStatus}</span></div>
    <form onSubmit={event => { event.preventDefault(); persist(workflowStatus) }}>
      <div className="plan-editor-fields">
      <div className="plan-fields"><label>담당자<input name="plan_owner" value={owner} maxLength={80} placeholder="예: 전시운영팀" onChange={event => { setOwner(event.target.value); dirty() }}/></label><label>활동 유형<select name="plan_event_type" value={eventType} onChange={event => { setEventType(event.target.value); dirty() }}><option value="">일반 운영</option><option value="행사">행사</option><option value="전시">전시</option></select></label></div>
      <div className="plan-period-picker"><DateRangePicker label="실행 기간" start={executionStart} end={executionEnd} min="1901-01-01" max="2099-12-31" allowAll={false} startName="plan_start" endName="plan_end" onChange={(start, end) => { setExecutionStart(start); setExecutionEnd(end); dirty() }}/></div>
      <div className="plan-intent-fields">
        <label>실행 목적<textarea name="plan_purpose" value={purpose} maxLength={500} rows={2} placeholder="예: 평일 해설 프로그램의 방문 수요를 확인한다" onChange={event => { setPurpose(event.target.value); dirty() }}/></label>
        <label>완료 및 성과 판단 기준<textarea name="plan_criteria" value={successCriteria} maxLength={500} rows={2} placeholder="예: 시범 운영 후 방문 인구와 현장 의견을 기록한다" onChange={event => { setSuccessCriteria(event.target.value); dirty() }}/></label>
      </div>
      <label>실행 메모<textarea name="plan_memo" value={memo} maxLength={2000} rows={3} placeholder="실행 방법과 점검할 내용을 적어보세요." onChange={event => { setMemo(event.target.value); dirty() }}/><span className="print-memo">{memo || '—'}</span></label>
      {(workflowStatus === '진행 중' || workflowStatus === '완료') && <label>실행 결과 및 관찰 사항<textarea name="plan_outcome" value={outcome} maxLength={2000} rows={3} placeholder="예: 평일 해설을 2회 운영했고 방문 인구 추이를 검토했다. 효과의 인과관계는 확인되지 않았다." onChange={event => { setOutcome(event.target.value); dirty() }}/></label>}
      {eventType && (workflowStatus === '진행 중' || workflowStatus === '완료') && <fieldset className="plan-date-range"><legend>실제 실행 기간</legend><DateRangePicker label="실제 실행 기간" start={actualStart} end={actualEnd} min="1901-01-01" max={dateString(new Date())} allowAll={false} startName="plan_actual_start" endName="plan_actual_end" onChange={(start, end) => { setActualStart(start); setActualEnd(end); dirty() }}/><p className="plan-analysis-hint">완료된 행사·전시는 실제 실행 기간을 기준으로 행사 전후 분석에 자동 표시됩니다.</p></fieldset>}
      {message && <p className="plan-form-error" role="alert">{message}</p>}
      </div>
      <div className="plan-save-row plan-editor-actions" aria-label="실행 계획 관리">
        {onCancel && <button type="button" className="outline" onClick={onCancel}>취소</button>}
        <button className="outline" type="submit"><Icon name="check" size={15}/>실행 계획 저장</button>
        {workflowStatus === '준비' && <button className="outline" type="button" onClick={() => persist('진행 중')}><Icon name="arrow" size={15}/>실행 시작</button>}
        {workflowStatus === '진행 중' && <button className="primary" type="button" onClick={() => persist('완료')}>계획 완료</button>}
        {workflowStatus === '완료' && <button className="outline" type="button" onClick={() => persist('진행 중')}>진행 중으로 되돌리기</button>}
      </div>
    </form>
    {record && onViewPlans && <button type="button" className="plan-view-link" onClick={() => onViewPlans(id)}>실행 계획 보기 <Icon name="arrow" size={15}/></button>}
  </section>
}

