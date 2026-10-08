import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, COUNTRY_NAME, Empty, Stat } from '../components';
import { GroupedBars, LineChart, SignedBars, StackedShare, Waterfall } from '../charts';
import { COUNTRIES } from '../../engine/types';
import { fmtK, fmtNum, fmtPct, sum } from '../../engine/util';

export default function Report() {
  const { game, company } = useGame();
  const [idx, setIdx] = useState(game.results.length - 1);
  if (!game.results.length) return <Empty>No published rounds yet.</Empty>;
  const i = Math.max(0, Math.min(idx, game.results.length - 1));
  const r = game.results[i];
  const practice = r.round <= game.scenario.practiceRounds;
  const label = (round: number) => (round <= game.scenario.practiceRounds ? `P${round}` : `R${round - game.scenario.practiceRounds}`);
  const phaseRounds = game.results.slice(0, i + 1).filter((x) => (x.round <= game.scenario.practiceRounds) === practice);
  const prevRes = phaseRounds.length > 1 ? phaseRounds[phaseRounds.length - 2] : null;
  const cos = game.companies;
  const hist = (id: string, round: number) => cos.find((c) => c.id === id)?.history.find((h) => h.round === round);
  const boxesOf = (res: typeof r, id: string) => sum(res.countryResults.filter((x) => x.companyId === id).map((x) => x.salesBoxes));
  const totalBoxes = sum(r.countryResults.map((x) => x.salesBoxes));
  const rows = [...r.leaderboard].sort((a, b) => a.rank - b.rank);
  const prevRank = (id: string) => prevRes?.leaderboard.find((x) => x.companyId === id)?.rank;

  const me = company;
  const myRow = me ? r.leaderboard.find((x) => x.companyId === me.id) : undefined;
  const myH = me ? hist(me.id, r.round) : undefined;
  const myPrevH = me && prevRes ? hist(me.id, prevRes.round) : undefined;
  const delta = (cur: number, prev?: number, fmt = fmtK) => {
    if (prev === undefined) return null;
    const d = cur - prev;
    if (Math.abs(d) < 1e-9) return <span className="kpi-delta">no change</span>;
    return <span className={`kpi-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))} vs previous</span>;
  };

  return (
    <div>
      <div className="section-title">
        <div className="row"><h1 style={{ margin: 0 }}>Round Report</h1><Badge tone={practice ? 'info' : 'accent'}>{practice ? 'Practice' : 'Scored'}</Badge></div>
        <label className="row small">Round
          <select id="report-round-select" value={i} onChange={(e) => setIdx(+e.target.value)} style={{ width: 'auto' }}>
            {game.results.map((x, k) => <option key={x.round} value={k}>{x.round <= game.scenario.practiceRounds ? `Practice ${x.round}` : `Round ${x.round - game.scenario.practiceRounds}`}</option>)}
          </select>
        </label>
      </div>
      {r.events.length > 0 && <div className="alert warn small" style={{ marginBottom: 14 }}>Events: {r.events.map((e) => `${e.name}${e.country ? ` (${e.country})` : ''}`).join(' · ')}</div>}

      {me && myRow && myH ? (
        <div className="grid g4">
          <Stat accent="green" label="Revenue" value={fmtK(myH.income.revenue + myH.income.royaltyIncome)} sub={delta(myH.income.revenue + myH.income.royaltyIncome, myPrevH ? myPrevH.income.revenue + myPrevH.income.royaltyIncome : undefined)} />
          <Stat accent="amber" label="Net income" value={fmtK(myH.income.netIncome)} tone={myH.income.netIncome < 0 ? 'bad' : 'good'} sub={delta(myH.income.netIncome, myPrevH?.income.netIncome)} />
          <Stat accent="blue" label="Global share" value={fmtPct(totalBoxes ? boxesOf(r, me.id) / totalBoxes : 0)} sub={`${fmtNum(boxesOf(r, me.id))} boxes`} />
          <Stat accent="violet" label="Score · rank" value={`${myRow.score.toFixed(1)} · #${myRow.rank}`} sub={delta(myRow.score, prevRes?.leaderboard.find((x) => x.companyId === me.id)?.score, (v) => v.toFixed(1))} />
        </div>
      ) : (
        <div className="grid g4">
          <Stat accent="green" label="Boxes sold" value={fmtNum(totalBoxes)} sub={prevRes ? delta(totalBoxes, sum(prevRes.countryResults.map((x) => x.salesBoxes)), fmtNum) : undefined} />
          <Stat accent="amber" label="Market revenue" value={fmtK(sum(r.countryResults.map((x) => x.revenueUSD)))} />
          <Stat accent="blue" label="Penetration" value={fmtPct(totalBoxes / Math.max(1, sum(COUNTRIES.map((c) => r.marketSize[c]))))} sub="of total potential" />
          <Stat accent="violet" label="Leader" value={cos.find((c) => c.id === rows[0]?.companyId)?.name ?? '—'} sub={rows[0] ? `${rows[0].score.toFixed(1)} points` : undefined} />
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card title="Standings">
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Company</th><th className="num">Score</th><th className="num">Net income</th><th className="num">Boxes</th></tr></thead>
            <tbody>{rows.map((x) => {
              const co = cos.find((c) => c.id === x.companyId)!;
              const pr = prevRank(x.companyId);
              const move = pr ? pr - x.rank : 0;
              return (
                <tr key={x.companyId} className={me?.id === x.companyId ? 'hl' : ''}>
                  <td><b>{x.rank}</b>{move !== 0 && <span className={`rank-move ${move > 0 ? 'up' : 'down'}`}>{move > 0 ? `+${move}` : move}</span>}</td>
                  <td><span className="inline"><i className="dot" style={{ background: co.color }} />{co.name}</span></td>
                  <td className="num"><b>{x.score.toFixed(1)}</b></td>
                  <td className={`num ${(hist(co.id, r.round)?.income.netIncome ?? 0) < 0 ? 'bad' : ''}`}>{fmtK(hist(co.id, r.round)?.income.netIncome ?? 0)}</td>
                  <td className="num">{fmtNum(boxesOf(r, co.id))}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
        <Card title="Score">
          <SignedBars format={(v) => v.toFixed(1)} rows={rows.map((x) => { const co = cos.find((c) => c.id === x.companyId)!; return { label: co.name, value: x.score, color: co.color, strong: co.id === me?.id }; })} />
        </Card>
        <Card title="Revenue">
          <SignedBars format={fmtK} rows={[...cos].map((co) => ({ label: co.name, value: (hist(co.id, r.round)?.income.revenue ?? 0) + (hist(co.id, r.round)?.income.royaltyIncome ?? 0), color: co.color, strong: co.id === me?.id })).sort((a, b) => b.value - a.value)} />
        </Card>
        <Card title="Net income">
          <SignedBars format={fmtK} rows={[...cos].map((co) => ({ label: co.name, value: hist(co.id, r.round)?.income.netIncome ?? 0, color: co.color, strong: co.id === me?.id })).sort((a, b) => b.value - a.value)} />
        </Card>
      </div>

      <Card title="Market share by country">
        <StackedShare series={cos.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
          rows={COUNTRIES.map((c) => ({ label: COUNTRY_NAME[c], note: fmtNum(sum(r.countryResults.filter((x) => x.country === c).map((x) => x.salesBoxes))), values: Object.fromEntries(cos.map((co) => [co.id, r.countryResults.find((x) => x.country === c && x.companyId === co.id)?.salesBoxes ?? 0])) }))} />
      </Card>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card title="Score trend">
          <LineChart labels={phaseRounds.map((x) => label(x.round))} yMin={0} format={(v) => v.toFixed(0)}
            series={cos.map((co) => ({ name: co.name, color: co.color, values: phaseRounds.map((x) => x.leaderboard.find((y) => y.companyId === co.id)?.score ?? null) }))} />
        </Card>
        <Card title="Cumulative net income">
          <LineChart labels={phaseRounds.map((x) => label(x.round))} format={(v) => fmtK(v)}
            series={cos.map((co) => {
              let acc = 0;
              return { name: co.name, color: co.color, values: phaseRounds.map((x) => { acc += hist(co.id, x.round)?.income.netIncome ?? 0; return acc; }) };
            })} />
        </Card>
        <Card title="Global volume share trend">
          <LineChart labels={phaseRounds.map((x) => label(x.round))} yMin={0} format={(v) => `${(v * 100).toFixed(0)}%`}
            series={cos.map((co) => ({ name: co.name, color: co.color, values: phaseRounds.map((x) => { const t = sum(x.countryResults.map((y) => y.salesBoxes)); return t ? boxesOf(x, co.id) / t : 0; }) }))} />
        </Card>
        {me && myH ? (
          <Card title={`Income bridge · ${me.name}`}>
            <Waterfall format={fmtK} steps={[
              { label: 'Revenue', value: myH.income.revenue + myH.income.royaltyIncome },
              { label: 'COGS', value: -myH.income.cogs },
              { label: 'Marketing', value: -myH.income.marketing },
              { label: 'R&D', value: -myH.income.rnd },
              { label: 'Logistics & duties', value: -(myH.income.logistics + myH.income.tariffs) },
              { label: 'Admin & entry', value: -myH.income.admin },
              { label: 'Depreciation', value: -myH.income.depreciation },
              { label: 'Risk, FX, interest', value: myH.income.insuranceRecovery + myH.income.fxGainLoss - myH.income.riskLoss - myH.income.interest },
              { label: 'Tax', value: -myH.income.tax },
              { label: 'Net income', value: myH.income.netIncome },
            ]} />
          </Card>
        ) : (
          <Card title="Market potential vs sales">
            <GroupedBars format={(v) => `${fmtNum(v / 1000)}K`} series={[{ name: 'Potential', color: '#9aa6a0' }, { name: 'Sold', color: '#1f8f4e' }]}
              groups={COUNTRIES.map((c) => ({ label: c, values: [r.marketSize[c], sum(r.countryResults.filter((x) => x.country === c).map((x) => x.salesBoxes))] }))} />
          </Card>
        )}
      </div>

      {me && (
        <Card title={`Demand vs sales · ${me.name}`}>
          <GroupedBars width={1100} height={260} format={(v) => `${fmtNum(v / 1000)}K`} series={[{ name: 'Demand', color: '#2a78d6' }, { name: 'Sold', color: '#1f8f4e' }, { name: 'Lost to stock-outs', color: '#eb6834' }]}
            groups={COUNTRIES.map((c) => {
              const x = r.countryResults.find((y) => y.companyId === me.id && y.country === c);
              return { label: c, values: [x?.demandBoxes ?? 0, x?.salesBoxes ?? 0, Math.max(0, (x?.demandBoxes ?? 0) - (x?.salesBoxes ?? 0))] };
            })} />
        </Card>
      )}
    </div>
  );
}
