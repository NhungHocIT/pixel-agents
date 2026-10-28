/**
 * Pickleball: the players walk to either side of the net, rally (the ball
 * flies across, whoever covers that part of the court runs to meet it), and
 * the game ends on time. Singles and doubles.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { PICKLEBALL_GAME_SEC, PICKLEBALL_GATHER_MAX_SEC } from '../src/constants.js';
import { createCharacter } from '../src/office/engine/characters.js';
import { PICKLEBALL } from '../src/office/engine/dialogues.js';
import type { PickleballGame } from '../src/office/engine/pickleball.js';
import {
  ballInstances,
  courtSpots,
  endPickleball,
  startPickleball,
  updatePickleball,
} from '../src/office/engine/pickleball.js';
import type { Character } from '../src/office/types.js';
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

/** Players start off court on their spot's row and walk straight in. */
function setUp(perSide: number): { game: PickleballGame; players: Character[] } {
  const spots = courtSpots(court, perSide);
  const players: Character[] = [];
  const paths = [];
  let id = 1;
  for (const [side, startCol] of [
    [0, 6],
    [1, 21],
  ] as const) {
    for (const spot of spots[side]) {
      players.push(player(id++, startCol, spot.row));
      paths.push(along(spot.row, startCol, spot.col));
    }
  }
  const teams: [Character[], Character[]] = [players.slice(0, perSide), players.slice(perSide)];
  return { game: startPickleball(teams, court, paths), players };
}

function gather(game: PickleballGame): void {
  for (let t = 0; game.phase === 'gather' && t < PICKLEBALL_GATHER_MAX_SEC; t += 0.05) {
    assert.ok(updatePickleball(game, 0.05));
  }
  assert.equal(game.phase, 'play');
}

/** Play to the end: who hit the ball, and every line said, by player. */
function playOut(game: PickleballGame, players: Character[]) {
  const hitters = new Set<Character>();
  const said = new Map(players.map((ch) => [ch, new Set<string>()]));
  let playing = true;
  for (let t = 0; playing && t < PICKLEBALL_GAME_SEC + 10; t += 0.05) {
    playing = updatePickleball(game, 0.05);
    if (game.shot) hitters.add(game.shot.by);
    for (const ch of players) {
      assert.ok(ch.tileRow >= court.row && ch.tileRow < court.row + court.h, 'stays on court');
      if (ch.speech) said.get(ch)!.add(ch.speech);
    }
  }
  assert.equal(playing, false, 'the game ends');
  return { hitters, said };
}

test('singles: both walk to their side, face the net and rally until time is up', () => {
  const { game, players } = setUp(1);
  const [a, b] = players;
  assert.equal(a.state, CharacterState.WALK);
  assert.equal(ballInstances(game).length, 0, 'no ball before both are on court');

  gather(game);
  const [left, right] = courtSpots(court, 1);
  assert.deepEqual([a.tileCol, b.tileCol], [left[0].col, right[0].col]);
  assert.equal(a.dir, Direction.RIGHT);
  assert.equal(ballInstances(game).length, 2, 'ball and its shadow');

  const { hitters, said } = playOut(game, players);
  assert.equal(hitters.size, 2, 'both hit the ball');

  // Both talk; the game opens with a start line and closes with a wrap-up
  assert.ok(
    [a, b].every((ch) => said.get(ch)!.size > 0),
    'both players talk',
  );
  const all = new Set([...said.values()].flatMap((s) => [...s]));
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

test('doubles: two a side, each covers its half, and all four get to hit', () => {
  const { game, players } = setUp(2);
  gather(game);
  const [top, bottom] = game.teams[0];
  assert.ok(top.tileRow < bottom.tileRow, 'partners stand one above the other');
  assert.equal(top.tileCol, bottom.tileCol, 'side by side, the same way from the net');

  const half = court.row + court.h / 2;
  let rallies = 0;
  while (rallies < 40) {
    const before = game.shot;
    assert.ok(updatePickleball(game, 0.05));
    if (game.shot !== before && game.shot) {
      rallies++;
      // The one hitting stayed in the half they cover
      const by = game.shot.by;
      const team = game.teams[game.shot.side];
      if (team.length === 2) {
        const upper = [...team].sort((x, y) => x.tileRow - y.tileRow)[0];
        assert.equal(by === upper, by.tileRow < half, 'covers its own half');
      }
    }
  }
  const { hitters } = playOut(game, players);
  assert.ok(hitters.size >= 3, 'the ball goes to more than one player per side');
});
