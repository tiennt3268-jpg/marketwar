// Market Wars – core domain types.
// Three variable classes (SRS §V): Decision (team edits), Environment (Game Master / scenario),
// Derived (engine only, never accepted from a client payload).

export type CountryCode = 'CN' | 'JP' | 'US' | 'GB';
export const COUNTRIES: CountryCode[] = ['CN', 'JP', 'US', 'GB'];
export type SegmentId = 'budget' | 'mainstream' | 'premium' | 'health';
export const SEGMENTS: SegmentId[] = ['budget', 'mainstream', 'premium', 'health'];

export type EntryMode =
  | 'indirect_export' | 'direct_export' | 'licensing' | 'franchising'
  | 'jv' | 'greenfield' | 'acquisition';
export const ENTRY_MODES: EntryMode[] = [
  'indirect_export', 'direct_export', 'licensing', 'franchising', 'jv', 'greenfield', 'acquisition',
];
export type EntryScale = 'pilot' | 'normal' | 'aggressive';
export type Roast = 'light' | 'medium' | 'dark';
export type DryingTech = 'spray' | 'freeze';
export type Grade = 'standard' | 'select' | 'premium';
export type PackMaterial = 'standard' | 'premium' | 'recyclable';
export type FlavorType = 'none' | 'coconut' | 'vanilla' | 'hazelnut';
export type FreightMode = 'sea' | 'air' | 'multimodal';
export type ShipService = 'economy' | 'standard' | 'express';
export type Incoterm = 'EXW' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
export const INCOTERMS: Incoterm[] = ['EXW', 'FOB', 'CIF', 'DAP', 'DDP'];
export type CargoInsurance = 'none' | 'basic' | 'comprehensive';
export type PolicyTier = 'none' | 'basic' | 'premium';
export type ResearchTier = 'none' | 'basic' | 'advanced';
export type MessageTheme = 'origin' | 'value' | 'flavor' | 'convenience' | 'sustainability';
export type PromotionKind = 'price_cut' | 'coupon' | 'bundle' | 'loyalty';
export type AdChannel = 'search' | 'social' | 'video' | 'influencer' | 'offline';
export const AD_CHANNELS: AdChannel[] = ['search', 'social', 'video', 'influencer', 'offline'];
export type SalaryPolicy = 'low' | 'standard' | 'high';
export type Currency = 'USD' | 'CNY' | 'JPY' | 'GBP' | 'VND';

/* ----------------------------- Product ---------------------------------- */

/** Bill of materials / formula decision (per SKU). Grams are per 200g-equivalent box contents. */
export interface Formula {
  robustaPct: number; // 0..1 of coffee solids; arabica = 1 - robusta
  solubleCoffeeG: number;
  sugarG: number;
  creamerG: number;
  flavorType: FlavorType;
  flavorG: number;
  roast: Roast;
  dryingTech: DryingTech;
  grade: Grade;
  sachetCount: number; // 1..30
  sachetWeightG: number; // 5..40
  packMaterial: PackMaterial;
}

/** Engine-derived product attributes (read-only in UI). */
export interface ProductAttributes {
  flavorStrength: number; // 0..100
  smoothness: number;
  sweetness: number;
  aroma: number;
  qualityIndex: number;
  defectRate: number; // 0..1
  packagingScore: number;
  sustainability: number;
  convenience: number;
  healthiness: number;
  unitCost: number; // USD per box, manufacturing at home base
  boxGrams: number;
}

export interface ProductVersion {
  id: string; // sku:v
  version: number;
  formula: Formula;
  attributes: ProductAttributes;
  effectiveRound: number; // producible from this round
}

export interface Sku {
  id: string;
  name: string;
  versions: ProductVersion[];
  retired: boolean;
}

/* ----------------------------- Inventory -------------------------------- */

export type Location = 'VN' | CountryCode;
export interface InventoryLot {
  location: Location;
  skuId: string;
  versionId: string;
  qty: number; // boxes
  unitCost: number; // USD book value per box (landed)
}

export interface ShipmentLine { skuId: string; versionId: string; qty: number; unitCost: number }
export interface Shipment {
  id: string;
  country: CountryCode;
  lines: ShipmentLine[];
  mode: FreightMode;
  service: ShipService;
  incoterm: Incoterm;
  insurance: CargoInsurance;
  departRound: number;
  etaRound: number;
  status: 'in_transit' | 'detained' | 'delivered' | 'lost';
  freightCost: number;
  dutyCost: number;
}

/* ----------------------------- Company state ---------------------------- */

export interface Loan {
  id: string;
  currency: 'USD' | 'VND';
  principalLocal: number; // in loan currency
  outstandingLocal: number;
  carryingUsd: number; // book value in USD (re-measured each round for VND loans)
  annualRate: number;
  maturityRound: number;
  emergency?: boolean;
}

export interface CountryPresence {
  mode: EntryMode | null;
  scale: EntryScale;
  status: 'none' | 'pending' | 'active' | 'exited';
  activationRound: number | null;
  partnerId: string | null;
  ownershipPct: number; // for JV
  brand: number; // 0..100 (derived)
  awareness: number; // 0..100 (derived)
  coverage: number; // 0..1 (derived)
  satisfaction: number; // 0..100 (derived)
  trust: number; // 0..100 (derived)
  localCapacity: number; // boxes / quarter for local production modes
  localAssets: number; // USD book value of local facility
  goodwill: number; // USD intangible from an acquisition in this country
  labelLocalized: Record<string, boolean>; // skuId -> compliant local label
  politicalPolicy: { tier: PolicyTier; activeFrom: number } | null;
  receivables: { dueRound: number; amount: number }[];
}

export interface Ledger {
  // balance sheet (USD)
  cash: number;
  receivables: number;
  inventory: number;
  ppe: number; // net plant/property
  intangibles: number; // capitalised entry costs (licences, acquisition goodwill)
  debt: number;
  equityCapital: number;
  retainedEarnings: number;
}

export interface JournalLine { account: string; debit: number; credit: number }
export interface JournalEntry { companyId: string; round: number; source: string; memo: string; lines: JournalLine[] }

export interface IncomeStatement {
  revenue: number;
  royaltyIncome: number;
  cogs: number;
  marketing: number;
  rnd: number;
  logistics: number;
  tariffs: number;
  admin: number;
  depreciation: number;
  riskLoss: number;
  insuranceRecovery: number;
  interest: number;
  fxGainLoss: number;
  tax: number;
  netIncome: number;
}

export interface CashFlow {
  opening: number;
  operating: number;
  investing: number;
  financing: number;
  closing: number;
}

export interface CompanyState {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  botStrategy?: BotStrategy;
  status: 'active' | 'bankrupt';
  ledger: Ledger;
  loans: Loan[];
  vnCapacity: number;
  capacityProjects: { addBoxes: number; readyRound: number; cost: number }[];
  freezeTechProgress: number; // cumulative innovation USD
  hasFreezeTech: boolean;
  processMaturity: number; // 0..1 from R&D + QC
  rdStock: number; // accumulated R&D knowledge
  skus: Sku[];
  inventory: InventoryLot[];
  shipments: Shipment[];
  countries: Record<CountryCode, CountryPresence>;
  hedges: { currency: Currency; ratio: number; lockedRate: number; round: number }[];
  taxLossCarry: number;
  claims: { dueRound: number; amount: number; memo: string }[];
  research: ResearchReport[];
  cumulativeNetIncome: number;
  cumulativeInvested: number;
  history: CompanyRoundRecord[];
  notes: Record<string, string>; // academic artifacts, never fed to the engine
}

export type BotStrategy = 'price_leader' | 'quality_differentiator' | 'focused_niche' | 'export_first' | 'jv_diversifier' | 'conservative';

export interface ResearchReport {
  round: number; // round in which it was produced (available afterwards)
  country: CountryCode;
  tier: ResearchTier;
  segments: { id: SegmentId; size: number; ideal: SegmentDef['ideal']; priceSensitivity: number; refPrice: number }[];
  avgCompetitorPrice: number | null;
  errorBand: number; // ± fraction
}

/* ----------------------------- Decisions -------------------------------- */

export interface SkuDecision {
  skuId: string; // existing id or new id
  name: string;
  formula: Formula; // if different from current version -> new version
  retire?: boolean;
  recertify?: boolean; // re-run the lab with the same formula to capture process-maturity gains
}

export interface CountryDecision {
  entryAction: 'hold' | 'enter' | 'exit';
  entryMode: EntryMode;
  entryScale: EntryScale;
  partnerId: string | null;
  ownershipPct: number;
  researchTier: ResearchTier;
  targetSegments: SegmentId[];
  prices: Record<string, number>; // skuId -> local currency consumer list price
  offered: Record<string, boolean>; // skuId -> sell in this country
  promotionRate: number; // 0..0.30
  promotionKind: PromotionKind;
  ads: Record<AdChannel, number>; // USD
  messageTheme: MessageTheme;
  localizationBudget: number;
  tradeSpend: number;
  retailerMargin: number; // 0..0.5
  ecommerce: boolean;
  retail: boolean;
  serviceBudget: number;
  creditDays: 0 | 30 | 60 | 90;
  politicalPolicy: PolicyTier;
  labelLocalize: Record<string, boolean>; // skuId -> pay for compliant label this round
  localProduction: Record<string, number>; // skuId -> boxes (local factory modes)
  trainingBudget: number;
  salaryPolicy: SalaryPolicy;
  hedgeRatio: number; // 0..1 for this country's currency
}

export interface ShipmentDecision {
  country: CountryCode;
  skuId: string;
  qty: number;
  mode: FreightMode;
  service: ShipService;
  incoterm: Incoterm;
  insurance: CargoInsurance;
}

export interface Decision {
  round: number;
  skus: SkuDecision[];
  production: Record<string, number>; // skuId -> boxes at VN plant
  outsourcing: Record<string, number>; // skuId -> boxes contracted out
  rdBudget: number;
  qualityBudget: number;
  innovationBudget: number;
  maintenanceBudget: number;
  capacityCapex: number;
  dualSourcingSpend: number;
  countries: Record<CountryCode, CountryDecision>;
  shipments: ShipmentDecision[];
  newLoan: number;
  loanCurrency: 'USD' | 'VND';
  loanTermRounds: number; // 2 = short, 8 = long
  debtRepayment: number;
  minCashReserve: number;
  dividend: number;
  submitted: boolean;
  revision: number;
}

/* ----------------------------- Scenario (Environment) ------------------- */

export interface SegmentDef {
  id: SegmentId;
  name: string;
  share: number; // of country market, sums to 1
  // ideal attribute points 0..100
  ideal: { flavorStrength: number; smoothness: number; sweetness: number; aroma: number; healthiness: number };
  // preference weights
  w: {
    price: number; fit: number; quality: number; brand: number; coverage: number; awareness: number;
    packaging: number; sustainability: number; convenience: number; trust: number;
  };
  fitW: { flavorStrength: number; smoothness: number; sweetness: number; aroma: number; healthiness: number };
  themeAffinity: Record<MessageTheme, number>; // 0..1
  promoAffinity: Record<PromotionKind, number>; // how much the segment responds to each promotion type
  referencePrice: number; // local currency per 200g box
  outsideU: number; // utility of the outside option (non-buyers / other categories)
}

export interface CountryEnv {
  code: CountryCode;
  name: string;
  currency: Currency;
  language: string;
  fxRate: number; // local per 1 USD
  fxVolatility: number; // per quarter std dev (log)
  marketSizeBoxes: number; // per quarter potential incl. non-buyers
  marketGrowth: number; // per quarter
  gdpGrowth: number;
  inflation: number; // annual
  interestRate: number;
  importTariff: number; // 0..2
  importQuota: number; // boxes per quarter per company, 0 = unrestricted
  foreignOwnershipCap: number; // 0..1
  laborCostIndex: number; // 100 = VN base x1? relative
  consumerIncomeIndex: number;
  regulatoryEnforcement: number; // 0..100
  digitalPenetration: number; // 0..100
  cultureDistance: number; // 0..100
  portDelayDays: number;
  politicalRisk: number; // 0..100
  corporateTax: number;
  vat: number;
  carbonTax: number; // USD per box shipped equivalent
  closedModes: number; // bitmask 1=sea 2=air 4=multimodal (route closures from events)
  channelEffect: Record<AdChannel, number>;
  sustainabilityPremium: number; // extra utility weight on sustainability (GB style)
  segments: SegmentDef[];
}

export interface RouteDef {
  country: CountryCode;
  mode: FreightMode;
  costPerBox: number; // USD standard service
  leadRounds: number; // 0 = arrives in the same quarter
  delayProb: number;
  lossProb: number;
}

export interface PartnerDef {
  id: string;
  country: CountryCode;
  name: string;
  kind: 'trading_house' | 'distributor' | 'licensee' | 'franchisee' | 'jv_partner' | 'acquisition_target';
  quality: number; // 0..1 execution quality
  coverageBoost: number; // 0..1 initial coverage
  feeOrMargin: number; // margin / royalty / price
  description: string;
}

export interface EventEffect {
  variable: string; // registry key
  op: 'SET' | 'ADD' | 'MULTIPLY' | 'CAP' | 'FLOOR';
  value: number;
}

export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  scope: 'country' | 'global';
  country?: CountryCode;
  trigger: 'fixed' | 'probabilistic';
  round: number; // fixed: the round; probabilistic: first eligible round
  endRound: number;
  probability: number;
  severity: number; // 0..100 (scales stock/asset loss)
  durationRounds: number;
  effects: EventEffect[];
  destroysExposure: boolean; // political/war style asset+inventory loss
  publicAnnouncement: boolean;
  enabled: boolean;
}

export interface EventInstance {
  templateId: string;
  name: string;
  description: string;
  country?: CountryCode;
  round: number;
  untilRound: number;
  severity: number;
}

export interface GlobalEnv {
  coffeePriceIndex: number; // 100 = base
  vndPerUsd: number;
  usdInterestRate: number;
  vndInterestRate: number;
  vnCorporateTax: number;
  baseCapacityCostPerBox: number; // capex per box/quarter capacity
}

export interface Scenario {
  id: string;
  name: string;
  version: number;
  countries: Record<CountryCode, CountryEnv>;
  routes: RouteDef[];
  partners: PartnerDef[];
  events: EventTemplate[];
  global: GlobalEnv;
  scoring: { profit: number; share: number; roic: number; brand: number; resilience: number };
  initial: {
    cash: number;
    vnCapacity: number;
    brand: number;
    plantValue: number;
  };
  practiceRounds: number;
  scoredRounds: number;
}

/* ----------------------------- Results ---------------------------------- */

export type PositionLabel = 'Economy' | 'Value for Money' | 'Mainstream' | 'Premium' | 'Overpriced' | 'Niche Specialist' | 'Not present';

export interface PositionSnapshot {
  companyId: string;
  country: CountryCode;
  rpi: number;
  perceivedQuality: number;
  perceivedValue: number;
  label: PositionLabel;
  volumeShare: number;
}

export interface SegmentResult {
  companyId: string;
  country: CountryCode;
  segment: SegmentId;
  skuId: string;
  demand: number;
  sales: number;
  utility: number;
  fit: number;
}

export interface CountryResult {
  companyId: string;
  country: CountryCode;
  salesBoxes: number;
  demandBoxes: number;
  stockouts: number;
  revenueUSD: number;
  volumeShare: number;
  revenueShare: number;
  brand: number;
  coverage: number;
  satisfaction: number;
}

export interface CompanyRoundRecord {
  round: number;
  income: IncomeStatement;
  cashFlow: CashFlow;
  balance: Ledger;
  score: number;
  scoreParts: Record<string, number>;
  strategyInferred: string;
  messages: string[];
  decision?: Decision; // archived frozen input (own-team visibility only)
}

export interface RoundResult {
  round: number;
  seed: number;
  engineVersion: string;
  inputHash: string;
  outputHash: string;
  events: EventInstance[];
  marketSize: Record<CountryCode, number>;
  fx: Record<string, number>;
  countryResults: CountryResult[];
  segmentResults: SegmentResult[];
  positions: PositionSnapshot[];
  leaderboard: { companyId: string; score: number; rank: number; parts: Record<string, number> }[];
  journal: JournalEntry[];
}

export type Phase = 'SETUP' | 'OPEN' | 'LOCKED' | 'PROCESSING' | 'PUBLISHED' | 'FINISHED';

export interface AuditEntry { at: string; round: number; actor: string; event: string; detail: string }

export interface GameState {
  id: string;
  name: string;
  engineVersion: string;
  seed: number;
  round: number; // current open round (1-based)
  phase: Phase;
  scenario: Scenario;
  marketSize: Record<CountryCode, Record<SegmentId, number>>;
  fx: Record<Currency, number>;
  env: Record<CountryCode, CountryEnv>; // live environment after events
  activeEvents: EventInstance[];
  companies: CompanyState[];
  decisions: Record<string, Decision>; // companyId -> draft for current round
  results: RoundResult[];
  audit: AuditEntry[];
  owner?: string; // account that created the game
  pins?: Record<string, string>; // optional hot-seat team PINs (local play only)
}
