import { useState } from 'react'
import { Badge, Card } from './ui'
import { ChartTable, ClusterGate, DataTable, Donut, GroupedBars, LineChart, Segmented, StackedColumns, StackedRows, StatCards } from './ClusterCharts'
import { clusterColor, num, pct, pp, scopeLabel, useClusterResult, ymLabel } from './clusterUtils'

const REASON = { zero_pop: '감지 0', min_pop: '최소 감지량 미달', low_observed: '원본 관측 비율 미달' }

export default function ClusterPattern({ filters, metadata }) {
  const resource = useClusterResult(1, filters)
  return <ClusterGate resource={resource} title="방문 패턴 군집 (1단계 K-means)" scope={scopeLabel(filters, metadata)} runNote="약 15초 걸릴 수 있습니다.">
    {data => <PatternResult data={data} facility={filters.facility}/>}
  </ClusterGate>
}

function PatternResult({ data: res, facility }) {
  const [weighting, setWeighting] = useState('count')
  const [grain, setGrain] = useState('monthly')
  const bins = res.time_bins.filter(b => !b.excluded)
  const clusters = res.clusters
  const sel = res.selection
  const ev = res.evaluation.find(e => e.k === sel.k)
  const fv = res.facility_view
  const shareKey = weighting === 'count' ? 'shares' : 'pop_weighted_shares'
  const named = clusters.map(c => ({ name: `${c.id}. ${c.name}`, color: clusterColor(c.id) }))
  const binLabels = bins.map(b => b.label)
  const timeline = res.timeline[grain]
  const timeLabels = timeline.map(t => grain === 'monthly' ? ymLabel(t.ym) : t.week_start.slice(5))
  const overlay = fv && grain === 'monthly' ? clusters.map(c => ({ name: `${c.name} (선택 시설)`, color: clusterColor(c.id),
    values: timeline.map(t => fv.monthly.find(m => m.ym === t.ym)?.shares[c.id] ?? null) })) : []
  const excludedText = Object.entries(res.units.excluded_by_reason).filter(([, v]) => v).map(([k, v]) => `${REASON[k]} ${num(v)}`).join(' · ')

  return <section className="cluster-page" aria-label="방문 패턴 군집">
    <div className="cluster-method-note"><details className="cluster-method-details"><summary>분석 방법</summary><p>방문 패턴은 <b>{res.unit_label}</b> 단위로 시간대별 감지 비중(합 = 1)을 K-means로 묶은 결과입니다. 개인이나 고객 유형을 분류한 것이 아니며, 값은 실제 입장객이 아닌 시설 주변 <b>감지 인구</b>입니다. 기간·연령·성별 필터가 학습 범위이고, 시설 필터는 선택 시설 강조에만 쓰입니다.</p></details></div>

    <StatCards items={[
      ['선택 군집 수 (k)', sel.k, '개', `${sel.mode === 'auto' ? '자동 선택' : '사용자 지정'} · 후보 k=${res.config.k_min}~${res.config.k_max}`],
      ['분석 단위', num(res.units.kept), `/ ${num(res.units.total)}개`, `제외 ${num(res.units.excluded)}개${excludedText ? ` (${excludedText})` : ''}`],
      ['실루엣 점수', ev.silhouette.toFixed(3), '', '-1~1, 클수록 군집 간 분리가 뚜렷합니다. 0.2 안팎이면 경계가 겹치는 편입니다.'],
      ['안정성 (ARI)', ev.stability_ari_mean.toFixed(2), `±${ev.stability_ari_std.toFixed(2)}`, `80% 재표본 ${res.config.stability_runs}회 재학습 · 1이면 매번 같은 분할`],
    ]}/>
    <p className="definition-note">선택 근거: {sel.reason}{sel.warnings.length ? ` 주의: ${sel.warnings.join(', ')}` : ''}</p>

    <div className="cluster-cards">{clusters.map(c => <div key={c.id} className="card cluster-card" style={{ '--cluster-color': clusterColor(c.id) }}>
      <div className="cluster-card-top"><span>군집 {c.id}</span><b>{pct(c.share)}</b></div>
      <h3>{c.name}</h3>
      <p>소속 단위 <b>{num(c.size)}</b>개 · 평일 {num(c.day_type.weekday)} / 주말형 {num(c.day_type.weekend)}</p>
      <p>대표 시간대: {c.top_bins.map(k => `${bins.find(b => b.key === k)?.label}(${pct(c.mean_shares[k], 0)})`).join(', ') || '고른 분포'}</p>
      <p>주요 시설: {c.top_facilities.slice(0, 3).map(f => f.name).join(', ')}</p>
    </div>)}</div>

    <div className="two-col">
      <Card title="군집별 시간대 패턴"><p className="card-sub">군집 평균 시간대 비중 · 점선 = 전체 평균 · {bins.map(b => `${b.label} ${b.range}`).join(', ')}</p>
        <LineChart label="군집별 평균 시간대 비중" categories={binLabels} format={v => pct(v, 0)} min={0}
          series={[...clusters.map((c, i) => ({ ...named[i], values: bins.map(b => c.mean_shares[b.key]) })),
            { name: '전체 평균', color: '#64748B', dashed: true, values: bins.map(b => res.overall_mean_shares[b.key]) }]}/>
        <ChartTable head={['시간대', '구간', ...named.map(s => s.name), '전체 평균']}
          rows={bins.map(b => [b.label, b.range, ...clusters.map(c => pct(c.mean_shares[b.key])), pct(res.overall_mean_shares[b.key])])}/>
      </Card>
      <Card title="전체 평균 대비 차이"><p className="card-sub">군집 평균 비중 − 전체 평균 비중 (%p) · 막대가 클수록 군집을 가르는 시간대입니다.</p>
        <GroupedBars label="전체 평균 대비 군집별 시간대 비중 차이" categories={binLabels} format={v => `${(v * 100).toFixed(0)}%p`}
          series={clusters.map((c, i) => ({ ...named[i], values: bins.map(b => c.diff_vs_overall[b.key]) }))}/>
        <ChartTable head={['시간대', ...named.map(s => s.name)]} rows={bins.map(b => [b.label, ...clusters.map(c => pp(c.diff_vs_overall[b.key]))])}/>
      </Card>
    </div>

    <div className="chart-grid">
      <Card title="시설별 군집 구성" action={<Segmented label="비중 기준" value={weighting} onChange={setWeighting} options={[['count', '단위 수'], ['pop', '감지량 가중']]}/>}>
        <p className="card-sub">{weighting === 'count' ? '시설의 분석 단위 중 각 군집 비율' : '감지량으로 가중한 군집 비율'}{facility ? ` · ▶ = ${facility}` : ''}</p>
        <StackedRows series={named} rows={res.facility_composition.map(c => ({ key: c.id, label: c.name, highlight: c.id === facility, empty: !c.units,
          values: clusters.map(cl => c[shareKey][cl.id] ?? 0) }))}/>
        <ChartTable head={['시설', '분석 단위', ...named.map(s => s.name)]}
          rows={res.facility_composition.map(c => [c.name, num(c.units), ...clusters.map(cl => pct(c[shareKey][cl.id]))])}/>
      </Card>
      <Card title={facility ? `${facility}의 패턴 구성` : '선택 시설의 패턴 구성'}>
        <p className="card-sub">{fv ? `분석 단위 ${num(fv.composition.units)}개 · 제외 ${num(fv.excluded.length)}개 · ${weighting === 'count' ? '단위 수' : '감지량 가중'} 기준` : '상단 필터에서 시설을 선택하세요.'}</p>
        {!facility ? <p className="empty">시설을 선택하면 해당 시설의 분석 단위가 어떤 패턴에 속하는지 보여 줍니다.</p>
          : fv && fv.composition.units ? <>
            <Donut center={num(fv.composition.units)} caption="분석 단위" items={clusters.map((c, i) => ({ name: named[i].name, color: named[i].color, value: fv.composition[shareKey][c.id] ?? 0 }))}/>
            <ChartTable head={['군집', '단위 수', '비중']} rows={clusters.map((c, i) => [named[i].name, num(fv.composition.counts[c.id]), pct(fv.composition[shareKey][c.id])])}/>
          </> : <p className="empty">이 시설은 학습 범위에 없거나 모든 분석 단위가 제외되었습니다.</p>}
      </Card>
    </div>

    <Card title="기간별 패턴 변화" action={<Segmented label="기간 단위" value={grain} onChange={setGrain} options={[['monthly', '월별'], ['weekly', '주별']]}/>}>
      <p className="card-sub">기간마다 각 군집에 속한 분석 단위 비율{grain === 'weekly' && facility ? ' · 선택 시설 선은 월별에서만 표시' : ''}</p>
      {timeline.length ? <>
        <StackedColumns label="기간별 군집 구성 변화" categories={timeLabels} overlay={overlay}
          series={clusters.map((c, i) => ({ ...named[i], values: timeline.map(t => t.shares[c.id]) }))}/>
        <ChartTable head={[grain === 'monthly' ? '월' : '주 시작일', ...named.map(s => s.name), ...overlay.map(s => s.name)]}
          rows={timeline.map((t, i) => [grain === 'monthly' ? ymLabel(t.ym) : t.week_start, ...clusters.map(c => pct(t.shares[c.id])), ...overlay.map(s => pct(s.values[i]))])}/>
      </> : <p className="empty">이 분석 단위에는 기간별 변화가 없습니다.</p>}
    </Card>

    <div className="two-col">
      <Card title="군집 품질 · k 후보 평가"><p className="card-sub">{sel.rule}</p>
        <div className="table-scroll"><DataTable head={['k', '실루엣', '안정성(ARI)', '최소/최대 비중', '군집 크기', '판정']} rows={res.evaluation.map(e => [
          <b key="k">{e.k}{e.k === sel.k ? ' ✓' : ''}</b>, e.silhouette.toFixed(3), `${e.stability_ari_mean.toFixed(2)} ±${e.stability_ari_std.toFixed(2)}`,
          `${pct(e.min_share)} / ${pct(e.max_share)}`, e.sizes.map(s => num(s)).join(', '),
          e.eligible ? <Badge key="b" tone="green">자격</Badge> : e.notes.join(', ')])}/></div>
        <LineChart label="k별 실루엣과 안정성" categories={res.evaluation.map(e => `k=${e.k}`)} format={v => v.toFixed(2)} min={0} max={1} height={210}
          series={[{ name: '실루엣', color: '#176B68', values: res.evaluation.map(e => e.silhouette) },
            { name: '안정성(ARI)', color: '#BD8B47', values: res.evaluation.map(e => e.stability_ari_mean) }]}/>
      </Card>
      <Card title="제외 현황 · 사용 특징"><p className="card-sub">최소 감지량 {num(res.config.min_pop)} · 원본 관측 비율 ≥ {res.config.min_observed_ratio}</p>
        <div className="table-scroll"><DataTable head={['시설', '전체 단위', '포함', '제외 비율']}
          rows={res.units.by_facility.filter(b => b.excluded).map(b => [b.name, num(b.total), num(b.kept), pct(b.excluded_ratio)])}/></div>
        <p className="definition-note">사용 특징: {res.features.used.map(f => f.label).join(', ')}</p>
        {res.features.dropped.length > 0 && <p className="definition-note">자동 제외 특징: {res.features.dropped.map(f => `${f.label}(${f.reason})`).join(', ')}</p>}
        <p className="definition-note">원본 행이 하나도 없는 날(누락 의심)을 포함한 채 유지된 단위 {num(res.units.low_completeness_kept)}개 · 공휴일 기준 {res.holiday_source}</p>
      </Card>
    </div>

    <Card title="군집 해석 안내"><ul className="cluster-notes">
      <li>군집은 분석 단위의 <b>시간대 감지 비중 형태</b>가 비슷한 것끼리 묶은 결과입니다. 감지 규모(절대량)는 특징에서 제외했습니다.</li>
      <li>군집 이름은 전체 평균보다 비중이 큰 시간대로 자동 제안한 설명이며, <b>통계적으로 확정된 고객 유형이 아닙니다</b>.</li>
      <li>출근·오전 시간대 비중이 높은 패턴은 시설 주변 직장인 등 주변 인구 혼입 가능성을 시사할 수 있지만 확정할 수 없습니다. 새벽·밤 비중이 높은 패턴도 마찬가지입니다.</li>
      <li>실루엣 점수가 낮으면 군집 경계가 겹치므로 이름은 경향을 설명하는 용도로만 사용하세요.</li>
      <li>체류시간 데이터가 없어 단시간·장시간 체류 같은 고객 유형은 분류하지 않습니다.</li>
    </ul></Card>
  </section>
}
