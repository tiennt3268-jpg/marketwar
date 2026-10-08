import { useState } from 'react';
import type { User } from '../auth';
import { deleteClass, listClasses, listSaved, saveClass, type ClassInfo } from '../store';
import { Badge, Card, Empty } from '../components';

export default function Classes({ user, onSelect, onSignOut }: { user: User; onSelect: (c: ClassInfo) => void; onSignOut: () => void }) {
  const isAdmin = user.role === 'admin';
  const [classes, setClasses] = useState(() => listClasses());
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [term, setTerm] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const c: ClassInfo = {
      id: `CL-${Date.now().toString(36)}`, name: name.trim(), code: code.trim().toUpperCase(), term: term.trim(),
      createdBy: user.username, createdAt: new Date().toISOString(),
    };
    saveClass(c);
    setClasses(listClasses());
    setName(''); setCode(''); setTerm('');
  };

  const shown = classes.filter((c) => `${c.name} ${c.code} ${c.term}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="hero">
      <div className="spread" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Market Wars</h1>
        <div className="row small">
          <span className="muted">Signed in as <b>{user.username}</b></span>
          <Badge tone={isAdmin ? 'accent' : 'info'}>{isAdmin ? 'Game Master' : 'Player'}</Badge>
          <button className="btn sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <div className={isAdmin ? 'grid g-side' : ''} style={{ alignItems: 'start' }}>
        <Card title="Classes" actions={<input id="class-search" type="text" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 180 }} />}>
          {shown.length === 0 ? <Empty>{classes.length === 0 ? 'No classes yet.' : 'No matching classes.'}</Empty> : (
            <div className="class-list">
              {shown.map((c) => {
                const games = listSaved(c.id);
                const active = games.filter((g) => g.phase !== 'FINISHED').length;
                return (
                  <div key={c.id} className="class-item">
                    <button className="class-open" onClick={() => onSelect(c)}>
                      <span className="class-code">{c.code || '—'}</span>
                      <span className="class-name">{c.name}</span>
                      <span className="small muted">{c.term ? `${c.term} · ` : ''}{games.length} game{games.length === 1 ? '' : 's'}{active ? ` · ${active} active` : ''}</span>
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

        {isAdmin && (
          <Card title="New class">
            <form className="stack" onSubmit={create}>
              <label className="field"><span>Class name</span><input id="class-name" type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>Class code</span><input id="class-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} /></label>
              <label className="field"><span>Term</span><input id="class-term" type="text" placeholder="Fall 2026" value={term} onChange={(e) => setTerm(e.target.value)} /></label>
              <button className="btn primary" type="submit" disabled={!name.trim()}>Create class</button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
