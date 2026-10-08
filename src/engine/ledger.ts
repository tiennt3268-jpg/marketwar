// Double-entry books (SRS §8.3). Every posting must balance (T-16); P&L accounts close to retained
// earnings at period end, and the cash account is tagged by activity for the cash-flow statement.
import type { CashFlow, IncomeStatement, JournalEntry, JournalLine, Ledger } from './types';

const BS_ACCOUNTS = ['Cash', 'AR', 'Inventory', 'PPE', 'Intangibles', 'Debt', 'Equity', 'RetainedEarnings'] as const;
const ASSETS = new Set(['Cash', 'AR', 'Inventory', 'PPE', 'Intangibles']);
export const PL_ACCOUNTS = [
  'Revenue', 'RoyaltyIncome', 'COGS', 'Marketing', 'RnD', 'Logistics', 'Tariffs', 'Admin', 'Depreciation',
  'RiskLoss', 'InsuranceRecovery', 'Interest', 'FXGainLoss', 'Tax',
] as const;
export type Account = (typeof BS_ACCOUNTS)[number] | (typeof PL_ACCOUNTS)[number];
export type CashActivity = 'operating' | 'investing' | 'financing';

const r2 = (x: number) => Math.round(x * 100) / 100;

export class Books {
  entries: JournalEntry[] = [];
  pl: Record<string, number> = {}; // credit-positive balances of P&L accounts
  cashFlow: Record<CashActivity, number> = { operating: 0, investing: 0, financing: 0 };
  readonly openingCash: number;

  constructor(public ledger: Ledger, public round: number, public companyId = '') {
    for (const a of PL_ACCOUNTS) this.pl[a] = 0;
    this.openingCash = ledger.cash;
  }

  post(source: string, memo: string, lines: { account: Account; debit?: number; credit?: number }[], activity: CashActivity = 'operating') {
    const jl: JournalLine[] = lines
      .map((l) => ({ account: l.account, debit: r2(Math.max(0, l.debit ?? 0)), credit: r2(Math.max(0, l.credit ?? 0)) }))
      .filter((l) => l.debit > 0 || l.credit > 0);
    if (!jl.length) return;
    const dr = jl.reduce((a, l) => a + l.debit, 0);
    const cr = jl.reduce((a, l) => a + l.credit, 0);
    const diff = r2(dr - cr);
    if (Math.abs(diff) >= 0.01) {
      // rounding residue from r2 on several lines: book it to the first line so the entry balances
      if (Math.abs(diff) < 0.05 * jl.length) {
        const fix = jl[0];
        if (fix.debit > 0) fix.debit = r2(fix.debit - diff); else fix.credit = r2(fix.credit + diff);
      } else {
        throw new Error(`Unbalanced journal entry ${source}: Dr ${dr} ≠ Cr ${cr}`);
      }
    }
    for (const l of jl) this.apply(l, activity);
    this.entries.push({ companyId: this.companyId, round: this.round, source, memo, lines: jl });
  }

  private apply(l: JournalLine, activity: CashActivity) {
    const L = this.ledger as unknown as Record<string, number>;
    const net = l.debit - l.credit;
    switch (l.account) {
      case 'Cash': L.cash = r2(L.cash + net); this.cashFlow[activity] = r2(this.cashFlow[activity] + net); return;
      case 'AR': L.receivables = r2(L.receivables + net); return;
      case 'Inventory': L.inventory = r2(L.inventory + net); return;
      case 'PPE': L.ppe = r2(L.ppe + net); return;
      case 'Intangibles': L.intangibles = r2(L.intangibles + net); return;
      case 'Debt': L.debt = r2(L.debt - net); return;
      case 'Equity': L.equityCapital = r2(L.equityCapital - net); return;
      case 'RetainedEarnings': L.retainedEarnings = r2(L.retainedEarnings - net); return;
      default: this.pl[l.account] = r2((this.pl[l.account] ?? 0) - net);
    }
  }

  /** Pre-tax profit so far (credit-positive sum of P&L accounts excluding tax). */
  preTax(): number {
    return r2(PL_ACCOUNTS.filter((a) => a !== 'Tax').reduce((s, a) => s + this.pl[a], 0));
  }

  income(): IncomeStatement {
    const p = this.pl;
    const ni = r2(PL_ACCOUNTS.reduce((s, a) => s + p[a], 0));
    return {
      revenue: p.Revenue, royaltyIncome: p.RoyaltyIncome, cogs: -p.COGS, marketing: -p.Marketing, rnd: -p.RnD,
      logistics: -p.Logistics, tariffs: -p.Tariffs, admin: -p.Admin, depreciation: -p.Depreciation, riskLoss: -p.RiskLoss,
      insuranceRecovery: p.InsuranceRecovery, interest: -p.Interest, fxGainLoss: p.FXGainLoss, tax: -p.Tax, netIncome: ni,
    };
  }

  /** Close P&L into retained earnings (journalled, so it is balanced like any other entry). */
  close(): IncomeStatement {
    const inc = this.income();
    const lines: { account: Account; debit?: number; credit?: number }[] = [];
    for (const a of PL_ACCOUNTS) {
      const bal = this.pl[a];
      if (bal > 0) lines.push({ account: a, debit: bal });
      else if (bal < 0) lines.push({ account: a, credit: -bal });
    }
    if (inc.netIncome >= 0) lines.push({ account: 'RetainedEarnings', credit: inc.netIncome });
    else lines.push({ account: 'RetainedEarnings', debit: -inc.netIncome });
    this.post('close', 'Close P&L to retained earnings', lines);
    return inc;
  }

  cashFlowStatement(): CashFlow {
    return {
      opening: this.openingCash, operating: this.cashFlow.operating, investing: this.cashFlow.investing,
      financing: this.cashFlow.financing, closing: this.ledger.cash,
    };
  }
}

export function totalAssets(L: Ledger): number {
  return L.cash + L.receivables + L.inventory + L.ppe + L.intangibles;
}

export function balanceGap(L: Ledger): number {
  return r2(totalAssets(L) - (L.debt + L.equityCapital + L.retainedEarnings));
}

export function entryBalanced(e: JournalEntry): boolean {
  const dr = e.lines.reduce((a, l) => a + l.debit, 0);
  const cr = e.lines.reduce((a, l) => a + l.credit, 0);
  return Math.abs(dr - cr) < 0.01;
}

export { ASSETS };
