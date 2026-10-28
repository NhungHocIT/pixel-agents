/**
 * Invites and tables: a chat can be one patron asking another along, and a
 * yes sends both off together; seats know their table, and beer takes two or
 * more at one table.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test, vi } from 'vitest';

// No bar patrons: they would pick seats at the test table on their own.
vi.mock('../src/office/sprites/spriteData.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/office/sprites/spriteData.js')>()),
  getLoadedCharacterCount: () => 0,
}));

import type { BarChat } from '../src/office/engine/barChat.js';
import { updateChats } from '../src/office/engine/barChat.js';
import { createCharacter } from '../src/office/engine/characters.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import type { LoadedAssetData } from '../src/office/layout/furnitureCatalog.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { layoutToSeats } from '../src/office/layout/layoutSerializer.js';
import type { OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';

type CatalogAsset = LoadedAssetData['catalog'][number];

function asset(id: string, w: number, h: number, extra: Partial<CatalogAsset>): CatalogAsset {
  return {
    id,
    label: id,
    category: 'misc',
    width: w * 16,
    height: h * 16,
    footprintW: w,
    footprintH: h,
    isDesk: false,
    ...extra,
  };
}

beforeAll(() => {
  const catalog = [
    asset('TABLE', 2, 1, { isDesk: true }),
    asset('CHAIR', 1, 1, { category: 'chairs' }),
  ];
  const sprites = Object.fromEntries(catalog.map((a) => [a.id, [['']]]));
  assert.ok(buildDynamicCatalog({ catalog, sprites }));
});

function patron(id: number, col: number) {
  const ch = createCharacter(id, id, null, null);
  ch.tileCol = col;
  ch.tileRow = 5;
  ch.state = CharacterState.IDLE;
  return ch;
}

/** Run a chat to its end, returning the chats handed to onAccepted. */
function runInvite(accepted: boolean): BarChat[] {
  const a = patron(1, 5);
  const b = patron(2, 6);
  const done: BarChat[] = [];
  const invite = () => ({ to: 'beer' as const, accepted });
  let chats = updateChats(
    [],
    [a, b],
    () => null,
    0,
    undefined,
    undefined,
    invite,
    (c) => done.push(c),
  );
  assert.equal(chats.length, 1);
  assert.equal(chats[0].speakers[0], a, 'the one asking speaks first');
  for (let i = 0; i < 10 && chats.length > 0; i++) {
    chats = updateChats(
      chats,
      [a, b],
      () => null,
      6,
      undefined,
      undefined,
      invite,
      (c) => done.push(c),
    );
  }
  return done;
}

test('a yes to an invite sends the pair off once it has been said', () => {
  const done = runInvite(true);
  assert.equal(done.length, 1);
  assert.equal(done[0].invite?.to, 'beer');
});

test('a no is just a chat', () => {
  assert.equal(runInvite(false).length, 0);
});

const tables: PlacedFurniture[] = [
  // Two table pieces side by side make one long table
  { uid: 't1', type: 'TABLE', col: 2, row: 3 },
  { uid: 't2', type: 'TABLE', col: 4, row: 3 },
  { uid: 'c1', type: 'CHAIR', col: 2, row: 2 },
  { uid: 'c2', type: 'CHAIR', col: 5, row: 2 },
  { uid: 'c3', type: 'CHAIR', col: 3, row: 4 },
  // A chair with no table
  { uid: 'lone', type: 'CHAIR', col: 9, row: 9 },
];

test('seats around touching table pieces share one table; a lone chair has none', () => {
  const seats = layoutToSeats(tables);
  const table = seats.get('c1')!.tableId;
  assert.ok(table);
  assert.equal(seats.get('c2')!.tableId, table);
  assert.equal(seats.get('c3')!.tableId, table);
  assert.equal(seats.get('lone')!.tableId, undefined);
});

function layout(): OfficeLayout {
  return {
    version: 1,
    cols: 12,
    rows: 12,
    tiles: new Array(144).fill(TileType.FLOOR_1),
    furniture: tables,
  };
}

function settle(office: OfficeState): void {
  for (let i = 0; i < 400; i++) office.update(0.05);
}

test('no beer alone at a table; a second person at it and both drink', () => {
  const office = new OfficeState(layout());
  office.addAgent(1, undefined, undefined, 'c1', true);
  office.setAgentActive(1, true);
  settle(office);
  const first = office.characters.get(1)!;
  assert.equal(first.state, CharacterState.TYPE);
  assert.equal(first.noBeer, true, 'alone: no beer');

  office.addAgent(2, undefined, undefined, 'c2', true);
  office.setAgentActive(2, true);
  settle(office);
  const second = office.characters.get(2)!;
  assert.equal(second.state, CharacterState.TYPE);
  assert.equal(first.noBeer, false);
  assert.equal(second.noBeer, false);
});
