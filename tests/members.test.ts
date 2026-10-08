import { expect, test } from 'vitest';
import { assignAccount, companyOwner, memberCompany, unassignAccount } from '../src/engine/members';
import { createGame, openingHash, processRound } from '../src/engine/engine';
import { botLineup } from '../src/engine/bots';
import type { BotLevel } from '../src/engine/types';
import { humanLikeGame } from './helpers';

test('one account per company', () => {
  let g = humanLikeGame();
  g = assignAccount(g, 'an', 'C1');
  expect(companyOwner(g, 'C1')).toBe('an');
  expect(() => assignAccount(g, 'binh', 'C1')).toThrow(/already run/);
  expect(() => assignAccount(g, 'binh', 'C2')).toThrow(/student company/); // C2 is a bot
  g = unassignAccount(g, 'an');
  expect(memberCompany(g, 'an')).toBeNull();
  g = assignAccount(g, 'binh', 'C1');
  expect(companyOwner(g, 'C1')).toBe('binh');
});

function soloScore(level: BotLevel, seed: number) {
  let g = createGame({ name: 's', seed, teams: [{ name: 'Me', color: '#000', isBot: true, botStrategy: 'export_first' }, ...botLineup(level, 3).map((b, i) => ({ name: `B${i}`, color: '#111', isBot: true, botStrategy: b }))] });
  g.botLevel = level;
  g.scenario.practiceRounds = 0;
  // the reference company always plays the normal export-first plan
  while (g.phase !== 'FINISHED') g = processRound(g).game;
  const lb = g.results[g.results.length - 1].leaderboard;
  const opp = lb.filter((x) => x.companyId !== 'C1');
  return opp.reduce((a, b) => a + b.score, 0) / opp.length;
}

test('bot difficulty: hard bots outscore easy bots, opening state stays identical', () => {
  const g = createGame({ name: 'x', seed: 1, teams: botLineup('hard', 3).map((b) => ({ name: b, color: '#000', isBot: true, botStrategy: b })) });
  g.botLevel = 'hard';
  expect(new Set(g.companies.map(openingHash)).size).toBe(1);
  let easy = 0, hard = 0;
  for (const seed of [11, 22, 33, 44]) { easy += soloScore('easy', seed); hard += soloScore('hard', seed); }
  expect(hard).toBeGreaterThan(easy);
}, 60_000);
