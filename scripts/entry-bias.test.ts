// Controlled experiment: one "probe" company enters a single country with each entry mode while
// product, marketing, finance and opponents stay identical. Run with: npm run bias
import { test } from 'vitest';
import { probe } from '../tests/probe';
import { MODE_RULES } from '../src/engine/scenario';
import { ENTRY_MODES, type CountryCode} from '../src/engine/types';

const SEEDS = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEEDS ?? 8);

test('entry mode bias', () => {
  const countries: CountryCode[] = ['CN', 'JP', 'US', 'GB'];
  const rows: string[] = [];
  const avgByMode: Record<string, number[]> = {};
  for (const c of countries) {
    for (const m of ENTRY_MODES) {
      if (MODE_RULES[m].needsFullOwnership && c === 'CN') continue;
      let ni = 0, score = 0, boxes = 0, eq = 0;
      for (let s = 1; s <= SEEDS; s++) { const a = probe(c, m, s * 101, 1), b = probe(c, m, s * 101, 0.35); const r = a.score >= b.score ? a : b; ni += r.ni; score += r.score; boxes += r.boxes; eq += r.equity; }
      ni /= SEEDS; score /= SEEDS; boxes /= SEEDS; eq /= SEEDS;
      (avgByMode[m] ??= []).push(score);
      rows.push(`${c} ${m.padEnd(16)} NI ${(ni / 1e6).toFixed(2).padStart(6)}M  equity ${(eq / 1e6).toFixed(2)}M  boxes ${(boxes / 1e3).toFixed(0).padStart(5)}K  score ${score.toFixed(1)}`);
    }
  }
  console.log(rows.join('\n'));
  console.log(Object.entries(avgByMode).map(([m, v]) => `${m.padEnd(16)} avg score ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join('\n'));
}, 300_000);
