import { useState } from 'react'
import Dendrogram from './Dendrogram'
import { Badge, Card } from './ui'
import { ChartTable, ClusterGate, DataTable, LineChart, Segmented, StatCards } from './ClusterCharts'
import { clusterColor, num, pct, scopeLabel, useClusterResult } from './clusterUtils'

const SHARE_KEYS = new Set(['weekend_share', 'evening_share', 'dawn_share', 'female_share', 'age30_share'])
const isShare = key => SHARE_KEYS.has(key) || key.startsWith('pattern_c')
const fmtFeature = (key, v) => v == null ? '—' : isShare(key) ? pct(v) : key === 'n_partners' ? num(v) : v.toFixed(3)
const fmtDiff = (key, v) => v == null ? '—' : isShare(key) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%p` : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`

export default function SimilarMuseums({ filters, metadata }) {
  const resource = useClusterResult(2, filters)
  return <ClusterGate resource={resource} title="유사 박물관 그룹 (2단계 Ward 계층 군집)" scope={scopeLabel(filters, metadata)}
    runNote="1단계 방문 패턴 결과가 없으면 함께 실행하므로 약 15~20초 걸릴 수 있습니다.">
    {data => <GroupResult key={data.run_id} data={data} facility={filters.facility}/>}
  </ClusterGate>
}

function GroupResult({ data: res, facility }) {
  const [k, setK] = useState(res.selection.k)
  const labels = res.labels_by_k[String(k)]
  const ev = res.evaluation.find(e => e.k === k)
  const isSelectedK = k === res.selection.k
  const view = res.facility_view
  const myGroup = view?.group
  const used = res.features.used
  const groupsAtK = Object.entries(labels).reduce((acc, [id, g]) => ({ ...acc, [g]: [...(acc[g] || []), id] }), {})
  const groupName = g => isSelectedK ? res.groups.find(x => x.id === Number(g))?.name : `그룹 ${Number(g) + 1}`

  return <section className="cluster-page" aria-label="유사 박물관 그룹">
    <div className="cluster-method-note"><p>실제 입장객이 아닌 시설 주변 감지 인구 기준입니다.</p><details className="cluster-method-details"><summary>분석 방법</summary><p>시설마다 방문 패턴 군집 비중, 주말·저녁·새벽 비중, 계절 변동, 성별·연령 비중, 교차방문 지표로 특징 벡터를 만들고 표준화한 뒤 Ward 계층 군집으로 비슷한 시설끼리 묶었습니다. 학습 범위(기간·연령·성별)는 연결된 1단계 실행을 따르며, 값은 실제 입장객이 아닌 <b>감지 인구</b> 기준입니다.</p></details></div>

    <div className="chart-grid">
      <Card title={facility ? `${facility}의 유사 박물관 그룹` : '선택 시설의 유사 박물관 그룹'}>
        {!facility ? <p className="empty">상단 필터에서 시설을 선택하면 같은 그룹 시설과 두드러진 특징을 보여 줍니다.</p>
          : !myGroup ? <p className="empty">{view.reason}</p> : <>
            <div className="group-headline"><span className="dot" style={{ '--dot': clusterColor(myGroup.id) }}/>{myGroup.name}</div>
            <ul className="cluster-facts">
              <li>같은 그룹 {myGroup.size}곳: {myGroup.members.map(m => m.name).join(', ')}</li>
              <li>두드러진 특징: {myGroup.distinctive.slice(0, 3).map(d => `${d.label} ${d.direction}(표준화 ${d.z >= 0 ? '+' : ''}${d.z.toFixed(2)})`).join(' · ')}</li>
              {myGroup.dominant_pattern && <li>그룹 대표 방문 패턴: <b>{myGroup.dominant_pattern.name}</b> ({pct(myGroup.dominant_pattern.share)})</li>}
            </ul>
          </>}
      </Card>
      <Card title="유사 시설 순위"><p className="card-sub">표준화한 특징 공간에서 가까운 순 · 거리가 작을수록 비슷합니다.</p>
        {!facility ? <p className="empty">시설을 선택하면 가장 비슷한 시설 5곳을 보여 줍니다.</p>
          : !myGroup ? <p className="empty">{view.reason}</p>
            : <DataTable head={['순위', '시설', '거리', '같은 그룹']} rows={view.similar.map((s, i) => [i + 1, s.name, s.distance.toFixed(2), s.same_group ? <Badge key="g" tone="green">같은 그룹</Badge> : '—'])}/>}
      </Card>
    </div>

    <StatCards items={[
      ['그룹 수', k, '개', isSelectedK ? `${res.selection.mode === 'auto' ? '자동 선택' : '사용자 지정'} · 실루엣 최댓값 기준` : `보기만 변경 · 선택 결과는 ${res.selection.k}개`],
      ['실루엣 점수', ev.silhouette.toFixed(3), '', '-1~1, 클수록 그룹 간 분리가 뚜렷합니다.'],
      ['안정성 (시설 1곳 제외 ARI)', ev.stability_ari_mean == null ? '—' : ev.stability_ari_mean.toFixed(2), '', '시설을 하나씩 빼고 다시 묶어도 분할이 유지되는 정도(1 = 완전히 동일)'],
      ['분석 시설', res.facilities_used.length, '곳', res.facilities_excluded.length ? `제외 ${res.facilities_excluded.map(e => `${e.name}(${e.reason})`).join(', ')}` : '제외 시설 없음'],
    ]}/>
    <div className="warning"><strong>해석 주의</strong><p>{res.selection.reason}</p>{res.selection.warnings.map(w => <p key={w}>{w}</p>)}</div>

    <Card title="덴드로그램" action={<Segmented label="그룹 수" value={String(k)} onChange={v => setK(Number(v))}
      options={res.evaluation.map(e => [String(e.k), `${e.k}${e.k === res.selection.k ? ' ✓' : ''}`])}/>}>
      <p className="card-sub">그룹 수를 바꾸면 절단선과 색이 즉시 바뀝니다{facility ? ` · ▶ = ${facility}` : ''}. 세로 높이는 묶일 때 늘어나는 Ward 거리입니다.</p>
      <Dendrogram d={res.dendrogram} labels={labels} cut={res.dendrogram.cut_heights[String(k)]} highlight={facility}/>
      <div className="group-chips">{Object.entries(groupsAtK).map(([g, ids]) => <div key={g} className="group-chip">
        <b><span className="dot" style={{ '--dot': clusterColor(g) }}/>{groupName(g)} · {ids.length}곳{ids.length === 1 && <Badge tone="orange">단일 시설</Badge>}</b>
        <span>{ids.join(', ')}</span>
      </div>)}</div>
      <ChartTable head={['순서', '시설', `그룹 (그룹 수 ${k})`]} rows={res.dendrogram.leaves.map((id, i) => [i + 1, res.dendrogram.leaf_labels[i], groupName(labels[id])])}/>
    </Card>

    <div className="two-col">
      <Card title="그룹 수 후보 평가"><p className="card-sub">{res.selection.rule}</p>
        <div className="table-scroll"><DataTable head={['그룹 수', '실루엣', '그룹 크기', '단일 시설 그룹', '안정성(LOO ARI)']} rows={res.evaluation.map(e => [
          <b key="k">{e.k}{e.k === res.selection.k ? ' ✓' : ''}</b>, e.silhouette.toFixed(3), e.sizes.join(', '), e.singletons,
          e.stability_ari_mean == null ? '—' : e.stability_ari_mean.toFixed(2)])}/></div>
        <LineChart label="그룹 수별 실루엣과 안정성" categories={res.evaluation.map(e => `${e.k}개`)} format={v => v.toFixed(2)} min={0} max={1} height={210}
          series={[{ name: '실루엣', color: '#176B68', values: res.evaluation.map(e => e.silhouette) },
            { name: '안정성(LOO ARI)', color: '#BD8B47', values: res.evaluation.map(e => e.stability_ari_mean) }]}/>
      </Card>
      <Card title="민감도 분석"><p className="card-sub">조건을 바꿔 다시 묶었을 때 기준 분할과의 일치도(ARI, 1 = 동일)</p>
        <DataTable head={['변경 조건', 'ARI']} rows={res.sensitivity.map(s => [s.label, s.ari_vs_base.toFixed(2)])}/>
        {res.correlations.high_pairs.length > 0 && <p className="definition-note">강한 상관(|r| ≥ {res.correlations.threshold}): {res.correlations.high_pairs.map(p => `${used.find(u => u.key === p.a)?.label} ↔ ${used.find(u => u.key === p.b)?.label} r = ${p.r.toFixed(2)}`).join(' · ')} — 같은 정보가 중복 반영될 수 있습니다.</p>}
        <p className="definition-note">사용 특징 {used.length}개: {used.map(u => u.label).join(', ')}</p>
        {res.features.dropped.length > 0 && <p className="definition-note">제외 특징: {res.features.dropped.map(f => `${f.label}(${f.reason})`).join(', ')}</p>}
        <p className="definition-note">교차방문 지표는 완전 포함 월 {res.cross.months_used.length}개의 시설 쌍 집계만 사용하며 방문 순서·이동 방향을 뜻하지 않습니다.</p>
      </Card>
    </div>

    <Card title="그룹별 특징 비교"><p className="card-sub">{isSelectedK ? '그룹 평균(원값) · 파랑 = 전체보다 높음, 빨강 = 낮음(표준화 평균 ±0.5 이상)' : `그룹 요약은 선택 결과인 그룹 수 ${res.selection.k}에서만 계산됩니다.`}</p>
      {isSelectedK ? <div className="table-scroll"><DataTable head={['특징', ...res.groups.map(g => <span key={g.id}><span className="dot" style={{ '--dot': clusterColor(g.id) }}/> {g.name} ({g.size}곳)</span>)]}
        rows={used.map(u => [u.label, ...res.groups.map(g => {
          const z = g.mean_z[u.key]
          return <span key={g.id} className={z > 0.5 ? 'z-high' : z < -0.5 ? 'z-low' : ''}>{fmtFeature(u.key, g.mean_raw[u.key])}</span>
        })])}/></div> : <p className="empty">그룹 수를 {res.selection.k}로 되돌리면 표가 보입니다.</p>}
    </Card>

    {view?.diff_vs_group?.length > 0 && <Card title={`${facility} vs 같은 그룹의 다른 시설`}><p className="card-sub">차이가 큰 항목이 벤치마킹 후보입니다. 운영 방식의 효과를 뜻하지는 않습니다.</p>
      <div className="table-scroll"><DataTable head={['특징', '이 시설', '그룹 내 다른 시설 평균', '차이', '그룹 밖 시설 평균']} rows={view.diff_vs_group.map((d, i) => [
        d.label, fmtFeature(d.key, d.value), fmtFeature(d.key, d.reference), fmtDiff(d.key, d.diff), fmtFeature(d.key, view.diff_vs_others[i]?.reference ?? null)])}/></div>
    </Card>}

    <Card title="그룹 해석 안내"><ul className="cluster-notes">
      <li>분석 대상이 {res.facilities_used.length}개 시설뿐이므로 그룹은 <b>절대적인 시설 분류 기준이 아닙니다</b>. 그룹 이름은 표준화 평균이 큰 특징으로 자동 제안한 설명입니다.</li>
      <li>시설 2곳 이하로 이루어진 그룹은 우연에 따라 바뀌기 쉬우니 민감도 분석과 함께 보세요.</li>
      <li>교차방문 지표는 시설 쌍의 월별 집계이며 일별 방문 인구(FST)와 단위가 달라 서로 나누지 않았습니다.</li>
    </ul></Card>
  </section>
}
