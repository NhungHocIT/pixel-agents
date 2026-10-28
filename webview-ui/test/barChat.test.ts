/**
 * Bar chats: patrons close together anywhere pair up, take turns speaking, and
 * stop when one leaves or they drift apart.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { CHAT_KEEP_RANGE_TILES, CHAT_PAIR_RANGE_TILES } from '../src/constants.js';
import { updateChats } from '../src/office/engine/barChat.js';
import { createCharacter } from '../src/office/engine/characters.js';
import { CharacterState } from '../src/office/types.js';

function patron(id: number, col: number, row = 18) {
  const ch = createCharacter(id, id, null, null);
  ch.tileCol = col;
  ch.tileRow = row;
  ch.state = CharacterState.IDLE;
  return ch;
}

const noName = () => null;

test('two patrons close together start a chat and take turns speaking', () => {
  const a = patron(1, 5);
  const b = patron(2, 5 + CHAT_PAIR_RANGE_TILES);
  const chats = updateChats([], [a, b], noName, 0);
  assert.equal(chats.length, 1);
  const [first, second] = chats[0].speakers;
  assert.ok(first.speech);
  assert.equal(second.speech, null);

  updateChats(chats, [a, b], noName, chats[0].timer + 0.01);
  assert.equal(first.speech, null);
  assert.ok(second.speech);
});

test('patrons far apart, or mid-walk, do not start a chat', () => {
  const a = patron(1, 5);
  const far = patron(2, 5 + CHAT_PAIR_RANGE_TILES + 1);
  assert.equal(updateChats([], [a, far], noName, 0).length, 0);

  const walker = patron(3, 6);
  walker.state = CharacterState.WALK;
  assert.equal(updateChats([], [a, walker], noName, 0).length, 0);
});

test('a chat ends when a speaker leaves or they drift apart', () => {
  const a = patron(1, 5);
  const b = patron(2, 6);
  let chats = updateChats([], [a, b], noName, 0);
  chats = updateChats(chats, [a], noName, 0.1);
  assert.equal(chats.length, 0);
  assert.equal(a.speech, null);
  assert.ok((a.chatCooldown ?? 0) > 0);

  const c = patron(3, 5);
  const d = patron(4, 6);
  chats = updateChats([], [c, d], noName, 0);
  d.tileCol = 5 + CHAT_KEEP_RANGE_TILES + 1;
  assert.equal(updateChats(chats, [c, d], noName, 0.1).length, 0);
  assert.equal(c.speech ?? null, null);
  assert.equal(d.speech ?? null, null);
});
