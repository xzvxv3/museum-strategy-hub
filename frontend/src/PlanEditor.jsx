import { useEffect, useState } from 'react'
import { Icon } from './ui'
import { steps, status } from './planStore'

export default function PlanEditor({ id, strategy, scope, record, onSave, onViewPlans }) {
  const draftKey = `culture-plan-draft:${id}`
  const [draft] = useState(() => { try { const value = JSON.parse(sessionStorage.getItem(draftKey)); return value?.base === (record?.updated_at || '') ? value : null } catch { return null } })
  const [owner, setOwner] = useState(draft?.owner ?? record?.owner ?? '')
  const [due, setDue] = useState(draft?.due ?? record?.due ?? '')
  const [memo, setMemo] = useState(draft?.memo ?? record?.memo ?? '')
  const [purpose, setPurpose] = useState(draft?.purpose ?? record?.purpose ?? '')
  const [successCriteria, setSuccessCriteria] = useState(draft?.successCriteria ?? record?.successCriteria ?? '')
  const [checks, setChecks] = useState(draft?.checks ?? record?.checks ?? [false, false, false, false])
  const [workflowStatus, setWorkflowStatus] = useState(draft?.workflowStatus ?? record?.workflowStatus ?? status(record?.checks ?? [false, false, false, false]))
  const [outcome, setOutcome] = useState(draft?.outcome ?? record?.outcome ?? '')
  const [message, setMessage] = useState('')
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ base: record?.updated_at || '', owner, due, memo, purpose, successCriteria, checks, workflowStatus, outcome })) } catch { /* Manual save remains available. */ }
  }, [draftKey, record?.updated_at, owner, due, memo, purpose, successCriteria, checks, workflowStatus, outcome])
  const count = checks.filter(Boolean).length
  const dirty = () => setMessage('변경사항을 저장해 주세요.')
  const persist = nextStatus => {
    if (nextStatus === '진행 중' && (!owner.trim() || !due || !purpose.trim() || !successCriteria.trim())) {
      setMessage('실행을 시작하려면 담당자, 목표일, 실행 목적과 완료 기준을 입력해 주세요.')
      return
    }
    if (nextStatus === '완료' && (!checks.every(Boolean) || !outcome.trim())) {
      setMessage('완료하려면 4개 실행 항목을 확인하고 실행 결과를 기록해 주세요.')
      return
    }
    const saved = onSave(id, { strategy, scope, owner: owner.trim(), due, memo: memo.trim(), purpose: purpose.trim(), successCriteria: successCriteria.trim(), checks, workflowStatus: nextStatus, outcome: outcome.trim(), updated_at: new Date().toISOString() })
    if (saved) {
      setWorkflowStatus(nextStatus)
      try { sessionStorage.removeItem(draftKey) } catch { /* Optional draft storage. */ }
    }
    setMessage(saved ? '실행 계획을 이 브라우저에 저장했습니다.' : '저장 공간에 접근하지 못했습니다. 브라우저 설정을 확인해 주세요.')
  }
  return <section className="plan-editor" aria-label="실행 계획 편집"><div className="plan-editor-heading"><div><span className="eyebrow">ACTION PLAN</span><h3>{record ? '실행 계획 편집' : '실행 계획 만들기'}</h3></div><span className={`plan-status ${count === 4 ? 'complete' : ''}`}>{status(checks, workflowStatus)} · {count}/4</span></div>
    <p className="plan-workflow-hint">체크리스트는 실행 진행 상황을 기록하는 용도예요. 상태 전환과 완료는 아래 실행 관리 버튼에서 확정하세요.</p>
    <div className="plan-progress" role="progressbar" aria-label="실행 단계 진행률" aria-valuenow={count} aria-valuemin={0} aria-valuemax={4}><span style={{ width: `${count / 4 * 100}%` }}/></div>
    <div className="execution-steps">{(steps[strategy.goal] || steps['방문 규모 점검']).map((step, index) => <label key={step} className={checks[index] ? 'checked' : ''}><input type="checkbox" checked={checks[index]} onChange={() => { setChecks(checks.map((value, i) => i === index ? !value : value)); dirty() }}/><span className="step-order">{String(index + 1).padStart(2, '0')}</span><span>{step}</span></label>)}</div>
    <form onSubmit={event => { event.preventDefault(); persist(workflowStatus) }}>
      <div className="plan-fields"><label>담당자<input name="plan_owner" value={owner} maxLength={80} placeholder="예: 전시운영팀" onChange={event => { setOwner(event.target.value); dirty() }}/></label><label>목표일<input name="plan_due" type="date" value={due} onChange={event => { setDue(event.target.value); dirty() }}/></label></div>
      <div className="plan-intent-fields">
        <label>실행 목적<textarea name="plan_purpose" value={purpose} maxLength={500} rows={2} placeholder="예: 평일 해설 프로그램의 방문 수요를 확인한다" onChange={event => { setPurpose(event.target.value); dirty() }}/></label>
        <label>완료 및 성과 판단 기준<textarea name="plan_criteria" value={successCriteria} maxLength={500} rows={2} placeholder="예: 시범 운영 후 방문 인구와 현장 의견을 기록한다" onChange={event => { setSuccessCriteria(event.target.value); dirty() }}/></label>
      </div>
      <label>실행 메모<textarea name="plan_memo" value={memo} maxLength={2000} rows={3} placeholder="실행 방법과 점검할 내용을 적어보세요." onChange={event => { setMemo(event.target.value); dirty() }}/><span className="print-memo">{memo || '—'}</span></label>
      {(workflowStatus === '진행 중' || workflowStatus === '완료') && <label>실행 결과 및 관찰 사항<textarea name="plan_outcome" value={outcome} maxLength={2000} rows={3} placeholder="예: 평일 해설을 2회 운영했고 방문 인구 추이를 검토했다. 효과의 인과관계는 확인되지 않았다." onChange={event => { setOutcome(event.target.value); dirty() }}/></label>}
      <div className="plan-save-row"><span role="status">{message}</span><button className="primary" type="submit"><Icon name="check" size={15}/>{record ? '실행 계획 저장' : '실행 계획에 담기'}</button></div>
      {record && <div className="plan-save-row" aria-label="실행 상태 변경">
        {workflowStatus === '준비' && <button className="primary" type="button" onClick={() => persist('진행 중')}>실행 시작</button>}
        {workflowStatus === '진행 중' && <button className="primary" type="button" onClick={() => persist('완료')}>계획 완료</button>}
        {workflowStatus === '완료' && <button className="outline" type="button" onClick={() => persist('진행 중')}>진행 중으로 되돌리기</button>}
      </div>}
    </form>
    {record && onViewPlans && <button type="button" className="plan-view-link" onClick={() => onViewPlans(id)}>실행 계획 보기 <Icon name="arrow" size={15}/></button>}
  </section>
}

