/**
 * TNhunn wins a League match: fireworks, the banner, and everyone hopping and
 * cheering along — once per match.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { CELEBRATION_SEC } from '../src/constants.js';
import { characterDrawOffsetPx } from '../src/office/engine/characters.js';
import { OfficeState } from '../src/office/engine/officeState.js';

function run(office: OfficeState, sec: number): void {
  for (let t = 0; t < sec; t += 0.1) office.update(0.1);
}

test('a win starts the party once per match, a loss never does', () => {
  const office = new OfficeState();
  office.setLolStatus({ phase: 'InProgress', gameId: 7, result: 'lose' });
  assert.equal(office.getCelebration(), null, 'no party for a loss');

  office.setLolStatus({ phase: 'InProgress', gameId: 8, result: 'win' });
  assert.notEqual(office.getCelebration(), null, 'a win starts it');
  run(office, CELEBRATION_SEC + 1);
  assert.equal(office.getCelebration(), null, 'over after CELEBRATION_SEC');

  // The same match reported again (end-of-game screen, heartbeat): no repeat
  office.setLolStatus({ phase: 'EndOfGame', gameId: 8, result: 'win' });
  assert.equal(office.getCelebration(), null);

  office.setLolStatus({ phase: 'EndOfGame', gameId: 9, result: 'win' });
  assert.notEqual(office.getCelebration(), null, 'the next win celebrates again');
});

test('without a game id, a win celebrates on the change to a win', () => {
  const office = new OfficeState();
  office.setLolStatus({ phase: 'InProgress', result: 'win' });
  assert.notEqual(office.getCelebration(), null);
  run(office, CELEBRATION_SEC + 1);
  office.setLolStatus({ phase: 'InProgress', result: 'win' });
  assert.equal(office.getCelebration(), null, 'still the same win');
});

test('everyone cheers and hops during the party, then goes back to normal', () => {
  const office = new OfficeState();
  office.addAgent(1);
  office.addAgent(2);
  run(office, 1);
  office.celebrate();
  run(office, 1);
  const agents = [...office.characters.values()];
  assert.ok(agents.length > 0);
  for (const ch of agents) {
    assert.ok(ch.speech, 'cheering');
    assert.notEqual(ch.cheerTimer, undefined, 'hopping');
  }
  // Hops: the draw offset changes over the beats
  const offsets = new Set<number>();
  for (let i = 0; i < 4; i++) {
    offsets.add(characterDrawOffsetPx(agents[0]));
    office.update(0.25);
  }
  assert.ok(offsets.size > 1, 'goes up and down');

  run(office, CELEBRATION_SEC);
  for (const ch of agents) assert.equal(ch.cheerTimer, undefined, 'stopped hopping');
});
