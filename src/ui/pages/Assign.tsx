import { useState } from 'react';
import { useGame } from '../context';
import { Badge, Card, Empty } from '../components';
import { assignAccount, companyOwner, memberCompany, unassignAccount } from '../../engine/members';
import { findAccount, getAccount, listAccounts } from '../auth';
import { getClass } from '../store';
import { notify } from '../notifications';
import type { GameState } from '../../engine/types';

export default function Assign() {
  const { game, setGame, user } = useGame();
  const cls = getClass(game.classId);
  const roster = cls?.students ?? [];
  // Only students enrolled in the game's class can run one of its companies.
  const accounts = listAccounts().filter((a) => !cls || roster.includes(a.username));
  const humans = game.companies.filter((c) => !c.isBot);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const commit = (g: GameState, detail: string) => setGame({ ...g, audit: [...g.audit, { at: new Date().toISOString(), round: g.round, actor: user.username, event: 'ASSIGN', detail }] });

  const assign = (companyId: string) => {
    const acc = findAccount(accounts, inputs[companyId] ?? '');
    const co = game.companies.find((c) => c.id === companyId)!;
    if (!acc) { setError({ ...error, [companyId]: cls ? 'No student in this class matches exactly. Add the student to the class first.' : 'No student account matches exactly.' }); return; }
    try {
      const prev = companyOwner(game, companyId);
      let g = prev && prev !== acc.username ? unassignAccount(game, prev) : game;
      g = assignAccount(g, acc.username, companyId);
      commit(g, `${co.name} → ${acc.username}`);
      notify([acc.username], { gameId: game.id, gameName: game.name, kind: 'assign', title: `You now run ${co.name}`, body: `Assigned by the Game Master in ${game.name}` });
      if (prev && prev !== acc.username) notify([prev], { gameId: game.id, gameName: game.name, kind: 'assign', title: `You were removed from ${co.name}` });
      setInputs({ ...inputs, [companyId]: '' });
      setError({ ...error, [companyId]: '' });
    } catch (e) {
      setError({ ...error, [companyId]: (e as Error).message });
    }
  };

  const unassign = (companyId: string) => {
    const prev = companyOwner(game, companyId);
    if (!prev) return;
    commit(unassignAccount(game, prev), `${companyId} unassigned`);
    notify([prev], { gameId: game.id, gameName: game.name, kind: 'assign', title: `You were removed from ${game.companies.find((c) => c.id === companyId)?.name}` });
  };

  const q = query.trim().toLowerCase();
  const shown = accounts.filter((a) => !q || `${a.username} ${a.profile.fullName} ${a.profile.studentId} ${a.profile.email} ${a.profile.cohort}`.toLowerCase().includes(q));
  const assigned = humans.filter((c) => companyOwner(game, c.id)).length;

  return (
    <div>
      <div className="section-title"><h1>Assign Companies</h1><Badge tone={assigned === humans.length ? 'good' : 'warn'}>{assigned}/{humans.length} assigned</Badge></div>
      {cls && <div className="alert info small" style={{ marginBottom: 14 }}>Class {cls.code || cls.name}: {roster.length} student{roster.length === 1 ? '' : 's'} on the roster · {roster.filter((u) => !memberCompany(game, u)).length} not assigned</div>}
      <datalist id="student-accounts">
        {accounts.filter((a) => !memberCompany(game, a.username)).map((a) => <option key={a.username} value={`${a.username} · ${a.profile.fullName} · ${a.profile.studentId}`} />)}
      </datalist>

      {humans.length === 0 ? <Empty>This game has no student companies.</Empty> : (
        <div className="assign-grid">
          {humans.map((c) => {
            const owner = companyOwner(game, c.id);
            const acc = owner ? getAccount(owner) : null;
            const preview = findAccount(accounts, inputs[c.id] ?? '');
            return (
              <div key={c.id} className="assign-card" style={{ borderTopColor: c.color }}>
                <div className="spread"><b className="inline"><i className="dot" style={{ background: c.color }} />{c.name}</b>{owner ? <Badge tone="good">Assigned</Badge> : <Badge tone="warn">Open</Badge>}</div>
                {acc ? (
                  <dl className="profile">
                    <dt>Name</dt><dd>{acc.profile.fullName || '—'}</dd>
                    <dt>Username</dt><dd>{acc.username}</dd>
                    <dt>Student ID</dt><dd>{acc.profile.studentId || '—'}</dd>
                    <dt>Email</dt><dd>{acc.profile.email || '—'}</dd>
                    <dt>Class</dt><dd>{acc.profile.cohort || '—'}</dd>
                  </dl>
                ) : <p className="muted small">No account assigned.</p>}
                <label className="field"><span>Student account (username, student ID or email)</span>
                  <input id={`assign-input-${c.id}`} type="text" list="student-accounts" autoComplete="off" value={inputs[c.id] ?? ''} onChange={(e) => setInputs({ ...inputs, [c.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') assign(c.id); }} />
                </label>
                {preview && <div className="small match">Match: <b>{preview.profile.fullName || preview.username}</b> · {preview.profile.studentId} · {preview.profile.email}{memberCompany(game, preview.username) && memberCompany(game, preview.username) !== c.id ? ' · runs another company' : ''}</div>}
                {error[c.id] && <div className="alert bad small">{error[c.id]}</div>}
                <div className="row">
                  <button className="btn sm primary" disabled={!preview} onClick={() => assign(c.id)}>{owner ? 'Replace' : 'Assign'}</button>
                  {owner && <button className="btn sm ghost" onClick={() => unassign(c.id)}>Unassign</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card title={cls ? `Class roster (${accounts.length})` : `Registered students (${accounts.length})`} actions={<input id="student-search" type="text" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 200 }} />}>
        {shown.length === 0 ? <p className="muted small">{cls ? 'No students on the class roster. Add students from the class page.' : 'No student accounts.'}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Username</th><th>Student ID</th><th>Email</th><th>Class</th><th>Registered</th><th>Company</th></tr></thead>
            <tbody>{shown.map((a) => {
              const cid = memberCompany(game, a.username);
              const co = game.companies.find((c) => c.id === cid);
              return (
                <tr key={a.username}>
                  <td><b>{a.profile.fullName || '—'}</b></td>
                  <td>{a.username}</td>
                  <td>{a.profile.studentId || '—'}</td>
                  <td>{a.profile.email || '—'}</td>
                  <td>{a.profile.cohort || '—'}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString('en-GB')}</td>
                  <td>
                    <select id={`quick-${a.username}`} value={co?.id ?? ''} style={{ width: 'auto' }} onChange={(e) => {
                      const v = e.target.value;
                      try {
                        if (!v) { commit(unassignAccount(game, a.username), `${a.username} unassigned`); return; }
                        const prev = companyOwner(game, v);
                        let g = prev && prev !== a.username ? unassignAccount(game, prev) : game;
                        g = assignAccount(g, a.username, v);
                        commit(g, `${v} → ${a.username}`);
                        notify([a.username], { gameId: game.id, gameName: game.name, kind: 'assign', title: `You now run ${game.companies.find((c) => c.id === v)?.name}` });
                      } catch (err) { setError({ ...error, [v]: (err as Error).message }); }
                    }}>
                      <option value="">Not assigned</option>
                      {humans.map((c) => { const o = companyOwner(game, c.id); return <option key={c.id} value={c.id}>{c.name}{o && o !== a.username ? ` (replace ${o})` : ''}</option>; })}
                    </select>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
