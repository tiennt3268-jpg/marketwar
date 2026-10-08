import { expect, test } from 'vitest';
import { MODE_RULES } from '../src/engine/scenario';
import { ENTRY_MODES, type CountryCode } from '../src/engine/types';
import { probe } from './probe';

// Regression guard against a dominant (or unplayable) entry mode. Full experiment: scripts/entry-bias.test.ts
test('no entry mode dominates or is unplayable', () => {
  const countries: CountryCode[] = ['JP', 'US', 'GB'];
  const avg: Record<string, number> = {};
  for (const m of ENTRY_MODES) {
    let score = 0, n = 0;
    for (const c of countries) {
      if (MODE_RULES[m].needsFullOwnership && c === 'CN') continue;
      for (const seed of [101, 202]) {
        const r = probe(c, m, seed);
        expect(r.boxes, `${m} in ${c} never sold`).toBeGreaterThan(0);
        score += r.score; n++;
      }
    }
    avg[m] = score / n;
  }
  const vals = Object.values(avg);
  expect(Math.max(...vals) - Math.min(...vals), JSON.stringify(avg)).toBeLessThan(15);
}, 120_000);
