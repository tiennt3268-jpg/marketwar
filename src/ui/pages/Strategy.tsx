import { useState } from 'react';
import { useTeam } from '../context';
import { Badge, Card, COUNTRY_FLAG, COUNTRY_VI, RangeField, SelectField, Tabs } from '../components';
import { MODE_RULES, SCALE_MULT } from '../../engine/scenario';
import { COUNTRIES, ENTRY_MODES, type CountryCode, type EntryScale } from '../../engine/types';
import { fmtK, fmtNum, fmtPct } from '../../engine/util';

export default function Strategy() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const [c, setC] = useState<CountryCode>('CN');
  const p = co.countries[c];
  const cd = d.countries[c];
  const env = game.env[c];
  const rule = MODE_RULES[cd.entryMode];
  const m = SCALE_MULT[cd.entryScale];
  const partners = game.scenario.partners.filter((x) => x.country === c && x.kind === rule.partnerKind);
  const engaged = p.status === 'active' || p.status === 'pending';
  const capexFor = (mode: typeof cd.entryMode) => {
    const r = MODE_RULES[mode];
    if (mode === 'acquisition') {
      const t = game.scenario.partners.find((x) => x.country === c && x.kind === 'acquisition_target');
      return (t?.feeOrMargin ?? 0) * m;
    }
    return r.capex * m * (mode === 'jv' ? cd.ownershipPct : 1);
  };

  return (
    <div>
      <div className="section-title"><div><h1>Chiến lược toàn cầu & thâm nhập thị trường</h1><div className="muted small">Bạn chọn hành động (quốc gia, thời điểm, quy mô, phương thức) – vị thế cạnh tranh do thị trường quyết định.</div></div></div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        {COUNTRIES.map((x) => {
          const px = co.countries[x];
          return (
            <button key={x} className={`card mode-card ${x === c ? 'selected' : ''}`} onClick={() => setC(x)}>
              <div className="spread"><b>{COUNTRY_FLAG[x]} {COUNTRY_VI[x]}</b>{px.status === 'active' ? <Badge tone="good">Active</Badge> : px.status === 'pending' ? <Badge tone="warn">Pending</Badge> : d.countries[x].entryAction === 'enter' ? <Badge tone="info">Kế hoạch</Badge> : <Badge>—</Badge>}</div>
              <div className="small muted">{px.mode ? MODE_RULES[px.mode].label : d.countries[x].entryAction === 'enter' ? `→ ${MODE_RULES[d.countries[x].entryMode].label}` : 'Chưa thâm nhập'}</div>
            </button>
          );
        })}
      </div>
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: `${COUNTRY_FLAG[x]} ${x}` }))} />

      {engaged ? (
        <Card title={`${COUNTRY_VI[c]}: ${MODE_RULES[p.mode!].label} – ${p.status === 'active' ? 'đang hoạt động' : `hoạt động từ vòng ${p.activationRound}`}`}>
          <div className="grid g4">
            <div className="stat"><span className="label">Đối tác</span><b>{game.scenario.partners.find((x) => x.id === p.partnerId)?.name ?? 'Không (tự vận hành)'}</b></div>
            <div className="stat"><span className="label">Sở hữu</span><b>{fmtPct(p.ownershipPct, 0)}</b></div>
            <div className="stat"><span className="label">Công suất tại chỗ</span><b>{p.localCapacity ? fmtNum(p.localCapacity) + ' hộp' : '—'}</b></div>
            <div className="stat"><span className="label">Tài sản tại chỗ</span><b>{fmtK(p.localAssets + p.goodwill)}</b></div>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Kiểm soát: {MODE_RULES[p.mode!].control} · Rủi ro: {MODE_RULES[p.mode!].risk}. {MODE_RULES[p.mode!].licensed ? 'Đối tác sản xuất & bán; bạn nhận phí bản quyền (royalty) – doanh số đối tác không ghi nhận là doanh thu của bạn.' : MODE_RULES[p.mode!].localProduction ? 'Sản xuất tại chỗ – không chịu thuế nhập khẩu thành phẩm; nhập kế hoạch sản xuất ở trang Sản xuất & Logistics.' : 'Xuất khẩu từ Việt Nam – cần gửi hàng ở trang Sản xuất & Logistics.'}</p>
          <div className="row" style={{ marginTop: 8 }}>
            {cd.entryAction === 'exit'
              ? <><Badge tone="bad">Sẽ rút khỏi thị trường cuối vòng này</Badge><button className="btn sm" disabled={readOnly} onClick={() => update((x) => { x.countries[c].entryAction = 'hold'; })}>Huỷ</button></>
              : <button className="btn sm danger" disabled={readOnly} title="Tồn kho chỉ thu hồi ~30%, tài sản ~50%" onClick={() => update((x) => { x.countries[c].entryAction = 'exit'; })}>Rút khỏi thị trường (thu hồi ~30% tồn kho, ~50% tài sản)</button>}
          </div>
        </Card>
      ) : (
        <div className="stack">
          <Card title={`Chọn phương thức thâm nhập ${COUNTRY_VI[c]}`} actions={cd.entryAction === 'enter' ? <Badge tone="info">Sẽ bắt đầu vòng này</Badge> : null}>
            <div className="mode-cards">
              {ENTRY_MODES.map((mode) => {
                const r = MODE_RULES[mode];
                const blocked = r.needsFullOwnership && env.foreignOwnershipCap < 1;
                const selected = cd.entryAction === 'enter' && cd.entryMode === mode;
                return (
                  <button key={mode} className={`mode-card ${selected ? 'selected' : ''} ${blocked ? 'disabled' : ''}`} disabled={readOnly || blocked}
                    onClick={() => update((x) => {
                      const xc = x.countries[c];
                      xc.entryAction = 'enter';
                      xc.entryMode = mode;
                      xc.partnerId = r.partnerKind ? game.scenario.partners.find((pp) => pp.country === c && pp.kind === r.partnerKind)?.id ?? null : null;
                      if (mode === 'jv') xc.ownershipPct = Math.min(xc.ownershipPct || 0.5, env.foreignOwnershipCap);
                    })}>
                    <h3>{r.label}</h3>
                    <div className="small">Set-up {fmtK(r.setupCost * m)} · Đầu tư {fmtK(capexFor(mode))}</div>
                    <div className="small">Thời gian triển khai: {r.leadRounds === 0 ? 'ngay vòng này' : `${r.leadRounds} vòng`}</div>
                    <div className="small muted">Kiểm soát {r.control} · Rủi ro {r.risk}</div>
                    <div className="small muted">Độ phủ tối đa {fmtPct(r.coverageMax, 0)}{r.localCapacity ? ` · CS ${fmtNum(r.localCapacity * m)}` : ''}</div>
                    {blocked && <div className="small bad">Không khả thi: trần sở hữu nước ngoài {fmtPct(env.foreignOwnershipCap, 0)}</div>}
                  </button>
                );
              })}
            </div>
            {cd.entryAction === 'enter' && (
              <div className="stack" style={{ marginTop: 14 }}>
                <div className="form-grid">
                  <SelectField<EntryScale> label="Quy mô" value={cd.entryScale} disabled={readOnly} onChange={(v) => update((x) => { x.countries[c].entryScale = v; })}
                    options={[{ value: 'pilot', label: 'Pilot (×0.5)' }, { value: 'normal', label: 'Normal (×1)' }, { value: 'aggressive', label: 'Aggressive (×1.6)' }]} />
                  {rule.partnerKind && (
                    <SelectField label="Đối tác" value={cd.partnerId ?? ''} disabled={readOnly} onChange={(v) => update((x) => { x.countries[c].partnerId = v || null; })}
                      options={[{ value: '', label: '— chọn —' }, ...partners.map((pp) => ({ value: pp.id, label: `${pp.name} (chất lượng ${(pp.quality * 100).toFixed(0)})` }))]} />
                  )}
                </div>
                {cd.entryMode === 'jv' && (
                  <RangeField label={`Tỷ lệ sở hữu JV (trần ${fmtPct(env.foreignOwnershipCap, 0)})`} value={Math.round(cd.ownershipPct * 100)} min={10} max={Math.round(env.foreignOwnershipCap * 100)} step={5} disabled={readOnly}
                    format={(v) => `${v}%`} onChange={(v) => update((x) => { x.countries[c].ownershipPct = v / 100; })} />
                )}
                {partners.filter((pp) => pp.id === cd.partnerId).map((pp) => <div key={pp.id} className="alert info small"><b>{pp.name}</b>: {pp.description}</div>)}
                <div className="row"><button className="btn sm" disabled={readOnly} onClick={() => update((x) => { x.countries[c].entryAction = 'hold'; })}>Huỷ kế hoạch thâm nhập</button></div>
              </div>
            )}
          </Card>
          <Card title="So sánh nhanh các phương thức (Hill, Ch.15)">
            <div className="table-wrap"><table>
              <thead><tr><th>Phương thức</th><th>Sản xuất</th><th>Doanh thu của bạn</th><th>Thuế NK</th><th className="num">Lead time</th></tr></thead>
              <tbody>
                <tr><td>Indirect export</td><td>VN</td><td>Giá bán − 20% trung gian</td><td>Có</td><td className="num">0</td></tr>
                <tr><td>Direct export</td><td>VN</td><td>Giá bán ròng (sau biên nhà bán lẻ)</td><td>Có</td><td className="num">1</td></tr>
                <tr><td>Licensing / Franchising</td><td>Đối tác</td><td>Royalty 7–10%</td><td>Không</td><td className="num">1</td></tr>
                <tr><td>Joint venture</td><td>Nhà máy JV</td><td>Theo tỷ lệ sở hữu (hợp nhất tỷ lệ)</td><td>Không</td><td className="num">2</td></tr>
                <tr><td>Greenfield / Acquisition</td><td>Nhà máy 100%</td><td>Toàn bộ</td><td>Không</td><td className="num">3 / 1</td></tr>
              </tbody>
            </table></div>
          </Card>
        </div>
      )}
    </div>
  );
}
