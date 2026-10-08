import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Decision, GameState } from '../engine/types';
import { carryForward } from '../engine/decisions';
import { isScored, totalRounds } from '../engine/engine';
import { Ctx, type GameCtx, type Viewer } from './context';
import { getPref, saveGame, setPref } from './store';
import { Badge } from './components';
import Home from './pages/Home';
import Overview from './pages/Overview';
import Intelligence from './pages/Intelligence';
import ProductLab from './pages/ProductLab';
import Strategy from './pages/Strategy';
import Marketing from './pages/Marketing';
import Operations from './pages/Operations';
import Treasury from './pages/Treasury';
import Submit from './pages/Submit';
import Reports from './pages/Reports';
import Finance from './pages/Finance';
import Leaderboard from './pages/Leaderboard';
import History from './pages/History';
import GameMaster from './pages/GameMaster';
import Guide from './pages/Guide';

const TEAM_NAV: { group: string; items: { id: string; label: string; icon: string }[] }[] = [
  { group: 'Điều hành', items: [{ id: 'overview', label: 'Tổng quan', icon: '🏠' }, { id: 'intelligence', label: 'Thông tin thị trường', icon: '🌏' }] },
  { group: 'Quyết định', items: [
    { id: 'product', label: 'Product Lab', icon: '🧪' }, { id: 'strategy', label: 'Chiến lược & Thâm nhập', icon: '🧭' },
    { id: 'marketing', label: 'Marketing & Giá', icon: '📣' }, { id: 'operations', label: 'Sản xuất & Logistics', icon: '🏭' },
    { id: 'treasury', label: 'Tài chính & Rủi ro', icon: '🏦' }, { id: 'submit', label: 'Kiểm tra & Nộp', icon: '✅' },
  ] },
  { group: 'Kết quả', items: [
    { id: 'reports', label: 'Thị phần & Định vị', icon: '📊' }, { id: 'finance', label: 'Báo cáo tài chính', icon: '📒' },
    { id: 'leaderboard', label: 'Bảng xếp hạng', icon: '🏆' }, { id: 'history', label: 'Lịch sử & Nhật ký', icon: '🕘' },
  ] },
  { group: 'Trợ giúp', items: [{ id: 'guide', label: 'Hướng dẫn chơi', icon: '📘' }] },
];
const GM_NAV = [{ group: 'Game Master', items: [{ id: 'gm', label: 'Điều khiển vòng', icon: '🎛️' }, { id: 'reports', label: 'Thị phần & Định vị', icon: '📊' }, { id: 'leaderboard', label: 'Bảng xếp hạng', icon: '🏆' }, { id: 'guide', label: 'Hướng dẫn', icon: '📘' }] }];

export default function App() {
  const [game, setGameState] = useState<GameState | null>(null);
  const [viewer, setViewer] = useState<Viewer>({ role: 'gm' });
  const [page, setPage] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(getPref('theme', 'auto'));
  const [pinPrompt, setPinPrompt] = useState<{ companyId: string; value: string; error?: string } | null>(null);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    setPref('theme', theme);
  }, [theme]);

  const setGame = useCallback((g: GameState) => {
    setGameState(g);
    saveGame(g);
  }, []);

  const openGame = (g: GameState) => {
    setGameState(g);
    const firstHuman = g.companies.find((c) => !c.isBot && !g.pins?.[c.id]);
    if (firstHuman) { setViewer({ role: 'team', companyId: firstHuman.id }); setPage('overview'); }
    else { setViewer({ role: 'gm' }); setPage('gm'); }
  };

  const ctx: GameCtx | null = useMemo(() => {
    if (!game) return null;
    const company = viewer.role === 'team' ? game.companies.find((c) => c.id === viewer.companyId) ?? null : null;
    const decision = company ? game.decisions[company.id] ?? carryForward(undefined, company, game.scenario, game.round) : null;
    const readOnly = !company || company.isBot || company.status === 'bankrupt' || game.phase !== 'OPEN' || !!decision?.submitted;
    return {
      game, setGame, viewer, company, decision, readOnly,
      go: (p: string) => { setPage(p); setMenuOpen(false); window.scrollTo(0, 0); },
      update: (fn: (d: Decision) => void) => {
        if (!company || readOnly) return;
        const next: Decision = JSON.parse(JSON.stringify(decision));
        fn(next);
        next.revision = (decision?.revision ?? 0) + 1;
        setGame({ ...game, decisions: { ...game.decisions, [company.id]: next } });
      },
    };
  }, [game, viewer, setGame]);

  if (!game || !ctx) return <Home onOpen={openGame} theme={theme} setTheme={setTheme} />;

  const switchViewer = (val: string) => {
    if (val === 'gm') { setViewer({ role: 'gm' }); setPage('gm'); return; }
    if (game.pins?.[val]) { setPinPrompt({ companyId: val, value: '' }); return; }
    setViewer({ role: 'team', companyId: val });
    if (page === 'gm') setPage('overview');
  };

  const nav = viewer.role === 'gm' ? GM_NAV : TEAM_NAV;
  const scored = isScored(game, game.round);
  const roundLabel = game.phase === 'FINISHED' ? 'Kết thúc' : scored ? `Vòng ${game.round - game.scenario.practiceRounds}/${game.scenario.scoredRounds}` : `Vòng thử ${game.round}/${game.scenario.practiceRounds}`;
  const submittedCount = game.companies.filter((c) => c.isBot || game.decisions[c.id]?.submitted || c.status === 'bankrupt').length;

  let body: ReactElement;
  const teamOnly = (el: ReactElement) => (ctx.company ? el : <GameMaster />);
  switch (page) {
    case 'overview': body = teamOnly(<Overview />); break;
    case 'intelligence': body = teamOnly(<Intelligence />); break;
    case 'product': body = teamOnly(<ProductLab />); break;
    case 'strategy': body = teamOnly(<Strategy />); break;
    case 'marketing': body = teamOnly(<Marketing />); break;
    case 'operations': body = teamOnly(<Operations />); break;
    case 'treasury': body = teamOnly(<Treasury />); break;
    case 'submit': body = teamOnly(<Submit />); break;
    case 'reports': body = <Reports />; break;
    case 'finance': body = teamOnly(<Finance />); break;
    case 'leaderboard': body = <Leaderboard />; break;
    case 'history': body = teamOnly(<History />); break;
    case 'guide': body = <Guide />; break;
    default: body = <GameMaster />;
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="brand"><div className="brand-logo">☕</div><div>MARKET WARS<small>Vietnam Goes Global</small></div></div>
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              <nav className="nav">
                {g.items.map((it) => (
                  <button key={it.id} className={page === it.id ? 'active' : ''} onClick={() => ctx.go(it.id)}><span aria-hidden>{it.icon}</span>{it.label}</button>
                ))}
              </nav>
            </div>
          ))}
          <div className="nav-group">Trò chơi</div>
          <nav className="nav">
            <button onClick={() => { setGameState(null); }}>🚪 Thoát về sảnh</button>
          </nav>
        </aside>
        <div className="main" onClick={() => menuOpen && setMenuOpen(false)}>
          <header className="topbar">
            <div className="row">
              <button className="btn sm menu-toggle" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} aria-label="Menu">☰</button>
              <strong>{game.name}</strong>
              <Badge tone={scored ? 'accent' : 'info'}>{roundLabel}</Badge>
              <Badge tone={game.phase === 'OPEN' ? 'good' : game.phase === 'FINISHED' ? 'warn' : undefined}>{game.phase}</Badge>
              <span className="small muted">Đã nộp {submittedCount}/{game.companies.length}</span>
              {game.round <= totalRounds(game) && game.activeEvents.length > 0 && <Badge tone="warn">⚡ {game.activeEvents.length} sự kiện</Badge>}
            </div>
            <div className="row">
              <label className="row small">
                <span className="muted">Đang xem:</span>
                <select value={viewer.role === 'gm' ? 'gm' : viewer.companyId} onChange={(e) => switchViewer(e.target.value)} style={{ width: 'auto' }}>
                  <option value="gm">🎛️ Game Master</option>
                  {game.companies.map((c) => <option key={c.id} value={c.id}>{c.isBot ? '🤖' : '👥'} {c.name}{game.pins?.[c.id] ? ' 🔒' : ''}</option>)}
                </select>
              </label>
              <button className="btn sm ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark')} title="Giao diện sáng/tối">{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌓'}</button>
            </div>
          </header>
          <main className="content">{body}</main>
        </div>
      </div>
      {pinPrompt && (
        <div className="overlay" onClick={() => setPinPrompt(null)}>
          <form className="modal stack" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            if (game.pins?.[pinPrompt.companyId] === pinPrompt.value) { setViewer({ role: 'team', companyId: pinPrompt.companyId }); if (page === 'gm') setPage('overview'); setPinPrompt(null); }
            else setPinPrompt({ ...pinPrompt, error: 'Sai mã PIN' });
          }}>
            <h3>Nhập PIN của đội</h3>
            <input type="password" autoFocus value={pinPrompt.value} onChange={(e) => setPinPrompt({ ...pinPrompt, value: e.target.value })} />
            {pinPrompt.error && <div className="bad small">{pinPrompt.error}</div>}
            <div className="row"><button className="btn primary" type="submit">Mở</button><button className="btn" type="button" onClick={() => setPinPrompt(null)}>Huỷ</button></div>
          </form>
        </div>
      )}
    </Ctx.Provider>
  );
}
