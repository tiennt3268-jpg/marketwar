import { createGame, processRound } from '../src/engine/engine';
import { makeBotDecision } from '../src/engine/bots';
import type { BotStrategy, GameState } from '../src/engine/types';

export function botGame(seed = 7, strategies: BotStrategy[] = ['export_first', 'price_leader', 'quality_differentiator', 'jv_diversifier'], practice = 0): GameState {
  const g = createGame({ name: 'test', seed, teams: strategies.map((s) => ({ name: s, color: '#888', isBot: true, botStrategy: s })) });
  g.scenario.practiceRounds = practice;
  return g;
}

/** A game whose first team is "human" but plays the bot plan (so its decisions can be edited). */
export function humanLikeGame(seed = 7): GameState {
  const g = createGame({ name: 'test', seed, teams: [
    { name: 'Human', color: '#000', isBot: false },
    { name: 'B1', color: '#111', isBot: true, botStrategy: 'export_first' },
    { name: 'B2', color: '#222', isBot: true, botStrategy: 'quality_differentiator' },
    { name: 'B3', color: '#333', isBot: true, botStrategy: 'price_leader' },
  ] });
  g.scenario.practiceRounds = 0;
  return g;
}

export function playHumanAsBot(g: GameState, strategy: BotStrategy = 'export_first'): GameState {
  const human = g.companies[0];
  const d = makeBotDecision(g, { ...human, botStrategy: strategy });
  return { ...g, decisions: { ...g.decisions, [human.id]: d } };
}

export function runRounds(g: GameState, n: number, eachHuman?: (g: GameState) => GameState): GameState {
  let cur = g;
  for (let i = 0; i < n && cur.phase !== 'FINISHED'; i++) {
    if (eachHuman) cur = eachHuman(cur);
    cur = processRound(cur).game;
  }
  return cur;
}
