// Small dependency-free SVG charts.
import type { ReactNode } from 'react';

export interface Series { name: string; color: string; values: (number | null)[] }

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.name}><i className="dot" style={{ background: i.color }} />{i.name}</span>)}</div>;
}

export function LineChart({ series, labels, height = 220, format = (v: number) => v.toFixed(0), yMin }: {
  series: Series[]; labels: string[]; height?: number; format?: (v: number) => string; yMin?: number;
}) {
  const W = 640, H = height, L = 56, R = 12, T = 12, B = 26;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (!all.length) return <p className="muted small">No data yet.</p>;
  const lo = yMin ?? Math.min(0, ...all);
  const hi = niceMax(Math.max(...all, lo + 1));
  const x = (i: number) => L + (labels.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="axis" strokeDasharray={t === 0 ? '' : '3 3'} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle">{l}</text>)}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return (
            <g key={s.name}>
              <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2.2} />
              {s.values.map((v, i) => v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color}><title>{`${s.name} – ${labels[i]}: ${format(v)}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <Legend items={series} />
    </div>
  );
}

export function BarChart({ rows, format = (v: number) => v.toFixed(0), max }: {
  rows: { label: ReactNode; value: number; color: string; note?: string }[]; format?: (v: number) => string; max?: number;
}) {
  const m = max ?? Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 160px) 1fr 80px', gap: 8, alignItems: 'center' }}>
          <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
          <div className="meter" style={{ height: 12 }}><div style={{ width: `${Math.max(0, (r.value / m) * 100)}%`, background: r.color }} /></div>
          <span className="mono small" style={{ textAlign: 'right' }} title={r.note}>{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export interface MapPoint { name: string; color: string; x: number; y: number; size: number; label: string }

/** Perceptual positioning map: x = Relative Price Index, y = perceived quality, bubble = share. */
export function PositioningMap({ points, height = 320 }: { points: MapPoint[]; height?: number }) {
  const W = 640, H = height, L = 48, R = 16, T = 16, B = 34;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(60, ...xs) - 5, x1 = Math.max(140, ...xs) + 5;
  const y0 = Math.min(40, ...ys) - 5, y1 = Math.max(80, ...ys) + 5;
  const sx = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const avgY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 60;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Perceptual positioning map">
      <line x1={sx(100)} x2={sx(100)} y1={T} y2={H - B} className="axis" strokeDasharray="4 4" />
      <line x1={L} x2={W - R} y1={sy(avgY)} y2={sy(avgY)} className="axis" strokeDasharray="4 4" />
      <text x={W - R} y={T + 10} textAnchor="end">Premium </text>
      <text x={L + 4} y={T + 10}>Value for money </text>
      <text x={L + 4} y={H - B - 6}>Economy </text>
      <text x={W - R} y={H - B - 6} textAnchor="end">Overpriced </text>
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle">Relative Price Index</text>
      <text x={12} y={(T + H - B) / 2} transform={`rotate(-90 12 ${(T + H - B) / 2})`} textAnchor="middle">Perceived quality</text>
      {[x0, 100, x1].map((v) => <text key={v} x={sx(v)} y={H - B + 14} textAnchor="middle">{v.toFixed(0)}</text>)}
      {points.map((p) => (
        <g key={p.name}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={6 + Math.sqrt(Math.max(0, p.size)) * 30} fill={p.color} fillOpacity={0.35} stroke={p.color} strokeWidth={2}>
            <title>{`${p.name}: RPI ${p.x.toFixed(0)}, PQ ${p.y.toFixed(0)}, share ${(p.size * 100).toFixed(1)}% – ${p.label}`}</title>
          </circle>
          <text x={sx(p.x)} y={sy(p.y) - 10 - Math.sqrt(Math.max(0, p.size)) * 30} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 700 }}>{p.name}</text>
        </g>
      ))}
    </svg>
  );
}
