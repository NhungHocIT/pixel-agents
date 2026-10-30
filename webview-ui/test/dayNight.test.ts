/**
 * Day and night: it gets dark at dusk and light at dawn, and each room's
 * lights go on when someone is in it after dark, off once it stands empty.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { LIGHT_FLICKER_SEC, LIGHTS_OFF_DELAY_SEC } from '../src/constants.js';
import {
  darknessAt,
  findRooms,
  newRoomLight,
  shownLevel,
  tickLight,
} from '../src/office/engine/dayNight.js';
import { TileType } from '../src/office/types.js';

function at(h: number, m: number): Date {
  return new Date(2026, 9, 30, h, m);
}

test('dark at night, light by day, in between at dusk and dawn', () => {
  assert.equal(darknessAt(at(12, 0)), 0);
  assert.equal(darknessAt(at(17, 30)), 0);
  assert.equal(darknessAt(at(18, 0)), 0.5);
  assert.equal(darknessAt(at(18, 30)), 1);
  assert.equal(darknessAt(at(2, 0)), 1);
  assert.equal(darknessAt(at(6, 0)), 0.5);
  assert.equal(darknessAt(at(6, 30)), 0);
});

test('rooms: touching floor of one type, walls and other floors apart', () => {
  const W = TileType.WALL;
  const A = TileType.FLOOR_1;
  const B = TileType.FLOOR_2;
  const { roomOf, count } = findRooms([
    [A, A, W, B],
    [A, A, B, B],
  ]);
  assert.equal(count, 2);
  assert.equal(roomOf[0][2], -1, 'a wall is in no room');
  assert.equal(roomOf[1][0], roomOf[0][1]);
  assert.notEqual(roomOf[1][2], roomOf[1][1], 'another floor is another room');
});

test('lights: on after dark with someone in, flickering first; off once empty', () => {
  const light = newRoomLight();
  tickLight(light, true, 0, 1);
  assert.equal(light.level, 0, 'daytime: no lights');

  tickLight(light, true, 1, 0.05);
  assert.ok(light.flicker > 0, 'a tube light flickers on');
  for (let t = 0; t < LIGHT_FLICKER_SEC + 0.1; t += 0.05) tickLight(light, true, 1, 0.05);
  assert.equal(shownLevel(light), 1, 'then stays on');

  for (let t = 0; t < LIGHTS_OFF_DELAY_SEC - 1; t += 0.5) tickLight(light, false, 1, 0.5);
  assert.equal(shownLevel(light), 1, 'still on just after everyone left');
  for (let t = 0; t < 3; t += 0.5) tickLight(light, false, 1, 0.5);
  assert.equal(shownLevel(light), 0, 'off once the room stood empty');
});
