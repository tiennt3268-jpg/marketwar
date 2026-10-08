// Local persistence (browser storage) for hot-seat games. Storage may be unavailable (private mode),
// so every access is guarded and the game still runs in memory.
import type { GameState } from '../engine/types';

const INDEX_KEY = 'marketwars:index';
const GAME_KEY = (id: string) => `marketwars:game:${id}`;

export interface SavedGameMeta { id: string; name: string; round: number; phase: string; teams: number; savedAt: string }

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function listSaved(): SavedGameMeta[] {
  try { return JSON.parse(safeGet(INDEX_KEY) ?? '[]') as SavedGameMeta[]; } catch { return []; }
}

export function saveGame(game: GameState): boolean {
  // Keep only the last 4 journals in storage to stay within quota; full journals live in memory/export.
  const slim: GameState = { ...game, results: game.results.map((r, i) => (i < game.results.length - 4 ? { ...r, journal: [] } : r)) };
  const ok = safeSet(GAME_KEY(game.id), JSON.stringify(slim));
  const meta: SavedGameMeta = { id: game.id, name: game.name, round: game.round, phase: game.phase, teams: game.companies.length, savedAt: new Date().toISOString() };
  const idx = listSaved().filter((g) => g.id !== game.id);
  safeSet(INDEX_KEY, JSON.stringify([meta, ...idx].slice(0, 20)));
  return ok;
}

export function loadGame(id: string): GameState | null {
  const raw = safeGet(GAME_KEY(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as GameState; } catch { return null; }
}

export function deleteGame(id: string) {
  safeRemove(GAME_KEY(id));
  safeSet(INDEX_KEY, JSON.stringify(listSaved().filter((g) => g.id !== id)));
}

export function getPref(key: string, dflt: string): string {
  return safeGet(`marketwars:pref:${key}`) ?? dflt;
}
export function setPref(key: string, value: string) {
  safeSet(`marketwars:pref:${key}`, value);
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
