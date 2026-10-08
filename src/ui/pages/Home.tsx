import { useEffect, useState } from 'react';
import { catchUpSaved, timeLeft } from '../rounds';
import { createGame, type TeamConfig } from '../../engine/engine';
import { BOT_LEVELS, BOT_PROFILES, BOT_STRATEGIES } from '../../engine/bots';
import { defaultScenario } from '../../engine/scenario';
import type { BotLevel, BotStrategy, GameState } from '../../engine/types';
import type { User } from '../auth';
import { deleteGame, listSaved, loadGame, type ClassInfo } from '../store';
import { Badge, Card, Empty, NumField, SelectField } from '../components';
import ClassStudents from './ClassStudents';

const COLORS = ['#1f8f4e', '#2a78d6', '#eb6834', '#4a3aa7', '#eda100', '#e87ba4', '#1baf7a', '#8a5a00'];
const DEFAULT_NAMES = ['Saigon Brew', 'Hanoi Roasters', 'Mekong Coffee', 'Dalat Highlands', 'Hue Heritage', 'Da Nang Drip', 'Can Tho Cafe', 'Ha Long Beans'];

type TeamRow = TeamConfig;

export default function Home({ user, cls: clsProp, onOpen, onBack, onSignOut, onClassChange, notifications }: { user: User; cls: ClassInfo; onOpen: (g: GameState, page?: string) => void; onBack: () => void; onSignOut: () => void; onClassChange?: (c: ClassInfo) => void; notifications?: React.ReactNode }) {
  const isAdmin = user.role === 'admin';
  const [cls, setKlass] = useState(clsProp);
  const [tab, setTab] = useState<'students' | 'games'>(() => ((clsProp.students ?? []).length ? 'games' : 'students'));
  const roster = cls.students ?? [];
  const [name, setName] = useState(`${cls.name} – Game 1`);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [practice, setPractice] = useState(2);
  const [scored, setScored] = useState(8);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [teams, setTeams] = useState<TeamRow[]>([
    { name: DEFAULT_NAMES[0], color: COLORS[0], isBot: false},
    { name: DEFAULT_NAMES[1], color: COLORS[1], isBot: true, botStrategy: 'price_leader'},
    { name: DEFAULT_NAMES[2], color: COLORS[2], isBot: true, botStrategy: 'quality_differentiator'},
    { name: DEFAULT_NAMES[3], color: COLORS[3], isBot: true, botStrategy: 'export_first'},
  ]);
  const visible = () => listSaved(cls.id).filter((g) => isAdmin || g.members?.includes(user.username));
  const [saved, setSaved] = useState(visible);
  useEffect(() => { if (catchUpSaved(listSaved(cls.id))) setSaved(visible()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [importError, setImportError] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const setTeam = (i: number, patch: Partial<TeamRow>) => setTeams(teams.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const start = () => {
    const sc = defaultScenario();
    sc.practiceRounds = practice;
    sc.scoredRounds = scored;
    const g = createGame({ name, seed, teams, scenario: sc, id: `G-${seed}-${Date.now().toString(36)}` });
    g.members = [];
    g.botLevel = level;
    g.owner = user.username;
    g.classId = cls.id;
    onOpen(g);
  };

  const importFile = async (f: File) => {
    try {
      const g = JSON.parse(await f.text()) as GameState;
      if (!g.companies || !g.scenario) throw new Error('not a Market Wars save');
      onOpen({ ...g, owner: user.username, classId: cls.id });
    } catch (e) {
      setImportError(`Could not read file: ${(e as Error).message}`);
    }
  };

  const gamesCard = (
    <Card title="Games">
      {saved.length === 0 ? <Empty>{isAdmin ? 'No games in this class.' : 'You have not been added to a game in this class.'}</Empty> : (
        <div className="stack">
          {saved.map((s) => (
            <div key={s.id} className="game-item">
              <div>
                <b>{s.name}</b>
                <div className="small muted">{s.teams} companies · round {s.round} · {new Date(s.savedAt).toLocaleString('en-GB')}{s.deadline ? ` · deadline in ${timeLeft(s.deadline)}` : ''}</div>
              </div>
              <div className="row">
                <Badge tone={s.phase === 'FINISHED' ? 'warn' : 'good'}>{s.phase}</Badge>
                <button className="btn sm primary" onClick={() => { const g = loadGame(s.id); if (g) onOpen(g); }}>Open</button>
                {isAdmin && <button className="btn sm" onClick={() => { const g = loadGame(s.id); if (g) onOpen(g, 'assign'); }}>Assign students</button>}
                {isAdmin && (confirmDel === s.id
                  ? <button className="btn sm danger" onClick={() => { deleteGame(s.id); setSaved(visible()); setConfirmDel(null); }}>Confirm delete</button>
                  : <button className="btn sm ghost" onClick={() => setConfirmDel(s.id)}>Delete</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <div style={{ marginTop: 12 }}>
          <label className="btn sm">Import save (.json)<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
          {importError && <div className="bad small" style={{ marginTop: 6 }}>{importError}</div>}
        </div>
      )}
    </Card>
  );

  return (
    <div className="hero">
      <div className="spread" style={{ marginBottom: 24 }}>
        <div className="row">
          <button className="btn sm" onClick={onBack}>All classes</button>
          <h1 style={{ margin: 0 }}>{cls.name}</h1>
          {cls.code && <Badge tone="accent">{cls.code}</Badge>}
          {cls.term && <span className="muted small">{cls.term}</span>}
        </div>
        <div className="row small">
          <span className="muted">Signed in as <b>{user.username}</b></span>
          {notifications}
          <button className="btn sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {!isAdmin ? (
        <div className="stack">
          {!roster.includes(user.username) && <div className="alert warn small">You are not on this class roster.</div>}
          {roster.includes(user.username) && saved.length === 0 && <div className="alert info small">You are in this class. The Game Master has not assigned you to a company yet.</div>}
          {gamesCard}
        </div>
      ) : (
        <>
        <div className="steps">
          <button className={`step ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}><b>1</b> Add students to class <span className="muted">({roster.length})</span></button>
          <button className={`step ${tab === 'games' ? 'active' : ''}`} onClick={() => setTab('games')}><b>2</b> Create game</button>
          <button className="step" disabled={!saved.length} onClick={() => { const first = saved[0]; const g = first && loadGame(first.id); if (g) onOpen(g, 'assign'); }}><b>3</b> Assign students to companies</button>
        </div>
        {tab === 'students' ? <ClassStudents cls={cls} onChange={(c) => { setKlass(c); onClassChange?.(c); }} /> : (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title="New game">
            <div className="stack">
              <label className="field"><span>Game name</span><input id="game-name" type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <div className="form-grid">
                <NumField label="Seed" value={seed} step={1} onChange={(v) => setSeed(Math.floor(v))} />
                <NumField label="Practice rounds" value={practice} step={1} min={0} max={2} onChange={(v) => setPractice(Math.floor(v))} />
                <NumField label="Scored rounds" value={scored} step={1} min={3} max={12} onChange={(v) => setScored(Math.floor(v))} />
                <SelectField<BotLevel> label="Bot difficulty" value={level} onChange={setLevel} options={(Object.keys(BOT_LEVELS) as BotLevel[]).map((l) => ({ value: l, label: BOT_LEVELS[l].label }))} />
              </div>
              <h4 style={{ marginTop: 8 }}>Teams (2–8)</h4>
              {teams.map((t, i) => (
                <div key={i} className="team-row">
                  <input type="color" className="color-swatch" value={t.color} onChange={(e) => setTeam(i, { color: e.target.value })} aria-label="Team color" />
                  <input id={`team-name-${i}`} type="text" value={t.name} onChange={(e) => setTeam(i, { name: e.target.value })} aria-label="Team name" />
                  <select id={`team-type-${i}`} value={t.isBot ? 'bot' : 'human'} onChange={(e) => setTeam(i, { isBot: e.target.value === 'bot', botStrategy: e.target.value === 'bot' ? t.botStrategy ?? 'export_first' : undefined })} aria-label="Team type">
                    <option value="human">Student</option>
                    <option value="bot">Bot</option>
                  </select>
                  {t.isBot ? (
                    <select id={`team-bot-${i}`} value={t.botStrategy} onChange={(e) => setTeam(i, { botStrategy: e.target.value as BotStrategy })} aria-label="Bot strategy">
                      {BOT_STRATEGIES.map((s) => <option key={s} value={s}>{BOT_PROFILES[s].label}</option>)}
                    </select>
                  ) : <span className="small muted">Student account</span>}
                  <button className="btn sm ghost" disabled={teams.length <= 2} onClick={() => setTeams(teams.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <div className="row">
                <button className="btn sm" disabled={teams.length >= 8} onClick={() => setTeams([...teams, { name: DEFAULT_NAMES[teams.length] ?? `Team ${teams.length + 1}`, color: COLORS[teams.length % COLORS.length], isBot: true, botStrategy: BOT_STRATEGIES[teams.length % BOT_STRATEGIES.length]}])}>Add team</button>
              </div>
              <button className="btn primary" onClick={start} disabled={teams.length < 2 || teams.some((t) => !t.name.trim())}>Start game</button>
            </div>
          </Card>
          {gamesCard}
        </div>
        )}
        </>
      )}
    </div>
  );
}
