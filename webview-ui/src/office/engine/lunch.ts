import { DRINK_FRAME_DURATION_SEC, WANDER_PAUSE_MIN_SEC } from '../../constants.js';
import type { Character, Seat } from '../types.js';
import { CharacterState, Direction } from '../types.js';
import { snapToTile, startWalk, stepWalk } from './walking.js';

/** Lunch at the bar: everyone walks to a bar seat (or, once the seats run out,
 *  a free spot on the bar floor), eats and drinks there until the meal is
 *  over. Owned by OfficeState. */
export interface LunchSession {
  members: Character[];
  /** Each member's bar seat (null: standing). */
  seats: Map<Character, Seat | null>;
}

/** Head for the bar along `path` (empty: already there or unreachable — eat
 *  where you stand), to sit at `seat` or stand facing `face`. */
export function joinLunch(
  ch: Character,
  path: Array<{ col: number; row: number }>,
  seat: Seat | null,
  face: Direction = Direction.DOWN,
): void {
  startWalk(ch, path, seat?.facingDir ?? face);
  ch.lostDetours = 0;
}

/** Per-frame update for someone at lunch: walk there, then sit down at the
 *  seat and eat (mug up, mug down), or just stand where the walk ended. */
export function updateLuncher(ch: Character, seat: Seat | null, dt: number): void {
  ch.frameTimer += dt;
  if (ch.state === CharacterState.WALK) {
    stepWalk(ch, dt, seat?.facingDir ?? Direction.DOWN);
    return;
  }
  if (!seat || ch.tileCol !== seat.seatCol || ch.tileRow !== seat.seatRow) return;
  if (ch.state !== CharacterState.TYPE) {
    ch.state = CharacterState.TYPE;
    ch.dir = seat.facingDir;
    ch.frame = 0;
    ch.frameTimer = 0;
  }
  if (ch.frameTimer >= DRINK_FRAME_DURATION_SEC) {
    ch.frameTimer -= DRINK_FRAME_DURATION_SEC;
    ch.frame = (ch.frame + 1) % 2;
  }
}

/** Lunch over: back to the normal FSM (an agent with work heads to its computer). */
export function leaveLunch(ch: Character): void {
  snapToTile(ch);
  ch.path = [];
  ch.state = CharacterState.IDLE;
  ch.frame = 0;
  ch.frameTimer = 0;
  ch.seatTimer = 0;
  ch.wanderTimer = Math.random() * WANDER_PAUSE_MIN_SEC;
}
