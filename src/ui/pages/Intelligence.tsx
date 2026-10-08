import { useState } from 'react';
import { useTeam } from '../context';
import { Card, COUNTRY_VI, SEGMENT_VI, SelectField, Tabs, Badge } from '../components';
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
  const macro: [string, string, string][] = [
    ['Tiền tệ / tỷ giá', `${env.currency} · ${env.fxRate.toFixed(env.fxRate > 10 ? 1 : 3)} / USD`, 'Biến động theo quý; có thể phòng ngừa bằng forward'],
    ['Tiềm năng thị trường', `${fmtNum(Object.values(game.marketSize[c]).reduce((a, b) => a + b, 0))} hộp/quý`, 'Gồm cả người chưa mua (outside option)'],
    ['Tăng trưởng thị trường', `${fmtPct(env.marketGrowth)} / quý`, 'GDP ' + fmtPct(env.gdpGrowth) + '/năm'],
    ['Thuế nhập khẩu', fmtPct(env.importTariff), 'Tính trên giá trị CIF'],
    ['VAT / thuế tiêu dùng', fmtPct(env.vat), 'Bị trừ khỏi giá bán lẻ'],
    ['Trần sở hữu nước ngoài', fmtPct(env.foreignOwnershipCap, 0), 'Quyết định tính khả thi của 100% vốn / liên doanh'],
    ['Thâm nhập số (digital)', `${env.digitalPenetration}/100`, 'Hiệu quả TMĐT & quảng cáo số'],
    ['Khoảng cách văn hoá (CAGE)', `${env.cultureDistance}/100`, 'Phạt nếu không bản địa hoá'],
    ['Rủi ro chính trị', `${env.politicalRisk}/100`, 'Xác suất sự cố, tổn thất tài sản'],
    ['Mức độ kiểm tra hải quan', `${env.regulatoryEnforcement}/100`, 'Xác suất giữ hàng nếu nhãn chưa chuẩn'],
    ['Chậm trễ cảng', `${env.portDelayDays} ngày`, 'Làm tăng rủi ro trễ lô hàng'],
    ['Phí carbon / bao bì', `$${env.carbonTax.toFixed(2)}/hộp`, 'Cộng vào chi phí nhập khẩu'],
    ['Chỉ số thu nhập', `${env.consumerIncomeIndex}`, '100 = trung bình; thấp ⇒ nhạy giá hơn'],
    ['Chi phí lao động', `${env.laborCostIndex}`, 'Ảnh hưởng nhà máy tại chỗ'],
  ];
  return (
    <div>
      <div className="section-title"><h1>Thông tin thị trường</h1><span className="muted small">Dữ liệu vĩ mô công khai · sở thích khách hàng chỉ biết qua nghiên cứu thị trường (có sai số)</span></div>
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: `$${COUNTRY_VI[x]}` }))} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="Môi trường vĩ mô (Environment variables)">
          <div className="table-wrap"><table><tbody>
            {macro.map(([k, v, h]) => <tr key={k}><td>{k}</td><td className="num"><b>{v}</b></td><td className="small muted hide-sm" style={{ whiteSpace: 'normal' }}>{h}</td></tr>)}
          </tbody></table></div>
          {game.activeEvents.filter((e) => !e.country || e.country === c).map((e) => <div key={e.templateId} className="alert warn small" style={{ marginTop: 8 }}><b>{e.name}</b>: {e.description}</div>)}
        </Card>
        <div className="stack">
          <Card title="Mua nghiên cứu thị trường (vòng này)">
            <SelectField<ResearchTier> label="Gói nghiên cứu" value={d.countries[c].researchTier} disabled={readOnly}
              onChange={(v) => update((x) => { x.countries[c].researchTier = v; })}
              options={[
                { value: 'none', label: 'Không mua' },
                { value: 'basic', label: `Basic – $${fmtNum(COSTS.research.basic)} (sai số ±25%)` },
                { value: 'advanced', label: `Advanced – $${fmtNum(COSTS.research.advanced)} (sai số ±8%)` },
              ]} hint="Báo cáo có sau khi xử lý vòng: quy mô phân khúc, điểm lý tưởng về hương vị, độ nhạy giá, giá trung bình đối thủ." />
          </Card>
          <Card title={rep ? `Báo cáo nghiên cứu – vòng ${rep.round} (${rep.tier}, ±${(rep.errorBand * 100).toFixed(0)}%)` : 'Báo cáo nghiên cứu'}>
            {!rep ? <p className="muted small">Chưa có báo cáo cho thị trường này. Hãy mua gói nghiên cứu để biết khẩu vị lý tưởng của từng phân khúc – rất hữu ích khi thiết kế công thức trong Product Lab.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Phân khúc</th><th className="num">Quy mô</th><th className="num">Đậm</th><th className="num">Mượt</th><th className="num">Ngọt</th><th className="num">Thơm</th><th className="num">Healthy</th><th className="num">Nhạy giá</th><th className="num">Giá TC</th></tr></thead>
                <tbody>{rep.segments.map((s) => (
                  <tr key={s.id}><td>{SEGMENT_VI[s.id]}</td><td className="num">{fmtNum(s.size)}</td><td className="num">{s.ideal.flavorStrength.toFixed(0)}</td><td className="num">{s.ideal.smoothness.toFixed(0)}</td><td className="num">{s.ideal.sweetness.toFixed(0)}</td><td className="num">{s.ideal.aroma.toFixed(0)}</td><td className="num">{s.ideal.healthiness.toFixed(0)}</td><td className="num">{s.priceSensitivity.toFixed(1)}</td><td className="num">{s.refPrice.toFixed(1)}</td></tr>
                ))}</tbody>
              </table>
              <p className="small muted" style={{ marginTop: 6 }}>Giá tham chiếu tính bằng {env.currency}/hộp chuẩn 200 g. Giá TB đối thủ vòng trước: {rep.avgCompetitorPrice === null ? 'chưa có đối thủ bán' : `${rep.avgCompetitorPrice.toFixed(2)} ${env.currency}`}.</p>
              </div>
            )}
          </Card>
          {game.results.length > 0 && (
            <Card title="Xu hướng">
              <LineChart labels={game.results.map((r) => `R${r.round}`)} series={[{ name: `${env.currency}/USD`, color: '#1f8f4e', values: fxHist }]} format={(v) => v.toFixed(v > 10 ? 0 : 3)} yMin={Math.min(...fxHist) * 0.95} height={150} />
              <LineChart labels={game.results.map((r) => `R${r.round}`)} series={[{ name: 'Tiềm năng (hộp)', color: '#1f8f4e', values: potHist }]} format={(v) => fmtNum(v / 1000) + 'K'} height={150} />
            </Card>
          )}
        </div>
      </div>
      <div className="section-title"><h2>Phân tích học thuật – {COUNTRY_VI[c]}</h2><Badge>Không ảnh hưởng điểm mô phỏng</Badge></div>
      <div className="grid g2">
        <Card title="PESTEL">
          <div className="stack">{PESTEL.map((p) => (
            <label key={p} className="field"><span>{p}</span><textarea rows={2} value={co.notes[`${c}:${p}`] ?? ''} onChange={(e) => setNote(`${c}:${p}`, e.target.value)} /></label>
          ))}</div>
        </Card>
        <Card title="CAGE & lý do chọn phương thức thâm nhập">
          <div className="stack">{CAGE.map((p) => (
            <label key={p} className="field"><span>{p}</span><textarea rows={2} value={co.notes[`${c}:${p}`] ?? ''} onChange={(e) => setNote(`${c}:${p}`, e.target.value)} /></label>
          ))}
            <label className="field"><span>Entry mode justification</span><textarea rows={3} value={co.notes[`${c}:entry`] ?? ''} onChange={(e) => setNote(`${c}:entry`, e.target.value)} /></label>
          </div>
        </Card>
      </div>
    </div>
  );
}
