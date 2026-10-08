import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, Empty } from '../components';
import { LineChart, SignedBars } from '../charts';
import { fmtK, sum } from '../../engine/util';

const PARTS: [string, string][] = [['profit', 'Profit'], ['share', 'Share'], ['roic', 'ROIC'], ['brand', 'Brand'], ['resilience', 'Resilience']];
const PART_COLORS: Record<string, string> = { profit: '#1f8f4e', share: '#2a78d6', roic: '#eb6834', brand: '#4a3aa7', resilience: '#eda100' };

export default function Leaderboard() {
  const { game, company } = useGame();
  const [idx, setIdx] = useState(game.results.length - 1);
  if (!game.results.length) return <Empty>No published rounds yet.</Empty>;
  const i = Math.max(0, Math.min(idx, game.results.length - 1));
  const r = game.results[i];
  const practice = r.round <= game.scenario.practiceRounds;
  const phase = game.results.slice(0, i + 1).filter((x) => (x.round <= game.scenario.practiceRounds) === practice);
  const prev = phase.length > 1 ? phase[phase.length - 2] : null;
  const label = (round: number) => (round <= game.scenario.practiceRounds ? `P${round}` : `R${round - game.scenario.practiceRounds}`);
  const w = game.scenario.scoring as unknown as Record<string, number>;
  const rows = [...r.leaderboard].sort((a, b) => a.rank - b.rank);
  const finalRound = game.phase === 'FINISHED' && i === game.results.length - 1;
  const cumNI = (id: string) => r.leaderboard.find((x) => x.companyId === id)?.cumNetIncome
    ?? sum(game.companies.find((c) => c.id === id)!.history.filter((h) => phase.some((p) => p.round === h.round)).map((h) => h.income.netIncome));

  return (
    <div>
      <div className="section-title">
        <div className="row"><h1 style={{ margin: 0 }}>Leaderboard</h1><Badge tone={practice ? 'info' : 'accent'}>{practice ? 'Practice standings' : 'Scored'}</Badge></div>
        <label className="row small">After
          <select id="leaderboard-round" value={i} onChange={(e) => setIdx(+e.target.value)} style={{ width: 'auto' }}>
            {game.results.map((x, k) => <option key={x.round} value={k}>{x.round <= game.scenario.practiceRounds ? `Practice ${x.round}` : `Round ${x.round - game.scenario.practiceRounds}`}</option>)}
          </select>
        </label>
      </div>
      {finalRound && (() => {
        const win = game.companies.find((c) => c.id === rows[0].companyId)!;
        return <div className="alert good" style={{ marginBottom: 14 }}>Winner: <b>{win.name}</b> · {rows[0].score.toFixed(1)} points</div>;
      })()}
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>Company</th><th className="num">Score</th>{PARTS.map(([k, l]) => <th key={k} className="num">{l} {Math.round(w[k] * 100)}%</th>)}<th className="num">Cum. net income</th><th>Inferred strategy</th></tr></thead>
          <tbody>{rows.map((x) => {
            const co = game.companies.find((c) => c.id === x.companyId)!;
            const h = co.history.find((y) => y.round === r.round);
            const pr = prev?.leaderboard.find((y) => y.companyId === x.companyId)?.rank;
            const move = pr ? pr - x.rank : 0;
            const ni = cumNI(co.id);
            return (
              <tr key={x.companyId} className={company?.id === x.companyId ? 'hl' : ''}>
                <td><b>{x.rank}</b>{move !== 0 && <span className={`rank-move ${move > 0 ? 'up' : 'down'}`}>{move > 0 ? `+${move}` : move}</span>}</td>
                <td><span className="inline"><i className="dot" style={{ background: co.color }} />{co.name} {co.isBot && <Badge>bot</Badge>} {co.status === 'bankrupt' && <Badge tone="bad">Bankrupt</Badge>}</span></td>
                <td className="num"><b>{x.score.toFixed(1)}</b></td>
                {PARTS.map(([k]) => <td key={k} className="num">{(x.parts[k] ?? 0).toFixed(0)}</td>)}
                <td className={`num ${ni < 0 ? 'bad' : 'good'}`}>{fmtK(ni)}</td>
                <td className="small">{h?.strategyInferred || '—'}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Card>
      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card title="Score">
          <SignedBars format={(v) => v.toFixed(1)} rows={rows.map((x) => { const co = game.companies.find((c) => c.id === x.companyId)!; return { label: co.name, value: x.score, color: co.color, strong: co.id === company?.id }; })} />
        </Card>
        <Card title="Score breakdown (weighted points)">
          <div className="stack">
            {rows.map((x) => {
              const co = game.companies.find((c) => c.id === x.companyId)!;
              return (
                <div key={x.companyId} className="share-row">
                  <span className="sbar-label">{co.name}</span>
                  <div className="share-track" style={{ background: '#f1f4f2' }}>
                    {PARTS.map(([k, l]) => {
                      const pts = (x.parts[k] ?? 0) * w[k];
                      return pts > 0 ? <div key={k} className="share-seg" style={{ width: `${pts}%`, background: PART_COLORS[k] }} title={`${l}: ${pts.toFixed(1)} pts`}>{pts >= 6 ? pts.toFixed(0) : ''}</div> : null;
                    })}
                  </div>
                  <span className="sbar-val">{x.score.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>{PARTS.map(([k, l]) => <span key={k}><i className="dot" style={{ background: PART_COLORS[k] }} />{l}</span>)}</div>
        </Card>
      </div>
      <Card title="Score trend">
        <LineChart labels={phase.map((x) => label(x.round))} yMin={0}
          series={game.companies.map((co) => ({ name: co.name, color: co.color, values: phase.map((x) => x.leaderboard.find((y) => y.companyId === co.id)?.score ?? null) }))} />
      </Card>
    </div>
  );
}
