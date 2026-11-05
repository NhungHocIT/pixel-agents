/**
 * Characters keep out of each other's way (traffic.ts + the OfficeState gate),
 * and couples show hearts together.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { CHARACTER_NAMES } from '../src/constants.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import type { Character } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

type Tile = { col: number; row: number };

function settledOffice(...palettes: number[]): { office: OfficeState; agents: Character[] } {
  const office = new OfficeState();
  office.now = () => new Date(2026, 0, 5, 10, 0); // a work morning, not lunch
  palettes.forEach((p, i) => office.addAgent(i + 1, p, 0, undefined, true));
  const agents = [...office.characters.values()];
  return { office, agents };
}

/** Park `ch` on `t`, standing still for good. */
function park(ch: Character, t: Tile): void {
  ch.tileCol = t.col;
  ch.tileRow = t.row;
  ch.x = t.col * 16 + 8;
  ch.y = t.row * 16 + 8;
  ch.path = [];
  ch.moveProgress = 0;
  ch.state = CharacterState.IDLE;
  ch.isActive = false;
  ch.seatId = null;
  ch.restSpot = null;
  ch.wanderTimer = 1e9;
}

/** Three walkable tiles in a row, with the row below also walkable (a way round). */
function corridor(office: OfficeState): Tile[] {
  const open = new Set(office.walkableTiles.map((t) => `${t.col},${t.row}`));
  for (const t of office.walkableTiles) {
    const run = [0, 1, 2].map((d) => ({ col: t.col + d, row: t.row }));
    const below = [0, 1, 2].map((d) => ({ col: t.col + d, row: t.row + 1 }));
    if ([...run, ...below].every((x) => open.has(`${x.col},${x.row}`))) return run;
  }
  throw new Error('no open floor in the default layout');
}

test('a walker never steps onto someone standing in its way, and still gets there', () => {
  const { office, agents } = settledOffice(0, 1);
  const [stander, walker] = agents;
  const [from, mid, to] = corridor(office);
  park(stander, mid);
  park(walker, from);
  walker.path = [mid, to];
  walker.state = CharacterState.WALK;

  for (let i = 0; i < 400; i++) {
    office.update(0.05);
    assert.ok(
      !(walker.tileCol === stander.tileCol && walker.tileRow === stander.tileRow),
      'never on the same tile',
    );
    if (walker.state !== CharacterState.WALK) break;
  }
  assert.deepEqual([walker.tileCol, walker.tileRow], [to.col, to.row], 'went round');
  assert.deepEqual([stander.tileCol, stander.tileRow], [mid.col, mid.row]);
});

test('a wander whose last tile is taken stops short instead of piling on', () => {
  const { office, agents } = settledOffice(0, 1);
  const [stander, walker] = agents;
  const [from, mid] = corridor(office);
  park(stander, mid);
  park(walker, from);
  walker.path = [mid];
  walker.state = CharacterState.WALK;
  for (let i = 0; i < 100; i++) office.update(0.05);
  assert.deepEqual([walker.tileCol, walker.tileRow], [from.col, from.row]);
});

test('two characters stacked on one tile: one steps off', () => {
  const { office, agents } = settledOffice(0, 1);
  const [a, b] = agents;
  const [, mid] = corridor(office);
  park(a, mid);
  park(b, mid);
  for (let i = 0; i < 40; i++) office.update(0.05);
  // A street hello may hold them mid-step, but no closer than a tile apart
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 16 - 0.01, 'no longer stacked');
  const moved = [a, b].filter(
    (c) =>
      c.tileCol !== mid.col ||
      c.tileRow !== mid.row ||
      c.x !== mid.col * 16 + 8 ||
      c.y !== mid.row * 16 + 8,
  );
  assert.equal(moved.length, 1, 'only one of them steps off');
});

test('a couple close together show a heart at the same time', () => {
  const gray = CHARACTER_NAMES.indexOf('Gray');
  const juvia = CHARACTER_NAMES.indexOf('Juvia');
  const { office, agents } = settledOffice(gray, juvia);
  const [a, b] = agents;
  const [from, , to] = corridor(office);
  park(a, from);
  park(b, to);
  let both = false;
  for (let i = 0; i < 20 && !both; i++) {
    office.update(0.05);
    both = (a.heartTimer ?? 0) > 0 && (b.heartTimer ?? 0) > 0;
  }
  assert.ok(both, 'both hearts up together');
});

test('a couple far apart show no heart', () => {
  const gray = CHARACTER_NAMES.indexOf('Gray');
  const juvia = CHARACTER_NAMES.indexOf('Juvia');
  const { office, agents } = settledOffice(gray, juvia);
  const [a, b] = agents;
  const tiles = office.walkableTiles;
  const far = tiles.reduce((m, t) => (t.col + t.row > m.col + m.row ? t : m));
  park(a, tiles[0]);
  park(b, far);
  for (let i = 0; i < 20; i++) office.update(0.05);
  assert.equal(a.heartTimer ?? 0, 0);
  assert.equal(b.heartTimer ?? 0, 0);
});
