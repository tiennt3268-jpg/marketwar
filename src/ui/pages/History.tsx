import { useTeam } from '../context';
import { Card, Empty } from '../components';
import { MODE_RULES } from '../../engine/scenario';
import { COUNTRIES } from '../../engine/types';
import { fmtK, fmtNum, sum } from '../../engine/util';
import { downloadText } from '../store';

export default function History() {
  const { game, company: co } = useTeam();
  const audit = game.audit.filter((a) => a.actor === co.name || a.actor === 'engine' || a.actor === 'GM');
  return (
    <div>
      <div className="section-title"><h1>History</h1>
        <button className="btn sm" onClick={() => downloadText(`${co.name}-decisions.json`, JSON.stringify(co.history.map((h) => ({ round: h.round, decision: h.decision })), null, 2))}>Export decisions (JSON)</button>
      </div>
      {co.history.length === 0 ? <Empty>No processed rounds yet.</Empty> : [...co.history].reverse().map((h) => {
        const d = h.decision;
        return (
          <Card key={h.round} title={`${h.round <= game.scenario.practiceRounds ? 'Practice' : 'Round'} ${h.round <= game.scenario.practiceRounds ? h.round : h.round - game.scenario.practiceRounds} · Net income ${fmtK(h.income.netIncome)} · Score ${h.score.toFixed(1)}`}>
            {d && (
              <div className="small">
                <div>SKU: {d.skus.map((s) => s.name).join(', ')} · R&D {fmtK(d.rdBudget)} · QC {fmtK(d.qualityBudget)} · Innovation {fmtK(d.innovationBudget)}</div>
                <div>Produce {fmtNum(sum(Object.values(d.production)))} · outsource {fmtNum(sum(Object.values(d.outsourcing)))} · capex {fmtK(d.capacityCapex)} · {d.shipments.length} shipments ({fmtNum(sum(d.shipments.map((s) => s.qty)))} boxes)</div>
                <div>Loan {fmtK(d.newLoan)} {d.loanCurrency} · repay {fmtK(d.debtRepayment)} · dividend {fmtK(d.dividend)}</div>
                {COUNTRIES.filter((c) => d.countries[c].entryAction !== 'hold' || sum(Object.values(d.countries[c].ads)) > 0).map((c) => {
                  const cd = d.countries[c];
                  return <div key={c}>{cd.entryAction === 'enter' ? `${c} enter (${MODE_RULES[cd.entryMode].label}) · ` : cd.entryAction === 'exit' ? `${c} exit · ` : ''}{c} ads {fmtK(sum(Object.values(cd.ads)))} · trade {fmtK(cd.tradeSpend)} · promo {(cd.promotionRate * 100).toFixed(0)}% · prices {Object.entries(cd.prices).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>;
                })}
              </div>
            )}
            {h.messages.length > 0 && <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{h.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </Card>
        );
      })}
      <Card title="Audit log">
        <div className="table-wrap"><table>
          <thead><tr><th>Round</th><th>Actor</th><th>Event</th><th>Detail</th></tr></thead>
          <tbody>{[...audit].reverse().slice(0, 60).map((a, i) => <tr key={i}><td>{a.round}</td><td>{a.actor}</td><td>{a.event}</td><td className="small muted" style={{ whiteSpace: 'normal' }}>{a.detail}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
