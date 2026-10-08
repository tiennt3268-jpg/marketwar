import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Decision, GameState } from '../engine/types';
import { carryForward } from '../engine/decisions';
import { isScored, totalRounds } from '../engine/engine';
import { Ctx, type GameCtx, type Viewer } from './context';
import { listClasses, loadGame, saveGame, type ClassInfo } from './store';
import { catchUp, timeLeft } from './rounds';
import NotificationsButton from './Notifications';
import { currentUser, logout, type User } from './auth';
import { Badge, Empty } from './components';
import Login from './pages/Login';
import Home from './pages/Home';
import Classes from './pages/Classes';
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
import Assign from './pages/Assign';
import Report from './pages/Report';

const TEAM_NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: 'Company', items: [{ id: 'overview', label: 'Overview' }, { id: 'intelligence', label: 'Market Intelligence' }] },
  { group: 'Decisions', items: [
    { id: 'product', label: 'Product Lab' }, { id: 'strategy', label: 'Strategy & Entry' },
    { id: 'marketing', label: 'Marketing & Pricing' }, { id: 'operations', label: 'Operations & Logistics' },
    { id: 'treasury', label: 'Finance & Risk' }, { id: 'submit', label: 'Review & Submit' },
  ] },
  { group: 'Results', items: [
    { id: 'report', label: 'Round Report' }, { id: 'reports', label: 'Market Share & Positioning' }, { id: 'finance', label: 'Financial Statements' },
    { id: 'leaderboard', label: 'Leaderboard' }, { id: 'history', label: 'History' },
  ] },
];
const GM_NAV = [
  { group: 'Game Master', items: [{ id: 'gm', label: 'Round Control' }, { id: 'assign', label: 'Assign Companies' }] },
  { group: 'Results', items: [{ id: 'report', label: 'Round Report' }, { id: 'reports', label: 'Market Share & Positioning' }, { id: 'leaderboard', label: 'Leaderboard' }] },
];

export default function App() {
  const [user, setUser] = useState<User | null>(() => currentUser());
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [game, setGameState] = useState<GameState | null>(null);
  const [viewer, setViewer] = useState<Viewer>({ role: 'gm' });
  const [page, setPage] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const setGame = useCallback((g: GameState) => {
    setGameState(g);
    saveGame(g);
  }, []);

  const isAdmin = user?.role === 'admin';
  const membership = game && user ? game.members?.find((m) => m.username === user.username) : undefined;

  // Deadline scheduler: process due rounds while the game is open (and on open).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!game?.schedule?.deadline || game.phase !== 'OPEN') return;
    if (Date.parse(game.schedule.deadline) <= now) setGame(catchUp(game, now));
  }, [now, game, setGame]);

  const openGame = (input: GameState, target?: string) => {
    const g = catchUp(input);
    saveGame(g);
    setGameState(g);
    if (user?.role === 'admin') { setViewer({ role: 'gm' }); setPage(target ?? 'gm'); return; }
    const m = g.members?.find((x) => x.username === user?.username);
    if (m) setViewer({ role: 'team', companyId: m.companyId });
    setPage('overview');
  };

  const openById = (id: string) => {
    const g = loadGame(id);
    if (!g) return;
    setCls(listClasses().find((c) => c.id === g.classId) ?? null);
    openGame(g);
  };

  const signOut = () => { logout(); setGameState(null); setCls(null); setUser(null); };

  const ctx: GameCtx | null = useMemo(() => {
    if (!game || !user) return null;
    const company = viewer.role === 'team' ? game.companies.find((c) => c.id === viewer.companyId) ?? null : null;
    const decision = company ? game.decisions[company.id] ?? carryForward(undefined, company, game.scenario, game.round) : null;
    const owner = company ? game.members?.find((m) => m.companyId === company.id)?.username : undefined;
    const notMine = !!company && !isAdmin && owner !== user.username;
    const readOnly = !company || company.isBot || company.status === 'bankrupt' || game.phase !== 'OPEN' || !!decision?.submitted || notMine;
    return {
      game, setGame, viewer, company, decision, readOnly, user,
      go: (p: string) => { setPage(p); setMenuOpen(false); window.scrollTo(0, 0); },
      update: (fn: (d: Decision) => void) => {
        if (!company || readOnly) return;
        const next: Decision = JSON.parse(JSON.stringify(decision));
        fn(next);
        next.revision = (decision?.revision ?? 0) + 1;
        setGame({ ...game, decisions: { ...game.decisions, [company.id]: next } });
      },
    };
  }, [game, viewer, setGame, user, isAdmin]);

  if (!user) return <Login onLogin={setUser} />;
  if (!cls && !game) return <Classes user={user} onSelect={setCls} onOpenGame={openGame} onSignOut={signOut} notifications={<NotificationsButton username={user.username} onOpenGame={openById} />} />;
  if (!game || !ctx) return cls && <Home user={user} cls={cls!} onOpen={openGame} onBack={() => setCls(null)} onClassChange={setCls} onSignOut={signOut} notifications={<NotificationsButton username={user.username} onOpenGame={openById} />} />;

  if (!isAdmin && !membership) {
    return (
      <div className="hero">
        <div className="row" style={{ marginBottom: 24 }}><button className="btn sm" onClick={() => { setGameState(null); if (game.solo) setCls(null); }}>Back</button><h1 style={{ margin: 0 }}>{game.name}</h1></div>
        <Empty>You have not been added to this game.</Empty>
      </div>
    );
  }

  const switchViewer = (val: string) => {
    if (!isAdmin) return;
    if (val === 'gm') { setViewer({ role: 'gm' }); setPage('gm'); return; }
    setViewer({ role: 'team', companyId: val });
    if (page === 'gm' || page === 'players') setPage('overview');
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
    case 'assign': body = isAdmin ? <Assign /> : teamOnly(<Overview />); break;
    case 'report': body = <Report />; break;
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
            {!game.solo && <button onClick={() => setGameState(null)}>Back to games</button>}
            <button onClick={() => { setGameState(null); setCls(null); }}>{game.solo ? 'Back to home' : 'All classes'}</button>
            <button onClick={signOut}>Sign out ({user.username})</button>
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
              {game.schedule?.deadline && game.phase === 'OPEN' && <span className="deadline-chip" title={new Date(game.schedule.deadline).toLocaleString('en-GB')}>Deadline {timeLeft(game.schedule.deadline, now)}</span>}
            </div>
            <NotificationsButton username={user.username} onOpenGame={openById} />
            {isAdmin ? (
              <label className="row small">
                <span className="muted">Viewing as</span>
                <select id="viewer-select" value={viewer.role === 'gm' ? 'gm' : viewer.companyId} onChange={(e) => switchViewer(e.target.value)} style={{ width: 'auto' }}>
                  <option value="gm">Game Master</option>
                  {game.companies.map((c) => <option key={c.id} value={c.id}>{c.isBot ? 'Bot' : 'Team'} · {c.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="row small">
                <span>{ctx.company?.name}</span>
                {game.solo && <Badge>{`${game.botLevel ?? 'normal'} bots`}</Badge>}
              </div>
            )}
          </header>
          <main className="content">
            {body}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
