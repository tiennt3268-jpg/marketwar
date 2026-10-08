// Per-account notifications kept in browser storage (shared by every game on this browser).
export type NoteKind = 'round' | 'deadline' | 'assign' | 'submit' | 'event' | 'alert' | 'finish';
export interface Note { id: string; at: string; to: string; kind: NoteKind; title: string; body?: string; gameId?: string; gameName?: string; read: boolean }

const KEY = 'marketwars:notifications';
let memory: Note[] = [];
const listeners = new Set<() => void>();

function readAll(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Note[]) : memory;
  } catch { return memory; }
}
function writeAll(list: Note[]) {
  memory = list.slice(0, 500);
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* memory only */ }
  listeners.forEach((l) => l());
}

export function notify(to: (string | null | undefined)[], n: Omit<Note, 'id' | 'at' | 'to' | 'read'>) {
  const at = new Date().toISOString();
  const uniq = [...new Set(to.filter((x): x is string => !!x))];
  if (!uniq.length) return;
  const fresh = uniq.map((u, i) => ({ ...n, to: u, at, read: false, id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}` }));
  writeAll([...fresh, ...readAll()]);
}

export function notesFor(username: string): Note[] {
  return readAll().filter((n) => n.to === username);
}

export function markRead(username: string, id?: string) {
  writeAll(readAll().map((n) => (n.to === username && (!id || n.id === id) ? { ...n, read: true } : n)));
}

export function clearNotes(username: string) {
  writeAll(readAll().filter((n) => n.to !== username));
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}
