import { useTeam } from '../context';
import { Badge, Card, COUNTRY_FLAG, COUNTRY_VI, NumField, RangeField, SelectField } from '../components';
import { creditLimit, estimateSpend } from '../../engine/decisions';
import { COUNTRIES, type PolicyTier } from '../../engine/types';
import { fmtK, fmtNum, fmtPct, sum } from '../../engine/util';

export default function Treasury() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const L = co.ledger;
  const spend = estimateSpend(d, co, game);
  const spendTotal = sum(Object.values(spend));
  const g = game.scenario.global;
  const dueIn = sum(COUNTRIES.flatMap((c) => co.countries[c].receivables).filter((r) => r.dueRound <= game.round).map((r) => r.amount)) + sum(co.claims.filter((x) => x.dueRound <= game.round).map((x) => x.amount));
  const available = L.cash + d.newLoan + dueIn - d.minCashReserve;

  return (
    <div>
      <div className="section-title"><div><h1>Tài chính quốc tế & quản trị rủi ro</h1><div className="muted small">Công cụ tài chính có chi phí và ràng buộc – phòng ngừa tỷ giá giảm biến động, không mặc định tăng lợi nhuận.</div></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Ngân sách vòng này">
            <div className="table-wrap"><table><tbody>
              {Object.entries(spend).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmtK(v)}</td></tr>)}
              <tr className="total"><td>Tổng chi dự kiến</td><td className="num">{fmtK(spendTotal)}</td></tr>
              <tr><td>Tiền mặt hiện có</td><td className="num">{fmtK(L.cash)}</td></tr>
              <tr><td>+ Thu nợ / bồi thường đến hạn</td><td className="num">{fmtK(dueIn)}</td></tr>
              <tr><td>+ Khoản vay mới − dự trữ tối thiểu</td><td className="num">{fmtK(d.newLoan - d.minCashReserve)}</td></tr>
              <tr className="total"><td>Khả dụng</td><td className={`num ${available < spendTotal ? 'bad' : 'good'}`}>{fmtK(available)}</td></tr>
            </tbody></table></div>
            {available < spendTotal && <div className="alert bad small" style={{ marginTop: 8 }}>Kế hoạch vượt tiền khả dụng – sẽ bị từ chối khi nộp. Hãy vay thêm, giảm chi hoặc hoãn đầu tư.</div>}
            <p className="small muted" style={{ marginTop: 6 }}>Doanh thu bán hàng trong vòng không được tính trước khi duyệt ngân sách.</p>
          </Card>
          <Card title="Vay & trả nợ (financing_contracts)">
            <div className="form-grid">
              <NumField label="Khoản vay mới" suffix="USD" value={d.newLoan} step={100_000} disabled={readOnly} onChange={(v) => update((x) => { x.newLoan = v; })} hint={`Hạn mức còn lại ${fmtK(creditLimit(co))}`} />
              <SelectField label="Đồng tiền vay" value={d.loanCurrency} disabled={readOnly} onChange={(v) => update((x) => { x.loanCurrency = v as 'USD' | 'VND'; })}
                options={[{ value: 'USD', label: `USD – ${fmtPct(g.usdInterestRate)}/năm (+1% dài hạn)` }, { value: 'VND', label: `VND – ${fmtPct(g.vndInterestRate)}/năm, rủi ro tỷ giá` }]} />
              <SelectField label="Kỳ hạn" value={String(d.loanTermRounds)} disabled={readOnly} onChange={(v) => update((x) => { x.loanTermRounds = Number(v); })}
                options={[{ value: '2', label: 'Ngắn hạn – 2 quý' }, { value: '8', label: 'Dài hạn – 8 quý' }]} />
              <NumField label="Trả nợ trước hạn" suffix="USD" value={d.debtRepayment} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.debtRepayment = v; })} />
              <NumField label="Dự trữ tiền mặt tối thiểu" suffix="USD" value={d.minCashReserve} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.minCashReserve = v; })} />
              <NumField label="Cổ tức" suffix="USD" value={d.dividend} step={50_000} disabled={readOnly} onChange={(v) => update((x) => { x.dividend = v; })} hint="Chỉ khi lợi nhuận giữ lại > 0" />
            </div>
            {co.loans.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 10 }}><table>
                <thead><tr><th>Khoản vay</th><th>Tiền</th><th className="num">Dư nợ (USD)</th><th className="num">Lãi suất</th><th>Đáo hạn</th></tr></thead>
                <tbody>{co.loans.map((l) => <tr key={l.id}><td>{l.id}{l.emergency && <> <Badge tone="bad">khẩn cấp</Badge></>}</td><td>{l.currency}</td><td className="num">{fmtK(l.carryingUsd)}</td><td className="num">{fmtPct(l.annualRate)}</td><td>vòng {l.maturityRound}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Phòng ngừa tỷ giá (fx_hedges)">
            <p className="small muted">Forward khoá tỷ giá của quý trước cho tỷ lệ doanh thu ngoại tệ được chọn (phí 0,4% danh nghĩa). Lãi/lỗ forward ghi riêng ở dòng FX.</p>
            {COUNTRIES.filter((c) => game.env[c].currency !== 'USD').map((c) => (
              <RangeField key={c} label={`${COUNTRY_FLAG[c]} ${game.env[c].currency} – tỷ giá hiện tại ${game.fx[game.env[c].currency].toFixed(game.fx[game.env[c].currency] > 10 ? 1 : 3)}`}
                value={Math.round(d.countries[c].hedgeRatio * 100)} min={0} max={100} step={10} disabled={readOnly} format={(v) => `${v}%`}
                onChange={(v) => update((x) => { x.countries[c].hedgeRatio = v / 100; })} />
            ))}
          </Card>
          <Card title="Bảo hiểm rủi ro chính trị (insurance_policies)">
            <p className="small muted">Bảo hiểm mới mua có hiệu lực từ vòng sau – không bồi thường hồi tố. Basic: 50% tổn thất, hạn mức $1M, khấu trừ $50K. Premium: 85%, $3M, $25K.</p>
            <div className="table-wrap"><table>
              <thead><tr><th>Quốc gia</th><th className="num">Rủi ro</th><th>Hiện tại</th><th>Vòng này</th></tr></thead>
              <tbody>{COUNTRIES.map((c) => {
                const p = co.countries[c];
                return (
                  <tr key={c}>
                    <td>{COUNTRY_FLAG[c]} {COUNTRY_VI[c]}</td>
                    <td className="num">{game.env[c].politicalRisk}</td>
                    <td>{p.politicalPolicy ? <Badge tone={p.politicalPolicy.activeFrom <= game.round ? 'good' : 'warn'}>{p.politicalPolicy.tier} {p.politicalPolicy.activeFrom > game.round ? `(từ v${p.politicalPolicy.activeFrom})` : ''}</Badge> : '—'}</td>
                    <td><select value={d.countries[c].politicalPolicy} disabled={readOnly || (p.status !== 'active' && p.status !== 'pending' && d.countries[c].entryAction !== 'enter')} onChange={(e) => update((x) => { x.countries[c].politicalPolicy = e.target.value as PolicyTier; })}>
                      <option value="none">Không</option><option value="basic">Basic (0,6%/quý)</option><option value="premium">Premium (1,2%/quý)</option>
                    </select></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </Card>
          <Card title="Tóm tắt bảng cân đối">
            <div className="table-wrap"><table><tbody>
              <tr><td>Tiền mặt</td><td className="num">{fmtK(L.cash)}</td></tr>
              <tr><td>Phải thu</td><td className="num">{fmtK(L.receivables)}</td></tr>
              <tr><td>Hàng tồn kho (kể cả đang đi đường)</td><td className="num">{fmtK(L.inventory)}</td></tr>
              <tr><td>Nhà xưởng, thiết bị</td><td className="num">{fmtK(L.ppe)}</td></tr>
              <tr><td>Tài sản vô hình</td><td className="num">{fmtK(L.intangibles)}</td></tr>
              <tr><td>Nợ vay</td><td className="num">{fmtK(L.debt)}</td></tr>
              <tr><td>Lỗ thuế chuyển sang</td><td className="num">{fmtK(co.taxLossCarry)}</td></tr>
              <tr><td>Tỷ giá VND</td><td className="num">{fmtNum(game.fx.VND)}</td></tr>
            </tbody></table></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
