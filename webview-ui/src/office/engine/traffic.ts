/**
 * Traffic between characters: nobody walks into a tile someone is standing on
 * or stepping into. The two walk loops (updateCharacter for the normal FSM,
 * stepWalk for scripted walks) ask `mayStep` before each new step; OfficeState
 * installs the rule (it knows where everyone is) with `setTrafficGate`.
 *
 * Kept free of OfficeState so the walk loops stay testable without it.
 */
import type { Character } from '../types.js';
import { CharacterState } from '../types.js';

/** Wait this long behind someone before looking for a way round. */
export const TRAFFIC_DETOUR_AFTER_SEC = 0.4;
/** A free-roaming walk whose last tile is taken stops short after this long. */
export const TRAFFIC_GIVE_UP_SEC = 1.2;
/** After this long stuck (a head-on jam nobody can step out of), go through anyway. */
export const TRAFFIC_PASS_THROUGH_SEC = 3;

/** `scripted`: a walk that must arrive (exercise line, lunch seat, waiter,
 *  pickleball) — it never stops short, it waits or goes round. */
export type TrafficGate = (ch: Character, dt: number, scripted: boolean) => boolean;

let gate: TrafficGate | null = null;

export function setTrafficGate(fn: TrafficGate | null): void {
  gate = fn;
}

/** Called by a walker at the start of each step (moveProgress 0). False: hold
 *  still this frame. The gate may also re-route (change `ch.path`) or end the
 *  walk early (empty `ch.path`) — callers re-read the path afterwards. */
export function mayStep(ch: Character, dt: number, scripted: boolean): boolean {
  return gate ? gate(ch, dt, scripted) : true;
}

type Tile = { col: number; row: number };
const key = (t: Tile) => `${t.col},${t.row}`;

/** The tiles `other` holds right now: where it stands, plus the tile it is
 *  stepping into once it has started that step. */
export function heldTiles(other: Character): Tile[] {
  const here = { col: other.tileCol, row: other.tileRow };
  const next = other.path[0];
  if (other.state === CharacterState.WALK && next && other.moveProgress > 0) return [here, next];
  return [here];
}

/** Who keeps `ch` out of `tile`: someone standing there, or stepping into it. */
export function blockerOf(
  ch: Character,
  tile: Tile,
  others: Iterable<Character>,
): Character | null {
  const k = key(tile);
  for (const o of others) {
    if (o === ch) continue;
    if (heldTiles(o).some((t) => key(t) === k)) return o;
  }
  return null;
}

/** Tiles held by everyone but `ch` (for routing round them). */
export function heldBy(ch: Character, others: Iterable<Character>): Set<string> {
  const out = new Set<string>();
  for (const o of others) {
    if (o === ch) continue;
    for (const t of heldTiles(o)) out.add(key(t));
  }
  return out;
}
