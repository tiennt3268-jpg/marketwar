import { expect, test, vi } from 'vitest';
import { catchUp, runRound, setDeadline } from '../src/ui/rounds';
import { botGame } from './helpers';

vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });

test('deadline processes due rounds and opens the next one with a new deadline', () => {
  const t0 = Date.parse('2026-10-08T00:00:00Z');
  let g = botGame(3);
  g = setDeadline(g, new Date(t0).toISOString(), 60, true, 'gm');
  // 2.5 hours later: rounds due at t0, t0+60, t0+120 → three rounds processed
  g = catchUp(g, t0 + 150 * 60_000);
  expect(g.round).toBe(4);
  expect(g.schedule?.deadline).toBe(new Date(t0 + 180 * 60_000).toISOString());
});

test('without auto-advance only the current round is processed', () => {
  const t0 = Date.parse('2026-10-08T00:00:00Z');
  let g = botGame(3);
  g = setDeadline(g, new Date(t0).toISOString(), 60, false, 'gm');
  g = catchUp(g, t0 + 500 * 60_000);
  expect(g.round).toBe(2);
  expect(g.schedule?.deadline).toBeNull();
});

test('closing a round early restarts the clock from now', () => {
  const t0 = Date.now() + 10 * 60_000;
  let g = botGame(3);
  g = setDeadline(g, new Date(t0).toISOString(), 60, true, 'gm');
  const before = Date.now();
  g = runRound(g, 'gm', 'manual');
  const next = Date.parse(g.schedule!.deadline!);
  expect(next).toBeGreaterThanOrEqual(before + 60 * 60_000);
  expect(next).toBeLessThan(t0 + 60 * 60_000);
});
