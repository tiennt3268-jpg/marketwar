import { useState } from 'react';
import { useTeam } from '../context';
import { AttrRow, Badge, Card, Check, COUNTRY_FLAG, NumField, RangeField, SelectField, SEGMENT_VI } from '../components';
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

  if (!sd || !f) return <p>Không có SKU.</p>;
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

  // fit preview vs latest research (noisy) – falls back to "unknown"
  const fitRows: { country: string; seg: string; fit: number }[] = [];
  for (const c of COUNTRIES) {
    const rep = [...co.research].reverse().find((r) => r.country === c);
    if (!rep) continue;
    for (const s of rep.segments) {
      const segDef = game.env[c].segments.find((x) => x.id === s.id)!;
      const pseudo: SegmentDef = { ...segDef, ideal: s.ideal };
      fitRows.push({ country: `${COUNTRY_FLAG[c]} ${c}`, seg: SEGMENT_VI[s.id], fit: productFit(attrs, pseudo) });
    }
  }

  return (
    <div>
      <div className="section-title">
        <div><h1>Product Formulation Laboratory</h1><div className="muted small">Bạn chỉnh đầu vào (BOM, công nghệ, nguyên liệu, bao bì) – engine suy ra hương vị, chất lượng, tỷ lệ lỗi và giá thành.</div></div>
        <div className="row">
          {d.skus.map((s) => <button key={s.skuId} className={`btn sm ${s.skuId === sd.skuId ? 'primary' : ''}`} onClick={() => setSel(s.skuId)}>{s.retire ? '🗄️ ' : ''}{s.name}</button>)}
          <button className="btn sm" disabled={readOnly || d.skus.filter((s) => !s.retire).length >= COSTS.maxSkus} onClick={addSku}>+ SKU mới (${fmtNum(COSTS.newSkuFee)})</button>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title={<span>PRODUCT LAB / {sd.skuId} {!sku ? <Badge tone="info">Mới</Badge> : changed ? <Badge tone="warn">Phiên bản mới v{latestVersion(sku).version + 1}</Badge> : <Badge>v{latestVersion(sku).version}</Badge>}</span>}>
          <div className="stack">
            <div className="form-grid">
              <label className="field"><span>Tên sản phẩm</span><input type="text" value={sd.name} disabled={readOnly} onChange={(e) => update((x) => { x.skus.find((y) => y.skuId === sd.skuId)!.name = e.target.value.slice(0, 40); })} /></label>
              <SelectField label="Nạp công thức mẫu" value={'' as string} disabled={readOnly} onChange={(v) => v && setF({ ...FORMULA_PRESETS[v] }, false)}
                options={[{ value: '', label: '— chọn preset —' }, ...Object.keys(FORMULA_PRESETS).map((k) => ({ value: k, label: k }))]} />
            </div>
            <h4>Coffee composition & roast</h4>
            <RangeField label="Robusta / Arabica" value={Math.round(f.robustaPct * 100)} min={0} max={100} step={5} disabled={readOnly}
              format={(v) => `${v}% / ${100 - v}%`} onChange={(v) => setF({ robustaPct: v / 100 })} />
            <div className="form-grid">
              <SelectField<Roast> label="Mức rang" value={f.roast} disabled={readOnly} onChange={(v) => setF({ roast: v })}
                options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'dark', label: 'Dark' }]} />
              <SelectField<DryingTech> label="Công nghệ sấy" value={f.dryingTech} disabled={readOnly} onChange={(v) => setF({ dryingTech: v })}
                hint={f.dryingTech === 'freeze' && !co.hasFreezeTech ? '⚠ Chưa có công nghệ freeze-drying: phải thuê gia công (outsourcing) hoặc đầu tư Innovation.' : undefined}
                options={[{ value: 'spray', label: 'Spray drying – chi phí thấp' }, { value: 'freeze', label: `Freeze drying – cao cấp${co.hasFreezeTech ? '' : ' (cần công nghệ)'}` }]} />
              <SelectField<Grade> label="Cấp nguyên liệu" value={f.grade} disabled={readOnly} onChange={(v) => setF({ grade: v })}
                options={[{ value: 'standard', label: 'Standard' }, { value: 'select', label: 'Select (+15% giá hạt)' }, { value: 'premium', label: 'Premium (+35%, truy xuất nguồn gốc)' }]} />
            </div>
            <h4>Formulation (gram / hộp)</h4>
            <div className="form-grid">
              <NumField label="Đường" suffix="g" value={f.sugarG} step={5} disabled={readOnly} onChange={(v) => setF({ sugarG: v })} />
              <NumField label="Bột kem / sữa" suffix="g" value={f.creamerG} step={5} disabled={readOnly} onChange={(v) => setF({ creamerG: v })} />
              <SelectField<FlavorType> label="Hương liệu" value={f.flavorType} disabled={readOnly} onChange={(v) => setF({ flavorType: v, flavorG: v === 'none' ? 0 : Math.max(f.flavorG, 4) })}
                options={[{ value: 'none', label: 'Không' }, { value: 'coconut', label: 'Dừa' }, { value: 'vanilla', label: 'Vani' }, { value: 'hazelnut', label: 'Hạt phỉ' }]} />
              {f.flavorType !== 'none' && <NumField label="Hương liệu" suffix="g" value={f.flavorG} step={1} disabled={readOnly} onChange={(v) => setF({ flavorG: v })} />}
              <label className="field"><span>Cà phê hòa tan (tự cân bằng)</span><input type="number" value={f.solubleCoffeeG} disabled /></label>
            </div>
            <h4>Packaging</h4>
            <div className="form-grid">
              <NumField label="Số gói / hộp" value={f.sachetCount} step={1} min={1} max={30} disabled={readOnly} onChange={(v) => setF({ sachetCount: Math.round(v) })} />
              <NumField label="Khối lượng gói" suffix="g" value={f.sachetWeightG} step={1} min={5} max={40} disabled={readOnly} onChange={(v) => setF({ sachetWeightG: v })} />
              <SelectField<PackMaterial> label="Vật liệu bao bì" value={f.packMaterial} disabled={readOnly} onChange={(v) => setF({ packMaterial: v })}
                options={[{ value: 'standard', label: 'Standard' }, { value: 'premium', label: 'Premium' }, { value: 'recyclable', label: 'Recyclable-oriented' }]} />
            </div>
            <div className="small muted">Khối lượng: {formulaMass(f).toFixed(1)} g / {boxGrams(f).toFixed(1)} g nội dung hộp (giá được quy đổi về hộp chuẩn 200 g).</div>
            {errors.length > 0 && <div className="alert bad small"><b>BOM không hợp lệ (422):</b><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
            {sku && (
              <div className="row">
                <Check label="Ngừng kinh doanh SKU này" checked={!!sd.retire} disabled={readOnly} onChange={(v) => update((x) => { x.skus.find((y) => y.skuId === sd.skuId)!.retire = v; })} />
                <Check label={`Tái kiểm định với process maturity hiện tại ($${fmtNum(COSTS.newVersionFee)})`} checked={!!sd.recertify} disabled={readOnly || changed} onChange={(v) => update((x) => { x.skus.find((y) => y.skuId === sd.skuId)!.recertify = v; })} />
              </div>
            )}
            {(changed || sd.recertify) && <div className="alert warn small">Thay đổi công thức tạo <b>phiên bản mới</b>: chi phí R&D {fmtUSD(sku ? COSTS.newVersionFee : COSTS.newSkuFee)}, sản xuất được từ vòng {game.round + 1}. Hàng tồn kho phiên bản cũ giữ nguyên công thức và giá vốn.</div>}
          </div>
        </Card>

        <div className="stack">
          <Card title="Calculated Product Attributes (engine-derived)">
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
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="stat"><span className="label">Giá thành ước tính / hộp</span><span className="value">{fmtUSD(attrs.unitCost, 2)}</span><span className="sub">tại chỉ số giá cà phê {coffeeIdx.toFixed(0)}</span></div>
              <div className="stat"><span className="label">Tỷ lệ lỗi mục tiêu</span><span className="value">{(attrs.defectRate * 100).toFixed(1)}%</span><span className="sub">giảm thêm nhờ ngân sách QC</span></div>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Process maturity hiện tại: {(co.processMaturity * 100).toFixed(0)}/100 (tăng nhờ R&D, áp dụng cho phiên bản mới). Công thức thử nghiệm của game, không phải mô hình công nghệ thực phẩm đã kiểm chứng.</p>
          </Card>
          <Card title="Độ phù hợp dự kiến (theo báo cáo nghiên cứu, có sai số)">
            {fitRows.length === 0 ? <p className="muted small">Mua nghiên cứu thị trường ở trang Thông tin thị trường để xem độ phù hợp của công thức với từng phân khúc.</p> : (
              <div className="table-wrap"><table><thead><tr><th>Thị trường</th><th>Phân khúc</th><th className="num">Product fit</th></tr></thead>
                <tbody>{fitRows.map((r) => <tr key={r.country + r.seg}><td>{r.country}</td><td>{r.seg}</td><td className="num"><b className={r.fit >= 75 ? 'good' : r.fit < 55 ? 'bad' : ''}>{r.fit.toFixed(0)}</b></td></tr>)}</tbody></table></div>
            )}
          </Card>
          {sku && (
            <Card title="Các phiên bản (product_versions)">
              <div className="table-wrap"><table>
                <thead><tr><th>Ver</th><th>Hiệu lực</th><th className="num">Quality</th><th className="num">Đậm</th><th className="num">Ngọt</th><th className="num">Giá thành</th></tr></thead>
                <tbody>{sku.versions.map((v) => <tr key={v.id}><td>v{v.version}</td><td>từ vòng {v.effectiveRound}</td><td className="num">{v.attributes.qualityIndex.toFixed(0)}</td><td className="num">{v.attributes.flavorStrength.toFixed(0)}</td><td className="num">{v.attributes.sweetness.toFixed(0)}</td><td className="num">{fmtUSD(v.attributes.unitCost, 2)}</td></tr>)}</tbody>
              </table></div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
