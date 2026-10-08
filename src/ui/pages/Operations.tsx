import { useTeam } from '../context';
import { Badge, Card, COUNTRY_FLAG, NumField } from '../components';
import { COSTS, currentVersion, vnAvailableBySku } from '../../engine/decisions';
import { estimateUnitCost } from '../../engine/product';
import { MODE_RULES } from '../../engine/scenario';
import { COUNTRIES, INCOTERMS, type CargoInsurance, type CountryCode, type FreightMode, type Incoterm, type ShipService, type ShipmentDecision } from '../../engine/types';
import { fmtK, fmtNum, fmtUSD, sum } from '../../engine/util';

const INCOTERM_INFO: Record<Incoterm, string> = {
  EXW: 'Người mua chịu cước, rủi ro từ xưởng; phí xử lý của nhà nhập khẩu 15% cước; dễ trễ hơn.',
  FOB: 'Rủi ro chuyển khi hàng lên tàu; nhà nhập khẩu thu phí 10% cước.',
  CIF: 'Bạn trả cước + bảo hiểm (tối thiểu Basic); rủi ro chuyển khi xếp hàng nhưng tổn thất do bảo hiểm của bạn chi trả.',
  DAP: 'Bạn chịu rủi ro tới nơi đến; nhà nhập khẩu làm thủ tục thuế (phí 3%).',
  DDP: 'Bạn chịu toàn bộ cước, thuế, rủi ro; tự thông quan ⇒ ít bị giữ hàng hơn (+$0.02/hộp phí môi giới).',
};

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
  const vnPlant = Math.max(1, co.ledger.ppe - sum(COUNTRIES.map((c) => co.countries[c].localAssets)));

  return (
    <div>
      <div className="section-title"><div><h1>Sản xuất, chuỗi cung ứng & logistics</h1><div className="muted small">Mỗi quyết định logistics là đánh đổi giữa chi phí, thời gian, độ tin cậy và vốn lưu động.</div></div></div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="Nhà máy Việt Nam">
          <div className="grid g3">
            <div className="stat"><span className="label">Công suất</span><b className="mono">{fmtNum(co.vnCapacity)}</b><span className="sub">hộp/quý</span></div>
            <div className="stat"><span className="label">Kế hoạch</span><b className={`mono ${totalProd > co.vnCapacity ? 'bad' : ''}`}>{fmtNum(totalProd)}</b><span className="sub">{((totalProd / co.vnCapacity) * 100).toFixed(0)}% công suất</span></div>
            <div className="stat"><span className="label">Freeze-drying</span><b>{co.hasFreezeTech ? <Badge tone="good">Có</Badge> : <Badge>{fmtK(co.freezeTechProgress)} / {fmtK(COSTS.freezeTechThreshold)}</Badge>}</b></div>
          </div>
          {co.capacityProjects.map((p, i) => <div key={i} className="small muted">🏗️ +{fmtNum(p.addBoxes)} hộp/quý sẵn sàng từ vòng {p.readyRound}</div>)}
          <div className="form-grid" style={{ marginTop: 10 }}>
            <NumField label="Mở rộng công suất (capex)" suffix="USD" value={d.capacityCapex} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.capacityCapex = v; })}
              hint={`≈ +${fmtNum(Math.floor(d.capacityCapex / game.scenario.global.baseCapacityCostPerBox))} hộp/quý, sau 2 vòng`} />
            <NumField label="Bảo trì" suffix="USD" value={d.maintenanceBudget} step={5000} disabled={readOnly} onChange={(v) => update((x) => { x.maintenanceBudget = v; })}
              hint={`Khuyến nghị ≥ ${fmtK(0.02 * vnPlant)} để đạt 100% hiệu suất`} />
            <NumField label="Kiểm định chất lượng (QC)" suffix="USD" value={d.qualityBudget} step={5000} disabled={readOnly} onChange={(v) => update((x) => { x.qualityBudget = v; })} hint="Giảm tỷ lệ lỗi ⇒ hài lòng ↑" />
            <NumField label="R&D" suffix="USD" value={d.rdBudget} step={10_000} disabled={readOnly} onChange={(v) => update((x) => { x.rdBudget = v; })} hint="Process maturity ↑ (phiên bản sau)" />
            <NumField label="Innovation (freeze-drying)" suffix="USD" value={d.innovationBudget} step={50_000} disabled={readOnly || co.hasFreezeTech} onChange={(v) => update((x) => { x.innovationBudget = v; })} hint="Tích luỹ đủ ngưỡng ⇒ có công nghệ" />
            <NumField label="Đa dạng hoá nguồn cung" suffix="USD" value={d.dualSourcingSpend} step={10_000} disabled={readOnly} onChange={(v) => update((x) => { x.dualSourcingSpend = v; })} hint={`Giảm cú sốc giá cà phê (chỉ số hiện tại ${coffeeIdx.toFixed(0)})`} />
          </div>
        </Card>

        <Card title="Kế hoạch sản xuất (production_orders)">
          <div className="table-wrap"><table>
            <thead><tr><th>SKU</th><th>Phiên bản</th><th className="num">Giá thành</th><th className="num">Kho VN</th><th className="num">Sản xuất</th><th className="num">Thuê ngoài (+{COSTS.outsourcingPremium * 100}%)</th></tr></thead>
            <tbody>{skus.map((s) => {
              const v = currentVersion(s, game.round);
              const needTech = v?.formula.dryingTech === 'freeze' && !co.hasFreezeTech;
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{v ? `v${v.version}` : <span className="warn small">chưa có (R&D)</span>}{needTech && <div className="small bad">cần freeze tech</div>}</td>
                  <td className="num">{v ? fmtUSD(estimateUnitCost(v.formula, coffeeIdx, v.attributes.defectRate), 2) : '—'}</td>
                  <td className="num">{fmtNum(vn[s.id] ?? 0)}</td>
                  <td className="num"><input type="number" style={{ width: 100 }} step={5000} min={0} value={d.production[s.id] ?? 0} disabled={readOnly || !v || needTech} onChange={(e) => update((x) => { x.production[s.id] = Math.max(0, Math.floor(+e.target.value || 0)); })} /></td>
                  <td className="num"><input type="number" style={{ width: 100 }} step={5000} min={0} value={d.outsourcing[s.id] ?? 0} disabled={readOnly || !v} onChange={(e) => update((x) => { x.outsourcing[s.id] = Math.max(0, Math.floor(+e.target.value || 0)); })} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <p className="small muted" style={{ marginTop: 6 }}>Thuê ngoài tối đa {fmtNum(COSTS.outsourcingCap)} hộp/vòng, làm được cả freeze-dried. Sản lượng vượt công suất sẽ bị cắt tỷ lệ.</p>
          {localCountries.length > 0 && <>
            <h4 style={{ marginTop: 12 }}>Sản xuất tại nhà máy nước ngoài</h4>
            {localCountries.map((c) => (
              <div key={c} className="stack" style={{ marginBottom: 8 }}>
                <b>{COUNTRY_FLAG[c]} {c} – công suất {fmtNum(co.countries[c].localCapacity)} hộp</b>
                <div className="form-grid">{skus.filter((s) => currentVersion(s, game.round)).map((s) => (
                  <NumField key={s.id} label={s.name} value={d.countries[c].localProduction[s.id] ?? 0} step={5000} disabled={readOnly} onChange={(v) => update((x) => { x.countries[c].localProduction[s.id] = Math.floor(v); })} />
                ))}</div>
              </div>
            ))}
          </>}
        </Card>
      </div>

      <Card title="Lô hàng xuất khẩu (logistics_shipments)" actions={
        <button className="btn sm primary" disabled={readOnly || !exportCountries.length || !skus.length} onClick={() => update((x) => { x.shipments.push({ country: exportCountries[0], skuId: skus[0].id, qty: 20_000, mode: 'sea', service: 'standard', incoterm: 'DAP', insurance: 'basic' }); })}>+ Thêm lô hàng</button>
      }>
        {!exportCountries.length ? <p className="muted small">Cần thâm nhập bằng xuất khẩu gián tiếp/trực tiếp trước khi gửi hàng.</p> : d.shipments.length === 0 ? <p className="muted small">Chưa có lô hàng nào trong vòng này.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Đến</th><th>SKU</th><th className="num">Số hộp</th><th>Phương thức</th><th>Dịch vụ</th><th>Incoterm</th><th>Bảo hiểm</th><th className="num">Cước ước tính</th><th>ETA</th><th /></tr></thead>
            <tbody>{d.shipments.map((s, i) => {
              const r = route(s.country, s.mode);
              const svc = { economy: 0.82, standard: 1, express: 1.35 }[s.service];
              const freight = s.qty * (r.costPerBox * svc + game.env[s.country].carbonTax * (s.mode === 'air' ? 2 : 1));
              const delay = Math.min(0.95, (r.delayProb + game.env[s.country].portDelayDays / 200) * { economy: 1.6, standard: 1, express: 0.4 }[s.service]);
              const closed = !!(game.env[s.country].closedModes & { sea: 1, air: 2, multimodal: 4 }[s.mode]);
              return (
                <tr key={i}>
                  <td><select value={s.country} disabled={readOnly} onChange={(e) => setShip(i, { country: e.target.value as CountryCode })}>{exportCountries.map((c) => <option key={c} value={c}>{COUNTRY_FLAG[c]} {c}</option>)}</select></td>
                  <td><select value={s.skuId} disabled={readOnly} onChange={(e) => setShip(i, { skuId: e.target.value })}>{skus.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></td>
                  <td className="num"><input type="number" style={{ width: 95 }} step={5000} min={0} value={s.qty} disabled={readOnly} onChange={(e) => setShip(i, { qty: Math.max(0, Math.floor(+e.target.value || 0)) })} /></td>
                  <td><select value={s.mode} disabled={readOnly} onChange={(e) => setShip(i, { mode: e.target.value as FreightMode })}><option value="sea">Sea</option><option value="multimodal">Multimodal</option><option value="air">Air</option></select>{closed && <div className="small bad">tuyến đóng</div>}</td>
                  <td><select value={s.service} disabled={readOnly} onChange={(e) => setShip(i, { service: e.target.value as ShipService })}><option value="economy">Economy</option><option value="standard">Standard</option><option value="express">Express</option></select></td>
                  <td><select value={s.incoterm} disabled={readOnly} title={INCOTERM_INFO[s.incoterm]} onChange={(e) => setShip(i, { incoterm: e.target.value as Incoterm })}>{INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                  <td><select value={s.insurance} disabled={readOnly} onChange={(e) => setShip(i, { insurance: e.target.value as CargoInsurance })}><option value="none">Không</option><option value="basic">Basic (60%)</option><option value="comprehensive">Comprehensive (100%, gồm rủi ro chiến tranh)</option></select></td>
                  <td className="num">{fmtK(freight)}</td>
                  <td className="small">{r.leadRounds === 0 ? 'trong vòng' : `+${r.leadRounds} vòng`}<div className="muted">trễ {(delay * 100).toFixed(0)}%</div></td>
                  <td><button className="btn sm ghost" disabled={readOnly} onClick={() => update((x) => { x.shipments.splice(i, 1); })} aria-label="Xoá">✕</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <details style={{ marginTop: 10 }}>
          <summary className="small">Incoterms trong game được mô phỏng thế nào?</summary>
          <ul className="small">{INCOTERMS.map((t) => <li key={t}><b>{t}</b>: {INCOTERM_INFO[t]}</li>)}</ul>
          <p className="small muted">Thuế nhập khẩu = thuế suất × giá trị hải quan (giá vốn + cước, cơ sở CIF). Sea tới Mỹ/Anh mất 1 vòng; hàng tới trong vòng được bán ngay trong vòng đó.</p>
        </details>
      </Card>

      <div className="grid g2" style={{ marginTop: 14, alignItems: 'start' }}>
        <Card title="Tồn kho theo địa điểm (inventory_lots)">
          {co.inventory.length === 0 ? <p className="muted small">Không có tồn kho.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Nơi</th><th>SKU / phiên bản</th><th className="num">Số hộp</th><th className="num">Giá vốn/hộp</th></tr></thead>
              <tbody>{co.inventory.map((l, i) => <tr key={i}><td>{l.location === 'VN' ? '🇻🇳 VN' : `${COUNTRY_FLAG[l.location]} ${l.location}`}</td><td>{l.versionId}</td><td className="num">{fmtNum(l.qty)}</td><td className="num">{fmtUSD(l.unitCost, 2)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="Hàng đang vận chuyển">
          {co.shipments.filter((s) => s.status === 'in_transit' || s.status === 'detained').length === 0 ? <p className="muted small">Không có lô hàng đang đi.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Lô</th><th>Đến</th><th className="num">Hộp</th><th>Phương thức</th><th>ETA</th><th>Trạng thái</th></tr></thead>
              <tbody>{co.shipments.filter((s) => s.status === 'in_transit' || s.status === 'detained').map((s) => (
                <tr key={s.id}><td>{s.id}</td><td>{COUNTRY_FLAG[s.country]} {s.country}</td><td className="num">{fmtNum(sum(s.lines.map((l) => l.qty)))}</td><td>{s.mode}/{s.incoterm}</td><td>vòng {s.etaRound}</td><td>{s.status === 'detained' ? <Badge tone="bad">bị giữ</Badge> : <Badge tone="info">đang đi</Badge>}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
