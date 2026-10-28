/**
 * Bar chats: characters standing, sitting or resting near each other anywhere
 * on the map pair up and talk, one line at a time, shown as a speech line over
 * the speaker. What they say depends on where they are (see dialogues.ts):
 * the bar, the game room, the sofa — or, passing each other on the way
 * somewhere, a quick hello. A chat ends when they drift apart or one leaves.
 *
 * Pure bookkeeping over Character objects; OfficeState decides who may talk
 * and where they are, and calls updateChats every frame.
 */
import {
  CHAT_COOLDOWN_MAX_SEC,
  CHAT_COOLDOWN_MIN_SEC,
  CHAT_KEEP_RANGE_TILES,
  CHAT_LINE_MAX_SEC,
  CHAT_LINE_MIN_SEC,
  CHAT_PAIR_RANGE_TILES,
  CHAT_SEC_PER_CHAR,
  CHAT_STREET_COOLDOWN_MAX_SEC,
  CHAT_STREET_COOLDOWN_MIN_SEC,
  CHAT_STREET_RANGE_TILES,
  USER_AVATAR_NAME,
} from '../../constants.js';
import type { Character } from '../types.js';
import { CharacterState } from '../types.js';
import type { ChatPlace, InviteTo } from './dialogues.js';
import { inviteDialogue, pickDialogue } from './dialogues.js';

/** `speakers[0]` asks `speakers[1]` along; on a yes both go when the chat ends. */
export interface ChatInvite {
  to: InviteTo;
  accepted: boolean;
}

export interface BarChat {
  speakers: [Character, Character];
  lines: readonly string[];
  index: number;
  /** Seconds left on the current line. */
  timer: number;
  /** Where it started: 'street' chats hold both speakers where they met. */
  place: ChatPlace;
  invite?: ChatInvite;
}

function lineSec(text: string): number {
  return Math.min(CHAT_LINE_MAX_SEC, Math.max(CHAT_LINE_MIN_SEC, text.length * CHAT_SEC_PER_CHAR));
}

function endChat(chat: BarChat): void {
  // After a hello on the way, keep walking for a good while before the next one
  const [min, max] =
    chat.place === 'street'
      ? [CHAT_STREET_COOLDOWN_MIN_SEC, CHAT_STREET_COOLDOWN_MAX_SEC]
      : [CHAT_COOLDOWN_MIN_SEC, CHAT_COOLDOWN_MAX_SEC];
  for (const ch of chat.speakers) {
    ch.speech = null;
    ch.chatCooldown = min + Math.random() * (max - min);
  }
}

function tilesApart(a: Character, b: Character): number {
  return Math.abs(a.tileCol - b.tileCol) + Math.abs(a.tileRow - b.tileRow);
}

/** What OfficeState decides about a pair; every hook is optional. */
export interface ChatHooks {
  /** Who may start a chat with whom. */
  canPair?: (a: Character, b: Character) => boolean;
  /** Where a new pair is. */
  placeOf?: (a: Character, b: Character) => ChatPlace;
  /** Seated at one table: they pair first and talk across it whatever the distance. */
  together?: (a: Character, b: Character) => boolean;
  /** May turn a new pair's chat into an invite (`a` asks `b`). */
  inviteOf?: (a: Character, b: Character) => ChatInvite | null;
  /** Runs when an accepted invite has been said in full. */
  onAccepted?: (chat: BarChat) => void;
}

/** Advance running chats, end those whose speakers left or drifted apart, and
 *  pair up talkers close together (tablemates, then nearest first). Two people
 *  where one is walking only pair when they are right next to each other —
 *  that's a 'street' chat. Returns the chats still running. */
export function updateChats(
  chats: BarChat[],
  talkers: Character[],
  nameOf: (ch: Character) => string | null,
  dt: number,
  hooks: ChatHooks = {},
): BarChat[] {
  const {
    canPair = () => true,
    placeOf = () => 'bar',
    together = () => false,
    inviteOf = () => null,
    onAccepted = () => {},
  } = hooks;
  const near = (a: Character, b: Character, range: number) =>
    together(a, b) || tilesApart(a, b) <= range;
  const present = new Set(talkers);
  const running: BarChat[] = [];
  for (const chat of chats) {
    const [a, b] = chat.speakers;
    if (!present.has(a) || !present.has(b) || !near(a, b, CHAT_KEEP_RANGE_TILES)) {
      endChat(chat);
      continue;
    }
    chat.timer -= dt;
    if (chat.timer <= 0) {
      chat.index++;
      if (chat.index >= chat.lines.length) {
        if (chat.invite?.accepted) onAccepted(chat);
        endChat(chat);
        continue;
      }
      chat.timer = lineSec(chat.lines[chat.index]);
    }
    const speaker = chat.speakers[chat.index % 2];
    for (const s of chat.speakers) s.speech = s === speaker ? chat.lines[chat.index] : null;
    running.push(chat);
  }

  const busy = new Set(running.flatMap((c) => c.speakers));
  for (const ch of talkers) {
    if (!busy.has(ch)) {
      ch.speech = null;
      ch.chatCooldown = Math.max(0, (ch.chatCooldown ?? 0) - dt);
    }
  }
  const free = talkers.filter((ch) => !busy.has(ch) && (ch.chatCooldown ?? 0) === 0);
  const walking = (ch: Character) => ch.state === CharacterState.WALK;
  while (free.length >= 2) {
    const a = free.shift()!;
    const rank = (x: Character) => (together(a, x) ? -1000 : 0) + tilesApart(x, a);
    const b = free.filter((x) => canPair(a, x)).sort((x, y) => rank(x) - rank(y))[0];
    if (!b) continue;
    const onTheWay = walking(a) || walking(b);
    const range = onTheWay ? CHAT_STREET_RANGE_TILES : CHAT_PAIR_RANGE_TILES;
    if (!near(a, b, range)) continue;
    free.splice(free.indexOf(b), 1);
    const place = onTheWay ? 'street' : placeOf(a, b);
    const invite = inviteOf(a, b);
    if (invite) {
      const chat = startChat([a, b], inviteDialogue(invite.to, invite.accepted), place);
      chat.invite = invite;
      running.push(chat);
      continue;
    }
    const nameA = nameOf(a);
    const { lines, opener } = pickDialogue(nameA, nameOf(b), place, USER_AVATAR_NAME);
    // A script that names who opens it: make that character the first speaker
    const speakers: [Character, Character] = opener && opener !== nameA ? [b, a] : [a, b];
    running.push(startChat(speakers, lines, place));
  }
  return running;
}

/** A chat with a set script, `speakers[0]` saying the first line now. */
export function startChat(
  speakers: [Character, Character],
  lines: readonly string[],
  place: ChatPlace,
): BarChat {
  speakers[0].speech = lines[0];
  return { speakers, lines, index: 0, timer: lineSec(lines[0]), place };
}
