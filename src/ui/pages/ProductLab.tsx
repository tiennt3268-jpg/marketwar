import { useState } from 'react';
import { useTeam } from '../context';
import { AttrRow, Badge, Card, Check, NumField, RangeField, SelectField, SEGMENT_NAME } from '../components';
import { FORMULA_PRESETS, balanceFormula, boxGrams, computeAttributes, formulaMass, sameFormula, validateFormula } from '../../engine/product';
import { productFit } from '../../engine/market';
import { COSTS, latestVersion } from '../../engine/decisions';
import type { DryingTech, FlavorType, Formula, Grade, PackMaterial, Roast, SegmentDef } from '../../engine/types';
import { COUNTRIES } from '../../engine/types';
import { fmtNum, fmtUSD } from '../../engine/util';

export default function ProductLab() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const [sel, setSel] = useState(d.skus[0]?.skuId ?? '');
  const sd = d.skus.find((s) => s.skuId === sel) ?? d.skus[0];
  const sku = co.skus.find((s) => s.id === sd?.skuId);
  const f = sd?.formula;
  const coffeeIdx = game.scenario.global.coffeePriceIndex;

  if (!sd || !f) return <p>No SKU.</p>;
  const attrs = computeAttributes(f, co.processMaturity, coffeeIdx);
  const errors = validateFormula(f);
  const changed = !sku || !sameFormula(latestVersion(sku).formula, f);
  const setF = (patch: Partial<Formula>, rebalance = true) => update((x) => {
    const s = x.skus.find((y) => y.skuId === sd.skuId)!;
    s.formula = rebalance ? balanceFormula({ ...s.formula, ...patch }) : { ...s.formula, ...patch };
  });
  const addSku = () => update((x) => {
    let n = x.skus.length + 1;
    while (x.skus.some((s) => s.skuId === `SKU-${String(n).padStart(3, '0')}`)) n++;
    const id = `SKU-${String(n).padStart(3, '0')}`;
    x.skus.push({ skuId: id, name: `New SKU ${n}`, formula: { ...FORMULA_PRESETS['Low-Sugar 2-in-1'] } });
    for (const c of COUNTRIES) {
      x.countries[c].prices[id] = x.countries[c].prices[x.skus[0].skuId] ?? 1;
      x.countries[c].offered[id] = true;
    }
    x.production[id] = 0;
    setSel(id);
  });

  const fitRows: { country: string; seg: string; fit: number }[] = [];
  for (const c of COUNTRIES) {
    const rep = [...co.research].reverse().find((r) => r.country === c);
    if (!rep) continue;
    for (const s of rep.segments) {
      const segDef = game.env[c].segments.find((x) => x.id === s.id)!;
      const pseudo: SegmentDef = { ...segDef, ideal: s.ideal };
      fitRows.push({ country: c, seg: SEGMENT_NAME[s.id], fit: productFit(attrs, pseudo) });
    }
  }

  return (
    <div>
      <div className="section-title">
        <h1>Product Lab</h1>
        <div className="row">
          {d.skus.map((s) => <button key={s.skuId} className={`btn sm ${s.skuId === sd.skuId ? 'primary' : ''}`} onClick={() => setSel(s.skuId)}>{s.name}{s.retire ? ' (retired)' : ''}</button>)}
          <button className="btn sm" disabled={readOnly || d.skus.filter((s) => !s.retire).length >= COSTS.maxSkus} onClick={addSku}>New SKU (${fmtNum(COSTS.newSkuFee)})</button>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title={<span>{sd.skuId} {!sku ? <Badge tone="info">New</Badge> : changed ? <Badge tone="warn">v{latestVersion(sku).version + 1} pending</Badge> : <Badge>v{latestVersion(sku).version}</Badge>}</span>}>
          <div className="stack">
            <div className="form-grid">
              <label className="field"><span>Product name</span><input id="sku-name" type="text" value={sd.name} disabled={readOnly} onChange={(e) => update((x) => { x.skus.find((y) => y.skuId === sd.skuId)!.name = e.target.value.slice(0, 40); })} /></label>
              <SelectField label="Load preset" value={'' as string} disabled={readOnly} onChange={(v) => v && setF({ ...FORMULA_PRESETS[v] }, false)}
                options={[{ value: '', label: 'Select…' }, ...Object.keys(FORMULA_PRESETS).map((k) => ({ value: k, label: k }))]} />
            </div>
            <h4>Coffee & roast</h4>
            <RangeField label="Robusta / Arabica" value={Math.round(f.robustaPct * 100)} min={0} max={100} step={5} disabled={readOnly}
              format={(v) => `${v}% / ${100 - v}%`} onChange={(v) => setF({ robustaPct: v / 100 })} />
            <div className="form-grid">
              <SelectField<Roast> label="Roast" value={f.roast} disabled={readOnly} onChange={(v) => setF({ roast: v })}
                options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'dark', label: 'Dark' }]} />
              <SelectField<DryingTech> label="Drying technology" value={f.dryingTech} disabled={readOnly} onChange={(v) => setF({ dryingTech: v })}
                options={[{ value: 'spray', label: 'Spray drying' }, { value: 'freeze', label: `Freeze drying${co.hasFreezeTech ? '' : ' (not owned)'}` }]} />
              <SelectField<Grade> label="Ingredient grade" value={f.grade} disabled={readOnly} onChange={(v) => setF({ grade: v })}
                options={[{ value: 'standard', label: 'Standard' }, { value: 'select', label: 'Select (+15%)' }, { value: 'premium', label: 'Premium (+35%)' }]} />
            </div>
            <h4>Formulation (g per box)</h4>
            <div className="form-grid">
              <NumField label="Sugar" suffix="g" value={f.sugarG} step={5} disabled={readOnly} onChange={(v) => setF({ sugarG: v })} />
              <NumField label="Creamer" suffix="g" value={f.creamerG} step={5} disabled={readOnly} onChange={(v) => setF({ creamerG: v })} />
              <SelectField<FlavorType> label="Flavor" value={f.flavorType} disabled={readOnly} onChange={(v) => setF({ flavorType: v, flavorG: v === 'none' ? 0 : Math.max(f.flavorG, 4) })}
                options={[{ value: 'none', label: 'None' }, { value: 'coconut', label: 'Coconut' }, { value: 'vanilla', label: 'Vanilla' }, { value: 'hazelnut', label: 'Hazelnut' }]} />
              {f.flavorType !== 'none' && <NumField label="Flavoring" suffix="g" value={f.flavorG} step={1} disabled={readOnly} onChange={(v) => setF({ flavorG: v })} />}
              <label className="field"><span>Soluble coffee (g)</span><input id="soluble" type="number" value={f.solubleCoffeeG} disabled /></label>
            </div>
            <h4>Packaging</h4>
            <div className="form-grid">
              <NumField label="Sachets per box" value={f.sachetCount} step={1} min={1} max={30} disabled={readOnly} onChange={(v) => setF({ sachetCount: Math.round(v) })} />
              <NumField label="Sachet weight" suffix="g" value={f.sachetWeightG} step={1} min={5} max={40} disabled={readOnly} onChange={(v) => setF({ sachetWeightG: v })} />
              <SelectField<PackMaterial> label="Material" value={f.packMaterial} disabled={readOnly} onChange={(v) => setF({ packMaterial: v })}
                options={[{ value: 'standard', label: 'Standard' }, { value: 'premium', label: 'Premium' }, { value: 'recyclable', label: 'Recyclable' }]} />
            </div>
            <div className="small muted">Mass {formulaMass(f).toFixed(1)} g / box {boxGrams(f).toFixed(1)} g</div>
            {errors.length > 0 && <div className="alert bad small"><b>Invalid formula</b><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
            {sku && (
              <div className="row">
                <Check label="Retire SKU" checked={!!sd.retire} disabled={readOnly} onChange={(v) => update((x) => { x.skus.find((y) => y.skuId === sd.skuId)!.retire = v; })} />
                <Check label={`Re-certify ($${fmtNum(COSTS.newVersionFee)})`} checked={!!sd.recertify} disabled={readOnly || changed} onChange={(v) => update((x) => { x.skus.find((y) => y.skuId === sd.skuId)!.recertify = v; })} />
              </div>
            )}
            {(changed || sd.recertify) && <div className="alert warn small">New version · {fmtUSD(sku ? COSTS.newVersionFee : COSTS.newSkuFee)} · producible from round {game.round + 1}</div>}
          </div>
        </Card>

        <div className="stack">
          <Card title="Product attributes">
            <div className="stack">
              <AttrRow label="Flavor strength" value={attrs.flavorStrength} />
              <AttrRow label="Smoothness" value={attrs.smoothness} />
              <AttrRow label="Sweetness" value={attrs.sweetness} />
              <AttrRow label="Aroma" value={attrs.aroma} />
              <AttrRow label="Healthiness" value={attrs.healthiness} />
              <AttrRow label="Quality index" value={attrs.qualityIndex} />
              <AttrRow label="Packaging" value={attrs.packagingScore} />
              <AttrRow label="Sustainability" value={attrs.sustainability} />
              <AttrRow label="Convenience" value={attrs.convenience} />
            </div>
            <div className="grid g3" style={{ marginTop: 14 }}>
              <div className="stat"><span className="label">Unit cost</span><span className="value">{fmtUSD(attrs.unitCost, 2)}</span></div>
              <div className="stat"><span className="label">Defect rate</span><span className="value">{(attrs.defectRate * 100).toFixed(1)}%</span></div>
              <div className="stat"><span className="label">Process maturity</span><span className="value">{(co.processMaturity * 100).toFixed(0)}</span></div>
            </div>
          </Card>
          <Card title="Segment fit">
            {fitRows.length === 0 ? <p className="muted small">No research data.</p> : (
              <div className="table-wrap"><table><thead><tr><th>Market</th><th>Segment</th><th className="num">Fit</th></tr></thead>
                <tbody>{fitRows.map((r) => <tr key={r.country + r.seg}><td>{r.country}</td><td>{r.seg}</td><td className="num"><b className={r.fit >= 75 ? 'good' : r.fit < 55 ? 'bad' : ''}>{r.fit.toFixed(0)}</b></td></tr>)}</tbody></table></div>
            )}
          </Card>
          {sku && (
            <Card title="Versions">
              <div className="table-wrap"><table>
                <thead><tr><th>Ver</th><th>From</th><th className="num">Quality</th><th className="num">Strength</th><th className="num">Sweet</th><th className="num">Unit cost</th></tr></thead>
                <tbody>{sku.versions.map((v) => <tr key={v.id}><td>v{v.version}</td><td>round {v.effectiveRound}</td><td className="num">{v.attributes.qualityIndex.toFixed(0)}</td><td className="num">{v.attributes.flavorStrength.toFixed(0)}</td><td className="num">{v.attributes.sweetness.toFixed(0)}</td><td className="num">{fmtUSD(v.attributes.unitCost, 2)}</td></tr>)}</tbody>
              </table></div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
