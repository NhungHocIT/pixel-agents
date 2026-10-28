/**
 * Bar theme: an agent that finishes its turn walks to its bed and sleeps,
 * and gets back up to its seat (drinking again) when new work arrives.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { createCharacter, updateCharacter } from '../src/office/engine/characters.js';
import type { Seat, TileType as TileTypeVal } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

const SIZE = 8;

function floorMap(): TileTypeVal[][] {
  return Array.from({ length: SIZE }, () => new Array<TileTypeVal>(SIZE).fill(TileType.FLOOR_1));
}

function run(
  ch: ReturnType<typeof createCharacter>,
  seats: Map<string, Seat>,
  until: () => boolean,
): void {
  const tileMap = floorMap();
  // Bed footprint (5,4)-(5,5) is furniture; the character's own bed tile is
  // unblocked for it, as OfficeState.withOwnBedUnblocked does.
  const blocked = new Set<string>(['5,4']);
  for (let i = 0; i < 2000 && !until(); i++) {
    updateCharacter(ch, 0.05, [], seats, tileMap, blocked);
  }
}

test('finished agent walks to its bed and sleeps, then returns to its seat', () => {
  const seat: Seat = {
    uid: 'chair',
    seatCol: 1,
    seatRow: 1,
    facingDir: Direction.DOWN,
    assigned: true,
  };
  const seats = new Map([['chair', seat]]);
  const ch = createCharacter(1, 0, 'chair', seat);
  assert.equal(ch.state, CharacterState.TYPE, 'starts at the seat, drinking');

  ch.isActive = false;
  ch.seatTimer = -1; // turn-end sentinel from setAgentActive(false)
  ch.restSpot = { col: 5, row: 5, kind: 'bed' };
  run(ch, seats, () => ch.state === CharacterState.SLEEP);

  assert.equal(ch.state, CharacterState.SLEEP);
  assert.deepEqual([ch.tileCol, ch.tileRow], [5, 5], 'asleep on the bed tile');
  assert.equal(ch.dir, Direction.DOWN);

  ch.isActive = true;
  run(ch, seats, () => ch.state === CharacterState.TYPE);

  assert.equal(ch.state, CharacterState.TYPE, 'back to drinking');
  assert.deepEqual([ch.tileCol, ch.tileRow], [1, 1], 'back at its seat');
});

test('agent without a bed keeps wandering as before', () => {
  const seat: Seat = {
    uid: 'chair',
    seatCol: 1,
    seatRow: 1,
    facingDir: Direction.DOWN,
    assigned: true,
  };
  const ch = createCharacter(1, 0, 'chair', seat);
  ch.isActive = false;
  ch.seatTimer = -1;
  run(ch, new Map([['chair', seat]]), () => false);
  assert.notEqual(ch.state, CharacterState.SLEEP);
});

test('finished agent sent to a gaming PC sits down and plays, facing the desk', () => {
  const seat: Seat = {
    uid: 'chair',
    seatCol: 1,
    seatRow: 1,
    facingDir: Direction.DOWN,
    assigned: true,
  };
  const ch = createCharacter(1, 0, 'chair', seat);
  ch.isActive = false;
  ch.seatTimer = -1;
  ch.restSpot = { col: 5, row: 5, kind: 'game' };
  run(ch, new Map([['chair', seat]]), () => ch.state === CharacterState.GAME);

  assert.equal(ch.state, CharacterState.GAME);
  assert.deepEqual([ch.tileCol, ch.tileRow], [5, 5]);
  assert.equal(ch.dir, Direction.UP, 'faces the desk above the gaming chair');
});
