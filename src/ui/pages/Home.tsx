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

export default function Home({ user, onOpen, onSignOut }: { user: string; onOpen: (g: GameState) => void; onSignOut: () => void }) {
  const [name, setName] = useState('Market Wars – International Business');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [practice, setPractice] = useState(2);
  const [scored, setScored] = useState(8);
  const [teams, setTeams] = useState<TeamRow[]>([
    { name: DEFAULT_NAMES[0], color: COLORS[0], isBot: false, pin: '' },
    { name: DEFAULT_NAMES[1], color: COLORS[1], isBot: true, botStrategy: 'price_leader', pin: '' },
    { name: DEFAULT_NAMES[2], color: COLORS[2], isBot: true, botStrategy: 'quality_differentiator', pin: '' },
    { name: DEFAULT_NAMES[3], color: COLORS[3], isBot: true, botStrategy: 'export_first', pin: '' },
  ]);
  const [saved, setSaved] = useState(() => listSaved(user));
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
    g.owner = user;
    onOpen(g);
  };

  const importFile = async (f: File) => {
    try {
      const g = JSON.parse(await f.text()) as GameState;
      if (!g.companies || !g.scenario) throw new Error('not a Market Wars save');
      onOpen({ ...g, owner: user });
    } catch (e) {
      setImportError(`Could not read file: ${(e as Error).message}`);
    }
  };

  return (
    <div className="hero">
      <div className="spread" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Market Wars</h1>
        <div className="row small">
          <span className="muted">Signed in as <b>{user}</b></span>
          <button className="btn sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="New game">
          <div className="stack">
            <label className="field"><span>Game name</span><input id="game-name" type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="form-grid">
              <NumField label="Seed" value={seed} step={1} onChange={(v) => setSeed(Math.floor(v))} />
              <NumField label="Practice rounds" value={practice} step={1} min={0} max={2} onChange={(v) => setPractice(Math.floor(v))} />
              <NumField label="Scored rounds" value={scored} step={1} min={3} max={12} onChange={(v) => setScored(Math.floor(v))} />
            </div>
            <h4 style={{ marginTop: 8 }}>Teams (2–8)</h4>
            {teams.map((t, i) => (
              <div key={i} className="team-row">
                <input type="color" className="color-swatch" value={t.color} onChange={(e) => setTeam(i, { color: e.target.value })} aria-label="Team color" />
                <input id={`team-name-${i}`} type="text" value={t.name} onChange={(e) => setTeam(i, { name: e.target.value })} aria-label="Team name" />
                <select id={`team-type-${i}`} value={t.isBot ? 'bot' : 'human'} onChange={(e) => setTeam(i, { isBot: e.target.value === 'bot', botStrategy: e.target.value === 'bot' ? t.botStrategy ?? 'export_first' : undefined })} aria-label="Team type">
                  <option value="human">Human</option>
                  <option value="bot">Bot</option>
                </select>
                {t.isBot ? (
                  <select id={`team-bot-${i}`} value={t.botStrategy} onChange={(e) => setTeam(i, { botStrategy: e.target.value as BotStrategy })} aria-label="Bot strategy">
                    {BOT_STRATEGIES.map((s) => <option key={s} value={s}>{BOT_PROFILES[s].label}</option>)}
                  </select>
                ) : <input id={`team-pin-${i}`} type="password" placeholder="PIN (optional)" value={t.pin} onChange={(e) => setTeam(i, { pin: e.target.value })} aria-label="PIN" />}
                <button className="btn sm ghost" disabled={teams.length <= 2} onClick={() => setTeams(teams.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <div className="row">
              <button className="btn sm" disabled={teams.length >= 8} onClick={() => setTeams([...teams, { name: DEFAULT_NAMES[teams.length] ?? `Team ${teams.length + 1}`, color: COLORS[teams.length % COLORS.length], isBot: true, botStrategy: BOT_STRATEGIES[teams.length % BOT_STRATEGIES.length], pin: '' }])}>Add team</button>
            </div>
            <button className="btn primary" onClick={start} disabled={teams.length < 2 || teams.some((t) => !t.name.trim())}>Start game</button>
          </div>
        </Card>

        <Card title="Saved games">
          {saved.length === 0 ? <p className="muted small">No saved games.</p> : (
            <div className="stack">
              {saved.map((s) => (
                <div key={s.id} className="spread">
                  <div>
                    <b>{s.name}</b>
                    <div className="small muted">{s.teams} teams · round {s.round} · {s.phase} · {new Date(s.savedAt).toLocaleString('en-GB')}</div>
                  </div>
                  <div className="row">
                    <button className="btn sm primary" onClick={() => { const g = loadGame(s.id); if (g) onOpen(g); }}>Open</button>
                    {confirmDel === s.id
                      ? <button className="btn sm danger" onClick={() => { deleteGame(s.id); setSaved(listSaved(user)); setConfirmDel(null); }}>Confirm delete</button>
                      : <button className="btn sm danger" onClick={() => setConfirmDel(s.id)}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <label className="btn sm">Import save (.json)<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
            {importError && <div className="bad small" style={{ marginTop: 6 }}>{importError}</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
