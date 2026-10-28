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

test('on the court: two staggered lines down the screen, clear of the net', () => {
  const { slots, coach } = pickCourtColumns(8, court, courtRoom)!;
  assert.equal(slots.length, 8);
  const cols = [...new Set(slots.map((s) => s.col))].sort((a, b) => a - b);
  assert.deepEqual(cols, [3, 6], 'one line each side, the tile beside the net left free');
  const left = slots.filter((s) => s.col === 3).map((s) => s.row);
  const right = slots.filter((s) => s.col === 6).map((s) => s.row);
  for (let i = 1; i < left.length; i++) assert.equal(left[i] - left[i - 1], 2, 'a tile apart');
  for (const row of right)
    assert.ok(left.includes(row - 1) || left.includes(row + 1), 'level with a gap');
  assert.ok(slots.every((s) => !s.shiftX && !s.shiftY));
  // The coach below both lines, under the net
  assert.equal(coach.col, 4);
  assert.ok(slots.every((s) => s.row <= coach.row - 2));
});

test('on the court, a crowd: one behind another, the right line half a tile lower', () => {
  const { slots } = pickCourtColumns(20, court, courtRoom)!;
  assert.equal(slots.length, 20);
  assert.deepEqual(
    [...new Set(slots.map((s) => s.col))].sort((a, b) => a - b),
    [3, 6],
  );
  assert.ok(slots.filter((s) => s.col === 6).every((s) => s.shiftY === 8));
  assert.equal(new Set(slots.map((s) => `${s.col},${s.row}`)).size, 20, 'no tile used twice');
});

test('a crowd too big for one row overflows into further rows, no tile used twice', () => {
  const slots = pickLineSlots(10, floor(5, 6), { col: 2, row: 2 });
  assert.equal(slots.length, 10);
  assert.equal(new Set(slots.map((s) => `${s.col},${s.row}`)).size, 10);
});

test('everyone walks into line, works out, then returns to their seat', () => {
  const office = new OfficeState();
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
