// Deterministic random numbers and hashing. Every stochastic draw is taken from a stream
// derived from (game seed, round, namespace) so results never depend on call order elsewhere.

export function hashString(str: string, seed = 0): number {
  // cyrb53 (53-bit), returned as an unsigned 32-bit-safe integer
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function hashHex(value: unknown): string {
  return hashString(stableStringify(value)).toString(16).padStart(14, '0');
}

/** JSON stringify with sorted keys so equal objects hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().filter((k) => obj[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  static stream(gameSeed: number, round: number, namespace: string): Rng {
    return new Rng(hashString(`${gameSeed}|${round}|${namespace}`) >>> 0);
  }
  /** mulberry32 – uniform [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** standard normal via Box–Muller */
  normal(): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}
