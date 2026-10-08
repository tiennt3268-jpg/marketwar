import { createContext, useContext } from 'react';
import type { CompanyState, Decision, GameState } from '../engine/types';
import type { User } from './auth';

export type Viewer = { role: 'team'; companyId: string } | { role: 'gm' };

export interface GameCtx {
  game: GameState;
  setGame: (g: GameState) => void;
  viewer: Viewer;
  company: CompanyState | null; // the team being viewed (null for GM)
  decision: Decision | null;
  update: (fn: (d: Decision) => void) => void;
  readOnly: boolean;
  user: User;
  go: (page: string) => void;
}

export const Ctx = createContext<GameCtx | null>(null);
export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('no game context');
  return c;
}
/** For team pages: company & decision are guaranteed. */
export function useTeam() {
  const c = useGame();
  if (!c.company || !c.decision) throw new Error('team view required');
  return { ...c, company: c.company, decision: c.decision };
}
