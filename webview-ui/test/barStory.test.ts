/**
 * Bar storyline: relationship lookups, the wanderer's wrong turns, and
 * followers wandering near their leader.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { STORY_FOLLOW_RADIUS_TILES } from '../src/constants.js';
import { storyAnchorName, storySyncName, storyTiesOf } from '../src/office/engine/barStory.js';
import { createCharacter, updateCharacter } from '../src/office/engine/characters.js';
import type { Seat, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

/** Read state without TS narrowing it from the assignment above. */
const stateOf = (c: { state: CharacterState }): CharacterState => c.state;

const SIZE = 10;
const tileMap = (): TileTypeVal[][] =>
  Array.from({ length: SIZE }, () => new Array<TileTypeVal>(SIZE).fill(TileType.FLOOR_1));
const allTiles = Array.from({ length: SIZE * SIZE }, (_, i) => ({
  col: i % SIZE,
  row: Math.floor(i / SIZE),
}));

test('storyline ties', () => {
  assert.equal(storyTiesOf('Naruto').partner, 'Hinata');
  assert.equal(storyTiesOf('Hinata').partner, 'Naruto');
  assert.equal(storyTiesOf('Gray').partner, 'Juvia');
  assert.equal(storyTiesOf('Gojo').buddy, 'Nanami');
  assert.equal(storyTiesOf('Kakashi').leader, 'Naruto');
  assert.equal(storyTiesOf('Nezuko').leader, 'Giyu');
  assert.equal(storyTiesOf('Zoro').wanderer, true);
  assert.equal(storyTiesOf('Dolia').partner, null);
  // Partner wins over leader; only partner/buddy sync activity
  assert.equal(storyAnchorName(storyTiesOf('Kakashi')), 'Naruto');
  assert.equal(storySyncName(storyTiesOf('Kakashi')), null);
  assert.equal(storySyncName(storyTiesOf('Nanami')), 'Gojo');
});

test('a wanderer takes its wrong turns, then still reaches its seat', () => {
  const seat: Seat = { uid: 's', seatCol: 8, seatRow: 8, facingDir: Direction.UP, assigned: true };
  const seats = new Map([['s', seat]]);
  const ch = createCharacter(1, 0, 's', null);
  ch.state = CharacterState.IDLE;
  ch.tileCol = 0;
  ch.tileRow = 0;
  ch.x = 8;
  ch.y = 8;
  ch.lostDetours = 2;
  const map = tileMap();
  let detourWalks = 0;
  let wasWalking = false;
  for (let i = 0; i < 20000 && stateOf(ch) !== CharacterState.TYPE; i++) {
    updateCharacter(ch, 0.05, allTiles, seats, map, new Set());
    const walking = stateOf(ch) === CharacterState.WALK;
    if (walking && !wasWalking) detourWalks++;
    wasWalking = walking;
  }
  assert.equal(stateOf(ch), CharacterState.TYPE, 'ends up drinking at its seat');
  assert.deepEqual([ch.tileCol, ch.tileRow], [8, 8]);
  assert.equal(ch.lostDetours, 0);
  assert.ok(detourWalks >= 2, `walked off course before arriving (${detourWalks} walks)`);
});

test('a follower wanders near its leader', () => {
  const ch = createCharacter(1, 0, null, null);
  ch.state = CharacterState.IDLE;
  ch.isActive = false;
  ch.tileCol = 0;
  ch.tileRow = 0;
  ch.wanderAnchor = { col: 7, row: 7 };
  ch.wanderCount = 0;
  ch.wanderLimit = 1000;
  ch.wanderTimer = 0;
  const map = tileMap();
  for (let i = 0; i < 20; i++) {
    updateCharacter(ch, 0.05, allTiles, new Map(), map, new Set());
    if (stateOf(ch) === CharacterState.WALK) break;
  }
  const target = ch.path[ch.path.length - 1];
  assert.ok(target, 'started a wander walk');
  assert.ok(
    Math.abs(target.col - 7) + Math.abs(target.row - 7) <= STORY_FOLLOW_RADIUS_TILES,
    `target ${target.col},${target.row} is near the leader`,
  );
});
