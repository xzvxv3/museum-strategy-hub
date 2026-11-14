import PageBanner from './PageBanner'
import { useState } from 'react'
import { Icon, Mascot } from './ui'
import PlanEditor from './PlanEditor'
import { readPlans, storageKey, scopeLabel, status } from './planStore'

export default function ExecutionPlans({ initialId, initialStatus = '전체', initialFacility = '', onExplore }) {
  const [plans, setPlans] = useState(readPlans)
  const [opened, setOpened] = useState(initialId || null)
  const [filter, setFilter] = useState(initialStatus)
  const [notice, setNotice] = useState('')
  const entries = Object.entries(plans).filter(([, plan]) => !plan.archived).sort((a, b) => b[1].updated_at.localeCompare(a[1].updated_at))
  const scoped = entries.filter(([, plan]) => !initialFacility || plan.scope.facility === initialFacility)
  const visible = scoped.filter(([, plan]) => filter === '전체' || status(plan.checks) === filter)
  const selected = visible.find(([id]) => id === opened)?.[1]
  const save = (id, record) => {
    const next = { ...readPlans(), [id]: { ...record, archived: record.archived ?? plans[id]?.archived ?? false } }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPlans(next); setNotice('실행 계획이 저장되었습니다.'); return true } catch { return false }
  }
  return <div className="execution-page">
    <PageBanner eyebrow="MY ACTION PLANS" title={<>작은 계획을 실행으로,<br/>박물관의 변화를 시작하세요.</>} variant="success" label="실행 계획 소개"/>
    <div className="plan-filter-tabs" role="group" aria-label="실행 계획 상태 필터">{['전체', '준비', '진행 중', '완료'].map(value => <button type="button" aria-pressed={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => { setFilter(value); setOpened(null); setNotice('') }}><span>{value}</span><b>{scoped.filter(([, plan]) => value === '전체' || status(plan.checks) === value).length}</b></button>)}</div>
    
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
      const completed = plan.checks.filter(Boolean).length
      return <button type="button" className={`saved-plan-card ${opened === id ? 'selected' : ''}`} key={id} aria-expanded={opened === id} onClick={() => { setOpened(opened === id ? null : id); setNotice('') }}><span className={`plan-status ${completed === 4 ? 'complete' : ''}`}>{status(plan.checks)}</span><strong>{plan.strategy.title}</strong><p>{scopeLabel(plan.scope)}</p><div><span><Icon name="user" size={13}/>{plan.owner || '담당자 미지정'}</span><span><Icon name="calendar" size={13}/>{plan.due || '목표일 미지정'}</span></div><div className="saved-progress"><span style={{ width: `${completed / 4 * 100}%` }}/></div><span className="saved-plan-edit">{completed}/4 단계 완료 · 진행률 {completed * 25}% <span>계획 열기 →</span></span></button>
    })}</div>
    {selected ? <section className="saved-plan-editor execution-detail" aria-label="저장한 실행 계획 상세" key={opened}><div className="detail-heading"><div><span className="eyebrow">SAVED ACTION PLAN</span><h3>{selected.strategy.title}</h3><p>{scopeLabel(selected.scope)}</p></div><div className="plan-detail-actions"><button className="outline" onClick={() => setOpened(null)}>계획 닫기</button></div></div><div className="strategy-evidence"><span>저장 당시 실행 방향</span><p>{selected.strategy.action}</p></div><PlanEditor id={opened} strategy={selected.strategy} scope={selected.scope} record={selected} onSave={save}/></section> : <div className="plan-detail-placeholder"><Icon name="file" size={30}/><h3>계획을 선택해 주세요</h3></div>}
    </div> : <div className="card saved-plan-empty"><Icon name="file" size={30}/><h3>{entries.length ? '조건에 맞는 계획이 없습니다.' : '아직 저장한 실행 계획이 없습니다.'}</h3><p>{entries.length ? '다른 상태를 선택하거나 운영전략에서 새로운 계획을 만들어 보세요.' : '운영전략에서 계획을 만들고 저장하면 여기에 표시됩니다.'}</p><button className="outline" onClick={onExplore}>운영전략으로 이동</button></div>}
  </div>
}
