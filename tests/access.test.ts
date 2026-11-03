import { expect, test } from 'vitest';
import { canEditCompany, canOpenPage } from '../src/ui/access';
import type { User } from '../src/ui/auth';
import { humanLikeGame } from './helpers';

const user = (username: string, role: 'admin' | 'player'): User => ({ username, role, createdAt: '', profile: { fullName: '', studentId: '', email: '', cohort: '' } });

test('students edit only their own company; the Game Master only watches', () => {
  const g = humanLikeGame();
  const [a, b] = g.companies;
  g.members = [{ username: 'alice', companyId: a.id, addedAt: '' }];
  expect(canEditCompany(user('alice', 'player'), g, a.id)).toBe(true);
  expect(canEditCompany(user('alice', 'player'), g, b.id)).toBe(false);
  expect(canEditCompany(user('bob', 'player'), g, a.id)).toBe(false);
  expect(canEditCompany(user('tiennt', 'admin'), g, a.id)).toBe(false);
});

test('Game Master pages are closed to students', () => {
  expect(canOpenPage(user('alice', 'player'), 'gm', true)).toBe(false);
  expect(canOpenPage(user('alice', 'player'), 'assign', true)).toBe(false);
  expect(canOpenPage(user('alice', 'player'), 'product', true)).toBe(true);
  expect(canOpenPage(user('tiennt', 'admin'), 'assign', false)).toBe(true);
  expect(canOpenPage(user('tiennt', 'admin'), 'product', false)).toBe(false);
});
