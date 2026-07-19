// Minimal dependency-free area chart. `points` is [{ date, value }] sorted
// oldest to newest.
export default function Sparkline({ points, height = 130 }) {
  if (!points || points.length === 0) return null

  const width = 300
  const padX = 8
  const padY = 14
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const xFor = (i) =>
    points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2)
  const yFor = (v) => height - padY - ((v - min) / range) * (height - padY * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ')
  const areaPath = `${linePath} L ${xFor(points.length - 1)} ${height} L ${xFor(0)} ${height} Z`

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 1 && <path d={areaPath} fill="url(#spark-fill)" stroke="none" />}
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xFor(i)}
            cy={yFor(p.value)}
            r={i === points.length - 1 ? 5 : 3}
            fill={i === points.length - 1 ? 'var(--accent)' : 'var(--bg)'}
            stroke="var(--accent)"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  )
}
