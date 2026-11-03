// Who may see and change what. The Game Master runs classes, games and rounds; a student only runs
// their own company. shortcut: enforced in the browser only, move to the server with a real backend.
import type { GameState } from '../engine/types';
import type { User } from './auth';

export const GM_PAGES = ['gm', 'assign'];

/** Pages a user may open for the current viewer (Game Master desk or a company). */
export function canOpenPage(user: User, page: string, viewingCompany: boolean): boolean {
  if (GM_PAGES.includes(page)) return user.role === 'admin';
  return viewingCompany || ['report', 'reports', 'leaderboard'].includes(page);
}

/** Only the student assigned to a company edits its decisions; the Game Master and other students only look. */
export function canEditCompany(user: User, game: GameState, companyId: string): boolean {
  const co = game.companies.find((c) => c.id === companyId);
  if (!co || co.isBot || co.status === 'bankrupt' || game.phase !== 'OPEN') return false;
  return game.members?.some((m) => m.companyId === companyId && m.username === user.username) ?? false;
}
