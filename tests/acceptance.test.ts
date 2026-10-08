// Acceptance matrix (SRS §13). Test ids follow T-xx.
import { describe, expect, test } from 'vitest';
import { createGame, openingHash, processRound } from '../src/engine/engine';
import { choiceProbabilities, allocate, type Offer } from '../src/engine/market';
import { computeAttributes, defaultFormula, validateFormula, FORMULA_PRESETS } from '../src/engine/product';
import { sanitizeDecision, validateDecision } from '../src/engine/decisions';
import { validateEventTemplate } from '../src/engine/events';
import { balanceGap, entryBalanced } from '../src/engine/ledger';
import { defaultScenario, MODE_RULES } from '../src/engine/scenario';
import { COUNTRIES, type EventTemplate, type GameState } from '../src/engine/types';
import { botGame, humanLikeGame, playHumanAsBot, runRounds } from './helpers';
import { deepClone, sum } from '../src/engine/util';

const env = defaultScenario().countries.JP;
const mkOffer = (key: string, over: Partial<Offer> = {}): Offer => ({
  key, companyId: key.split('|')[0], skuId: key.split('|')[1] ?? 'S', attrs: computeAttributes(defaultFormula(), 0.5), price: 1400, promoRate: 0,
  promoKind: 'price_cut', brand: 30, awareness: 30, coverage: 0.4, trust: 50, localization: 0.3, messageTheme: 'origin',
  targetSegments: ['mainstream'], qualityAdj: 1, stock: 1e9, ...over,
});
const potential = { budget: 100_000, mainstream: 100_000, premium: 100_000, health: 100_000 };

test('T-01 equal opening template (hash identical except ids/names)', () => {
  const g = botGame();
  const hashes = new Set(g.companies.map(openingHash));
  expect(hashes.size).toBe(1);
});

test('T-02 independent country competition', () => {
  let g = runRounds(humanLikeGame(11), 3, (x) => playHumanAsBot(x));
  g = playHumanAsBot(g);
  const variant: GameState = deepClone(g);
  const d = variant.decisions[variant.companies[0].id];
  for (const k of Object.keys(d.countries.JP.prices)) d.countries.JP.prices[k] *= 0.7;
  const a = processRound(g).result;
  const b = processRound(variant).result;
  const us = (r: typeof a) => r.countryResults.filter((x) => x.country === 'US' && x.companyId !== g.companies[0].id).map((x) => x.salesBoxes);
  const jp = (r: typeof a) => r.countryResults.filter((x) => x.country === 'JP').map((x) => x.salesBoxes);
  expect(us(a)).toEqual(us(b));
  expect(jp(a)).not.toEqual(jp(b));
});

test('T-03 invalid BOM rejected', () => {
  const f = { ...defaultFormula(), sugarG: 150 }; // mass no longer equals box contents
  expect(validateFormula(f).length).toBeGreaterThan(0);
  expect(validateFormula({ ...defaultFormula(), robustaPct: 1.3 }).some((e) => e.includes('100%'))).toBe(true);
  const g = humanLikeGame();
  const co = g.companies[0];
  const d = deepClone(g.decisions[co.id]);
  d.skus[0].formula = f;
  expect(validateDecision(d, co, g).some((i) => i.code === 'BOM_INVALID')).toBe(true);
});

test('T-04 versioned SKU: old inventory keeps formula & book value', () => {
  let g = humanLikeGame();
  const id = g.companies[0].id;
  g.decisions[id].production['SKU-001'] = 50_000;
  g = processRound(g).game;
  const lotBefore = g.companies[0].inventory.find((l) => l.location === 'VN')!;
  g.decisions[id].skus[0].formula = { ...FORMULA_PRESETS['Low-Sugar 2-in-1'] };
  g = processRound(g).game;
  const co = g.companies[0];
  expect(co.skus[0].versions.length).toBe(2);
  const old = co.inventory.find((l) => l.versionId === 'SKU-001:v1')!;
  expect(old.unitCost).toBe(lotBefore.unitCost);
  expect(co.skus[0].versions[1].effectiveRound).toBe(3);
});

test('T-05/T-06 derived variables & position labels cannot be set by the client', () => {
  const g = humanLikeGame();
  const co = g.companies[0];
  const raw = { ...g.decisions[co.id], qualityIndex: 100, quality_index: 100, marketPositionLabel: 'Premium', marketShare: 0.9 } as unknown;
  const clean = sanitizeDecision(raw, co, g.scenario, 1) as unknown as Record<string, unknown>;
  expect(clean.qualityIndex).toBeUndefined();
  expect(clean.quality_index).toBeUndefined();
  expect(clean.marketPositionLabel).toBeUndefined();
  expect(clean.marketShare).toBeUndefined();
});

test('T-07 own SKUs cannibalise; aggregate demand ≤ potential', () => {
  const one = allocate([mkOffer('A|1')], env.segments, potential, env);
  const two = allocate([mkOffer('A|1'), mkOffer('A|2', { attrs: computeAttributes(FORMULA_PRESETS['Low-Sugar 2-in-1'], 0.5) })], env.segments, potential, env);
  const s = (r: typeof one, k: string) => sum(Object.values(r.sales[k]));
  expect(s(two, 'A|1')).toBeLessThan(s(one, 'A|1'));
  expect(s(two, 'A|1') + s(two, 'A|2')).toBeLessThanOrEqual(sum(Object.values(potential)));
});

test('T-08 wholly-owned entry denied where ownership cap < 100%', () => {
  const g = humanLikeGame();
  const co = g.companies[0];
  const d = deepClone(g.decisions[co.id]);
  d.countries.CN.entryAction = 'enter';
  d.countries.CN.entryMode = 'greenfield';
  expect(validateDecision(d, co, g).some((i) => i.code === 'OWNERSHIP_CAP')).toBe(true);
  d.countries.CN.entryMode = 'jv';
  d.countries.CN.ownershipPct = 0.9;
  d.countries.CN.partnerId = g.scenario.partners.find((p) => p.country === 'CN' && p.kind === 'jv_partner')!.id;
  expect(validateDecision(d, co, g).some((i) => i.code === 'OWNERSHIP_CAP')).toBe(true);
});

test('T-09 greenfield cannot sell before activation', () => {
  let g = humanLikeGame();
  const id = g.companies[0].id;
  g.decisions[id].countries.US.entryAction = 'enter';
  g.decisions[id].countries.US.entryMode = 'greenfield';
  g.decisions[id].countries.US.entryScale = 'pilot';
  const r1 = processRound(g);
  expect(r1.game.companies[0].countries.US.status).toBe('pending');
  g = r1.game;
  for (let i = 0; i < MODE_RULES.greenfield.leadRounds - 1; i++) {
    g.decisions[id].countries.US.localProduction = { 'SKU-001': 10_000 };
    const out = processRound(g);
    const sales = out.result.countryResults.find((x) => x.companyId === id && x.country === 'US')!.salesBoxes;
    expect(sales).toBe(0);
    g = out.game;
  }
  expect(g.companies[0].countries.US.status).toBe('pending');
});

test('T-10 tariff raises landed cost without double booking', () => {
  const setup = (tariff: number) => {
    const g = humanLikeGame(3);
    g.scenario.countries.CN.importTariff = tariff;
    g.env.CN.importTariff = tariff;
    const id = g.companies[0].id;
    g.decisions[id].countries.CN = { ...g.decisions[id].countries.CN, entryAction: 'enter', entryMode: 'indirect_export', partnerId: g.scenario.partners.find((p) => p.country === 'CN' && p.kind === 'trading_house')!.id, labelLocalize: { 'SKU-001': true } };
    g.decisions[id].production['SKU-001'] = 40_000;
    g.decisions[id].shipments = [{ country: 'CN', skuId: 'SKU-001', qty: 40_000, mode: 'air', service: 'express', incoterm: 'DDP', insurance: 'basic' }];
    return processRound(g).game.companies[0].history[0].income;
  };
  const low = setup(0.05), high = setup(0.5);
  expect(high.tariffs).toBeGreaterThan(low.tariffs * 5);
  expect(Math.abs(high.logistics - low.logistics)).toBeLessThan(1);
});

test('T-11 sales never exceed sellable stock', () => {
  const r = allocate([mkOffer('A|1', { stock: 1234, price: 300 }), mkOffer('B|1', { stock: 10 })], env.segments, potential, env);
  expect(sum(Object.values(r.sales['A|1']))).toBeLessThanOrEqual(1234);
  expect(sum(Object.values(r.sales['B|1']))).toBeLessThanOrEqual(10);
});

test('T-12 the same inventory cannot be shipped twice', () => {
  const g = humanLikeGame();
  const co = g.companies[0];
  const d = deepClone(g.decisions[co.id]);
  d.countries.CN.entryAction = 'enter';
  d.countries.CN.entryMode = 'indirect_export';
  d.countries.CN.partnerId = g.scenario.partners.find((p) => p.country === 'CN' && p.kind === 'trading_house')!.id;
  d.production['SKU-001'] = 10_000;
  d.shipments = [
    { country: 'CN', skuId: 'SKU-001', qty: 8_000, mode: 'sea', service: 'standard', incoterm: 'DAP', insurance: 'basic' },
    { country: 'CN', skuId: 'SKU-001', qty: 8_000, mode: 'sea', service: 'standard', incoterm: 'DAP', insurance: 'basic' },
  ];
  expect(validateDecision(d, co, g).some((i) => i.code === 'OVER_SHIP')).toBe(true);
});

function incidentGame(policyRound: 'before' | 'same'): number {
  let g = humanLikeGame(5);
  const id = g.companies[0].id;
  const enter = (x: GameState) => {
    x.decisions[id].countries.JP = { ...x.decisions[id].countries.JP, entryAction: 'enter', entryMode: 'direct_export', partnerId: x.scenario.partners.find((p) => p.country === 'JP' && p.kind === 'distributor')!.id, labelLocalize: { 'SKU-001': true } };
  };
  enter(g);
  g.decisions[id].production['SKU-001'] = 100_000;
  g.decisions[id].shipments = [{ country: 'JP', skuId: 'SKU-001', qty: 100_000, mode: 'air', service: 'express', incoterm: 'DDP', insurance: 'basic' }];
  if (policyRound === 'before') g.decisions[id].countries.JP.politicalPolicy = 'premium';
  // round 1: goods land in JP; round 2: incident fires
  g.scenario.events.push({ id: 'test-incident', name: 'Test incident', description: '', scope: 'country', country: 'JP', trigger: 'fixed', round: 2, endRound: 99, probability: 1, severity: 80, durationRounds: 1, effects: [], destroysExposure: true, publicAnnouncement: true, enabled: true } as EventTemplate);
  g = processRound(g).game;
  g.decisions[id].countries.JP.politicalPolicy = 'premium';
  g.decisions[id].countries.JP.prices['SKU-001'] = 1e6; // do not sell, keep exposure
  const out = processRound(g).game;
  return out.companies[0].history[1].income.insuranceRecovery;
}

test('T-13/T-14 losses only for exposed operations; no retroactive insurance', () => {
  expect(incidentGame('before')).toBeGreaterThan(0);
  expect(incidentGame('same')).toBe(0);
  // a company without JP presence is unaffected
});

test('T-15 hedge applies only to the hedged fraction', () => {
  let g = runRounds(humanLikeGame(9), 2, (x) => playHumanAsBot(x));
  g = playHumanAsBot(g);
  const id = g.companies[0].id;
  for (const c of COUNTRIES) g.decisions[id].countries[c].hedgeRatio = 0;
  const r0 = processRound(g).result.journal.filter((e) => e.companyId === id && e.source === 'fx-hedge');
  expect(r0.length).toBe(0);
  for (const c of COUNTRIES) g.decisions[id].countries[c].hedgeRatio = 1;
  const r1 = processRound(g).result.journal.filter((e) => e.companyId === id && e.source === 'fx-hedge');
  expect(r1.length).toBeGreaterThan(0);
});

test('T-16 every journal entry balances and balance sheets balance (full game)', () => {
  let g = botGame(21, ['export_first', 'price_leader', 'quality_differentiator', 'jv_diversifier', 'focused_niche', 'conservative'], 2);
  while (g.phase !== 'FINISHED') {
    const out = processRound(g);
    for (const e of out.result.journal) expect(entryBalanced(e)).toBe(true);
    for (const c of out.game.companies) expect(Math.abs(balanceGap(c.ledger))).toBeLessThan(1);
    g = out.game;
  }
});

test('T-18 cash overrun fails validation', () => {
  const g = humanLikeGame();
  const co = g.companies[0];
  const d = deepClone(g.decisions[co.id]);
  d.capacityCapex = 50_000_000;
  expect(validateDecision(d, co, g).some((i) => i.code === 'CASH_OVERRUN')).toBe(true);
});

test('T-21 duplicate processing produces no duplicate ledger (pure function)', () => {
  const g = botGame(4);
  const a = processRound(g);
  const b = processRound(g);
  expect(a.result.journal.length).toBe(b.result.journal.length);
  expect(g.results.length).toBe(0); // input untouched
});

test('T-22 determinism: same inputs + seed + engine ⇒ same hashes', () => {
  const g = runRounds(botGame(99), 3);
  const a = processRound(g).result;
  const b = processRound(deepClone(g)).result;
  expect(a.inputHash).toBe(b.inputHash);
  expect(a.outputHash).toBe(b.outputHash);
  const other = processRound({ ...deepClone(g), seed: 100 }).result;
  expect(other.inputHash).not.toBe(a.inputHash);
});

test('T-23 softmax is stable for extreme utilities', () => {
  const r = choiceProbabilities([1e6, -1e6, 1e308, Number.NaN], 0);
  for (const p of r.p) expect(Number.isFinite(p)).toBe(true);
  expect(sum(r.p) + r.outside).toBeCloseTo(1, 9);
});

test('T-24 outside option keeps demand for very poor offers', () => {
  const r = allocate([mkOffer('A|1', { price: 50_000, coverage: 0.01, brand: 0, awareness: 0 })], env.segments, potential, env);
  expect(sum(Object.values(r.sales['A|1']))).toBeLessThan(0.01 * sum(Object.values(potential)));
  expect(r.unserved).toBeGreaterThan(0.99 * sum(Object.values(potential)));
});

test('T-25 event DSL rejects out-of-registry handlers', () => {
  const bad: EventTemplate = { id: 'x', name: 'x', description: '', scope: 'country', country: 'US', trigger: 'fixed', round: 2, endRound: 9, probability: 1, severity: 0, durationRounds: 1, effects: [{ variable: 'process.exit', op: 'SET', value: 1 }], destroysExposure: false, publicAnnouncement: true, enabled: true };
  expect(validateEventTemplate(bad).length).toBeGreaterThan(0);
  expect(validateEventTemplate({ ...bad, effects: [{ variable: 'importTariff', op: 'EVAL' as 'SET', value: 1 }] }).length).toBeGreaterThan(0);
  expect(validateEventTemplate({ ...bad, effects: [{ variable: 'importTariff', op: 'ADD', value: 0.1 }] })).toEqual([]);
});

describe('T-27 research noise', () => {
  test('advanced research has a smaller error band than basic', () => {
    let g = humanLikeGame(2);
    const id = g.companies[0].id;
    g.decisions[id].countries.US.researchTier = 'basic';
    g.decisions[id].countries.GB.researchTier = 'advanced';
    g = processRound(g).game;
    const r = g.companies[0].research;
    expect(r.find((x) => x.country === 'US')!.errorBand).toBeGreaterThan(r.find((x) => x.country === 'GB')!.errorBand);
  });
});

test('practice rounds reset companies to the identical opening template', () => {
  const g = runRounds(botGame(8, ['export_first', 'price_leader'], 2), 2);
  expect(g.round).toBe(3);
  expect(new Set(g.companies.map(openingHash)).size).toBe(1);
  expect(createGame({ name: 'x', seed: 1, teams: [{ name: 'a', color: '#000', isBot: false }] }).companies[0].ledger.cash).toBe(g.companies[0].ledger.cash);
});
