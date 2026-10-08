// Account ↔ company assignment: each human company is run by exactly one student account.
import type { GameState } from './types';

export function companyOwner(game: GameState, companyId: string): string | null {
  return game.members?.find((m) => m.companyId === companyId)?.username ?? null;
}

export function memberCompany(game: GameState, username: string): string | null {
  return game.members?.find((m) => m.username === username)?.companyId ?? null;
}

/** Assign an account to a company (moving it if it already runs another one). */
export function assignAccount(game: GameState, username: string, companyId: string, at = new Date().toISOString()): GameState {
  const co = game.companies.find((c) => c.id === companyId);
  if (!co || co.isBot) throw new Error('Choose a student company');
  const owner = companyOwner(game, companyId);
  if (owner && owner !== username) throw new Error(`${co.name} is already run by ${owner}`);
  const rest = (game.members ?? []).filter((m) => m.username !== username);
  return { ...game, members: [...rest, { username, companyId, addedAt: at }] };
}

export function unassignAccount(game: GameState, username: string): GameState {
  return { ...game, members: (game.members ?? []).filter((m) => m.username !== username) };
}
