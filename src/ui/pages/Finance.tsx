import { useState } from 'react';
import { useTeam } from '../context';
import { Card, Empty, Tabs } from '../components';
import { fmtK } from '../../engine/util';
import { downloadText } from '../store';

export default function Finance() {
  const { game, company: co } = useTeam();
  const [tab, setTab] = useState<'is' | 'bs' | 'cf' | 'gl'>('is');
  const hist = co.history;
  if (!hist.length) return <Empty>Chưa có báo cáo – cần xử lý ít nhất một vòng.</Empty>;
  const label = (round: number) => (round <= game.scenario.practiceRounds ? `T${round}` : `V${round - game.scenario.practiceRounds}`);
  const cols = hist.slice(-8);
  const row = (name: string, get: (h: typeof hist[number]) => number, cls = '', negate = false) => (
    <tr className={cls}><td>{name}</td>{cols.map((h) => { const v = get(h) * (negate ? -1 : 1); return <td key={h.round} className={`num ${v < 0 ? 'bad' : ''}`}>{fmtK(v)}</td>; })}</tr>
  );
  const lastRes = game.results[game.results.length - 1];
  const myEntries = lastRes ? lastRes.journal.filter((e) => e.companyId === co.id) : [];

  return (
    <div>
      <div className="section-title"><div><h1>Báo cáo tài chính hợp nhất</h1><div className="muted small">Đơn vị: USD (đồng tiền báo cáo). Sổ kép: mọi bút toán cân Nợ = Có; bảng cân đối luôn cân.</div></div>
        <button className="btn sm" onClick={() => downloadText(`${co.name}-financials.csv`, toCsv(hist, label), 'text/csv')}>⬇ Xuất CSV</button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'is', label: 'Kết quả kinh doanh' }, { value: 'bs', label: 'Cân đối kế toán' }, { value: 'cf', label: 'Lưu chuyển tiền tệ' }, { value: 'gl', label: 'Sổ nhật ký (vòng gần nhất)' }]} />
      <Card>
        <div className="table-wrap"><table>
          <thead>{tab === 'gl' ? <tr><th>Tài khoản</th><th className="num">Nợ</th><th className="num">Có</th></tr> : <tr><th /> {cols.map((h) => <th key={h.round} className="num">{label(h.round)}</th>)}</tr>}</thead>
          {tab === 'is' && <tbody>
            {row('Doanh thu bán hàng', (h) => h.income.revenue)}
            {row('Phí bản quyền (royalty)', (h) => h.income.royaltyIncome)}
            {row('Giá vốn hàng bán', (h) => h.income.cogs, '', true)}
            {row('Lợi nhuận gộp', (h) => h.income.revenue + h.income.royaltyIncome - h.income.cogs, 'total')}
            {row('Marketing & nghiên cứu', (h) => h.income.marketing, '', true)}
            {row('R&D & phát triển SP', (h) => h.income.rnd, '', true)}
            {row('Logistics & kho', (h) => h.income.logistics, '', true)}
            {row('Thuế NK & phí', (h) => h.income.tariffs, '', true)}
            {row('Quản lý, QC, nhân sự, thâm nhập', (h) => h.income.admin, '', true)}
            {row('Khấu hao', (h) => h.income.depreciation, '', true)}
            {row('Tổn thất rủi ro', (h) => h.income.riskLoss, '', true)}
            {row('Bồi thường bảo hiểm', (h) => h.income.insuranceRecovery)}
            {row('Lãi vay', (h) => h.income.interest, '', true)}
            {row('Lãi/lỗ tỷ giá', (h) => h.income.fxGainLoss)}
            {row('Thuế TNDN', (h) => h.income.tax, '', true)}
            {row('Lợi nhuận ròng', (h) => h.income.netIncome, 'total')}
          </tbody>}
          {tab === 'bs' && <tbody>
            {row('Tiền mặt', (h) => h.balance.cash)}
            {row('Phải thu', (h) => h.balance.receivables)}
            {row('Hàng tồn kho', (h) => h.balance.inventory)}
            {row('Nhà xưởng, thiết bị (ròng)', (h) => h.balance.ppe)}
            {row('Tài sản vô hình', (h) => h.balance.intangibles)}
            {row('Tổng tài sản', (h) => h.balance.cash + h.balance.receivables + h.balance.inventory + h.balance.ppe + h.balance.intangibles, 'total')}
            {row('Nợ vay', (h) => h.balance.debt)}
            {row('Vốn góp', (h) => h.balance.equityCapital)}
            {row('Lợi nhuận giữ lại', (h) => h.balance.retainedEarnings)}
            {row('Tổng nguồn vốn', (h) => h.balance.debt + h.balance.equityCapital + h.balance.retainedEarnings, 'total')}
          </tbody>}
          {tab === 'gl' && <tbody>
            {myEntries.length === 0 ? <tr><td className="muted">Không có bút toán (chỉ lưu sổ nhật ký 4 vòng gần nhất).</td></tr> : myEntries.flatMap((e, i) => [
              <tr key={`h${i}`} className="sub"><td colSpan={cols.length + 1}><b>{e.source}</b> – {e.memo}</td></tr>,
              ...e.lines.map((l, j) => <tr key={`l${i}-${j}`}><td style={{ paddingLeft: l.credit > 0 ? 36 : 18 }}>{l.credit > 0 ? 'Có ' : 'Nợ '}{l.account}</td><td className="num">{l.debit > 0 ? fmtK(l.debit) : ''}</td><td className="num">{l.credit > 0 ? fmtK(l.credit) : ''}</td></tr>),
            ])}
          </tbody>}
          {tab === 'cf' && <tbody>
            {row('Tiền đầu kỳ', (h) => h.cashFlow.opening)}
            {row('Từ hoạt động kinh doanh', (h) => h.cashFlow.operating)}
            {row('Từ hoạt động đầu tư', (h) => h.cashFlow.investing)}
            {row('Từ hoạt động tài chính', (h) => h.cashFlow.financing)}
            {row('Tiền cuối kỳ', (h) => h.cashFlow.closing, 'total')}
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
