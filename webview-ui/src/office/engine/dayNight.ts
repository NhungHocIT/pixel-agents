import {
  DAWN_START_MIN,
  DAY_START_MIN,
  DUSK_START_MIN,
  LIGHT_FADE_SEC,
  LIGHT_FLICKER_SEC,
  LIGHTS_OFF_DELAY_SEC,
  LIGHTS_ON_DARKNESS,
  NIGHT_START_MIN,
} from '../../constants.js';
import type { TileType as TileTypeVal } from '../types.js';
import { TileType } from '../types.js';

/** How dark it is outside (0 day, 1 night) by the local clock: getting dark
 *  from DUSK_START to NIGHT_START, light again from DAWN_START to DAY_START. */
export function darknessAt(date: Date): number {
  const min = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  if (min >= DAY_START_MIN && min < DUSK_START_MIN) return 0;
  if (min >= DUSK_START_MIN && min < NIGHT_START_MIN) {
    return (min - DUSK_START_MIN) / (NIGHT_START_MIN - DUSK_START_MIN);
  }
  if (min >= DAWN_START_MIN && min < DAY_START_MIN) {
    return 1 - (min - DAWN_START_MIN) / (DAY_START_MIN - DAWN_START_MIN);
  }
  return 1;
}

/** The rooms: each run of touching floor tiles of one floor type is a room
 *  with its own lights. Room index per tile; -1 for walls and void. */
export function findRooms(tileMap: TileTypeVal[][]): { roomOf: number[][]; count: number } {
  const roomOf = tileMap.map((row) => row.map(() => -1));
  const isFloor = (t: TileTypeVal | undefined) =>
    t !== undefined && t !== TileType.WALL && t !== TileType.VOID;
  let count = 0;
  for (let r = 0; r < tileMap.length; r++) {
    for (let c = 0; c < tileMap[r].length; c++) {
      if (!isFloor(tileMap[r][c]) || roomOf[r][c] !== -1) continue;
      const floor = tileMap[r][c];
      const stack = [[c, r]];
      roomOf[r][c] = count;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (tileMap[ny]?.[nx] !== floor || roomOf[ny][nx] !== -1) continue;
          roomOf[ny][nx] = count;
          stack.push([nx, ny]);
        }
      }
      count++;
    }
  }
  return { roomOf, count };
}

/** One room's lights: how far on they are (0 off, 1 on), how long the room
 *  has been empty, and the flicker left from switching them on. */
export interface RoomLight {
  level: number;
  emptySec: number;
  flicker: number;
}

export function newRoomLight(): RoomLight {
  return { level: 0, emptySec: Infinity, flicker: 0 };
}

/** Lights go on once it is getting dark and someone is in the room (a short
 *  flicker, like a tube light), and off once it has stood empty for a while
 *  or it is light outside again. */
export function tickLight(light: RoomLight, occupied: boolean, darkness: number, dt: number): void {
  light.emptySec = occupied ? 0 : light.emptySec + dt;
  const on = darkness >= LIGHTS_ON_DARKNESS && light.emptySec < LIGHTS_OFF_DELAY_SEC;
  if (on && light.level === 0 && light.flicker <= 0) light.flicker = LIGHT_FLICKER_SEC;
  light.flicker = Math.max(0, light.flicker - dt);
  const step = dt / LIGHT_FADE_SEC;
  light.level = on ? Math.min(1, light.level + step) : Math.max(0, light.level - step);
}

/** How lit the room looks right now: flickering for a moment after switching on. */
export function shownLevel(light: RoomLight): number {
  if (light.flicker > 0) return Math.floor(light.flicker * 14) % 3 === 0 ? 0 : 1;
  return light.level;
}
