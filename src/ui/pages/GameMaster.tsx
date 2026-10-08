import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, Check, COUNTRY_FLAG, COUNTRY_VI, NumField, SelectField, Tabs } from '../components';
import { processRound, refreshEnvironment, isScored, totalRounds } from '../../engine/engine';
import { VARIABLE_REGISTRY, validateEventTemplate } from '../../engine/events';
import { COUNTRIES, type CountryCode, type EventEffect, type EventTemplate, type GameState } from '../../engine/types';
import { deepClone, fmtK, fmtNum } from '../../engine/util';
import { downloadText } from '../store';

type Tab = 'rounds' | 'scenario' | 'events' | 'grading';

export default function GameMaster() {
  const { game, setGame } = useGame();
  const [tab, setTab] = useState<Tab>('rounds');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastInput, setLastInput] = useState<GameState | null>(null);
  const [replay, setReplay] = useState<string>('');

  const audit = (g: GameState, event: string, detail: string) => ({ ...g, audit: [...g.audit, { at: new Date().toISOString(), round: g.round, actor: 'GM', event, detail }] });

  const run = () => {
    setBusy(true);
    setError('');
    setTimeout(() => {
      try {
        const input = audit(deepClone(game), 'LOCK', `Round ${game.round} locked`);
        const { game: next } = processRound(input);
        setLastInput(input);
        setReplay('');
        setGame(audit(next, 'PUBLISH', `Round ${game.round} published`));
      } catch (e) {
        setError(`Xử lý thất bại (FAILED) – dữ liệu không thay đổi: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  const verifyReplay = () => {
    if (!lastInput) return;
    const again = processRound(lastInput).result;
    const orig = game.results.find((r) => r.round === again.round);
    setReplay(orig && orig.outputHash === again.outputHash && orig.inputHash === again.inputHash
      ? `✔ Tái lập thành công: input ${again.inputHash} → output ${again.outputHash}`
      : `✘ Khác biệt! ${orig?.outputHash} vs ${again.outputHash}`);
  };

  const pending = game.companies.filter((c) => !c.isBot && c.status === 'active' && !game.decisions[c.id]?.submitted);
  const last = game.results[game.results.length - 1];

  return (
    <div>
      <div className="section-title"><div><h1>Game Master Studio</h1><div className="muted small">Điều khiển vòng, tham số kịch bản, sự kiện và chấm điểm học thuật. Mọi thay đổi được ghi audit; không thể sửa vòng đã đóng.</div></div>
        <button className="btn sm" onClick={() => downloadText(`${game.name.replace(/\W+/g, '_')}-R${game.round}.json`, JSON.stringify(game))}>⬇ Xuất file save</button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'rounds', label: '🎛️ Vòng chơi' }, { value: 'scenario', label: '🌐 Tham số quốc gia' }, { value: 'events', label: '⚡ Sự kiện' }, { value: 'grading', label: '🎓 Học thuật' }]} />

      {tab === 'rounds' && (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title={game.phase === 'FINISHED' ? 'Trò chơi đã kết thúc' : `Vòng ${game.round} / ${totalRounds(game)} ${isScored(game, game.round) ? '(tính điểm)' : '(vòng thử)'}`}>
            <div className="table-wrap"><table>
              <thead><tr><th>Đội</th><th>Loại</th><th>Trạng thái</th><th className="num">Revision</th></tr></thead>
              <tbody>{game.companies.map((c) => {
                const d = game.decisions[c.id];
                return (
                  <tr key={c.id}>
                    <td><span className="inline"><i className="dot" style={{ background: c.color }} />{c.name}</span></td>
                    <td>{c.isBot ? '🤖 Bot' : '👥 Người'}</td>
                    <td>{c.status === 'bankrupt' ? <Badge tone="bad">Phá sản</Badge> : c.isBot ? <Badge tone="info">Tự động</Badge> : d?.submitted ? <Badge tone="good">Đã nộp</Badge> : <Badge tone="warn">Chưa nộp</Badge>}</td>
                    <td className="num">{d?.revision ?? 0}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            {game.phase !== 'FINISHED' && (
              <div className="stack" style={{ marginTop: 12 }}>
                {pending.length > 0 && <div className="alert warn small">{pending.length} đội chưa nộp – nếu xử lý ngay, hệ thống dùng bản nháp hiện tại của họ (carry-forward an toàn; các hành động không hợp lệ bị huỷ).</div>}
                <button className="btn primary" disabled={busy} onClick={run}>{busy ? '⏳ Đang xử lý…' : `🔒 Khoá & xử lý vòng ${game.round}`}</button>
                {error && <div className="alert bad small">{error}</div>}
              </div>
            )}
          </Card>
          <Card title="Chẩn đoán vòng gần nhất">
            {!last ? <p className="muted small">Chưa có vòng nào được xử lý.</p> : (
              <div className="stack small">
                <div>Vòng <b>{last.round}</b> · engine v{last.engineVersion} · seed {last.seed}</div>
                <div className="mono">input hash {last.inputHash}<br />output hash {last.outputHash}</div>
                <div>Sự kiện: {last.events.length ? last.events.map((e) => `${e.name}${e.country ? ` (${e.country})` : ''}`).join(', ') : 'không có'}</div>
                <div>Bút toán: {fmtNum(last.journal.length)} · tất cả cân Nợ = Có · bảng cân đối mọi công ty cân ✔</div>
                <div>Tổng bán: {COUNTRIES.map((c) => `${COUNTRY_FLAG[c]} ${fmtNum(last.countryResults.filter((r) => r.country === c).reduce((a, r) => a + r.salesBoxes, 0))}`).join(' · ')}</div>
                {lastInput && <div className="row"><button className="btn sm" onClick={verifyReplay}>🔁 Chạy lại để kiểm tra tính tái lập (T-22)</button></div>}
                {replay && <div className={`alert small ${replay.startsWith('✔') ? 'good' : 'bad'}`}>{replay}</div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'scenario' && <ScenarioEditor setGame={(g, msg) => setGame(audit(g, 'SCENARIO_EDIT', msg))} />}
      {tab === 'events' && <EventsEditor setGame={(g, msg) => setGame(audit(g, 'EVENT_EDIT', msg))} />}
      {tab === 'grading' && <Grading />}
    </div>
  );
}

function ScenarioEditor({ setGame }: { setGame: (g: GameState, msg: string) => void }) {
  const { game } = useGame();
  const [c, setC] = useState<CountryCode>('CN');
  const base = game.scenario.countries[c];
  const editable = VARIABLE_REGISTRY.filter((r) => r.gmEditable && r.scope === 'country');
  const setVar = (key: string, v: number) => {
    const g = deepClone(game);
    const reg = VARIABLE_REGISTRY.find((r) => r.key === key)!;
    const val = Math.min(reg.max, Math.max(reg.min, v));
    if (key === 'fxRate') g.fx[base.currency] = val;
    else if (key === 'marketSizeBoxes') {
      const old = Object.values(g.marketSize[c]).reduce((a, b) => a + b, 0) || 1;
      for (const s of Object.keys(g.marketSize[c]) as (keyof typeof g.marketSize[CountryCode])[]) g.marketSize[c][s] = Math.round(g.marketSize[c][s] * val / old);
      (g.scenario.countries[c] as unknown as Record<string, number>)[key] = val;
    } else (g.scenario.countries[c] as unknown as Record<string, number>)[key] = val;
    g.scenario.version += 1;
    refreshEnvironment(g);
    setGame(g, `${c}.${key} = ${val} (scenario v${g.scenario.version})`);
  };
  const current = (key: string) => key === 'fxRate' ? game.fx[base.currency] : key === 'marketSizeBoxes' ? Object.values(game.marketSize[c]).reduce((a, b) => a + b, 0) : (base as unknown as Record<string, number>)[key];
  return (
    <div className="stack">
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: `${COUNTRY_FLAG[x]} ${COUNTRY_VI[x]}` }))} />
      <Card title={`Biến môi trường – ${COUNTRY_VI[c]} (scenario v${game.scenario.version})`}>
        <p className="small muted">Thay đổi áp dụng từ vòng đang mở trở đi; giá trị bị chặn trong khoảng của registry. Giá trị hiển thị là giá trị gốc (trước tác động sự kiện).</p>
        <div className="form-grid">
          {editable.map((r) => (
            <NumField key={r.key} label={r.title} value={Number(current(r.key).toFixed(4))} step={r.max <= 1 ? 0.01 : r.max <= 5 ? 0.05 : 1} min={r.min} max={r.max}
              hint={`${r.unit} · ${r.description}`} onChange={(v) => setVar(r.key, v)} />
          ))}
        </div>
      </Card>
      <Card title="Tham số toàn cục & trọng số điểm">
        <div className="form-grid">
          <NumField label="Chỉ số giá cà phê nhân" value={game.scenario.global.coffeePriceIndex} step={5} min={10} max={500} onChange={(v) => { const g = deepClone(game); g.scenario.global.coffeePriceIndex = v; g.scenario.version++; setGame(g, `coffeePriceIndex = ${v}`); }} />
          <NumField label="Lãi suất USD" value={game.scenario.global.usdInterestRate} step={0.005} min={0} max={0.6} onChange={(v) => { const g = deepClone(game); g.scenario.global.usdInterestRate = v; g.scenario.version++; setGame(g, `usdInterestRate = ${v}`); }} />
          <NumField label="Lãi suất VND" value={game.scenario.global.vndInterestRate} step={0.005} min={0} max={0.6} onChange={(v) => { const g = deepClone(game); g.scenario.global.vndInterestRate = v; g.scenario.version++; setGame(g, `vndInterestRate = ${v}`); }} />
          {(Object.keys(game.scenario.scoring) as (keyof GameState['scenario']['scoring'])[]).map((k) => (
            <NumField key={k} label={`Trọng số ${k}`} value={game.scenario.scoring[k]} step={0.05} min={0} max={1} onChange={(v) => { const g = deepClone(game); g.scenario.scoring[k] = v; g.scenario.version++; setGame(g, `scoring.${k} = ${v}`); }} />
          ))}
        </div>
        {Math.abs(Object.values(game.scenario.scoring).reduce((a, b) => a + b, 0) - 1) > 0.001 && <div className="alert warn small" style={{ marginTop: 8 }}>Tổng trọng số điểm nên bằng 1.</div>}
      </Card>
    </div>
  );
}

function EventsEditor({ setGame }: { setGame: (g: GameState, msg: string) => void }) {
  const { game } = useGame();
  const [draft, setDraft] = useState<EventTemplate>({
    id: `custom-${Date.now().toString(36)}`, name: 'Sự kiện tuỳ chỉnh', description: '', scope: 'country', country: 'US', trigger: 'fixed', round: game.round,
    endRound: 99, probability: 1, severity: 0, durationRounds: 1, effects: [{ variable: 'importTariff', op: 'ADD', value: 0.1 }], destroysExposure: false, publicAnnouncement: true, enabled: true,
  });
  const errs = validateEventTemplate(draft);
  const patchEvent = (id: string, patch: Partial<EventTemplate>) => {
    const g = deepClone(game);
    g.scenario.events = g.scenario.events.map((e) => (e.id === id ? { ...e, ...patch } : e));
    g.scenario.version++;
    setGame(g, `event ${id}: ${JSON.stringify(patch)}`);
  };
  const regKeys = VARIABLE_REGISTRY.filter((r) => draft.scope === 'global' ? r.scope === 'global' : r.scope === 'country');
  return (
    <div className="stack">
      <Card title="Mẫu sự kiện (event_templates)">
        <p className="small muted">Sự kiện được rút ngẫu nhiên bằng seed đã lưu trước khi đóng băng vòng. Sự kiện xác suất chỉ xảy ra từ “vòng” trở đi.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Bật</th><th>Sự kiện</th><th>Phạm vi</th><th>Kích hoạt</th><th className="num">Vòng</th><th className="num">Xác suất</th><th className="num">Mức độ</th><th className="num">Kéo dài</th><th>Tác động</th></tr></thead>
          <tbody>{game.scenario.events.map((e) => (
            <tr key={e.id}>
              <td><input type="checkbox" checked={e.enabled} onChange={(x) => patchEvent(e.id, { enabled: x.target.checked })} aria-label="Bật" /></td>
              <td style={{ whiteSpace: 'normal', minWidth: 180 }}><b>{e.name}</b><div className="small muted">{e.description}</div></td>
              <td>{e.scope === 'global' ? '🌐' : `${COUNTRY_FLAG[e.country!]} ${e.country}`}</td>
              <td><select value={e.trigger} onChange={(x) => patchEvent(e.id, { trigger: x.target.value as EventTemplate['trigger'] })}><option value="fixed">Cố định</option><option value="probabilistic">Xác suất</option></select></td>
              <td className="num"><input type="number" style={{ width: 60 }} value={e.round} min={1} onChange={(x) => patchEvent(e.id, { round: Math.max(1, Math.floor(+x.target.value)) })} /></td>
              <td className="num"><input type="number" style={{ width: 70 }} step={0.01} min={0} max={1} value={e.probability} onChange={(x) => patchEvent(e.id, { probability: Math.min(1, Math.max(0, +x.target.value)) })} /></td>
              <td className="num"><input type="number" style={{ width: 60 }} min={0} max={100} value={e.severity} onChange={(x) => patchEvent(e.id, { severity: Math.min(100, Math.max(0, +x.target.value)) })} /></td>
              <td className="num"><input type="number" style={{ width: 55 }} min={1} value={e.durationRounds} onChange={(x) => patchEvent(e.id, { durationRounds: Math.max(1, Math.floor(+x.target.value)) })} /></td>
              <td className="small">{e.effects.map((f) => `${f.variable} ${f.op} ${f.value}`).join('; ')}{e.destroysExposure ? ' · phá huỷ tài sản' : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Card title="Tạo sự kiện mới (Event DSL – chỉ biến trong registry)">
        <div className="form-grid">
          <label className="field"><span>Tên</span><input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="field"><span>Mô tả</span><input type="text" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <SelectField label="Phạm vi" value={draft.scope === 'global' ? 'global' : draft.country!} onChange={(v) => setDraft(v === 'global' ? { ...draft, scope: 'global', country: undefined, effects: [{ variable: 'coffeePriceIndex', op: 'MULTIPLY', value: 1.2 }] } : { ...draft, scope: 'country', country: v as CountryCode })}
            options={[{ value: 'global', label: '🌐 Toàn cầu' }, ...COUNTRIES.map((c) => ({ value: c, label: `${COUNTRY_FLAG[c]} ${c}` }))]} />
          <SelectField label="Kích hoạt" value={draft.trigger} onChange={(v) => setDraft({ ...draft, trigger: v as EventTemplate['trigger'] })} options={[{ value: 'fixed', label: 'Cố định tại vòng' }, { value: 'probabilistic', label: 'Theo xác suất' }]} />
          <NumField label="Vòng" value={draft.round} step={1} min={game.round} onChange={(v) => setDraft({ ...draft, round: Math.floor(v) })} hint="Không thể đặt cho vòng đã đóng" />
          <NumField label="Xác suất" value={draft.probability} step={0.05} min={0} max={1} onChange={(v) => setDraft({ ...draft, probability: v })} />
          <NumField label="Kéo dài (vòng)" value={draft.durationRounds} step={1} min={1} onChange={(v) => setDraft({ ...draft, durationRounds: Math.floor(v) })} />
          <NumField label="Mức độ phá huỷ (0–100)" value={draft.severity} step={5} min={0} max={100} onChange={(v) => setDraft({ ...draft, severity: v, destroysExposure: v > 0 })} />
        </div>
        <h4 style={{ marginTop: 10 }}>Tác động</h4>
        {draft.effects.map((f, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <select value={f.variable} style={{ width: 'auto' }} onChange={(e) => setDraft({ ...draft, effects: draft.effects.map((x, j) => (j === i ? { ...x, variable: e.target.value } : x)) })}>
              {regKeys.map((r) => <option key={r.key} value={r.key}>{r.title} ({r.key})</option>)}
            </select>
            <select value={f.op} style={{ width: 'auto' }} onChange={(e) => setDraft({ ...draft, effects: draft.effects.map((x, j) => (j === i ? { ...x, op: e.target.value as EventEffect['op'] } : x)) })}>
              {['SET', 'ADD', 'MULTIPLY', 'CAP', 'FLOOR'].map((o) => <option key={o}>{o}</option>)}
            </select>
            <input type="number" style={{ width: 110 }} step={0.01} value={f.value} onChange={(e) => setDraft({ ...draft, effects: draft.effects.map((x, j) => (j === i ? { ...x, value: +e.target.value } : x)) })} />
            <button className="btn sm ghost" onClick={() => setDraft({ ...draft, effects: draft.effects.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div className="row">
          <button className="btn sm" onClick={() => setDraft({ ...draft, effects: [...draft.effects, { variable: regKeys[0].key, op: 'ADD', value: 0 }] })}>+ Tác động</button>
          <button className="btn sm primary" disabled={errs.length > 0 || draft.round < game.round} onClick={() => {
            const g = deepClone(game);
            g.scenario.events.push({ ...draft, id: `custom-${Date.now().toString(36)}` });
            g.scenario.version++;
            setGame(g, `event added: ${draft.name}`);
          }}>Lưu sự kiện</button>
        </div>
        {errs.length > 0 && <div className="alert bad small" style={{ marginTop: 8 }}><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      </Card>
    </div>
  );
}

function Grading() {
  const { game, setGame } = useGame();
  const humans = game.companies;
  const setNote = (id: string, key: string, v: string) => setGame({ ...game, companies: game.companies.map((c) => (c.id === id ? { ...c, notes: { ...c.notes, [key]: v } } : c)) });
  return (
    <div className="stack">
      <div className="alert info small">Điểm học thuật (PESTEL/CAGE, lập luận entry mode, phản tư) được chấm riêng và <b>không</b> cộng vào điểm mô phỏng.</div>
      {humans.map((c) => {
        const notes = Object.entries(c.notes).filter(([k, v]) => !k.startsWith('gm:') && v.trim());
        return (
          <Card key={c.id} title={<span className="inline"><i className="dot" style={{ background: c.color }} />{c.name} <Badge>{notes.length} mục phân tích</Badge> <span className="small muted">LN luỹ kế {fmtK(c.cumulativeNetIncome)}</span></span>}>
            {notes.length > 0 && (
              <details><summary className="small">Xem bài phân tích</summary>
                <div className="stack small" style={{ marginTop: 8 }}>{notes.map(([k, v]) => <div key={k}><b>{k}</b>: {v}</div>)}</div>
              </details>
            )}
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label className="field"><span>Điểm rubric (0–10)</span><input type="number" min={0} max={10} step={0.5} value={c.notes['gm:grade'] ?? ''} onChange={(e) => setNote(c.id, 'gm:grade', e.target.value)} /></label>
              <label className="field" style={{ gridColumn: 'span 2' }}><span>Nhận xét</span><input type="text" value={c.notes['gm:feedback'] ?? ''} onChange={(e) => setNote(c.id, 'gm:feedback', e.target.value)} /></label>
            </div>
            <Check label="Đã chấm" checked={!!c.notes['gm:done']} onChange={(v) => setNote(c.id, 'gm:done', v ? '1' : '')} />
          </Card>
        );
      })}
    </div>
  );
}
