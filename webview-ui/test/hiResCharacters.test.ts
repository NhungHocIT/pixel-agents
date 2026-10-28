/**
 * High-resolution character frames (32×64) fill the classic 16×32 world
 * footprint: the scale is read off the frame width, effects get a world-size
 * copy, and the bar overlays (beer mug, sleeping blanket) scale with them.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { BAR_BEER_COLOR } from '../src/constants.js';
import { buildDrinkingPair, buildSleepingPair } from '../src/office/sprites/barSprites.js';
import { characterSpriteScale, toWorldResolution } from '../src/office/sprites/spriteData.js';
import type { SpriteData } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';

function frame(w: number, h: number, color = BAR_BEER_COLOR): SpriteData {
  return Array.from({ length: h }, () => new Array<string>(w).fill(color));
}

test('scale is read off the frame width', () => {
  assert.equal(characterSpriteScale(frame(16, 32)), 1);
  assert.equal(characterSpriteScale(frame(32, 64)), 2);
});

test('world-resolution copy of a 32×64 frame is 16×32; classic frames pass through', () => {
  const hi = frame(32, 64);
  const lo = toWorldResolution(hi);
  assert.equal(lo.length, 32);
  assert.equal(lo[0].length, 16);
  const classic = frame(16, 32);
  assert.equal(toWorldResolution(classic), classic);
});

test('drinking and sleeping overlays keep the frame size and scale the mug', () => {
  const blank = frame(32, 64, '');
  const [up, down] = buildDrinkingPair([blank, blank], Direction.DOWN);
  for (const f of [up, down]) {
    assert.equal(f.length, 64);
    assert.equal(f[0].length, 32);
  }
  // A classic mug is 5×6 world pixels → 10×12 sprite pixels at scale 2
  const painted = up.flat().filter((c) => c !== '').length;
  const classicPainted = buildDrinkingPair(
    [frame(16, 32, ''), frame(16, 32, '')],
    Direction.DOWN,
  )[0]
    .flat()
    .filter((c) => c !== '').length;
  assert.equal(painted, classicPainted * 4);

  const [a, b] = buildSleepingPair(frame(32, 64));
  assert.equal(a.length, 64);
  assert.equal(b[0].length, 32);
});
