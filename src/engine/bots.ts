// Bot teams (SRS §14): price leader, quality differentiator, focused niche, export-first,
// JV diversifier, financially conservative. Bots only use the public decision interface.
import { carryForward, creditLimit, currentVersion, estimateSpend, validateDecision, vnAvailableBySku } from './decisions';
import { FORMULA_PRESETS } from './product';
import { MODE_RULES } from './scenario';
import type {
  BotLevel, BotStrategy, CompanyState, CountryCode, Decision, EntryMode, EntryScale, Formula, GameState, MessageTheme, SegmentId, ShipmentDecision,
} from './types';
import { AD_CHANNELS, COUNTRIES } from './types';
import { sum } from './util';

interface EntryStep { round: number; country: CountryCode; mode: EntryMode; scale: EntryScale; ownership?: number }
interface BotProfile {
  label: string;
  products: { id: string; name: string; preset: string; needsFreeze?: boolean }[];
  entries: EntryStep[];
  segments: SegmentId[];
  priceSegment: SegmentId;
  priceFactor: number;
  adPerCountry: number;
  tradeSpend: number;
  theme: MessageTheme;
  rd: number;
  innovation: number;
  quality: number;
  capexRounds: number[];
  hedge: number;
  insurance: 'none' | 'basic' | 'premium';
  promo: number;
}

export const BOT_PROFILES: Record<BotStrategy, BotProfile> = {
  price_leader: {
    label: 'Price leader', products: [{ id: 'SKU-001', name: 'Classic 3-in-1', preset: 'Classic 3-in-1' }],
    entries: [{ round: 1, country: 'CN', mode: 'indirect_export', scale: 'normal' }, { round: 2, country: 'US', mode: 'direct_export', scale: 'normal' }, { round: 4, country: 'GB', mode: 'direct_export', scale: 'pilot' }],
    segments: ['budget', 'mainstream'], priceSegment: 'mainstream', priceFactor: 0.82, adPerCountry: 70_000, tradeSpend: 40_000, theme: 'value',
    rd: 20_000, innovation: 0, quality: 25_000, capexRounds: [2, 4, 6], hedge: 0, insurance: 'none', promo: 0.08,
  },
  quality_differentiator: {
    label: 'Quality differentiator',
    products: [{ id: 'SKU-001', name: 'Classic 3-in-1', preset: 'Classic 3-in-1' }, { id: 'SKU-Q1', name: 'Arabica Select 2-in-1', preset: 'Low-Sugar 2-in-1' }, { id: 'SKU-Q2', name: 'Imperial Freeze-Dried', preset: 'Premium Freeze-Dried Arabica', needsFreeze: true }],
    entries: [{ round: 1, country: 'JP', mode: 'direct_export', scale: 'normal' }, { round: 2, country: 'GB', mode: 'direct_export', scale: 'normal' }, { round: 4, country: 'US', mode: 'direct_export', scale: 'normal' }],
    segments: ['premium', 'mainstream'], priceSegment: 'premium', priceFactor: 1.0, adPerCountry: 120_000, tradeSpend: 50_000, theme: 'flavor',
    rd: 80_000, innovation: 250_000, quality: 80_000, capexRounds: [4], hedge: 0.5, insurance: 'basic', promo: 0,
  },
  focused_niche: {
    label: 'Focused niche (health)', products: [{ id: 'SKU-001', name: 'Classic 3-in-1', preset: 'Classic 3-in-1' }, { id: 'SKU-H1', name: 'Fit Black Low-Sugar', preset: 'Low-Sugar 2-in-1' }],
    entries: [{ round: 1, country: 'GB', mode: 'direct_export', scale: 'normal' }, { round: 3, country: 'US', mode: 'direct_export', scale: 'pilot' }],
    segments: ['health'], priceSegment: 'health', priceFactor: 1.0, adPerCountry: 80_000, tradeSpend: 30_000, theme: 'sustainability',
    rd: 50_000, innovation: 0, quality: 50_000, capexRounds: [], hedge: 0.5, insurance: 'basic', promo: 0,
  },
  export_first: {
    label: 'Export-first', products: [{ id: 'SKU-001', name: 'Classic 3-in-1', preset: 'Classic 3-in-1' }, { id: 'SKU-E1', name: 'Coconut Latte', preset: 'Coconut Latte' }],
    entries: [{ round: 1, country: 'CN', mode: 'direct_export', scale: 'normal' }, { round: 1, country: 'JP', mode: 'direct_export', scale: 'pilot' }, { round: 3, country: 'US', mode: 'direct_export', scale: 'normal' }, { round: 5, country: 'GB', mode: 'direct_export', scale: 'normal' }],
    segments: ['mainstream'], priceSegment: 'mainstream', priceFactor: 0.95, adPerCountry: 80_000, tradeSpend: 40_000, theme: 'origin',
    rd: 30_000, innovation: 0, quality: 35_000, capexRounds: [3, 5], hedge: 0.3, insurance: 'basic', promo: 0.05,
  },
  jv_diversifier: {
    label: 'JV diversifier', products: [{ id: 'SKU-001', name: 'Classic 3-in-1', preset: 'Classic 3-in-1' }],
    entries: [{ round: 1, country: 'CN', mode: 'jv', scale: 'normal', ownership: 0.6 }, { round: 1, country: 'JP', mode: 'licensing', scale: 'normal' }, { round: 3, country: 'US', mode: 'direct_export', scale: 'normal' }],
    segments: ['mainstream', 'budget'], priceSegment: 'mainstream', priceFactor: 0.95, adPerCountry: 70_000, tradeSpend: 30_000, theme: 'origin',
    rd: 30_000, innovation: 0, quality: 30_000, capexRounds: [], hedge: 0.5, insurance: 'premium', promo: 0.05,
  },
  conservative: {
    label: 'Financially conservative', products: [{ id: 'SKU-001', name: 'Classic 3-in-1', preset: 'Classic 3-in-1' }],
    entries: [{ round: 1, country: 'CN', mode: 'indirect_export', scale: 'pilot' }, { round: 2, country: 'JP', mode: 'indirect_export', scale: 'pilot' }],
    segments: ['mainstream'], priceSegment: 'mainstream', priceFactor: 1.0, adPerCountry: 40_000, tradeSpend: 20_000, theme: 'value',
    rd: 10_000, innovation: 0, quality: 25_000, capexRounds: [], hedge: 0.8, insurance: 'basic', promo: 0,
  },
};

export const BOT_STRATEGIES = Object.keys(BOT_PROFILES) as BotStrategy[];

/** Difficulty only changes how well bots play; every company still starts from the same template. */
export const BOT_LEVELS: Record<BotLevel, { label: string; spend: number; supply: number; budgets: number; adaptivePricing: boolean; capex: 'none' | 'plan' | 'aggressive' }> = {
  easy: { label: 'Easy', spend: 0.55, supply: 0.7, budgets: 0.6, adaptivePricing: false, capex: 'none' },
  normal: { label: 'Normal', spend: 1, supply: 1, budgets: 1, adaptivePricing: true, capex: 'plan' },
  hard: { label: 'Hard', spend: 1.25, supply: 1.25, budgets: 1.3, adaptivePricing: true, capex: 'aggressive' },
};

/** Default bot line-up for a difficulty level. */
export function botLineup(level: BotLevel, count: number): BotStrategy[] {
  const pool: Record<BotLevel, BotStrategy[]> = {
    easy: ['conservative', 'focused_niche', 'jv_diversifier', 'conservative', 'focused_niche', 'jv_diversifier', 'conservative'],
    normal: ['price_leader', 'quality_differentiator', 'export_first', 'focused_niche', 'jv_diversifier', 'conservative', 'price_leader'],
    hard: ['export_first', 'quality_differentiator', 'price_leader', 'export_first', 'quality_differentiator', 'price_leader', 'export_first'],
  };
  return pool[level].slice(0, count);
}

/** Rounds relative to the scored game: bots restart their plan after practice reset. */
function planRound(game: GameState): number {
  const pr = game.scenario.practiceRounds;
  return game.round > pr ? game.round - pr : game.round;
}

export function makeBotDecision(game: GameState, co: CompanyState): Decision {
  const prof = BOT_PROFILES[co.botStrategy ?? 'export_first'];
  const lv = BOT_LEVELS[game.botLevel ?? 'normal'];
  const sc = game.scenario;
  const r = planRound(game);
  const d = carryForward(game.decisions[co.id], co, sc, game.round);
  const lastRes = game.results[game.results.length - 1];

  // Products
  for (const p of prof.products) {
    if (p.needsFreeze && !co.hasFreezeTech) continue;
    if (!d.skus.find((s) => s.skuId === p.id)) d.skus.push({ skuId: p.id, name: p.name, formula: { ...(FORMULA_PRESETS[p.preset] as Formula) } });
  }
  d.rdBudget = Math.round(prof.rd * lv.budgets);
  d.innovationBudget = co.hasFreezeTech ? 0 : Math.round(prof.innovation * lv.budgets);
  d.qualityBudget = Math.round(prof.quality * lv.budgets);
  d.maintenanceBudget = 25_000;
  const lastTotDemand = sum((lastRes?.countryResults ?? []).filter((x) => x.companyId === co.id).map((x) => x.demandBoxes));
  const expanding = co.capacityProjects.length > 0;
  const wantCapex = lv.capex === 'none' ? false
    : lv.capex === 'aggressive' ? lastTotDemand > co.vnCapacity * 1.1 && !expanding
    : prof.capexRounds.includes(r) || (lastTotDemand > co.vnCapacity * 1.3 && !expanding && prof.capexRounds.length > 0);
  d.capacityCapex = wantCapex && co.ledger.cash > 1_500_000 ? 500_000 : 0;

  // Entries
  for (const e of prof.entries) {
    const p = co.countries[e.country];
    if (e.round > r || p.status !== 'none') continue;
    const rule = MODE_RULES[e.mode];
    if (rule.needsFullOwnership && game.env[e.country].foreignOwnershipCap < 1) continue;
    const cd = d.countries[e.country];
    cd.entryAction = 'enter';
    cd.entryMode = e.mode;
    cd.entryScale = e.scale;
    cd.ownershipPct = Math.min(e.ownership ?? 0.5, game.env[e.country].foreignOwnershipCap);
    cd.partnerId = rule.partnerKind ? sc.partners.find((x) => x.country === e.country && x.kind === rule.partnerKind)?.id ?? null : null;
  }

  // Country marketing & prices
  const activeSkus = co.skus.filter((s) => !s.retired && currentVersion(s, game.round));
  for (const c of COUNTRIES) {
    const p = co.countries[c];
    const cd = d.countries[c];
    const engaged = p.status === 'active' || p.status === 'pending' || cd.entryAction === 'enter';
    const env = game.env[c];
    if (!engaged) { cd.ads = { search: 0, social: 0, video: 0, influencer: 0, offline: 0 }; cd.tradeSpend = 0; continue; }
    cd.targetSegments = prof.segments;
    cd.messageTheme = prof.theme;
    cd.promotionRate = prof.promo;
    cd.promotionKind = prof.promo > 0 ? 'price_cut' : 'loyalty';
    cd.hedgeRatio = env.currency === 'USD' ? 0 : prof.hedge;
    cd.politicalPolicy = prof.insurance;
    cd.retailerMargin = 0.3;
    cd.creditDays = 30;
    cd.serviceBudget = 15_000;
    cd.localizationBudget = 20_000;
    cd.tradeSpend = Math.round(prof.tradeSpend * lv.spend);
    const ranked = [...AD_CHANNELS].sort((a, b) => env.channelEffect[b] - env.channelEffect[a]).slice(0, 3);
    const ads = { search: 0, social: 0, video: 0, influencer: 0, offline: 0 };
    ranked.forEach((ch, i) => (ads[ch] = Math.round(prof.adPerCountry * lv.spend * [0.45, 0.35, 0.2][i])));
    cd.ads = ads;
    for (const s of co.skus.concat(d.skus.filter((x) => !co.skus.find((y) => y.id === x.skuId)).map((x) => ({ id: x.skuId, name: x.name, versions: [], retired: false })))) {
      const isPremiumSku = s.id === 'SKU-Q2' || s.id === 'SKU-Q1' || s.id === 'SKU-H1';
      const seg = env.segments.find((g) => g.id === (isPremiumSku ? prof.priceSegment : prof.priceSegment === 'premium' ? 'mainstream' : prof.priceSegment))!;
      // Adaptive pricing: raise price after stock-outs, cut it when stock did not sell through
      const prevPrice = game.decisions[co.id]?.countries[c]?.prices[s.id];
      const res = lastRes?.countryResults.find((x) => x.companyId === co.id && x.country === c);
      let price = seg.referencePrice * prof.priceFactor;
      if (lv.adaptivePricing && prevPrice && res && p.status === 'active') {
        const fill = res.demandBoxes > 0 ? res.salesBoxes / res.demandBoxes : 1;
        price = prevPrice * (fill < 0.75 ? 1.06 : fill > 0.98 ? 0.98 : 1);
        price = Math.min(Math.max(price, seg.referencePrice * prof.priceFactor * 0.85), seg.referencePrice * prof.priceFactor * 1.35);
      }
      cd.prices[s.id] = Math.round(price * 100) / 100;
      cd.offered[s.id] = true;
      if (!p.labelLocalized[s.id] && MODE_RULES[(p.mode ?? cd.entryMode)].exports) cd.labelLocalize[s.id] = true;
    }
    // Local production for local-plant modes
    if (p.status === 'active' && p.mode && MODE_RULES[p.mode].localProduction) {
      const per = Math.floor(p.localCapacity * 0.9 / Math.max(1, activeSkus.length));
      cd.localProduction = Object.fromEntries(activeSkus.map((s) => [s.id, per]));
    }
  }

  // Production & shipments
  const exportCountries = COUNTRIES.filter((c) => {
    const p = co.countries[c];
    const mode = p.status === 'active' || p.status === 'pending' ? p.mode : d.countries[c].entryAction === 'enter' ? d.countries[c].entryMode : null;
    return !!mode && MODE_RULES[mode].exports;
  });
  const lastSales = (c: CountryCode) => sum((lastRes?.countryResults ?? []).filter((x) => x.companyId === co.id && x.country === c).map((x) => x.salesBoxes));
  const lastDemand = (c: CountryCode) => sum((lastRes?.countryResults ?? []).filter((x) => x.companyId === co.id && x.country === c).map((x) => x.demandBoxes));
  const producible = activeSkus.filter((s) => {
    const v = currentVersion(s, game.round)!;
    return v.formula.dryingTech === 'spray' || co.hasFreezeTech;
  });
  const vn = vnAvailableBySku(co);
  const need: Record<string, number> = {};
  const ships: ShipmentDecision[] = [];
  for (const c of exportCountries) {
    const target = Math.round(Math.max(60_000, Math.max(lastSales(c) * 1.2, lastDemand(c) * 1.05)) * lv.supply);
    const local = sum(co.inventory.filter((l) => l.location === c).map((l) => l.qty));
    const transit = sum(co.shipments.filter((s) => s.country === c && (s.status === 'in_transit' || s.status === 'detained')).flatMap((s) => s.lines.map((l) => l.qty)));
    const gap = Math.max(0, target - local - transit);
    if (gap <= 0 || !producible.length) continue;
    const per = Math.floor(gap / producible.length);
    for (const s of producible) {
      need[s.id] = (need[s.id] ?? 0) + per;
      const far = c === 'US' || c === 'GB';
      ships.push({ country: c, skuId: s.id, qty: per, mode: far ? 'multimodal' : 'sea', service: 'standard', incoterm: 'DAP', insurance: 'basic' });
    }
  }
  const cap = co.vnCapacity;
  let totalNeed = 0;
  d.production = {};
  for (const s of producible) {
    const want = Math.max(0, (need[s.id] ?? 0) - (vn[s.id] ?? 0));
    d.production[s.id] = want;
    totalNeed += want;
  }
  if (totalNeed > cap) for (const k of Object.keys(d.production)) d.production[k] = Math.floor(d.production[k] * cap / totalNeed);
  // ship no more than what will exist
  const willHave: Record<string, number> = {};
  for (const s of producible) willHave[s.id] = (vn[s.id] ?? 0) + (d.production[s.id] ?? 0) * 0.99;
  d.shipments = ships.map((sh) => {
    const q = Math.max(0, Math.min(sh.qty, Math.floor(willHave[sh.skuId] ?? 0)));
    willHave[sh.skuId] = (willHave[sh.skuId] ?? 0) - q;
    return { ...sh, qty: q };
  }).filter((s) => s.qty > 0);

  // Finance
  d.newLoan = 0;
  if (co.ledger.cash < 900_000) d.newLoan = Math.min(1_000_000, Math.max(0, 1_000_000 + 0.5 * (co.ledger.cash + co.ledger.receivables + co.ledger.inventory + co.ledger.ppe) - co.ledger.debt));
  // Finance capital-heavy entries (JV, greenfield, acquisition) with debt instead of dropping them.
  const planned = sum(Object.values(estimateSpend(d, co, game)));
  const shortfall = planned + 800_000 - co.ledger.cash;
  if (shortfall > d.newLoan) d.newLoan = Math.min(creditLimit(co), Math.round(shortfall));
  d.debtRepayment = co.ledger.cash > 2_500_000 && co.ledger.debt > 0 ? Math.min(co.ledger.debt, 500_000) : 0;
  d.minCashReserve = 0;
  d.dividend = 0;

  // Fit inside cash constraints: shrink discretionary items until valid
  for (let i = 0; i < 4; i++) {
    const errs = validateDecision(d, co, game).filter((x) => x.severity === 'error');
    if (!errs.length) break;
    if (errs.some((e) => e.code === 'CASH_OVERRUN')) {
      d.capacityCapex = 0;
      d.innovationBudget = Math.round(d.innovationBudget / 2);
      for (const c of COUNTRIES) {
        const cd = d.countries[c];
        for (const ch of AD_CHANNELS) cd.ads[ch] = Math.round(cd.ads[ch] * 0.6);
        cd.tradeSpend = Math.round(cd.tradeSpend * 0.6);
        if (i >= 2 && cd.entryAction === 'enter' && co.countries[c].status === 'none') cd.entryAction = 'hold';
      }
      if (i >= 1) for (const k of Object.keys(d.production)) d.production[k] = Math.floor(d.production[k] * 0.7);
    } else {
      break; // engine will neutralise remaining one-off errors
    }
  }
  const avail: Record<string, number> = {};
  for (const s of producible) avail[s.id] = (vn[s.id] ?? 0) + (d.production[s.id] ?? 0);
  d.shipments = d.shipments.map((sh) => {
    const q = Math.max(0, Math.min(sh.qty, avail[sh.skuId] ?? 0));
    avail[sh.skuId] = (avail[sh.skuId] ?? 0) - q;
    return { ...sh, qty: q };
  }).filter((s) => s.qty > 0);
  d.submitted = true;
  return d;
}
