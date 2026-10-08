import { useState } from 'react';
import { createGame, type TeamConfig } from '../../engine/engine';
import { BOT_PROFILES, BOT_STRATEGIES } from '../../engine/bots';
import { defaultScenario } from '../../engine/scenario';
import type { BotStrategy, GameState } from '../../engine/types';
import { deleteGame, listSaved, loadGame } from '../store';
import { Card, NumField } from '../components';

const COLORS = ['#1f8f4e', '#2f4858', '#7a9e3a', '#4a6fa5', '#9a6b3f', '#6b4f8a', '#2a9d8f', '#8a8f8c'];
const DEFAULT_NAMES = ['Saigon Brew', 'Hanoi Roasters', 'Mekong Coffee', 'Dalat Highlands', 'Hue Heritage', 'Da Nang Drip', 'Can Tho Cafe', 'Ha Long Beans'];

interface TeamRow extends TeamConfig { pin: string }

export default function Home({ onOpen }: { onOpen: (g: GameState) => void }) {
  const [name, setName] = useState('Market Wars – Lớp Kinh doanh quốc tế');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [practice, setPractice] = useState(2);
  const [scored, setScored] = useState(8);
  const [teams, setTeams] = useState<TeamRow[]>([
    { name: DEFAULT_NAMES[0], color: COLORS[0], isBot: false, pin: '' },
    { name: DEFAULT_NAMES[1], color: COLORS[1], isBot: true, botStrategy: 'price_leader', pin: '' },
    { name: DEFAULT_NAMES[2], color: COLORS[2], isBot: true, botStrategy: 'quality_differentiator', pin: '' },
    { name: DEFAULT_NAMES[3], color: COLORS[3], isBot: true, botStrategy: 'export_first', pin: '' },
  ]);
  const [saved, setSaved] = useState(listSaved());
  const [importError, setImportError] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const setTeam = (i: number, patch: Partial<TeamRow>) => setTeams(teams.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const start = () => {
    const sc = defaultScenario();
    sc.practiceRounds = practice;
    sc.scoredRounds = scored;
    const g = createGame({ name, seed, teams: teams.map(({ pin: _p, ...t }) => t), scenario: sc, id: `G-${seed}-${Date.now().toString(36)}` });
    const pins: Record<string, string> = {};
    teams.forEach((t, i) => { if (t.pin && !t.isBot) pins[g.companies[i].id] = t.pin; });
    g.pins = pins;
    onOpen(g);
  };

  const importFile = async (f: File) => {
    try {
      const g = JSON.parse(await f.text()) as GameState;
      if (!g.companies || !g.scenario) throw new Error('not a Market Wars save');
      onOpen(g);
    } catch (e) {
      setImportError(`Không đọc được file: ${(e as Error).message}`);
    }
  };

  return (
    <div className="hero">
      <div className="spread" style={{ marginBottom: 18 }}>
        <div className="row">
          <div>
            <h1 style={{ margin: 0 }}>Market Wars</h1>
            <div className="muted">Vietnam Goes Global – mô phỏng chiến lược thâm nhập thị trường quốc tế</div>
          </div>
        </div>
      </div>
      <p className="muted" style={{ maxWidth: 760 }}>
        Mỗi đội điều hành một doanh nghiệp cà phê hòa tan Việt Nam với điều kiện xuất phát giống hệt nhau, cạnh tranh đồng thời tại
        Trung Quốc, Nhật Bản, Hoa Kỳ và Anh. Bạn tự thiết kế công thức sản phẩm, chọn phương thức thâm nhập, logistics, giá, marketing và tài chính –
        còn chất lượng cảm nhận, định vị, thị phần và lợi nhuận do engine mô phỏng tính ra.
      </p>

      <div className="grid g2" style={{ marginTop: 18, alignItems: 'start' }}>
        <Card title="Tạo trò chơi mới">
          <div className="stack">
            <label className="field"><span>Tên trò chơi</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="form-grid">
              <NumField label="Seed ngẫu nhiên" value={seed} step={1} onChange={(v) => setSeed(Math.floor(v))} hint="Cùng seed + quyết định ⇒ cùng kết quả" />
              <NumField label="Vòng thử (practice)" value={practice} step={1} min={0} max={2} onChange={(v) => setPractice(Math.floor(v))} hint="Reset về điểm xuất phát sau vòng thử" />
              <NumField label="Vòng tính điểm" value={scored} step={1} min={3} max={12} onChange={(v) => setScored(Math.floor(v))} hint="1 vòng = 1 quý" />
            </div>
            <h4 style={{ marginTop: 8 }}>Các đội (2–8)</h4>
            {teams.map((t, i) => (
              <div key={i} className="team-row">
                <input type="color" className="color-swatch" value={t.color} onChange={(e) => setTeam(i, { color: e.target.value })} aria-label="Màu đội" />
                <input type="text" value={t.name} onChange={(e) => setTeam(i, { name: e.target.value })} aria-label="Tên đội" />
                <select value={t.isBot ? 'bot' : 'human'} onChange={(e) => setTeam(i, { isBot: e.target.value === 'bot', botStrategy: e.target.value === 'bot' ? t.botStrategy ?? 'export_first' : undefined })}>
                  <option value="human">Người chơi</option>
                  <option value="bot">Bot</option>
                </select>
                {t.isBot ? (
                  <select value={t.botStrategy} onChange={(e) => setTeam(i, { botStrategy: e.target.value as BotStrategy })} aria-label="Chiến lược bot">
                    {BOT_STRATEGIES.map((s) => <option key={s} value={s}>{BOT_PROFILES[s].label}</option>)}
                  </select>
                ) : <input type="password" placeholder="PIN (tuỳ chọn)" value={t.pin} onChange={(e) => setTeam(i, { pin: e.target.value })} aria-label="PIN" />}
                <button className="btn sm ghost" disabled={teams.length <= 2} onClick={() => setTeams(teams.filter((_, j) => j !== i))} aria-label="Xoá đội">Xoá</button>
              </div>
            ))}
            <div className="row">
              <button className="btn sm" disabled={teams.length >= 8} onClick={() => setTeams([...teams, { name: DEFAULT_NAMES[teams.length] ?? `Team ${teams.length + 1}`, color: COLORS[teams.length % COLORS.length], isBot: true, botStrategy: BOT_STRATEGIES[teams.length % BOT_STRATEGIES.length], pin: '' }])}>+ Thêm đội</button>
            </div>
            <div className="alert info small">
              Chơi chung một máy (hot-seat): mỗi đội chọn tên mình ở ô <b>“Đang xem”</b> để ra quyết định; đặt PIN để giữ bí mật chiến lược.
              Game Master xử lý vòng khi các đội đã nộp. Dữ liệu được lưu trong trình duyệt và có thể xuất file JSON.
            </div>
            <button className="btn primary" onClick={start} disabled={teams.length < 2 || teams.some((t) => !t.name.trim())}>Bắt đầu trò chơi</button>
          </div>
        </Card>

        <div className="stack">
          <Card title="Tiếp tục trò chơi đã lưu">
            {saved.length === 0 ? <p className="muted small">Chưa có trò chơi nào được lưu trên trình duyệt này.</p> : (
              <div className="stack">
                {saved.map((s) => (
                  <div key={s.id} className="spread">
                    <div>
                      <b>{s.name}</b>
                      <div className="small muted">{s.teams} đội · vòng {s.round} · {s.phase} · {new Date(s.savedAt).toLocaleString()}</div>
                    </div>
                    <div className="row">
                      <button className="btn sm primary" onClick={() => { const g = loadGame(s.id); if (g) onOpen(g); }}>Mở</button>
                      {confirmDel === s.id
                        ? <button className="btn sm danger" onClick={() => { deleteGame(s.id); setSaved(listSaved()); setConfirmDel(null); }}>Xác nhận xoá</button>
                        : <button className="btn sm danger" onClick={() => setConfirmDel(s.id)}>Xoá</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <label className="btn sm">Nhập file save (.json)<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
              {importError && <div className="bad small" style={{ marginTop: 6 }}>{importError}</div>}
            </div>
          </Card>
          <Card title="Vòng chơi diễn ra thế nào?">
            <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Mỗi vòng là một quý. Các đội nhập quyết định trên các trang Product Lab, Chiến lược, Marketing, Sản xuất & Logistics, Tài chính.</li>
              <li>Trang <b>Kiểm tra & Nộp</b> xác thực ngân sách, công thức, điều kiện thâm nhập (giống server) rồi nộp.</li>
              <li>Game Master bấm <b>Xử lý vòng</b>: engine chạy sự kiện, sản xuất, vận chuyển, hải quan, hành vi khách hàng (multinomial logit) và hạch toán kép.</li>
              <li>Kết quả công bố: thị phần, định vị tự động, báo cáo tài chính, bảng xếp hạng (Lợi nhuận 30% · Thị phần 25% · ROIC 20% · Thương hiệu 15% · Khả năng chống chịu 10%).</li>
            </ol>
            <p className="small muted" style={{ marginTop: 8 }}>Mọi số liệu quốc gia là giả định phục vụ giảng dạy, không phải thống kê hay luật hiện hành.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
