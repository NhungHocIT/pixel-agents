/**
 * Exercise break: everyone lines up on the floor, works out for a minute,
 * then goes back to what they were doing.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { EXERCISE_WORKOUT_SEC } from '../src/constants.js';
import { getCharacterSprite } from '../src/office/engine/characters.js';
import { pickCourtColumns, pickLineSlots } from '../src/office/engine/exercise.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { getCharacterSprites } from '../src/office/sprites/spriteData.js';
import { CharacterState } from '../src/office/types.js';

function floor(cols: number, rows: number): Array<{ col: number; row: number }> {
  const tiles: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) tiles.push({ col, row });
  }
  return tiles;
}

test('line slots sit one tile apart in a single row when the room is wide enough', () => {
  const slots = pickLineSlots(3, floor(9, 4), { col: 4, row: 2 });
  assert.equal(slots.length, 3);
  assert.equal(new Set(slots.map((s) => s.row)).size, 1, 'one row');
  const cols = slots.map((s) => s.col).sort((a, b) => a - b);
  assert.deepEqual([cols[1] - cols[0], cols[2] - cols[1]], [2, 2], 'a free tile between people');
});

// A 10-wide room (cols 0-9, rows 0-13) with an 8x4 court at col 1, rows 4-7.
// The net runs between cols 4 and 5.
const courtRoom = floor(10, 14);
const court = { col: 1, row: 4, w: 8, h: 4 };

const inCourt = (s: { col: number; row: number }) =>
  s.col >= court.col &&
  s.col < court.col + court.w &&
  s.row >= court.row &&
  s.row < court.row + court.h;

test('on the court: everyone inside it, in staggered columns either side of the net', () => {
  const { slots, coach } = pickCourtColumns(10, court, courtRoom)!;
  assert.equal(slots.length, 10);
  assert.ok(slots.every(inCourt), 'nobody off the court');
  assert.ok(
    slots.every((s) => s.col !== 4 && s.col !== 5),
    'the tiles beside the net left free',
  );
  assert.equal(new Set(slots.map((s) => s.col * 100 + s.row)).size, 10, 'no tile used twice');
  // Staggered: nobody right beside or right behind anyone else
  for (const a of slots)
    for (const b of slots)
      if (a !== b)
        assert.ok(Math.abs(a.col - b.col) + Math.abs(a.row - b.row) >= 2, 'a tile apart');
  // Mirrored across the net, five a side
  const left = slots.filter((s) => s.col <= 4);
  assert.equal(left.length, 5);
  for (const l of left) assert.ok(slots.some((r) => r.col === 9 - l.col && r.row === l.row));
  // The coach just below the court, under the net
  assert.deepEqual(coach, { col: 4, row: 8 });
});

test('on the court, a crowd: still all inside it, every tile of each half', () => {
  const { slots } = pickCourtColumns(20, court, courtRoom)!;
  assert.equal(slots.length, 20);
  assert.ok(slots.every(inCourt));
  assert.equal(new Set(slots.map((s) => s.col * 100 + s.row)).size, 20, 'no tile used twice');
});

test('a crowd too big for one row overflows into further rows, no tile used twice', () => {
  const slots = pickLineSlots(10, floor(5, 6), { col: 2, row: 2 });
  assert.equal(slots.length, 10);
  assert.equal(new Set(slots.map((s) => `${s.col},${s.row}`)).size, 10);
});

test('everyone walks into line, works out, then returns to their seat', () => {
  const office = new OfficeState();
  office.now = () => new Date(2026, 0, 5, 10, 0); // a work morning, not lunch on the wall clock
  office.addAgent(1);
  office.addAgent(2);
  const agents = [...office.characters.values()];
  for (let i = 0; i < 200; i++) office.update(0.05); // spawn effect settles

  office.startExercise();
  for (let i = 0; i < 2000 && agents.some((a) => a.state !== CharacterState.EXERCISE); i++) {
    office.update(0.05);
  }
  for (const a of agents) {
    assert.equal(a.state, CharacterState.EXERCISE, 'working out');
    const sprites = getCharacterSprites(a.palette, a.hueShift);
    assert.ok(getCharacterSprite(a, sprites), 'has an exercise frame');
  }
  const [a, b] = agents;
  assert.equal(a.tileRow, b.tileRow, 'standing in the same line');

  for (let t = 0; t < EXERCISE_WORKOUT_SEC + 1; t += 0.05) office.update(0.05);
  for (const ag of agents) assert.notEqual(ag.state, CharacterState.EXERCISE, 'break is over');

  for (let i = 0; i < 2000 && agents.some((x) => x.state !== CharacterState.TYPE); i++) {
    office.update(0.05);
  }
  for (const ag of agents) {
    assert.equal(ag.state, CharacterState.TYPE, 'back to work');
    const seat = ag.seatId ? office.seats.get(ag.seatId) : undefined;
    if (seat) assert.deepEqual([ag.tileCol, ag.tileRow], [seat.seatCol, seat.seatRow]);
  }
});
