import { Mascot } from './ui'

export default function PageBanner({ eyebrow, title, variant = 'explorer', label }) {
  return <section className="strategy-hero analysis-hero page-mascot-banner" aria-label={label}>
    <div className="strategy-hero-copy"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
    <div className="analysis-hero-art" aria-hidden="true"><span/><Mascot variant={variant}/></div>
  </section>
}
