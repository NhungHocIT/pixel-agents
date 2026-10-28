import {
  EXERCISE_BEAT_SEC,
  EXERCISE_MOVE_SEC,
  EXERCISE_WORKOUT_SEC,
  WANDER_PAUSE_MIN_SEC,
} from '../../constants.js';
import type { Character } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import type { ExerciseMoveName } from './dialogues.js';
import { EXERCISE, randomOf } from './dialogues.js';
import { snapToTile, startWalk, stepWalk } from './walking.js';

/** The moves of a workout, each held for EXERCISE_MOVE_SEC, then the next. */
export type ExerciseMove = ExerciseMoveName;
const MOVES: ExerciseMove[] = ['jump', 'twist', 'squat', 'march'];

/** An exercise break in progress: everyone walks to the line (gather), then
 *  works out together for EXERCISE_WORKOUT_SEC. Owned by OfficeState. */
export interface ExerciseSession {
  phase: 'gather' | 'workout';
  /** Seconds into the current phase. */
  timer: number;
  members: Character[];
  /** TNhunn (the owner), out in front of the line calling the moves (null: not here). */
  coach: Character | null;
  /** Seconds until the next round of calls / replies. */
  chatTimer: number;
}

/** Seconds each round of calls and replies stays up. */
const EXERCISE_CHAT_SEC = 4;

/** Speech during the break: the coach calls (or, with TNhunn not here, whoever
 *  leads the line) and one or two others answer now and then. */
export function updateExerciseChatter(ex: ExerciseSession, dt: number): void {
  ex.chatTimer -= dt;
  if (ex.chatTimer > 0) return;
  ex.chatTimer = EXERCISE_CHAT_SEC;
  for (const ch of ex.members) ch.speech = null;
  const leader = ex.coach ?? ex.members[0];
  if (!leader) return;
  const others = ex.members.filter((ch) => ch !== leader);
  if (ex.phase === 'gather') {
    leader.speech = randomOf(EXERCISE.gatherCalls);
    if (others.length > 0) randomOf(others).speech = randomOf(EXERCISE.gatherReplies);
    return;
  }
  if (ex.timer >= EXERCISE_WORKOUT_SEC - EXERCISE_CHAT_SEC) {
    leader.speech = EXERCISE.finish; // the last round: wrap up
    return;
  }
  leader.speech = randomOf(EXERCISE.moveCalls[exerciseMove(leader).move]);
  for (let i = 0; i < 2 && others.length > 0; i++) {
    if (Math.random() < 0.5) continue;
    const who = others.splice(Math.floor(Math.random() * others.length), 1)[0];
    who.speech = randomOf(EXERCISE.workoutReplies);
  }
}

/** Which move the character is doing right now, and the beat within it. */
export function exerciseMove(ch: Character): { move: ExerciseMove; beat: number } {
  const t = ch.exerciseTimer ?? 0;
  return {
    move: MOVES[Math.floor(t / EXERCISE_MOVE_SEC) % MOVES.length],
    beat: Math.floor(t / EXERCISE_BEAT_SEC),
  };
}

/** Line-up tiles for `count` people: the longest horizontal run of walkable
 *  tiles (closest to `near` on ties), one tile apart when it fits. Overflow
 *  goes into further rows, preferring ones that leave a row free in between.
 *  May return fewer slots than asked when the floor is too small. */
export function pickLineSlots(
  count: number,
  walkableTiles: Array<{ col: number; row: number }>,
  near: { col: number; row: number },
): Array<{ col: number; row: number }> {
  const colsByRow = new Map<number, number[]>();
  for (const t of walkableTiles) {
    const cols = colsByRow.get(t.row) ?? [];
    cols.push(t.col);
    colsByRow.set(t.row, cols);
  }
  const runs: Array<{ row: number; start: number; len: number }> = [];
  for (const [row, cols] of colsByRow) {
    cols.sort((a, b) => a - b);
    let start = cols[0];
    for (let i = 1; i <= cols.length; i++) {
      if (i < cols.length && cols[i] === cols[i - 1] + 1) continue;
      runs.push({ row, start, len: cols[i - 1] - start + 1 });
      start = cols[i];
    }
  }
  if (runs.length === 0) return [];

  const dist = (r: { row: number; start: number; len: number }) =>
    Math.abs(r.row - near.row) + Math.abs(r.start + (r.len - 1) / 2 - near.col);
  runs.sort((a, b) => b.len - a.len || dist(a) - dist(b));
  const main = runs[0];
  const gap = main.len >= count * 2 - 1 ? 2 : 1;
  const rowRank = (r: { row: number }) => {
    const d = Math.abs(r.row - main.row);
    return d === 1 ? 1.5 : d;
  };
  const ordered = [main, ...runs.slice(1).sort((a, b) => rowRank(a) - rowRank(b) || b.len - a.len)];

  const slots: Array<{ col: number; row: number }> = [];
  for (const run of ordered) {
    const take = Math.min(Math.floor((run.len - 1) / gap) + 1, count - slots.length);
    const first = run.start + Math.floor((run.len - 1 - (take - 1) * gap) / 2);
    for (let i = 0; i < take; i++) slots.push({ col: first + i * gap, row: run.row });
    if (slots.length >= count) break;
  }
  return slots;
}

/** Per-frame update for a member of the break: walk to the line, stand
 *  facing front until the workout starts, then work out. */
export function updateExerciser(ch: Character, dt: number): void {
  ch.frameTimer += dt;
  if (ch.state === CharacterState.EXERCISE) {
    ch.exerciseTimer = (ch.exerciseTimer ?? 0) + dt;
    return;
  }
  stepWalk(ch, dt, ch.exerciseFacing ?? Direction.DOWN);
}

/** A spot in the exercise rows; `shiftPx` nudges a packed back-row spot right
 *  by half a tile so it sits between the two in front. */
export interface ExerciseSlot {
  col: number;
  row: number;
  shiftPx?: number;
}

/** Two staggered rows on the pickleball court, facing down toward the coach
 *  below it: the front row on the court's lower middle row, the back row just
 *  above, each back spot in the gap between two front ones. Rows span the
 *  walkable floor across the court's row (the court room), centred on the
 *  court. A tile apart when everyone fits that way; otherwise shoulder to
 *  shoulder with the back row half a tile over; anyone left over in a third
 *  row behind. Front row first in the result. */
export function pickCourtRows(
  count: number,
  court: { col: number; row: number; w: number; h: number },
  walkableTiles: Array<{ col: number; row: number }>,
): ExerciseSlot[] {
  const centre = court.col + Math.floor(court.w / 2);
  /** The run of walkable columns on `row` through the court's middle. */
  const run = (row: number): [number, number] | null => {
    const cols = new Set(walkableTiles.filter((t) => t.row === row).map((t) => t.col));
    if (!cols.has(centre)) return null;
    let lo = centre;
    let hi = centre;
    while (cols.has(lo - 1)) lo--;
    while (cols.has(hi + 1)) hi++;
    return [lo, hi];
  };
  /** Up to `n` columns `gap` apart in [lo, hi], centred on the court. */
  const spread = ([lo, hi]: [number, number], n: number, gap: number) => {
    const take = Math.min(n, Math.floor((hi - lo) / gap) + 1);
    if (take <= 0) return [];
    const width = (take - 1) * gap;
    const first = Math.max(lo, Math.min(Math.round(centre - width / 2), hi - width));
    return Array.from({ length: take }, (_, i) => first + i * gap);
  };

  const frontRow = court.row + Math.floor(court.h / 2);
  const backRow = frontRow - 1;
  const front = run(frontRow);
  const back = run(backRow);
  if (!front || !back) return [];

  // A tile apart, the back row one tile over in the gaps — if everyone fits
  const shared: [number, number] = [Math.max(front[0], back[0]), Math.min(front[1], back[1]) - 1];
  const frontCols = spread(shared, Math.ceil(count / 2), 2);
  if (frontCols.length * 2 >= count) {
    return [
      ...frontCols.map((col) => ({ col, row: frontRow })),
      ...frontCols
        .slice(0, count - frontCols.length)
        .map((col) => ({ col: col + 1, row: backRow })),
    ];
  }

  // Shoulder to shoulder, the back row half a tile over; the rest behind
  const slots: ExerciseSlot[] = spread(front, Math.ceil(count / 2), 1).map((col) => ({
    col,
    row: frontRow,
  }));
  const backSpan: [number, number] = [back[0], back[1] - 1]; // the half-tile shift needs room
  for (const col of spread(backSpan, count - slots.length, 1)) {
    slots.push({ col, row: backRow, shiftPx: TILE_SIZE / 2 });
  }
  const extra = run(backRow - 1);
  if (extra && slots.length < count) {
    for (const col of spread(extra, count - slots.length, 1)) slots.push({ col, row: backRow - 1 });
  }
  return slots;
}

/** Head for the line along `path` (empty: already there or unreachable —
 *  exercise on the spot), to face `facing` once there, standing `shiftPx`
 *  right of the tile centre while working out. */
export function joinExercise(
  ch: Character,
  path: Array<{ col: number; row: number }>,
  facing: Direction = Direction.DOWN,
  shiftPx = 0,
): void {
  startWalk(ch, path, facing);
  ch.exerciseFacing = facing;
  ch.exerciseShiftPx = shiftPx;
  ch.lostDetours = 0;
  ch.exerciseTimer = 0;
}

/** The line has formed (or the wait ran out): everyone starts where they stand. */
export function beginWorkout(ch: Character): void {
  snapToTile(ch);
  ch.x += ch.exerciseShiftPx ?? 0;
  ch.path = [];
  ch.state = CharacterState.EXERCISE;
  ch.dir = ch.exerciseFacing ?? Direction.DOWN;
  ch.frame = 0;
  ch.frameTimer = 0;
  ch.exerciseTimer = 0;
}

/** Break over: back to the normal FSM (IDLE heads to the seat, bed or a wander). */
export function endWorkout(ch: Character): void {
  snapToTile(ch);
  ch.path = [];
  ch.state = CharacterState.IDLE;
  ch.frame = 0;
  ch.frameTimer = 0;
  ch.exerciseTimer = undefined;
  ch.exerciseFacing = undefined;
  ch.exerciseShiftPx = undefined;
  ch.seatTimer = 0;
  ch.wanderTimer = Math.random() * WANDER_PAUSE_MIN_SEC;
}
