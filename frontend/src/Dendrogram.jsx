import { clusterColor } from './clusterUtils'

/**
 * SVG dendrogram from SciPy coordinates (icoord/dcoord). Links below the cut height take the
 * color of their group; leaf i sits at x = 5 + 10·i in SciPy's coordinate system.
 */
export default function Dendrogram({ d, labels, cut, highlight, height = 360 }) {
  const n = d.leaves.length
  const W = 1000
  const top = 12
  const plotH = height - 140
  const sx = x => 40 + ((x - 5) / (10 * (n - 1))) * (W - 80)
  const sy = y => top + plotH - (y / d.max_height) * plotH
  const leafGroup = x => labels[d.leaves[Math.min(n - 1, Math.max(0, Math.round((x - 5) / 10)))]]
  return <svg viewBox={`0 0 ${W} ${height}`} className="cluster-svg dendrogram" role="img" aria-label="유사 박물관 계층 군집 덴드로그램">
    {d.icoord.map((xs, i) => {
      const ys = d.dcoord[i]
      const below = Math.max(...ys) <= cut
      const points = xs.map((x, j) => `${sx(x)},${sy(ys[j])}`).join(' ')
      return <polyline key={i} points={points} fill="none" stroke={below ? clusterColor(leafGroup(xs[0])) : '#a7b4b0'} strokeWidth={below ? 2.4 : 1.4}/>
    })}
    <line x1={30} x2={W - 30} y1={sy(cut)} y2={sy(cut)} stroke="#b4656f" strokeDasharray="5 4"/>
    <text x={W - 32} y={sy(cut) - 5} textAnchor="end" className="cut-label">절단선</text>
    {d.leaves.map((id, i) => {
      const hl = id === highlight
      const name = d.leaf_labels[i]
      return <g key={id} transform={`translate(${sx(5 + 10 * i)},${top + plotH + 10}) rotate(50)`}>
        <text className={hl ? 'leaf highlighted' : 'leaf'} style={{ fill: clusterColor(labels[id]) }}>{hl ? '▶ ' : ''}{name.length > 13 ? `${name.slice(0, 12)}…` : name}<title>{name}</title></text>
      </g>
    })}
  </svg>
}
