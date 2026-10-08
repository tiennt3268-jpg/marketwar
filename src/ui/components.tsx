import { useState, type ReactNode } from 'react';
import type { CountryCode, SegmentId } from '../engine/types';

export const COUNTRY_NAME: Record<CountryCode, string> = { CN: 'China', JP: 'Japan', US: 'United States', GB: 'United Kingdom' };
export const SEGMENT_NAME: Record<SegmentId, string> = { budget: 'Budget', mainstream: 'Mainstream', premium: 'Premium', health: 'Health-conscious' };

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {title ? <h3>{title}</h3> : <span />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, accent }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn'; accent?: 'green' | 'blue' | 'amber' | 'violet' | 'teal' | 'rose' }) {
  return (
    <div className={`card stat stat-${accent ?? 'green'}`}>
      <span className="label">{label}</span>
      <span className={`value ${tone ?? ''}`}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function NumField({ label, value, onChange, step = 1000, min = 0, max, hint, disabled, suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: ReactNode; disabled?: boolean; suffix?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input
        type="number" step={step} min={min} max={max} disabled={disabled}
        value={text ?? (Number.isFinite(value) ? String(value) : '')}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(max !== undefined ? Math.min(max, Math.max(min, n)) : Math.max(min, n));
        }}
        onBlur={() => setText(null)}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled, hint }: {
  label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; disabled?: boolean; hint?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function RangeField({ label, value, min, max, step, onChange, format, disabled }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="spread"><span>{label}</span><b className="mono">{format ? format(value) : value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} className={value === i.value ? 'active' : ''} onClick={() => onChange(i.value)}>{i.label}</button>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100 }: { value: number; max?: number }) {
  return <div className="meter" role="meter" aria-valuenow={value} aria-valuemax={max}><div style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div>;
}

export function AttrRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="attr-row">
      <span>{label}</span>
      <div className="meter"><div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
      <span className="mono">{value.toFixed(0)}</span>
    </div>
  );
}

export function Badge({ tone, children }: { tone?: 'good' | 'bad' | 'warn' | 'info' | 'accent'; children: ReactNode }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
