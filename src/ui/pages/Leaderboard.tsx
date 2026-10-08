import { useGame } from '../context';
import { Badge, Card, Empty } from '../components';
import { LineChart } from '../charts';
import { isScored } from '../../engine/engine';
import { fmtK } from '../../engine/util';

const PARTS: [string, string][] = [['profit', 'Profit'], ['share', 'Share'], ['roic', 'ROIC'], ['brand', 'Brand'], ['resilience', 'Resilience']];

export default function Leaderboard() {
  const { game, company } = useGame();
  const scored = game.results.filter((r) => isScored(game, r.round));
  if (!scored.length) return <Empty>No scored rounds yet.</Empty>;
  const last = scored[scored.length - 1];
  const w = game.scenario.scoring;
  return (
    <div>
      <div className="section-title"><h1>Leaderboard</h1></div>
      {game.phase === 'FINISHED' && (() => {
        const win = game.companies.find((c) => c.id === last.leaderboard[0].companyId)!;
        return <div className="alert good" style={{ marginBottom: 14 }}>Winner: <b>{win.name}</b> · {last.leaderboard[0].score.toFixed(1)} points</div>;
      })()}
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>Company</th><th className="num">Score</th>{PARTS.map(([k, l]) => <th key={k} className="num">{l} {Math.round((w as Record<string, number>)[k] * 100)}%</th>)}<th className="num">Cum. net income</th><th>Inferred strategy</th></tr></thead>
          <tbody>{last.leaderboard.map((r) => {
            const co = game.companies.find((c) => c.id === r.companyId)!;
            const h = co.history.find((x) => x.round === last.round);
            return (
              <tr key={r.companyId} className={company?.id === r.companyId ? 'hl' : ''}>
                <td><b>{r.rank}</b></td>
                <td><span className="inline"><i className="dot" style={{ background: co.color }} />{co.name} {co.isBot && <Badge>bot</Badge>} {co.status === 'bankrupt' && <Badge tone="bad">Bankrupt</Badge>}</span></td>
                <td className="num"><b>{r.score.toFixed(1)}</b></td>
                {PARTS.map(([k]) => <td key={k} className="num">{(r.parts[k] ?? 0).toFixed(0)}</td>)}
                <td className={`num ${co.cumulativeNetIncome < 0 ? 'bad' : 'good'}`}>{fmtK(co.cumulativeNetIncome)}</td>
                <td className="small">{h?.strategyInferred ?? '—'}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Card>
      <Card title="Score trend">
        <LineChart labels={scored.map((r) => `R${r.round - game.scenario.practiceRounds}`)} yMin={0}
          series={game.companies.map((co) => ({ name: co.name, color: co.color, values: scored.map((r) => r.leaderboard.find((x) => x.companyId === co.id)?.score ?? null) }))} />
      </Card>
    </div>
  );
}
