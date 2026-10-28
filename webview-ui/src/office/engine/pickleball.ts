/**
 * Pickleball: two characters who agreed to play walk onto the court, one each
 * side of the net, and rally — the ball arcs over the net, the other runs up or
 * down to meet it and hits it back. Owned by OfficeState, which takes the
 * players off their normal FSM for the length of the game.
 */
import {
  PICKLEBALL_ARC_PX,
  PICKLEBALL_BALL_COLOR,
  PICKLEBALL_BALL_RIM_COLOR,
  PICKLEBALL_CHAT_SEC,
  PICKLEBALL_GAME_SEC,
  PICKLEBALL_GATHER_MAX_SEC,
  PICKLEBALL_HIT_HEIGHT_PX,
  PICKLEBALL_SHADOW_COLOR,
  PICKLEBALL_SHOT_SEC,
  WANDER_PAUSE_MIN_SEC,
} from '../../constants.js';
import type { Character, FurnitureInstance, SpriteData } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import { PICKLEBALL, randomOf } from './dialogues.js';
import { snapToTile, startWalk, stepWalk } from './walking.js';

interface Tile {
  col: number;
  row: number;
}

/** The court's footprint, in tiles. */
export interface PickleballCourt {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface PickleballGame {
  /** [left of the net, right of the net] */
  players: [Character, Character];
  court: PickleballCourt;
  phase: 'gather' | 'play';
  /** Seconds into the current phase. */
  timer: number;
  /** The ball in flight: struck by players[by], from one tile to the other, `t` 0..1. */
  shot: { by: 0 | 1; from: Tile; to: Tile; t: number } | null;
  /** Seconds until the next call. */
  chatTimer: number;
}

/** Where each player stands to start: a tile in from either baseline, mid-court. */
export function courtSides(court: PickleballCourt): [Tile, Tile] {
  const row = court.row + Math.floor(court.h / 2);
  return [
    { col: court.col + 1, row },
    { col: court.col + court.w - 2, row },
  ];
}

/** Facing the net from each side. */
const FACING: [Direction, Direction] = [Direction.RIGHT, Direction.LEFT];

/** Both head for their side along the given paths (empty: stay put). */
export function startPickleball(
  players: [Character, Character],
  court: PickleballCourt,
  paths: [Tile[], Tile[]],
): PickleballGame {
  players.forEach((ch, i) => {
    startWalk(ch, paths[i], FACING[i]);
    ch.speech = null;
  });
  return { players, court, phase: 'gather', timer: 0, shot: null, chatTimer: 0 };
}

/** Straight up or down the player's column to `row`. */
function runTo(ch: Character, row: number): Tile[] {
  const path: Tile[] = [];
  const step = row > ch.tileRow ? 1 : -1;
  for (let r = ch.tileRow; r !== row;) {
    r += step;
    path.push({ col: ch.tileCol, row: r });
  }
  return path;
}

/** Hit it across: to a random row on the other side, where the other runs to meet it. */
function hit(game: PickleballGame, by: 0 | 1): void {
  const striker = game.players[by];
  const other = game.players[by === 0 ? 1 : 0];
  const row = game.court.row + Math.floor(Math.random() * game.court.h);
  const to = { col: other.tileCol, row };
  game.shot = { by, from: { col: striker.tileCol, row: striker.tileRow }, to, t: 0 };
  startWalk(other, runTo(other, row), FACING[by === 0 ? 1 : 0]);
  striker.dir = FACING[by];
}

/** One frame of the game. Returns false once it is over (time up, after a
 *  rally ends, or nobody made it to the court). */
export function updatePickleball(game: PickleballGame, dt: number): boolean {
  game.timer += dt;
  game.players.forEach((ch, i) => {
    ch.frameTimer += dt;
    stepWalk(ch, dt, FACING[i]);
  });

  if (game.phase === 'gather') {
    const ready = game.players.every((ch) => ch.state !== CharacterState.WALK);
    if (!ready && game.timer < PICKLEBALL_GATHER_MAX_SEC) return true;
    game.phase = 'play';
    game.timer = 0;
    hit(game, 0);
  }

  const shot = game.shot!;
  shot.t += dt / PICKLEBALL_SHOT_SEC;
  if (shot.t >= 1) {
    if (game.timer >= PICKLEBALL_GAME_SEC) return false;
    hit(game, shot.by === 0 ? 1 : 0);
  }

  game.chatTimer -= dt;
  if (game.chatTimer <= 0) {
    game.chatTimer = PICKLEBALL_CHAT_SEC;
    const last = game.timer >= PICKLEBALL_GAME_SEC - PICKLEBALL_CHAT_SEC;
    const speaker = randomOf(game.players);
    for (const ch of game.players) {
      ch.speech = ch === speaker ? (last ? PICKLEBALL.finish : randomOf(PICKLEBALL.rally)) : null;
    }
  }
  return true;
}

/** Game over: back to the normal FSM where they stand. */
export function endPickleball(game: PickleballGame): void {
  for (const ch of game.players) {
    snapToTile(ch);
    ch.path = [];
    ch.state = CharacterState.IDLE;
    ch.frame = 0;
    ch.frameTimer = 0;
    ch.speech = null;
    ch.wanderTimer = Math.random() * WANDER_PAUSE_MIN_SEC;
  }
}

const B = PICKLEBALL_BALL_COLOR;
const R = PICKLEBALL_BALL_RIM_COLOR;
const S = PICKLEBALL_SHADOW_COLOR;
const BALL: SpriteData = [
  ['', R, ''],
  [R, B, R],
  ['', R, ''],
];
const SHADOW: SpriteData = [[S, S, S]];

/** The ball in the air and its shadow on the ground (nothing between games). */
export function ballInstances(game: PickleballGame | null): FurnitureInstance[] {
  const shot = game?.shot;
  if (!shot) return [];
  const t = Math.min(shot.t, 1);
  const cx = (shot.from.col + 0.5 + (shot.to.col - shot.from.col) * t) * TILE_SIZE;
  const groundY = (shot.from.row + 0.5 + (shot.to.row - shot.from.row) * t) * TILE_SIZE;
  const height = PICKLEBALL_HIT_HEIGHT_PX + Math.sin(Math.PI * t) * PICKLEBALL_ARC_PX;
  const x = Math.round(cx - 1);
  return [
    { sprite: SHADOW, x, y: Math.round(groundY), zY: groundY },
    { sprite: BALL, x, y: Math.round(groundY - height - 1), zY: groundY + TILE_SIZE },
  ];
}
