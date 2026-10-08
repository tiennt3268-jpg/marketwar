import { useTeam } from '../context';
import { Badge, Card, NumField } from '../components';
import { COSTS, currentVersion, vnAvailableBySku } from '../../engine/decisions';
import { estimateUnitCost } from '../../engine/product';
import { MODE_RULES } from '../../engine/scenario';
import { COUNTRIES, INCOTERMS, type CargoInsurance, type CountryCode, type FreightMode, type Incoterm, type ShipService, type ShipmentDecision } from '../../engine/types';
import { fmtK, fmtNum, fmtUSD, sum } from '../../engine/util';

export default function Operations() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const coffeeIdx = game.scenario.global.coffeePriceIndex;
  const vn = vnAvailableBySku(co);
  const skus = co.skus.filter((s) => !s.retired);
  const totalProd = sum(Object.values(d.production));
  const exportCountries = COUNTRIES.filter((c) => {
    const p = co.countries[c];
    const m = p.status === 'active' || p.status === 'pending' ? p.mode : d.countries[c].entryAction === 'enter' ? d.countries[c].entryMode : null;
    return !!m && MODE_RULES[m].exports;
  });
  const localCountries = COUNTRIES.filter((c) => co.countries[c].status === 'active' && co.countries[c].mode && MODE_RULES[co.countries[c].mode!].localProduction);
  const route = (c: CountryCode, m: FreightMode) => game.scenario.routes.find((r) => r.country === c && r.mode === m)!;
  const setShip = (i: number, patch: Partial<ShipmentDecision>) => update((x) => { x.shipments[i] = { ...x.shipments[i], ...patch }; });
  const inTransit = co.shipments.filter((s) => s.status === 'in_transit' || s.status === 'detained');

  return (
    <div>
      <div className="section-title"><h1>Operations & Logistics</h1></div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="Vietnam plant">
          <div className="grid g3">
            <div className="stat"><span className="label">Capacity</span><b className="mono">{fmtNum(co.vnCapacity)}</b><span className="sub">boxes/qtr</span></div>
            <div className="stat"><span className="label">Planned</span><b className={`mono ${totalProd > co.vnCapacity ? 'bad' : ''}`}>{fmtNum(totalProd)}</b><span className="sub">{((totalProd / co.vnCapacity) * 100).toFixed(0)}% utilization</span></div>
            <div className="stat"><span className="label">Freeze drying</span><b>{co.hasFreezeTech ? <Badge tone="good">Owned</Badge> : <Badge>{fmtK(co.freezeTechProgress)} / {fmtK(COSTS.freezeTechThreshold)}</Badge>}</b></div>
          </div>
          {co.capacityProjects.map((p, i) => <div key={i} className="small muted">+{fmtNum(p.addBoxes)} boxes/qtr from round {p.readyRound}</div>)}
          <div className="form-grid" style={{ marginTop: 12 }}>
            <NumField label="Capacity capex" suffix="USD" value={d.capacityCapex} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.capacityCapex = v; })}
              hint={`+${fmtNum(Math.floor(d.capacityCapex / game.scenario.global.baseCapacityCostPerBox))} boxes/qtr`} />
            <NumField label="Maintenance" suffix="USD" value={d.maintenanceBudget} step={5000} disabled={readOnly} onChange={(v) => update((x) => { x.maintenanceBudget = v; })} />
            <NumField label="Quality control" suffix="USD" value={d.qualityBudget} step={5000} disabled={readOnly} onChange={(v) => update((x) => { x.qualityBudget = v; })} />
            <NumField label="R&D" suffix="USD" value={d.rdBudget} step={10_000} disabled={readOnly} onChange={(v) => update((x) => { x.rdBudget = v; })} />
            <NumField label="Innovation" suffix="USD" value={d.innovationBudget} step={50_000} disabled={readOnly || co.hasFreezeTech} onChange={(v) => update((x) => { x.innovationBudget = v; })} />
            <NumField label="Dual sourcing" suffix="USD" value={d.dualSourcingSpend} step={10_000} disabled={readOnly} onChange={(v) => update((x) => { x.dualSourcingSpend = v; })} hint={`Coffee price index ${coffeeIdx.toFixed(0)}`} />
          </div>
        </Card>

        <Card title="Production plan">
          <div className="table-wrap"><table>
            <thead><tr><th>SKU</th><th>Version</th><th className="num">Unit cost</th><th className="num">VN stock</th><th className="num">Produce</th><th className="num">Outsource</th></tr></thead>
            <tbody>{skus.map((s) => {
              const v = currentVersion(s, game.round);
              const needTech = v?.formula.dryingTech === 'freeze' && !co.hasFreezeTech;
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{v ? `v${v.version}` : <span className="warn small">Not ready</span>}{needTech && <div className="small bad">Needs freeze tech</div>}</td>
                  <td className="num">{v ? fmtUSD(estimateUnitCost(v.formula, coffeeIdx, v.attributes.defectRate), 2) : '—'}</td>
                  <td className="num">{fmtNum(vn[s.id] ?? 0)}</td>
                  <td className="num"><input id={`prod-${s.id}`} type="number" style={{ width: 96 }} step={5000} min={0} value={d.production[s.id] ?? 0} disabled={readOnly || !v || needTech} onChange={(e) => update((x) => { x.production[s.id] = Math.max(0, Math.floor(+e.target.value || 0)); })} /></td>
                  <td className="num"><input id={`out-${s.id}`} type="number" style={{ width: 96 }} step={5000} min={0} value={d.outsourcing[s.id] ?? 0} disabled={readOnly || !v} onChange={(e) => update((x) => { x.outsourcing[s.id] = Math.max(0, Math.floor(+e.target.value || 0)); })} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="small muted" style={{ marginTop: 8 }}>Outsourcing +{COSTS.outsourcingPremium * 100}% · max {fmtNum(COSTS.outsourcingCap)} boxes</div>
          {localCountries.length > 0 && <>
            <h4 style={{ marginTop: 14 }}>Local plants</h4>
            {localCountries.map((c) => (
              <div key={c} className="stack" style={{ marginBottom: 8 }}>
                <b>{c} · capacity {fmtNum(co.countries[c].localCapacity)}</b>
                <div className="form-grid">{skus.filter((s) => currentVersion(s, game.round)).map((s) => (
                  <NumField key={s.id} label={s.name} value={d.countries[c].localProduction[s.id] ?? 0} step={5000} disabled={readOnly} onChange={(v) => update((x) => { x.countries[c].localProduction[s.id] = Math.floor(v); })} />
                ))}</div>
              </div>
            ))}
          </>}
        </Card>
      </div>

      <Card title="Shipments" actions={
        <button className="btn sm primary" disabled={readOnly || !exportCountries.length || !skus.length} onClick={() => update((x) => { x.shipments.push({ country: exportCountries[0], skuId: skus[0].id, qty: 20_000, mode: 'sea', service: 'standard', incoterm: 'DAP', insurance: 'basic' }); })}>Add shipment</button>
      }>
        {!exportCountries.length ? <p className="muted small">No export market.</p> : d.shipments.length === 0 ? <p className="muted small">No shipments.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>To</th><th>SKU</th><th className="num">Boxes</th><th>Mode</th><th>Service</th><th>Incoterm</th><th>Insurance</th><th className="num">Freight</th><th>ETA</th><th /></tr></thead>
            <tbody>{d.shipments.map((s, i) => {
              const r = route(s.country, s.mode);
              const svc = { economy: 0.82, standard: 1, express: 1.35 }[s.service];
              const freight = s.qty * (r.costPerBox * svc + game.env[s.country].carbonTax * (s.mode === 'air' ? 2 : 1));
              const delay = Math.min(0.95, (r.delayProb + game.env[s.country].portDelayDays / 200) * { economy: 1.6, standard: 1, express: 0.4 }[s.service]);
              const closed = !!(game.env[s.country].closedModes & { sea: 1, air: 2, multimodal: 4 }[s.mode]);
              return (
                <tr key={i}>
                  <td><select value={s.country} disabled={readOnly} onChange={(e) => setShip(i, { country: e.target.value as CountryCode })}>{exportCountries.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                  <td><select value={s.skuId} disabled={readOnly} onChange={(e) => setShip(i, { skuId: e.target.value })}>{skus.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></td>
                  <td className="num"><input id={`ship-qty-${i}`} type="number" style={{ width: 92 }} step={5000} min={0} value={s.qty} disabled={readOnly} onChange={(e) => setShip(i, { qty: Math.max(0, Math.floor(+e.target.value || 0)) })} /></td>
                  <td><select value={s.mode} disabled={readOnly} onChange={(e) => setShip(i, { mode: e.target.value as FreightMode })}><option value="sea">Sea</option><option value="multimodal">Multimodal</option><option value="air">Air</option></select>{closed && <div className="small bad">Closed</div>}</td>
                  <td><select value={s.service} disabled={readOnly} onChange={(e) => setShip(i, { service: e.target.value as ShipService })}><option value="economy">Economy</option><option value="standard">Standard</option><option value="express">Express</option></select></td>
                  <td><select value={s.incoterm} disabled={readOnly} onChange={(e) => setShip(i, { incoterm: e.target.value as Incoterm })}>{INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                  <td><select value={s.insurance} disabled={readOnly} onChange={(e) => setShip(i, { insurance: e.target.value as CargoInsurance })}><option value="none">None</option><option value="basic">Basic</option><option value="comprehensive">Comprehensive</option></select></td>
                  <td className="num">{fmtK(freight)}</td>
                  <td className="small">{r.leadRounds === 0 ? 'Same round' : `+${r.leadRounds} round`}<div className="muted">Delay {(delay * 100).toFixed(0)}%</div></td>
                  <td><button className="btn sm ghost" disabled={readOnly} onClick={() => update((x) => { x.shipments.splice(i, 1); })}>Remove</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card title="Inventory">
          {co.inventory.length === 0 ? <p className="muted small">No inventory.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Location</th><th>SKU / version</th><th className="num">Boxes</th><th className="num">Unit cost</th></tr></thead>
              <tbody>{co.inventory.map((l, i) => <tr key={i}><td>{l.location}</td><td>{l.versionId}</td><td className="num">{fmtNum(l.qty)}</td><td className="num">{fmtUSD(l.unitCost, 2)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="In transit">
          {inTransit.length === 0 ? <p className="muted small">Nothing in transit.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>ID</th><th>To</th><th className="num">Boxes</th><th>Mode</th><th>ETA</th><th>Status</th></tr></thead>
              <tbody>{inTransit.map((s) => (
                <tr key={s.id}><td>{s.id}</td><td>{s.country}</td><td className="num">{fmtNum(sum(s.lines.map((l) => l.qty)))}</td><td>{s.mode} / {s.incoterm}</td><td>Round {s.etaRound}</td><td>{s.status === 'detained' ? <Badge tone="bad">Detained</Badge> : <Badge tone="info">In transit</Badge>}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
