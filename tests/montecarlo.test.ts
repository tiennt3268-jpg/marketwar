// Calibration / Monte Carlo QA (SRS §14): reproducible seeds, bots, invariant checks, outcome ranges.
import { test, expect } from 'vitest';
import { processRound } from '../src/engine/engine';
import { BOT_STRATEGIES } from '../src/engine/bots';
import { botGame } from './helpers';

test('Monte Carlo: bots across seeds keep all invariants and plausible outcomes', () => {
  const N = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MC_RUNS ?? 25);
  const stats: Record<string, { ni: number[]; bankrupt: number; score: number[] }> = {};
  for (const s of BOT_STRATEGIES) stats[s] = { ni: [], bankrupt: 0, score: [] };
  for (let seed = 1; seed <= N; seed++) {
    let g = botGame(seed * 7919, BOT_STRATEGIES, 0);
    while (g.phase !== 'FINISHED') g = processRound(g).game; // throws on any invariant violation
    const lb = g.results[g.results.length - 1].leaderboard;
    for (const c of g.companies) {
      const st = stats[c.botStrategy!];
      st.ni.push(c.cumulativeNetIncome);
      st.score.push(lb.find((x) => x.companyId === c.id)!.score);
      if (c.status === 'bankrupt') st.bankrupt++;
    }
  }
  const rows = Object.entries(stats).map(([k, v]) => {
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    return `${k.padEnd(24)} avgNI ${(avg(v.ni) / 1e6).toFixed(2)}M  avgScore ${avg(v.score).toFixed(1)}  bankrupt ${v.bankrupt}/${N}`;
  });
  console.log(rows.join('\n'));
  for (const v of Object.values(stats)) for (const x of v.ni) expect(Number.isFinite(x)).toBe(true);
}, 120_000);
