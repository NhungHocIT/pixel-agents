/**
 * Pickleball: characters who agreed to play walk onto the court, a team each
 * side of the net — one a side (singles) or two (doubles) — and rally: the ball
 * arcs over the net, whoever covers that part of the court runs up or down to
 * meet it and hits it back. Owned by OfficeState, which takes the players off
 * their normal FSM for the length of the game.
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

type Side = 0 | 1;

/** The court's footprint, in tiles. */
export interface PickleballCourt {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface PickleballGame {
  /** [left of the net, right of the net]: one player each (singles) or two (doubles). */
  teams: [Character[], Character[]];
  /** Everyone on court, left team first. */
  players: Character[];
  court: PickleballCourt;
  phase: 'gather' | 'play';
  /** Seconds into the current phase. */
  timer: number;
  /** The ball in flight: struck by `by` (on side `side`), from one tile to the other, `t` 0..1. */
  shot: { side: Side; by: Character; from: Tile; to: Tile; t: number } | null;
  /** Seconds until the next call. */
  chatTimer: number;
  /** The lines being said: line i by speakers[i % speakers.length]. */
  talk: { lines: readonly string[]; index: number; speakers: Character[] } | null;
}

/** Each side's starting tiles, a tile in from the baseline: mid-court for one
 *  player, one per half (top and bottom) for two. */
export function courtSpots(court: PickleballCourt, perSide: number): [Tile[], Tile[]] {
  const rows =
    perSide === 1
      ? [court.row + Math.floor(court.h / 2)]
      : [court.row + Math.floor(court.h / 4), court.row + Math.floor((3 * court.h) / 4)];
  const at = (col: number) => rows.map((row) => ({ col, row }));
  return [at(court.col + 1), at(court.col + court.w - 2)];
}

/** Facing the net from each side. */
const FACING: [Direction, Direction] = [Direction.RIGHT, Direction.LEFT];

const sideOf = (game: PickleballGame, ch: Character): Side => (game.teams[0].includes(ch) ? 0 : 1);

/** Everyone heads for their spot along the given paths (one per player, in
 *  `players` order; empty: stay put). */
export function startPickleball(
  teams: [Character[], Character[]],
  court: PickleballCourt,
  paths: Tile[][],
): PickleballGame {
  const players = [...teams[0], ...teams[1]];
  const game: PickleballGame = {
    teams,
    players,
    court,
    phase: 'gather',
    timer: 0,
    shot: null,
    chatTimer: 0,
    talk: null,
  };
  players.forEach((ch, i) => {
    startWalk(ch, paths[i] ?? [], FACING[sideOf(game, ch)]);
    ch.speech = null;
  });
  return game;
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

/** Which of the team covers `row`: in doubles the top player takes the top
 *  half of the court, the bottom player the bottom half. */
function coverer(game: PickleballGame, side: Side, row: number): Character {
  const team = game.teams[side];
  if (team.length === 1) return team[0];
  const [top, bottom] = [...team].sort((a, b) => a.tileRow - b.tileRow);
  return row < game.court.row + game.court.h / 2 ? top : bottom;
}

/** `by` hits it across: to a random row on the other side, where whoever
 *  covers it runs to meet it. */
function hit(game: PickleballGame, by: Character): void {
  const side = sideOf(game, by);
  const otherSide: Side = side === 0 ? 1 : 0;
  const row = game.court.row + Math.floor(Math.random() * game.court.h);
  const receiver = coverer(game, otherSide, row);
  const to = { col: receiver.tileCol, row };
  game.shot = { side, by, from: { col: by.tileCol, row: by.tileRow }, to, t: 0 };
  startWalk(receiver, runTo(receiver, row), FACING[otherSide]);
  by.dir = FACING[side];
}

/** One frame of the game. Returns false once it is over (time up, after a
 *  rally ends). */
export function updatePickleball(game: PickleballGame, dt: number): boolean {
  game.timer += dt;
  for (const ch of game.players) {
    ch.frameTimer += dt;
    stepWalk(ch, dt, FACING[sideOf(game, ch)]);
  }

  if (game.phase === 'gather') {
    const ready = game.players.every((ch) => ch.state !== CharacterState.WALK);
    if (!ready && game.timer < PICKLEBALL_GATHER_MAX_SEC) return true;
    game.phase = 'play';
    game.timer = 0;
    const server = game.teams[0][0];
    hit(game, server);
    // The server opens with a line, someone across the net answers
    game.talk = {
      lines: randomOf(PICKLEBALL.start),
      index: 0,
      speakers: [server, randomOf(game.teams[1])],
    };
    game.chatTimer = PICKLEBALL_CHAT_SEC;
    voice(game);
  }

  const shot = game.shot!;
  shot.t += dt / PICKLEBALL_SHOT_SEC;
  if (shot.t >= 1) {
    if (game.timer >= PICKLEBALL_GAME_SEC) return false;
    // Whoever ran to meet it hits it back
    const otherSide: Side = shot.side === 0 ? 1 : 0;
    hit(game, coverer(game, otherSide, shot.to.row));
  }

  game.chatTimer -= dt;
  if (game.chatTimer <= 0) talkOn(game);
  return true;
}

/** The next line: carry on what is being said, else start something new — the
 *  wrap-up near the end, otherwise (in doubles, sometimes between partners) a
 *  call and answer, or a lone call. */
function talkOn(game: PickleballGame): void {
  game.chatTimer = PICKLEBALL_CHAT_SEC;
  const lastTwo = game.timer >= PICKLEBALL_GAME_SEC - 2 * PICKLEBALL_CHAT_SEC;
  const talk = game.talk;
  if (talk && talk.index + 1 < talk.lines.length) {
    talk.index++;
  } else if (lastTwo && talk && PICKLEBALL.finish.includes(talk.lines)) {
    // Said goodbye already: quiet until the game ends
    for (const ch of game.players) ch.speech = null;
    return;
  } else {
    const first = randomOf(game.players);
    const side = sideOf(game, first);
    const partner = game.teams[side].find((ch) => ch !== first);
    const across = randomOf(game.teams[side === 0 ? 1 : 0]);
    let lines: readonly string[];
    let second = across;
    if (lastTwo) {
      lines = randomOf(PICKLEBALL.finish);
    } else if (partner && Math.random() < 0.35) {
      lines = randomOf(PICKLEBALL.partners);
      second = partner;
    } else if (Math.random() < 0.5) {
      lines = randomOf(PICKLEBALL.exchanges);
    } else {
      lines = [randomOf(PICKLEBALL.rally)];
    }
    game.talk = { lines, index: 0, speakers: [first, second] };
  }
  voice(game);
}

/** Put the current line over whoever's turn it is to say it. */
function voice(game: PickleballGame): void {
  const talk = game.talk!;
  const speaker = talk.speakers[talk.index % talk.speakers.length];
  for (const ch of game.players) ch.speech = ch === speaker ? talk.lines[talk.index] : null;
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
