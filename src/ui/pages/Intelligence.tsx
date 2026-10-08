import { useState } from 'react';
import { useTeam } from '../context';
import { Card, COUNTRY_NAME, SEGMENT_NAME, SelectField, Tabs } from '../components';
import { LineChart } from '../charts';
import { COUNTRIES, type CountryCode, type ResearchTier } from '../../engine/types';
import { COSTS } from '../../engine/decisions';
import { fmtNum, fmtPct } from '../../engine/util';

const PESTEL = ['Political', 'Economic', 'Social', 'Technological', 'Environmental', 'Legal'];
const CAGE = ['Cultural distance', 'Administrative distance', 'Geographic distance', 'Economic distance'];

export default function Intelligence() {
  const { game, setGame, company: co, decision: d, update, readOnly } = useTeam();
  const [c, setC] = useState<CountryCode>('CN');
  const env = game.env[c];
  const reports = co.research.filter((r) => r.country === c);
  const rep = reports[reports.length - 1];
  const setNote = (key: string, v: string) => {
    setGame({ ...game, companies: game.companies.map((x) => (x.id === co.id ? { ...x, notes: { ...x.notes, [key]: v } } : x)) });
  };
  const fxHist = game.results.map((r) => r.fx[env.currency] ?? 1);
  const potHist = game.results.map((r) => r.marketSize[c]);
  const macro: [string, string][] = [
    ['Currency / FX', `${env.currency} · ${env.fxRate.toFixed(env.fxRate > 10 ? 1 : 3)} per USD`],
    ['Market potential', `${fmtNum(Object.values(game.marketSize[c]).reduce((a, b) => a + b, 0))} boxes/qtr`],
    ['Market growth', `${fmtPct(env.marketGrowth)} /qtr`],
    ['GDP growth', `${fmtPct(env.gdpGrowth)} /yr`],
    ['Import tariff', fmtPct(env.importTariff)],
    ['VAT / sales tax', fmtPct(env.vat)],
    ['Foreign ownership cap', fmtPct(env.foreignOwnershipCap, 0)],
    ['Digital penetration', `${env.digitalPenetration}/100`],
    ['Culture distance', `${env.cultureDistance}/100`],
    ['Political risk', `${env.politicalRisk}/100`],
    ['Customs enforcement', `${env.regulatoryEnforcement}/100`],
    ['Port delay', `${env.portDelayDays} days`],
    ['Carbon / packaging levy', `$${env.carbonTax.toFixed(2)}/box`],
    ['Consumer income index', `${env.consumerIncomeIndex}`],
    ['Labor cost index', `${env.laborCostIndex}`],
  ];
  return (
    <div>
      <div className="section-title"><h1>Market Intelligence</h1></div>
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: COUNTRY_NAME[x] }))} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="Macro environment">
          <div className="table-wrap"><table><tbody>
            {macro.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num"><b>{v}</b></td></tr>)}
          </tbody></table></div>
          {game.activeEvents.filter((e) => !e.country || e.country === c).map((e) => <div key={e.templateId} className="alert warn small" style={{ marginTop: 8 }}><b>{e.name}</b>: {e.description}</div>)}
        </Card>
        <div className="stack">
          <Card title="Market research">
            <SelectField<ResearchTier> label="Research package" value={d.countries[c].researchTier} disabled={readOnly}
              onChange={(v) => update((x) => { x.countries[c].researchTier = v; })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'basic', label: `Basic – $${fmtNum(COSTS.research.basic)} (±25%)` },
                { value: 'advanced', label: `Advanced – $${fmtNum(COSTS.research.advanced)} (±8%)` },
              ]} />
          </Card>
          <Card title={rep ? `Research report – round ${rep.round} (${rep.tier}, ±${(rep.errorBand * 100).toFixed(0)}%)` : 'Research report'}>
            {!rep ? <p className="muted small">No report yet.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Segment</th><th className="num">Size</th><th className="num">Strength</th><th className="num">Smooth</th><th className="num">Sweet</th><th className="num">Aroma</th><th className="num">Health</th><th className="num">Price sens.</th><th className="num">Ref. price</th></tr></thead>
                <tbody>{rep.segments.map((s) => (
                  <tr key={s.id}><td>{SEGMENT_NAME[s.id]}</td><td className="num">{fmtNum(s.size)}</td><td className="num">{s.ideal.flavorStrength.toFixed(0)}</td><td className="num">{s.ideal.smoothness.toFixed(0)}</td><td className="num">{s.ideal.sweetness.toFixed(0)}</td><td className="num">{s.ideal.aroma.toFixed(0)}</td><td className="num">{s.ideal.healthiness.toFixed(0)}</td><td className="num">{s.priceSensitivity.toFixed(1)}</td><td className="num">{s.refPrice.toFixed(1)}</td></tr>
                ))}</tbody>
              </table>
              <p className="small muted" style={{ marginTop: 6 }}>Avg. competitor price: {rep.avgCompetitorPrice === null ? '—' : `${rep.avgCompetitorPrice.toFixed(2)} ${env.currency}`}</p>
              </div>
            )}
          </Card>
          {game.results.length > 0 && (
            <Card title="Trends">
              <LineChart labels={game.results.map((r) => `R${r.round}`)} series={[{ name: `${env.currency}/USD`, color: '#1f8f4e', values: fxHist }]} format={(v) => v.toFixed(v > 10 ? 0 : 3)} yMin={Math.min(...fxHist) * 0.95} height={150} />
              <LineChart labels={game.results.map((r) => `R${r.round}`)} series={[{ name: 'Potential (boxes)', color: '#1f8f4e', values: potHist }]} format={(v) => fmtNum(v / 1000) + 'K'} height={150} />
            </Card>
          )}
        </div>
      </div>
      <div className="section-title"><h2>Analysis – {COUNTRY_NAME[c]}</h2></div>
      <div className="grid g2">
        <Card title="PESTEL">
          <div className="stack">{PESTEL.map((p) => (
            <label key={p} className="field"><span>{p}</span><textarea id={`note-${c}-${p}`} rows={2} value={co.notes[`${c}:${p}`] ?? ''} onChange={(e) => setNote(`${c}:${p}`, e.target.value)} /></label>
          ))}</div>
        </Card>
        <Card title="CAGE & entry mode">
          <div className="stack">{CAGE.map((p) => (
            <label key={p} className="field"><span>{p}</span><textarea id={`note-${c}-${p}`} rows={2} value={co.notes[`${c}:${p}`] ?? ''} onChange={(e) => setNote(`${c}:${p}`, e.target.value)} /></label>
          ))}
            <label className="field"><span>Entry mode justification</span><textarea id={`note-${c}-entry`} rows={3} value={co.notes[`${c}:entry`] ?? ''} onChange={(e) => setNote(`${c}:entry`, e.target.value)} /></label>
          </div>
        </Card>
      </div>
    </div>
  );
}
