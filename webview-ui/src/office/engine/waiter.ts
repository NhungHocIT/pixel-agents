/**
 * The bar's waiter (WAITER_NAME): never a customer. Waits at the counter,
 * carries a drink to someone seated in the bar or playing in the game room,
 * has a word with them, and heads back for the next round.
 *
 * Pure helpers; OfficeState holds the round and drives it every frame.
 */
import type { Character } from '../types.js';
import { CharacterState, Direction } from '../types.js';

export interface WaiterRound {
  phase: 'pause' | 'toCustomer' | 'serving' | 'toCounter';
  /** Seconds left in `pause` / `serving`. */
  timer: number;
  customer: Character | null;
  /** Which way to face the customer on arrival. */
  face: Direction;
}

export function newWaiterRound(pauseSec: number): WaiterRound {
  return { phase: 'pause', timer: pauseSec, customer: null, face: Direction.DOWN };
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
