// Product & Cost Engine (SRS §II, §8.1): the player edits inputs (BOM, technology, grade, packaging);
// the engine derives every quality/taste/cost attribute. Indicative formulas, not food science.
import type { Formula, ProductAttributes, Roast } from './types';
import { clamp, round2 } from './util';

export const ROAST_VALUE: Record<Roast, number> = { light: 30, medium: 55, dark: 80 };
const GRADE_Q = { standard: 0, select: 9, premium: 18 } as const;
const GRADE_COST = { standard: 1, select: 1.15, premium: 1.35 } as const;
const PACK = {
  standard: { score: 45, sust: 25, base: 0.18, perSachet: 0.012 },
  premium: { score: 82, sust: 35, base: 0.45, perSachet: 0.025 },
  recyclable: { score: 65, sust: 82, base: 0.32, perSachet: 0.018 },
} as const;

export const FORMULA_LIMITS = {
  sachetCount: [1, 30],
  sachetWeightG: [5, 40],
  massTolerance: 0.5,
  maxFlavorShare: 0.05,
  minCoffeeShare: 0.08,
};

export function boxGrams(f: Formula): number {
  return f.sachetCount * f.sachetWeightG;
}

export function formulaMass(f: Formula): number {
  return f.solubleCoffeeG + f.sugarG + f.creamerG + (f.flavorType === 'none' ? 0 : f.flavorG);
}

/** Returns a list of BOM violations (empty = valid). Mirrors T-03. */
export function validateFormula(f: Formula): string[] {
  const errs: string[] = [];
  const nums: [string, number][] = [
    ['robustaPct', f.robustaPct], ['solubleCoffeeG', f.solubleCoffeeG], ['sugarG', f.sugarG],
    ['creamerG', f.creamerG], ['flavorG', f.flavorG], ['sachetCount', f.sachetCount], ['sachetWeightG', f.sachetWeightG],
  ];
  for (const [k, v] of nums) if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errs.push(`${k} must be a non-negative number`);
  if (errs.length) return errs;
  if (f.robustaPct > 1) errs.push('Robusta + Arabica must equal 100% (robustaPct ≤ 1)');
  if (!Number.isInteger(f.sachetCount) || f.sachetCount < 1 || f.sachetCount > 30) errs.push('Sachets per box must be an integer 1–30');
  if (f.sachetWeightG < 5 || f.sachetWeightG > 40) errs.push('Sachet weight must be 5–40 g');
  const mass = formulaMass(f);
  const box = boxGrams(f);
  if (Math.abs(mass - box) > FORMULA_LIMITS.massTolerance)
    errs.push(`Ingredient mass ${mass.toFixed(1)} g must equal box contents ${box.toFixed(1)} g (sachets × weight)`);
  if (box > 0 && f.solubleCoffeeG / box < FORMULA_LIMITS.minCoffeeShare) errs.push('Soluble coffee must be at least 8% of contents');
  if (f.flavorType !== 'none' && box > 0 && f.flavorG / box > FORMULA_LIMITS.maxFlavorShare) errs.push('Flavouring may not exceed 5% of contents');
  if (f.flavorType === 'none' && f.flavorG > 0) errs.push('Flavour grams require a flavour type');
  return errs;
}

/** Engine-derived attributes. processMaturity 0..1 comes from accumulated R&D/QC. */
export function computeAttributes(f: Formula, processMaturity: number, coffeePriceIndex = 100): ProductAttributes {
  const box = Math.max(1, boxGrams(f));
  const coffee = f.solubleCoffeeG / box;
  const sugar = f.sugarG / box;
  const creamer = f.creamerG / box;
  const flavor = f.flavorType === 'none' ? 0 : f.flavorG / box;
  const rob = clamp(f.robustaPct, 0, 1);
  const roast = ROAST_VALUE[f.roast];
  const freeze = f.dryingTech === 'freeze';

  const flavorStrength = clamp(12 + 85 * Math.sqrt(coffee) * (0.72 + 0.38 * rob) + (roast - 55) * 0.35, 0, 100);
  const smoothness = clamp(28 + 38 * (1 - rob) + 60 * creamer + 15 * sugar + (freeze ? 12 : 0) - (roast - 55) * 0.4 + GRADE_Q[f.grade] * 0.5, 0, 100);
  const sweetness = clamp(sugar * 170 + creamer * 20 + (f.flavorType === 'vanilla' || f.flavorType === 'coconut' ? 6 : 0), 0, 100);
  const aroma = clamp(32 + 25 * (1 - rob) + (freeze ? 18 : 0) + GRADE_Q[f.grade] * 0.8 + Math.min(14, flavor * 400) - Math.abs(roast - 62) * 0.2, 0, 100);
  const healthiness = clamp(100 - sugar * 150 - creamer * 60 - flavor * 100, 0, 100);
  const pack = PACK[f.packMaterial];
  const qualityIndex = clamp(
    46 + GRADE_Q[f.grade] + (freeze ? 8 : 0) + processMaturity * 22 + (1 - rob) * 6 + (f.packMaterial === 'standard' ? 0 : 2) - Math.abs(roast - 60) * 0.05,
    0, 100);
  const defectRate = clamp(0.06 - GRADE_Q[f.grade] * 0.0012 - processMaturity * 0.03 - (freeze ? 0.005 : 0), 0.004, 0.2);
  const convenience = clamp(40 + Math.min(30, f.sachetCount * 2) + (coffee < 0.6 ? 15 : 0) - Math.abs(f.sachetWeightG - 18) * 1.2, 0, 100);
  const sustainability = clamp(pack.sust + (f.grade === 'premium' ? 10 : f.grade === 'select' ? 4 : 0), 0, 100);

  const unitCost = estimateUnitCost(f, coffeePriceIndex, defectRate);
  return {
    flavorStrength: round2(flavorStrength), smoothness: round2(smoothness), sweetness: round2(sweetness),
    aroma: round2(aroma), qualityIndex: round2(qualityIndex), defectRate: round2(defectRate * 1000) / 1000,
    packagingScore: pack.score, sustainability, convenience: round2(convenience), healthiness: round2(healthiness),
    unitCost, boxGrams: box,
  };
}

/** Unit manufacturing cost = materials + processing + packing + QC + expected scrap (USD/box). */
export function estimateUnitCost(f: Formula, coffeePriceIndex: number, defectRate: number): number {
  const rob = clamp(f.robustaPct, 0, 1);
  const coffeePerKg = (rob * 9 + (1 - rob) * 15) * GRADE_COST[f.grade] * (coffeePriceIndex / 100) * (f.dryingTech === 'freeze' ? 1.45 : 1);
  const materials = (f.solubleCoffeeG / 1000) * coffeePerKg + (f.sugarG / 1000) * 0.8 + (f.creamerG / 1000) * 2.5 +
    (f.flavorType === 'none' ? 0 : (f.flavorG / 1000) * 20);
  const pack = PACK[f.packMaterial];
  const packaging = pack.base + pack.perSachet * f.sachetCount;
  const processing = 0.18 + (f.dryingTech === 'freeze' ? 0.15 : 0) + 0.003 * f.sachetCount;
  const qc = 0.05;
  return round2((materials + packaging + processing + qc) / (1 - defectRate));
}

export function defaultFormula(): Formula {
  return {
    robustaPct: 0.7, solubleCoffeeG: 80, sugarG: 60, creamerG: 60, flavorType: 'none', flavorG: 0,
    roast: 'medium', dryingTech: 'spray', grade: 'standard', sachetCount: 10, sachetWeightG: 20, packMaterial: 'standard',
  };
}

export const FORMULA_PRESETS: Record<string, Formula> = {
  'Classic 3-in-1': defaultFormula(),
  'Pure Black Robusta': { robustaPct: 0.9, solubleCoffeeG: 200, sugarG: 0, creamerG: 0, flavorType: 'none', flavorG: 0, roast: 'dark', dryingTech: 'spray', grade: 'select', sachetCount: 25, sachetWeightG: 8, packMaterial: 'standard' },
  'Premium Freeze-Dried Arabica': { robustaPct: 0.2, solubleCoffeeG: 200, sugarG: 0, creamerG: 0, flavorType: 'none', flavorG: 0, roast: 'medium', dryingTech: 'freeze', grade: 'premium', sachetCount: 25, sachetWeightG: 8, packMaterial: 'premium' },
  'Low-Sugar 2-in-1': { robustaPct: 0.5, solubleCoffeeG: 90, sugarG: 15, creamerG: 75, flavorType: 'none', flavorG: 0, roast: 'medium', dryingTech: 'spray', grade: 'select', sachetCount: 12, sachetWeightG: 15, packMaterial: 'recyclable' },
  'Coconut Latte': { robustaPct: 0.6, solubleCoffeeG: 70, sugarG: 60, creamerG: 64, flavorType: 'coconut', flavorG: 6, roast: 'medium', dryingTech: 'spray', grade: 'standard', sachetCount: 10, sachetWeightG: 20, packMaterial: 'standard' },
};

/** Fix ingredient grams so total equals box contents by adjusting soluble coffee. */
export function balanceFormula(f: Formula): Formula {
  const box = boxGrams(f);
  const others = f.sugarG + f.creamerG + (f.flavorType === 'none' ? 0 : f.flavorG);
  return { ...f, solubleCoffeeG: round2(Math.max(0, box - others)), flavorG: f.flavorType === 'none' ? 0 : f.flavorG };
}

export function sameFormula(a: Formula, b: Formula): boolean {
  return (Object.keys(a) as (keyof Formula)[]).every((k) => a[k] === b[k]);
}
