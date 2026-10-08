import { useTeam } from '../context';
import { Badge, Card, COUNTRY_NAME, NumField, RangeField, SelectField } from '../components';
import { creditLimit, estimateSpend } from '../../engine/decisions';
import { COUNTRIES, type PolicyTier } from '../../engine/types';
import { fmtK, fmtNum, fmtPct, sum } from '../../engine/util';

export default function Treasury() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const L = co.ledger;
  const spend = estimateSpend(d, co, game);
  const spendTotal = sum(Object.values(spend));
  const g = game.scenario.global;
  const dueIn = sum(COUNTRIES.flatMap((c) => co.countries[c].receivables).filter((r) => r.dueRound <= game.round).map((r) => r.amount)) + sum(co.claims.filter((x) => x.dueRound <= game.round).map((x) => x.amount));
  const available = L.cash + d.newLoan + dueIn - d.minCashReserve;

  return (
    <div>
      <div className="section-title"><h1>Finance & Risk</h1></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Budget this round">
            <div className="table-wrap"><table><tbody>
              {Object.entries(spend).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmtK(v)}</td></tr>)}
              <tr className="total"><td>Planned spend</td><td className="num">{fmtK(spendTotal)}</td></tr>
              <tr><td>Cash</td><td className="num">{fmtK(L.cash)}</td></tr>
              <tr><td>Collections due</td><td className="num">{fmtK(dueIn)}</td></tr>
              <tr><td>New loan less reserve</td><td className="num">{fmtK(d.newLoan - d.minCashReserve)}</td></tr>
              <tr className="total"><td>Available</td><td className={`num ${available < spendTotal ? 'bad' : 'good'}`}>{fmtK(available)}</td></tr>
            </tbody></table></div>
            {available < spendTotal && <div className="alert bad small" style={{ marginTop: 8 }}>Planned spend exceeds available cash.</div>}
          </Card>
          <Card title="Borrowing">
            <div className="form-grid">
              <NumField label="New loan" suffix="USD" value={d.newLoan} step={100_000} disabled={readOnly} onChange={(v) => update((x) => { x.newLoan = v; })} hint={`Limit ${fmtK(creditLimit(co))}`} />
              <SelectField label="Currency" value={d.loanCurrency} disabled={readOnly} onChange={(v) => update((x) => { x.loanCurrency = v as 'USD' | 'VND'; })}
                options={[{ value: 'USD', label: `USD · ${fmtPct(g.usdInterestRate)}/yr` }, { value: 'VND', label: `VND · ${fmtPct(g.vndInterestRate)}/yr` }]} />
              <SelectField label="Term" value={String(d.loanTermRounds)} disabled={readOnly} onChange={(v) => update((x) => { x.loanTermRounds = Number(v); })}
                options={[{ value: '2', label: 'Short · 2 quarters' }, { value: '8', label: 'Long · 8 quarters' }]} />
              <NumField label="Early repayment" suffix="USD" value={d.debtRepayment} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.debtRepayment = v; })} />
              <NumField label="Minimum cash reserve" suffix="USD" value={d.minCashReserve} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.minCashReserve = v; })} />
              <NumField label="Dividend" suffix="USD" value={d.dividend} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.dividend = v; })} />
            </div>
            {co.loans.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}><table>
                <thead><tr><th>Loan</th><th>Currency</th><th className="num">Outstanding</th><th className="num">Rate</th><th>Maturity</th></tr></thead>
                <tbody>{co.loans.map((l) => <tr key={l.id}><td>{l.id}{l.emergency && <> <Badge tone="bad">Emergency</Badge></>}</td><td>{l.currency}</td><td className="num">{fmtK(l.carryingUsd)}</td><td className="num">{fmtPct(l.annualRate)}</td><td>Round {l.maturityRound}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="FX hedging">
            {COUNTRIES.filter((c) => game.env[c].currency !== 'USD').map((c) => (
              <RangeField key={c} label={`${game.env[c].currency} · ${game.fx[game.env[c].currency].toFixed(game.fx[game.env[c].currency] > 10 ? 1 : 3)}`}
                value={Math.round(d.countries[c].hedgeRatio * 100)} min={0} max={100} step={10} disabled={readOnly} format={(v) => `${v}%`}
                onChange={(v) => update((x) => { x.countries[c].hedgeRatio = v / 100; })} />
            ))}
          </Card>
          <Card title="Political risk insurance">
            <div className="table-wrap"><table>
              <thead><tr><th>Country</th><th className="num">Risk</th><th>Current</th><th>This round</th></tr></thead>
              <tbody>{COUNTRIES.map((c) => {
                const p = co.countries[c];
                return (
                  <tr key={c}>
                    <td>{COUNTRY_NAME[c]}</td>
                    <td className="num">{game.env[c].politicalRisk}</td>
                    <td>{p.politicalPolicy ? <Badge tone={p.politicalPolicy.activeFrom <= game.round ? 'good' : 'warn'}>{p.politicalPolicy.tier}{p.politicalPolicy.activeFrom > game.round ? ` · from R${p.politicalPolicy.activeFrom}` : ''}</Badge> : '—'}</td>
                    <td><select value={d.countries[c].politicalPolicy} disabled={readOnly || (p.status !== 'active' && p.status !== 'pending' && d.countries[c].entryAction !== 'enter')} onChange={(e) => update((x) => { x.countries[c].politicalPolicy = e.target.value as PolicyTier; })}>
                      <option value="none">None</option><option value="basic">Basic · 0.6%/qtr</option><option value="premium">Premium · 1.2%/qtr</option>
                    </select></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </Card>
          <Card title="Balance sheet">
            <div className="table-wrap"><table><tbody>
              <tr><td>Cash</td><td className="num">{fmtK(L.cash)}</td></tr>
              <tr><td>Receivables</td><td className="num">{fmtK(L.receivables)}</td></tr>
              <tr><td>Inventory</td><td className="num">{fmtK(L.inventory)}</td></tr>
              <tr><td>Property, plant & equipment</td><td className="num">{fmtK(L.ppe)}</td></tr>
              <tr><td>Intangibles</td><td className="num">{fmtK(L.intangibles)}</td></tr>
              <tr><td>Debt</td><td className="num">{fmtK(L.debt)}</td></tr>
              <tr><td>Tax loss carry-forward</td><td className="num">{fmtK(co.taxLossCarry)}</td></tr>
              <tr><td>VND per USD</td><td className="num">{fmtNum(game.fx.VND)}</td></tr>
            </tbody></table></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
