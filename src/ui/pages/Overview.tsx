import { useTeam } from '../context';
import { Badge, Card, COUNTRY_NAME, Stat } from '../components';
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
    { label: 'Market entry', page: 'strategy', done: COUNTRIES.some((c) => co.countries[c].status === 'active' || co.countries[c].status === 'pending' || d.countries[c].entryAction === 'enter') },
    { label: 'Production plan', page: 'operations', done: sum(Object.values(d.production)) + sum(Object.values(d.outsourcing)) > 0 || COUNTRIES.some((c) => sum(Object.values(d.countries[c].localProduction)) > 0) },
    { label: 'Shipments', page: 'operations', done: d.shipments.length > 0 || !COUNTRIES.some((c) => co.countries[c].mode && MODE_RULES[co.countries[c].mode!].exports) },
    { label: 'Pricing & marketing', page: 'marketing', done: COUNTRIES.some((c) => sum(Object.values(d.countries[c].ads)) > 0) },
    { label: 'Submit decisions', page: 'submit', done: d.submitted },
  ];

  return (
    <div>
      <div className="section-title">
        <div>
          <h1 className="row"><span className="dot" style={{ background: co.color, width: 12, height: 12 }} />{co.name}</h1>
          <div className="muted small">{co.status === 'bankrupt' ? <b className="bad">In administration</b> : 'Active'}{last?.strategyInferred ? ` · ${last.strategyInferred}` : ''}</div>
        </div>
        {d.submitted ? <Badge tone="good">Round {game.round} submitted</Badge> : game.phase === 'OPEN' ? <button className="btn primary" onClick={() => go('submit')}>Review & submit</button> : null}
      </div>

      <div className="grid g4">
        <Stat label="Cash" value={fmtK(L.cash)} sub={`Credit available ${fmtK(creditLimit(co))}`} tone={L.cash < 300_000 ? 'warn' : undefined} />
        <Stat label="Equity" value={fmtK(L.equityCapital + L.retainedEarnings)} sub={`Assets ${fmtK(totalAssets(L))} · Debt ${fmtK(L.debt)}`} />
        <Stat label="Last net income" value={last ? fmtK(last.income.netIncome) : '—'} tone={last ? (last.income.netIncome >= 0 ? 'good' : 'bad') : undefined} sub={last ? `Revenue ${fmtK(last.income.revenue + last.income.royaltyIncome)}` : undefined} />
        <Stat label="Score / Rank" value={rank && isScored(game, lastRes.round) ? `${rank.score.toFixed(1)} · #${rank.rank}` : '—'} sub={isScored(game, game.round) ? undefined : 'Practice'} />
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card title="Markets" actions={<button className="btn sm" onClick={() => go('strategy')}>Manage</button>}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Country</th><th>Status</th><th>Mode</th><th className="num">Brand</th><th className="num">Coverage</th><th className="num">Stock</th></tr></thead>
              <tbody>
                {COUNTRIES.map((c) => {
                  const p = co.countries[c];
                  const stock = sum(co.inventory.filter((l) => l.location === c).map((l) => l.qty));
                  return (
                    <tr key={c}>
                      <td>{COUNTRY_NAME[c]}</td>
                      <td>{p.status === 'active' ? <Badge tone="good">Active</Badge> : p.status === 'pending' ? <Badge tone="warn">From round {p.activationRound}</Badge> : d.countries[c].entryAction === 'enter' ? <Badge tone="info">Planned</Badge> : <Badge>{p.status === 'exited' ? 'Exited' : 'Not entered'}</Badge>}</td>
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
        <Card title="This round">
          <div className="stack">
            {todo.map((t) => (
              <div key={t.label} className="spread">
                <span><span className={t.done ? 'good' : 'muted'}>{t.done ? 'Done' : 'Open'}</span> · {t.label}</span>
                {!t.done && <button className="btn sm" onClick={() => go(t.page)}>Go</button>}
              </div>
            ))}
          </div>
          <div className="grid g3" style={{ marginTop: 14 }}>
            <div className="stat"><span className="label">VN capacity</span><b className="mono">{fmtNum(co.vnCapacity)}</b><span className="sub">boxes/qtr</span></div>
            <div className="stat"><span className="label">VN stock</span><b className="mono">{fmtNum(vnStock)}</b><span className="sub">boxes</span></div>
            <div className="stat"><span className="label">In transit</span><b className="mono">{fmtNum(sum(transit.flatMap((s) => s.lines.map((l) => l.qty))))}</b><span className="sub">{transit.length} shipments</span></div>
          </div>
        </Card>
      </div>

      {game.activeEvents.length > 0 && (
        <Card title="Active events">
          {game.activeEvents.map((e) => <div key={e.templateId + e.round}><b>{e.name}</b>{e.country ? ` (${e.country})` : ''} · <span className="muted">{e.description}</span> <span className="small muted">until round {e.untilRound}</span></div>)}
        </Card>
      )}

      {last && last.messages.length > 0 && (
        <Card title={`Round ${last.round} notices`}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{last.messages.map((m, i) => <li key={i} className="small">{m}</li>)}</ul>
        </Card>
      )}

      {scoredHist.length > 0 && (
        <Card title="Trend">
          <LineChart labels={scoredHist.map((h) => `R${h.round - game.scenario.practiceRounds}`)} format={(v) => fmtK(v)}
            series={[
              { name: 'Revenue', color: '#9aa6a0', values: scoredHist.map((h) => h.income.revenue + h.income.royaltyIncome) },
              { name: 'Net income', color: co.color, values: scoredHist.map((h) => h.income.netIncome) },
              { name: 'Cash', color: '#1f8f4e', values: scoredHist.map((h) => h.balance.cash) },
            ]} />
        </Card>
      )}
    </div>
  );
}
