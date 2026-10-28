/**
 * The bar's waiter (WAITER_NAME): never a customer. Waits at the counter,
 * walks up to someone seated in the bar or playing in the game room and
 * takes their order, then does it — wipes the table or keyboard right there,
 * or goes back to the counter to get the drink or snack and brings it — while
 * the customer waits; hands it over, gets a thank-you, and heads back.
 *
 * Pure helpers; OfficeState holds the round and drives it every frame.
 */
import type { Character } from '../types.js';
import { CharacterState, Direction } from '../types.js';
import type { WaiterOrder } from './dialogues.js';

export interface WaiterRound {
  /** pause → toCustomer → ordering (a chat) → wiping, or fetching → preparing
   *  → bringing → handover (a chat: thanks) → toCounter. */
  phase:
    | 'pause'
    | 'toCustomer'
    | 'ordering'
    | 'wiping'
    | 'fetching'
    | 'preparing'
    | 'bringing'
    | 'handover'
    | 'toCounter';
  /** Seconds left in `pause`, `wiping` and `preparing`. */
  timer: number;
  customer: Character | null;
  /** The tile beside the customer the waiter serves from, and which way that faces them. */
  spot: { col: number; row: number } | null;
  face: Direction;
  order: WaiterOrder | null;
}

export function newWaiterRound(pauseSec: number): WaiterRound {
  return {
    phase: 'pause',
    timer: pauseSec,
    customer: null,
    spot: null,
    face: Direction.DOWN,
    order: null,
  };
}

/** The customer is waiting on the order (the waiter is off doing it). */
export function isWaitingOnOrder(r: WaiterRound): boolean {
  return (
    r.phase === 'wiping' ||
    r.phase === 'fetching' ||
    r.phase === 'preparing' ||
    r.phase === 'bringing'
  );
}

/** Someone the waiter can serve: seated with a drink, or playing at a gaming PC. */
export function isServable(ch: Character): boolean {
  return (ch.state === CharacterState.TYPE || ch.state === CharacterState.GAME) && !ch.matrixEffect;
}

/** The tiles next to a customer, with the direction that faces them. */
export function serveSpots(
  customer: Character,
): Array<{ col: number; row: number; face: Direction }> {
  const { tileCol: col, tileRow: row } = customer;
  return [
    { col, row: row + 1, face: Direction.UP },
    { col: col - 1, row, face: Direction.RIGHT },
    { col: col + 1, row, face: Direction.LEFT },
    { col, row: row - 1, face: Direction.DOWN },
  ];
}

/** Work in place (wiping, getting an order ready): the hands-moving sprite,
 *  two frames every `frameSec`. */
export function workInPlace(w: Character, face: Direction, frameSec: number): void {
  w.state = CharacterState.TYPE;
  w.dir = face;
  w.frame = Math.floor(w.frameTimer / frameSec) % 2;
}
