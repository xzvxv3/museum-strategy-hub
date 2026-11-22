import { useState } from 'react'
import { Badge, Card, InfoTip } from './ui'
import { ChartTable, ClusterGate, DataTable, Donut, GroupedBars, LineChart, Segmented, StackedColumns, StackedRows, StatCards } from './ClusterCharts'
import { clusterColor, josa, num, pct, pp, scopeLabel, useClusterResult, ymLabel } from './clusterUtils'

const REASON = { zero_pop: '감지 0', min_pop: '최소 감지량 미달', low_observed: '원본 관측 비율 미달' }

export default function ClusterPattern({ filters, metadata }) {
  const resource = useClusterResult(1, filters)
  return <ClusterGate resource={resource} title="방문 패턴 분석" scope={scopeLabel(filters, metadata)} runNote="약 15초 걸릴 수 있습니다.">
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
  // top_bins = bins with the largest positive gap vs. the overall mean, not necessarily the busiest hours.
  const aboveAvg = c => c.top_bins.map(k => bins.find(b => b.key === k)?.label).filter(Boolean).join('·')
  const commonest = clusters.reduce((best, c) => c.share > best.share ? c : best, clusters[0])
  const myUnits = fv?.composition?.units || 0
  const myTop = myUnits ? clusters.reduce((best, c) => (fv.composition.shares[c.id] ?? 0) > (fv.composition.shares[best.id] ?? 0) ? c : best, clusters[0]) : null
  const weightLabel = weighting === 'count' ? '구간 수 기준' : '방문 인구 기준'
  const unitHelp = `분석 구간은 ‘${res.unit_label}’ 단위입니다. 예를 들어 한 시설의 한 주 평일이 하나의 구간입니다.`

  return <section className="cluster-page" aria-label="방문 패턴 군집">

    <Card title="한눈에 보기" className="cluster-summary" help={`${unitHelp} 구간마다 시간대별 방문 비율을 비교해 비슷한 것끼리 ‘방문 패턴’으로 묶었습니다.`}>
      {facility && myTop ? <>
        <p className="summary-headline"><span className="dot" style={{ '--dot': clusterColor(myTop.id) }}/>{facility}에서 가장 많이 나타나는 방문 패턴은 ‘{myTop.name}’입니다.</p>
        <p>분석한 {num(myUnits)}개 구간 중 {pct(fv.composition.shares[myTop.id])}가 이 패턴입니다. {aboveAvg(myTop) ? <>이 패턴은 전체 평균보다 <b>{aboveAvg(myTop)}</b> 시간대의 방문 비중이 높습니다.</> : '이 패턴은 특정 시간대에 치우치지 않고 고르게 분포합니다.'}</p>
      </> : <>
        <p className="summary-headline">전체 시설의 방문 흐름은 {clusters.length}가지 패턴으로 나뉩니다.</p>
        <p>가장 흔한 패턴은 ‘{commonest.name}’(전체의 {pct(commonest.share)})입니다. {facility ? `${josa(facility, '은', '는')} 분석 기간에 데이터가 부족해 패턴을 계산하지 못했습니다.` : '상단 필터에서 시설을 고르면 우리 시설의 패턴을 보여 드립니다.'}</p>
      </>}
    </Card>

    <div className="cluster-section-head"><h2>방문 패턴 종류</h2><InfoTip label="방문 패턴 종류 설명 보기" text="방문 시간대 분포가 비슷한 분석 구간끼리 묶은 결과입니다. 패턴 이름은 전체 평균보다 방문 비중이 높은 시간대를 보고 자동으로 붙인 이름이며, 실제 고객 유형을 뜻하지는 않습니다."/></div>
    <div className="cluster-cards">{clusters.map(c => <div key={c.id} className="card cluster-card" style={{ '--cluster-color': clusterColor(c.id) }}>
      <div className="cluster-card-top"><span>패턴 {c.id}</span><span className="cluster-card-tools"><b>전체의 {pct(c.share)}</b><InfoTip label={`${c.name} 설명 보기`}
        text={`전체 분석 구간 중 ${pct(c.share)}(${num(c.size)}개 구간)가 이 패턴에 속합니다. ${aboveAvg(c) ? `이 패턴은 전체 평균보다 ${aboveAvg(c)} 시간대의 방문 비중이 높아 이런 이름이 붙었습니다. 괄호 안 숫자는 하루 방문 중 그 시간대가 차지하는 비율입니다.` : '특정 시간대에 치우치지 않고 고르게 분포하는 패턴입니다.'}`}/></span></div>
      <h3>{c.name}</h3>
      <p>평균보다 비중이 높은 시간대: {c.top_bins.map(k => `${bins.find(b => b.key === k)?.label}(${pct(c.mean_shares[k], 0)})`).join(', ') || '없음(고르게 분포)'}</p>
      <p>자주 나타나는 시설: {c.top_facilities.slice(0, 3).map(f => f.name).join(', ')}</p>
      <p>평일 구간 {num(c.day_type.weekday)}개 · 주말 구간 {num(c.day_type.weekend)}개</p>
    </div>)}</div>

    <div className="two-col pattern-time-comparison">
      <Card title="패턴별 시간대 방문 비율" help={`각 패턴에서 하루 방문 인구가 시간대별로 어떻게 나뉘는지 보여 줍니다. 시간대 구분: ${bins.map(b => `${b.label} ${b.range}`).join(', ')}. 점선은 모든 구간의 평균입니다.`}>
        <LineChart label="패턴별 시간대 방문 비율" categories={binLabels} format={v => pct(v, 0)} min={0}
          series={[...clusters.map((c, i) => ({ ...named[i], values: bins.map(b => c.mean_shares[b.key]) })),
            { name: '전체 평균', color: '#64748B', dashed: true, values: bins.map(b => res.overall_mean_shares[b.key]) }]}/>
        <ChartTable title="패턴별 시간대 방문 비율" head={['시간대', '구간', ...named.map(s => s.name), '전체 평균']}
          rows={bins.map(b => [b.label, b.range, ...clusters.map(c => pct(c.mean_shares[b.key])), pct(res.overall_mean_shares[b.key])])}/>
      </Card>
      <Card title="평균과 비교한 시간대 특징" help="각 패턴의 시간대별 방문 비율에서 전체 평균을 뺀 값입니다(%p, 퍼센트포인트). 0보다 위면 평균보다 그 시간대에 사람이 더 몰리고, 아래면 덜 몰린다는 뜻입니다.">
        <GroupedBars label="전체 평균 대비 패턴별 시간대 비율 차이" categories={binLabels} format={v => `${(v * 100).toFixed(0)}%p`}
          series={clusters.map((c, i) => ({ ...named[i], values: bins.map(b => c.diff_vs_overall[b.key]) }))}/>
        <ChartTable title="평균과 비교한 시간대 특징" head={['시간대', ...named.map(s => s.name)]} rows={bins.map(b => [b.label, ...clusters.map(c => pp(c.diff_vs_overall[b.key]))])}/>
      </Card>
    </div>

    <div className="chart-grid facility-pattern-sections">
      <Card className="facility-pattern-composition" title={facility ? `${facility}의 방문 패턴 구성` : '우리 시설의 방문 패턴 구성'} help={`선택한 시설의 분석 구간이 각 패턴에 얼마나 속하는지 나타냅니다. ${unitHelp} 옆 비교 카드에서 ‘방문 인구 기준’을 고르면 사람이 많았던 구간에 더 큰 비중을 줍니다.`}>
        <p className="card-sub">{fv ? `분석 구간 ${num(myUnits)}개 · 데이터 부족으로 제외 ${num(fv.excluded.length)}개 · ${weightLabel}` : '상단 필터에서 시설을 선택하세요.'}</p>
        {!facility ? <p className="empty">시설을 선택하면 우리 시설이 어떤 방문 패턴에 속하는지 보여 드립니다.</p>
          : fv && myUnits ? <>
            <Donut center={num(myUnits)} caption="분석 구간" items={clusters.map((c, i) => ({ name: named[i].name, color: named[i].color, value: fv.composition[shareKey][c.id] ?? 0 }))}/>
            <ChartTable title={facility ? `${facility}의 방문 패턴 구성` : '우리 시설의 방문 패턴 구성'} head={['패턴', '구간 수', '비율']} rows={clusters.map((c, i) => [named[i].name, num(fv.composition.counts[c.id]), pct(fv.composition[shareKey][c.id])])}/>
          </> : <p className="empty">이 시설은 분석 범위에 없거나 데이터가 부족해 모든 구간이 제외되었습니다.</p>}
      </Card>
      <Card title="시설별 방문 패턴 비교" help="막대 하나가 한 시설입니다. 색깔별 길이는 그 시설의 분석 구간 중 각 패턴이 차지하는 비율입니다. ‘방문 인구 기준’은 사람이 많았던 구간에 더 큰 비중을 둡니다."
        action={<Segmented label="비율 기준" value={weighting} onChange={setWeighting} options={[['count', '구간 수 기준'], ['pop', '방문 인구 기준']]}/>}>
        <p className="card-sub">같은 색 막대가 길수록 그 패턴이 자주 나타나는 시설입니다{facility ? ` · ▶ = ${facility}` : ''}.</p>
        <StackedRows series={named} rows={res.facility_composition.map(c => ({ key: c.id, label: c.name, highlight: c.id === facility, empty: !c.units,
          values: clusters.map(cl => c[shareKey][cl.id] ?? 0) }))}/>
        <ChartTable title="시설별 방문 패턴 비교" head={['시설', '분석 구간', ...named.map(s => s.name)]}
          rows={res.facility_composition.map(c => [c.name, num(c.units), ...clusters.map(cl => pct(c[shareKey][cl.id]))])}/>
      </Card>
    </div>

    <Card title="기간별 방문 패턴 변화" help="기간마다 전체 시설의 분석 구간이 각 패턴에 얼마나 속했는지 보여 줍니다. 시설을 선택하면 월별 보기에서 그 시설의 비율이 선으로 함께 표시됩니다."
      action={<Segmented label="기간 단위" value={grain} onChange={setGrain} options={[['monthly', '월별'], ['weekly', '주별']]}/>}>
      <p className="card-sub">색깔 비율이 크게 달라지는 시기에 방문 흐름이 바뀌었다는 뜻입니다{grain === 'weekly' && facility ? ' · 선택 시설 선은 월별에서만 표시됩니다' : ''}.</p>
      {timeline.length ? <>
        <StackedColumns label="기간별 방문 패턴 구성 변화" categories={timeLabels} overlay={overlay}
          series={clusters.map((c, i) => ({ ...named[i], values: timeline.map(t => t.shares[c.id]) }))}/>
        <ChartTable title="기간별 방문 패턴 변화" head={[grain === 'monthly' ? '월' : '주 시작일', ...named.map(s => s.name), ...overlay.map(s => s.name)]}
          rows={timeline.map((t, i) => [grain === 'monthly' ? ymLabel(t.ym) : t.week_start, ...clusters.map(c => pct(t.shares[c.id])), ...overlay.map(s => pct(s.values[i]))])}/>
      </> : <p className="empty">이 분석 단위에는 기간별 변화가 없습니다.</p>}
    </Card>

    <details className="cluster-advanced"><summary>분석 상세 보기 <span>분석 품질 지표 · 제외 기준 · 해석 안내</span></summary><div className="cluster-advanced-body">
      <StatCards items={[
        ['패턴 수', sel.k, '개', `${sel.mode === 'auto' ? '자동 선택' : '사용자 지정'} · 후보 ${res.config.k_min}~${res.config.k_max}개`, '여러 후보 개수로 나눠 본 뒤, 패턴끼리 가장 잘 구분되고 결과가 안정적인 개수를 골랐습니다.'],
        ['분석 구간', num(res.units.kept), `/ ${num(res.units.total)}개`, `제외 ${num(res.units.excluded)}개${excludedText ? ` (${excludedText})` : ''}`, `${unitHelp} 방문 인구가 너무 적거나 원본 데이터가 부족한 구간은 제외했습니다.`],
        ['실루엣 점수', ev.silhouette.toFixed(3), '', '-1~1, 클수록 패턴 간 구분이 뚜렷합니다.', '패턴끼리 얼마나 뚜렷하게 구분되는지 나타냅니다. 0.2 안팎이면 경계가 일부 겹치는 편이므로 패턴 이름은 경향으로만 보세요.'],
        ['안정성 (ARI)', ev.stability_ari_mean.toFixed(2), `±${ev.stability_ari_std.toFixed(2)}`, '1에 가까울수록 결과가 안정적입니다.', `데이터의 80%만 뽑아 ${res.config.stability_runs}회 다시 분석했을 때 같은 결과가 나오는 정도입니다. 1이면 매번 같은 결과입니다.`],
      ]}/>
      <p className="definition-note">패턴 수 선택 근거: {sel.reason}{sel.warnings.length ? ` 주의: ${sel.warnings.join(', ')}` : ''}</p>
      <div className="two-col">
        <Card title="패턴 수 후보 평가" help="후보 개수마다 실루엣 점수(구분 정도)와 안정성을 비교했습니다. ✓ 표시가 실제로 쓰인 개수입니다.">
          <p className="card-sub">{sel.rule}</p>
          <div className="table-scroll"><DataTable head={['패턴 수', '실루엣', '안정성(ARI)', '최소/최대 비중', '패턴별 구간 수', '판정']} rows={res.evaluation.map(e => [
            <b key="k">{e.k}{e.k === sel.k ? ' ✓' : ''}</b>, e.silhouette.toFixed(3), `${e.stability_ari_mean.toFixed(2)} ±${e.stability_ari_std.toFixed(2)}`,
            `${pct(e.min_share)} / ${pct(e.max_share)}`, e.sizes.map(s => num(s)).join(', '),
            e.eligible ? <Badge key="b" tone="green">사용 가능</Badge> : e.notes.join(', ')])}/></div>
          <LineChart label="패턴 수별 실루엣과 안정성" categories={res.evaluation.map(e => `${e.k}개`)} format={v => v.toFixed(2)} min={0} max={1} height={210}
            series={[{ name: '실루엣', color: '#176B68', values: res.evaluation.map(e => e.silhouette) },
              { name: '안정성(ARI)', color: '#BD8B47', values: res.evaluation.map(e => e.stability_ari_mean) }]}/>
        </Card>
        <Card title="제외된 구간 · 분석에 쓴 항목" help={`방문 인구가 ${num(res.config.min_pop)} 미만이거나 원본 데이터 관측 비율이 ${res.config.min_observed_ratio} 미만인 구간은 결과를 흔들 수 있어 제외했습니다.`}>
          <p className="card-sub">최소 방문 인구 {num(res.config.min_pop)} · 원본 관측 비율 ≥ {res.config.min_observed_ratio}</p>
          <div className="table-scroll"><DataTable head={['시설', '전체 구간', '포함', '제외 비율']}
            rows={res.units.by_facility.filter(b => b.excluded).map(b => [b.name, num(b.total), num(b.kept), pct(b.excluded_ratio)])}/></div>
          <p className="definition-note">분석에 쓴 항목: {res.features.used.map(f => f.label).join(', ')}</p>
          {res.features.dropped.length > 0 && <p className="definition-note">자동 제외 항목: {res.features.dropped.map(f => `${f.label}(${f.reason})`).join(', ')}</p>}
          <p className="definition-note">원본 데이터가 하나도 없는 날(누락 의심)을 포함한 채 유지된 구간 {num(res.units.low_completeness_kept)}개 · 공휴일 기준 {res.holiday_source}</p>
        </Card>
      </div>
      <Card title="해석 안내" help="패턴 결과를 운영 판단에 쓸 때 오해하기 쉬운 점을 정리했습니다."><ul className="cluster-notes">
        <li>패턴은 분석 구간의 <b>시간대별 방문 비율 모양</b>이 비슷한 것끼리 묶은 결과입니다. 방문 인구 규모(많고 적음)는 반영하지 않았습니다.</li>
        <li>출근·오전 시간대 비중이 높은 패턴은 시설 주변 직장인 등 주변 인구가 섞였을 가능성이 있지만 확정할 수 없습니다. 새벽·밤 비중이 높은 패턴도 마찬가지입니다.</li>
        <li>실루엣 점수가 낮으면 패턴 경계가 겹치므로 이름은 경향을 설명하는 용도로만 사용하세요.</li>
        <li>체류시간 데이터가 없어 단시간·장시간 체류 같은 고객 유형은 분류하지 않습니다.</li>
      </ul></Card>
    </div></details>
  </section>
}
