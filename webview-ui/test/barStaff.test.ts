/**
 * TNhunn (the user's avatar) and the waiter keep their own skins,
 * and the waiter carries drinks to whoever is seated.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { afterEach, test } from 'vitest';

import { CHARACTER_NAMES, USER_AVATAR_NAME, WAITER_NAME } from '../src/constants.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { SpriteData } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

const OWNER = CHARACTER_NAMES.indexOf(USER_AVATAR_NAME);
const WAITER = CHARACTER_NAMES.indexOf(WAITER_NAME);

function loadCast(): void {
  const frame: SpriteData = Array.from({ length: 32 }, () => new Array<string>(16).fill(''));
  const dir = () => new Array<SpriteData>(7).fill(frame);
  setCharacterTemplates(CHARACTER_NAMES.map(() => ({ down: dir(), up: dir(), right: dir() })));
}

afterEach(() => setCharacterTemplates([]));

test('agents never get the TNhunn or waiter skin', () => {
  loadCast();
  const office = new OfficeState();
  office.now = () => new Date(2026, 0, 5, 10, 0); // a work morning, not lunch on the wall clock
  for (let id = 1; id <= 30; id++) office.addAgent(id);
  office.addAgent(99, OWNER); // a saved seat from before
  for (const ch of office.characters.values()) {
    assert.notEqual(ch.palette, OWNER);
    assert.notEqual(ch.palette, WAITER);
  }
});

test('the waiter walks up to a seated agent and has a word with them', () => {
  loadCast();
  const office = new OfficeState();
  office.now = () => new Date(2026, 0, 5, 10, 0); // a work morning, not lunch on the wall clock
  office.addAgent(1, undefined, undefined, undefined, true); // no seat: drinks in place
  const agent = office.characters.get(1)!;
  let served = false;
  for (let i = 0; i < 4000 && !served; i++) {
    office.update(0.05);
    const waiter = office.getVisiblePatrons().find((p) => p.palette === WAITER)!;
    const apart =
      Math.abs(waiter.tileCol - agent.tileCol) + Math.abs(waiter.tileRow - agent.tileRow);
    served = apart === 1 && waiter.state === CharacterState.IDLE && !!waiter.speech;
  }
  assert.ok(served, 'waiter reached the table and spoke');
});

test('an order: the customer waits on it, then thanks the waiter before carrying on', () => {
  loadCast();
  const office = new OfficeState();
  office.now = () => new Date(2026, 0, 5, 10, 0); // a work morning, not lunch on the wall clock
  office.addAgent(1, undefined, undefined, undefined, true); // no seat: drinks in place
  const agent = office.characters.get(1)!;
  const waiterOf = () => office.getVisiblePatrons().find((p) => p.palette === WAITER)!;
  let waited = false;
  let worked = false;
  let thanked = false;
  for (let i = 0; i < 12000 && !thanked; i++) {
    office.update(0.05);
    const w = waiterOf();
    if (agent.speech === '⏳') {
      waited = true;
      assert.equal(agent.frame, 0, 'still while waiting');
      // The waiter is busy with it: wiping (hands moving) or off fetching
      if (w.state === CharacterState.TYPE || w.state === CharacterState.WALK) worked = true;
    }
    if (waited && agent.speech && /cảm ơn/i.test(agent.speech)) thanked = true;
  }
  assert.ok(waited, 'the customer waits on the order');
  assert.ok(worked, 'the waiter works on it');
  assert.ok(thanked, 'and is thanked once it is done');
});
