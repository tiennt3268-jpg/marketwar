// Country Market Engine (SRS §8.1): segment utilities, stable multinomial logit with an outside
// option, and inventory-constrained allocation with re-allocation of stock-out demand.
import type { CountryEnv, ProductAttributes, SegmentDef, SegmentId } from './types';
import { clamp } from './util';

export interface Offer {
  key: string; // companyId|skuId
  companyId: string;
  skuId: string;
  attrs: ProductAttributes;
  price: number; // consumer list price, local currency
  promoRate: number;
  promoKind: 'price_cut' | 'coupon' | 'bundle' | 'loyalty';
  brand: number; // 0..100
  awareness: number; // 0..100
  coverage: number; // 0..1
  trust: number; // 0..100
  localization: number; // 0..1
  messageTheme: 'origin' | 'value' | 'flavor' | 'convenience' | 'sustainability';
  targetSegments: SegmentId[];
  qualityAdj: number; // multiplier for licensed production quality
  stock: number; // sellable boxes this round
}

export function productFit(attrs: ProductAttributes, seg: SegmentDef): number {
  const w = seg.fitW;
  const tot = w.flavorStrength + w.smoothness + w.sweetness + w.aroma + w.healthiness;
  const dev =
    w.flavorStrength * Math.abs(attrs.flavorStrength - seg.ideal.flavorStrength) +
    w.smoothness * Math.abs(attrs.smoothness - seg.ideal.smoothness) +
    w.sweetness * Math.abs(attrs.sweetness - seg.ideal.sweetness) +
    w.aroma * Math.abs(attrs.aroma - seg.ideal.aroma) +
    w.healthiness * Math.abs(attrs.healthiness - seg.ideal.healthiness);
  return clamp(100 - (dev / tot) * 1.6, 0, 100);
}

const PROMO_EFFECT = { price_cut: 1, coupon: 0.7, bundle: 0.8, loyalty: 0.5 } as const;

/** Price a consumer perceives, normalised to the 200 g standard box. */
export function equivalentPrice(o: Pick<Offer, 'price' | 'promoRate' | 'promoKind' | 'attrs'>): number {
  const discount = clamp(o.promoRate, 0, 0.3) * PROMO_EFFECT[o.promoKind];
  return (o.price * (1 - discount) * 200) / Math.max(1, o.attrs.boxGrams);
}

export function utility(o: Offer, seg: SegmentDef, env: CountryEnv): { u: number; fit: number } {
  const fit = productFit(o.attrs, seg);
  const w = seg.w;
  const eqPrice = Math.max(0.0001, equivalentPrice(o));
  const incomeAdj = 100 / Math.max(20, env.consumerIncomeIndex); // poorer markets more price-sensitive
  const priceTerm = -w.price * Math.sqrt(incomeAdj) * Math.log(eqPrice / seg.referencePrice);
  const targeted = o.targetSegments.includes(seg.id) ? 1 : 0.55;
  const message = 0.6 * seg.themeAffinity[o.messageTheme] * (o.awareness / 100) * targeted;
  const promoPull = 1.2 * clamp(o.promoRate, 0, 0.3) * seg.promoAffinity[o.promoKind];
  const cultural = -(env.cultureDistance / 100) * 0.9 * (1 - o.localization);
  const quality = (o.attrs.qualityIndex * o.qualityAdj) / 100;
  const u =
    w.fit * (fit / 100) +
    w.quality * quality +
    priceTerm +
    w.brand * (o.brand / 100) +
    w.awareness * (o.awareness / 100) * targeted +
    w.packaging * (o.attrs.packagingScore / 100) +
    (w.sustainability + env.sustainabilityPremium) * (o.attrs.sustainability / 100) +
    w.convenience * (o.attrs.convenience / 100) +
    w.trust * (o.trust / 100) +
    w.coverage * Math.log(Math.max(0.005, o.coverage)) +
    message + promoPull + cultural;
  return { u, fit };
}

/** Stable softmax with outside option (T-23: no overflow/NaN for extreme utilities). */
export function choiceProbabilities(us: number[], outsideU: number, tau = 1): { p: number[]; outside: number } {
  const all = [outsideU, ...us].map((x) => (Number.isFinite(x) ? x : -1e9));
  const max = Math.max(...all);
  const ex = all.map((x) => Math.exp((x - max) / tau));
  const tot = ex.reduce((a, b) => a + b, 0);
  return { p: ex.slice(1).map((e) => e / tot), outside: ex[0] / tot };
}

export interface AllocationResult {
  sales: Record<string, Record<SegmentId, number>>; // offer key -> segment -> boxes
  demand: Record<string, Record<SegmentId, number>>; // first-choice demand
  utilities: Record<string, Record<SegmentId, { u: number; fit: number }>>;
  unserved: number;
}

/**
 * Allocate segment demand to offers subject to stock. Demand left unmet by a stocked-out offer is
 * re-offered to remaining offers (renormalised logit incl. outside option) for a few passes; the rest
 * is lost to the outside option. Integer boxes; sum(sales) ≤ stock and ≤ market potential.
 */
export function allocate(offers: Offer[], segments: SegmentDef[], potential: Record<SegmentId, number>, env: CountryEnv): AllocationResult {
  const sales: AllocationResult['sales'] = {};
  const demand: AllocationResult['demand'] = {};
  const utilities: AllocationResult['utilities'] = {};
  const remaining: Record<string, number> = {};
  for (const o of offers) {
    sales[o.key] = { budget: 0, mainstream: 0, premium: 0, health: 0 };
    demand[o.key] = { budget: 0, mainstream: 0, premium: 0, health: 0 };
    utilities[o.key] = {} as Record<SegmentId, { u: number; fit: number }>;
    remaining[o.key] = Math.max(0, Math.floor(o.stock));
  }
  let unserved = 0;
  for (const seg of segments) {
    const M = Math.max(0, potential[seg.id] ?? 0);
    const us = offers.map((o) => {
      const r = utility(o, seg, env);
      utilities[o.key][seg.id] = r;
      return r.u;
    });
    if (!offers.length) { unserved += M; continue; }
    let pool = M;
    let { p } = choiceProbabilities(us, seg.outsideU);
    offers.forEach((o, i) => { demand[o.key][seg.id] = p[i] * M; });
    let active = offers.map(() => true);
    for (let pass = 0; pass < 5 && pool > 0.5; pass++) {
      let leftover = 0;
      let soldThisPass = 0;
      offers.forEach((o, i) => {
        if (!active[i]) return;
        const want = p[i] * pool;
        const take = Math.min(remaining[o.key] - 0, Math.floor(want));
        const got = Math.max(0, take);
        sales[o.key][seg.id] += got;
        remaining[o.key] -= got;
        soldThisPass += got;
        if (want - got > 1e-9 && remaining[o.key] <= 0) { leftover += want - got; active[i] = false; }
      });
      // Only demand that hit a stock-out is re-offered; the rest of the pool chose the outside option.
      pool = leftover * 0.6; // 60% of disappointed shoppers look for a substitute in the category
      if (!active.some(Boolean)) break;
      const sub = choiceProbabilities(offers.map((_, i) => (active[i] ? us[i] : -1e9)), seg.outsideU);
      p = sub.p;
      if (soldThisPass === 0 && leftover === 0) break;
    }
    const soldSeg = offers.reduce((a, o) => a + sales[o.key][seg.id], 0);
    unserved += M - soldSeg;
  }
  return { sales, demand, utilities, unserved };
}
