import { useState } from 'react';
import type { User } from '../auth';
import { deleteClass, deleteGame, listClasses, listSaved, listSolo, loadGame, saveClass, type ClassInfo } from '../store';
import { Badge, Card, Empty, NumField } from '../components';
import { createGame } from '../../engine/engine';
import { BOT_LEVELS, botLineup } from '../../engine/bots';
import { defaultScenario } from '../../engine/scenario';
import type { BotLevel, GameState } from '../../engine/types';

const BOT_NAMES = ['Hanoi Roasters', 'Mekong Coffee', 'Dalat Highlands', 'Hue Heritage', 'Da Nang Drip'];
const BOT_COLORS = ['#2a78d6', '#eb6834', '#4a3aa7', '#eda100', '#e87ba4'];

export default function Classes({ user, onSelect, onOpenGame, onSignOut, notifications }: { user: User; onSelect: (c: ClassInfo) => void; onOpenGame: (g: GameState) => void; onSignOut: () => void; notifications?: React.ReactNode }) {
  const isAdmin = user.role === 'admin';
  const [classes, setClasses] = useState(() => listClasses());
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [term, setTerm] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<BotLevel>('normal');
  const [bots, setBots] = useState(3);
  const [company, setCompany] = useState(user.profile.fullName ? `${user.profile.fullName.split(' ').slice(-1)[0]} Coffee Co.` : 'Saigon Brew');
  const [solo, setSolo] = useState(() => listSolo(user.username));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    saveClass({ id: `CL-${Date.now().toString(36)}`, name: name.trim(), code: code.trim().toUpperCase(), term: term.trim(), createdBy: user.username, createdAt: new Date().toISOString() });
    setClasses(listClasses());
    setName(''); setCode(''); setTerm('');
  };

  const startSolo = () => {
    const seed = Math.floor(Math.random() * 1_000_000);
    const g = createGame({
      name: `${company.trim() || 'My company'} vs ${BOT_LEVELS[level].label} bots`, seed, id: `S-${seed}-${Date.now().toString(36)}`, scenario: defaultScenario(),
      teams: [{ name: company.trim() || 'My company', color: '#1f8f4e', isBot: false }, ...botLineup(level, bots).map((b, i) => ({ name: BOT_NAMES[i], color: BOT_COLORS[i], isBot: true, botStrategy: b }))],
    });
    g.botLevel = level;
    g.solo = true;
    g.owner = user.username;
    g.members = [{ username: user.username, companyId: g.companies[0].id, addedAt: new Date().toISOString() }];
    onOpenGame(g);
  };

  // Players only see classes in which they run a company.
  const visible = isAdmin ? classes : classes.filter((c) => c.students?.includes(user.username) || listSaved(c.id).some((g) => g.members?.includes(user.username)));
  const shown = visible.filter((c) => `${c.name} ${c.code} ${c.term}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="hero">
      <div className="spread" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Market Wars</h1>
        <div className="row small">
          <span className="muted">Signed in as <b>{user.profile.fullName || user.username}</b></span>
          <Badge tone={isAdmin ? 'accent' : 'info'}>{isAdmin ? 'Game Master' : 'Student'}</Badge>
          {notifications}
          <button className="btn sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <div className="grid g-side" style={{ alignItems: 'start' }}>
        <Card title={isAdmin ? 'Classes' : 'My classes'} actions={<input id="class-search" type="text" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 180 }} />}>
          {shown.length === 0 ? <Empty>{isAdmin ? 'No classes yet.' : 'You have not been added to a class yet.'}</Empty> : (
            <div className="class-list">
              {shown.map((c) => {
                const games = listSaved(c.id).filter((g) => isAdmin || g.members?.includes(user.username));
                const active = games.filter((g) => g.phase !== 'FINISHED').length;
                return (
                  <div key={c.id} className="class-item">
                    <button className="class-open" onClick={() => onSelect(c)}>
                      <span className="class-code">{c.code || '—'}</span>
                      <span className="class-name">{c.name}</span>
                      <span className="small muted">{c.term ? `${c.term} · ` : ''}{isAdmin ? `${(c.students ?? []).length} students · ` : ''}{games.length} game{games.length === 1 ? '' : 's'}{active ? ` · ${active} active` : ''}</span>
                    </button>
                    {isAdmin && (confirmDel === c.id
                      ? <button className="btn sm danger" onClick={() => { deleteClass(c.id); setClasses(listClasses()); setConfirmDel(null); }}>Confirm delete</button>
                      : <button className="btn sm ghost" onClick={() => setConfirmDel(c.id)}>Delete</button>)}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {isAdmin ? (
          <Card title="New class">
            <form className="stack" onSubmit={create}>
              <label className="field"><span>Class name</span><input id="class-name" type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>Class code</span><input id="class-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} /></label>
              <label className="field"><span>Term</span><input id="class-term" type="text" placeholder="Fall 2026" value={term} onChange={(e) => setTerm(e.target.value)} /></label>
              <button className="btn primary" type="submit" disabled={!name.trim()}>Create class</button>
            </form>
          </Card>
        ) : (
          <Card title="Play vs bots">
            <div className="stack">
              <label className="field"><span>Company name</span><input id="solo-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
              <div className="level-picker" role="radiogroup" aria-label="Difficulty">
                {(Object.keys(BOT_LEVELS) as BotLevel[]).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={level === l} className={`level level-${l} ${level === l ? 'selected' : ''}`} onClick={() => setLevel(l)}>{BOT_LEVELS[l].label}</button>
                ))}
              </div>
              <NumField label="Bots" value={bots} step={1} min={2} max={5} onChange={(v) => setBots(Math.round(v))} />
              <button className="btn primary" onClick={startSolo}>Start</button>
            </div>
            {solo.length > 0 && (
              <div className="stack" style={{ marginTop: 16 }}>
                <h4>My bot games</h4>
                {solo.map((s) => (
                  <div key={s.id} className="game-item">
                    <div><b>{s.name}</b><div className="small muted">Round {s.round} · {new Date(s.savedAt).toLocaleDateString('en-GB')}</div></div>
                    <div className="row">
                      <Badge tone={s.phase === 'FINISHED' ? 'warn' : 'good'}>{s.phase}</Badge>
                      <button className="btn sm primary" onClick={() => { const g = loadGame(s.id); if (g) onOpenGame(g); }}>Open</button>
                      <button className="btn sm ghost" onClick={() => { deleteGame(s.id); setSolo(listSolo(user.username)); }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
