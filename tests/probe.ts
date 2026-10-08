// Controlled entry-mode probe: one company enters a single country with a given mode while product,
// marketing, finance and opponents stay identical.
import { createGame, processRound } from '../src/engine/engine';
import { BOT_PROFILES } from '../src/engine/bots';
import type { CountryCode, EntryMode } from '../src/engine/types';

export function probe(country: CountryCode, mode: EntryMode, seed: number, mkt = 1) {
  const base = BOT_PROFILES.export_first;
  (BOT_PROFILES as Record<string, typeof base>).probe = {
    ...base, label: 'Probe', adPerCountry: base.adPerCountry * mkt, tradeSpend: base.tradeSpend * mkt, products: [base.products[0]], capexRounds: [],
    entries: [{ round: 1, country, mode, scale: 'normal', ownership: 0.5 }],
  };
  let g = createGame({ name: 'bias', seed, teams: [
    { name: 'Probe', color: '#000', isBot: true, botStrategy: 'probe' as never },
    { name: 'A', color: '#111', isBot: true, botStrategy: 'price_leader' },
    { name: 'B', color: '#222', isBot: true, botStrategy: 'quality_differentiator' },
    { name: 'C', color: '#333', isBot: true, botStrategy: 'conservative' },
  ] });
  g.scenario.practiceRounds = 0;
  while (g.phase !== 'FINISHED') g = processRound(g).game;
  const co = g.companies[0];
  const lb = g.results[g.results.length - 1].leaderboard.find((x) => x.companyId === co.id)!;
  const boxes = g.results.reduce((a, r) => a + r.countryResults.filter((x) => x.companyId === co.id).reduce((b, x) => b + x.salesBoxes, 0), 0);
  const equity = co.ledger.equityCapital + co.ledger.retainedEarnings;
  return { ni: co.cumulativeNetIncome, score: lb.score, boxes, equity, bankrupt: co.status === 'bankrupt' };
}
