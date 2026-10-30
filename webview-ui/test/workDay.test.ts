/**
 * The working day: at work everyone but the waiter stays in the game room
 * (agents at the computers), at lunch everyone goes to the bar, and after it
 * they come back.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { afterEach, test } from 'vitest';

import { CHARACTER_NAMES, WAITER_NAME } from '../src/constants.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { dayPhaseAt } from '../src/office/engine/workSchedule.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type {
  Character,
  OfficeLayout,
  SpriteData,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';

const WAITER = CHARACTER_NAMES.indexOf(WAITER_NAME);

function at(h: number, m: number): Date {
  return new Date(2026, 9, 30, h, m);
}

test('the day: work, lunch at the bar, free after it, the afternoon break', () => {
  assert.equal(dayPhaseAt(at(7, 59)), 'free');
  assert.equal(dayPhaseAt(at(8, 0)), 'work');
  assert.equal(dayPhaseAt(at(12, 1)), 'work');
  assert.equal(dayPhaseAt(at(12, 2)), 'lunch');
  assert.equal(dayPhaseAt(at(12, 31)), 'lunch');
  assert.equal(dayPhaseAt(at(12, 32)), 'free');
  assert.equal(dayPhaseAt(at(13, 34)), 'free');
  assert.equal(dayPhaseAt(at(13, 35)), 'work');
  assert.equal(dayPhaseAt(at(15, 30)), 'free');
  assert.equal(dayPhaseAt(at(15, 45)), 'work');
  assert.equal(dayPhaseAt(at(17, 59)), 'work');
  assert.equal(dayPhaseAt(at(18, 0)), 'free');
});

// ── A small office: the bar on the left (FLOOR_1), the game room on the right
// (FLOOR_2), open between them ─────────────────────────────────────────────
const COLS = 16;
const ROWS = 8;
const BAR = TileType.FLOOR_1;
const ROOM = TileType.FLOOR_2;

function loadCatalog(): void {
  const sprite: SpriteData = Array.from({ length: 16 }, () => new Array<string>(16).fill(''));
  const item = (id: string, category: string, isDesk = false) => ({
    id,
    label: id,
    category,
    width: 16,
    height: 16,
    footprintW: 1,
    footprintH: 1,
    isDesk,
  });
  const catalog = [
    item('DESK', 'desks', true),
    item('CHAIR', 'chairs'),
    item('GAMING_CHAIR', 'misc'),
    item('SOFA_FRONT', 'chairs'),
  ];
  buildDynamicCatalog({ catalog, sprites: Object.fromEntries(catalog.map((c) => [c.id, sprite])) });
}

function loadCast(): void {
  const frame: SpriteData = Array.from({ length: 32 }, () => new Array<string>(16).fill(''));
  const dir = () => new Array<SpriteData>(7).fill(frame);
  setCharacterTemplates(CHARACTER_NAMES.map(() => ({ down: dir(), up: dir(), right: dir() })));
}

function layout(): OfficeLayout {
  const tiles: TileTypeVal[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) tiles.push(c < 8 ? BAR : ROOM);
  const f = (uid: string, type: string, col: number, row: number) => ({ uid, type, col, row });
  return {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles,
    furniture: [
      f('bar-desk', 'DESK', 2, 3),
      f('bar-chair-a', 'CHAIR', 2, 4),
      f('bar-chair-b', 'CHAIR', 2, 2),
      f('pc-desk-a', 'DESK', 11, 3),
      f('pc-a', 'GAMING_CHAIR', 11, 4),
      f('pc-desk-b', 'DESK', 13, 3),
      f('pc-b', 'GAMING_CHAIR', 13, 4),
      f('sofa', 'SOFA_FRONT', 12, 7),
    ],
  };
}

afterEach(() => setCharacterTemplates([]));

function floorOf(office: OfficeState, ch: Character): number | undefined {
  return office.tileMap[ch.tileRow]?.[ch.tileCol];
}

function run(office: OfficeState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) office.update(0.1);
}

/** Everyone the day applies to: the agents and the patrons but the waiter. */
function crowd(office: OfficeState): Character[] {
  return office.getDrawnCharacters().filter((ch) => ch.palette !== WAITER || ch.id < 1_000_000);
}

test('at work agents work at the computers and everyone stays in the game room', () => {
  loadCatalog();
  loadCast();
  const office = new OfficeState(layout());
  office.now = () => at(10, 0);
  office.addAgent(1, undefined, undefined, 'bar-chair-a', true); // restored at the bar
  run(office, 300);

  const agent = office.characters.get(1)!;
  assert.ok(agent.seatId?.startsWith('pc-'), `agent moved to a computer, not ${agent.seatId}`);
  assert.equal(agent.state, CharacterState.TYPE, 'and works there');
  for (const ch of crowd(office)) {
    if (ch.state === CharacterState.WALK) continue;
    assert.equal(floorOf(office, ch), ROOM, `${ch.id} is in the game room`);
  }
});

test('at lunch everyone eats at the bar, and is back in the game room after', () => {
  loadCatalog();
  loadCast();
  const office = new OfficeState(layout());
  office.now = () => at(11, 50);
  office.addAgent(1, undefined, undefined, undefined, true);
  run(office, 120);

  office.now = () => at(12, 5);
  run(office, 120);
  const eaters = crowd(office);
  assert.ok(eaters.length > 2, 'patrons are about');
  for (const ch of eaters) {
    assert.equal(floorOf(office, ch), BAR, `${ch.id} is at the bar`);
  }
  const seated = eaters.filter((ch) => ch.state === CharacterState.TYPE);
  assert.equal(seated.length, 2, 'both bar seats are taken');

  office.now = () => at(13, 40);
  run(office, 300);
  const agent = office.characters.get(1)!;
  assert.ok(agent.seatId?.startsWith('pc-'), 'the agent keeps its computer');
  for (const ch of crowd(office)) {
    if (ch.state === CharacterState.WALK) continue;
    assert.equal(floorOf(office, ch), ROOM, `${ch.id} is back in the game room`);
  }
});
