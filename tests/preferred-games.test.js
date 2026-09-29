import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, preferredGamesFor, gamesFor } from '../model.js';

test('preferred counts include active mains, exclude fills, and follow current preferences', () => {
  const state = newState();
  state.players.push({ id: 'player', name: 'Player', battletag: '', roles: ['MS'], offRoles: ['FS'], status: 'default', notes: '' });
  const session = currentSession(state);
  session.games = ['MS', 'FS', 'Tank'].map(role => ({ lineup: [{ playerId: 'player', role }] }));
  assert.equal(preferredGamesFor(state, 'player'), 1);
  assert.equal(gamesFor(state, 'player'), 3);
  session.activeGame = { lineup: [{ playerId: 'player', role: 'FS' }] };
  assert.equal(preferredGamesFor(state, 'player'), 1);
  session.activeGame.lineup[0].role = 'MS';
  assert.equal(preferredGamesFor(state, 'player'), 2);
  state.players[0].roles.push('FS');
  assert.equal(preferredGamesFor(state, 'player'), 3);
  state.players[0].roles = [];
  assert.equal(preferredGamesFor(state, 'player'), 0);
  assert.equal(preferredGamesFor(state, 'missing'), 0);
});
