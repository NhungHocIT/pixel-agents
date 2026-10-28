/**
 * Bar patrons: decorative, non-agent characters that keep the bar busy.
 *
 * Each patron runs the ordinary character FSM; this module only drives its
 * schedule by flipping `isActive` — a drinking spell at a free seat, then a
 * rest spell (sleep in a free bed, or wander). Agents always win: a patron
 * gives up a seat or bed the moment an agent needs it (see OfficeState).
 */
import {
  PATRON_DRINK_MAX_SEC,
  PATRON_DRINK_MIN_SEC,
  PATRON_ID_BASE,
  PATRON_REST_MAX_SEC,
  PATRON_REST_MIN_SEC,
  PATRON_SEAT_RETRY_SEC,
} from '../../constants.js';
import type { Character } from '../types.js';
import { CharacterState, TILE_SIZE } from '../types.js';
import { createCharacter } from './characters.js';

export function isPatron(ch: Character): boolean {
  return ch.id >= PATRON_ID_BASE;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createPatron(index: number, palette: number, col: number, row: number): Character {
  const ch = createCharacter(PATRON_ID_BASE + index, palette, null, null);
  ch.tileCol = col;
  ch.tileRow = row;
  ch.x = col * TILE_SIZE + TILE_SIZE / 2;
  ch.y = row * TILE_SIZE + TILE_SIZE / 2;
  ch.state = CharacterState.IDLE;
  ch.isActive = false;
  // Stagger the first seat grab so the bar doesn't fill in one frame
  ch.patronTimer = randomRange(0, PATRON_REST_MIN_SEC);
  return ch;
}

/** End the current drinking spell: stand up, free the seat, rest for a while. */
export function sendPatronToRest(p: Character, restSec?: number): void {
  p.isActive = false;
  p.seatId = null;
  p.seatTimer = -1; // leave the seat straight away (same sentinel as setAgentActive)
  p.patronTimer = restSec ?? randomRange(PATRON_REST_MIN_SEC, PATRON_REST_MAX_SEC);
}

/** Advance a patron's drink/rest schedule. `pickSeat` returns a free seat id or null. */
export function tickPatronSchedule(p: Character, dt: number, pickSeat: () => string | null): void {
  p.patronTimer = (p.patronTimer ?? 0) - dt;
  if (p.patronTimer > 0) return;
  if (p.isActive) {
    sendPatronToRest(p);
    return;
  }
  const seatId = pickSeat();
  if (!seatId) {
    p.patronTimer = PATRON_SEAT_RETRY_SEC;
    return;
  }
  p.seatId = seatId;
  p.isActive = true; // FSM walks it to the seat (waking it first if asleep)
  p.patronTimer = randomRange(PATRON_DRINK_MIN_SEC, PATRON_DRINK_MAX_SEC);
}
