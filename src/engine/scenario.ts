// Default four-market scenario template.
// ALL country figures below are FICTIONAL teaching assumptions (SRS §0, §15) — not statistics or law.
import type {
  AdChannel, CountryCode, CountryEnv, EntryMode, EntryScale, EventTemplate, MessageTheme, PartnerDef,
  PromotionKind, RouteDef, Scenario, SegmentDef, SegmentId,
} from './types';

type SegPatch = Partial<Omit<SegmentDef, 'id' | 'name' | 'w' | 'ideal' | 'fitW' | 'themeAffinity' | 'promoAffinity'>> & {
  w?: Partial<SegmentDef['w']>;
  ideal?: Partial<SegmentDef['ideal']>;
  themeAffinity?: Partial<Record<MessageTheme, number>>;
};

const theme = (o: number, v: number, f: number, c: number, s: number): Record<MessageTheme, number> =>
  ({ origin: o, value: v, flavor: f, convenience: c, sustainability: s });
const promo = (p: number, c: number, b: number, l: number): Record<PromotionKind, number> =>
  ({ price_cut: p, coupon: c, bundle: b, loyalty: l });

function baseSegments(ref: number): SegmentDef[] {
  return [
    {
      id: 'budget', name: 'Budget', share: 0.3,
      ideal: { flavorStrength: 55, smoothness: 60, sweetness: 65, aroma: 45, healthiness: 30 },
      fitW: { flavorStrength: 0.25, smoothness: 0.2, sweetness: 0.3, aroma: 0.1, healthiness: 0.15 },
      w: { price: 3.4, fit: 2.4, quality: 0.8, brand: 1.0, coverage: 1, awareness: 1.2, packaging: 0.3, sustainability: 0.1, convenience: 0.7, trust: 0.6 },
      themeAffinity: theme(0.2, 0.9, 0.4, 0.6, 0.1), promoAffinity: promo(1, 0.8, 1.1, 0.5),
      referencePrice: ref * 0.8, outsideU: 7.4,
    },
    {
      id: 'mainstream', name: 'Mainstream', share: 0.35,
      ideal: { flavorStrength: 62, smoothness: 62, sweetness: 50, aroma: 55, healthiness: 45 },
      fitW: { flavorStrength: 0.25, smoothness: 0.2, sweetness: 0.25, aroma: 0.15, healthiness: 0.15 },
      w: { price: 2.4, fit: 3.0, quality: 1.4, brand: 1.6, coverage: 1, awareness: 1.4, packaging: 0.6, sustainability: 0.3, convenience: 0.7, trust: 1.0 },
      themeAffinity: theme(0.5, 0.5, 0.7, 0.6, 0.3), promoAffinity: promo(0.8, 0.9, 0.8, 0.8),
      referencePrice: ref, outsideU: 7.9,
    },
    {
      id: 'premium', name: 'Premium', share: 0.2,
      ideal: { flavorStrength: 75, smoothness: 70, sweetness: 25, aroma: 80, healthiness: 60 },
      fitW: { flavorStrength: 0.25, smoothness: 0.15, sweetness: 0.15, aroma: 0.3, healthiness: 0.15 },
      w: { price: 1.1, fit: 3.2, quality: 2.6, brand: 2.2, coverage: 1, awareness: 1.0, packaging: 1.2, sustainability: 0.6, convenience: 0.3, trust: 1.4 },
      themeAffinity: theme(0.9, 0.1, 0.9, 0.2, 0.6), promoAffinity: promo(0.3, 0.3, 0.4, 1.0),
      referencePrice: ref * 1.45, outsideU: 8.4,
    },
    {
      id: 'health', name: 'Health-conscious', share: 0.15,
      ideal: { flavorStrength: 65, smoothness: 55, sweetness: 10, aroma: 65, healthiness: 90 },
      fitW: { flavorStrength: 0.15, smoothness: 0.1, sweetness: 0.25, aroma: 0.1, healthiness: 0.4 },
      w: { price: 1.7, fit: 3.4, quality: 1.8, brand: 1.2, coverage: 1, awareness: 1.0, packaging: 0.8, sustainability: 1.2, convenience: 0.4, trust: 1.2 },
      themeAffinity: theme(0.4, 0.2, 0.5, 0.3, 0.9), promoAffinity: promo(0.5, 0.6, 0.4, 0.9),
      referencePrice: ref * 1.25, outsideU: 8.1,
    },
  ];
}

function patchSegments(segs: SegmentDef[], patches: Partial<Record<SegmentId, SegPatch>>): SegmentDef[] {
  return segs.map((s) => {
    const p = patches[s.id];
    if (!p) return s;
    return {
      ...s, ...p,
      w: { ...s.w, ...(p.w ?? {}) },
      ideal: { ...s.ideal, ...(p.ideal ?? {}) },
      themeAffinity: { ...s.themeAffinity, ...(p.themeAffinity ?? {}) },
    } as SegmentDef;
  });
}

const ch = (search: number, social: number, video: number, influencer: number, offline: number): Record<AdChannel, number> =>
  ({ search, social, video, influencer, offline });

function country(c: Omit<CountryEnv, 'closedModes'>): CountryEnv {
  return { ...c, closedModes: 0 };
}

export function defaultCountries(): Record<CountryCode, CountryEnv> {
  return {
    CN: country({
      code: 'CN', name: 'China', currency: 'CNY', language: 'zh', fxRate: 7.2, fxVolatility: 0.02,
      marketSizeBoxes: 2_800_000, marketGrowth: 0.02, gdpGrowth: 0.045, inflation: 0.02, interestRate: 0.04,
      importTariff: 0.12, importQuota: 0, foreignOwnershipCap: 0.7, laborCostIndex: 115, consumerIncomeIndex: 90,
      regulatoryEnforcement: 55, digitalPenetration: 85, cultureDistance: 35, portDelayDays: 6, politicalRisk: 40,
      corporateTax: 0.25, vat: 0.13, carbonTax: 0, channelEffect: ch(1.0, 1.3, 1.05, 1.4, 0.7), sustainabilityPremium: 0,
      segments: patchSegments(baseSegments(80), {
        budget: { share: 0.34, ideal: { sweetness: 70 } },
        mainstream: { share: 0.36 },
        premium: { share: 0.18 },
        health: { share: 0.12 },
      }),
    }),
    JP: country({
      code: 'JP', name: 'Japan', currency: 'JPY', language: 'ja', fxRate: 150, fxVolatility: 0.03,
      marketSizeBoxes: 1_400_000, marketGrowth: 0.005, gdpGrowth: 0.01, inflation: 0.02, interestRate: 0.01,
      importTariff: 0.09, importQuota: 0, foreignOwnershipCap: 1.0, laborCostIndex: 180, consumerIncomeIndex: 130,
      regulatoryEnforcement: 80, digitalPenetration: 70, cultureDistance: 55, portDelayDays: 3, politicalRisk: 10,
      corporateTax: 0.3, vat: 0.08, carbonTax: 0.02, channelEffect: ch(1.0, 0.9, 1.1, 0.8, 1.25), sustainabilityPremium: 0.2,
      segments: patchSegments(baseSegments(1700), {
        budget: { share: 0.22, w: { quality: 1.4, trust: 1.2 } },
        mainstream: { share: 0.38, w: { quality: 2.0, packaging: 1.0, trust: 1.6 }, ideal: { smoothness: 68, sweetness: 40 } },
        premium: { share: 0.26, w: { quality: 3.2, packaging: 1.6, trust: 2.0 } },
        health: { share: 0.14 },
      }),
    }),
    US: country({
      code: 'US', name: 'United States', currency: 'USD', language: 'en', fxRate: 1, fxVolatility: 0,
      marketSizeBoxes: 2_000_000, marketGrowth: 0.012, gdpGrowth: 0.02, inflation: 0.03, interestRate: 0.05,
      importTariff: 0.1, importQuota: 0, foreignOwnershipCap: 1.0, laborCostIndex: 220, consumerIncomeIndex: 150,
      regulatoryEnforcement: 65, digitalPenetration: 80, cultureDistance: 60, portDelayDays: 8, politicalRisk: 15,
      corporateTax: 0.21, vat: 0, carbonTax: 0, channelEffect: ch(1.2, 1.1, 1.2, 1.0, 0.85), sustainabilityPremium: 0,
      segments: patchSegments(baseSegments(12), {
        budget: { share: 0.28 },
        mainstream: { share: 0.32, w: { brand: 2.0 } },
        premium: { share: 0.22, w: { brand: 2.8 }, themeAffinity: { origin: 1.0 } },
        health: { share: 0.18, ideal: { sweetness: 5 } },
      }),
    }),
    GB: country({
      code: 'GB', name: 'United Kingdom', currency: 'GBP', language: 'en', fxRate: 0.79, fxVolatility: 0.025,
      marketSizeBoxes: 900_000, marketGrowth: 0.008, gdpGrowth: 0.012, inflation: 0.03, interestRate: 0.045,
      importTariff: 0.08, importQuota: 0, foreignOwnershipCap: 1.0, laborCostIndex: 200, consumerIncomeIndex: 135,
      regulatoryEnforcement: 70, digitalPenetration: 75, cultureDistance: 58, portDelayDays: 10, politicalRisk: 12,
      corporateTax: 0.25, vat: 0.2, carbonTax: 0.05, channelEffect: ch(1.1, 1.0, 1.0, 0.8, 1.1), sustainabilityPremium: 0.8,
      segments: patchSegments(baseSegments(9.5), {
        budget: { share: 0.3, w: { price: 3.8 } },
        mainstream: { share: 0.34 },
        premium: { share: 0.18 },
        health: { share: 0.18, w: { sustainability: 1.8 } },
      }),
    }),
  };
}

export function defaultRoutes(): RouteDef[] {
  const r = (country: CountryCode, mode: RouteDef['mode'], costPerBox: number, leadRounds: number, delayProb: number, lossProb: number): RouteDef =>
    ({ country, mode, costPerBox, leadRounds, delayProb, lossProb });
  return [
    r('CN', 'sea', 0.1, 0, 0.15, 0.004), r('CN', 'air', 0.9, 0, 0.02, 0.001), r('CN', 'multimodal', 0.3, 0, 0.06, 0.002),
    r('JP', 'sea', 0.16, 0, 0.12, 0.004), r('JP', 'air', 1.1, 0, 0.02, 0.001), r('JP', 'multimodal', 0.45, 0, 0.05, 0.002),
    r('US', 'sea', 0.32, 1, 0.18, 0.008), r('US', 'air', 1.8, 0, 0.03, 0.001), r('US', 'multimodal', 0.8, 0, 0.1, 0.004),
    r('GB', 'sea', 0.38, 1, 0.2, 0.008), r('GB', 'air', 1.95, 0, 0.03, 0.001), r('GB', 'multimodal', 0.9, 0, 0.1, 0.004),
  ];
}

export function defaultPartners(): PartnerDef[] {
  const list: PartnerDef[] = [];
  const add = (country: CountryCode, kind: PartnerDef['kind'], name: string, quality: number, coverageBoost: number, feeOrMargin: number, description: string) =>
    list.push({ id: `${country}-${kind}-${list.length}`, country, kind, name, quality, coverageBoost, feeOrMargin, description });
  const names: Record<CountryCode, string[]> = {
    CN: ['Huaxia Trading', 'Dragon Gate Distribution', 'Jade Brew Licensing', 'Panda Cafe Franchise', 'Shanghai Foods JV', 'Golden Cup Coffee Co.'],
    JP: ['Sakura Shoji', 'Kanto Retail Link', 'Fujiyama Beverages', 'Kissa Franchise Group', 'Osaka Foods JV', 'Hokkaido Instant KK'],
    US: ['Pacific Import House', 'Liberty Grocery Distribution', 'Brewline Licensing', 'Morning Cup Franchise', 'Midwest Foods JV', 'Summit Coffee Inc.'],
    GB: ['Thames Trading Ltd', 'Albion Grocery Supply', 'Union Brew Licensing', 'High Street Cafe Franchise', 'Northern Foods JV', 'Kingsway Coffee plc'],
  };
  for (const c of ['CN', 'JP', 'US', 'GB'] as CountryCode[]) {
    const n = names[c];
    add(c, 'trading_house', n[0], 0.6, 0.12, 0.2, 'Trading house: takes title, 20% intermediary margin, low control.');
    add(c, 'distributor', n[1], 0.8, 0.2, 0.0, 'Exclusive distributor for direct exporting; retailer margin set by you.');
    add(c, 'licensee', n[2], c === 'JP' ? 0.85 : 0.7, 0.3, 0.07, 'Licensee produces locally; you earn a 7% royalty on licensee net sales.');
    add(c, 'franchisee', n[3], 0.75, 0.35, 0.1, 'Franchise network: 10% royalty, strong outlet coverage.');
    add(c, 'jv_partner', n[4], 0.8, 0.35, 0.0, 'Local JV partner with plant site and retail relationships.');
    add(c, 'acquisition_target', n[5], 0.75, 0.45, 3_200_000, 'Local instant-coffee maker for sale (base price, scaled by deal size).');
  }
  return list;
}

export function defaultEvents(): EventTemplate[] {
  const base = { durationRounds: 1, severity: 0, destroysExposure: false, publicAnnouncement: true, enabled: true, endRound: 99 };
  return [
    { ...base, id: 'cn-shopping-festival', name: 'CN online shopping festival', description: 'Demand surge in China (+25% potential).',
      scope: 'country', country: 'CN', trigger: 'probabilistic', round: 2, probability: 0.25,
      effects: [{ variable: 'marketSizeMult', op: 'MULTIPLY', value: 1.25 }, { variable: 'digitalPenetration', op: 'ADD', value: 5 }] },
    { ...base, id: 'jp-inspection-wave', name: 'JP food-safety inspection wave', description: 'Stricter import inspection in Japan.',
      scope: 'country', country: 'JP', trigger: 'probabilistic', round: 2, probability: 0.18, durationRounds: 2,
      effects: [{ variable: 'regulatoryEnforcement', op: 'ADD', value: 15 }] },
    { ...base, id: 'us-tariff-hike', name: 'US tariff increase', description: 'Import tariff on processed coffee +15 pts.',
      scope: 'country', country: 'US', trigger: 'probabilistic', round: 3, probability: 0.12, durationRounds: 3,
      effects: [{ variable: 'importTariff', op: 'ADD', value: 0.15 }] },
    { ...base, id: 'gb-packaging-levy', name: 'UK packaging & carbon levy', description: 'Carbon/packaging charge per box rises in the UK.',
      scope: 'country', country: 'GB', trigger: 'fixed', round: 6, probability: 1, durationRounds: 99,
      effects: [{ variable: 'carbonTax', op: 'ADD', value: 0.1 }] },
    { ...base, id: 'global-port-strike', name: 'Port congestion', description: 'Global port congestion: +30 port-delay days.',
      scope: 'global', trigger: 'probabilistic', round: 2, probability: 0.1,
      effects: [{ variable: 'portDelayDays', op: 'ADD', value: 30 }] },
    { ...base, id: 'coffee-price-spike', name: 'Green coffee price spike', description: 'Robusta/arabica input prices +30%.',
      scope: 'global', trigger: 'probabilistic', round: 2, probability: 0.14, durationRounds: 2,
      effects: [{ variable: 'coffeePriceIndex', op: 'MULTIPLY', value: 1.3 }] },
    { ...base, id: 'jp-yen-shock', name: 'Yen depreciation shock', description: 'JPY weakens 12% vs USD.',
      scope: 'country', country: 'JP', trigger: 'probabilistic', round: 2, probability: 0.1,
      effects: [{ variable: 'fxRate', op: 'MULTIPLY', value: 1.12 }] },
    ...(['CN', 'JP', 'US', 'GB'] as CountryCode[]).map((c): EventTemplate => ({
      ...base, id: `political-incident-${c}`, name: `Political incident (${c})`,
      description: 'Unrest damages local stock and facilities; demand dips. Political-risk insurance pays covered losses.',
      scope: 'country', country: c, trigger: 'probabilistic', round: 2, probability: politicalIncidentProb(defaultCountries()[c].politicalRisk), severity: 30, destroysExposure: true,
      effects: [{ variable: 'marketSizeMult', op: 'MULTIPLY', value: 0.85 }],
    })),
    { ...base, id: 'regional-conflict', name: 'Regional armed conflict', description: 'Sea routes closed, demand collapse, heavy asset losses (off by default; GM can enable).',
      scope: 'country', country: 'CN', trigger: 'fixed', round: 7, probability: 1, severity: 60, durationRounds: 2, destroysExposure: true, enabled: false,
      effects: [{ variable: 'marketSizeMult', op: 'MULTIPLY', value: 0.6 }, { variable: 'closedModes', op: 'SET', value: 1 }, { variable: 'fxRate', op: 'MULTIPLY', value: 1.15 }] },
  ];
}

/** Probability of a political incident per quarter derived from the political-risk index. */
export const politicalIncidentProb = (politicalRisk: number) => politicalRisk / 800;

export function defaultScenario(): Scenario {
  return {
    id: 'four-markets-v1',
    name: 'Vietnam Goes Global – four markets (fictional teaching scenario)',
    version: 1,
    countries: defaultCountries(),
    routes: defaultRoutes(),
    partners: defaultPartners(),
    events: defaultEvents(),
    global: { coffeePriceIndex: 100, vndPerUsd: 25_000, usdInterestRate: 0.08, vndInterestRate: 0.1, vnCorporateTax: 0.2, baseCapacityCostPerBox: 5 },
    scoring: { profit: 0.3, share: 0.25, roic: 0.2, brand: 0.15, resilience: 0.1 },
    initial: { cash: 5_000_000, vnCapacity: 300_000, brand: 20, plantValue: 1_500_000 },
    practiceRounds: 2,
    scoredRounds: 8,
  };
}

/* ---------------------------- Entry-mode rules ------------------------------ */

export interface ModeRule {
  label: string;
  partnerKind: PartnerDef['kind'] | null;
  setupCost: number; // USD (scaled)
  capex: number; // capitalised (scaled)
  leadRounds: number;
  fixedCostPerRound: number;
  coverageMax: number;
  coverageMult: number;
  brandMult: number;
  exports: boolean; // ships goods from Vietnam
  localProduction: boolean; // own/JV local factory
  licensed: boolean; // partner produces, we earn royalties
  localCapacity: number; // boxes per quarter at normal scale
  needsFullOwnership: boolean;
  control: string;
  risk: string;
}

export const MODE_RULES: Record<EntryMode, ModeRule> = {
  indirect_export: { label: 'Indirect export', partnerKind: 'trading_house', setupCost: 25_000, capex: 0, leadRounds: 0, fixedCostPerRound: 5_000, coverageMax: 0.45, coverageMult: 0.7, brandMult: 0.6, exports: true, localProduction: false, licensed: false, localCapacity: 0, needsFullOwnership: false, control: 'Low', risk: 'Low' },
  direct_export: { label: 'Direct export', partnerKind: 'distributor', setupCost: 90_000, capex: 0, leadRounds: 1, fixedCostPerRound: 20_000, coverageMax: 0.85, coverageMult: 1, brandMult: 1, exports: true, localProduction: false, licensed: false, localCapacity: 0, needsFullOwnership: false, control: 'Medium', risk: 'Low–Medium' },
  licensing: { label: 'Licensing', partnerKind: 'licensee', setupCost: 40_000, capex: 0, leadRounds: 1, fixedCostPerRound: 5_000, coverageMax: 0.8, coverageMult: 0.9, brandMult: 0.7, exports: false, localProduction: false, licensed: true, localCapacity: 180_000, needsFullOwnership: false, control: 'Low', risk: 'Low (know-how leakage)' },
  franchising: { label: 'Franchising', partnerKind: 'franchisee', setupCost: 60_000, capex: 0, leadRounds: 1, fixedCostPerRound: 10_000, coverageMax: 0.9, coverageMult: 1, brandMult: 0.85, exports: false, localProduction: false, licensed: true, localCapacity: 150_000, needsFullOwnership: false, control: 'Medium', risk: 'Low' },
  jv: { label: 'Joint venture', partnerKind: 'jv_partner', setupCost: 60_000, capex: 1_200_000, leadRounds: 2, fixedCostPerRound: 40_000, coverageMax: 0.9, coverageMult: 1.05, brandMult: 1, exports: false, localProduction: true, licensed: false, localCapacity: 220_000, needsFullOwnership: false, control: 'Shared', risk: 'Medium' },
  greenfield: { label: 'Greenfield FDI', partnerKind: null, setupCost: 100_000, capex: 2_500_000, leadRounds: 3, fixedCostPerRound: 50_000, coverageMax: 0.9, coverageMult: 1, brandMult: 1, exports: false, localProduction: true, licensed: false, localCapacity: 320_000, needsFullOwnership: true, control: 'Full', risk: 'High' },
  acquisition: { label: 'Acquisition', partnerKind: 'acquisition_target', setupCost: 150_000, capex: 0, leadRounds: 1, fixedCostPerRound: 50_000, coverageMax: 0.92, coverageMult: 1.05, brandMult: 1, exports: false, localProduction: true, licensed: false, localCapacity: 250_000, needsFullOwnership: true, control: 'Full', risk: 'High' },
};

export const SCALE_MULT: Record<EntryScale, number> = { pilot: 0.5, normal: 1, aggressive: 1.6 };
