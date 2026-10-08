export const clamp = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);
export const round2 = (x: number) => Math.round(x * 100) / 100;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const deepClone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const fmtUSD = (x: number, digits = 0) =>
  (x < 0 ? '-' : '') + '$' + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtK = (x: number) => {
  const a = Math.abs(x);
  const s = x < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
};
export const fmtNum = (x: number, digits = 0) => x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
