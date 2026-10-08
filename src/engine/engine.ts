// Round processor (SRS §8.2). Pure & deterministic: same game state + decisions + seed + engine
// version ⇒ identical outputs and hashes (T-22).
import { Books, balanceGap, entryBalanced, totalAssets } from './ledger';
import { allocate, equivalentPrice, type Offer } from './market';
import { computeAttributes, defaultFormula, estimateUnitCost, sameFormula } from './product';
import { applyEventEffects, sampleEvents } from './events';
import { Rng, hashHex } from './rng';
import { MODE_RULES, SCALE_MULT, defaultScenario } from './scenario';
import {
  COSTS, carryForward, currentVersion, defaultDecision, latestVersion, sanitizeDecision, validateDecision,
} from './decisions';
import { makeBotDecision } from './bots';
import type {
  BotStrategy, CompanyState, CountryCode, CountryPresence, CountryResult, Currency, Decision, GameState,
  InventoryLot, PositionLabel, PositionSnapshot, ResearchReport, RoundResult, Scenario, SegmentId, SegmentResult, Shipment,
} from './types';
import { COUNTRIES, SEGMENTS } from './types';
import { clamp, deepClone, round2, sum } from './util';

export const ENGINE_VERSION = '1.0.0';

export interface TeamConfig { name: string; color: string; isBot: boolean; botStrategy?: BotStrategy }

const MODE_BIT = { sea: 1, air: 2, multimodal: 4 } as const;
const SERVICE = {
  economy: { cost: 0.82, delay: 1.6 },
  standard: { cost: 1, delay: 1 },
  express: { cost: 1.35, delay: 0.4 },
} as const;
const INCOTERM = {
  EXW: { premium: 0.15, buyerRisk: true, delayMult: 1.3, detentionMult: 1.2 },
  FOB: { premium: 0.1, buyerRisk: true, delayMult: 1.3, detentionMult: 1.2 },
  CIF: { premium: 0.05, buyerRisk: false, delayMult: 1, detentionMult: 1.1 },
  DAP: { premium: 0.03, buyerRisk: false, delayMult: 1, detentionMult: 1 },
  DDP: { premium: 0, buyerRisk: false, delayMult: 1, detentionMult: 0.5 },
} as const;
const CARGO_COVER = { none: 0, basic: 0.6, comprehensive: 1 } as const;
const CARGO_RATE = { none: 0, basic: 0.004, comprehensive: 0.009 } as const;
const POLICY = {
  none: { rate: 0, min: 0, cover: 0, limit: 0, deductible: 0 },
  basic: { rate: 0.006, min: 3_000, cover: 0.5, limit: 1_000_000, deductible: 50_000 },
  premium: { rate: 0.012, min: 6_000, cover: 0.85, limit: 3_000_000, deductible: 25_000 },
} as const;

/* ------------------------------------------------------------------ setup */

function emptyPresence(): CountryPresence {
  return {
    mode: null, scale: 'normal', status: 'none', activationRound: null, partnerId: null, ownershipPct: 1,
    brand: 0, awareness: 0, coverage: 0, satisfaction: 50, trust: 50, localCapacity: 0, localAssets: 0, goodwill: 0,
    labelLocalized: {}, politicalPolicy: null, receivables: [],
  };
}

export function openingCompany(id: string, team: TeamConfig, scenario: Scenario): CompanyState {
  const init = scenario.initial;
  const f = defaultFormula();
  const countries = {} as Record<CountryCode, CountryPresence>;
  for (const c of COUNTRIES) countries[c] = { ...emptyPresence(), brand: init.brand };
  return {
    id, name: team.name, color: team.color, isBot: team.isBot, botStrategy: team.botStrategy, status: 'active',
    ledger: {
      cash: init.cash - init.plantValue, receivables: 0, inventory: 0, ppe: init.plantValue, intangibles: 0,
      debt: 0, equityCapital: init.cash, retainedEarnings: 0,
    },
    loans: [], vnCapacity: init.vnCapacity, capacityProjects: [], freezeTechProgress: 0, hasFreezeTech: false,
    processMaturity: 0.5, rdStock: 0,
    skus: [{ id: 'SKU-001', name: 'Classic 3-in-1', retired: false, versions: [{ id: 'SKU-001:v1', version: 1, formula: f, attributes: computeAttributes(f, 0.5, scenario.global.coffeePriceIndex), effectiveRound: 1 }] }],
    inventory: [], shipments: [], countries, hedges: [], taxLossCarry: 0, claims: [], research: [],
    cumulativeNetIncome: 0, cumulativeInvested: init.cash, history: [], notes: {},
  };
}

function initialMarket(scenario: Scenario) {
  const marketSize = {} as GameState['marketSize'];
  for (const c of COUNTRIES) {
    const env = scenario.countries[c];
    marketSize[c] = {} as Record<SegmentId, number>;
    for (const s of env.segments) marketSize[c][s.id] = Math.round(env.marketSizeBoxes * s.share);
  }
  const fx: Record<Currency, number> = { USD: 1, CNY: scenario.countries.CN.fxRate, JPY: scenario.countries.JP.fxRate, GBP: scenario.countries.GB.fxRate, VND: scenario.global.vndPerUsd };
  return { marketSize, fx };
}

export function createGame(opts: { name: string; seed: number; teams: TeamConfig[]; scenario?: Scenario; id?: string }): GameState {
  const scenario = opts.scenario ?? defaultScenario();
  const { marketSize, fx } = initialMarket(scenario);
  const companies = opts.teams.map((t, i) => openingCompany(`C${i + 1}`, t, scenario));
  const game: GameState = {
    id: opts.id ?? `G-${opts.seed}`, name: opts.name, engineVersion: ENGINE_VERSION, seed: opts.seed, round: 1, phase: 'OPEN',
    scenario, marketSize, fx, env: deepClone(scenario.countries), activeEvents: [], companies, decisions: {}, results: [],
    audit: [{ at: new Date(0).toISOString(), round: 0, actor: 'GM', event: 'GAME_CREATED', detail: `${companies.length} teams, seed ${opts.seed}` }],
  };
  refreshEnvironment(game);
  for (const c of companies) game.decisions[c.id] = defaultDecision(c, scenario, 1);
  return game;
}

/** Opening-state hash excluding identifiers (T-01 parity). */
export function openingHash(c: CompanyState): string {
  const { id: _id, name: _n, color: _c, isBot: _b, botStrategy: _s, history: _h, notes: _no, ...rest } = c;
  return hashHex(rest);
}

/** Live env = scenario base (with current FX) + active event effects. */
export function refreshEnvironment(game: GameState) {
  const base = deepClone(game.scenario.countries);
  for (const c of COUNTRIES) base[c].fxRate = game.fx[base[c].currency];
  const { env } = applyEventEffects(base, game.scenario.global, game.activeEvents, game.scenario.events);
  game.env = env;
}

export const isScored = (game: GameState, round: number) => round > game.scenario.practiceRounds;
export const totalRounds = (game: GameState) => game.scenario.practiceRounds + game.scenario.scoredRounds;

/* ------------------------------------------------------------- utilities */

function takeFifo(lots: InventoryLot[], pred: (l: InventoryLot) => boolean, qty: number): { taken: InventoryLot[]; cost: number } {
  let need = qty;
  const taken: InventoryLot[] = [];
  let cost = 0;
  for (const l of lots) {
    if (need <= 0) break;
    if (!pred(l) || l.qty <= 0) continue;
    const q = Math.min(l.qty, need);
    l.qty -= q;
    need -= q;
    cost += q * l.unitCost;
    taken.push({ ...l, qty: q });
  }
  return { taken, cost: round2(cost) };
}

function pruneLots(c: CompanyState) {
  c.inventory = c.inventory.filter((l) => l.qty > 0);
}

function addLot(c: CompanyState, lot: InventoryLot) {
  const same = c.inventory.find((l) => l.location === lot.location && l.versionId === lot.versionId && Math.abs(l.unitCost - lot.unitCost) < 0.005);
  if (same) same.qty += lot.qty;
  else c.inventory.push({ ...lot });
}

function versionById(c: CompanyState, versionId: string) {
  for (const s of c.skus) for (const v of s.versions) if (v.id === versionId) return v;
  return null;
}

function loanUsd(loan: CompanyState['loans'][number], vnd: number) {
  return loan.currency === 'VND' ? loan.outstandingLocal / vnd : loan.outstandingLocal;
}

/* ------------------------------------------------------------ main runner */

export interface RoundOutput { game: GameState; result: RoundResult }

export function processRound(input: GameState): RoundOutput {
  const game = deepClone(input);
  const round = game.round;
  const sc = game.scenario;
  const seed = game.seed;
  const messages: Record<string, string[]> = {};
  const msg = (cid: string, m: string) => (messages[cid] ??= []).push(m);

  // 1. Freeze inputs: resolve every company's submission (missing ⇒ carry-forward / bot / safe default)
  const decisions: Record<string, Decision> = {};
  for (const c of game.companies) {
    let d: Decision;
    if (c.isBot && c.status === 'active') d = makeBotDecision(game, c);
    else d = sanitizeDecision(game.decisions[c.id] ?? carryForward(undefined, c, sc, round), c, sc, round);
    if (c.status === 'bankrupt') d = defaultDecision(c, sc, round);
    const errors = validateDecision(d, c, game).filter((i) => i.severity === 'error' && i.code !== 'BANKRUPT');
    if (errors.length && c.status === 'active') {
      msg(c.id, `Decision had ${errors.length} validation error(s); invalid one-off actions were cancelled: ${errors.map((e) => e.message).join(' | ')}`);
      d = neutralise(d, errors.map((e) => e.code), c, game);
    }
    decisions[c.id] = d;
  }
  const inputHash = hashHex({ seed, round, engine: ENGINE_VERSION, decisions, state: input.companies, env: input.env, fx: input.fx });

  // 2. Exogenous events & macro-economy
  const fired = sampleEvents(sc.events, round, seed, game.activeEvents);
  game.activeEvents = [...game.activeEvents.filter((e) => e.untilRound >= round), ...fired];
  const fxRng = Rng.stream(seed, round, 'fx');
  for (const c of COUNTRIES) {
    const env = sc.countries[c];
    const z = fxRng.normal();
    if (env.currency !== 'USD') game.fx[env.currency] = round2(game.fx[env.currency] * Math.exp(env.fxVolatility * z) * 10000) / 10000;
  }
  game.fx.VND = Math.round(game.fx.VND * Math.exp(0.004 + 0.01 * fxRng.normal()));
  for (const ev of fired) {
    const t = sc.events.find((x) => x.id === ev.templateId)!;
    for (const e of t.effects) {
      if (e.variable !== 'fxRate') continue;
      const targets = t.scope === 'global' ? COUNTRIES : [t.country!];
      for (const c of targets) {
        const cur = sc.countries[c].currency;
        if (cur !== 'USD' && e.op === 'MULTIPLY') game.fx[cur] = round2(game.fx[cur] * e.value * 10000) / 10000;
      }
    }
  }
  const prevFx = { ...input.fx };
  const { env, global, demandMult } = applyEventEffects(
    Object.fromEntries(COUNTRIES.map((c) => [c, { ...sc.countries[c], fxRate: game.fx[sc.countries[c].currency] }])) as GameState['env'],
    sc.global, game.activeEvents, sc.events);
  game.env = env;
  for (const c of COUNTRIES) {
    const e = env[c];
    for (const s of SEGMENTS) {
      game.marketSize[c][s] = Math.max(0, Math.round(game.marketSize[c][s] * (1 + e.marketGrowth + e.gdpGrowth / 8)));
    }
  }
  const potential = (c: CountryCode, s: SegmentId) => Math.round(game.marketSize[c][s] * demandMult[c]);

  const books: Record<string, Books> = {};
  const roundStats: Record<string, { stockouts: Record<CountryCode, number>; defect: number; losses: number }> = {};

  // 3–8. Company-internal operations prior to the market
  for (const co of game.companies) {
    const d = decisions[co.id];
    const B = (books[co.id] = new Books(co.ledger, round, co.id));
    roundStats[co.id] = { stockouts: { CN: 0, JP: 0, US: 0, GB: 0 }, defect: 0, losses: 0 };
    if (co.status === 'bankrupt') continue;
    const rng = Rng.stream(seed, round, `ops:${co.id}`);
    const vnd = game.fx.VND;

    // Collections & insurance claims due
    for (const c of COUNTRIES) {
      const p = co.countries[c];
      const due = p.receivables.filter((r) => r.dueRound <= round);
      const amt = sum(due.map((r) => r.amount));
      if (amt > 0) B.post('collect', `Collect receivables ${c}`, [{ account: 'Cash', debit: amt }, { account: 'AR', credit: amt }]);
      p.receivables = p.receivables.filter((r) => r.dueRound > round);
    }
    const claimsDue = co.claims.filter((x) => x.dueRound <= round);
    const claimAmt = sum(claimsDue.map((x) => x.amount));
    if (claimAmt > 0) B.post('claims', 'Insurance / buyer reimbursements received', [{ account: 'Cash', debit: claimAmt }, { account: 'AR', credit: claimAmt }]);
    co.claims = co.claims.filter((x) => x.dueRound > round);

    // Financing: re-measure VND debt at the new rate, maturities, voluntary repayment, new borrowing
    for (const loan of co.loans) {
      if (loan.currency !== 'VND') continue;
      const g = round2(loan.carryingUsd - loanUsd(loan, vnd));
      if (g > 0) B.post('fx-reval', `VND loan revaluation gain ${loan.id}`, [{ account: 'Debt', debit: g }, { account: 'FXGainLoss', credit: g }]);
      else if (g < 0) B.post('fx-reval', `VND loan revaluation loss ${loan.id}`, [{ account: 'FXGainLoss', debit: -g }, { account: 'Debt', credit: -g }]);
      loan.carryingUsd = round2(loan.carryingUsd - g);
    }
    for (const loan of co.loans) {
      if (loan.maturityRound <= round && loan.outstandingLocal > 0) {
        const usd = loan.carryingUsd;
        loan.carryingUsd = 0;
        B.post('loan-maturity', `Repay matured ${loan.currency} loan ${loan.id}`, [{ account: 'Debt', debit: usd }, { account: 'Cash', credit: usd }], 'financing');
        loan.outstandingLocal = 0;
      }
    }
    let repay = Math.min(d.debtRepayment, co.loans.reduce((a, l) => a + l.carryingUsd, 0));
    for (const loan of co.loans) {
      if (repay <= 0 || loan.carryingUsd <= 0) continue;
      const pay = round2(Math.min(loan.carryingUsd, repay));
      loan.outstandingLocal -= (pay / loan.carryingUsd) * loan.outstandingLocal;
      loan.carryingUsd = round2(loan.carryingUsd - pay);
      repay -= pay;
      B.post('repay', `Voluntary repayment ${loan.id}`, [{ account: 'Debt', debit: pay }, { account: 'Cash', credit: pay }], 'financing');
    }
    if (d.newLoan > 0) {
      const id = `L${round}-${co.loans.length + 1}`;
      const rate = d.loanCurrency === 'VND' ? global.vndInterestRate : global.usdInterestRate + (d.loanTermRounds > 2 ? 0.01 : 0);
      co.loans.push({ id, currency: d.loanCurrency, principalLocal: d.loanCurrency === 'VND' ? d.newLoan * vnd : d.newLoan, outstandingLocal: d.loanCurrency === 'VND' ? d.newLoan * vnd : d.newLoan, carryingUsd: round2(d.newLoan), annualRate: rate, maturityRound: round + d.loanTermRounds });
      B.post('borrow', `New ${d.loanCurrency} loan ${id}`, [{ account: 'Cash', debit: d.newLoan }, { account: 'Debt', credit: d.newLoan }], 'financing');
    }
    co.loans = co.loans.filter((l) => l.carryingUsd > 0.005);

    // Entry projects: new entries, exits, activations
    for (const c of COUNTRIES) {
      const cd = d.countries[c];
      const p = co.countries[c];
      if (cd.entryAction === 'enter' && (p.status === 'none' || p.status === 'exited')) {
        const rule = MODE_RULES[cd.entryMode];
        const m = SCALE_MULT[cd.entryScale];
        const partner = sc.partners.find((x) => x.id === cd.partnerId) ?? null;
        const own = cd.entryMode === 'jv' ? cd.ownershipPct : 1;
        B.post('entry-setup', `${c} ${rule.label} set-up (legal, partner search, registration)`, [{ account: 'Admin', debit: rule.setupCost * m }, { account: 'Cash', credit: rule.setupCost * m }]);
        let assets = 0;
        if (cd.entryMode === 'acquisition') {
          const price = (partner?.feeOrMargin ?? 3_200_000) * m;
          assets = price * 0.55;
          B.post('acquisition', `${c} acquisition of ${partner?.name}`, [{ account: 'PPE', debit: assets }, { account: 'Intangibles', debit: price - assets }, { account: 'Cash', credit: price }], 'investing');
        } else if (rule.capex > 0) {
          assets = rule.capex * m * own;
          B.post('entry-capex', `${c} ${rule.label} plant investment (${(own * 100).toFixed(0)}% share)`, [{ account: 'PPE', debit: assets }, { account: 'Cash', credit: assets }], 'investing');
        }
        p.mode = cd.entryMode;
        p.scale = cd.entryScale;
        p.partnerId = partner?.id ?? null;
        p.ownershipPct = own;
        p.status = 'pending';
        p.activationRound = round + rule.leadRounds;
        p.localAssets = assets;
        p.goodwill = cd.entryMode === 'acquisition' ? round2((partner?.feeOrMargin ?? 3_200_000) * m - assets) : 0;
        msg(co.id, `${c}: ${rule.label} started – active from round ${p.activationRound}.`);
      } else if (cd.entryAction === 'exit' && (p.status === 'active' || p.status === 'pending')) {
        const localLots = co.inventory.filter((l) => l.location === c);
        const invValue = sum(localLots.map((l) => l.qty * l.unitCost));
        const recovered = invValue * 0.3 + p.localAssets * 0.5;
        const intangibleShare = p.goodwill;
        B.post('exit', `${c} market exit – liquidation`, [
          { account: 'Cash', debit: recovered },
          { account: 'RiskLoss', debit: invValue + p.localAssets + intangibleShare - recovered },
          { account: 'Inventory', credit: invValue }, { account: 'PPE', credit: p.localAssets }, { account: 'Intangibles', credit: intangibleShare },
        ], 'investing');
        localLots.forEach((l) => (l.qty = 0));
        const brand = p.brand;
        co.countries[c] = { ...emptyPresence(), status: 'exited', brand: brand * 0.6, receivables: p.receivables };
        msg(co.id, `${c}: exited market; recovered $${Math.round(recovered).toLocaleString()}.`);
      }
      const pp = co.countries[c];
      if (pp.status === 'pending' && pp.activationRound !== null && pp.activationRound <= round) {
        const rule = MODE_RULES[pp.mode!];
        const partner = sc.partners.find((x) => x.id === pp.partnerId);
        const m = SCALE_MULT[pp.scale];
        pp.status = 'active';
        pp.coverage = clamp((partner?.coverageBoost ?? 0.15) * (0.6 + 0.4 * m), 0, rule.coverageMax);
        pp.localCapacity = Math.round(rule.localCapacity * m);
        if (pp.mode === 'acquisition') { pp.brand = Math.max(pp.brand, 45); pp.awareness = Math.max(pp.awareness, 40); pp.trust = 60; }
        msg(co.id, `${c}: ${rule.label} is now ACTIVE.`);
      }
      // Label localisation (one-off compliance cost per SKU & country)
      for (const [k, v] of Object.entries(cd.labelLocalize)) {
        if (v && !pp.labelLocalized[k]) {
          pp.labelLocalized[k] = true;
          B.post('label', `${c} label/regulatory dossier for ${k}`, [{ account: 'RnD', debit: COSTS.labelLocalizeFee }, { account: 'Cash', credit: COSTS.labelLocalizeFee }]);
        }
      }
    }

    // Product versions (R&D lag: a changed formula becomes producible next round)
    for (const sd of d.skus) {
      let sku = co.skus.find((s) => s.id === sd.skuId);
      if (!sku) {
        sku = { id: sd.skuId, name: sd.name, retired: false, versions: [] };
        co.skus.push(sku);
        B.post('sku-new', `New SKU development ${sd.name}`, [{ account: 'RnD', debit: COSTS.newSkuFee }, { account: 'Cash', credit: COSTS.newSkuFee }]);
      }
      sku.name = sd.name;
      sku.retired = !!sd.retire;
      const last = sku.versions[sku.versions.length - 1];
      if (!last || !sameFormula(last.formula, sd.formula) || sd.recertify) {
        if (last) B.post('sku-version', `Reformulation ${sd.name}`, [{ account: 'RnD', debit: COSTS.newVersionFee }, { account: 'Cash', credit: COSTS.newVersionFee }]);
        const vNo = (last?.version ?? 0) + 1;
        sku.versions.push({ id: `${sku.id}:v${vNo}`, version: vNo, formula: { ...sd.formula }, attributes: computeAttributes(sd.formula, co.processMaturity, global.coffeePriceIndex), effectiveRound: round + 1 });
        msg(co.id, `${sd.name}: version v${vNo} created (producible from round ${round + 1}).`);
      }
    }
    // R&D, innovation, QC, maintenance, dual sourcing
    B.post('rnd', 'R&D and innovation budgets', [{ account: 'RnD', debit: d.rdBudget + d.innovationBudget }, { account: 'Cash', credit: d.rdBudget + d.innovationBudget }]);
    B.post('qc', 'Quality testing, maintenance, dual sourcing', [{ account: 'Admin', debit: d.qualityBudget + d.maintenanceBudget + d.dualSourcingSpend }, { account: 'Cash', credit: d.qualityBudget + d.maintenanceBudget + d.dualSourcingSpend }]);
    B.post('overhead', 'Corporate overhead (HQ Vietnam)', [{ account: 'Admin', debit: COSTS.corporateOverhead }, { account: 'Cash', credit: COSTS.corporateOverhead }]);

    // Capacity projects
    for (const pj of co.capacityProjects) if (pj.readyRound === round) { co.vnCapacity += pj.addBoxes; msg(co.id, `Vietnam plant expansion +${pj.addBoxes.toLocaleString()} boxes/qtr is online.`); }
    co.capacityProjects = co.capacityProjects.filter((p) => p.readyRound > round);
    if (d.capacityCapex > 0) {
      const add = Math.floor(d.capacityCapex / global.baseCapacityCostPerBox);
      co.capacityProjects.push({ addBoxes: add, readyRound: round + 2, cost: d.capacityCapex });
      B.post('capex', 'Vietnam plant capacity expansion', [{ account: 'PPE', debit: d.capacityCapex }, { account: 'Cash', credit: d.capacityCapex }], 'investing');
    }

    // Production at Vietnam plant (+ outsourcing)
    const qcMult = 1 - Math.min(0.6, 0.18 * Math.log(1 + d.qualityBudget / 25_000));
    const vnPlantValue = Math.max(1, co.ledger.ppe - sum(COUNTRIES.map((x) => co.countries[x].localAssets)));
    const maintEff = 0.88 + 0.12 * Math.min(1, d.maintenanceBudget / (0.02 * vnPlantValue));
    const capacity = Math.floor(co.vnCapacity * maintEff);
    const coffeeIdx = 100 + (global.coffeePriceIndex - 100) * (1 - Math.min(0.6, 0.3 * Math.log(1 + d.dualSourcingSpend / 50_000)));
    const planned = co.skus.map((s) => ({ s, v: currentVersion(s, round), q: s.retired ? 0 : d.production[s.id] ?? 0 }));
    const plannedTotal = sum(planned.map((x) => (x.v ? x.q : 0)));
    const scale = plannedTotal > capacity ? capacity / plannedTotal : 1;
    if (scale < 1) msg(co.id, `Production scaled to ${(scale * 100).toFixed(0)}% – effective capacity ${capacity.toLocaleString()} boxes (maintenance efficiency ${(maintEff * 100).toFixed(0)}%).`);
    let defectWeighted = 0, producedTotal = 0;
    for (const { s, v, q } of planned) {
      if (!v) continue;
      const defect = v.attributes.defectRate * qcMult;
      const unit = round2(estimateUnitCost(v.formula, coffeeIdx, defect) * (1 - (co.processMaturity - 0.5) * 0.1));
      const own = v.formula.dryingTech === 'freeze' && !co.hasFreezeTech ? 0 : Math.floor(q * scale);
      const out = Math.min(d.outsourcing[s.id] ?? 0, COSTS.outsourcingCap);
      if (own > 0) {
        B.post('production', `Produce ${own.toLocaleString()} × ${s.name}`, [{ account: 'Inventory', debit: own * unit }, { account: 'Cash', credit: own * unit }]);
        addLot(co, { location: 'VN', skuId: s.id, versionId: v.id, qty: own, unitCost: unit });
      }
      if (out > 0) {
        const ou = round2(unit * (1 + COSTS.outsourcingPremium));
        B.post('outsourcing', `Contract manufacturing ${out.toLocaleString()} × ${s.name}`, [{ account: 'Inventory', debit: out * ou }, { account: 'Cash', credit: out * ou }]);
        addLot(co, { location: 'VN', skuId: s.id, versionId: v.id, qty: out, unitCost: ou });
      }
      defectWeighted += defect * (own + out);
      producedTotal += own + out;
    }
    roundStats[co.id].defect = producedTotal ? defectWeighted / producedTotal : 0.04 * qcMult;

    // Local production (JV / greenfield / acquisition plants) – proportional consolidation for JV
    for (const c of COUNTRIES) {
      const p = co.countries[c];
      if (p.status !== 'active' || !p.mode || !MODE_RULES[p.mode].localProduction) continue;
      const cd = d.countries[c];
      const tot = sum(Object.values(cd.localProduction));
      const sc2 = tot > p.localCapacity ? p.localCapacity / tot : 1;
      for (const s of co.skus) {
        const v = currentVersion(s, round);
        const q = Math.floor((cd.localProduction[s.id] ?? 0) * sc2);
        if (!v || q <= 0 || s.retired) continue;
        if (v.formula.dryingTech === 'freeze' && !co.hasFreezeTech) continue;
        const unit = round2((estimateUnitCost(v.formula, coffeeIdx, v.attributes.defectRate * qcMult) * (0.75 + 0.25 * env[c].laborCostIndex / 100) + 0.15) * p.ownershipPct);
        B.post('local-production', `${c} local production ${q.toLocaleString()} × ${s.name}`, [{ account: 'Inventory', debit: q * unit }, { account: 'Cash', credit: q * unit }]);
        addLot(co, { location: c, skuId: s.id, versionId: v.id, qty: q, unitCost: unit });
      }
    }

    // Shipments: departures
    for (const sd of d.shipments) {
      const p = co.countries[sd.country];
      if (!(p.mode && MODE_RULES[p.mode].exports && (p.status === 'active' || p.status === 'pending'))) { msg(co.id, `Shipment to ${sd.country} cancelled – no export entry mode.`); continue; }
      if (env[sd.country].closedModes & MODE_BIT[sd.mode]) { msg(co.id, `Shipment to ${sd.country} by ${sd.mode} cancelled – route closed.`); continue; }
      const route = sc.routes.find((r) => r.country === sd.country && r.mode === sd.mode)!;
      const { taken, cost } = takeFifo(co.inventory, (l) => l.location === 'VN' && l.skuId === sd.skuId, sd.qty);
      const qty = sum(taken.map((t) => t.qty));
      if (qty <= 0) continue;
      if (qty < sd.qty) msg(co.id, `Shipment ${sd.skuId}→${sd.country}: only ${qty.toLocaleString()} of ${sd.qty.toLocaleString()} boxes available.`);
      const svc = SERVICE[sd.service];
      const inc = INCOTERM[sd.incoterm];
      const freight = qty * (route.costPerBox * svc.cost + env[sd.country].carbonTax * (sd.mode === 'air' ? 2 : 1));
      const insurance = sd.insurance === 'none' && sd.incoterm === 'CIF' ? 'basic' : sd.insurance;
      const premium = cost * CARGO_RATE[insurance];
      const importerFee = freight * inc.premium;
      B.post('freight', `Freight ${qty.toLocaleString()} boxes VN→${sd.country} (${sd.mode}/${sd.service}/${sd.incoterm})`, [
        { account: 'Logistics', debit: freight + premium + importerFee }, { account: 'Cash', credit: freight + premium + importerFee },
      ]);
      const delayP = clamp((route.delayProb + env[sd.country].portDelayDays / 200) * svc.delay * inc.delayMult, 0, 0.95);
      const delayed = rng.chance(delayP);
      const lost = rng.chance(route.lossProb * (sd.service === 'economy' ? 1.3 : 1));
      const sh: Shipment = {
        id: `S${round}-${co.shipments.length + 1}`, country: sd.country, lines: taken.map((t) => ({ skuId: t.skuId, versionId: t.versionId, qty: t.qty, unitCost: t.unitCost })),
        mode: sd.mode, service: sd.service, incoterm: sd.incoterm, insurance, departRound: round,
        etaRound: round + route.leadRounds + (delayed ? 1 : 0), status: 'in_transit', freightCost: freight, dutyCost: 0,
      };
      if (delayed) msg(co.id, `Shipment ${sh.id} to ${sd.country} delayed – ETA round ${sh.etaRound}.`);
      if (lost) {
        sh.status = 'lost';
        cargoLoss(co, B, sh, cost, round, `Cargo lost in transit (${sh.id})`, false);
        roundStats[co.id].losses += cost;
        msg(co.id, `Shipment ${sh.id} lost in transit – ${inc.buyerRisk ? 'buyer bears risk under ' + sd.incoterm : 'cargo claim ' + (CARGO_COVER[insurance] ? 'filed' : 'NOT insured')}.`);
      } else {
        // goods leave VN inventory into in-transit (still on our books)
      }
      co.shipments.push(sh);
    }
    pruneLots(co);

    // Arrivals & customs clearance
    const quotaUsed: Record<CountryCode, number> = { CN: 0, JP: 0, US: 0, GB: 0 };
    for (const sh of co.shipments) {
      if (sh.status !== 'in_transit' && sh.status !== 'detained') continue;
      if (sh.etaRound > round) continue;
      const e = env[sh.country];
      const p = co.countries[sh.country];
      const qty = sum(sh.lines.map((l) => l.qty));
      const value = sum(sh.lines.map((l) => l.qty * l.unitCost));
      if (e.importQuota > 0 && quotaUsed[sh.country] + qty > e.importQuota) {
        sh.etaRound = round + 1; sh.status = 'detained';
        msg(co.id, `Shipment ${sh.id} held at ${sh.country} customs – import quota reached.`);
        continue;
      }
      const compliant = sh.lines.every((l) => p.labelLocalized[l.skuId]);
      const detainP = clamp((compliant ? 0.03 : 0.6) * (e.regulatoryEnforcement / 100) * INCOTERM[sh.incoterm].detentionMult, 0, 0.95);
      if (sh.status === 'in_transit' && rng.chance(detainP)) {
        const fine = value * 0.03;
        B.post('detention', `${sh.country} customs detention fine (${sh.id})`, [{ account: 'Admin', debit: fine }, { account: 'Cash', credit: fine }]);
        sh.etaRound = round + 1; sh.status = 'detained';
        msg(co.id, `Shipment ${sh.id} detained by ${sh.country} customs${compliant ? '' : ' – label not localized/compliant'}; released next round.`);
        continue;
      }
      // Customs value on a CIF basis, duty borne per Incoterm (charged back with premium when importer pays)
      const customsValue = value + sh.freightCost;
      const duty = customsValue * e.importTariff * (1 + (sh.incoterm === 'DDP' ? 0 : 0.05)) + (sh.incoterm === 'DDP' ? qty * 0.02 : 0);
      sh.dutyCost = duty;
      B.post('duty', `${sh.country} import duty & clearance (${sh.id})`, [{ account: 'Tariffs', debit: duty }, { account: 'Cash', credit: duty }]);
      quotaUsed[sh.country] += qty;
      for (const l of sh.lines) addLot(co, { location: sh.country, skuId: l.skuId, versionId: l.versionId, qty: l.qty, unitCost: l.unitCost });
      sh.status = 'delivered';
    }

    // Political-risk insurance premiums (cover effective from next round when newly bought)
    for (const c of COUNTRIES) {
      const p = co.countries[c];
      const tier = d.countries[c].politicalPolicy;
      if (p.status !== 'active' && p.status !== 'pending') { p.politicalPolicy = null; continue; }
      if (tier === 'none') { p.politicalPolicy = null; continue; }
      const exposure = 200_000 + p.localAssets + sum(co.inventory.filter((l) => l.location === c).map((l) => l.qty * l.unitCost));
      const prem = Math.max(POLICY[tier].min, exposure * POLICY[tier].rate);
      B.post('pri-premium', `${c} political-risk insurance (${tier})`, [{ account: 'Admin', debit: prem }, { account: 'Cash', credit: prem }]);
      if (!p.politicalPolicy || p.politicalPolicy.tier !== tier) p.politicalPolicy = { tier, activeFrom: round + 1 };
    }
  }

  // Realised event losses (exposure × severity, mitigated only by policies effective BEFORE the event – T-13/T-14)
  for (const ev of fired) {
    const t = sc.events.find((x) => x.id === ev.templateId)!;
    if (!t.destroysExposure) continue;
    const targets = t.scope === 'global' ? COUNTRIES : [t.country!];
    for (const co of game.companies) {
      if (co.status === 'bankrupt') continue;
      const B = books[co.id];
      for (const c of targets) {
        const p = co.countries[c];
        const frac = t.severity / 100;
        let loss = 0;
        for (const l of co.inventory.filter((x) => x.location === c)) {
          const q = Math.floor(l.qty * frac);
          loss += q * l.unitCost;
          l.qty -= q;
        }
        const assetLoss = p.localAssets * frac * 0.5;
        p.localAssets -= assetLoss;
        loss += assetLoss;
        // in-transit cargo to the country
        for (const sh of co.shipments.filter((s) => s.country === c && (s.status === 'in_transit' || s.status === 'detained'))) {
          let v = 0;
          sh.lines.forEach((l) => { const keep = Math.floor(l.qty * (1 - frac)); v += (l.qty - keep) * l.unitCost; l.qty = keep; });
          cargoLoss(co, B, sh, v, round, `War/political loss in transit (${sh.id})`, true);
          roundStats[co.id].losses += v;
        }
        if (loss <= 0) continue;
        roundStats[co.id].losses += loss;
        const invPart = loss - assetLoss;
        B.post('event-loss', `${ev.name}: destroyed stock/assets in ${c}`, [{ account: 'RiskLoss', debit: loss }, { account: 'Inventory', credit: invPart }, { account: 'PPE', credit: assetLoss }]);
        const pol = p.politicalPolicy;
        if (pol && pol.activeFrom <= round) {
          const rule = POLICY[pol.tier];
          const claim = Math.min(rule.limit, Math.max(0, loss * rule.cover - rule.deductible));
          if (claim > 0) {
            B.post('pri-claim', `${c} political-risk claim accepted (${pol.tier})`, [{ account: 'AR', debit: claim }, { account: 'InsuranceRecovery', credit: claim }]);
            co.claims.push({ dueRound: round + 1, amount: round2(claim), memo: `PRI claim ${c}` });
            messages[co.id] = [...(messages[co.id] ?? []), `${c}: ${ev.name} destroyed $${Math.round(loss).toLocaleString()}; insurer pays $${Math.round(claim).toLocaleString()} next round.`];
          }
        } else {
          messages[co.id] = [...(messages[co.id] ?? []), `${c}: ${ev.name} destroyed $${Math.round(loss).toLocaleString()} of uninsured stock/assets${pol ? ' (policy not yet effective)' : ''}.`];
        }
        pruneLots(co);
      }
    }
  }

  // 9. Marketing state (brand memory, awareness, channel coverage) – this quarter's spend counts now
  const effAdsMap: Record<string, Record<CountryCode, number>> = {};
  const localization: Record<string, Record<CountryCode, number>> = {};
  for (const co of game.companies) {
    const d = decisions[co.id];
    const B = books[co.id];
    effAdsMap[co.id] = { CN: 0, JP: 0, US: 0, GB: 0 };
    localization[co.id] = { CN: 0, JP: 0, US: 0, GB: 0 };
    for (const c of COUNTRIES) {
      const p = co.countries[c];
      const cd = d.countries[c];
      const e = env[c];
      const research = COSTS.research[cd.researchTier];
      if (research > 0 && co.status === 'active') B.post('research', `${c} market research (${cd.researchTier})`, [{ account: 'Marketing', debit: research }, { account: 'Cash', credit: research }]);
      if ((p.status !== 'active' && p.status !== 'pending') || co.status === 'bankrupt') {
        p.awareness *= 0.7; p.brand *= 0.95; p.coverage = 0;
        continue;
      }
      const rule = MODE_RULES[p.mode!];
      const partner = sc.partners.find((x) => x.id === p.partnerId);
      const adTotal = sum(Object.values(cd.ads));
      const mkt = adTotal + cd.localizationBudget + cd.tradeSpend + cd.serviceBudget;
      B.post('marketing', `${c} advertising, localization, trade & service`, [{ account: 'Marketing', debit: mkt }, { account: 'Cash', credit: mkt }]);
      const staff = COSTS.staff[cd.salaryPolicy] + cd.trainingBudget + rule.fixedCostPerRound * (p.mode === 'jv' ? p.ownershipPct : 1);
      B.post('country-admin', `${c} local staff, training & ${rule.label} fixed costs`, [{ account: 'Admin', debit: staff }, { account: 'Cash', credit: staff }]);
      const anyLabel = Object.values(p.labelLocalized).some(Boolean) ? 0.15 : 0;
      const loc = clamp(anyLabel + 0.85 * (Math.log(1 + cd.localizationBudget / 15_000) / Math.log(9)), 0, 1);
      localization[co.id][c] = loc;
      let eff = 0;
      for (const ch of Object.keys(cd.ads) as (keyof typeof cd.ads)[]) {
        eff += cd.ads[ch] * e.channelEffect[ch] * (ch === 'offline' ? 1 : 0.3 + 0.7 * e.digitalPenetration / 100);
      }
      eff *= (0.7 + 0.3 * loc) * rule.brandMult;
      effAdsMap[co.id][c] = eff;
      p.awareness = clamp(p.awareness * 0.7 + 16 * Math.log(1 + eff / 40_000), 0, 100);
      p.brand = clamp(p.brand * 0.9 + 4.5 * Math.log(1 + eff / 60_000) + 0.08 * (p.satisfaction - 50), 0, 100);
      if (p.status === 'active') {
        const chanCap = clamp((cd.ecommerce ? 0.45 * e.digitalPenetration / 100 : 0) + (cd.retail ? 0.6 : 0), 0, 1);
        const maxCov = rule.coverageMax * chanCap;
        const growth = (0.04 + 0.06 * Math.log(1 + cd.tradeSpend / 40_000) + (cd.retailerMargin - 0.25) * 0.4 + (cd.creditDays / 90) * 0.04) * rule.coverageMult * (0.7 + 0.3 * (partner?.quality ?? 0.8));
        p.coverage = clamp(p.coverage + growth - (cd.tradeSpend > 0 ? 0 : 0.03), 0.01, maxCov);
      }
    }
  }

  // 10–11. Consumer choice & allocation per country
  const countryResults: CountryResult[] = [];
  const segmentResults: SegmentResult[] = [];
  const positions: PositionSnapshot[] = [];
  const salesBy: Record<string, Record<CountryCode, { boxes: number; demand: number; rev: number; eqPriceW: number; pqW: number; segSales: Record<SegmentId, number> }>> = {};
  for (const co of game.companies) {
    salesBy[co.id] = {} as typeof salesBy[string];
    for (const c of COUNTRIES) salesBy[co.id][c] = { boxes: 0, demand: 0, rev: 0, eqPriceW: 0, pqW: 0, segSales: { budget: 0, mainstream: 0, premium: 0, health: 0 } };
  }
  for (const c of COUNTRIES) {
    const e = env[c];
    const offers: Offer[] = [];
    for (const co of game.companies) {
      if (co.status === 'bankrupt') continue;
      const p = co.countries[c];
      if (p.status !== 'active' || !p.mode) continue;
      const cd = decisions[co.id].countries[c];
      const rule = MODE_RULES[p.mode];
      const partner = sc.partners.find((x) => x.id === p.partnerId);
      const offeredSkus = co.skus.filter((s) => !s.retired && cd.offered[s.id] && (cd.prices[s.id] ?? 0) > 0);
      for (const s of offeredSkus) {
        let attrs = null as null | ReturnType<typeof computeAttributes>;
        let stock = 0;
        let qualityAdj = 1;
        if (rule.licensed) {
          const v = currentVersion(s, round);
          if (!v) continue;
          attrs = v.attributes;
          stock = Math.floor(p.localCapacity / offeredSkus.length);
          qualityAdj = 0.85 + 0.15 * (partner?.quality ?? 0.7);
        } else {
          const lots = co.inventory.filter((l) => l.location === c && l.skuId === s.id && l.qty > 0);
          stock = sum(lots.map((l) => l.qty));
          if (stock <= 0) continue;
          attrs = versionById(co, lots[0].versionId)!.attributes;
        }
        offers.push({
          key: `${co.id}|${s.id}`, companyId: co.id, skuId: s.id, attrs, price: cd.prices[s.id], promoRate: cd.promotionRate,
          promoKind: cd.promotionKind, brand: p.brand, awareness: p.awareness, coverage: p.coverage, trust: p.trust,
          localization: localization[co.id][c], messageTheme: cd.messageTheme, targetSegments: cd.targetSegments, qualityAdj, stock,
        });
      }
    }
    const pot = {} as Record<SegmentId, number>;
    for (const s of SEGMENTS) pot[s] = potential(c, s);
    const alloc = allocate(offers, e.segments, pot, e);
    for (const o of offers) {
      const co = game.companies.find((x) => x.id === o.companyId)!;
      const p = co.countries[c];
      const cd = decisions[co.id].countries[c];
      const rule = MODE_RULES[p.mode!];
      const partner = sc.partners.find((x) => x.id === p.partnerId);
      const B = books[co.id];
      const sold = sum(SEGMENTS.map((s) => alloc.sales[o.key][s]));
      const dem = sum(SEGMENTS.map((s) => alloc.demand[o.key][s]));
      const agg = salesBy[co.id][c];
      for (const seg of e.segments) {
        const u = alloc.utilities[o.key][seg.id];
        segmentResults.push({ companyId: co.id, country: c, segment: seg.id, skuId: o.skuId, demand: Math.round(alloc.demand[o.key][seg.id]), sales: alloc.sales[o.key][seg.id], utility: round2(u.u), fit: round2(u.fit) });
        agg.segSales[seg.id] += alloc.sales[o.key][seg.id];
        const pq = 0.3 * o.attrs.qualityIndex * o.qualityAdj + 0.3 * u.fit + 0.15 * o.attrs.packagingScore + 0.15 * p.trust + 0.1 * p.satisfaction;
        agg.pqW += pq * alloc.sales[o.key][seg.id];
      }
      agg.boxes += sold;
      agg.demand += dem;
      agg.eqPriceW += equivalentPrice(o) * sold;
      if (dem - sold > 1) roundStats[co.id].stockouts[c] += dem - sold;
      if (sold <= 0) continue;
      // Revenue: consumer price → net of promotion, VAT, retailer margin, intermediary margin; to USD
      const discount = clamp(cd.promotionRate, 0, 0.3) * ({ price_cut: 1, coupon: 0.7, bundle: 0.8, loyalty: 0.5 } as const)[cd.promotionKind];
      const netLocal = (cd.prices[o.skuId] * (1 - discount)) / (1 + e.vat) * (1 - cd.retailerMargin);
      const fx = game.fx[e.currency];
      if (rule.licensed) {
        const royaltyRate = partner?.feeOrMargin ?? 0.07;
        const royalty = (sold * netLocal * royaltyRate) / fx;
        B.post('royalty', `${c} ${rule.label} royalties on ${sold.toLocaleString()} licensee boxes`, [{ account: 'Cash', debit: royalty }, { account: 'RoyaltyIncome', credit: royalty }]);
        agg.rev += royalty;
        continue;
      }
      const intermediary = p.mode === 'indirect_export' ? partner?.feeOrMargin ?? 0.2 : 0;
      const own = p.mode === 'jv' ? p.ownershipPct : 1;
      const revLocal = sold * netLocal * (1 - intermediary) * own;
      const revUsd = revLocal / fx;
      const { cost } = takeFifo(co.inventory, (l) => l.location === c && l.skuId === o.skuId, sold);
      const credit = cd.creditDays / 90;
      const cashNow = revUsd * (1 - credit);
      const onCredit = revUsd - cashNow;
      B.post('sales', `${c} sales ${sold.toLocaleString()} × ${o.skuId}`, [{ account: 'Cash', debit: cashNow }, { account: 'AR', debit: onCredit }, { account: 'Revenue', credit: revUsd }]);
      B.post('cogs', `${c} cost of goods sold ${o.skuId}`, [{ account: 'COGS', debit: cost }, { account: 'Inventory', credit: cost }]);
      if (onCredit > 0) {
        const bad = onCredit * 0.015 * (cd.creditDays / 30);
        p.receivables.push({ dueRound: round + 1, amount: round2(onCredit - bad) });
        B.post('bad-debt', `${c} expected bad debts`, [{ account: 'Admin', debit: bad }, { account: 'AR', credit: bad }]);
      }
      // FX hedge: forward locked at last quarter's spot on the hedged fraction (T-15)
      if (e.currency !== 'USD' && cd.hedgeRatio > 0) {
        const hedgedLocal = revLocal * cd.hedgeRatio;
        const locked = prevFx[e.currency];
        const gain = hedgedLocal / locked - hedgedLocal / fx;
        const fee = (hedgedLocal / fx) * 0.004;
        B.post('fx-hedge', `${c} forward settlement on ${(cd.hedgeRatio * 100).toFixed(0)}% of ${e.currency} receipts`, gain - fee >= 0
          ? [{ account: 'Cash', debit: gain - fee }, { account: 'FXGainLoss', credit: gain - fee }]
          : [{ account: 'FXGainLoss', debit: fee - gain }, { account: 'Cash', credit: fee - gain }]);
      }
      agg.rev += revUsd;
    }
    pruneLotsAll(game);
  }

  // Market shares, positioning (derived; NEVER fed back into utility – T-06)
  for (const c of COUNTRIES) {
    const totalBoxes = sum(game.companies.map((co) => salesBy[co.id][c].boxes));
    const totalRev = sum(game.companies.map((co) => salesBy[co.id][c].rev));
    const refPrice = totalBoxes > 0 ? sum(game.companies.map((co) => salesBy[co.id][c].eqPriceW)) / totalBoxes
      : env[c].segments.find((s) => s.id === 'mainstream')!.referencePrice;
    const avgPQ = totalBoxes > 0 ? sum(game.companies.map((co) => salesBy[co.id][c].pqW)) / totalBoxes : 60;
    for (const co of game.companies) {
      const a = salesBy[co.id][c];
      const p = co.countries[c];
      const volumeShare = totalBoxes > 0 ? a.boxes / totalBoxes : 0;
      countryResults.push({
        companyId: co.id, country: c, salesBoxes: a.boxes, demandBoxes: Math.round(a.demand), stockouts: Math.round(roundStats[co.id].stockouts[c]),
        revenueUSD: round2(a.rev), volumeShare, revenueShare: totalRev > 0 ? a.rev / totalRev : 0,
        brand: round2(p.brand), coverage: round2(p.coverage * 100) / 100, satisfaction: round2(p.satisfaction),
      });
      if (a.boxes <= 0) { positions.push({ companyId: co.id, country: c, rpi: 0, perceivedQuality: 0, perceivedValue: 0, label: 'Not present', volumeShare: 0 }); continue; }
      const rpi = ((a.eqPriceW / a.boxes) / refPrice) * 100;
      const pq = a.pqW / a.boxes;
      const pv = pq / (rpi / 100);
      const maxSeg = Math.max(...SEGMENTS.map((s) => a.segSales[s]));
      const topSeg = SEGMENTS.find((s) => a.segSales[s] === maxSeg)!;
      const segTotal = sum(game.companies.map((x) => salesBy[x.id][c].segSales[topSeg]));
      let label: PositionLabel;
      if (maxSeg / a.boxes >= 0.6 && segTotal > 0 && maxSeg / segTotal >= 0.3 && volumeShare < 0.25) label = 'Niche Specialist';
      else if (rpi >= 115) label = pq >= avgPQ + 3 ? 'Premium' : 'Overpriced';
      else if (rpi <= 88) label = pq >= avgPQ ? 'Value for Money' : 'Economy';
      else if (pq >= avgPQ + 8) label = 'Value for Money';
      else if (pq <= avgPQ - 8) label = 'Overpriced';
      else label = 'Mainstream';
      positions.push({ companyId: co.id, country: c, rpi: round2(rpi), perceivedQuality: round2(pq), perceivedValue: round2(pv), label, volumeShare });
    }
  }

  // 12–13. Closing: satisfaction/trust learning, inventory holding, depreciation, interest, FX, tax, dividends
  for (const co of game.companies) {
    const d = decisions[co.id];
    const B = books[co.id];
    const vnd = game.fx.VND;
    if (co.status === 'bankrupt') {
      // In administration: operations frozen, books carried unchanged.
      co.history.push({ round, income: B.close(), cashFlow: B.cashFlowStatement(), balance: { ...co.ledger }, score: 0, scoreParts: {}, strategyInferred: 'In administration', messages: ['Company is in administration.'] });
      continue;
    }
    if (co.status === 'active') {
      for (const c of COUNTRIES) {
        const p = co.countries[c];
        if (p.status !== 'active') continue;
        const cd = d.countries[c];
        const a = salesBy[co.id][c];
        const stockoutRate = a.demand > 0 ? Math.max(0, (a.demand - a.boxes) / a.demand) : 0;
        const firstLot = co.inventory.find((l) => l.location === c);
        const q = firstLot ? versionById(co, firstLot.versionId)?.attributes.qualityIndex ?? 60 : currentVersion(co.skus[0], round)?.attributes.qualityIndex ?? 60;
        const hr = ({ low: -5, standard: 0, high: 5 } as const)[cd.salaryPolicy] + 3 * Math.log(1 + cd.trainingBudget / 20_000);
        const sat = clamp(50 + (q - 60) * 0.6 + 6 * Math.log(1 + cd.serviceBudget / 20_000) + hr - roundStats[co.id].defect * 400 - stockoutRate * 25 + (cd.promotionKind === 'loyalty' && cd.promotionRate > 0 ? 4 : 0), 0, 100);
        p.satisfaction = round2(p.satisfaction * 0.4 + sat * 0.6);
        p.trust = round2(clamp(p.trust * 0.75 + p.satisfaction * 0.25, 0, 100));
      }
      // Inventory holding & 3PL warehousing
      const localBoxes = sum(co.inventory.filter((l) => l.location !== 'VN').map((l) => l.qty));
      const holding = co.ledger.inventory * 0.015 + localBoxes * 0.04;
      B.post('holding', 'Inventory holding & 3PL warehousing', [{ account: 'Logistics', debit: holding }, { account: 'Cash', credit: holding }]);
    }
    // Depreciation (2.5%/quarter of PPE; local facilities proportionally)
    const dep = co.ledger.ppe * 0.025;
    if (dep > 0) {
      B.post('depreciation', 'Depreciation of plant & facilities', [{ account: 'Depreciation', debit: dep }, { account: 'PPE', credit: dep }]);
      for (const c of COUNTRIES) co.countries[c].localAssets = round2(co.countries[c].localAssets * 0.975);
    }
    // Interest & VND debt revaluation
    for (const loan of co.loans) {
      const usd = loanUsd(loan, vnd);
      const interest = usd * loan.annualRate / 4;
      B.post('interest', `Interest ${loan.id} (${(loan.annualRate * 100).toFixed(1)}%/yr)`, [{ account: 'Interest', debit: interest }, { account: 'Cash', credit: interest }]);
    }
    // Tax with loss carry-forward (single simplified home regime)
    const pre = B.preTax();
    let taxable = pre;
    if (taxable > 0 && co.taxLossCarry > 0) { const use = Math.min(taxable, co.taxLossCarry); taxable -= use; co.taxLossCarry -= use; }
    else if (taxable < 0) co.taxLossCarry += -taxable;
    if (taxable > 0) {
      const tax = taxable * global.vnCorporateTax;
      B.post('tax', 'Corporate income tax', [{ account: 'Tax', debit: tax }, { account: 'Cash', credit: tax }]);
    }
    const income = B.close();
    if (d.dividend > 0 && co.ledger.retainedEarnings > 0 && co.status === 'active') {
      const div = Math.min(d.dividend, co.ledger.retainedEarnings, Math.max(0, co.ledger.cash));
      B.post('dividend', 'Dividend to shareholders', [{ account: 'RetainedEarnings', debit: div }, { account: 'Cash', credit: div }], 'financing');
    }
    // Liquidity: emergency overdraft, then insolvency test (no silent negative cash)
    if (co.ledger.cash < 0) {
      const need = -co.ledger.cash + 50_000;
      co.loans.push({ id: `EMG${round}`, currency: 'USD', principalLocal: need, outstandingLocal: need, carryingUsd: round2(need), annualRate: global.usdInterestRate + 0.08, maturityRound: round + 2, emergency: true });
      B.post('emergency-loan', 'Emergency overdraft facility (penalty rate)', [{ account: 'Cash', debit: need }, { account: 'Debt', credit: need }], 'financing');
      (messages[co.id] ??= []).push(`Cash went negative – emergency loan of $${Math.round(need).toLocaleString()} at penalty rate.`);
    }
    const assets = totalAssets(co.ledger);
    if (co.status === 'active' && (co.ledger.debt > assets * 0.95 || co.ledger.equityCapital + co.ledger.retainedEarnings < -1_000_000)) {
      co.status = 'bankrupt';
      (messages[co.id] ??= []).push('INSOLVENT: liabilities exceed recoverable assets. The company enters administration.');
    }
    co.cumulativeNetIncome = round2(co.cumulativeNetIncome + (isScored(game, round) ? income.netIncome : 0));

    // R&D learning, innovation (lagged tech), research reports
    co.rdStock = co.rdStock * 0.9 + d.rdBudget;
    co.processMaturity = round2(clamp(0.5 + 0.12 * Math.log(1 + co.rdStock / 150_000), 0, 1) * 1000) / 1000;
    co.freezeTechProgress += d.innovationBudget;
    if (!co.hasFreezeTech && co.freezeTechProgress >= COSTS.freezeTechThreshold) {
      co.hasFreezeTech = true;
      (messages[co.id] ??= []).push('Freeze-drying technology commissioned – available from next round.');
    }
    for (const c of COUNTRIES) {
      const tier = d.countries[c].researchTier;
      if (tier === 'none' || co.status !== 'active') continue;
      co.research.push(makeResearch(game, co.id, c, tier, round, salesBy));
    }
    co.research = co.research.slice(-16);

    const cf = B.cashFlowStatement();
    co.history.push({
      round, income, cashFlow: cf, balance: { ...co.ledger }, score: 0, scoreParts: {},
      strategyInferred: '', messages: messages[co.id] ?? [], decision: d,
    });
  }

  // 14. Scores & inferred strategy
  const leaderboard = computeLeaderboard(game, [...game.results, { countryResults } as RoundResult], round);
  for (const co of game.companies) {
    const h = co.history[co.history.length - 1];
    const lb = leaderboard.find((l) => l.companyId === co.id)!;
    h.score = lb.score;
    h.scoreParts = lb.parts;
    h.strategyInferred = inferStrategy(co, positions.filter((p) => p.companyId === co.id), countryResults.filter((r) => r.companyId === co.id));
  }

  // 15. Invariants (T-11, T-16)
  const journal = Object.values(books).flatMap((b) => b.entries);
  for (const e of journal) if (!entryBalanced(e)) throw new Error(`Invariant: unbalanced entry ${e.source}`);
  for (const co of game.companies) {
    if (Math.abs(co.ledger.debt - sum(co.loans.map((l) => l.carryingUsd))) > 1) throw new Error(`Invariant: debt sub-ledger mismatch for ${co.name}`);
    if (Math.abs(balanceGap(co.ledger)) > 1) throw new Error(`Invariant: balance sheet of ${co.name} off by ${balanceGap(co.ledger)}`);
    if (co.inventory.some((l) => l.qty < 0)) throw new Error('Invariant: negative inventory');
    const invBook = sum(co.inventory.map((l) => l.qty * l.unitCost)) + sum(co.shipments.filter((s) => s.status === 'in_transit' || s.status === 'detained').flatMap((s) => s.lines.map((l) => l.qty * l.unitCost)));
    co.ledger.inventory = round2(co.ledger.inventory); // books already moved; sanity
    if (Math.abs(invBook - co.ledger.inventory) > Math.max(5, invBook * 0.001)) {
      // reconcile rounding drift (FIFO cents) – tiny differences only
      throw new Error(`Invariant: inventory sub-ledger ${invBook.toFixed(2)} ≠ GL ${co.ledger.inventory.toFixed(2)} for ${co.name}`);
    }
  }
  for (const c of COUNTRIES) {
    const sold = sum(countryResults.filter((r) => r.country === c).map((r) => r.salesBoxes));
    const pot = sum(SEGMENTS.map((s) => potential(c, s)));
    if (sold > pot + 1) throw new Error(`Invariant: ${c} sales exceed market potential`);
  }

  // Housekeeping
  for (const co of game.companies) co.shipments = co.shipments.filter((s) => s.status === 'in_transit' || s.status === 'detained' || s.departRound >= round - 1);

  const result: RoundResult = {
    round, seed, engineVersion: ENGINE_VERSION, inputHash, outputHash: '',
    events: fired, marketSize: Object.fromEntries(COUNTRIES.map((c) => [c, sum(SEGMENTS.map((s) => potential(c, s)))])) as Record<CountryCode, number>,
    fx: { ...game.fx }, countryResults, segmentResults, positions, leaderboard, journal,
  };
  result.outputHash = hashHex({ countryResults, positions, leaderboard, companies: game.companies.map((c) => c.ledger) });
  game.results.push(result);
  game.audit.push({ at: new Date(0).toISOString(), round, actor: 'engine', event: 'ROUND_PROCESSED', detail: `in ${inputHash} out ${result.outputHash}` });

  // Advance
  if (round === sc.practiceRounds && sc.practiceRounds > 0) resetAfterPractice(game);
  if (round >= totalRounds(game)) {
    game.phase = 'FINISHED';
  } else {
    game.round = round + 1;
    game.phase = 'OPEN';
    for (const co of game.companies) game.decisions[co.id] = carryForward(decisions[co.id], co, sc, game.round);
  }
  game.activeEvents = game.activeEvents.filter((e) => e.untilRound > round);
  refreshEnvironment(game);
  return { game, result };
}

function pruneLotsAll(game: GameState) {
  for (const co of game.companies) pruneLots(co);
}

/** Cargo loss in transit: who bears it depends on Incoterm; insurer pays covered share next round. */
function cargoLoss(co: CompanyState, B: Books, sh: Shipment, value: number, round: number, memo: string, warRisk: boolean) {
  if (value <= 0) return;
  const inc = INCOTERM[sh.incoterm];
  if (inc.buyerRisk) {
    // Risk passed to buyer at loading: buyer pays for lost goods
    B.post('cargo-buyer', `${memo} – buyer bears risk (${sh.incoterm})`, [{ account: 'AR', debit: value }, { account: 'Inventory', credit: value }]);
    co.claims.push({ dueRound: round + 1, amount: round2(value), memo: `Buyer reimbursement ${sh.id}` });
    return;
  }
  B.post('cargo-loss', memo, [{ account: 'RiskLoss', debit: value }, { account: 'Inventory', credit: value }]);
  const cover = warRisk ? (sh.insurance === 'comprehensive' ? 1 : 0) : CARGO_COVER[sh.insurance];
  const claim = Math.max(0, value * cover - value * 0.02);
  if (claim > 0) {
    B.post('cargo-claim', `Cargo insurance claim ${sh.id}`, [{ account: 'AR', debit: claim }, { account: 'InsuranceRecovery', credit: claim }]);
    co.claims.push({ dueRound: round + 1, amount: round2(claim), memo: `Cargo claim ${sh.id}` });
  }
}

/** Cancel one-off actions that failed validation (server-authoritative; never trust the client). */
function neutralise(d: Decision, codes: string[], co: CompanyState, game: GameState): Decision {
  const n = deepClone(d);
  const has = (c: string) => codes.includes(c);
  if (has('BOM_INVALID') || has('DUPLICATE_SKU') || has('SKU_LIMIT')) n.skus = co.skus.map((s) => ({ skuId: s.id, name: s.name, formula: { ...latestVersion(s).formula }, retire: s.retired }));
  if (has('OWNERSHIP_CAP') || has('PARTNER_REQUIRED') || has('ALREADY_ENTERED')) for (const c of COUNTRIES) if (n.countries[c].entryAction === 'enter') n.countries[c].entryAction = 'hold';
  if (has('NOT_ENTERED')) for (const c of COUNTRIES) if (n.countries[c].entryAction === 'exit') n.countries[c].entryAction = 'hold';
  if (has('CREDIT_LIMIT')) n.newLoan = 0;
  if (has('REPAY_GT_DEBT')) n.debtRepayment = 0;
  if (has('DIVIDEND')) n.dividend = 0;
  // Invalid shipments are dropped individually; over-shipping is clipped FIFO to available stock at departure.
  n.shipments = n.shipments.filter((s) => {
    const p = co.countries[s.country];
    const cd = n.countries[s.country];
    const mode = p.status === 'active' || p.status === 'pending' ? p.mode : cd.entryAction === 'enter' ? cd.entryMode : null;
    return !!mode && MODE_RULES[mode].exports && !(game.env[s.country].closedModes & MODE_BIT[s.mode]);
  });
  if (has('TECH_MISSING') || has('NO_VERSION') || has('RETIRED') || has('NO_LOCAL_PLANT')) {
    for (const s of co.skus) {
      const v = currentVersion(s, d.round);
      if (!v || s.retired || (v.formula.dryingTech === 'freeze' && !co.hasFreezeTech)) n.production[s.id] = 0;
    }
    for (const c of COUNTRIES) if (!(co.countries[c].status === 'active' && co.countries[c].mode && MODE_RULES[co.countries[c].mode!].localProduction)) n.countries[c].localProduction = {};
  }
  if (has('OUTSOURCE_CAP')) n.outsourcing = {};
  if (has('CASH_OVERRUN')) {
    n.capacityCapex = 0; n.dividend = 0;
    for (const c of COUNTRIES) if (n.countries[c].entryAction === 'enter' && ['jv', 'greenfield', 'acquisition'].includes(n.countries[c].entryMode)) n.countries[c].entryAction = 'hold';
  }
  return n;
}

function makeResearch(game: GameState, companyId: string, c: CountryCode, tier: 'basic' | 'advanced', round: number, salesBy: Record<string, Record<CountryCode, { boxes: number; eqPriceW: number }>>): ResearchReport {
  const rng = Rng.stream(game.seed, round, `research:${companyId}:${c}`);
  const err = tier === 'advanced' ? 0.08 : 0.25;
  const noisy = (x: number, scale = 1) => round2(x * (1 + err * scale * (rng.next() * 2 - 1)));
  const env = game.env[c];
  const others = game.companies.filter((x) => x.id !== companyId);
  const boxes = sum(others.map((o) => salesBy[o.id][c].boxes));
  const avg = boxes > 0 ? sum(others.map((o) => salesBy[o.id][c].eqPriceW)) / boxes : null;
  return {
    round, country: c, tier, errorBand: err,
    segments: env.segments.map((s) => ({
      id: s.id, size: Math.round(noisy(game.marketSize[c][s.id])),
      ideal: {
        flavorStrength: clamp(noisy(s.ideal.flavorStrength, 0.6), 0, 100), smoothness: clamp(noisy(s.ideal.smoothness, 0.6), 0, 100),
        sweetness: clamp(noisy(s.ideal.sweetness, 0.6), 0, 100), aroma: clamp(noisy(s.ideal.aroma, 0.6), 0, 100), healthiness: clamp(noisy(s.ideal.healthiness, 0.6), 0, 100),
      },
      priceSensitivity: noisy(s.w.price), refPrice: noisy(s.referencePrice, 0.5),
    })),
    avgCompetitorPrice: avg === null ? null : noisy(avg, 0.5),
  };
}

/* --------------------------------------------------------------- scoring */

const norm = (x: number, lo: number, hi: number) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);

export function computeLeaderboard(game: GameState, results: Pick<RoundResult, 'countryResults'>[], round: number) {
  const w = game.scenario.scoring;
  // Practice rounds are ranked among themselves; scored rounds only count scored results.
  const inPhase = (r: number) => isScored(game, r) === isScored(game, round) && r <= round;
  const scoredResults = results.filter((_, i) => inPhase(i + 1));
  const totalBoxes = sum(scoredResults.flatMap((r) => r.countryResults.map((x) => x.salesBoxes)));
  const n = game.companies.length;
  const rows = game.companies.map((co) => {
    const boxes = sum(scoredResults.flatMap((r) => r.countryResults.filter((x) => x.companyId === co.id).map((x) => x.salesBoxes)));
    const share = totalBoxes > 0 ? boxes / totalBoxes : 0;
    const L = co.ledger;
    const invested = L.equityCapital + Math.max(L.debt, 0);
    const cumNI = sum(co.history.filter((h) => inPhase(h.round)).map((h) => h.income.netIncome));
    const roic = cumNI / Math.max(1, invested);
    const brand = sum(COUNTRIES.map((c) => co.countries[c].brand)) / COUNTRIES.length;
    const assets = totalAssets(L);
    const eqRatio = assets > 0 ? (L.equityCapital + L.retainedEarnings) / assets : 0;
    const parts = {
      profit: norm(cumNI, -2_000_000, 4_000_000),
      share: norm(share, 0, 2 / Math.max(1, n)),
      roic: norm(roic, -0.3, 0.5),
      brand: norm(brand, 0, 60),
      resilience: co.status === 'bankrupt' ? 0 : 0.6 * norm(eqRatio, 0, 1) + 0.4 * norm(L.cash, 0, 500_000),
    };
    const score = round2(parts.profit * w.profit + parts.share * w.share + parts.roic * w.roic + parts.brand * w.brand + parts.resilience * w.resilience);
    return { companyId: co.id, score, rank: 0, cumNetIncome: round2(cumNI), practice: !isScored(game, round), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round2(v)])) };
  });
  rows.sort((a, b) => b.score - a.score || a.companyId.localeCompare(b.companyId));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function inferStrategy(co: CompanyState, pos: PositionSnapshot[], res: CountryResult[]): string {
  const present = pos.filter((p) => p.label !== 'Not present');
  if (!present.length) return 'Not yet in market';
  const avgRpi = sum(present.map((p) => p.rpi)) / present.length;
  const premiumish = present.filter((p) => p.label === 'Premium' || p.label === 'Niche Specialist').length;
  const share = sum(res.map((r) => r.salesBoxes)) > 0 ? sum(present.map((p) => p.volumeShare)) / present.length : 0;
  const broad = present.length >= 2;
  if (avgRpi < 95 && share >= 0.2) return broad ? 'Broad Cost Leadership' : 'Focused Cost Leadership';
  if (premiumish >= 1 && avgRpi >= 105) return broad && premiumish >= 2 ? 'Broad Differentiation' : 'Focused Differentiation';
  if (present.some((p) => p.label === 'Value for Money')) return 'Best-cost Provider';
  void co;
  return 'Stuck in the middle';
}

function resetAfterPractice(game: GameState) {
  const sc = game.scenario;
  const { marketSize, fx } = initialMarket(sc);
  game.marketSize = marketSize;
  game.fx = fx;
  game.activeEvents = [];
  game.companies = game.companies.map((c) => {
    const fresh = openingCompany(c.id, { name: c.name, color: c.color, isBot: c.isBot, botStrategy: c.botStrategy }, sc);
    fresh.history = c.history; // keep practice history visible
    fresh.notes = c.notes;
    return fresh;
  });
  game.audit.push({ at: new Date(0).toISOString(), round: game.round, actor: 'engine', event: 'PRACTICE_RESET', detail: 'All companies reset to the identical opening template' });
}

export { decisionsFor };
function decisionsFor(game: GameState, companyId: string): Decision {
  const co = game.companies.find((c) => c.id === companyId)!;
  return game.decisions[companyId] ?? carryForward(undefined, co, game.scenario, game.round);
}
