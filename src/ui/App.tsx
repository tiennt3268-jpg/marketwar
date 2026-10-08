import { useCallback, useMemo, useState, type ReactElement } from 'react';
import type { Decision, GameState } from '../engine/types';
import { carryForward } from '../engine/decisions';
import { isScored, totalRounds } from '../engine/engine';
import { Ctx, type GameCtx, type Viewer } from './context';
import { saveGame } from './store';
import { currentUser, logout } from './auth';
import { Badge } from './components';
import Login from './pages/Login';
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

const TEAM_NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: 'Company', items: [{ id: 'overview', label: 'Overview' }, { id: 'intelligence', label: 'Market Intelligence' }] },
  { group: 'Decisions', items: [
    { id: 'product', label: 'Product Lab' }, { id: 'strategy', label: 'Strategy & Entry' },
    { id: 'marketing', label: 'Marketing & Pricing' }, { id: 'operations', label: 'Operations & Logistics' },
    { id: 'treasury', label: 'Finance & Risk' }, { id: 'submit', label: 'Review & Submit' },
  ] },
  { group: 'Results', items: [
    { id: 'reports', label: 'Market Share & Positioning' }, { id: 'finance', label: 'Financial Statements' },
    { id: 'leaderboard', label: 'Leaderboard' }, { id: 'history', label: 'History' },
  ] },
];
const GM_NAV = [{ group: 'Game Master', items: [{ id: 'gm', label: 'Round Control' }, { id: 'reports', label: 'Market Share & Positioning' }, { id: 'leaderboard', label: 'Leaderboard' }] }];

export default function App() {
  const [user, setUser] = useState<string | null>(() => currentUser());
  const [game, setGameState] = useState<GameState | null>(null);
  const [viewer, setViewer] = useState<Viewer>({ role: 'gm' });
  const [page, setPage] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinPrompt, setPinPrompt] = useState<{ companyId: string; value: string; error?: string } | null>(null);

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

  const signOut = () => { logout(); setGameState(null); setUser(null); };

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

  if (!user) return <Login onLogin={setUser} />;
  if (!game || !ctx) return <Home user={user} onOpen={openGame} onSignOut={signOut} />;

  const switchViewer = (val: string) => {
    if (val === 'gm') { setViewer({ role: 'gm' }); setPage('gm'); return; }
    if (game.pins?.[val]) { setPinPrompt({ companyId: val, value: '' }); return; }
    setViewer({ role: 'team', companyId: val });
    if (page === 'gm') setPage('overview');
  };

  const nav = viewer.role === 'gm' ? GM_NAV : TEAM_NAV;
  const scored = isScored(game, game.round);
  const roundLabel = game.phase === 'FINISHED' ? 'Finished' : scored ? `Round ${game.round - game.scenario.practiceRounds}/${game.scenario.scoredRounds}` : `Practice ${game.round}/${game.scenario.practiceRounds}`;
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
    default: body = <GameMaster />;
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="brand">Market Wars</div>
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              <nav className="nav">
                {g.items.map((it) => (
                  <button key={it.id} className={page === it.id ? 'active' : ''} onClick={() => ctx.go(it.id)}>{it.label}</button>
                ))}
              </nav>
            </div>
          ))}
          <div className="nav-group">Account</div>
          <nav className="nav">
            <button onClick={() => setGameState(null)}>Back to lobby</button>
            <button onClick={signOut}>Sign out ({user})</button>
          </nav>
        </aside>
        <div className="main" onClick={() => menuOpen && setMenuOpen(false)}>
          <header className="topbar">
            <div className="row">
              <button className="btn sm menu-toggle" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} aria-label="Menu">Menu</button>
              <strong>{game.name}</strong>
              <Badge tone={scored ? 'accent' : 'info'}>{roundLabel}</Badge>
              <Badge tone={game.phase === 'OPEN' ? 'good' : game.phase === 'FINISHED' ? 'warn' : undefined}>{game.phase}</Badge>
              <span className="small muted">Submitted {submittedCount}/{game.companies.length}</span>
              {game.round <= totalRounds(game) && game.activeEvents.length > 0 && <Badge tone="warn">{game.activeEvents.length} active event{game.activeEvents.length > 1 ? 's' : ''}</Badge>}
            </div>
            <label className="row small">
              <span className="muted">Viewing as</span>
              <select id="viewer-select" value={viewer.role === 'gm' ? 'gm' : viewer.companyId} onChange={(e) => switchViewer(e.target.value)} style={{ width: 'auto' }}>
                <option value="gm">Game Master</option>
                {game.companies.map((c) => <option key={c.id} value={c.id}>{c.isBot ? 'Bot' : 'Team'} · {c.name}</option>)}
              </select>
            </label>
          </header>
          <main className="content">{body}</main>
        </div>
      </div>
      {pinPrompt && (
        <div className="overlay" onClick={() => setPinPrompt(null)}>
          <form className="modal stack" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            if (game.pins?.[pinPrompt.companyId] === pinPrompt.value) { setViewer({ role: 'team', companyId: pinPrompt.companyId }); if (page === 'gm') setPage('overview'); setPinPrompt(null); }
            else setPinPrompt({ ...pinPrompt, error: 'Wrong PIN' });
          }}>
            <h3>Team PIN</h3>
            <input id="pin-input" type="password" autoFocus value={pinPrompt.value} onChange={(e) => setPinPrompt({ ...pinPrompt, value: e.target.value })} />
            {pinPrompt.error && <div className="bad small">{pinPrompt.error}</div>}
            <div className="row"><button className="btn primary" type="submit">Open</button><button className="btn" type="button" onClick={() => setPinPrompt(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </Ctx.Provider>
  );
}
