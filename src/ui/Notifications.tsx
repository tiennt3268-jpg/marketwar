import { useEffect, useState } from 'react';
import { markRead, notesFor, subscribe, clearNotes, type Note } from './notifications';

const KIND_LABEL: Record<Note['kind'], string> = { round: 'Results', deadline: 'Deadline', assign: 'Assignment', submit: 'Submission', event: 'Event', alert: 'Alert', finish: 'Finished' };

export function useNotes(username: string) {
  const [notes, setNotes] = useState<Note[]>(() => notesFor(username));
  useEffect(() => {
    const refresh = () => setNotes(notesFor(username));
    refresh();
    const off = subscribe(refresh);
    const t = setInterval(refresh, 10_000);
    return () => { off(); clearInterval(t); };
  }, [username]);
  return notes;
}

export default function NotificationsButton({ username, onOpenGame }: { username: string; onOpenGame?: (gameId: string) => void }) {
  const notes = useNotes(username);
  const [open, setOpen] = useState(false);
  const unread = notes.filter((n) => !n.read).length;
  return (
    <div className="notif">
      <button className={`btn sm notif-btn ${unread ? 'has-unread' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-expanded={open}>
        Notifications{unread ? <span className="notif-count">{unread}</span> : null}
      </button>
      {open && (
        <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
          <div className="notif-head">
            <b>Notifications</b>
            <div className="row">
              <button className="btn sm ghost" disabled={!unread} onClick={() => markRead(username)}>Mark all read</button>
              <button className="btn sm ghost" disabled={!notes.length} onClick={() => clearNotes(username)}>Clear</button>
              <button className="btn sm ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
          {notes.length === 0 ? <p className="muted small" style={{ padding: 14 }}>No notifications.</p> : (
            <ul className="notif-list">
              {notes.slice(0, 60).map((n) => (
                <li key={n.id} className={`notif-item kind-${n.kind} ${n.read ? '' : 'unread'}`} onClick={() => { markRead(username, n.id); if (n.gameId && onOpenGame) { onOpenGame(n.gameId); setOpen(false); } }}>
                  <div className="spread"><span className="notif-kind">{KIND_LABEL[n.kind]}</span><span className="small muted">{new Date(n.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="small">{n.body}</div>}
                  {n.gameName && <div className="small muted">{n.gameName}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
