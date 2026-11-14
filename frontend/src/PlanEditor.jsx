import { useEffect, useState } from 'react'
import { Icon } from './ui'
import { steps, status } from './planStore'

export default function PlanEditor({ id, strategy, scope, record, onSave, onViewPlans }) {
  const draftKey = `culture-plan-draft:${id}`
  const [draft] = useState(() => { try { const value = JSON.parse(sessionStorage.getItem(draftKey)); return value?.base === (record?.updated_at || '') ? value : null } catch { return null } })
  const [owner, setOwner] = useState(draft?.owner ?? record?.owner ?? '')
  const [due, setDue] = useState(draft?.due ?? record?.due ?? '')
  const [memo, setMemo] = useState(draft?.memo ?? record?.memo ?? '')
  const [checks, setChecks] = useState(draft?.checks ?? record?.checks ?? [false, false, false, false])
  const [message, setMessage] = useState('')
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ base: record?.updated_at || '', owner, due, memo, checks })) } catch { /* Manual save remains available. */ }
  }, [draftKey, record?.updated_at, owner, due, memo, checks])
  const count = checks.filter(Boolean).length
  const dirty = () => setMessage('변경사항을 저장해 주세요.')
  return <section className="plan-editor" aria-label="실행 계획 편집"><div className="plan-editor-heading"><div><span className="eyebrow">ACTION PLAN</span><h3>{record ? '실행 계획 편집' : '실행 계획 만들기'}</h3></div><span className={`plan-status ${count === 4 ? 'complete' : ''}`}>{status(checks)} · {count}/4</span></div>
    <div className="plan-progress" role="progressbar" aria-label="실행 단계 진행률" aria-valuenow={count} aria-valuemin={0} aria-valuemax={4}><span style={{ width: `${count / 4 * 100}%` }}/></div>
    <div className="execution-steps">{(steps[strategy.goal] || steps['방문 규모 점검']).map((step, index) => <label key={step} className={checks[index] ? 'checked' : ''}><input type="checkbox" checked={checks[index]} onChange={() => { setChecks(checks.map((value, i) => i === index ? !value : value)); dirty() }}/><span className="step-order">{String(index + 1).padStart(2, '0')}</span><span>{step}</span></label>)}</div>
    <form onSubmit={event => { event.preventDefault(); const saved = onSave(id, { strategy, scope, owner: owner.trim(), due, memo: memo.trim(), checks, updated_at: new Date().toISOString() }); if (saved) { try { sessionStorage.removeItem(draftKey) } catch { /* Optional draft storage. */ } } setMessage(saved ? '실행 계획을 이 브라우저에 저장했습니다.' : '저장 공간에 접근하지 못했습니다. 브라우저 설정을 확인해 주세요.') }}>
      <div className="plan-fields"><label>담당자<input name="plan_owner" value={owner} maxLength={80} placeholder="예: 전시운영팀" onChange={event => { setOwner(event.target.value); dirty() }}/></label><label>목표일<input name="plan_due" type="date" value={due} onChange={event => { setDue(event.target.value); dirty() }}/></label></div>
      <label>실행 메모<textarea name="plan_memo" value={memo} maxLength={2000} rows={3} placeholder="실행 방법과 점검할 내용을 적어보세요." onChange={event => { setMemo(event.target.value); dirty() }}/><span className="print-memo">{memo || '—'}</span></label>
      <div className="plan-save-row"><span role="status">{message}</span><button className="primary" type="submit"><Icon name="check" size={15}/>{record ? '실행 계획 저장' : '실행 계획에 담기'}</button></div>
    </form>
    {record && onViewPlans && <button type="button" className="plan-view-link" onClick={() => onViewPlans(id)}>실행 계획 보기 <Icon name="arrow" size={15}/></button>}
  </section>
}

