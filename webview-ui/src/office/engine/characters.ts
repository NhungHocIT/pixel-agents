import {
  CELEBRATION_BEAT_SEC,
  CELEBRATION_HOP_PX,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_SLEEPING_OFFSET_PX,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DRINK_FRAME_DURATION_SEC,
  EXERCISE_HOP_PX,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  SLEEP_FRAME_DURATION_SEC,
  STORY_FOLLOW_RADIUS_TILES,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
  WANDER_MOVES_BEFORE_REST_MAX,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_PAUSE_MAX_SEC,
  WANDER_PAUSE_MIN_SEC,
} from '../../constants.js';
import { findPath } from '../layout/tileMap.js';
import type { CharacterSprites } from '../sprites/spriteData.js';
import { isReadingToolName } from '../toolUtils.js';
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import { exerciseMove } from './exercise.js';

/** Whether a tool should show the reading animation (vs typing). Taxonomy comes
 *  from the active HookProvider via the `providerCapabilities` message. */
export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return isReadingToolName(tool);
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Direction from one tile to an adjacent tile */
function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1;
  const row = seat ? seat.seatRow : 1;
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    restSpot: null,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    contextTokens: 0,
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
  };
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.frameTimer += dt;

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= DRINK_FRAME_DURATION_SEC) {
        ch.frameTimer -= DRINK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt;
          break;
        }
        ch.seatTimer = 0; // clear sentinel
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      }
      break;
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose
      ch.frame = 0;
      if (ch.seatTimer < 0) ch.seatTimer = 0; // clear turn-end sentinel
      // Storyline wanderer: take a wrong turn first when heading somewhere
      if (
        (ch.lostDetours ?? 0) > 0 &&
        (ch.isActive || ch.restSpot) &&
        startDetour(ch, walkableTiles, tileMap, blockedTiles)
      ) {
        break;
      }
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!ch.seatId) {
          // No seat assigned — type in place
          ch.state = CharacterState.TYPE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }
        const seat = seats.get(ch.seatId);
        if (seat) {
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            seat.seatCol,
            seat.seatRow,
            tileMap,
            blockedTiles,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
          } else {
            // Already at seat or no path — sit down
            ch.state = CharacterState.TYPE;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
          }
        }
        break;
      }
      // Done drinking — head to the bed or gaming PC OfficeState picked
      if (ch.restSpot) {
        if (ch.tileCol === ch.restSpot.col && ch.tileRow === ch.restSpot.row) {
          settleIntoRest(ch);
          break;
        }
        const path = findPath(
          ch.tileCol,
          ch.tileRow,
          ch.restSpot.col,
          ch.restSpot.row,
          tileMap,
          blockedTiles,
        );
        if (path.length > 0) {
          ch.path = path;
          ch.moveProgress = 0;
          ch.state = CharacterState.WALK;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }
        // Unreachable spot — fall through and wander instead
      }
      // Countdown wander timer
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0) {
        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
        }
        // Storyline followers keep close to their leader
        const anchor = ch.wanderAnchor;
        const near = anchor
          ? walkableTiles.filter(
              (t) =>
                Math.abs(t.col - anchor.col) + Math.abs(t.row - anchor.row) <=
                STORY_FOLLOW_RADIUS_TILES,
            )
          : [];
        const pool = near.length > 0 ? near : walkableTiles;
        if (pool.length > 0) {
          const target = pool[Math.floor(Math.random() * pool.length)];
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            target.col,
            target.row,
            tileMap,
            blockedTiles,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.wanderCount++;
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      }
      break;
    }

    case CharacterState.WALK: {
      // Walk animation
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;

        // A wrong turn done — stop, look around; IDLE takes the next one or the real route
        if ((ch.lostDetours ?? 0) > 0) {
          ch.lostDetours = (ch.lostDetours ?? 1) - 1;
          ch.state = CharacterState.IDLE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }

        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — type in place
            ch.state = CharacterState.TYPE;
          } else {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
            } else {
              ch.state = CharacterState.IDLE;
            }
          }
        } else {
          if (ch.restSpot && ch.tileCol === ch.restSpot.col && ch.tileRow === ch.restSpot.row) {
            settleIntoRest(ch);
            break;
          }
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
              // seatTimer < 0 is a sentinel from setAgentActive(false) meaning
              // "turn just ended" — skip the long rest so idle transition is immediate
              if (ch.seatTimer < 0) {
                ch.seatTimer = 0;
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
              }
              ch.wanderCount = 0;
              ch.wanderLimit = randomInt(
                WANDER_MOVES_BEFORE_REST_MIN,
                WANDER_MOVES_BEFORE_REST_MAX,
              );
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      // Move toward next tile in path
      const nextTile = ch.path[0];
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
      const toCenter = tileCenter(nextTile.col, nextTile.row);
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;
      }

      // If became active while wandering, repath to seat (not mid wrong turn)
      if (ch.isActive && ch.seatId && !((ch.lostDetours ?? 0) > 0)) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1];
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (newPath.length > 0) {
              ch.path = newPath;
              ch.moveProgress = 0;
            }
          }
        }
      }
      break;
    }

    case CharacterState.SLEEP: {
      if (ch.frameTimer >= SLEEP_FRAME_DURATION_SEC) {
        ch.frameTimer -= SLEEP_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      // New work, or the bed was taken back — get up; IDLE paths back to the seat
      if (ch.isActive || !ch.restSpot) {
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
      }
      break;
    }

    case CharacterState.GAME: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      if (ch.isActive || !ch.restSpot) {
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
      }
      break;
    }
  }
}

/** Walk to a random tile instead of the destination (a wanderer's wrong turn).
 *  Returns false — and drops the remaining wrong turns — if no tile is reachable. */
function startDetour(
  ch: Character,
  walkableTiles: Array<{ col: number; row: number }>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  for (let attempt = 0; attempt < 5 && walkableTiles.length > 0; attempt++) {
    const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
    const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles);
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
      return true;
    }
  }
  ch.lostDetours = 0;
  return false;
}

/** Arrived at the rest spot: lie down in bed, or sit facing the gaming PC (desk above). */
function settleIntoRest(ch: Character): void {
  ch.state = ch.restSpot?.kind === 'game' ? CharacterState.GAME : CharacterState.SLEEP;
  ch.dir = ch.restSpot?.kind === 'game' ? Direction.UP : Direction.DOWN;
  ch.path = [];
  ch.frame = 0;
  ch.frameTimer = 0;
}

/** Vertical draw offset (sprite px) for the character's pose: seated, in bed,
 *  or standing — lifted on the up beat while cheering TNhunn's win. */
export function characterDrawOffsetPx(ch: Character): number {
  const pose = poseOffsetPx(ch);
  if (ch.cheerTimer === undefined) return pose;
  return Math.floor(ch.cheerTimer / CELEBRATION_BEAT_SEC) % 2 === 0
    ? pose - CELEBRATION_HOP_PX
    : pose;
}

function poseOffsetPx(ch: Character): number {
  if (ch.state === CharacterState.TYPE || ch.state === CharacterState.GAME) {
    return CHARACTER_SITTING_OFFSET_PX;
  }
  if (ch.state === CharacterState.SLEEP) return CHARACTER_SLEEPING_OFFSET_PX;
  if (ch.state === CharacterState.EXERCISE) {
    // Jumping jacks lift off on the up beat; squats drop into the seated pose
    const { move, beat } = exerciseMove(ch);
    if (move === 'jump' && beat % 2 === 0) return -EXERCISE_HOP_PX;
    if (move === 'squat' && beat % 2 === 1) return CHARACTER_SITTING_OFFSET_PX;
  }
  return 0;
}

/** Exercise break: jumping jacks, waist twists, squats, marching in place. */
function exerciseSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  const { move, beat } = exerciseMove(ch);
  const up = beat % 2 === 0;
  // The line faces front (down); the coach faces the line
  const face = ch.dir === Direction.UP ? Direction.UP : Direction.DOWN;
  switch (move) {
    case 'jump':
      return sprites.walk[face][up ? 0 : 1];
    case 'twist':
      return sprites.walk[up ? Direction.LEFT : Direction.RIGHT][1];
    case 'squat':
      return up ? sprites.walk[face][1] : sprites.typing[face][0];
    case 'march':
      return sprites.walk[face][beat % 4];
  }
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      // Sofa: sit with empty hands, or sip water from the glass off the table
      if (ch.onSofa) {
        return ch.sipping ? sprites.waterSip[ch.dir][ch.frame % 2] : sprites.typing[ch.dir][1];
      }
      // Beer only in the bar; anywhere else work looks like work again
      if (ch.noBeer) {
        return isReadingTool(ch.currentTool)
          ? sprites.reading[ch.dir][ch.frame % 2]
          : sprites.typing[ch.dir][ch.frame % 2];
      }
      // Bar theme: every tool is a sip of beer
      return sprites.drinking[ch.dir][ch.frame % 2];
    case CharacterState.SLEEP:
      return sprites.sleeping[ch.frame % 2];
    case CharacterState.GAME:
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];
    case CharacterState.EXERCISE:
      return exerciseSprite(ch, sprites);
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1];
    default:
      return sprites.walk[ch.dir][1];
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
