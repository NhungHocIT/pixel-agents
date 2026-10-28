/**
 * Pickleball: the two players walk to either side of the net, rally (the ball
 * flies between them, the receiver runs to meet it), and the game ends on time.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { PICKLEBALL_GAME_SEC, PICKLEBALL_GATHER_MAX_SEC } from '../src/constants.js';
import { createCharacter } from '../src/office/engine/characters.js';
import { PICKLEBALL } from '../src/office/engine/dialogues.js';
import {
  ballInstances,
  courtSides,
  endPickleball,
  startPickleball,
  updatePickleball,
} from '../src/office/engine/pickleball.js';
import { CharacterState, Direction } from '../src/office/types.js';

const court = { col: 10, row: 4, w: 8, h: 4 };

function player(id: number, col: number, row: number) {
  const ch = createCharacter(id, id, null, null);
  ch.tileCol = col;
  ch.tileRow = row;
  ch.state = CharacterState.IDLE;
  return ch;
}

/** A straight walk along a row to `col`. */
function along(row: number, from: number, to: number) {
  const path = [];
  const step = to > from ? 1 : -1;
  for (let c = from + step; c !== to + step; c += step) path.push({ col: c, row });
  return path;
}

test('both walk to their side, face the net and rally until time is up', () => {
  const [left, right] = courtSides(court);
  const a = player(1, 6, left.row);
  const b = player(2, 21, right.row);
  const game = startPickleball([a, b], court, [
    along(left.row, 6, left.col),
    along(right.row, 21, right.col),
  ]);
  assert.equal(a.state, CharacterState.WALK);
  assert.equal(ballInstances(game).length, 0, 'no ball before both are on court');

  let t = 0;
  while (game.phase === 'gather' && t < PICKLEBALL_GATHER_MAX_SEC) {
    assert.ok(updatePickleball(game, 0.05));
    t += 0.05;
  }
  assert.equal(game.phase, 'play');
  assert.deepEqual([a.tileCol, b.tileCol], [left.col, right.col]);
  assert.equal(a.dir, Direction.RIGHT);
  assert.equal(ballInstances(game).length, 2, 'ball and its shadow');

  // Over the game the ball goes back and forth and the receivers stay on court
  const hitters = new Set<number>();
  const said = new Map<string, Set<string>>([
    ['a', new Set()],
    ['b', new Set()],
  ]);
  let playing = true;
  for (t = 0; playing && t < PICKLEBALL_GAME_SEC + 10; t += 0.05) {
    playing = updatePickleball(game, 0.05);
    if (game.shot) hitters.add(game.shot.by);
    for (const [name, ch] of [
      ['a', a],
      ['b', b],
    ] as const) {
      assert.ok(ch.tileRow >= court.row && ch.tileRow < court.row + court.h, 'stays on court');
      if (ch.speech) said.get(name)!.add(ch.speech);
    }
  }
  assert.equal(playing, false, 'the game ends');
  assert.deepEqual([...hitters].sort(), [0, 1], 'both hit the ball');

  // Both talk; the game opens with a start line and closes with a wrap-up
  assert.ok(said.get('a')!.size > 0 && said.get('b')!.size > 0, 'both players talk');
  const all = new Set([...said.get('a')!, ...said.get('b')!]);
  assert.ok(
    PICKLEBALL.start.some((s) => all.has(s[0])),
    'an opening line',
  );
  assert.ok(
    PICKLEBALL.finish.some((s) => all.has(s[0])),
    'a wrap-up line',
  );

  endPickleball(game);
  assert.equal(a.state, CharacterState.IDLE);
  assert.equal(a.speech, null);
});
