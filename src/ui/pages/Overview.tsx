import { useTeam } from '../context';
import { Badge, Card, COUNTRY_FLAG, COUNTRY_VI, Stat } from '../components';
import { LineChart } from '../charts';
import { MODE_RULES } from '../../engine/scenario';
import { COUNTRIES } from '../../engine/types';
import { creditLimit } from '../../engine/decisions';
import { isScored } from '../../engine/engine';
import { totalAssets } from '../../engine/ledger';
import { fmtK, fmtNum, fmtPct, sum } from '../../engine/util';

export default function Overview() {
  const { game, company: co, decision: d, go } = useTeam();
  const L = co.ledger;
  const last = co.history[co.history.length - 1];
  const lastRes = game.results[game.results.length - 1];
  const rank = lastRes?.leaderboard.find((r) => r.companyId === co.id);
  const vnStock = sum(co.inventory.filter((l) => l.location === 'VN').map((l) => l.qty));
  const transit = co.shipments.filter((s) => s.status === 'in_transit' || s.status === 'detained');
  const scoredHist = co.history.filter((h) => isScored(game, h.round));

  const todo: { label: string; page: string; done: boolean }[] = [
    { label: 'Có ít nhất một thị trường đang hoạt động hoặc đang thâm nhập', page: 'strategy', done: COUNTRIES.some((c) => co.countries[c].status === 'active' || co.countries[c].status === 'pending' || d.countries[c].entryAction === 'enter') },
    { label: 'Lên kế hoạch sản xuất', page: 'operations', done: sum(Object.values(d.production)) + sum(Object.values(d.outsourcing)) > 0 || COUNTRIES.some((c) => sum(Object.values(d.countries[c].localProduction)) > 0) },
    { label: 'Gửi hàng tới thị trường xuất khẩu', page: 'operations', done: d.shipments.length > 0 || !COUNTRIES.some((c) => co.countries[c].mode && MODE_RULES[co.countries[c].mode!].exports) },
    { label: 'Đặt giá & ngân sách marketing', page: 'marketing', done: COUNTRIES.some((c) => sum(Object.values(d.countries[c].ads)) > 0) },
    { label: 'Nộp quyết định', page: 'submit', done: d.submitted },
  ];

  return (
    <div>
      <div className="section-title">
        <div>
          <h1 className="row"><span className="dot" style={{ background: co.color, width: 14, height: 14 }} />{co.name}</h1>
          <div className="muted small">Trụ sở & nhà máy tại Việt Nam · {co.status === 'bankrupt' ? <b className="bad">ĐANG THANH LÝ</b> : 'đang hoạt động'}{last?.strategyInferred ? ` · Chiến lược suy ra: ${last.strategyInferred}` : ''}</div>
        </div>
        {d.submitted ? <Badge tone="good">✔ Đã nộp vòng {game.round}</Badge> : game.phase === 'OPEN' ? <button className="btn primary" onClick={() => go('submit')}>Kiểm tra & nộp →</button> : null}
      </div>

      <div className="grid g4">
        <Stat label="Tiền mặt" value={fmtK(L.cash)} sub={`Hạn mức vay còn ${fmtK(creditLimit(co))}`} tone={L.cash < 300_000 ? 'warn' : undefined} />
        <Stat label="Vốn chủ sở hữu" value={fmtK(L.equityCapital + L.retainedEarnings)} sub={`Tổng tài sản ${fmtK(totalAssets(L))} · Nợ ${fmtK(L.debt)}`} />
        <Stat label="Lãi/lỗ vòng trước" value={last ? fmtK(last.income.netIncome) : '—'} tone={last ? (last.income.netIncome >= 0 ? 'good' : 'bad') : undefined} sub={last ? `Doanh thu ${fmtK(last.income.revenue + last.income.royaltyIncome)}` : 'Chưa có kết quả'} />
        <Stat label="Điểm / Hạng" value={rank && isScored(game, lastRes.round) ? `${rank.score.toFixed(1)} · #${rank.rank}` : '—'} sub={isScored(game, game.round) ? 'Lợi nhuận, thị phần, ROIC, thương hiệu, chống chịu' : 'Vòng thử – chưa tính điểm'} />
      </div>

      <div className="grid g2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="Hiện diện tại các thị trường" actions={<button className="btn sm" onClick={() => go('strategy')}>Quản lý →</button>}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quốc gia</th><th>Trạng thái</th><th>Phương thức</th><th className="num">Thương hiệu</th><th className="num">Độ phủ</th><th className="num">Tồn kho</th></tr></thead>
              <tbody>
                {COUNTRIES.map((c) => {
                  const p = co.countries[c];
                  const stock = sum(co.inventory.filter((l) => l.location === c).map((l) => l.qty));
                  return (
                    <tr key={c}>
                      <td>{COUNTRY_FLAG[c]} {COUNTRY_VI[c]}</td>
                      <td>{p.status === 'active' ? <Badge tone="good">Hoạt động</Badge> : p.status === 'pending' ? <Badge tone="warn">Từ vòng {p.activationRound}</Badge> : d.countries[c].entryAction === 'enter' ? <Badge tone="info">Sắp vào</Badge> : <Badge>{p.status === 'exited' ? 'Đã rút' : 'Chưa vào'}</Badge>}</td>
                      <td>{p.mode ? MODE_RULES[p.mode].label : '—'}</td>
                      <td className="num">{p.brand.toFixed(0)}</td>
                      <td className="num">{fmtPct(p.coverage, 0)}</td>
                      <td className="num">{fmtNum(stock)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Việc cần làm vòng này">
          <div className="stack">
            {todo.map((t) => (
              <div key={t.label} className="spread">
                <span>{t.done ? '✅' : '⬜'} {t.label}</span>
                {!t.done && <button className="btn sm" onClick={() => go(t.page)}>Mở</button>}
              </div>
            ))}
          </div>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <div className="stat"><span className="label">Công suất VN</span><b className="mono">{fmtNum(co.vnCapacity)}</b><span className="sub">hộp/quý</span></div>
            <div className="stat"><span className="label">Kho VN</span><b className="mono">{fmtNum(vnStock)}</b><span className="sub">hộp</span></div>
            <div className="stat"><span className="label">Đang vận chuyển</span><b className="mono">{fmtNum(sum(transit.flatMap((s) => s.lines.map((l) => l.qty))))}</b><span className="sub">{transit.length} lô</span></div>
          </div>
        </Card>
      </div>

      {game.activeEvents.length > 0 && (
        <Card title="⚡ Sự kiện môi trường đang diễn ra" className="" >
          {game.activeEvents.map((e) => <div key={e.templateId + e.round}><b>{e.name}</b>{e.country ? ` (${e.country})` : ''} – <span className="muted">{e.description}</span> <span className="small muted">đến hết vòng {e.untilRound}</span></div>)}
        </Card>
      )}

      {last && (
        <Card title={`Thông báo vòng ${last.round}`}>
          {last.messages.length === 0 ? <p className="muted small">Không có sự cố.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{last.messages.map((m, i) => <li key={i} className="small">{m}</li>)}</ul>}
        </Card>
      )}

      {scoredHist.length > 0 && (
        <Card title="Diễn biến">
          <LineChart labels={scoredHist.map((h) => `V${h.round - game.scenario.practiceRounds}`)} format={(v) => fmtK(v)}
            series={[
              { name: 'Doanh thu', color: '#2c6aa0', values: scoredHist.map((h) => h.income.revenue + h.income.royaltyIncome) },
              { name: 'Lợi nhuận ròng', color: co.color, values: scoredHist.map((h) => h.income.netIncome) },
              { name: 'Tiền mặt', color: '#2f7d4f', values: scoredHist.map((h) => h.balance.cash) },
            ]} />
        </Card>
      )}
    </div>
  );
}
