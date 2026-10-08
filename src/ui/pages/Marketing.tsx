import { useState } from 'react';
import { useTeam } from '../context';
import { Badge, Card, Check, COUNTRY_VI, NumField, RangeField, SEGMENT_VI, SelectField, Tabs } from '../components';
import { COSTS } from '../../engine/decisions';
import { MODE_RULES } from '../../engine/scenario';
import { AD_CHANNELS, COUNTRIES, SEGMENTS, type AdChannel, type CountryCode, type MessageTheme, type PromotionKind, type SalaryPolicy } from '../../engine/types';
import { fmtK, fmtNum, sum } from '../../engine/util';
import { boxGrams } from '../../engine/product';

const CH_LABEL: Record<AdChannel, string> = { search: 'Search', social: 'Social', video: 'Video', influencer: 'Influencer', offline: 'Offline/TV/OOH' };

export default function Marketing() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const [c, setC] = useState<CountryCode>(() => COUNTRIES.find((x) => co.countries[x].status !== 'none' || d.countries[x].entryAction === 'enter') ?? 'CN');
  const cd = d.countries[c];
  const p = co.countries[c];
  const env = game.env[c];
  const engaged = p.status === 'active' || p.status === 'pending' || cd.entryAction === 'enter';
  const mode = p.mode ?? (cd.entryAction === 'enter' ? cd.entryMode : null);
  const set = (fn: (x: typeof cd) => void) => update((dd) => fn(dd.countries[c]));
  const adTotal = sum(Object.values(cd.ads));
  const total = adTotal + cd.localizationBudget + cd.tradeSpend + cd.serviceBudget + cd.trainingBudget + COSTS.staff[cd.salaryPolicy];
  const lastPos = game.results[game.results.length - 1]?.positions.find((x) => x.companyId === co.id && x.country === c);

  return (
    <div>
      <div className="section-title"><div><h1>Marketing, giá & phân phối</h1><div className="muted small">Mỗi thị trường có kế hoạch riêng. Hiệu quả phụ thuộc đặc điểm khách hàng, không phụ thuộc tên chiến lược.</div></div></div>
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => {
        const px = co.countries[x];
        const on = px.status === 'active' || px.status === 'pending' || d.countries[x].entryAction === 'enter';
        return { value: x, label: <span>{x} {on ? '(đã vào)' : ''}</span> };
      })} />
      {!engaged && <div className="alert warn" style={{ marginBottom: 12 }}>Bạn chưa thâm nhập {COUNTRY_VI[c]}. Các thiết lập dưới đây chỉ có hiệu lực sau khi chọn phương thức thâm nhập ở trang Chiến lược.</div>}
      {lastPos && lastPos.label !== 'Not present' && <div className="alert info small" style={{ marginBottom: 12 }}>Vòng trước engine định vị bạn tại {COUNTRY_VI[c]} là <b>{lastPos.label}</b> (RPI {lastPos.rpi.toFixed(0)}, chất lượng cảm nhận {lastPos.perceivedQuality.toFixed(0)}).</div>}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Phân khúc mục tiêu">
            <div className="row">{SEGMENTS.map((s) => (
              <Check key={s} label={SEGMENT_VI[s]} checked={cd.targetSegments.includes(s)} disabled={readOnly}
                onChange={(v) => set((x) => { x.targetSegments = v ? [...x.targetSegments, s] : x.targetSegments.filter((y) => y !== s); })} />
            ))}</div>
            <p className="small muted" style={{ marginTop: 6 }}>Quảng cáo & thông điệp tác động mạnh hơn lên phân khúc được nhắm.</p>
          </Card>
          <Card title={`Giá bán lẻ đề xuất (${env.currency} / hộp)`}>
            <div className="table-wrap"><table>
              <thead><tr><th>SKU</th><th>Bán</th><th className="num">Giá ({env.currency})</th><th className="num">≈ USD</th><th className="num">/200 g</th><th>Nhãn {env.language.toUpperCase()}</th></tr></thead>
              <tbody>{d.skus.filter((s) => !s.retire).map((s) => {
                const price = cd.prices[s.skuId] ?? 0;
                const grams = boxGrams(s.formula);
                const localized = p.labelLocalized[s.skuId];
                return (
                  <tr key={s.skuId}>
                    <td>{s.name}</td>
                    <td><input type="checkbox" checked={!!cd.offered[s.skuId]} disabled={readOnly} onChange={(e) => set((x) => { x.offered[s.skuId] = e.target.checked; })} aria-label="Bán SKU" /></td>
                    <td className="num"><input type="number" style={{ width: 100 }} step={env.fxRate > 10 ? 10 : 0.1} value={price} disabled={readOnly} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) set((x) => { x.prices[s.skuId] = v; }); }} /></td>
                    <td className="num">${(price / env.fxRate).toFixed(2)}</td>
                    <td className="num">{(price * 200 / Math.max(1, grams)).toFixed(env.fxRate > 10 ? 0 : 2)}</td>
                    <td>{localized ? <Badge tone="good">đã chuẩn</Badge> : (
                      <Check label={`$${fmtNum(COSTS.labelLocalizeFee)}`} checked={!!cd.labelLocalize[s.skuId]} disabled={readOnly} onChange={(v) => set((x) => { x.labelLocalize[s.skuId] = v; })} />
                    )}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <p className="small muted" style={{ marginTop: 6 }}>Nhãn/ hồ sơ tuân thủ theo ngôn ngữ nước sở tại giảm mạnh khả năng bị hải quan giữ hàng (chỉ cần cho hàng xuất khẩu). {mode && MODE_RULES[mode].licensed ? 'Với licensing/franchising, giá là giá khuyến nghị cho đối tác.' : ''}</p>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <RangeField label="Khuyến mãi" value={Math.round(cd.promotionRate * 100)} min={0} max={30} step={1} disabled={readOnly} format={(v) => `${v}%`} onChange={(v) => set((x) => { x.promotionRate = v / 100; })} />
              <SelectField<PromotionKind> label="Cơ chế khuyến mãi" value={cd.promotionKind} disabled={readOnly} onChange={(v) => set((x) => { x.promotionKind = v; })}
                options={[{ value: 'price_cut', label: 'Giảm giá trực tiếp' }, { value: 'coupon', label: 'Coupon' }, { value: 'bundle', label: 'Bundle' }, { value: 'loyalty', label: 'Loyalty' }]} />
            </div>
          </Card>
          <Card title="Phân phối & kênh bán">
            <div className="row" style={{ marginBottom: 8 }}>
              <Check label={`E-commerce (digital ${env.digitalPenetration}/100)`} checked={cd.ecommerce} disabled={readOnly} onChange={(v) => set((x) => { x.ecommerce = v; })} />
              <Check label="Bán lẻ truyền thống / siêu thị" checked={cd.retail} disabled={readOnly} onChange={(v) => set((x) => { x.retail = v; })} />
            </div>
            <div className="form-grid">
              <NumField label="Trade spend (trưng bày, chiết khấu kênh)" suffix="USD" value={cd.tradeSpend} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.tradeSpend = v; })} />
              <RangeField label="Biên lợi nhuận nhà bán lẻ" value={Math.round(cd.retailerMargin * 100)} min={0} max={50} step={1} disabled={readOnly} format={(v) => `${v}%`} onChange={(v) => set((x) => { x.retailerMargin = v / 100; })} />
              <SelectField label="Tín dụng cho nhà phân phối" value={String(cd.creditDays)} disabled={readOnly} onChange={(v) => set((x) => { x.creditDays = Number(v) as 0 | 30 | 60 | 90; })}
                options={[0, 30, 60, 90].map((n) => ({ value: String(n), label: `${n} ngày` }))} hint="Tín dụng dài giúp tăng độ phủ nhưng chậm thu tiền & tăng nợ xấu" />
            </div>
            <p className="small muted">Độ phủ hiện tại: <b>{(p.coverage * 100).toFixed(0)}%</b> · Biên nhà bán lẻ cao hơn và trade spend giúp mở rộng độ phủ nhanh hơn.</p>
          </Card>
        </div>

        <div className="stack">
          <Card title="Quảng cáo & thương hiệu" actions={<b className="mono">{fmtK(adTotal)}</b>}>
            <div className="form-grid">
              {AD_CHANNELS.map((ch) => (
                <NumField key={ch} label={CH_LABEL[ch]} suffix="USD" value={cd.ads[ch]} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.ads[ch] = v; })}
                  hint={`Hiệu quả kênh: ×${env.channelEffect[ch].toFixed(2)}`} />
              ))}
            </div>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <SelectField<MessageTheme> label="Thông điệp" value={cd.messageTheme} disabled={readOnly} onChange={(v) => set((x) => { x.messageTheme = v; })}
                options={[{ value: 'origin', label: 'Authentic Vietnamese' }, { value: 'value', label: 'Value' }, { value: 'flavor', label: 'Flavor' }, { value: 'convenience', label: 'Convenience' }, { value: 'sustainability', label: 'Sustainability' }]} />
              <NumField label="Bản địa hoá nội dung" suffix="USD" value={cd.localizationBudget} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.localizationBudget = v; })} hint="Giảm 'khoảng cách văn hoá' & tăng hiệu quả quảng cáo" />
            </div>
            <div className="row small muted" style={{ marginTop: 8 }}>
              <span>Nhận biết: <b>{p.awareness.toFixed(0)}</b></span><span>Thương hiệu: <b>{p.brand.toFixed(0)}</b></span><span>Hài lòng: <b>{p.satisfaction.toFixed(0)}</b></span><span>Tin cậy: <b>{p.trust.toFixed(0)}</b></span>
            </div>
          </Card>
          <Card title="Dịch vụ khách hàng & nhân sự địa phương">
            <div className="form-grid">
              <NumField label="Customer service" suffix="USD" value={cd.serviceBudget} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.serviceBudget = v; })} />
              <NumField label="Đào tạo" suffix="USD" value={cd.trainingBudget} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.trainingBudget = v; })} />
              <SelectField<SalaryPolicy> label="Chính sách lương" value={cd.salaryPolicy} disabled={readOnly} onChange={(v) => set((x) => { x.salaryPolicy = v; })}
                options={[{ value: 'low', label: `Thấp ($${fmtNum(COSTS.staff.low)})` }, { value: 'standard', label: `Chuẩn ($${fmtNum(COSTS.staff.standard)})` }, { value: 'high', label: `Cao ($${fmtNum(COSTS.staff.high)})` }]} />
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Dịch vụ, đào tạo, lương ⇒ mức hài lòng ⇒ niềm tin và thương hiệu các vòng sau.</p>
          </Card>
          <Card title="Tổng chi phí thị trường này / vòng">
            <div className="spread"><span>Marketing + phân phối + nhân sự</span><b className="mono">{fmtK(total)}</b></div>
            {mode && <div className="spread small muted"><span>Chi phí cố định {MODE_RULES[mode].label}</span><span className="mono">{fmtK(MODE_RULES[mode].fixedCostPerRound)}</span></div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
