import PageBanner from './PageBanner'
import { useState } from 'react'
import { Icon, Mascot } from './ui'
import PlanEditor from './PlanEditor'
import { readPlans, storageKey, scopeLabel, status, planPeriodLabel } from './planStore'

export default function ExecutionPlans({ initialId, initialStatus = '전체', initialFacility = '', onExplore }) {
  const [plans, setPlans] = useState(readPlans)
  const [opened, setOpened] = useState(initialId || null)
  const [filter, setFilter] = useState(initialStatus)
  const [notice, setNotice] = useState('')
  const entries = Object.entries(plans).filter(([, plan]) => !plan.archived).sort((a, b) => b[1].updated_at.localeCompare(a[1].updated_at))
  const scoped = entries.filter(([, plan]) => !initialFacility || plan.scope.facility === initialFacility)
  const visible = scoped.filter(([, plan]) => filter === '전체' || status(plan.checks, plan.workflowStatus) === filter)
  const selected = visible.find(([id]) => id === opened)?.[1]
  const save = (id, record) => {
    const next = { ...readPlans(), [id]: { ...record, archived: record.archived ?? plans[id]?.archived ?? false } }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPlans(next); setNotice(''); return true } catch { return false }
  }
  const remove = id => {
    const plan = plans[id]
    if (!plan || !window.confirm(`“${plan.strategy.title}” 실행 계획을 삭제할까요?\n담당자·메모·실행 결과도 함께 삭제되며 복구할 수 없습니다.`)) return
    try {
      const next = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem('culture-execution-plans-v1') ?? '{}')
      if (!next || Array.isArray(next) || typeof next !== 'object') throw new Error('Invalid plan storage')
      delete next[id]
      localStorage.setItem(storageKey, JSON.stringify(next))
      setPlans(readPlans())
      if (opened === id) setOpened(null)
      try { sessionStorage.removeItem(`culture-plan-draft:${id}`) } catch { /* Optional draft storage. */ }
      setNotice('')
    } catch {
      setNotice('실행 계획을 삭제하지 못했습니다. 브라우저 저장소를 확인한 뒤 다시 시도해 주세요.')
    }
  }
  return <div className="execution-page">
    <PageBanner eyebrow="MY ACTION PLANS" title={<>작은 계획을 실행으로,<br/>박물관의 변화를 시작하세요.</>} variant="success" label="실행 계획 소개"/>
    <section className="execution-overview" aria-label="실행 계획 이용 안내">
      <div><strong>계획을 세우고, 실행하고, 결과를 남기세요.</strong><p>계획을 선택하면 진행 단계와 해야 할 일을 확인할 수 있어요.</p></div>
      <button type="button" className="outline" onClick={onExplore}>+ 운영전략에서 계획 만들기</button>
    </section>
    <div className="plan-filter-tabs" role="group" aria-label="실행 계획 상태 필터">{['전체', '준비', '진행 중', '완료'].map(value => <button type="button" aria-pressed={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => { setFilter(value); setOpened(null); setNotice('') }}><span>{value}</span><b>{scoped.filter(([, plan]) => value === '전체' || status(plan.checks, plan.workflowStatus) === value).length}</b></button>)}</div>
    
          {filter === '완료' && visible.length > 0 && (
        <div className="success-mascot-guide">
          <Mascot variant="success" />
          <div>
            <strong>실행 계획을 완료했어요!</strong>
            <p>완료한 계획을 확인하고 다음 운영 개선을 준비해 보세요.</p>
          </div>
        </div>
      )}
    {notice && <p className="plan-notice" role="status">{notice}</p>}
    {visible.length ? <div className="execution-layout"><div className="execution-plan-list">{visible.map(([id, plan]) => {
      return <button type="button" className={`saved-plan-card ${opened === id ? 'selected' : ''}`} key={id} aria-expanded={opened === id} onClick={() => { setOpened(opened === id ? null : id); setNotice('') }}><span className={`plan-status ${status(plan.checks, plan.workflowStatus) === '완료' ? 'complete' : ''}`}>{status(plan.checks, plan.workflowStatus)}</span><strong>{plan.strategy.title}</strong><p>{scopeLabel(plan.scope)}</p><div><span><Icon name="user" size={13}/>{plan.owner || '담당자 미지정'}</span><span><Icon name="calendar" size={13}/>{planPeriodLabel(plan)}</span></div><span className="saved-plan-edit"><span>계획 확인 →</span></span></button>
    })}</div>
    {selected ? <section className="saved-plan-editor execution-detail" aria-label="저장한 실행 계획 상세" key={opened}><div className="detail-heading"><div><span className="eyebrow">SAVED ACTION PLAN</span><h3>{selected.strategy.title}</h3><p>{scopeLabel(selected.scope)}</p></div><div className="plan-detail-actions"><button type="button" className="plan-delete-button" onClick={() => remove(opened)}>계획 삭제</button><button className="outline" onClick={() => setOpened(null)}>계획 닫기</button></div></div><div className="strategy-evidence"><span>저장 당시 실행 방향</span><p>{selected.strategy.action}</p></div>
      {status(selected.checks, selected.workflowStatus) === '완료' && <section className="plan-outcome-summary" aria-label="완료된 계획의 실행 결과"><div className="plan-outcome-summary-heading"><span>완료 결과</span><strong>실행 결과 및 관찰 사항</strong></div><p>{selected.outcome?.trim() || '이전 방식으로 완료된 계획입니다. 실행 결과를 보완해 주세요.'}</p><small>이 기록은 실행 관찰 내용이며 방문 변화의 원인을 입증하지는 않습니다.</small></section>}<PlanEditor id={opened} strategy={selected.strategy} scope={selected.scope} record={selected} onSave={save}/></section> : <div className="plan-detail-placeholder"><Icon name="file" size={30}/><h3>관리할 실행 계획을 선택해 주세요</h3><p className="execution-placeholder-help">목록에서 계획을 선택하면 현재 상태와 실행 결과를 관리할 수 있어요.</p></div>}
    </div> : <div className="card saved-plan-empty"><Icon name="file" size={30}/><h3>{entries.length ? '조건에 맞는 계획이 없습니다.' : '아직 저장한 실행 계획이 없습니다.'}</h3><p>{entries.length ? '다른 상태를 선택하거나 운영전략에서 새로운 계획을 만들어 보세요.' : '운영전략에서 데이터 근거를 확인한 뒤 실행 계획을 만들어 보세요.'}</p><button className="outline" onClick={onExplore}>운영전략으로 이동</button></div>}
  </div>
}
