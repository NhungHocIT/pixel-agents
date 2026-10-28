import { WALK_FRAME_DURATION_SEC, WALK_SPEED_PX_PER_SEC } from '../../constants.js';
import type { Character } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';

/** Walk one frame along `ch.path` for characters scripted outside the normal
 *  FSM (the exercise line, the waiter). Once the path runs out the character
 *  stands (IDLE) on the tile centre, facing `faceOnArrival`. */
export function stepWalk(ch: Character, dt: number, faceOnArrival: Direction): void {
  if (ch.state !== CharacterState.WALK) return;
  if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
    ch.frameTimer -= WALK_FRAME_DURATION_SEC;
    ch.frame = (ch.frame + 1) % 4;
  }
  const next = ch.path[0];
  if (!next) {
    snapToTile(ch);
    ch.state = CharacterState.IDLE;
    ch.dir = faceOnArrival;
    ch.frame = 0;
    ch.frameTimer = 0;
    return;
  }
  const dc = next.col - ch.tileCol;
  const dr = next.row - ch.tileRow;
  ch.dir =
    dc > 0 ? Direction.RIGHT : dc < 0 ? Direction.LEFT : dr > 0 ? Direction.DOWN : Direction.UP;
  ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;
  const t = Math.min(ch.moveProgress, 1);
  ch.x = (ch.tileCol + 0.5 + dc * t) * TILE_SIZE;
  ch.y = (ch.tileRow + 0.5 + dr * t) * TILE_SIZE;
  if (ch.moveProgress >= 1) {
    ch.tileCol = next.col;
    ch.tileRow = next.row;
    ch.path.shift();
    ch.moveProgress = 0;
  }
}

/** Set off along `path` (empty: stand where you are, facing `face`). */
export function startWalk(
  ch: Character,
  path: Array<{ col: number; row: number }>,
  face: Direction,
): void {
  snapToTile(ch);
  ch.path = path;
  ch.state = path.length > 0 ? CharacterState.WALK : CharacterState.IDLE;
  if (path.length === 0) ch.dir = face;
  ch.frame = 0;
  ch.frameTimer = 0;
}

export function snapToTile(ch: Character): void {
  ch.moveProgress = 0;
  ch.x = ch.tileCol * TILE_SIZE + TILE_SIZE / 2;
  ch.y = ch.tileRow * TILE_SIZE + TILE_SIZE / 2;
}
