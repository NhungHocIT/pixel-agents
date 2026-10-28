/**
 * League of Legends title over the user's avatar at a gaming PC.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { formatClock, lolTitle } from '../src/office/engine/lolStatus.js';

test('formatClock pads minutes and seconds, adds hours past the hour', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(75.9), '01:15');
  assert.equal(formatClock(3725), '1:02:05');
});

test('lolTitle follows the client phase and keeps clocks running between polls', () => {
  assert.equal(lolTitle({ phase: null }, 0), null);
  assert.equal(lolTitle({ phase: 'None' }, 0), 'Trang chủ LMHT');
  assert.equal(
    lolTitle({ phase: 'Lobby', lobbyMembers: 2, lobbyMax: 5, queue: 'ARAM' }, 0),
    'Sảnh chờ 2/5 · ARAM',
  );
  assert.equal(lolTitle({ phase: 'ChampSelect', champion: 'Ahri' }, 0), 'Chọn Ahri');
  assert.equal(
    lolTitle({ phase: 'InProgress', gameSec: 60, champion: 'Ahri', kda: '3/1/5' }, 0),
    'Ahri 3/1/5 · 01:00',
  );
  assert.equal(lolTitle({ phase: 'Lobby', lobbyMembers: 1, lobbyMax: 5 }, 0), 'Sảnh chờ 1/5');
  assert.equal(lolTitle({ phase: 'Lobby' }, 0), 'Sảnh chờ');
  assert.equal(lolTitle({ phase: 'Matchmaking', queueSec: 30 }, 5), 'Tìm trận 00:35');
  assert.equal(lolTitle({ phase: 'ChampSelect' }, 0), 'Chọn tướng');
  assert.equal(lolTitle({ phase: 'InProgress', gameSec: 600 }, 2), 'Trong trận 10:02');
  assert.equal(lolTitle({ phase: 'InProgress' }, 0), 'Vào trận...');
  assert.equal(lolTitle({ phase: 'EndOfGame' }, 0), 'Hết trận');
});
