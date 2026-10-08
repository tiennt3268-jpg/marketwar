// Round lifecycle used by the UI: lock + process + publish, notifications, and deadline scheduling.
import { isScored, processRound } from '../engine/engine';
import type { GameState } from '../engine/types';
import { fmtK } from '../engine/util';
import { notify } from './notifications';
import { loadGame, saveGame, type SavedGameMeta } from './store';

const roundName = (g: GameState, r: number) => (isScored(g, r) ? `Round ${r - g.scenario.practiceRounds}` : `Practice ${r}`);

export function gameAudience(g: GameState): string[] {
  return [g.owner, ...(g.members ?? []).map((m) => m.username)].filter((x): x is string => !!x);
}

/** Process the open round, publish it, notify everyone involved and set the next deadline. */
export function runRound(input: GameState, actor: string, reason: 'manual' | 'deadline' | 'solo' = 'manual'): GameState {
  const locked: GameState = { ...input, audit: [...input.audit, { at: new Date().toISOString(), round: input.round, actor, event: 'LOCK', detail: reason === 'deadline' ? 'Deadline reached' : 'Locked' }] };
  const { game, result } = processRound(locked);
  const name = roundName(input, result.round);
  const base = { gameId: game.id, gameName: game.name };

  // results for everyone, personalised for each company owner
  if (game.owner && !game.solo) notify([game.owner], { ...base, kind: 'round', title: `${name} results published`, body: reason === 'deadline' ? 'Processed automatically at the deadline.' : undefined });
  for (const m of game.members ?? []) {
    const row = result.leaderboard.find((x) => x.companyId === m.companyId);
    const co = game.companies.find((c) => c.id === m.companyId);
    const ni = co?.history.find((h) => h.round === result.round)?.income.netIncome ?? 0;
    notify([m.username], { ...base, kind: 'round', title: `${name} results published`, body: row ? `${co?.name}: rank #${row.rank} · score ${row.score.toFixed(1)} · net income ${fmtK(ni)}` : undefined });
    const alerts = (co?.history.find((h) => h.round === result.round)?.messages ?? []).filter((x) => /INSOLVENT|emergency loan|detained|lost in transit|destroyed/i.test(x));
    for (const a of alerts.slice(0, 4)) notify([m.username], { ...base, kind: 'alert', title: co?.name ?? 'Company alert', body: a });
  }
  for (const e of result.events) notify(gameAudience(game), { ...base, kind: 'event', title: `Event: ${e.name}${e.country ? ` (${e.country})` : ''}`, body: e.description });

  let next: GameState = { ...game, audit: [...game.audit, { at: new Date().toISOString(), round: result.round, actor, event: 'PUBLISH', detail: name }] };
  if (game.phase === 'FINISHED') {
    const top = result.leaderboard[0];
    const winner = game.companies.find((c) => c.id === top?.companyId);
    notify(gameAudience(game), { ...base, kind: 'finish', title: 'Game finished', body: winner ? `Winner: ${winner.name} (${top.score.toFixed(1)} points)` : undefined });
    next = { ...next, schedule: next.schedule ? { ...next.schedule, deadline: null } : undefined };
  } else if (next.schedule?.deadline) {
    if (next.schedule.autoAdvance && next.schedule.durationMin > 0) {
      // keep the cadence when the deadline fired; restart the clock when the GM closed the round early
      const from = reason === 'deadline' ? Date.parse(next.schedule.deadline) : Date.now();
      const deadline = new Date(from + next.schedule.durationMin * 60_000).toISOString();
      next = { ...next, schedule: { ...next.schedule, deadline } };
      if (!game.solo) notify(gameAudience(game), { ...base, kind: 'deadline', title: `${roundName(next, next.round)} is open`, body: `Deadline ${new Date(deadline).toLocaleString('en-GB')}` });
    } else {
      next = { ...next, schedule: { ...next.schedule, deadline: null } };
    }
  }
  return next;
}

/** Process every round whose deadline has already passed (bounded). */
export function catchUp(game: GameState, now = Date.now()): GameState {
  let g = game;
  for (let i = 0; i < 24; i++) {
    const d = g.schedule?.deadline;
    if (!d || g.phase !== 'OPEN' || Date.parse(d) > now) break;
    g = runRound(g, 'scheduler', 'deadline');
  }
  return g;
}

export function setDeadline(game: GameState, deadline: string | null, durationMin: number, autoAdvance: boolean, actor: string): GameState {
  const g: GameState = {
    ...game, schedule: { deadline, durationMin, autoAdvance },
    audit: [...game.audit, { at: new Date().toISOString(), round: game.round, actor, event: 'SCHEDULE', detail: deadline ? `deadline ${deadline} · ${durationMin} min · auto ${autoAdvance}` : 'deadline cleared' }],
  };
  if (deadline) notify((game.members ?? []).map((m) => m.username), { gameId: game.id, gameName: game.name, kind: 'deadline', title: `${roundName(game, game.round)} deadline`, body: new Date(deadline).toLocaleString('en-GB') });
  return g;
}

export function timeLeft(deadline: string, now = Date.now()): string {
  const ms = Date.parse(deadline) - now;
  if (ms <= 0) return 'due';
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${mm}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

/** Catch up saved games whose deadline passed while nobody had them open. Returns true if anything changed. */
export function catchUpSaved(metas: SavedGameMeta[], now = Date.now()): boolean {
  let changed = false;
  for (const m of metas) {
    if (!m.deadline || Date.parse(m.deadline) > now) continue;
    const g = loadGame(m.id);
    if (!g) continue;
    const next = catchUp(g, now);
    if (next !== g) { saveGame(next); changed = true; }
  }
  return changed;
}
