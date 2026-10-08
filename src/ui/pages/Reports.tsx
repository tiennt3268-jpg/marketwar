import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, COUNTRY_FLAG, COUNTRY_VI, Empty, SEGMENT_VI, Tabs } from '../components';
import { BarChart, PositioningMap } from '../charts';
import { COUNTRIES, SEGMENTS, type CountryCode } from '../../engine/types';
import { fmtK, fmtNum, fmtPct, sum } from '../../engine/util';

const LABEL_TONE: Record<string, 'good' | 'bad' | 'warn' | 'info' | 'accent' | undefined> = {
  Premium: 'accent', 'Value for Money': 'good', Economy: 'info', Overpriced: 'bad', 'Niche Specialist': 'warn', Mainstream: undefined,
};

export default function Reports() {
  const { game, company } = useGame();
  const [idx, setIdx] = useState(game.results.length - 1);
  const [c, setC] = useState<CountryCode>('CN');
  if (!game.results.length) return <Empty>Chưa có vòng nào được công bố. Kết quả xuất hiện sau khi Game Master xử lý vòng đầu tiên.</Empty>;
  const r = game.results[Math.max(0, Math.min(idx, game.results.length - 1))];
  const name = (id: string) => game.companies.find((x) => x.id === id)!;
  const rows = r.countryResults.filter((x) => x.country === c).sort((a, b) => b.salesBoxes - a.salesBoxes);
  const pos = r.positions.filter((x) => x.country === c && x.label !== 'Not present');
  const totalSales = sum(rows.map((x) => x.salesBoxes));
  const world = game.companies.map((co) => ({ co, boxes: sum(r.countryResults.filter((x) => x.companyId === co.id).map((x) => x.salesBoxes)) }));
  const worldTotal = sum(world.map((w) => w.boxes));
  const mySeg = company ? r.segmentResults.filter((x) => x.companyId === company.id && x.country === c) : [];
  const practice = r.round <= game.scenario.practiceRounds;

  return (
    <div>
      <div className="section-title">
        <div><h1>Thị phần & định vị thị trường</h1><div className="muted small">Định vị là kết quả engine suy ra từ giá tương đối và chất lượng cảm nhận – không phải biến người chơi chọn, và không được cộng ngược vào cầu.</div></div>
        <label className="row small">Vòng
          <select value={idx} onChange={(e) => setIdx(+e.target.value)} style={{ width: 'auto' }}>
            {game.results.map((x, i) => <option key={x.round} value={i}>{x.round <= game.scenario.practiceRounds ? `Thử ${x.round}` : `Vòng ${x.round - game.scenario.practiceRounds}`}</option>)}
          </select>
        </label>
      </div>
      {practice && <div className="alert info small" style={{ marginBottom: 12 }}>Đây là vòng thử (practice) – các công ty đã được reset sau vòng thử.</div>}
      {r.events.length > 0 && <div className="alert warn small" style={{ marginBottom: 12 }}>⚡ Sự kiện vòng này: {r.events.map((e) => `${e.name}${e.country ? ` (${e.country})` : ''}`).join(' · ')}</div>}

      <Card title="Thị phần toàn cầu (theo sản lượng)">
        <BarChart rows={world.sort((a, b) => b.boxes - a.boxes).map((w) => ({ label: w.co.name, value: worldTotal ? w.boxes / worldTotal : 0, color: w.co.color, note: `${fmtNum(w.boxes)} hộp` }))} format={(v) => fmtPct(v)} />
      </Card>

      <div style={{ marginTop: 14 }}><Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: `${COUNTRY_FLAG[x]} ${COUNTRY_VI[x]}` }))} /></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title={`Perceptual Positioning Map – ${COUNTRY_VI[c]}`}>
          {pos.length === 0 ? <p className="muted small">Không doanh nghiệp nào bán tại đây vòng này.</p> : (
            <PositioningMap points={pos.map((p) => ({ name: name(p.companyId).name, color: name(p.companyId).color, x: p.rpi, y: p.perceivedQuality, size: p.volumeShare, label: p.label }))} />
          )}
          <p className="small muted">Kích thước bong bóng = thị phần sản lượng. Tiềm năng thị trường vòng này: {fmtNum(r.marketSize[c])} hộp; tổng bán: {fmtNum(totalSales)} ({fmtPct(totalSales / Math.max(1, r.marketSize[c]))} – phần còn lại thuộc outside option).</p>
        </Card>
        <Card title="Kết quả theo doanh nghiệp">
          <div className="table-wrap"><table>
            <thead><tr><th>Doanh nghiệp</th><th className="num">Bán (hộp)</th><th className="num">Thị phần</th><th className="num">Doanh thu</th><th className="num">RPI</th><th className="num">PQ</th><th>Định vị</th></tr></thead>
            <tbody>{rows.map((x) => {
              const co = name(x.companyId);
              const p = r.positions.find((y) => y.companyId === x.companyId && y.country === c)!;
              return (
                <tr key={x.companyId} className={company?.id === x.companyId ? 'hl' : ''}>
                  <td><span className="inline"><i className="dot" style={{ background: co.color }} />{co.name}</span></td>
                  <td className="num">{fmtNum(x.salesBoxes)}</td>
                  <td className="num">{fmtPct(x.volumeShare)}</td>
                  <td className="num">{fmtK(x.revenueUSD)}</td>
                  <td className="num">{p.label === 'Not present' ? '—' : p.rpi.toFixed(0)}</td>
                  <td className="num">{p.label === 'Not present' ? '—' : p.perceivedQuality.toFixed(0)}</td>
                  <td>{p.label === 'Not present' ? <span className="muted">—</span> : <Badge tone={LABEL_TONE[p.label]}>{p.label}</Badge>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      </div>

      {company && (
        <Card title={`Chẩn đoán phân khúc của ${company.name} – ${COUNTRY_VI[c]} (chỉ đội bạn thấy)`}>
          {mySeg.length === 0 ? <p className="muted small">Bạn không có sản phẩm bán tại đây vòng này.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Phân khúc</th><th>SKU</th><th className="num">Cầu (lựa chọn đầu)</th><th className="num">Bán</th><th className="num">Hết hàng</th><th className="num">Product fit</th><th className="num">Utility</th></tr></thead>
              <tbody>{SEGMENTS.flatMap((s) => mySeg.filter((x) => x.segment === s).map((x) => (
                <tr key={s + x.skuId}><td>{SEGMENT_VI[s]}</td><td>{company.skus.find((k) => k.id === x.skuId)?.name ?? x.skuId}</td><td className="num">{fmtNum(x.demand)}</td><td className="num">{fmtNum(x.sales)}</td><td className="num">{fmtNum(Math.max(0, x.demand - x.sales))}</td><td className="num">{x.fit.toFixed(0)}</td><td className="num">{x.utility.toFixed(2)}</td></tr>
              )))}</tbody>
            </table></div>
          )}
          {(() => {
            const me = r.countryResults.find((x) => x.companyId === company.id && x.country === c);
            return me ? <div className="row small muted" style={{ marginTop: 8 }}><span>Thương hiệu {me.brand.toFixed(0)}</span><span>Độ phủ {fmtPct(me.coverage, 0)}</span><span>Hài lòng {me.satisfaction.toFixed(0)}</span><span>Thiếu hàng {fmtNum(me.stockouts)} hộp</span></div> : null;
          })()}
        </Card>
      )}
    </div>
  );
}
