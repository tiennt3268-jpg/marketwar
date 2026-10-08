import { useGame } from '../context';
import { Badge, Card, Empty } from '../components';
import { LineChart } from '../charts';
import { isScored } from '../../engine/engine';
import { fmtK } from '../../engine/util';

const PARTS: [string, string][] = [['profit', 'Lợi nhuận 30%'], ['share', 'Thị phần 25%'], ['roic', 'ROIC 20%'], ['brand', 'Thương hiệu 15%'], ['resilience', 'Chống chịu 10%']];

export default function Leaderboard() {
  const { game, company } = useGame();
  const scored = game.results.filter((r) => isScored(game, r.round));
  if (!scored.length) return <Empty>Bảng xếp hạng bắt đầu từ vòng tính điểm đầu tiên (sau các vòng thử).</Empty>;
  const last = scored[scored.length - 1];
  const w = game.scenario.scoring;
  return (
    <div>
      <div className="section-title"><div><h1>Bảng xếp hạng</h1><div className="muted small">Điểm tổng hợp chuẩn hoá theo ngưỡng (0–100 mỗi tiêu chí): lợi nhuận luỹ kế {Math.round(w.profit * 100)}%, thị phần toàn cầu {Math.round(w.share * 100)}%, ROIC {Math.round(w.roic * 100)}%, thương hiệu TB 4 nước {Math.round(w.brand * 100)}%, khả năng chống chịu {Math.round(w.resilience * 100)}%.</div></div></div>
      {game.phase === 'FINISHED' && (() => {
        const win = game.companies.find((c) => c.id === last.leaderboard[0].companyId)!;
        return <div className="alert good" style={{ marginBottom: 14 }}>🏆 Trò chơi kết thúc! Nhà vô địch: <b>{win.name}</b> với {last.leaderboard[0].score.toFixed(1)} điểm.</div>;
      })()}
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>Doanh nghiệp</th><th className="num">Điểm</th>{PARTS.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">LN luỹ kế</th><th>Chiến lược suy ra</th></tr></thead>
          <tbody>{last.leaderboard.map((r) => {
            const co = game.companies.find((c) => c.id === r.companyId)!;
            const h = co.history.find((x) => x.round === last.round);
            return (
              <tr key={r.companyId} className={company?.id === r.companyId ? 'hl' : ''}>
                <td><b>{r.rank}</b></td>
                <td><span className="inline"><i className="dot" style={{ background: co.color }} />{co.name} {co.isBot && <Badge>bot</Badge>} {co.status === 'bankrupt' && <Badge tone="bad">phá sản</Badge>}</span></td>
                <td className="num"><b>{r.score.toFixed(1)}</b></td>
                {PARTS.map(([k]) => <td key={k} className="num">{(r.parts[k] ?? 0).toFixed(0)}</td>)}
                <td className={`num ${co.cumulativeNetIncome < 0 ? 'bad' : 'good'}`}>{fmtK(co.cumulativeNetIncome)}</td>
                <td className="small">{h?.strategyInferred ?? '—'}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Card>
      <Card title="Diễn biến điểm">
        <LineChart labels={scored.map((r) => `V${r.round - game.scenario.practiceRounds}`)} yMin={0}
          series={game.companies.map((co) => ({ name: co.name, color: co.color, values: scored.map((r) => r.leaderboard.find((x) => x.companyId === co.id)?.score ?? null) }))} />
      </Card>
    </div>
  );
}
