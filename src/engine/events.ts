// Scenario variable registry + event DSL (SRS §6). Only registered variables may be touched by an
// event effect; operators are limited to SET/ADD/MULTIPLY/CAP/FLOOR. No executable code is accepted.
import type { CountryCode, CountryEnv, EventEffect, EventInstance, EventTemplate, GlobalEnv } from './types';
import { Rng } from './rng';
import { clamp } from './util';

export interface RegistryEntry {
  key: string;
  title: string;
  scope: 'country' | 'global';
  min: number;
  max: number;
  unit: string;
  gmEditable: boolean;
  description: string;
}

export const VARIABLE_REGISTRY: RegistryEntry[] = [
  { key: 'politicalRisk', title: 'Political risk', scope: 'country', min: 0, max: 100, unit: 'index', gmEditable: true, description: 'Incident probability & capital exposure' },
  { key: 'gdpGrowth', title: 'GDP growth', scope: 'country', min: -0.25, max: 0.25, unit: '%/yr', gmEditable: true, description: 'Demand baseline' },
  { key: 'inflation', title: 'Inflation', scope: 'country', min: -0.1, max: 1, unit: '%/yr', gmEditable: true, description: 'Local costs & nominal reference prices' },
  { key: 'fxRate', title: 'FX rate (local per USD)', scope: 'country', min: 0.0001, max: 1e7, unit: 'local/USD', gmEditable: true, description: 'Transactions and translation' },
  { key: 'fxVolatility', title: 'FX volatility', scope: 'country', min: 0, max: 0.5, unit: 'σ/qtr', gmEditable: true, description: 'Quarterly random walk' },
  { key: 'interestRate', title: 'Interest rate', scope: 'country', min: 0, max: 0.6, unit: '%/yr', gmEditable: true, description: 'Local borrowing' },
  { key: 'importTariff', title: 'Import tariff', scope: 'country', min: 0, max: 2, unit: 'ratio', gmEditable: true, description: 'CIF landed cost' },
  { key: 'importQuota', title: 'Import quota', scope: 'country', min: 0, max: 1e9, unit: 'boxes/qtr/company (0 = none)', gmEditable: true, description: 'Customs clearance limit' },
  { key: 'foreignOwnershipCap', title: 'Foreign ownership cap', scope: 'country', min: 0, max: 1, unit: 'ratio', gmEditable: true, description: 'Entry feasibility' },
  { key: 'laborCostIndex', title: 'Labour cost index', scope: 'country', min: 0, max: 300, unit: 'index', gmEditable: true, description: 'Local factory & staffing cost' },
  { key: 'consumerIncomeIndex', title: 'Consumer income', scope: 'country', min: 0, max: 300, unit: 'index', gmEditable: true, description: 'Price response' },
  { key: 'regulatoryEnforcement', title: 'Regulatory enforcement', scope: 'country', min: 0, max: 100, unit: 'index', gmEditable: true, description: 'Inspection / detention probability' },
  { key: 'digitalPenetration', title: 'Digital penetration', scope: 'country', min: 0, max: 100, unit: 'index', gmEditable: true, description: 'E-commerce & digital ad reach' },
  { key: 'cultureDistance', title: 'Culture distance (CAGE)', scope: 'country', min: 0, max: 100, unit: 'index', gmEditable: true, description: 'Localization mismatch' },
  { key: 'portDelayDays', title: 'Port delay', scope: 'country', min: 0, max: 180, unit: 'days', gmEditable: true, description: 'Arrival delay risk' },
  { key: 'carbonTax', title: 'Carbon / packaging levy', scope: 'country', min: 0, max: 5, unit: 'USD/box', gmEditable: true, description: 'Per box imported' },
  { key: 'marketSizeBoxes', title: 'Market potential', scope: 'country', min: 0, max: 1e9, unit: 'boxes/qtr', gmEditable: true, description: 'Segment potentials' },
  { key: 'marketGrowth', title: 'Market growth', scope: 'country', min: -1, max: 3, unit: '%/qtr', gmEditable: true, description: 'Demand baseline drift' },
  { key: 'corporateTax', title: 'Corporate tax', scope: 'country', min: 0, max: 0.6, unit: 'ratio', gmEditable: true, description: 'Informational (blended home tax applied)' },
  { key: 'vat', title: 'VAT / sales tax', scope: 'country', min: 0, max: 0.4, unit: 'ratio', gmEditable: true, description: 'Removed from consumer price before revenue' },
  { key: 'marketSizeMult', title: 'Demand shock multiplier', scope: 'country', min: 0, max: 5, unit: 'x', gmEditable: false, description: 'Temporary event multiplier on potential' },
  { key: 'closedModes', title: 'Closed freight modes', scope: 'country', min: 0, max: 7, unit: 'bitmask 1 sea / 2 air / 4 multimodal', gmEditable: false, description: 'Route closures' },
  { key: 'coffeePriceIndex', title: 'Green coffee price index', scope: 'global', min: 10, max: 500, unit: 'index', gmEditable: true, description: 'Raw material cost' },
];

const REGISTRY_KEYS = new Set(VARIABLE_REGISTRY.map((r) => r.key));
export const registryEntry = (key: string) => VARIABLE_REGISTRY.find((r) => r.key === key);

/** T-25: reject any effect outside the registry or with an unknown operator. */
export function validateEventTemplate(t: EventTemplate): string[] {
  const errs: string[] = [];
  if (!t.id || !t.name) errs.push('Event needs id and name');
  if (t.scope === 'country' && !t.country) errs.push('Country-scoped event needs a country');
  if (!(t.probability >= 0 && t.probability <= 1)) errs.push('Probability must be 0..1');
  if (!(t.severity >= 0 && t.severity <= 100)) errs.push('Severity must be 0..100');
  for (const e of t.effects) {
    if (!REGISTRY_KEYS.has(e.variable)) errs.push(`Effect variable "${e.variable}" is not in the registry`);
    if (!['SET', 'ADD', 'MULTIPLY', 'CAP', 'FLOOR'].includes(e.op)) errs.push(`Operator "${e.op}" not allowed`);
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) errs.push(`Effect value for ${e.variable} must be a finite number`);
    const reg = registryEntry(e.variable);
    if (reg && reg.scope === 'global' && t.scope === 'country') errs.push(`${e.variable} is a global variable`);
  }
  return errs;
}

export function applyOp(current: number, e: EventEffect): number {
  switch (e.op) {
    case 'SET': return e.value;
    case 'ADD': return current + e.value;
    case 'MULTIPLY': return current * e.value;
    case 'CAP': return Math.min(current, e.value);
    case 'FLOOR': return Math.max(current, e.value);
  }
}

/** Sample which templates fire this round (seeded, so deterministic). */
export function sampleEvents(templates: EventTemplate[], round: number, seed: number, active: EventInstance[]): EventInstance[] {
  const rng = Rng.stream(seed, round, 'events');
  const fired: EventInstance[] = [];
  for (const t of templates) {
    const draw = rng.next(); // always consume one draw per template to keep streams stable
    if (!t.enabled || validateEventTemplate(t).length) continue;
    if (active.some((a) => a.templateId === t.id && a.untilRound >= round)) continue;
    const hit = t.trigger === 'fixed' ? t.round === round : round >= t.round && round <= t.endRound && draw < t.probability;
    if (hit) {
      fired.push({ templateId: t.id, name: t.name, description: t.description, country: t.country, round, untilRound: round + Math.max(1, t.durationRounds) - 1, severity: t.severity });
    }
  }
  return fired;
}

/** Build live environment = base scenario values + effects of active events. */
export function applyEventEffects(
  base: Record<CountryCode, CountryEnv>, global: GlobalEnv, active: EventInstance[], templates: EventTemplate[],
): { env: Record<CountryCode, CountryEnv>; global: GlobalEnv; demandMult: Record<CountryCode, number> } {
  const env = JSON.parse(JSON.stringify(base)) as Record<CountryCode, CountryEnv>;
  const g = { ...global };
  const demandMult: Record<CountryCode, number> = { CN: 1, JP: 1, US: 1, GB: 1 };
  for (const inst of active) {
    const t = templates.find((x) => x.id === inst.templateId);
    if (!t) continue;
    const targets = (t.scope === 'global' ? (Object.keys(env) as CountryCode[]) : [t.country!]);
    for (const e of t.effects) {
      const reg = registryEntry(e.variable);
      if (!reg) continue;
      if (reg.scope === 'global') {
        if (e.variable === 'coffeePriceIndex') g.coffeePriceIndex = clamp(applyOp(g.coffeePriceIndex, e), reg.min, reg.max);
        continue;
      }
      for (const c of targets) {
        if (e.variable === 'marketSizeMult') { demandMult[c] = clamp(applyOp(demandMult[c], e), reg.min, reg.max); continue; }
        if (e.variable === 'closedModes') {
          env[c].closedModes = e.op === 'SET' ? (env[c].closedModes | e.value) : clamp(applyOp(env[c].closedModes, e), 0, 7);
          continue;
        }
        const rec = env[c] as unknown as Record<string, number>;
        if (typeof rec[e.variable] === 'number') rec[e.variable] = clamp(applyOp(rec[e.variable], e), reg.min, reg.max);
      }
    }
  }
  return { env, global: g, demandMult };
}
