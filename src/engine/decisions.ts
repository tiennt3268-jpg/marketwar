// Decision defaults, carry-forward, sanitising (derived variables are stripped – T-05/T-06)
// and server-authoritative validation (Decision Dependency Engine, SRS §V; T-03, T-08, T-18).
import { MODE_RULES, SCALE_MULT } from './scenario';
import { computeAttributes, validateFormula, sameFormula } from './product';
import type {
  CompanyState, CountryCode, CountryDecision, Decision, GameState, Scenario, ShipmentDecision, Sku, SkuDecision,
} from './types';
import { COUNTRIES, AD_CHANNELS } from './types';
import { clamp } from './util';

export const COSTS = {
  newVersionFee: 30_000,
  newSkuFee: 60_000,
  labelLocalizeFee: 15_000,
  research: { none: 0, basic: 15_000, advanced: 40_000 },
  corporateOverhead: 70_000,
  staff: { low: 15_000, standard: 25_000, high: 40_000 },
  outsourcingPremium: 0.35,
  outsourcingCap: 150_000,
  freezeTechThreshold: 800_000,
  maxSkus: 5,
};

export function currentVersion(sku: Sku, round: number) {
  const ok = sku.versions.filter((v) => v.effectiveRound <= round);
  return ok.length ? ok[ok.length - 1] : null;
}
export function latestVersion(sku: Sku) {
  return sku.versions[sku.versions.length - 1];
}

export function defaultCountryDecision(c: CountryCode, company: CompanyState, scenario: Scenario): CountryDecision {
  const env = scenario.countries[c];
  const mainstreamRef = env.segments.find((s) => s.id === 'mainstream')!.referencePrice;
  const prices: Record<string, number> = {};
  const offered: Record<string, boolean> = {};
  for (const s of company.skus) { prices[s.id] = Math.round(mainstreamRef * 100) / 100; offered[s.id] = !s.retired; }
  return {
    entryAction: 'hold', entryMode: 'direct_export', entryScale: 'normal', partnerId: null, ownershipPct: 0.5,
    researchTier: 'none', targetSegments: ['mainstream'], prices, offered, promotionRate: 0, promotionKind: 'price_cut',
    ads: { search: 0, social: 0, video: 0, influencer: 0, offline: 0 }, messageTheme: 'origin', localizationBudget: 0,
    tradeSpend: 0, retailerMargin: 0.3, ecommerce: true, retail: true, serviceBudget: 0, creditDays: 30,
    politicalPolicy: 'none', labelLocalize: {}, localProduction: {}, trainingBudget: 0, salaryPolicy: 'standard', hedgeRatio: 0,
  };
}

export function defaultDecision(company: CompanyState, scenario: Scenario, round: number): Decision {
  const countries = {} as Record<CountryCode, CountryDecision>;
  for (const c of COUNTRIES) countries[c] = defaultCountryDecision(c, company, scenario);
  const production: Record<string, number> = {};
  for (const s of company.skus) production[s.id] = 0;
  return {
    round, skus: company.skus.map((s) => ({ skuId: s.id, name: s.name, formula: { ...latestVersion(s).formula }, retire: s.retired })),
    production, outsourcing: {}, rdBudget: 0, qualityBudget: 30_000, innovationBudget: 0, maintenanceBudget: 25_000,
    capacityCapex: 0, dualSourcingSpend: 0, countries, shipments: [], newLoan: 0, loanCurrency: 'USD', loanTermRounds: 8,
    debtRepayment: 0, minCashReserve: 0, dividend: 0, submitted: false, revision: 0,
  };
}

/** Next-round draft: recurring decisions carry forward, one-off actions reset to safe defaults (SRS §3). */
export function carryForward(prev: Decision | undefined, company: CompanyState, scenario: Scenario, round: number): Decision {
  const d = defaultDecision(company, scenario, round);
  if (!prev) return d;
  const next: Decision = JSON.parse(JSON.stringify(prev));
  next.round = round;
  next.submitted = false;
  next.revision = 0;
  next.skus = d.skus; // re-sync with actual SKU list/versions
  next.capacityCapex = 0;
  next.newLoan = 0;
  next.debtRepayment = 0;
  next.dividend = 0;
  for (const s of company.skus) {
    if (next.production[s.id] === undefined) next.production[s.id] = 0;
  }
  for (const c of COUNTRIES) {
    const cd = next.countries[c] ?? d.countries[c];
    cd.entryAction = 'hold';
    cd.labelLocalize = {};
    for (const s of company.skus) {
      if (cd.prices[s.id] === undefined) cd.prices[s.id] = d.countries[c].prices[s.id];
      if (cd.offered[s.id] === undefined) cd.offered[s.id] = !s.retired;
    }
    next.countries[c] = cd;
  }
  return next;
}

const num = (x: unknown, lo: number, hi: number, dflt = 0) => {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : dflt;
  return clamp(n, lo, hi);
};

/**
 * Whitelist-copy a client payload into a Decision. Anything not in the decision schema
 * (e.g. quality_index, market_position_label, market share) is silently dropped (T-05/T-06).
 */
export function sanitizeDecision(raw: unknown, company: CompanyState, scenario: Scenario, round: number): Decision {
  const base = defaultDecision(company, scenario, round);
  const r = (raw ?? {}) as Partial<Decision> & Record<string, unknown>;
  const out: Decision = { ...base };
  const M = 1e9;
  out.rdBudget = num(r.rdBudget, 0, M);
  out.qualityBudget = num(r.qualityBudget, 0, M, base.qualityBudget);
  out.innovationBudget = num(r.innovationBudget, 0, M);
  out.maintenanceBudget = num(r.maintenanceBudget, 0, M, base.maintenanceBudget);
  out.capacityCapex = num(r.capacityCapex, 0, M);
  out.dualSourcingSpend = num(r.dualSourcingSpend, 0, M);
  out.newLoan = num(r.newLoan, 0, M);
  out.loanCurrency = r.loanCurrency === 'VND' ? 'VND' : 'USD';
  out.loanTermRounds = r.loanTermRounds === 2 ? 2 : 8;
  out.debtRepayment = num(r.debtRepayment, 0, M);
  out.minCashReserve = num(r.minCashReserve, 0, M);
  out.dividend = num(r.dividend, 0, M);
  out.submitted = !!r.submitted;
  out.revision = num(r.revision, 0, M);
  out.skus = Array.isArray(r.skus)
    ? (r.skus as SkuDecision[]).slice(0, COSTS.maxSkus).map((s) => ({
        skuId: String(s.skuId).slice(0, 40), name: String(s.name ?? 'SKU').slice(0, 40), formula: { ...s.formula }, retire: !!s.retire, recertify: !!s.recertify,
      }))
    : base.skus;
  const skuIds = new Set([...company.skus.map((s) => s.id), ...out.skus.map((s) => s.skuId)]);
  const perSku = (src: unknown, lo: number, hi: number) => {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries((src ?? {}) as Record<string, unknown>)) if (skuIds.has(k)) o[k] = Math.floor(num(v, lo, hi));
    return o;
  };
  out.production = perSku(r.production, 0, 10_000_000);
  out.outsourcing = perSku(r.outsourcing, 0, COSTS.outsourcingCap);
  out.shipments = Array.isArray(r.shipments)
    ? (r.shipments as ShipmentDecision[]).slice(0, 40).filter((s) => COUNTRIES.includes(s.country) && skuIds.has(s.skuId)).map((s) => ({
        country: s.country, skuId: s.skuId, qty: Math.floor(num(s.qty, 0, 10_000_000)),
        mode: (['sea', 'air', 'multimodal'] as const).includes(s.mode) ? s.mode : 'sea',
        service: (['economy', 'standard', 'express'] as const).includes(s.service) ? s.service : 'standard',
        incoterm: (['EXW', 'FOB', 'CIF', 'DAP', 'DDP'] as const).includes(s.incoterm) ? s.incoterm : 'DAP',
        insurance: (['none', 'basic', 'comprehensive'] as const).includes(s.insurance) ? s.insurance : 'basic',
      }))
    : [];
  const rc = (r.countries ?? {}) as Record<string, Partial<CountryDecision>>;
  for (const c of COUNTRIES) {
    const src = rc[c] ?? {};
    const b = base.countries[c];
    const ads = { ...b.ads };
    for (const ch of AD_CHANNELS) ads[ch] = num(src.ads?.[ch], 0, M);
    const prices: Record<string, number> = { ...b.prices };
    for (const [k, v] of Object.entries(src.prices ?? {})) if (skuIds.has(k)) prices[k] = num(v, 0.01, 1e7, b.prices[k] ?? 1);
    const offered: Record<string, boolean> = { ...b.offered };
    for (const [k, v] of Object.entries(src.offered ?? {})) if (skuIds.has(k)) offered[k] = !!v;
    const labelLocalize: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(src.labelLocalize ?? {})) if (skuIds.has(k)) labelLocalize[k] = !!v;
    out.countries[c] = {
      entryAction: src.entryAction === 'enter' || src.entryAction === 'exit' ? src.entryAction : 'hold',
      entryMode: src.entryMode && src.entryMode in MODE_RULES ? src.entryMode : b.entryMode,
      entryScale: src.entryScale === 'pilot' || src.entryScale === 'aggressive' ? src.entryScale : 'normal',
      partnerId: typeof src.partnerId === 'string' ? src.partnerId : null,
      ownershipPct: num(src.ownershipPct, 0.1, 1, 0.5),
      researchTier: src.researchTier === 'basic' || src.researchTier === 'advanced' ? src.researchTier : 'none',
      targetSegments: Array.isArray(src.targetSegments) ? src.targetSegments.filter((s) => ['budget', 'mainstream', 'premium', 'health'].includes(s)) : b.targetSegments,
      prices, offered,
      promotionRate: num(src.promotionRate, 0, 0.3),
      promotionKind: src.promotionKind && ['price_cut', 'coupon', 'bundle', 'loyalty'].includes(src.promotionKind) ? src.promotionKind : 'price_cut',
      ads,
      messageTheme: src.messageTheme && ['origin', 'value', 'flavor', 'convenience', 'sustainability'].includes(src.messageTheme) ? src.messageTheme : 'origin',
      localizationBudget: num(src.localizationBudget, 0, M),
      tradeSpend: num(src.tradeSpend, 0, M),
      retailerMargin: num(src.retailerMargin, 0, 0.5, 0.3),
      ecommerce: src.ecommerce === undefined ? true : !!src.ecommerce,
      retail: src.retail === undefined ? true : !!src.retail,
      serviceBudget: num(src.serviceBudget, 0, M),
      creditDays: ([0, 30, 60, 90] as const).includes(src.creditDays as 0) ? (src.creditDays as 0 | 30 | 60 | 90) : 30,
      politicalPolicy: src.politicalPolicy === 'basic' || src.politicalPolicy === 'premium' ? src.politicalPolicy : 'none',
      labelLocalize,
      localProduction: perSku(src.localProduction, 0, 10_000_000),
      trainingBudget: num(src.trainingBudget, 0, M),
      salaryPolicy: src.salaryPolicy === 'low' || src.salaryPolicy === 'high' ? src.salaryPolicy : 'standard',
      hedgeRatio: num(src.hedgeRatio, 0, 1),
    };
  }
  return out;
}

export interface ValidationIssue { code: string; field: string; message: string; severity: 'error' | 'warning' }

export function creditLimit(company: CompanyState): number {
  const L = company.ledger;
  const assets = L.cash + L.receivables + L.inventory + L.ppe + L.intangibles;
  return Math.max(0, 1_000_000 + 0.5 * assets - L.debt);
}

export function vnAvailableBySku(company: CompanyState): Record<string, number> {
  const o: Record<string, number> = {};
  for (const l of company.inventory) if (l.location === 'VN') o[l.skuId] = (o[l.skuId] ?? 0) + l.qty;
  return o;
}

/** Rough cash outlay estimate for the plan (used for T-18 validation and the budget panel). */
export function estimateSpend(d: Decision, company: CompanyState, game: GameState): Record<string, number> {
  const sc = game.scenario;
  const g = game.scenario.global;
  const parts: Record<string, number> = {};
  let rnd = d.rdBudget + d.innovationBudget;
  for (const s of d.skus) {
    const existing = company.skus.find((x) => x.id === s.skuId);
    if (!existing) rnd += COSTS.newSkuFee;
    else if (!sameFormula(latestVersion(existing).formula, s.formula) || s.recertify) rnd += COSTS.newVersionFee;
  }
  let production = 0;
  for (const s of company.skus) {
    const v = currentVersion(s, d.round);
    if (!v) continue;
    const unit = computeAttributes(v.formula, company.processMaturity, g.coffeePriceIndex).unitCost;
    production += (d.production[s.id] ?? 0) * unit + (d.outsourcing[s.id] ?? 0) * unit * (1 + COSTS.outsourcingPremium);
  }
  let marketing = 0, admin = d.qualityBudget + d.maintenanceBudget + d.dualSourcingSpend + COSTS.corporateOverhead, entry = 0;
  for (const c of COUNTRIES) {
    const cd = d.countries[c];
    const p = company.countries[c];
    const engaged = p.status === 'active' || p.status === 'pending' || cd.entryAction === 'enter';
    if (engaged) {
      marketing += Object.values(cd.ads).reduce((a, b) => a + b, 0) + cd.localizationBudget + cd.tradeSpend + cd.serviceBudget;
      admin += COSTS.staff[cd.salaryPolicy] + cd.trainingBudget;
    }
    marketing += COSTS.research[cd.researchTier];
    for (const [k, v] of Object.entries(cd.labelLocalize)) if (v && !p.labelLocalized[k]) rnd += COSTS.labelLocalizeFee;
    if (cd.entryAction === 'enter' && (p.status === 'none' || p.status === 'exited')) {
      const rule = MODE_RULES[cd.entryMode];
      const m = SCALE_MULT[cd.entryScale];
      let capex = rule.capex * m;
      if (cd.entryMode === 'jv') capex *= cd.ownershipPct;
      if (cd.entryMode === 'acquisition') {
        const partner = sc.partners.find((x) => x.id === cd.partnerId);
        capex = (partner?.feeOrMargin ?? 3_200_000) * m;
      }
      entry += rule.setupCost * m + capex;
    }
  }
  let freight = 0;
  for (const s of d.shipments) {
    const route = sc.routes.find((r) => r.country === s.country && r.mode === s.mode);
    freight += s.qty * (route?.costPerBox ?? 0) * 1.25;
  }
  parts['R&D & product'] = rnd;
  parts['Production'] = production;
  parts['Marketing & research'] = marketing;
  parts['Admin, QC, HR'] = admin;
  parts['Market entry'] = entry;
  parts['Capacity capex'] = d.capacityCapex;
  parts['Freight & duty (est.)'] = freight;
  parts['Debt repayment'] = d.debtRepayment;
  parts['Dividend'] = d.dividend;
  return parts;
}

export function validateDecision(d: Decision, company: CompanyState, game: GameState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, field: string, message: string) => issues.push({ code, field, message, severity: 'error' });
  const warn = (code: string, field: string, message: string) => issues.push({ code, field, message, severity: 'warning' });
  const sc = game.scenario;
  const env = game.env;
  if (company.status === 'bankrupt') err('BANKRUPT', 'company', 'Company is insolvent; no further decisions can be submitted.');

  // Product / BOM (T-03)
  const ids = new Set<string>();
  for (const s of d.skus) {
    if (ids.has(s.skuId)) err('DUPLICATE_SKU', `skus.${s.skuId}`, 'Duplicate SKU id');
    ids.add(s.skuId);
    for (const e of validateFormula(s.formula)) err('BOM_INVALID', `skus.${s.skuId}`, `${s.name}: ${e}`);
  }
  if (d.skus.filter((s) => !s.retire).length > COSTS.maxSkus) err('SKU_LIMIT', 'skus', `At most ${COSTS.maxSkus} active SKUs`);

  // Production / technology dependency
  const cap = company.vnCapacity;
  const totalProd = Object.values(d.production).reduce((a, b) => a + b, 0);
  if (totalProd > cap * 1.0001) warn('CAPACITY', 'production', `Planned ${totalProd.toLocaleString()} boxes exceeds plant capacity ${cap.toLocaleString()}; output will be scaled down.`);
  const totalOut = Object.values(d.outsourcing).reduce((a, b) => a + b, 0);
  if (totalOut > COSTS.outsourcingCap) err('OUTSOURCE_CAP', 'outsourcing', `Outsourcing contract limit is ${COSTS.outsourcingCap.toLocaleString()} boxes`);
  for (const s of company.skus) {
    const v = currentVersion(s, d.round);
    const q = d.production[s.id] ?? 0;
    if (q > 0 && !v) err('NO_VERSION', `production.${s.id}`, `${s.name} has no producible version this round (R&D lag)`);
    if (q > 0 && v && v.formula.dryingTech === 'freeze' && !company.hasFreezeTech)
      err('TECH_MISSING', `production.${s.id}`, `${s.name} needs freeze-drying technology – invest in innovation or outsource production`);
    if (q > 0 && s.retired) err('RETIRED', `production.${s.id}`, `${s.name} is retired`);
  }

  // Entry legality (T-08) & dependencies
  for (const c of COUNTRIES) {
    const cd = d.countries[c];
    const p = company.countries[c];
    if (cd.entryAction === 'enter') {
      if (p.status === 'active' || p.status === 'pending') err('ALREADY_ENTERED', `countries.${c}`, `${c}: already ${p.status}`);
      const rule = MODE_RULES[cd.entryMode];
      if (rule.needsFullOwnership && env[c].foreignOwnershipCap < 1)
        err('OWNERSHIP_CAP', `countries.${c}.entryMode`, `${c}: ${rule.label} requires 100% ownership but the foreign-ownership cap is ${(env[c].foreignOwnershipCap * 100).toFixed(0)}%`);
      if (cd.entryMode === 'jv' && cd.ownershipPct > env[c].foreignOwnershipCap)
        err('OWNERSHIP_CAP', `countries.${c}.ownershipPct`, `${c}: JV stake ${(cd.ownershipPct * 100).toFixed(0)}% exceeds cap ${(env[c].foreignOwnershipCap * 100).toFixed(0)}%`);
      if (rule.partnerKind) {
        const partner = sc.partners.find((x) => x.id === cd.partnerId);
        if (!partner || partner.country !== c || partner.kind !== rule.partnerKind)
          err('PARTNER_REQUIRED', `countries.${c}.partnerId`, `${c}: choose a valid ${rule.partnerKind.replace('_', ' ')} partner for ${rule.label}`);
      }
    }
    if (cd.entryAction === 'exit' && p.status !== 'active' && p.status !== 'pending') err('NOT_ENTERED', `countries.${c}`, `${c}: nothing to exit`);
    for (const [k, v] of Object.entries(cd.localProduction)) {
      if (v > 0 && !(p.mode && MODE_RULES[p.mode].localProduction && p.status === 'active'))
        err('NO_LOCAL_PLANT', `countries.${c}.localProduction`, `${c}: local production needs an active JV/greenfield/acquisition plant`);
      const sku = company.skus.find((s) => s.id === k);
      const v2 = sku && currentVersion(sku, d.round);
      if (v > 0 && v2 && v2.formula.dryingTech === 'freeze' && !company.hasFreezeTech)
        err('TECH_MISSING', `countries.${c}.localProduction`, `${c}: freeze-dried SKU needs freeze-drying technology`);
    }
    const localTotal = Object.values(cd.localProduction).reduce((a, b) => a + b, 0);
    if (localTotal > p.localCapacity * 1.0001 && p.localCapacity > 0) warn('LOCAL_CAPACITY', `countries.${c}.localProduction`, `${c}: local plan exceeds capacity ${p.localCapacity.toLocaleString()}; will be scaled`);
    if (cd.targetSegments.length === 0 && (p.status === 'active' || cd.entryAction === 'enter')) warn('NO_TARGET', `countries.${c}.targetSegments`, `${c}: no target segment selected – ads will be less effective`);
  }

  // Shipments
  const avail = vnAvailableBySku(company);
  const plannedOut: Record<string, number> = {};
  for (const s of d.shipments) {
    const p = company.countries[s.country];
    const cd = d.countries[s.country];
    const mode = p.status === 'active' || p.status === 'pending' ? p.mode : cd.entryAction === 'enter' ? cd.entryMode : null;
    if (!mode || !MODE_RULES[mode].exports) err('NO_EXPORT_MODE', `shipments.${s.country}`, `${s.country}: shipments need an export entry mode (indirect/direct export)`);
    if (env[s.country].closedModes & ({ sea: 1, air: 2, multimodal: 4 } as const)[s.mode]) err('ROUTE_CLOSED', `shipments.${s.country}`, `${s.country}: ${s.mode} route is closed`);
    plannedOut[s.skuId] = (plannedOut[s.skuId] ?? 0) + s.qty;
  }
  for (const [k, q] of Object.entries(plannedOut)) {
    const sku = company.skus.find((s) => s.id === k);
    const canHave = (avail[k] ?? 0) + (d.production[k] ?? 0) + (d.outsourcing[k] ?? 0);
    if (q > canHave) err('OVER_SHIP', `shipments.${k}`, `${sku?.name ?? k}: shipping ${q.toLocaleString()} > available+planned ${canHave.toLocaleString()} boxes (T-12)`);
  }

  // Finance (T-18)
  if (d.newLoan > creditLimit(company) + 1) err('CREDIT_LIMIT', 'newLoan', `New loan exceeds credit limit $${Math.round(creditLimit(company)).toLocaleString()}`);
  if (d.debtRepayment > company.ledger.debt + 1) err('REPAY_GT_DEBT', 'debtRepayment', 'Repayment exceeds outstanding debt');
  if (d.dividend > 0 && company.ledger.retainedEarnings <= 0) err('DIVIDEND', 'dividend', 'Dividends require positive retained earnings');
  const spend = Object.values(estimateSpend(d, company, game)).reduce((a, b) => a + b, 0);
  const dueCollections = Object.values(company.countries).flatMap((p) => p.receivables).filter((r) => r.dueRound <= d.round).reduce((a, r) => a + r.amount, 0);
  const available = company.ledger.cash + d.newLoan + dueCollections - d.minCashReserve;
  if (spend > available + 1)
    err('CASH_OVERRUN', 'budget', `Planned outlays $${Math.round(spend).toLocaleString()} exceed available cash $${Math.round(available).toLocaleString()} (cash + new loan + collections − reserve)`);
  return issues;
}
