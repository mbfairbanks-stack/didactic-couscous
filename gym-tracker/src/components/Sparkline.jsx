// Minimal dependency-free line chart. `points` is [{ date, value }] sorted
// oldest to newest.
export default function Sparkline({ points, height = 120 }) {
  if (!points || points.length === 0) return null

  const width = 300
  const padX = 8
  const padY = 12
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const xFor = (i) =>
    points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2)
  const yFor = (v) => height - padY - ((v - min) / range) * (height - padY * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ')

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r={i === points.length - 1 ? 4 : 2.5} fill="var(--accent)" />
        ))}
      </svg>
    </div>
  )
}
