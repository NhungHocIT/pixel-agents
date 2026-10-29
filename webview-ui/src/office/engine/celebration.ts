/**
 * Celebration when TNhunn wins a League match: fireworks over the office, a
 * big "Đội bạn quá gà" banner, and everyone hopping and cheering along.
 * Owned by OfficeState (started from the server `lolStatus` result); drawn
 * over the finished frame by the renderer (renderCelebration).
 */
import {
  CELEBRATION_FIREWORK_COLORS,
  CELEBRATION_LINE_SEC,
  CELEBRATION_SEC,
  CELEBRATION_STOP_LAUNCH_SEC,
} from '../../constants.js';
import type { Character } from '../types.js';
import { randomOf } from './dialogues.js';

/** What TNhunn shouts, and what the others cheer back. */
const OWNER_LINE = 'Đội bạn quá gà!';
const CHEERS = [
  'Đội bạn quá gà! 🐔',
  'Thắng rồi! 🎉',
  'GG! TNhunn gánh team!',
  'Quá đỉnh luôn!',
  'Victory! 🏆',
  'Ez game! 😎',
];

/** Positions are fractions of the canvas (x of its width, y of its height);
 *  spark offsets are in canvas heights so bursts stay round. */
export interface Rocket {
  x: number;
  y: number;
  vy: number;
  burstY: number;
  color: string;
}

export interface Spark {
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Celebration {
  /** Seconds since it started; over at CELEBRATION_SEC. */
  timer: number;
  launchTimer: number;
  rockets: Rocket[];
  sparks: Spark[];
  /** Who says what right now, and when the lines change. */
  lines: Map<Character, string>;
  lineTimer: number;
}

const GRAVITY = 0.35; // canvas heights / s²
const DRAG = 0.98; // per frame at 60 fps

export function startCelebration(): Celebration {
  return { timer: 0, launchTimer: 0, rockets: [], sparks: [], lines: new Map(), lineTimer: 0 };
}

export function celebrationOver(c: Celebration): boolean {
  return c.timer >= CELEBRATION_SEC;
}

function launch(c: Celebration): void {
  c.rockets.push({
    x: 0.12 + Math.random() * 0.76,
    y: 1,
    vy: -(0.9 + Math.random() * 0.35),
    burstY: 0.12 + Math.random() * 0.33,
    color: randomOf(CELEBRATION_FIREWORK_COLORS),
  });
}

function burst(c: Celebration, r: Rocket): void {
  const n = 36 + Math.floor(Math.random() * 20);
  const speed = 0.18 + Math.random() * 0.12;
  const twoTone = Math.random() < 0.4 ? randomOf(CELEBRATION_FIREWORK_COLORS) : r.color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const s = speed * (0.6 + Math.random() * 0.4);
    const life = 1 + Math.random() * 0.7;
    c.sparks.push({
      ox: r.x,
      oy: r.y,
      dx: 0,
      dy: 0,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      maxLife: life,
      color: i % 2 === 0 ? r.color : twoTone,
    });
  }
}

/** Advance the fireworks. */
export function updateCelebration(c: Celebration, dt: number): void {
  c.timer += dt;
  c.launchTimer -= dt;
  if (c.launchTimer <= 0 && c.timer < CELEBRATION_STOP_LAUNCH_SEC) {
    launch(c);
    if (Math.random() < 0.35) launch(c); // now and then two at once
    c.launchTimer = 0.3 + Math.random() * 0.35;
  }
  for (const r of c.rockets) r.y += r.vy * dt;
  for (const r of c.rockets.filter((r) => r.y <= r.burstY)) burst(c, r);
  c.rockets = c.rockets.filter((r) => r.y > r.burstY);
  const drag = Math.pow(DRAG, dt * 60);
  for (const s of c.sparks) {
    s.vy += GRAVITY * dt;
    s.vx *= drag;
    s.vy *= drag;
    s.dx += s.vx * dt;
    s.dy += s.vy * dt;
    s.life -= dt;
  }
  c.sparks = c.sparks.filter((s) => s.life > 0);
}

/** Everyone cheers: TNhunn shouts the line, the others answer with a cheer
 *  (new ones every CELEBRATION_LINE_SEC). Re-applied every frame so other
 *  chatter can't talk over it; latecomers join in. */
export function applyCheers(
  c: Celebration,
  members: Character[],
  isOwner: (ch: Character) => boolean,
  dt: number,
): void {
  c.lineTimer -= dt;
  if (c.lineTimer <= 0) {
    c.lineTimer = CELEBRATION_LINE_SEC;
    c.lines.clear();
  }
  for (const ch of members) {
    let line = c.lines.get(ch);
    if (line === undefined) {
      line = isOwner(ch) ? OWNER_LINE : randomOf(CHEERS);
      c.lines.set(ch, line);
    }
    ch.speech = line;
    // Start each one somewhere in the hop so the room doesn't bounce in lockstep
    ch.cheerTimer = (ch.cheerTimer ?? Math.random()) + dt;
  }
}

/** Celebration over: everyone back to normal. */
export function endCheers(c: Celebration, everyone: Character[]): void {
  const said = new Set<string>([OWNER_LINE, ...CHEERS]);
  for (const ch of everyone) {
    ch.cheerTimer = undefined;
    if (ch.speech && said.has(ch.speech)) ch.speech = null;
  }
  c.lines.clear();
}
