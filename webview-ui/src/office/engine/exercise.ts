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

/** A spot in the exercise line; `shiftX`/`shiftY` nudge a packed spot half a
 *  tile so it sits in the gap beside the line next to it. */
export interface ExerciseSlot {
  col: number;
  row: number;
  shiftX?: number;
  shiftY?: number;
}

/** Two staggered lines down the screen on the pickleball court, one either
 *  side of the net and a tile clear of it (nobody stands on the net), all
 *  facing down toward the coach, who stands below them facing up. The right
 *  line stands level with the gaps in the left one: a tile apart when everyone
 *  fits that way, otherwise one behind another with the right line half a
 *  tile lower. Each line runs the walkable floor in its column through the
 *  court, minus the rows left free for the coach. Null without room. */
export function pickCourtColumns(
  count: number,
  court: { col: number; row: number; w: number; h: number },
  walkableTiles: Array<{ col: number; row: number }>,
): { slots: ExerciseSlot[]; coach: { col: number; row: number } } | null {
  const walkable = new Set(walkableTiles.map((t) => `${t.col},${t.row}`));
  const open = (col: number, row: number) => walkable.has(`${col},${row}`);
  const mid = court.row + Math.floor(court.h / 2);
  /** The walkable run in `col` through the court's middle row. */
  const run = (col: number): [number, number] | null => {
    if (!open(col, mid)) return null;
    let top = mid;
    let bottom = mid;
    while (open(col, top - 1)) top--;
    while (open(col, bottom + 1)) bottom++;
    return [top, bottom];
  };
  // The net runs down the middle of the court, between tiles netLeft and
  // netLeft + 1; each line keeps the tile beside the net free
  const netLeft = court.col + Math.floor(court.w / 2) - 1;
  const left = netLeft - 1;
  const right = netLeft + 2;
  const leftRun = run(left);
  const rightRun = run(right);
  if (!leftRun || !rightRun) return null;
  // The coach stands two rows below the lines, under the net
  const bottom = Math.min(leftRun[1], rightRun[1]);
  const top = Math.max(leftRun[0], rightRun[0]);
  const coachRow = bottom;
  const last = coachRow - 2; // the lines' lowest row
  if (last < top) return null;
  const coach = { col: netLeft, row: coachRow };
  const rows = (from: number, gap: number, n: number) => {
    const out: number[] = [];
    for (let r = last - from; r >= top && out.length < n; r -= gap) out.push(r);
    return out.reverse();
  };

  // A tile apart, the right line in the left one's gaps — if everyone fits
  const leftRows = rows(0, 2, Math.ceil(count / 2));
  const rightRows = rows(1, 2, count - leftRows.length);
  if (leftRows.length + rightRows.length >= count) {
    return {
      slots: [
        ...leftRows.map((row) => ({ col: left, row })),
        ...rightRows.map((row) => ({ col: right, row })),
      ],
      coach,
    };
  }

  // One behind another, the right line half a tile lower
  const packedLeft = rows(0, 1, Math.ceil(count / 2));
  const packedRight = rows(0, 1, count - packedLeft.length);
  return {
    slots: [
      ...packedLeft.map((row) => ({ col: left, row })),
      ...packedRight.map((row) => ({ col: right, row, shiftY: TILE_SIZE / 2 })),
    ],
    coach,
  };
}

/** Head for the line along `path` (empty: already there or unreachable —
 *  exercise on the spot), to face `facing` once there, standing `shift` px off
 *  the tile centre while working out. */
export function joinExercise(
  ch: Character,
  path: Array<{ col: number; row: number }>,
  facing: Direction = Direction.DOWN,
  shift: { x?: number; y?: number } = {},
): void {
  startWalk(ch, path, facing);
  ch.exerciseFacing = facing;
  ch.exerciseShift = { x: shift.x ?? 0, y: shift.y ?? 0 };
  ch.lostDetours = 0;
  ch.exerciseTimer = 0;
}

/** The line has formed (or the wait ran out): everyone starts where they stand. */
export function beginWorkout(ch: Character): void {
  snapToTile(ch);
  ch.x += ch.exerciseShift?.x ?? 0;
  ch.y += ch.exerciseShift?.y ?? 0;
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
  ch.exerciseShift = undefined;
  ch.seatTimer = 0;
  ch.wanderTimer = Math.random() * WANDER_PAUSE_MIN_SEC;
}
