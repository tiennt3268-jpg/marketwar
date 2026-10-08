import { useState } from 'react';
import { findAccount, listAccounts } from '../auth';
import { enrollStudent, listSaved, loadGame, unenrollStudent, type ClassInfo } from '../store';
import { notify } from '../notifications';
import { Badge, Card, Empty } from '../components';

/** Class roster: the Game Master enrols registered student accounts into the class. */
export default function ClassStudents({ cls, onChange }: { cls: ClassInfo; onChange: (c: ClassInfo) => void }) {
  const accounts = listAccounts();
  const roster = cls.students ?? [];
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const match = findAccount(accounts, text);
  const games = listSaved(cls.id).filter((g) => !g.solo);
  const companyOf = (u: string) => {
    for (const m of games) {
      if (!m.members?.includes(u)) continue;
      const g = loadGame(m.id);
      const cid = g?.members?.find((x) => x.username === u)?.companyId;
      const co = g?.companies.find((c) => c.id === cid);
      if (co) return { game: m.name, company: co.name, color: co.color };
    }
    return null;
  };

  const add = (username: string) => {
    setError('');
    try {
      const next = enrollStudent(cls.id, username);
      notify([username], { kind: 'assign', title: `You were added to ${cls.name}`, body: cls.code ? `Class ${cls.code}` : undefined });
      setText('');
      onChange(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = (username: string) => {
    const next = unenrollStudent(cls.id, username);
    notify([username], { kind: 'assign', title: `You were removed from ${cls.name}` });
    setConfirm(null);
    onChange(next);
  };

  const q = query.trim().toLowerCase();
  const notEnrolled = accounts.filter((a) => !roster.includes(a.username) && (!q || `${a.username} ${a.profile.fullName} ${a.profile.studentId} ${a.profile.email} ${a.profile.cohort}`.toLowerCase().includes(q)));

  return (
    <div className="stack">
      <Card title="Add student to class">
        <datalist id="class-candidates">
          {accounts.filter((a) => !roster.includes(a.username)).map((a) => <option key={a.username} value={`${a.username} · ${a.profile.fullName} · ${a.profile.studentId}`} />)}
        </datalist>
        <div className="enroll-row">
          <label className="field"><span>Student account (username, student ID or email)</span>
            <input id="enroll-input" type="text" list="class-candidates" autoComplete="off" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter' && match) add(match.username); }} />
          </label>
          <button className="btn primary" disabled={!match} onClick={() => match && add(match.username)}>Add to class</button>
        </div>
        {match && <div className="small match" style={{ marginTop: 8 }}>Match: <b>{match.profile.fullName || match.username}</b> · {match.username} · {match.profile.studentId} · {match.profile.email}{roster.includes(match.username) ? ' · already in class' : ''}</div>}
        {text.trim() && !match && <div className="small muted" style={{ marginTop: 8 }}>No registered student matches exactly.</div>}
        {error && <div className="alert bad small" style={{ marginTop: 8 }}>{error}</div>}
      </Card>

      <Card title={`Class roster (${roster.length})`}>
        {roster.length === 0 ? <Empty>No students in this class yet.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Username</th><th>Student ID</th><th>Email</th><th>Class</th><th>Company</th><th /></tr></thead>
            <tbody>{roster.map((u) => {
              const a = accounts.find((x) => x.username === u);
              const co = companyOf(u);
              return (
                <tr key={u}>
                  <td><b>{a?.profile.fullName || '—'}</b></td>
                  <td>{u}</td>
                  <td>{a?.profile.studentId || '—'}</td>
                  <td>{a?.profile.email || '—'}</td>
                  <td>{a?.profile.cohort || '—'}</td>
                  <td>{co ? <span className="inline"><i className="dot" style={{ background: co.color }} />{co.company} <span className="muted small">({co.game})</span></span> : <Badge tone="warn">Not assigned</Badge>}</td>
                  <td>{confirm === u
                    ? <button className="btn sm danger" onClick={() => remove(u)}>Confirm remove</button>
                    : <button className="btn sm ghost" onClick={() => setConfirm(u)}>Remove</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Registered students not in this class (${accounts.filter((a) => !roster.includes(a.username)).length})`} actions={<input id="enroll-search" type="text" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 200 }} />}>
        {notEnrolled.length === 0 ? <p className="muted small">No other registered students.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Username</th><th>Student ID</th><th>Email</th><th>Class</th><th /></tr></thead>
            <tbody>{notEnrolled.map((a) => (
              <tr key={a.username}>
                <td><b>{a.profile.fullName || '—'}</b></td>
                <td>{a.username}</td>
                <td>{a.profile.studentId || '—'}</td>
                <td>{a.profile.email || '—'}</td>
                <td>{a.profile.cohort || '—'}</td>
                <td><button className="btn sm primary" onClick={() => add(a.username)}>Add</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
