/**
 * Bar theme overlays composed onto the loaded character frames:
 * a beer mug for working agents (replaces typing/reading) and a
 * tucked-in sleeping pose for agents resting in a bed.
 *
 * Built after any hue shift so the mug and blanket keep their colours.
 */
import {
  BAR_BEER_COLOR,
  BAR_BEER_DARK_COLOR,
  BAR_BLANKET_COLOR,
  BAR_BLANKET_DARK_COLOR,
  BAR_BLANKET_LIGHT_COLOR,
  BAR_FOAM_COLOR,
  BAR_FOAM_SHADE_COLOR,
  BAR_MUG_HANDLE_COLOR,
  BAR_ZZZ_COLOR,
  FRUIT_APPLE_COLOR,
  FRUIT_BANANA_COLOR,
  FRUIT_GRAPE_COLOR,
  FRUIT_LEAF_COLOR,
  FRUIT_ORANGE_COLOR,
  LOUNGE_PLATE_COLOR,
  LOUNGE_PLATE_RIM_COLOR,
  LOUNGE_TRAY_COLOR,
  LOUNGE_TRAY_LIGHT_COLOR,
  LOUNGE_TRAY_RIM_COLOR,
  WATER_COLOR,
  WATER_GLASS_RIM_COLOR,
  WATER_GLASS_SHINE_COLOR,
} from '../../constants.js';
import type { Direction as DirectionVal, SpriteData } from '../types.js';
import { Direction } from '../types.js';

const F = BAR_FOAM_COLOR;
const S = BAR_FOAM_SHADE_COLOR;
const A = BAR_BEER_COLOR;
const D = BAR_BEER_DARK_COLOR;
const H = BAR_MUG_HANDLE_COLOR;
const _ = '';

/** 5×6 mug, handle on the right. */
const MUG: SpriteData = [
  [F, F, F, F, _],
  [F, S, S, F, _],
  [A, A, A, D, H],
  [A, A, A, D, H],
  [A, A, A, D, H],
  [D, D, D, D, _],
];
const MUG_FLIPPED: SpriteData = MUG.map((row) => [...row].reverse());

const O = WATER_GLASS_RIM_COLOR;
const L = WATER_GLASS_SHINE_COLOR;
const W = WATER_COLOR;
/** 4×5 glass of water in a sofa sitter's hand. */
export const WATER_GLASS: SpriteData = [
  [O, L, L, O],
  [O, W, W, O],
  [O, L, W, O],
  [O, W, W, O],
  [_, O, O, _],
];

/** 5×7 glass of water standing on the tray (bigger than the one in hand, so it reads on the table). */
export const TABLE_GLASS: SpriteData = [
  [O, L, L, L, O],
  [O, W, W, W, O],
  [O, L, W, W, O],
  [O, W, W, W, O],
  [O, W, L, W, O],
  [O, W, W, W, O],
  [_, O, O, O, _],
];

/** A flat oval seen from above: `rim` outline around `fill`, top rows lit. */
function oval(w: number, h: number, fill: string, rim: string, light: string): SpriteData {
  const out: SpriteData = [];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const inside = (x: number, y: number) =>
    ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2 <= 1;
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) row.push(_);
      else if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        row.push(rim);
      } else row.push(y <= cy - 1 ? light : fill);
    }
    out.push(row);
  }
  return out;
}

/** 26×9 round serving tray in the middle of the lounge table. */
export const ROUND_TRAY: SpriteData = oval(
  26,
  9,
  LOUNGE_TRAY_COLOR,
  LOUNGE_TRAY_RIM_COLOR,
  LOUNGE_TRAY_LIGHT_COLOR,
);

/** Where the four glasses stand on the tray: [dx, bottom dy, z lift]. A
 *  staggered row — back glasses (dy 6) drawn before front ones (dy 8). */
export const TRAY_GLASS_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [2, 6, 0.2],
  [7, 8, 0.3],
  [14, 6, 0.2],
  [19, 8, 0.3],
];

/** An 18×8 white plate with a heap of fruit, `fruit` stamped at [x, y]. */
function fruitPlate(fruit: ReadonlyArray<readonly [number, number, SpriteData]>): SpriteData {
  const plate = oval(18, 8, LOUNGE_PLATE_COLOR, LOUNGE_PLATE_RIM_COLOR, LOUNGE_PLATE_COLOR);
  for (const [x, y, piece] of fruit) stamp(plate, piece, x, y);
  return plate;
}

const R = FRUIT_ORANGE_COLOR;
const P = FRUIT_APPLE_COLOR;
const G = FRUIT_LEAF_COLOR;
const V = FRUIT_GRAPE_COLOR;
const Y = FRUIT_BANANA_COLOR;
const ORANGE: SpriteData = [
  [_, R, R, _],
  [R, R, R, R],
  [R, R, R, R],
  [_, R, R, _],
];
const APPLE: SpriteData = [
  [_, _, G, _],
  [P, P, P, P],
  [P, P, P, P],
  [_, P, P, _],
];
const GRAPES: SpriteData = [
  [V, V, V, V],
  [V, V, V, _],
  [_, V, V, _],
  [_, V, _, _],
];
const BANANA: SpriteData = [
  [Y, _, _, _, _],
  [Y, Y, _, _, _],
  [_, Y, Y, Y, Y],
];

/** Fruit plates on either side of the tray: oranges and an apple; grapes and a banana. */
export const FRUIT_PLATE_LEFT: SpriteData = fruitPlate([
  [3, 1, ORANGE],
  [7, 2, ORANGE],
  [11, 1, APPLE],
]);
export const FRUIT_PLATE_RIGHT: SpriteData = fruitPlate([
  [3, 1, GRAPES],
  [6, 2, GRAPES],
  [10, 3, BANANA],
]);

/** Mug top-left per direction: [raised to the mouth, lowered to the table].
 *  LEFT mirrors RIGHT because LEFT frames are flipped RIGHT frames. */
const MUG_SPOTS: Record<DirectionVal, [[number, number], [number, number]]> = {
  [Direction.DOWN]: [
    [8, 15],
    [10, 22],
  ],
  [Direction.UP]: [
    [11, 11],
    [11, 21],
  ],
  [Direction.RIGHT]: [
    [11, 14],
    [10, 21],
  ],
  [Direction.LEFT]: [
    [0, 14],
    [1, 21],
  ],
};

function cloneSprite(s: SpriteData): SpriteData {
  return s.map((row) => [...row]);
}

function stamp(target: SpriteData, src: SpriteData, x0: number, y0: number): void {
  for (let y = 0; y < src.length; y++) {
    const row = target[y0 + y];
    if (!row) continue;
    for (let x = 0; x < src[y].length; x++) {
      const c = src[y][x];
      if (c && x0 + x >= 0 && x0 + x < row.length) row[x0 + x] = c;
    }
  }
}

function fillRect(target: SpriteData, x0: number, y0: number, w: number, h: number, c: string) {
  for (let y = y0; y < y0 + h; y++) {
    const row = target[y];
    if (!row) continue;
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 0 && x < row.length) row[x] = c;
    }
  }
}

/** Sprite pixels per world pixel (1 for 16-wide frames, 2 for 32-wide, ...). */
function scaleOf(frame: SpriteData): number {
  return Math.max(1, Math.round((frame[0]?.length ?? 16) / 16));
}

/** Nearest-neighbour enlarge, so overlays match high-resolution frames. */
function upscale(s: SpriteData, k: number): SpriteData {
  if (k === 1) return s;
  const out: SpriteData = [];
  for (const row of s) {
    const wide = row.flatMap((c) => new Array<string>(k).fill(c));
    for (let i = 0; i < k; i++) out.push([...wide]);
  }
  return out;
}

/** Drinking pair for one direction, built from that direction's typing pair:
 *  frame 0 = mug at the mouth, frame 1 = mug back down. Spots are in world
 *  pixels and scale with high-resolution frames. */
export function buildDrinkingPair(
  typing: [SpriteData, SpriteData],
  dir: DirectionVal,
): [SpriteData, SpriteData] {
  return buildHoldingPair(typing, dir, dir === Direction.LEFT ? MUG_FLIPPED : MUG);
}

/** Water sipping pair (sofa sitters): the same moves as the beer, with a glass. */
export function buildWaterSipPair(
  typing: [SpriteData, SpriteData],
  dir: DirectionVal,
): [SpriteData, SpriteData] {
  return buildHoldingPair(typing, dir, WATER_GLASS);
}

function buildHoldingPair(
  typing: [SpriteData, SpriteData],
  dir: DirectionVal,
  vessel: SpriteData,
): [SpriteData, SpriteData] {
  const k = scaleOf(typing[0]);
  const mug = upscale(vessel, k);
  const [raised, lowered] = MUG_SPOTS[dir];
  const up = cloneSprite(typing[0]);
  const down = cloneSprite(typing[1]);
  stamp(up, mug, raised[0] * k, raised[1] * k);
  stamp(down, mug, lowered[0] * k, lowered[1] * k);
  return [up, down];
}

const Z = BAR_ZZZ_COLOR;
/** 4×4 "z" glyph */
const ZED: SpriteData = [
  [Z, Z, Z, Z],
  [_, _, Z, _],
  [_, Z, _, _],
  [Z, Z, Z, Z],
];

/** Rows of the front-facing frame that hold the head (the face ends above the body). */
const HEAD_ROWS = 17;
/** Blanket starts under the chin and runs to the foot of the bed sprite. */
const BLANKET_TOP = 17;
const BLANKET_BOTTOM = 29;

/** Sleeping pair (Zzz bob) drawn over a 16×32 bed: head on the pillow,
 *  body under a blanket. Built from a front-facing standing frame. */
export function buildSleepingPair(standingDown: SpriteData): [SpriteData, SpriteData] {
  const k = scaleOf(standingDown);
  const w = standingDown[0]?.length ?? 16;
  const h = standingDown.length;
  const base: SpriteData = Array.from({ length: h }, () => new Array<string>(w).fill(''));
  stamp(base, standingDown.slice(0, HEAD_ROWS * k), 0, 0);
  const top = BLANKET_TOP * k;
  const bottom = BLANKET_BOTTOM * k;
  fillRect(base, k, top, w - 2 * k, bottom - top, BAR_BLANKET_COLOR);
  fillRect(base, k, top, w - 2 * k, 2 * k, BAR_BLANKET_LIGHT_COLOR);
  fillRect(base, k, bottom - k, w - 2 * k, k, BAR_BLANKET_DARK_COLOR);

  const zed = upscale(ZED, k);
  const a = cloneSprite(base);
  const b = cloneSprite(base);
  stamp(a, zed, w - 4 * k, k);
  stamp(b, zed, w - 4 * k, 0);
  return [a, b];
}
