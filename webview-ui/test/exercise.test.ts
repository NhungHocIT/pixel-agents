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
import { pickCourtRows, pickLineSlots } from '../src/office/engine/exercise.js';
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

// A 10-wide room (cols 0-9) with an 8x4 court at col 1, rows 4-7
const courtRoom = floor(10, 12);
const court = { col: 1, row: 4, w: 8, h: 4 };

test('on the court: two staggered rows, each back spot in a gap of the front row', () => {
  const slots = pickCourtRows(8, court, courtRoom);
  assert.equal(slots.length, 8);
  const front = slots.filter((s) => s.row === 6).map((s) => s.col);
  const back = slots.filter((s) => s.row === 5).map((s) => s.col);
  assert.equal(front.length + back.length, 8, 'two rows only');
  assert.equal(slots[0].row, 6, 'front row first (the coach stands in front of it)');
  for (let i = 1; i < front.length; i++) assert.equal(front[i] - front[i - 1], 2);
  for (const col of back) assert.ok(front.includes(col - 1), 'behind a gap, not a person');
  assert.ok(slots.every((s) => !s.shiftPx));
});

test('on the court, a crowd: shoulder to shoulder, back row half a tile over', () => {
  const slots = pickCourtRows(18, court, courtRoom);
  assert.equal(slots.length, 18);
  const back = slots.filter((s) => s.row === 5);
  assert.equal(slots.filter((s) => s.row === 6).length + back.length, 18, 'still two rows');
  assert.ok(back.every((s) => s.shiftPx === 8));
  assert.equal(new Set(slots.map((s) => `${s.col},${s.row}`)).size, 18);
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
