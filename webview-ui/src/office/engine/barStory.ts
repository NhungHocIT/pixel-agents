/**
 * Bar storyline: who each character is tied to (see BAR_STORY in constants).
 * Pure lookups by character name; OfficeState turns them into behaviour —
 * where a patron sits and rests, who it moves with, hearts, wrong turns.
 */
import { BAR_STORY, CHARACTER_NAMES } from '../../constants.js';
import type { Character } from '../types.js';

export interface StoryTies {
  /** Spouse / love: sits beside, shares a double bed, hearts. */
  partner: string | null;
  /** Close colleague: same table, rests side by side. */
  buddy: string | null;
  /** Someone this character keeps close to (teacher, sister's teacher). */
  leader: string | null;
  /** Takes wrong turns. */
  wanderer: boolean;
}

function other(pair: readonly string[], name: string): string | null {
  if (pair[0] === name) return pair[1];
  if (pair[1] === name) return pair[0];
  return null;
}

export function storyTiesOf(name: string | null): StoryTies {
  const ties: StoryTies = { partner: null, buddy: null, leader: null, wanderer: false };
  if (!name) return ties;
  for (const pair of BAR_STORY.couples) ties.partner ??= other(pair, name);
  for (const pair of BAR_STORY.buddies) ties.buddy ??= other(pair, name);
  for (const [follower, leader] of BAR_STORY.followers) {
    if (follower === name) ties.leader ??= leader;
  }
  ties.wanderer = (BAR_STORY.wanderers as readonly string[]).includes(name);
  return ties;
}

/** Display name of a character as drawn (hue-shifted copies are someone else). */
export function characterNameOf(ch: Character): string | null {
  if (ch.hueShift !== 0) return null;
  return CHARACTER_NAMES[ch.palette] ?? null;
}

/** The character this one gravitates to: partner first, then buddy, then leader. */
export function storyAnchorName(ties: StoryTies): string | null {
  return ties.partner ?? ties.buddy ?? ties.leader;
}

/** Whose activity changes this character mirrors (drink ↔ rest together). */
export function storySyncName(ties: StoryTies): string | null {
  return ties.partner ?? ties.buddy;
}
