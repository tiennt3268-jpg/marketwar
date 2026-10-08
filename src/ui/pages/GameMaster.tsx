import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, Check, COUNTRY_NAME, NumField, SelectField, Tabs } from '../components';
import { processRound, refreshEnvironment, isScored, totalRounds } from '../../engine/engine';
import { VARIABLE_REGISTRY, validateEventTemplate } from '../../engine/events';
import { COUNTRIES, type CountryCode, type EventEffect, type EventTemplate, type GameState } from '../../engine/types';
import { deepClone, fmtK, fmtNum } from '../../engine/util';
import { downloadText } from '../store';
import { runRound, setDeadline, timeLeft } from '../rounds';

type Tab = 'rounds' | 'scenario' | 'events' | 'grading';

export default function GameMaster() {
  const { game, setGame, user } = useGame();
  const [tab, setTab] = useState<Tab>('rounds');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastInput, setLastInput] = useState<GameState | null>(null);
  const [replay, setReplay] = useState<{ ok: boolean; text: string } | null>(null);

  const audit = (g: GameState, event: string, detail: string) => ({ ...g, audit: [...g.audit, { at: new Date().toISOString(), round: g.round, actor: 'GM', event, detail }] });

  const run = () => {
    setBusy(true);
    setError('');
    setTimeout(() => {
      try {
        const input = deepClone(game);
        const next = runRound(input, user.username, 'manual');
        setLastInput({ ...input, audit: next.audit.slice(0, input.audit.length + 1) });
        setReplay(null);
        setGame(next);
      } catch (e) {
        setError(`Processing failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  const verifyReplay = () => {
    if (!lastInput) return;
    const again = processRound(lastInput).result;
    const orig = game.results.find((r) => r.round === again.round);
    const ok = !!orig && orig.outputHash === again.outputHash && orig.inputHash === again.inputHash;
    setReplay({ ok, text: ok ? `Replay matches · ${again.outputHash}` : `Mismatch · ${orig?.outputHash} vs ${again.outputHash}` });
  };

  const pending = game.companies.filter((c) => !c.isBot && c.status === 'active' && !game.decisions[c.id]?.submitted);
  const last = game.results[game.results.length - 1];

  return (
    <div>
      <div className="section-title"><h1>Game Master</h1>
        <button className="btn sm" onClick={() => downloadText(`${game.name.replace(/\W+/g, '_')}-R${game.round}.json`, JSON.stringify(game))}>Export save</button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'rounds', label: 'Rounds' }, { value: 'scenario', label: 'Country parameters' }, { value: 'events', label: 'Events' }, { value: 'grading', label: 'Grading' }]} />

      {tab === 'rounds' && (
        <div className="stack">
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title={game.phase === 'FINISHED' ? 'Game finished' : `Round ${game.round} / ${totalRounds(game)} · ${isScored(game, game.round) ? 'Scored' : 'Practice'}`}>
            <div className="table-wrap"><table>
              <thead><tr><th>Team</th><th>Type</th><th>Status</th><th className="num">Revision</th></tr></thead>
              <tbody>{game.companies.map((c) => {
                const d = game.decisions[c.id];
                return (
                  <tr key={c.id}>
                    <td><span className="inline"><i className="dot" style={{ background: c.color }} />{c.name}</span></td>
                    <td>{c.isBot ? 'Bot' : 'Student'}</td>
                    <td>{c.status === 'bankrupt' ? <Badge tone="bad">Bankrupt</Badge> : c.isBot ? <Badge tone="info">Auto</Badge> : d?.submitted ? <Badge tone="good">Submitted</Badge> : <Badge tone="warn">Pending</Badge>}</td>
                    <td className="num">{d?.revision ?? 0}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            {game.phase !== 'FINISHED' && (
              <div className="stack" style={{ marginTop: 12 }}>
                {pending.length > 0 && <div className="alert warn small">{pending.length} team{pending.length > 1 ? 's' : ''} pending</div>}
                <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Processing…' : `Lock & process round ${game.round}`}</button>
                {error && <div className="alert bad small">{error}</div>}
              </div>
            )}
          </Card>
          <Card title="Last run">
            {!last ? <p className="muted small">No rounds processed.</p> : (
              <div className="stack small">
                <div>Round <b>{last.round}</b> · engine v{last.engineVersion} · seed {last.seed}</div>
                <div className="mono">Input {last.inputHash}<br />Output {last.outputHash}</div>
                <div>Events: {last.events.length ? last.events.map((e) => `${e.name}${e.country ? ` (${e.country})` : ''}`).join(', ') : 'none'}</div>
                <div>Journal entries: {fmtNum(last.journal.length)} · balanced</div>
                <div>Sales: {COUNTRIES.map((c) => `${c} ${fmtNum(last.countryResults.filter((r) => r.country === c).reduce((a, r) => a + r.salesBoxes, 0))}`).join(' · ')}</div>
                {lastInput && <div className="row"><button className="btn sm" onClick={verifyReplay}>Verify replay</button></div>}
                {replay && <div className={`alert small ${replay.ok ? 'good' : 'bad'}`}>{replay.text}</div>}
              </div>
            )}
          </Card>
        </div>
        <Schedule />
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
  const setGlobal = (patch: (g: GameState) => void, msg: string) => { const g = deepClone(game); patch(g); g.scenario.version++; setGame(g, msg); };
  return (
    <div className="stack">
      <Tabs value={c} onChange={setC} items={COUNTRIES.map((x) => ({ value: x, label: COUNTRY_NAME[x] }))} />
      <Card title={`${COUNTRY_NAME[c]} · scenario v${game.scenario.version}`}>
        <div className="form-grid">
          {editable.map((r) => (
            <NumField key={r.key} label={r.title} value={Number(current(r.key).toFixed(4))} step={r.max <= 1 ? 0.01 : r.max <= 5 ? 0.05 : 1} min={r.min} max={r.max}
              hint={r.unit} onChange={(v) => setVar(r.key, v)} />
          ))}
        </div>
      </Card>
      <Card title="Global & scoring">
        <div className="form-grid">
          <NumField label="Coffee price index" value={game.scenario.global.coffeePriceIndex} step={5} min={10} max={500} onChange={(v) => setGlobal((g) => { g.scenario.global.coffeePriceIndex = v; }, `coffeePriceIndex = ${v}`)} />
          <NumField label="USD interest rate" value={game.scenario.global.usdInterestRate} step={0.005} min={0} max={0.6} onChange={(v) => setGlobal((g) => { g.scenario.global.usdInterestRate = v; }, `usdInterestRate = ${v}`)} />
          <NumField label="VND interest rate" value={game.scenario.global.vndInterestRate} step={0.005} min={0} max={0.6} onChange={(v) => setGlobal((g) => { g.scenario.global.vndInterestRate = v; }, `vndInterestRate = ${v}`)} />
          {(Object.keys(game.scenario.scoring) as (keyof GameState['scenario']['scoring'])[]).map((k) => (
            <NumField key={k} label={`Weight · ${k}`} value={game.scenario.scoring[k]} step={0.05} min={0} max={1} onChange={(v) => setGlobal((g) => { g.scenario.scoring[k] = v; }, `scoring.${k} = ${v}`)} />
          ))}
        </div>
        {Math.abs(Object.values(game.scenario.scoring).reduce((a, b) => a + b, 0) - 1) > 0.001 && <div className="alert warn small" style={{ marginTop: 8 }}>Weights do not sum to 1</div>}
      </Card>
    </div>
  );
}

function EventsEditor({ setGame }: { setGame: (g: GameState, msg: string) => void }) {
  const { game } = useGame();
  const [draft, setDraft] = useState<EventTemplate>({
    id: `custom-${Date.now().toString(36)}`, name: 'Custom event', description: '', scope: 'country', country: 'US', trigger: 'fixed', round: game.round,
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
      <Card title="Event templates">
        <div className="table-wrap"><table>
          <thead><tr><th>On</th><th>Event</th><th>Scope</th><th>Trigger</th><th className="num">Round</th><th className="num">Prob.</th><th className="num">Severity</th><th className="num">Duration</th><th>Effects</th></tr></thead>
          <tbody>{game.scenario.events.map((e) => (
            <tr key={e.id}>
              <td><input type="checkbox" checked={e.enabled} onChange={(x) => patchEvent(e.id, { enabled: x.target.checked })} aria-label="Enabled" /></td>
              <td style={{ whiteSpace: 'normal', minWidth: 180 }}><b>{e.name}</b></td>
              <td>{e.scope === 'global' ? 'Global' : e.country}</td>
              <td><select value={e.trigger} onChange={(x) => patchEvent(e.id, { trigger: x.target.value as EventTemplate['trigger'] })}><option value="fixed">Fixed</option><option value="probabilistic">Probabilistic</option></select></td>
              <td className="num"><input type="number" style={{ width: 60 }} value={e.round} min={1} onChange={(x) => patchEvent(e.id, { round: Math.max(1, Math.floor(+x.target.value)) })} /></td>
              <td className="num"><input type="number" style={{ width: 70 }} step={0.01} min={0} max={1} value={e.probability} onChange={(x) => patchEvent(e.id, { probability: Math.min(1, Math.max(0, +x.target.value)) })} /></td>
              <td className="num"><input type="number" style={{ width: 60 }} min={0} max={100} value={e.severity} onChange={(x) => patchEvent(e.id, { severity: Math.min(100, Math.max(0, +x.target.value)) })} /></td>
              <td className="num"><input type="number" style={{ width: 55 }} min={1} value={e.durationRounds} onChange={(x) => patchEvent(e.id, { durationRounds: Math.max(1, Math.floor(+x.target.value)) })} /></td>
              <td className="small">{e.effects.map((f) => `${f.variable} ${f.op} ${f.value}`).join('; ')}{e.destroysExposure ? ' · asset loss' : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Card title="New event">
        <div className="form-grid">
          <label className="field"><span>Name</span><input id="ev-name" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="field"><span>Description</span><input id="ev-desc" type="text" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <SelectField label="Scope" value={draft.scope === 'global' ? 'global' : draft.country!} onChange={(v) => setDraft(v === 'global' ? { ...draft, scope: 'global', country: undefined, effects: [{ variable: 'coffeePriceIndex', op: 'MULTIPLY', value: 1.2 }] } : { ...draft, scope: 'country', country: v as CountryCode })}
            options={[{ value: 'global', label: 'Global' }, ...COUNTRIES.map((c) => ({ value: c, label: COUNTRY_NAME[c] }))]} />
          <SelectField label="Trigger" value={draft.trigger} onChange={(v) => setDraft({ ...draft, trigger: v as EventTemplate['trigger'] })} options={[{ value: 'fixed', label: 'Fixed round' }, { value: 'probabilistic', label: 'Probabilistic' }]} />
          <NumField label="Round" value={draft.round} step={1} min={game.round} onChange={(v) => setDraft({ ...draft, round: Math.floor(v) })} />
          <NumField label="Probability" value={draft.probability} step={0.05} min={0} max={1} onChange={(v) => setDraft({ ...draft, probability: v })} />
          <NumField label="Duration (rounds)" value={draft.durationRounds} step={1} min={1} onChange={(v) => setDraft({ ...draft, durationRounds: Math.floor(v) })} />
          <NumField label="Severity (0–100)" value={draft.severity} step={5} min={0} max={100} onChange={(v) => setDraft({ ...draft, severity: v, destroysExposure: v > 0 })} />
        </div>
        <h4 style={{ marginTop: 12 }}>Effects</h4>
        {draft.effects.map((f, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <select value={f.variable} style={{ width: 'auto' }} onChange={(e) => setDraft({ ...draft, effects: draft.effects.map((x, j) => (j === i ? { ...x, variable: e.target.value } : x)) })}>
              {regKeys.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
            </select>
            <select value={f.op} style={{ width: 'auto' }} onChange={(e) => setDraft({ ...draft, effects: draft.effects.map((x, j) => (j === i ? { ...x, op: e.target.value as EventEffect['op'] } : x)) })}>
              {['SET', 'ADD', 'MULTIPLY', 'CAP', 'FLOOR'].map((o) => <option key={o}>{o}</option>)}
            </select>
            <input type="number" style={{ width: 110 }} step={0.01} value={f.value} onChange={(e) => setDraft({ ...draft, effects: draft.effects.map((x, j) => (j === i ? { ...x, value: +e.target.value } : x)) })} />
            <button className="btn sm ghost" onClick={() => setDraft({ ...draft, effects: draft.effects.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <div className="row">
          <button className="btn sm" onClick={() => setDraft({ ...draft, effects: [...draft.effects, { variable: regKeys[0].key, op: 'ADD', value: 0 }] })}>Add effect</button>
          <button className="btn sm primary" disabled={errs.length > 0 || draft.round < game.round} onClick={() => {
            const g = deepClone(game);
            g.scenario.events.push({ ...draft, id: `custom-${Date.now().toString(36)}` });
            g.scenario.version++;
            setGame(g, `event added: ${draft.name}`);
          }}>Save event</button>
        </div>
        {errs.length > 0 && <div className="alert bad small" style={{ marginTop: 8 }}><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      </Card>
    </div>
  );
}

function Grading() {
  const { game, setGame } = useGame();
  const setNote = (id: string, key: string, v: string) => setGame({ ...game, companies: game.companies.map((c) => (c.id === id ? { ...c, notes: { ...c.notes, [key]: v } } : c)) });
  return (
    <div className="stack">
      {game.companies.map((c) => {
        const notes = Object.entries(c.notes).filter(([k, v]) => !k.startsWith('gm:') && v.trim());
        return (
          <Card key={c.id} title={<span className="inline"><i className="dot" style={{ background: c.color }} />{c.name} <Badge>{notes.length} notes</Badge> <span className="small muted">Cum. net income {fmtK(c.cumulativeNetIncome)}</span></span>}>
            {notes.length > 0 && (
              <details><summary className="small">Analysis</summary>
                <div className="stack small" style={{ marginTop: 8 }}>{notes.map(([k, v]) => <div key={k}><b>{k}</b>: {v}</div>)}</div>
              </details>
            )}
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label className="field"><span>Grade (0–10)</span><input id={`grade-${c.id}`} type="number" min={0} max={10} step={0.5} value={c.notes['gm:grade'] ?? ''} onChange={(e) => setNote(c.id, 'gm:grade', e.target.value)} /></label>
              <label className="field" style={{ gridColumn: 'span 2' }}><span>Feedback</span><input id={`feedback-${c.id}`} type="text" value={c.notes['gm:feedback'] ?? ''} onChange={(e) => setNote(c.id, 'gm:feedback', e.target.value)} /></label>
            </div>
            <Check label="Graded" checked={!!c.notes['gm:done']} onChange={(v) => setNote(c.id, 'gm:done', v ? '1' : '')} />
          </Card>
        );
      })}
    </div>
  );
}


const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Schedule() {
  const { game, setGame, user } = useGame();
  const sch = game.schedule;
  const [when, setWhen] = useState(() => toLocalInput(sch?.deadline ?? new Date(Date.now() + 24 * 3600_000).toISOString()));
  const [amount, setAmount] = useState(() => (sch?.durationMin ? (sch.durationMin % 1440 === 0 ? sch.durationMin / 1440 : sch.durationMin % 60 === 0 ? sch.durationMin / 60 : sch.durationMin) : 1));
  const [unit, setUnit] = useState<'min' | 'hour' | 'day'>(() => (sch?.durationMin ? (sch.durationMin % 1440 === 0 ? 'day' : sch.durationMin % 60 === 0 ? 'hour' : 'min') : 'day'));
  const [auto, setAuto] = useState(sch?.autoAdvance ?? true);
  const [error, setError] = useState('');
  const minutes = Math.max(1, Math.round(amount * { min: 1, hour: 60, day: 1440 }[unit]));
  if (game.phase === 'FINISHED') return null;

  const save = () => {
    const t = new Date(when).getTime();
    if (!Number.isFinite(t)) { setError('Enter a valid date and time'); return; }
    if (t <= Date.now()) { setError('Deadline must be in the future'); return; }
    setError('');
    setGame(setDeadline(game, new Date(t).toISOString(), minutes, auto, user.username));
  };

  return (
    <Card title="Round deadline" actions={sch?.deadline ? <Badge tone="warn">Closes in {timeLeft(sch.deadline)}</Badge> : <Badge>Manual</Badge>}>
      <div className="form-grid">
        <label className="field"><span>Round {game.round} closes at</span><input id="deadline-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <NumField label="Next rounds last" value={amount} step={1} min={1} onChange={setAmount} />
        <SelectField label="Unit" value={unit} onChange={setUnit} options={[{ value: 'min', label: 'Minutes' }, { value: 'hour', label: 'Hours' }, { value: 'day', label: 'Days' }]} />
      </div>
      <div style={{ marginTop: 10 }}><Check label="Open the next round automatically with a new deadline" checked={auto} onChange={setAuto} /></div>
      {error && <div className="alert bad small" style={{ marginTop: 8 }}>{error}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary sm" onClick={save}>{sch?.deadline ? 'Update deadline' : 'Set deadline'}</button>
        {sch?.deadline && <button className="btn sm" onClick={() => setGame(setDeadline(game, null, minutes, auto, user.username))}>Clear deadline</button>}
      </div>
      {sch?.deadline && <div className="small muted" style={{ marginTop: 8 }}>{new Date(sch.deadline).toLocaleString('en-GB')}{sch.autoAdvance ? ` · then every ${sch.durationMin >= 1440 ? `${sch.durationMin / 1440} day(s)` : sch.durationMin >= 60 ? `${sch.durationMin / 60} hour(s)` : `${sch.durationMin} min`}` : ''}</div>}
    </Card>
  );
}
