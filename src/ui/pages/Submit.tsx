import { useTeam } from '../context';
import { Badge, Card } from '../components';
import { estimateSpend, latestVersion, sanitizeDecision, validateDecision } from '../../engine/decisions';
import { sameFormula } from '../../engine/product';
import { MODE_RULES } from '../../engine/scenario';
import { COUNTRIES } from '../../engine/types';
import { fmtK, fmtNum, sum } from '../../engine/util';

const FIELD_PAGE: [RegExp, string][] = [[/^skus/, 'product'], [/^production|^outsourcing/, 'operations'], [/^shipments/, 'operations'], [/^countries\.\w+\.(entry|partner|ownership)/, 'strategy'], [/^countries/, 'marketing'], [/newLoan|debt|dividend|budget/, 'treasury']];

export default function Submit() {
  const { game, setGame, company: co, decision: d, readOnly, go } = useTeam();
  const clean = sanitizeDecision(d, co, game.scenario, game.round);
  const issues = validateDecision(clean, co, game);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const spend = estimateSpend(clean, co, game);
  const pageFor = (field: string) => FIELD_PAGE.find(([re]) => re.test(field))?.[1] ?? 'overview';

  const changes: string[] = [];
  for (const s of clean.skus) {
    const ex = co.skus.find((x) => x.id === s.skuId);
    if (!ex) changes.push(`New SKU: ${s.name}`);
    else if (!sameFormula(latestVersion(ex).formula, s.formula)) changes.push(`Reformulate ${s.name}`);
    if (ex && s.retire && !ex.retired) changes.push(`Retire ${s.name}`);
  }
  for (const c of COUNTRIES) {
    const cd = clean.countries[c];
    if (cd.entryAction === 'enter') changes.push(`Enter ${c} · ${MODE_RULES[cd.entryMode].label} (${cd.entryScale})`);
    if (cd.entryAction === 'exit') changes.push(`Exit ${c}`);
  }
  if (clean.capacityCapex) changes.push(`Capacity capex ${fmtK(clean.capacityCapex)}`);
  if (clean.newLoan) changes.push(`New loan ${fmtK(clean.newLoan)} ${clean.loanCurrency}`);
  changes.push(`Produce ${fmtNum(sum(Object.values(clean.production)))} · outsource ${fmtNum(sum(Object.values(clean.outsourcing)))}`);
  changes.push(`${clean.shipments.length} shipments · ${fmtNum(sum(clean.shipments.map((s) => s.qty)))} boxes`);

  const submit = () => {
    const next = { ...clean, submitted: true, revision: d.revision + 1 };
    setGame({
      ...game, decisions: { ...game.decisions, [co.id]: next },
      audit: [...game.audit, { at: new Date().toISOString(), round: game.round, actor: co.name, event: 'SUBMIT', detail: `revision ${next.revision}` }],
    });
  };
  const amend = () => {
    setGame({
      ...game, decisions: { ...game.decisions, [co.id]: { ...d, submitted: false } },
      audit: [...game.audit, { at: new Date().toISOString(), round: game.round, actor: co.name, event: 'AMEND', detail: `revision ${d.revision}` }],
    });
  };

  return (
    <div>
      <div className="section-title"><h1>Review & Submit · Round {game.round}</h1>
        {d.submitted ? <Badge tone="good">Submitted · rev {d.revision}</Badge> : <Badge tone="warn">Draft · rev {d.revision}</Badge>}
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title={`Errors (${errors.length})`}>
            {errors.length === 0 ? <div className="alert good small">No errors</div> : (
              <div className="stack">{errors.map((e, i) => (
                <div key={i} className="alert bad small spread"><span><b>{e.code}</b> · {e.message}</span><button className="btn sm" onClick={() => go(pageFor(e.field))}>Fix</button></div>
              ))}</div>
            )}
          </Card>
          <Card title={`Warnings (${warnings.length})`}>
            {warnings.length === 0 ? <p className="muted small">No warnings</p> : warnings.map((w, i) => <div key={i} className="alert warn small" style={{ marginBottom: 6 }}><b>{w.code}</b> · {w.message}</div>)}
          </Card>
        </div>
        <div className="stack">
          <Card title="Summary">
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <div className="table-wrap" style={{ marginTop: 12 }}><table><tbody>
              {Object.entries(spend).filter(([, v]) => v > 0).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmtK(v)}</td></tr>)}
              <tr className="total"><td>Planned spend</td><td className="num">{fmtK(sum(Object.values(spend)))}</td></tr>
            </tbody></table></div>
          </Card>
          <Card>
            {game.phase !== 'OPEN' ? <p className="muted">Round locked</p> : co.isBot ? <p className="muted">Bot team</p> : d.submitted ? (
              <button className="btn" onClick={amend}>Withdraw to edit</button>
            ) : (
              <button className="btn primary" disabled={errors.length > 0 || readOnly} onClick={submit}>Submit round {game.round}</button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
