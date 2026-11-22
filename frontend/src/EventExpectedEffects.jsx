import { Card, Icon } from './ui'
import { buildExpectedEffects } from './eventEffectInsights.js'

export default function EventExpectedEffects({ data }) {
  const effects = buildExpectedEffects(data)
  return <Card title="기대효과" className="event-expected-effects" action={<span className="expected-effects-tag">운영 검토</span>}>
    {effects.length ? <div className="expected-effects-grid">{effects.map(effect => <section key={effect.category} className="expected-effect">
      <div className="expected-effect-heading"><span className="expected-effect-icon"><Icon name={effect.icon} size={19}/></span><span>{effect.category}</span></div>
      <h4>{effect.title}</h4><p>{effect.description}</p><div className="expected-effect-evidence"><span>비교 근거</span><strong>{effect.evidence}</strong></div>
    </section>)}</div> : <p className="expected-effects-empty">비교 가능한 전후 데이터가 충분하지 않아 기대효과 검토를 보류합니다.</p>}
  </Card>
}
