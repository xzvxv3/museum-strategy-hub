import { useState } from 'react'
import Dendrogram from './Dendrogram'
import { Badge, Card } from './ui'
import { ChartTable, ClusterGate, DataTable, LineChart, Segmented, StatCards } from './ClusterCharts'
import { clusterColor, josa, num, pct, scopeLabel, useClusterResult } from './clusterUtils'

const SHARE_KEYS = new Set(['weekend_share', 'evening_share', 'dawn_share', 'female_share', 'age30_share'])
const isShare = key => SHARE_KEYS.has(key) || key.startsWith('pattern_c')
const fmtFeature = (key, v) => v == null ? '—' : isShare(key) ? pct(v) : key === 'n_partners' ? num(v) : v.toFixed(3)
const fmtDiff = (key, v) => v == null ? '—' : isShare(key) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%p` : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`

export default function SimilarMuseums({ filters, metadata }) {
  const resource = useClusterResult(2, filters)
  return <ClusterGate resource={resource} title="유사 박물관 분석" scope={scopeLabel(filters, metadata)}
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
    <div className="cluster-method-note"><details className="cluster-method-details"><summary>분석 방법</summary><p>시설마다 방문 패턴 비율, 주말·저녁·새벽 방문 비율, 계절에 따른 변화, 성별·연령 구성, 함께 방문하는 시설 정보를 모아 비교 기준을 맞춘(표준화) 뒤, Ward 계층 군집으로 비슷한 시설끼리 묶었습니다. 분석 범위(기간·연령·성별)는 방문 패턴 탭의 분석을 따르며, 값은 실제 입장객이 아닌 <b>감지 인구</b> 기준입니다.</p></details></div>

    <div className="chart-grid">
      <Card title={`${facility ? josa(facility, '과', '와') : '우리 시설과'} 닮은 박물관 그룹`} className="cluster-summary"
        help="방문 패턴, 주말·저녁 방문 비율, 계절 변화, 성별·연령 구성, 함께 방문하는 시설 정보를 종합해 방문 특성이 비슷한 박물관끼리 묶었습니다. 그룹 이름은 이 그룹에서 가장 두드러진 특징으로 자동으로 붙였습니다.">
        {!facility ? <p className="empty">상단 필터에서 시설을 선택하면 같은 그룹 박물관과 그룹의 특징을 보여 드립니다.</p>
          : !myGroup ? <p className="empty">{view.reason}</p> : <>
            <p className="summary-headline"><span className="dot" style={{ '--dot': clusterColor(myGroup.id) }}/>{myGroup.name}</p>
            <ul className="cluster-facts">
              <li>같은 그룹 {myGroup.size}곳: {myGroup.members.map(m => m.name).join(', ')}</li>
              <li>이 그룹의 특징: {myGroup.distinctive.slice(0, 3).map(d => `${d.label} ${d.direction === '높음' ? '평균보다 높음' : '평균보다 낮음'}`).join(' · ')}</li>
              {myGroup.dominant_pattern && <li>가장 흔한 방문 패턴: <b>{myGroup.dominant_pattern.name}</b> ({pct(myGroup.dominant_pattern.share)})</li>}
            </ul>
          </>}
      </Card>
      <Card title="가장 비슷한 박물관 순위" help="여러 특징을 함께 비교해 차이가 작은 순서대로 보여 줍니다. ‘차이’ 값이 작을수록 우리 시설과 비슷합니다. 그룹이 달라도 순위에 오를 수 있습니다.">
        <p className="card-sub">위에 있을수록 우리 시설과 방문 특성이 비슷한 박물관입니다.</p>
        {!facility ? <p className="empty">시설을 선택하면 가장 비슷한 박물관 5곳을 보여 드립니다.</p>
          : !myGroup ? <p className="empty">{view.reason}</p>
            : <DataTable head={['순위', '박물관', '차이 (작을수록 비슷)', '같은 그룹']} rows={view.similar.map((s, i) => [i + 1, s.name, s.distance.toFixed(2), s.same_group ? <Badge key="g" tone="green">같은 그룹</Badge> : '—'])}/>}
      </Card>
    </div>

    {view?.diff_vs_group?.length > 0 && <Card title={`${facility} vs 같은 그룹 박물관`} help="같은 그룹 박물관은 전반적으로 비슷하므로, 그 안에서 차이가 큰 항목이 우리 시설만의 특징입니다. 다른 박물관의 운영 방식을 참고할 때 출발점으로 쓰세요. 차이가 운영 성과의 좋고 나쁨을 뜻하지는 않습니다.">
      <p className="card-sub">‘차이’가 큰 항목을 보면 비슷한 박물관과 우리 시설이 다른 점을 찾을 수 있습니다.</p>
      <div className="table-scroll"><DataTable head={['항목', '우리 시설', '같은 그룹의 다른 박물관 평균', '차이', '다른 그룹 박물관 평균']} rows={view.diff_vs_group.map((d, i) => [
        d.label, fmtFeature(d.key, d.value), fmtFeature(d.key, d.reference), fmtDiff(d.key, d.diff), fmtFeature(d.key, view.diff_vs_others[i]?.reference ?? null)])}/></div>
    </Card>}

    <Card title="박물관 묶음 구조" help="나뭇가지 모양 그림(덴드로그램)입니다. 아래쪽에서 일찍 만나는 박물관일수록 서로 비슷합니다. 가로 절단선 아래에서 묶인 박물관들이 같은 그룹이 되며, 오른쪽 위 숫자로 그룹 수를 바꿔 볼 수 있습니다(✓ = 자동 선택된 그룹 수)."
      action={<Segmented label="그룹 수" value={String(k)} onChange={v => setK(Number(v))}
        options={res.evaluation.map(e => [String(e.k), `${e.k}개${e.k === res.selection.k ? ' ✓' : ''}`])}/>}>
      <p className="card-sub">같은 색은 같은 그룹이고, 가지가 낮은 곳에서 만날수록 서로 비슷한 박물관입니다{facility ? ` · ▶ = ${facility}` : ''}.</p>
      <Dendrogram d={res.dendrogram} labels={labels} cut={res.dendrogram.cut_heights[String(k)]} highlight={facility}/>
      <div className="group-chips">{Object.entries(groupsAtK).map(([g, ids]) => <div key={g} className="group-chip">
        <b><span className="dot" style={{ '--dot': clusterColor(g) }}/>{groupName(g)} · {ids.length}곳{ids.length === 1 && <Badge tone="orange">1곳뿐인 그룹</Badge>}</b>
        <span>{ids.join(', ')}</span>
      </div>)}</div>
      <ChartTable head={['순서', '박물관', `그룹 (그룹 수 ${k}개)`]} rows={res.dendrogram.leaves.map((id, i) => [i + 1, res.dendrogram.leaf_labels[i], groupName(labels[id])])}/>
    </Card>

    <Card title="그룹별 특징 비교" help="각 그룹에 속한 박물관들의 평균값입니다. 파란색은 전체 평균보다 뚜렷하게 높은 항목, 빨간색은 뚜렷하게 낮은 항목입니다(표준화 평균 ±0.5 이상).">
      <p className="card-sub">{isSelectedK ? '파란색 = 전체 평균보다 높음, 빨간색 = 전체 평균보다 낮음' : `그룹별 특징은 자동 선택된 그룹 수(${res.selection.k}개)에서만 계산됩니다.`}</p>
      {isSelectedK ? <div className="table-scroll"><DataTable head={['항목', ...res.groups.map(g => <span key={g.id}><span className="dot" style={{ '--dot': clusterColor(g.id) }}/> {g.name} ({g.size}곳)</span>)]}
        rows={used.map(u => [u.label, ...res.groups.map(g => {
          const z = g.mean_z[u.key]
          return <span key={g.id} className={z > 0.5 ? 'z-high' : z < -0.5 ? 'z-low' : ''}>{fmtFeature(u.key, g.mean_raw[u.key])}</span>
        })])}/></div> : <p className="empty">그룹 수를 {res.selection.k}개로 되돌리면 표가 보입니다.</p>}
    </Card>

    <div className="cluster-caution"><strong>읽을 때 참고하세요</strong><ul>
      <li>분석한 박물관이 {res.facilities_used.length}곳뿐이므로 그룹은 <b>절대적인 분류가 아니라 참고용</b>입니다.</li>
      <li>1~2곳으로 이루어진 그룹은 조건에 따라 쉽게 바뀔 수 있습니다.</li>
    </ul></div>

    <details className="cluster-advanced"><summary>분석 상세 보기 <span>분석 품질 지표 · 민감도 분석 · 해석 안내</span></summary><div className="cluster-advanced-body">
      <StatCards items={[
        ['그룹 수', k, '개', isSelectedK ? `${res.selection.mode === 'auto' ? '자동 선택' : '사용자 지정'} · 실루엣 최댓값 기준` : `보기만 변경 · 선택 결과는 ${res.selection.k}개`, '비슷한 박물관끼리 몇 개 그룹으로 나눌지입니다. 자동 선택은 그룹끼리 가장 뚜렷하게 구분되는(실루엣 점수가 가장 높은) 개수입니다.'],
        ['실루엣 점수', ev.silhouette.toFixed(3), '', '-1~1, 클수록 그룹 간 구분이 뚜렷합니다.', '그룹끼리 얼마나 뚜렷하게 구분되는지 나타냅니다. 낮을수록 그룹 경계가 겹칩니다.'],
        ['안정성 (시설 1곳 제외 ARI)', ev.stability_ari_mean == null ? '—' : ev.stability_ari_mean.toFixed(2), '', '1에 가까울수록 결과가 안정적입니다.', '박물관을 한 곳씩 빼고 다시 묶어도 같은 그룹이 유지되는 정도입니다. 1이면 완전히 같습니다.'],
        ['분석 시설', res.facilities_used.length, '곳', res.facilities_excluded.length ? `제외 ${res.facilities_excluded.map(e => `${e.name}(${e.reason})`).join(', ')}` : '제외 시설 없음', '데이터가 부족한 시설은 분석에서 제외했습니다.'],
      ]}/>
      <div className="warning"><strong>그룹 수 선택 근거</strong><p>{res.selection.reason}</p>{res.selection.warnings.map(w => <p key={w}>{w}</p>)}</div>
      {myGroup && <p className="definition-note">{myGroup.name}의 두드러진 특징(표준화 점수, 0 = 전체 평균): {myGroup.distinctive.slice(0, 3).map(d => `${d.label} ${d.direction} ${d.z >= 0 ? '+' : ''}${d.z.toFixed(2)}`).join(' · ')}</p>}
      <div className="two-col">
        <Card title="그룹 수 후보 평가" help="후보 그룹 수마다 실루엣 점수(구분 정도)와 안정성을 비교했습니다. ✓ 표시가 실제로 쓰인 그룹 수입니다.">
          <p className="card-sub">{res.selection.rule}</p>
          <div className="table-scroll"><DataTable head={['그룹 수', '실루엣', '그룹 크기', '1곳뿐인 그룹', '안정성(LOO ARI)']} rows={res.evaluation.map(e => [
            <b key="k">{e.k}{e.k === res.selection.k ? ' ✓' : ''}</b>, e.silhouette.toFixed(3), e.sizes.join(', '), e.singletons,
            e.stability_ari_mean == null ? '—' : e.stability_ari_mean.toFixed(2)])}/></div>
          <LineChart label="그룹 수별 실루엣과 안정성" categories={res.evaluation.map(e => `${e.k}개`)} format={v => v.toFixed(2)} min={0} max={1} height={210}
            series={[{ name: '실루엣', color: '#176B68', values: res.evaluation.map(e => e.silhouette) },
              { name: '안정성(LOO ARI)', color: '#BD8B47', values: res.evaluation.map(e => e.stability_ari_mean) }]}/>
        </Card>
        <Card title="민감도 분석" help="분석에 쓰는 항목이나 조건을 바꿔 다시 묶었을 때 원래 결과와 얼마나 같은지 보여 줍니다(ARI). 1에 가까울수록 조건이 바뀌어도 결과가 흔들리지 않습니다.">
          <p className="card-sub">조건을 바꿔 다시 묶었을 때 원래 그룹과의 일치도(1 = 동일)</p>
          <DataTable head={['변경 조건', '일치도(ARI)']} rows={res.sensitivity.map(s => [s.label, s.ari_vs_base.toFixed(2)])}/>
          {res.correlations.high_pairs.length > 0 && <p className="definition-note">서로 비슷하게 움직이는 항목(|r| ≥ {res.correlations.threshold}): {res.correlations.high_pairs.map(p => `${used.find(u => u.key === p.a)?.label} ↔ ${used.find(u => u.key === p.b)?.label} r = ${p.r.toFixed(2)}`).join(' · ')} — 같은 정보가 중복 반영될 수 있습니다.</p>}
          <p className="definition-note">분석에 쓴 항목 {used.length}개: {used.map(u => u.label).join(', ')}</p>
          {res.features.dropped.length > 0 && <p className="definition-note">제외 항목: {res.features.dropped.map(f => `${f.label}(${f.reason})`).join(', ')}</p>}
          <p className="definition-note">함께 방문 지표는 전체가 포함된 {res.cross.months_used.length}개월의 시설 쌍 집계만 사용하며, 방문 순서나 이동 방향을 뜻하지 않습니다.</p>
        </Card>
      </div>
      <Card title="해석 안내" help="그룹 결과를 운영 판단에 쓸 때 오해하기 쉬운 점을 정리했습니다."><ul className="cluster-notes">
        <li>그룹 이름은 표준화 평균이 큰 특징으로 자동 제안한 설명입니다.</li>
        <li>1~2곳으로 이루어진 그룹은 우연에 따라 바뀌기 쉬우니 민감도 분석과 함께 보세요.</li>
        <li>함께 방문 지표는 시설 쌍의 월별 집계이며, 일별 방문 인구(FST)와 단위가 달라 서로 나누지 않았습니다.</li>
      </ul></Card>
    </div></details>
  </section>
}
