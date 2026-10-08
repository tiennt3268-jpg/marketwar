import { expect, test } from 'vitest';
import { enrollStudent, getClass, saveClass, saveGame, loadGame, unenrollStudent } from '../src/ui/store';
import { assignAccount } from '../src/engine/members';
import { humanLikeGame } from './helpers';

test('class roster: enrol, reject duplicates, unenrol removes company assignment', () => {
  saveClass({ id: 'CL-1', name: 'IB', code: 'IB', term: '', createdBy: 'tiennt', createdAt: '' });
  enrollStudent('CL-1', 'an');
  expect(() => enrollStudent('CL-1', 'an')).toThrow(/already/);
  expect(getClass('CL-1')!.students).toEqual(['an']);
  let g = humanLikeGame();
  g.classId = 'CL-1';
  g = assignAccount(g, 'an', 'C1');
  saveGame(g);
  unenrollStudent('CL-1', 'an');
  expect(getClass('CL-1')!.students).toEqual([]);
  expect(loadGame(g.id)?.members ?? []).toEqual([]);
});
