import { useEffect, useState } from 'react'
import { Icon, Mascot } from './ui'
import { readPlans, status, planPeriod, planPeriodLabel } from './planStore'

const fmt = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
const states = [{ label: '준비', color: '#87a9c1' }, { label: '진행 중', color: '#bd8b47' }, { label: '완료', color: '#176b68' }]
const isoToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const dayDifference = (value, today) => Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)

export default function HomeHub({ data, filters, onAnalyze, onStrategies, onPlans }) {
  const [stored, setStored] = useState(readPlans)
  useEffect(() => {
    const refresh = () => setStored(readPlans())
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  const plans = Object.entries(stored).filter(([, plan]) => !plan.archived && (!filters.facility || plan.scope.facility === filters.facility))
  const counts = states.map(state => plans.filter(([, plan]) => status(plan.checks, plan.workflowStatus) === state.label).length)
  const total = plans.length
  const today = isoToday()
  const scheduled = plans.map(([id, plan]) => [id, { ...plan, due: planPeriod(plan).end }]).filter(([, plan]) => status(plan.checks, plan.workflowStatus) !== '완료' && /^\d{4}-\d{2}-\d{2}$/.test(plan.due) && Number.isFinite(Date.parse(plan.due)))
    .sort((a, b) => a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]))
  const overdue = scheduled.filter(([, plan]) => plan.due < today).length
  const featured = data.strategies[0]
  const evidence = featured?.evidence.replace(/(\d[\d,]*(?:\.\d+)?)명/g, (_, value) => `${fmt(value.replaceAll(',', ''))}명`)
  const firstEnd = total ? counts[0] / total * 100 : 0
  const secondEnd = total ? (counts[0] + counts[1]) / total * 100 : 0
  const ring = total ? `conic-gradient(${states[0].color} 0 ${firstEnd}%,${states[1].color} ${firstEnd}% ${secondEnd}%,${states[2].color} ${secondEnd}% 100%)` : '#e8eeea'
  const scope = filters.facility || '전체 시설'
  return <div className="home-hub">
    <section className="home-business-stats" aria-label="운영 현황 요약">
      <button className="business-stat" onClick={onAnalyze}><span className="business-stat-heading"><i className="stat-icon teal"><Icon name="chart" size={19}/></i><span>방문 인구</span><Icon name="arrow" size={16}/></span><strong className="home-total-value">{fmt(data.summary.population)}<small>명</small></strong><span className="business-stat-foot">{filters.age || '20·30대'} · {filters.sex === 'F' ? '여성' : filters.sex === 'M' ? '남성' : '전체 성별'}</span></button>
      <button className="business-stat" onClick={onStrategies}><span className="business-stat-heading"><i className="stat-icon gold"><Icon name="bulb" size={19}/></i><span>검토할 전략</span><Icon name="arrow" size={16}/></span><strong>{data.strategies.length}<small>개</small></strong><span className="business-stat-foot">{filters.facility ? '선택 시설의 운영 포인트' : '시설을 선택해 맞춤 전략 확인'}</span></button>
      <button className="business-stat" onClick={() => onPlans(null, '진행 중')}><span className="business-stat-heading"><i className="stat-icon blue"><Icon name="file" size={19}/></i><span>진행 중인 계획</span><Icon name="arrow" size={16}/></span><strong>{counts[1]}<small>개</small></strong><span className="business-stat-foot">{scope} · 모든 기간</span></button>
    </section>

    <div className="home-work-grid"><section className="home-operating-point"><div className="operating-point-top"><span className="eyebrow">YOUR NEXT STEP</span><span className="operating-point-chip">{featured?.goal || '운영 인사이트'}</span></div><div className="operating-point-copy"><h2>{featured ? featured.title : !filters.facility ? '우리 시설의 다음 운영을\n함께 살펴볼까요?' : data.facility_profile?.supported ? '지금의 흐름을\n차분히 살펴보세요.' : '분석 범위를 넓혀\n운영 포인트를 찾아보세요.'}</h2><p>{featured ? evidence : !filters.facility ? '위에서 시설을 선택하면 방문 특성에 맞는 검토 항목을 확인할 수 있어요.' : data.facility_profile?.supported ? '현재 조건에서 뚜렷한 조정 신호는 없습니다. 방문 흐름과 실행 계획을 이어서 확인하세요.' : '선택한 범위의 관측이 부족합니다. 기간과 관객 조건을 조정해 보세요.'}</p></div><div className="operating-point-actions"><button className="point-primary" onClick={onStrategies}>{featured ? '이 전략 검토하기' : '운영전략 살펴보기'}<Icon name="arrow" size={17}/></button><button className="point-secondary" onClick={onAnalyze}>방문 현황 보기</button></div><div className="operating-point-art" aria-hidden="true"><span/><Mascot variant="strategy"/></div></section>

    <section className="home-plan-panel" aria-label="홈 실행 계획 현황"><div className="home-panel-heading"><div><span className="eyebrow">ACTION OVERVIEW</span><h2>실행 계획 현황</h2></div><button className="panel-link" onClick={() => onPlans()}>전체 보기<Icon name="arrow" size={14}/></button></div><div className="home-plan-body"><div className="plan-status-ring" style={{ background: ring }} role="img" aria-label={`실행 계획 전체 ${total}개, 준비 ${counts[0]}개, 진행 중 ${counts[1]}개, 완료 ${counts[2]}개`}><div><span>전체 계획</span><strong>{total}</strong><small>{total ? `${counts[2]}개 완료` : '아직 계획이 없어요'}</small></div></div><div className="home-state-list">{states.map((state, index) => <button key={state.label} onClick={() => onPlans(null, state.label)}><i style={{ background: state.color }}/><span>{state.label}</span><b>{counts[index]}</b><Icon name="arrow" size={13}/></button>)}</div></div><div className="home-plan-footer"><span>{scope} · 모든 기간</span>{total ? <span>완료율 {Math.round(counts[2] / total * 100)}%</span> : <button onClick={onStrategies}>첫 계획 만들기 →</button>}</div></section></div>

    <section className="home-deadlines" aria-label="홈 실행 종료일 목록"><div className="home-panel-heading"><div><span className="eyebrow">UPCOMING TASKS</span><h2>다가오는 종료일{overdue > 0 && <span className="overdue-count">기한 지난 계획 {overdue}개</span>}</h2></div><button className="panel-link" onClick={() => onPlans()}>계획 관리<Icon name="arrow" size={14}/></button></div>{scheduled.length ? <div className="home-deadline-list">{scheduled.slice(0, 4).map(([id, plan]) => {
      const days = dayDifference(plan.due, today)
      const label = days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'D-day' : `D−${days}`
      return <button className="home-deadline-row" key={id} onClick={() => onPlans(id)}><span className="deadline-date"><small>{Number(plan.due.slice(5, 7))}월</small><b>{Number(plan.due.slice(8))}</b></span><span className="deadline-copy"><strong>{plan.strategy.title}</strong><small>{plan.scope.facility || '전체 시설'} · {planPeriodLabel(plan)}</small></span><span className="deadline-status">{status(plan.checks, plan.workflowStatus)}</span><span className={`deadline-countdown ${days < 0 ? 'late' : days <= 7 ? 'soon' : ''}`}>{label}</span><Icon name="arrow" size={16}/></button>
    })}</div> : <div className="home-deadline-empty"><span><Icon name="calendar" size={25}/></span><div><h3>다가오는 종료일이 없습니다.</h3><p>실행 기간의 종료일을 정하면 여기에서 확인할 수 있어요.</p></div><button className="outline" onClick={() => onPlans()}>실행 계획 보기</button></div>}</section>
  </div>
}
