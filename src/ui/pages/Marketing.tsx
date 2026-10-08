import { useState } from 'react';
import { useTeam } from '../context';
import { Badge, Card, Check, NumField, RangeField, SEGMENT_NAME, SelectField, Tabs } from '../components';
import { COSTS } from '../../engine/decisions';
import { MODE_RULES } from '../../engine/scenario';
import { AD_CHANNELS, COUNTRIES, SEGMENTS, type AdChannel, type CountryCode, type MessageTheme, type PromotionKind, type SalaryPolicy } from '../../engine/types';
import { fmtK, fmtNum, sum } from '../../engine/util';
import { boxGrams } from '../../engine/product';

const CH_LABEL: Record<AdChannel, string> = { search: 'Search', social: 'Social', video: 'Video', influencer: 'Influencer', offline: 'Offline / TV' };

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
      <div className="section-title"><h1>Marketing & Pricing</h1>{lastPos && lastPos.label !== 'Not present' && <Badge tone="accent">{lastPos.label} · RPI {lastPos.rpi.toFixed(0)} · PQ {lastPos.perceivedQuality.toFixed(0)}</Badge>}</div>
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => {
        const px = co.countries[x];
        const on = px.status === 'active' || px.status === 'pending' || d.countries[x].entryAction === 'enter';
        return { value: x, label: on ? `${x} · in market` : x };
      })} />
      {!engaged && <div className="alert warn small" style={{ marginBottom: 12 }}>Not entered</div>}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Target segments">
            <div className="row">{SEGMENTS.map((s) => (
              <Check key={s} label={SEGMENT_NAME[s]} checked={cd.targetSegments.includes(s)} disabled={readOnly}
                onChange={(v) => set((x) => { x.targetSegments = v ? [...x.targetSegments, s] : x.targetSegments.filter((y) => y !== s); })} />
            ))}</div>
          </Card>
          <Card title={`Retail price (${env.currency} per box)`}>
            <div className="table-wrap"><table>
              <thead><tr><th>SKU</th><th>Sell</th><th className="num">Price</th><th className="num">USD</th><th className="num">Per 200 g</th><th>Local label</th></tr></thead>
              <tbody>{d.skus.filter((s) => !s.retire).map((s) => {
                const price = cd.prices[s.skuId] ?? 0;
                const grams = boxGrams(s.formula);
                const localized = p.labelLocalized[s.skuId];
                return (
                  <tr key={s.skuId}>
                    <td>{s.name}</td>
                    <td><input type="checkbox" checked={!!cd.offered[s.skuId]} disabled={readOnly} onChange={(e) => set((x) => { x.offered[s.skuId] = e.target.checked; })} aria-label="Sell SKU" /></td>
                    <td className="num"><input id={`price-${c}-${s.skuId}`} type="number" style={{ width: 100 }} step={env.fxRate > 10 ? 10 : 0.1} value={price} disabled={readOnly} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) set((x) => { x.prices[s.skuId] = v; }); }} /></td>
                    <td className="num">${(price / env.fxRate).toFixed(2)}</td>
                    <td className="num">{(price * 200 / Math.max(1, grams)).toFixed(env.fxRate > 10 ? 0 : 2)}</td>
                    <td>{localized ? <Badge tone="good">Compliant</Badge> : (
                      <Check label={`$${fmtNum(COSTS.labelLocalizeFee)}`} checked={!!cd.labelLocalize[s.skuId]} disabled={readOnly} onChange={(v) => set((x) => { x.labelLocalize[s.skuId] = v; })} />
                    )}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <RangeField label="Promotion" value={Math.round(cd.promotionRate * 100)} min={0} max={30} step={1} disabled={readOnly} format={(v) => `${v}%`} onChange={(v) => set((x) => { x.promotionRate = v / 100; })} />
              <SelectField<PromotionKind> label="Promotion type" value={cd.promotionKind} disabled={readOnly} onChange={(v) => set((x) => { x.promotionKind = v; })}
                options={[{ value: 'price_cut', label: 'Price cut' }, { value: 'coupon', label: 'Coupon' }, { value: 'bundle', label: 'Bundle' }, { value: 'loyalty', label: 'Loyalty' }]} />
            </div>
          </Card>
          <Card title="Distribution">
            <div className="row" style={{ marginBottom: 10 }}>
              <Check label={`E-commerce (digital ${env.digitalPenetration}/100)`} checked={cd.ecommerce} disabled={readOnly} onChange={(v) => set((x) => { x.ecommerce = v; })} />
              <Check label="Retail" checked={cd.retail} disabled={readOnly} onChange={(v) => set((x) => { x.retail = v; })} />
            </div>
            <div className="form-grid">
              <NumField label="Trade spend" suffix="USD" value={cd.tradeSpend} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.tradeSpend = v; })} />
              <RangeField label="Retailer margin" value={Math.round(cd.retailerMargin * 100)} min={0} max={50} step={1} disabled={readOnly} format={(v) => `${v}%`} onChange={(v) => set((x) => { x.retailerMargin = v / 100; })} />
              <SelectField label="Distributor credit" value={String(cd.creditDays)} disabled={readOnly} onChange={(v) => set((x) => { x.creditDays = Number(v) as 0 | 30 | 60 | 90; })}
                options={[0, 30, 60, 90].map((n) => ({ value: String(n), label: `${n} days` }))} />
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>Coverage {(p.coverage * 100).toFixed(0)}%</div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Advertising" actions={<b className="mono">{fmtK(adTotal)}</b>}>
            <div className="form-grid">
              {AD_CHANNELS.map((ch) => (
                <NumField key={ch} label={`${CH_LABEL[ch]} ×${env.channelEffect[ch].toFixed(2)}`} suffix="USD" value={cd.ads[ch]} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.ads[ch] = v; })} />
              ))}
            </div>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <SelectField<MessageTheme> label="Message" value={cd.messageTheme} disabled={readOnly} onChange={(v) => set((x) => { x.messageTheme = v; })}
                options={[{ value: 'origin', label: 'Authentic Vietnamese' }, { value: 'value', label: 'Value' }, { value: 'flavor', label: 'Flavor' }, { value: 'convenience', label: 'Convenience' }, { value: 'sustainability', label: 'Sustainability' }]} />
              <NumField label="Creative localization" suffix="USD" value={cd.localizationBudget} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.localizationBudget = v; })} />
            </div>
            <div className="row small muted" style={{ marginTop: 10 }}>
              <span>Awareness <b>{p.awareness.toFixed(0)}</b></span><span>Brand <b>{p.brand.toFixed(0)}</b></span><span>Satisfaction <b>{p.satisfaction.toFixed(0)}</b></span><span>Trust <b>{p.trust.toFixed(0)}</b></span>
            </div>
          </Card>
          <Card title="Service & local staff">
            <div className="form-grid">
              <NumField label="Customer service" suffix="USD" value={cd.serviceBudget} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.serviceBudget = v; })} />
              <NumField label="Training" suffix="USD" value={cd.trainingBudget} step={5000} disabled={readOnly} onChange={(v) => set((x) => { x.trainingBudget = v; })} />
              <SelectField<SalaryPolicy> label="Salary policy" value={cd.salaryPolicy} disabled={readOnly} onChange={(v) => set((x) => { x.salaryPolicy = v; })}
                options={[{ value: 'low', label: `Low ($${fmtNum(COSTS.staff.low)})` }, { value: 'standard', label: `Standard ($${fmtNum(COSTS.staff.standard)})` }, { value: 'high', label: `High ($${fmtNum(COSTS.staff.high)})` }]} />
            </div>
          </Card>
          <Card title="Country spend per round">
            <div className="spread"><span>Marketing, distribution, staff</span><b className="mono">{fmtK(total)}</b></div>
            {mode && <div className="spread small muted"><span>{MODE_RULES[mode].label} fixed cost</span><span className="mono">{fmtK(MODE_RULES[mode].fixedCostPerRound)}</span></div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
