import { useRef, useState } from 'react'
import { Icon, Mascot } from './ui'
import { downloadFile } from './downloads'
import PlanEditor from './PlanEditor'
import { readPlans, storageKey, scopeLabel, status, parseBackup } from './planStore'

export default function ExecutionPlans({ initialId, initialStatus = '전체', initialFacility = '', onExplore }) {
  const fileInput = useRef(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [archived, setArchived] = useState(false)
  const [plans, setPlans] = useState(readPlans)
  const [opened, setOpened] = useState(initialId || null)
  const [filter, setFilter] = useState(initialStatus)
  const [facility, setFacility] = useState(initialFacility)
  const [notice, setNotice] = useState('')
  const entries = Object.entries(plans).filter(([, plan]) => !!plan.archived === archived).sort((a, b) => (sort === 'due' ? (a[1].due || '9999').localeCompare(b[1].due || '9999') : sort === 'title' ? a[1].strategy.title.localeCompare(b[1].strategy.title, 'ko') : 0) || b[1].updated_at.localeCompare(a[1].updated_at))
  const scoped = entries.filter(([, plan]) => !facility || plan.scope.facility === facility)
  const visible = scoped.filter(([, plan]) => (filter === '전체' || status(plan.checks) === filter) && [plan.strategy.title, plan.scope.facility, plan.owner, plan.memo].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selected = visible.find(([id]) => id === opened)?.[1]
  const save = (id, record) => {
    const next = { ...readPlans(), [id]: { ...record, archived: record.archived ?? plans[id]?.archived ?? false } }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPlans(next); setNotice('실행 계획이 저장되었습니다.'); return true } catch { return false }
  }
  const importPlans = async event => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 백업 파일을 선택해 주세요.')
      const imported = parseBackup(await file.text())
      const current = readPlans()
      const additions = Object.entries(imported).filter(([id]) => !Object.hasOwn(current, id))
      const next = { ...current, ...Object.fromEntries(additions) }
      localStorage.setItem(storageKey, JSON.stringify(next))
      setPlans(next); setOpened(null); setNotice(`${additions.length}개 계획을 가져왔습니다. 기존 계획 ${Object.keys(imported).length - additions.length}개는 유지했습니다.`)
    } catch (error) { setNotice(error.message || '가져오지 못했습니다.') }
  }
  return <div className="execution-page">
    <div className="execution-page-heading"><div><span className="eyebrow">MY ACTION PLANS</span><h2>계획을 실행으로 이어가세요.</h2></div><button className="primary" onClick={onExplore}><Icon name="bulb" size={16}/>전략에서 계획 만들기</button></div>
    <div className="plan-tools"><label className="plan-search">계획 검색<input type="search" value={query} onChange={event => { setQuery(event.target.value); setOpened(null) }} placeholder="전략·시설·담당자·메모"/></label><label>정렬<select aria-label="계획 정렬" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">최근 수정순</option><option value="due">목표일순</option><option value="title">이름순</option></select></label><button className="outline" aria-pressed={archived} onClick={() => { setArchived(!archived); setOpened(null) }}>{archived ? '활성 계획 보기' : '보관함 보기'}</button><button className="outline" onClick={() => downloadFile('Culture-실행계획-백업.json', JSON.stringify({ format: 'culture-plans', version: 1, exported_at: new Date().toISOString(), plans: readPlans() }, null, 2), 'application/json')}>백업 다운로드</button><button className="outline" onClick={() => fileInput.current.click()}>백업 가져오기</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importPlans}/></div>
    {facility && <div className="execution-scope-chip"><Icon name="museum" size={15}/>{facility}<button onClick={() => { setFacility(''); setOpened(null) }}>전체 시설 보기</button></div>}
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
    {selected ? <section className="saved-plan-editor execution-detail" aria-label="저장한 실행 계획 상세" key={opened}><div className="detail-heading"><div><span className="eyebrow">SAVED ACTION PLAN</span><h3>{selected.strategy.title}</h3><p>{scopeLabel(selected.scope)}</p></div><div className="plan-detail-actions"><button className="outline" onClick={() => { if (save(opened, { ...readPlans()[opened], archived: !archived })) { setOpened(null); setNotice(archived ? '활성 계획으로 복원했습니다.' : '계획을 보관함으로 옮겼습니다.') } else setNotice('저장 공간에 접근하지 못했습니다.') }}>{archived ? '계획 복원' : '계획 보관'}</button><button className="outline" onClick={() => setOpened(null)}>계획 닫기</button></div></div><div className="strategy-evidence"><span>저장 당시 실행 방향</span><p>{selected.strategy.action}</p></div><PlanEditor id={opened} strategy={selected.strategy} scope={selected.scope} record={selected} onSave={save}/></section> : <div className="plan-detail-placeholder"><Icon name="file" size={30}/><h3>계획을 선택해 주세요</h3><p>체크리스트·담당자·목표일·메모를 확인하고 수정할 수 있습니다.</p></div>}
    </div> : <div className="card saved-plan-empty"><Icon name="file" size={30}/><h3>{entries.length ? '조건에 맞는 계획이 없습니다.' : '아직 저장한 실행 계획이 없습니다.'}</h3><p>{entries.length ? '다른 상태를 선택하거나 운영전략에서 새로운 계획을 만들어 보세요.' : '운영전략에서 계획을 만들고 저장하면 여기에 표시됩니다.'}</p><button className="outline" onClick={onExplore}>운영전략으로 이동</button></div>}
  </div>
}
