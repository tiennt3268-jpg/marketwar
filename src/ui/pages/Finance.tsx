import { useState } from 'react';
import { useTeam } from '../context';
import { Card, Empty, Tabs } from '../components';
import { fmtK } from '../../engine/util';
import { downloadText } from '../store';

export default function Finance() {
  const { game, company: co } = useTeam();
  const [tab, setTab] = useState<'is' | 'bs' | 'cf' | 'gl'>('is');
  const hist = co.history;
  if (!hist.length) return <Empty>No statements yet.</Empty>;
  const label = (round: number) => (round <= game.scenario.practiceRounds ? `P${round}` : `R${round - game.scenario.practiceRounds}`);
  const cols = hist.slice(-8);
  const row = (name: string, get: (h: typeof hist[number]) => number, cls = '', negate = false) => (
    <tr className={cls}><td>{name}</td>{cols.map((h) => { const v = get(h) * (negate ? -1 : 1); return <td key={h.round} className={`num ${v < 0 ? 'bad' : ''}`}>{fmtK(v)}</td>; })}</tr>
  );
  const lastRes = game.results[game.results.length - 1];
  const myEntries = lastRes ? lastRes.journal.filter((e) => e.companyId === co.id) : [];

  return (
    <div>
      <div className="section-title"><h1>Financial Statements (USD)</h1>
        <button className="btn sm" onClick={() => downloadText(`${co.name}-financials.csv`, toCsv(hist, label), 'text/csv')}>Export CSV</button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'is', label: 'Income statement' }, { value: 'bs', label: 'Balance sheet' }, { value: 'cf', label: 'Cash flow' }, { value: 'gl', label: 'Journal' }]} />
      <Card>
        <div className="table-wrap"><table>
          <thead>{tab === 'gl' ? <tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr> : <tr><th /> {cols.map((h) => <th key={h.round} className="num">{label(h.round)}</th>)}</tr>}</thead>
          {tab === 'is' && <tbody>
            {row('Revenue', (h) => h.income.revenue)}
            {row('Royalty income', (h) => h.income.royaltyIncome)}
            {row('Cost of goods sold', (h) => h.income.cogs, '', true)}
            {row('Gross profit', (h) => h.income.revenue + h.income.royaltyIncome - h.income.cogs, 'total')}
            {row('Marketing & research', (h) => h.income.marketing, '', true)}
            {row('R&D', (h) => h.income.rnd, '', true)}
            {row('Logistics & warehousing', (h) => h.income.logistics, '', true)}
            {row('Duties & levies', (h) => h.income.tariffs, '', true)}
            {row('Admin, QC, staff, entry', (h) => h.income.admin, '', true)}
            {row('Depreciation', (h) => h.income.depreciation, '', true)}
            {row('Risk losses', (h) => h.income.riskLoss, '', true)}
            {row('Insurance recoveries', (h) => h.income.insuranceRecovery)}
            {row('Interest', (h) => h.income.interest, '', true)}
            {row('FX gain/loss', (h) => h.income.fxGainLoss)}
            {row('Income tax', (h) => h.income.tax, '', true)}
            {row('Net income', (h) => h.income.netIncome, 'total')}
          </tbody>}
          {tab === 'bs' && <tbody>
            {row('Cash', (h) => h.balance.cash)}
            {row('Receivables', (h) => h.balance.receivables)}
            {row('Inventory', (h) => h.balance.inventory)}
            {row('PP&E (net)', (h) => h.balance.ppe)}
            {row('Intangibles', (h) => h.balance.intangibles)}
            {row('Total assets', (h) => h.balance.cash + h.balance.receivables + h.balance.inventory + h.balance.ppe + h.balance.intangibles, 'total')}
            {row('Debt', (h) => h.balance.debt)}
            {row('Paid-in capital', (h) => h.balance.equityCapital)}
            {row('Retained earnings', (h) => h.balance.retainedEarnings)}
            {row('Total liabilities & equity', (h) => h.balance.debt + h.balance.equityCapital + h.balance.retainedEarnings, 'total')}
          </tbody>}
          {tab === 'gl' && <tbody>
            {myEntries.length === 0 ? <tr><td className="muted">No entries.</td></tr> : myEntries.flatMap((e, i) => [
              <tr key={`h${i}`} className="sub"><td colSpan={cols.length + 1}><b>{e.source}</b> · {e.memo}</td></tr>,
              ...e.lines.map((l, j) => <tr key={`l${i}-${j}`}><td style={{ paddingLeft: l.credit > 0 ? 36 : 18 }}>{l.credit > 0 ? 'Cr ' : 'Dr '}{l.account}</td><td className="num">{l.debit > 0 ? fmtK(l.debit) : ''}</td><td className="num">{l.credit > 0 ? fmtK(l.credit) : ''}</td></tr>),
            ])}
          </tbody>}
          {tab === 'cf' && <tbody>
            {row('Opening cash', (h) => h.cashFlow.opening)}
            {row('Operating', (h) => h.cashFlow.operating)}
            {row('Investing', (h) => h.cashFlow.investing)}
            {row('Financing', (h) => h.cashFlow.financing)}
            {row('Closing cash', (h) => h.cashFlow.closing, 'total')}
          </tbody>}
        </table></div>
      </Card>
    </div>
  );
}

function toCsv(hist: ReturnType<typeof useTeam>['company']['history'], label: (r: number) => string): string {
  const keys = Object.keys(hist[0].income) as (keyof typeof hist[number]['income'])[];
  const lines = [['item', ...hist.map((h) => label(h.round))].join(',')];
  for (const k of keys) lines.push([k, ...hist.map((h) => h.income[k].toFixed(2))].join(','));
  for (const k of Object.keys(hist[0].balance) as (keyof typeof hist[number]['balance'])[]) lines.push([`bs_${k}`, ...hist.map((h) => h.balance[k].toFixed(2))].join(','));
  return lines.join('\n');
}
