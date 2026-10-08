import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, COUNTRY_NAME, Empty, SEGMENT_NAME, Tabs } from '../components';
import { BarChart, PositioningMap } from '../charts';
import { COUNTRIES, SEGMENTS, type CountryCode } from '../../engine/types';
import { fmtK, fmtNum, fmtPct, sum } from '../../engine/util';

const LABEL_TONE: Record<string, 'good' | 'bad' | 'warn' | 'info' | 'accent' | undefined> = {
  Premium: 'accent', 'Value for Money': 'good', Economy: 'info', Overpriced: 'bad', 'Niche Specialist': 'warn', Mainstream: undefined,
};

export default function Reports() {
  const { game, company } = useGame();
  const [idx, setIdx] = useState(game.results.length - 1);
  const [c, setC] = useState<CountryCode>('CN');
  if (!game.results.length) return <Empty>No published rounds yet.</Empty>;
  const r = game.results[Math.max(0, Math.min(idx, game.results.length - 1))];
  const name = (id: string) => game.companies.find((x) => x.id === id)!;
  const rows = r.countryResults.filter((x) => x.country === c).sort((a, b) => b.salesBoxes - a.salesBoxes);
  const pos = r.positions.filter((x) => x.country === c && x.label !== 'Not present');
  const totalSales = sum(rows.map((x) => x.salesBoxes));
  const world = game.companies.map((co) => ({ co, boxes: sum(r.countryResults.filter((x) => x.companyId === co.id).map((x) => x.salesBoxes)) }));
  const worldTotal = sum(world.map((w) => w.boxes));
  const mySeg = company ? r.segmentResults.filter((x) => x.companyId === company.id && x.country === c) : [];
  const me = company ? r.countryResults.find((x) => x.companyId === company.id && x.country === c) : undefined;

  return (
    <div>
      <div className="section-title">
        <h1>Market Share & Positioning</h1>
        <label className="row small">Round
          <select id="report-round" value={idx} onChange={(e) => setIdx(+e.target.value)} style={{ width: 'auto' }}>
            {game.results.map((x, i) => <option key={x.round} value={i}>{x.round <= game.scenario.practiceRounds ? `Practice ${x.round}` : `Round ${x.round - game.scenario.practiceRounds}`}</option>)}
          </select>
        </label>
      </div>
      {r.events.length > 0 && <div className="alert warn small" style={{ marginBottom: 12 }}>Events: {r.events.map((e) => `${e.name}${e.country ? ` (${e.country})` : ''}`).join(' · ')}</div>}

      <Card title="Global volume share">
        <BarChart rows={world.sort((a, b) => b.boxes - a.boxes).map((w) => ({ label: w.co.name, value: worldTotal ? w.boxes / worldTotal : 0, color: w.co.color, note: `${fmtNum(w.boxes)} boxes` }))} format={(v) => fmtPct(v)} />
      </Card>

      <div style={{ marginTop: 16 }}><Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: COUNTRY_NAME[x] }))} /></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title={`Positioning map · ${COUNTRY_NAME[c]}`}>
          {pos.length === 0 ? <p className="muted small">No sales.</p> : (
            <PositioningMap points={pos.map((p) => ({ name: name(p.companyId).name, color: name(p.companyId).color, x: p.rpi, y: p.perceivedQuality, size: p.volumeShare, label: p.label }))} />
          )}
          <div className="row small muted"><span>Potential {fmtNum(r.marketSize[c])}</span><span>Sold {fmtNum(totalSales)}</span><span>Penetration {fmtPct(totalSales / Math.max(1, r.marketSize[c]))}</span></div>
        </Card>
        <Card title="Companies">
          <div className="table-wrap"><table>
            <thead><tr><th>Company</th><th className="num">Boxes</th><th className="num">Share</th><th className="num">Revenue</th><th className="num">RPI</th><th className="num">PQ</th><th>Position</th></tr></thead>
            <tbody>{rows.map((x) => {
              const co = name(x.companyId);
              const p = r.positions.find((y) => y.companyId === x.companyId && y.country === c)!;
              return (
                <tr key={x.companyId} className={company?.id === x.companyId ? 'hl' : ''}>
                  <td><span className="inline"><i className="dot" style={{ background: co.color }} />{co.name}</span></td>
                  <td className="num">{fmtNum(x.salesBoxes)}</td>
                  <td className="num">{fmtPct(x.volumeShare)}</td>
                  <td className="num">{fmtK(x.revenueUSD)}</td>
                  <td className="num">{p.label === 'Not present' ? '—' : p.rpi.toFixed(0)}</td>
                  <td className="num">{p.label === 'Not present' ? '—' : p.perceivedQuality.toFixed(0)}</td>
                  <td>{p.label === 'Not present' ? <span className="muted">—</span> : <Badge tone={LABEL_TONE[p.label]}>{p.label}</Badge>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      </div>

      {company && (
        <Card title={`Segment detail · ${company.name}`}>
          {mySeg.length === 0 ? <p className="muted small">No sales.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Segment</th><th>SKU</th><th className="num">Demand</th><th className="num">Sold</th><th className="num">Lost</th><th className="num">Fit</th><th className="num">Utility</th></tr></thead>
              <tbody>{SEGMENTS.flatMap((s) => mySeg.filter((x) => x.segment === s).map((x) => (
                <tr key={s + x.skuId}><td>{SEGMENT_NAME[s]}</td><td>{company.skus.find((k) => k.id === x.skuId)?.name ?? x.skuId}</td><td className="num">{fmtNum(x.demand)}</td><td className="num">{fmtNum(x.sales)}</td><td className="num">{fmtNum(Math.max(0, x.demand - x.sales))}</td><td className="num">{x.fit.toFixed(0)}</td><td className="num">{x.utility.toFixed(2)}</td></tr>
              )))}</tbody>
            </table></div>
          )}
          {me && <div className="row small muted" style={{ marginTop: 10 }}><span>Brand {me.brand.toFixed(0)}</span><span>Coverage {fmtPct(me.coverage, 0)}</span><span>Satisfaction {me.satisfaction.toFixed(0)}</span><span>Stock-outs {fmtNum(me.stockouts)}</span></div>}
        </Card>
      )}
    </div>
  );
}
