import { pickDiversePalette } from '../../../../core/src/paletteUtils.js';
import {
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  BAR_PATRONS_ENABLED,
  BED_FURNITURE_TYPE,
  BOSS_VISIT_MAX_SEC,
  BOSS_VISIT_MIN_SEC,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHARACTER_NAMES,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  EXERCISE_GATHER_MAX_SEC,
  EXERCISE_INTERVAL_MS,
  EXERCISE_WORKOUT_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  GAMING_CHAIR_FURNITURE_TYPE,
  GREETER_ID,
  GREETER_TILE_MARGIN,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  LOUNGE_PLATE_GAP_PX,
  LOUNGE_TABLE_FURNITURE_TYPE,
  LOUNGE_TABLE_TOP_PX,
  MAX_PET_ID_LENGTH,
  PATRON_SEAT_RETRY_SEC,
  PET_HIT_HALF_WIDTH,
  PET_HIT_HEIGHT,
  SOFA_FURNITURE_PREFIX,
  SOFA_GLASS_RETRY_SEC,
  SOFA_SEAT_PREFERENCE,
  SOFA_SIP_GAP_MAX_SEC,
  SOFA_SIP_GAP_MIN_SEC,
  SOFA_SIP_SEC,
  STORY_HEART_COOLDOWN_MAX_SEC,
  STORY_HEART_COOLDOWN_MIN_SEC,
  STORY_HEART_RANGE_TILES,
  STORY_HEART_SHOW_SEC,
  STORY_SYNC_DELAY_SEC,
  STORY_WANDERER_DETOURS_MAX,
  STORY_WANDERER_DETOURS_MIN,
  USER_AVATAR_NAME,
  WAITER_NAME,
  WAITER_PAUSE_MAX_SEC,
  WAITER_PAUSE_MIN_SEC,
  WAITER_RESERVE_SEC,
  WAITER_SERVE_SEC,
  WAITING_BUBBLE_DURATION_SEC,
} from '../../constants.js';
import { getAnimationFrames, getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js';
import {
  createDefaultLayout,
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  layoutToTileMap,
} from '../layout/layoutSerializer.js';
import { findPath, getWalkableTiles, isWalkable } from '../layout/tileMap.js';
import {
  FRUIT_PLATE_LEFT,
  FRUIT_PLATE_RIGHT,
  ROUND_TRAY,
  TABLE_GLASS,
  TRAY_GLASS_OFFSETS,
} from '../sprites/barSprites.js';
import { getPetCount, getPetName } from '../sprites/petSpriteData.js';
import { getLoadedCharacterCount } from '../sprites/spriteData.js';
import type {
  Character,
  FurnitureInstance,
  OfficeLayout,
  Pet,
  PlacedFurniture,
  PlacedPet,
  RestSpot,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState, Direction, PetState, TILE_SIZE } from '../types.js';
import type { BarChat } from './barChat.js';
import { startChat, updateChats } from './barChat.js';
import { createPatron, isPatron, sendPatronToRest, tickPatronSchedule } from './barPatrons.js';
import { characterNameOf, storyAnchorName, storySyncName, storyTiesOf } from './barStory.js';
import { characterDrawOffsetPx, createCharacter, updateCharacter } from './characters.js';
import type { ChatPlace } from './dialogues.js';
import { waiterDialogue } from './dialogues.js';
import type { ExerciseSession } from './exercise.js';
import {
  beginWorkout,
  endWorkout,
  joinExercise,
  pickLineSlots,
  updateExerciseChatter,
  updateExerciser,
} from './exercise.js';
import type { LolStatus } from './lolStatus.js';
import { lolTitle } from './lolStatus.js';
import { advanceMatrixEffect, startMatrixEffect } from './matrixEffectState.js';
import { createPet, updatePet } from './petEntity.js';
import { anchorTile, closestFreeSeat } from './seatPlacement.js';
import type { WaiterRound } from './waiter.js';
import { isServable, newWaiterRound, serveSpots } from './waiter.js';
import { startWalk, stepWalk } from './walking.js';

/** Palettes of the staff — the boss (the user's avatar) and the waiter —
 *  never given to an agent. */
const STAFF_PALETTES = new Set(
  [USER_AVATAR_NAME, WAITER_NAME].map((n) => CHARACTER_NAMES.indexOf(n)).filter((i) => i >= 0),
);

/** Internal helper: facing-tile coords for a seat. Returns null for invalid direction. */
function seatFacingOffset(direction: Direction): { dCol: number; dRow: number } {
  if (direction === Direction.RIGHT) return { dCol: 1, dRow: 0 };
  if (direction === Direction.LEFT) return { dCol: -1, dRow: 0 };
  if (direction === Direction.DOWN) return { dCol: 0, dRow: 1 };
  return { dCol: 0, dRow: -1 };
}

export class OfficeState {
  layout: OfficeLayout;
  tileMap: TileTypeVal[][];
  seats: Map<string, Seat>;
  blockedTiles: Set<string>;
  furniture: FurnitureInstance[];
  walkableTiles: Array<{ col: number; row: number }>;
  characters: Map<number, Character> = new Map();
  pets: Pet[] = [];
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0;
  private _selectedAgentId: number | null = null;
  private readonly selectionListeners = new Set<(id: number | null) => void>();
  get selectedAgentId(): number | null {
    return this._selectedAgentId;
  }
  set selectedAgentId(id: number | null) {
    if (this._selectedAgentId === id) return;
    this._selectedAgentId = id;
    for (const listener of this.selectionListeners) listener(id);
  }
  /** Observe selectedAgentId changes. React (the card bars) subscribes so
   *  imperative canvas selection can drive card highlights — everything else
   *  about selection stays out of React state. Returns the unsubscribe. */
  subscribeSelection(listener: (id: number | null) => void): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }
  cameraFollowId: number | null = null;
  hoveredAgentId: number | null = null;
  hoveredTile: { col: number; row: number } | null = null;
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map();
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map();
  private nextSubagentId = -1;

  /**
   * directoryName → list of Area labels that Directory belongs to.
   * Populated by useExtensionMessages on `areaMappingsLoaded`. Consulted by
   * `findFreeSeat()` to bias new agents toward seats inside their Directory's Area.
   */
  areaMappings: Record<string, string[]> = {};

  /**
   * The first-run consent greeter, deliberately NOT in `characters`.
   *
   * `characters` means "agents": everything that iterates it — seat
   * assignment, palette diversity, the wander FSM, hit-testing, the seat
   * payload the webview persists — is asking an agent question the greeter has
   * no answer to. Holding it here instead of tagging it with a flag makes
   * every one of those loops correct by default, rather than correct as long
   * as each remembers an `isGreeter` guard. It is drawn because
   * `getCharacters()` appends it, and that is the only place it joins the
   * others.
   */
  greeter: Character | null = null;

  /** World-space point the camera drifts to while the greeter is up
   *  (the bubble overlay recomputes it every frame: the combined center of the
   *  character and its speech bubble). An explicit cameraFollowId outranks it. */
  greeterCameraTarget: { x: number; y: number } | null = null;
  /** Latched by a manual pan during the ask: the user took the camera, so the
   *  overlay's per-frame updates stop re-centering. Reset on spawn/despawn. */
  private greeterCameraCancelled = false;

  /** The exercise break in progress, and when (wall clock) the next one starts. */
  private exercise: ExerciseSession | null = null;
  private nextExerciseAt = Date.now() + EXERCISE_INTERVAL_MS;
  /** The boss's rounds: whose desk they are hanging around, and for how long. */
  private bossVisitId: number | null = null;
  private bossVisitTimer = 0;
  /** The waiter's current round, where they wait between rounds (lazily
   *  picked: by the bar seats), and when (sim seconds) each customer was last served. */
  private waiterRound: WaiterRound = newWaiterRound(WAITER_PAUSE_MIN_SEC);
  private waiterHome: { col: number; row: number } | null = null;
  private servedAt = new Map<Character, number>();
  private clockSec = 0;

  setAreaMappings(mappings: Record<string, string[]>): void {
    this.areaMappings = mappings;
  }

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout();
    this.tileMap = layoutToTileMap(this.layout);
    this.seats = layoutToSeats(this.layout.furniture);
    this.blockedTiles = getBlockedTiles(this.layout.furniture);
    this.furniture = layoutToFurnitureInstances(this.layout.furniture);
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    this.rebuildRestSpots();
    // Pets are built last because they need walkableTiles populated for spawn.
    this.rebuildPetsFromLayout(this.layout);
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.stopExercise(); // the line was laid out on the old floor
    this.waiterHome = null;
    this.waiterRound = newWaiterRound(WAITER_PAUSE_MIN_SEC);
    this.layout = layout;
    this.tileMap = layoutToTileMap(layout);
    this.seats = layoutToSeats(layout.furniture);
    this.blockedTiles = getBlockedTiles(layout.furniture);
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    this.rebuildRestSpots();
    this.rebuildFurnitureInstances();

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col;
        ch.tileRow += shift.row;
        ch.x += shift.col * TILE_SIZE;
        ch.y += shift.row * TILE_SIZE;
        // Clear path since tile coords changed
        ch.path = [];
        ch.moveProgress = 0;
      }
    }

    // Shift pet positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const pet of this.pets) {
        pet.tileCol += shift.col;
        pet.tileRow += shift.row;
        pet.x += shift.col * TILE_SIZE;
        pet.y += shift.row * TILE_SIZE;
        pet.path = [];
        pet.moveProgress = 0;
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!;
        if (!seat.assigned) {
          seat.assigned = true;
          // Snap character to seat position
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          ch.x = cx;
          ch.y = cy;
          ch.dir = seat.facingDir;
          continue;
        }
      }
      ch.seatId = null; // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue;
      const seatId = this.findFreeSeat(ch.directoryName);
      if (seatId) {
        this.seats.get(seatId)!.assigned = true;
        ch.seatId = seatId;
        const seat = this.seats.get(seatId)!;
        ch.tileCol = seat.seatCol;
        ch.tileRow = seat.seatRow;
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
        ch.dir = seat.facingDir;
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue; // seated characters are fine
      if (
        ch.tileCol < 0 ||
        ch.tileCol >= layout.cols ||
        ch.tileRow < 0 ||
        ch.tileRow >= layout.rows
      ) {
        this.relocateCharacterToWalkable(ch);
      }
    }

    // Relocate any pets that ended up outside bounds or on non-walkable tiles
    for (const pet of this.pets) {
      if (
        pet.tileCol < 0 ||
        pet.tileCol >= layout.cols ||
        pet.tileRow < 0 ||
        pet.tileRow >= layout.rows ||
        !isWalkable(pet.tileCol, pet.tileRow, this.tileMap, this.blockedTiles)
      ) {
        if (this.walkableTiles.length > 0) {
          const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
          pet.tileCol = spawn.col;
          pet.tileRow = spawn.row;
          pet.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
          pet.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
          pet.path = [];
          pet.moveProgress = 0;
          pet.state = PetState.IDLE;
          pet.frame = 0;
          pet.frameTimer = 0;
          pet.followTargetId = null;
        }
      }
    }

    // Patrons off the map or on a now-blocked tile start over somewhere walkable
    for (const p of this.patrons) {
      const offMap =
        p.tileCol < 0 || p.tileCol >= layout.cols || p.tileRow < 0 || p.tileRow >= layout.rows;
      if (offMap || (shift && (shift.col !== 0 || shift.row !== 0))) {
        sendPatronToRest(p, PATRON_SEAT_RETRY_SEC);
        p.restSpot = null;
        p.state = CharacterState.IDLE;
        this.relocateCharacterToWalkable(p);
      }
    }

    // Reconcile pets against the layout roster (handles editor add/remove)
    this.rebuildPetsFromLayout(layout);
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return;
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.path = [];
    ch.moveProgress = 0;
  }

  getLayout(): OfficeLayout {
    return this.layout;
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return null;
    return `${seat.seatCol},${seat.seatRow}`;
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch);
    if (key) this.blockedTiles.delete(key);
    const result = fn();
    if (key) this.blockedTiles.add(key);
    return result;
  }

  /** Rest spots: every tile of every bed's lower row (a double bed sleeps two)
   *  and every gaming chair. */
  private restSpots: RestSpot[] = [];

  /** Non-agent bar patrons, one per loaded character sprite. Drawn, never
   *  selectable, never persisted; they yield seats and rest spots to agents. */
  private patrons: Character[] = [];

  /** The user's League of Legends status (server `lolStatus`), and when it arrived. */
  private lolStatus: LolStatus = { phase: null };
  private lolStatusAt = 0;

  setLolStatus(status: LolStatus): void {
    this.lolStatus = status;
    this.lolStatusAt = Date.now();
  }

  private userInLeague(): boolean {
    return this.lolStatus.phase !== null;
  }

  private isUserAvatar(ch: Character): boolean {
    return isPatron(ch) && characterNameOf(ch) === USER_AVATAR_NAME;
  }

  /** Title over the user's avatar while it plays at a gaming PC: their real
   *  League status. Nobody else gets one. */
  gameTitle(ch: Character): string | null {
    if (ch.state !== CharacterState.GAME || !this.isUserAvatar(ch) || !this.userInLeague()) {
      return null;
    }
    return lolTitle(this.lolStatus, (Date.now() - this.lolStatusAt) / 1000);
  }

  /** While the user is in League their avatar sits at a gaming PC (bumping a
   *  patron if they are all taken) and stays there; otherwise it leaves them. */
  private steerUserAvatar(p: Character): void {
    if (!this.userInLeague()) {
      if (p.restSpot?.kind === 'game') p.restSpot = null;
      return;
    }
    if (p.isActive || p.seatId) sendPatronToRest(p, PATRON_SEAT_RETRY_SEC);
    p.patronTimer = Math.max(p.patronTimer ?? 0, PATRON_SEAT_RETRY_SEC);
    if (p.restSpot?.kind === 'game') return;
    const holders = [...this.characters.values(), ...this.patrons];
    const holderOf = (s: RestSpot) => holders.find((o) => o.restSpot && sameSpot(o.restSpot, s));
    const games = this.restSpots.filter((s) => s.kind === 'game');
    const dist = (s: RestSpot) => Math.abs(s.col - p.tileCol) + Math.abs(s.row - p.tileRow);
    const pick =
      games.filter((s) => !holderOf(s)).sort((a, b) => dist(a) - dist(b))[0] ??
      games.find((s) => {
        const o = holderOf(s);
        return o !== undefined && isPatron(o);
      });
    if (!pick) return;
    const bumped = holderOf(pick);
    if (bumped) bumped.restSpot = null; // its FSM gets up and wanders
    p.restSpot = { ...pick };
  }

  /** Not in League, the boss walks the floor: hangs around one agent's desk
   *  for a while (chatting with whoever is near), then moves on to the next. */
  private steerBossRounds(p: Character, dt: number): void {
    if (p.restSpot) return; // at a gaming PC, in League
    this.bossVisitTimer -= dt;
    let target = this.bossVisitId !== null ? this.characters.get(this.bossVisitId) : undefined;
    if (!target || this.bossVisitTimer <= 0) {
      const agents = [...this.characters.values()].filter((c) => !c.matrixEffect);
      target = agents[Math.floor(Math.random() * agents.length)];
      this.bossVisitId = target?.id ?? null;
      this.bossVisitTimer = randomBetween(BOSS_VISIT_MIN_SEC, BOSS_VISIT_MAX_SEC);
    }
    p.wanderAnchor = target ? { col: target.tileCol, row: target.tileRow } : null;
  }

  private isWaiter(ch: Character): boolean {
    return isPatron(ch) && characterNameOf(ch) === WAITER_NAME;
  }

  /** The waiter's rounds: counter → a customer's side → a word with them → counter. */
  private updateWaiter(w: Character, dt: number): void {
    w.frameTimer += dt;
    w.seatId = null;
    w.isActive = false;
    w.restSpot = null;
    const r = this.waiterRound;
    r.timer -= dt;
    switch (r.phase) {
      case 'pause': {
        if (r.timer > 0) return;
        if (!this.sendWaiterToCustomer(w)) r.timer = WAITER_PAUSE_MIN_SEC;
        return;
      }
      case 'toCustomer': {
        const customer = r.customer;
        if (!customer || !isServable(customer)) {
          this.sendWaiterToCounter(w); // they got up before the drink arrived
          return;
        }
        stepWalk(w, dt, r.face);
        if (w.state === CharacterState.WALK) return;
        r.phase = 'serving';
        r.timer = WAITER_SERVE_SEC;
        this.servedAt.set(customer, this.clockSec);
        const busy = new Set(this.chats.flatMap((c) => c.speakers));
        if (!busy.has(customer) && !busy.has(w)) {
          const place = this.placeOfOne(customer);
          this.chats.push(startChat([w, customer], waiterDialogue(place), place));
        }
        return;
      }
      case 'serving': {
        const inChat = this.chats.some((c) => c.speakers.includes(w));
        if (r.timer <= 0 && !inChat) this.sendWaiterToCounter(w);
        return;
      }
      case 'toCounter': {
        stepWalk(w, dt, Direction.DOWN);
        if (w.state === CharacterState.WALK) return;
        this.waiterRound = newWaiterRound(
          randomBetween(WAITER_PAUSE_MIN_SEC, WAITER_PAUSE_MAX_SEC),
        );
        return;
      }
    }
  }

  /** Pick someone seated (bar) or gaming (game room) not served lately, and
   *  walk to a free tile beside them. False if there is nobody to serve. */
  private sendWaiterToCustomer(w: Character): boolean {
    const due = this.getDrawnCharacters().filter(
      (c) =>
        c !== w &&
        isServable(c) &&
        this.clockSec - (this.servedAt.get(c) ?? -Infinity) > WAITER_RESERVE_SEC,
    );
    for (let i = due.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [due[i], due[j]] = [due[j], due[i]];
    }
    for (const customer of due.slice(0, 6)) {
      for (const spot of serveSpots(customer)) {
        if (!isWalkable(spot.col, spot.row, this.tileMap, this.blockedTiles)) continue;
        const here = w.tileCol === spot.col && w.tileRow === spot.row;
        const path = here
          ? []
          : findPath(w.tileCol, w.tileRow, spot.col, spot.row, this.tileMap, this.blockedTiles);
        if (!here && path.length === 0) continue;
        startWalk(w, path, spot.face);
        this.waiterRound = { phase: 'toCustomer', timer: 0, customer, face: spot.face };
        return true;
      }
    }
    return false;
  }

  private sendWaiterToCounter(w: Character): void {
    const home = this.waiterHomeTile(w);
    const path = findPath(
      w.tileCol,
      w.tileRow,
      home.col,
      home.row,
      this.tileMap,
      this.blockedTiles,
    );
    startWalk(w, path, Direction.DOWN);
    this.waiterRound = { phase: 'toCounter', timer: 0, customer: null, face: Direction.DOWN };
  }

  /** Where the waiter waits: the free bar-floor tile closest to the middle of
   *  the bar seats (any free tile if the map has no bar). */
  private waiterHomeTile(w: Character): { col: number; row: number } {
    if (this.waiterHome) return this.waiterHome;
    const onBar = (col: number, row: number) => this.beerFloors.has(this.tileMap[row]?.[col]);
    const barSeats = [...this.seats.values()].filter((s) => onBar(s.seatCol, s.seatRow));
    const tiles = this.walkableTiles.filter((t) => onBar(t.col, t.row));
    const pool = tiles.length > 0 ? tiles : this.walkableTiles;
    if (pool.length === 0) return { col: w.tileCol, row: w.tileRow };
    const mid =
      barSeats.length > 0
        ? {
            col: barSeats.reduce((a, s) => a + s.seatCol, 0) / barSeats.length,
            row: barSeats.reduce((a, s) => a + s.seatRow, 0) / barSeats.length,
          }
        : { col: w.tileCol, row: w.tileRow };
    const dist = (t: { col: number; row: number }) =>
      Math.abs(t.col - mid.col) + Math.abs(t.row - mid.row);
    this.waiterHome = [...pool].sort((a, b) => dist(a) - dist(b))[0];
    return this.waiterHome;
  }

  /** Uids of the sofa pieces; the lounge table setting (tray, fruit plates)
   *  and where each glass stands on the tray; and the chats running anywhere
   *  on the map. */
  private sofaUids = new Set<string>();
  private tableDecor: FurnitureInstance[] = [];
  private glassSlots: Array<{ x: number; y: number; zY: number }> = [];
  /** Floor types where characters drink beer (the bar room). */
  private beerFloors = new Set<TileTypeVal | undefined>();
  private chats: BarChat[] = [];

  private rebuildRestSpots(): void {
    this.restSpots = [];
    this.sofaUids = new Set(
      this.layout.furniture
        .filter((f) => f.type.startsWith(SOFA_FURNITURE_PREFIX))
        .map((f) => f.uid),
    );
    this.rebuildTableSetting();
    // Beer belongs to the bar: the floors its (non-sofa) seats stand on
    this.beerFloors = new Set(
      [...this.seats.values()]
        .filter((s) => !this.isSofaSeat(s.uid))
        .map((s) => this.tileMap[s.seatRow]?.[s.seatCol]),
    );
    for (const item of this.layout.furniture) {
      if (item.type === BED_FURNITURE_TYPE) {
        const entry = getCatalogEntry(item.type);
        const footprintW = entry?.footprintW ?? 1;
        const footprintH = entry?.footprintH ?? 2;
        for (let dc = 0; dc < footprintW; dc++) {
          this.restSpots.push({
            col: item.col + dc,
            row: item.row + footprintH - 1,
            kind: 'bed',
            bed: item.uid,
          });
        }
      } else if (item.type === GAMING_CHAIR_FURNITURE_TYPE) {
        this.restSpots.push({ col: item.col, row: item.row, kind: 'game' });
      }
    }
    // Drop assignments to spots that no longer exist
    for (const ch of [...this.characters.values(), ...this.patrons]) {
      const spot = ch.restSpot;
      if (spot && !this.restSpots.some((s) => sameSpot(s, spot))) ch.restSpot = null;
    }
  }

  /** Give a finished agent (or resting patron) a free bed or gaming PC; take it
   *  back once the character is up and off it. Agents bump patrons when full. */
  private updateRestAssignment(ch: Character): void {
    if (ch.isSubagent) return;
    // The boss never naps on the job: a gaming PC only via steerUserAvatar
    if (this.isUserAvatar(ch)) return;
    if (ch.isActive) {
      const spot = ch.restSpot;
      if (spot && (ch.tileCol !== spot.col || ch.tileRow !== spot.row)) ch.restSpot = null;
      return;
    }
    if (ch.restSpot || this.restSpots.length === 0) return;
    const holders = [...this.characters.values(), ...this.patrons];
    const taken = (s: RestSpot) => holders.some((o) => o.restSpot && sameSpot(o.restSpot, s));
    // The user's avatar plays only while the user really is in League (steerUserAvatar)
    let free = this.restSpots.filter(
      (s) => !taken(s) && !(s.kind === 'game' && this.isUserAvatar(ch)),
    );
    if (free.length === 0) {
      if (isPatron(ch)) return;
      const bumped = this.patrons.find(
        (p) => p.restSpot && !(this.isUserAvatar(p) && this.userInLeague()),
      );
      if (!bumped) return;
      ch.restSpot = bumped.restSpot!;
      bumped.restSpot = null; // its FSM gets up and wanders
      return;
    }
    const holderOf = (s: RestSpot) => holders.find((o) => o.restSpot && sameSpot(o.restSpot, s));
    const coupled = (o: Character) => storyTiesOf(characterNameOf(o)).partner !== null;
    const otherHalves = (s: RestSpot) =>
      this.restSpots.filter((h) => h.bed !== undefined && h.bed === s.bed && !sameSpot(h, s));
    // Storyline: couples always sleep together in one double bed
    if (isPatron(ch) && coupled(ch)) {
      const partner = this.storyAnchor(ch);
      const beds = free.filter((s) => s.kind === 'bed');
      const pick =
        beds.find((s) => partner && otherHalves(s).some((h) => holderOf(h) === partner)) ??
        beds.find((s) => otherHalves(s).every((h) => !taken(h)));
      if (pick) {
        ch.restSpot = { ...pick };
        return;
      }
    }
    // Everyone else leaves the empty half of a couple's bed alone
    const besideCouple = (s: RestSpot) =>
      otherHalves(s).some((h) => {
        const o = holderOf(h);
        return o !== undefined && coupled(o);
      });
    if (!coupled(ch) && free.some((s) => !besideCouple(s))) {
      free = free.filter((s) => !besideCouple(s));
    }
    // Storyline: rest beside the partner / buddy / leader when they are resting
    const anchorSpot = isPatron(ch) ? this.storyAnchor(ch)?.restSpot : null;
    // Otherwise sleep or play, at random, then the nearest free spot of that kind
    const kinds = [...new Set(free.map((s) => s.kind))];
    const kind =
      anchorSpot && kinds.includes(anchorSpot.kind)
        ? anchorSpot.kind
        : kinds[Math.floor(Math.random() * kinds.length)];
    const from = anchorSpot ?? { col: ch.tileCol, row: ch.tileRow };
    const dist = (s: RestSpot) => Math.abs(s.col - from.col) + Math.abs(s.row - from.row);
    const pick = free.filter((s) => s.kind === kind).sort((a, b) => dist(a) - dist(b))[0];
    ch.restSpot = { ...pick };
    if (isPatron(ch) && storyTiesOf(characterNameOf(ch)).wanderer) this.getLost(ch);
  }

  /** A free bar seat for a patron: not an agent's, not another patron's.
   *  Storyline ties pick the free seat nearest the partner / buddy / leader. */
  private pickPatronSeat(p: Character): string | null {
    if (this.isUserAvatar(p)) return null; // the boss doesn't sit down for a drink
    const used = new Set(this.patrons.filter((o) => o !== p && o.seatId).map((o) => o.seatId));
    const free = [...this.seats.values()].filter((s) => !s.assigned && !used.has(s.uid));
    if (free.length === 0) return null;
    const anchorSeatId = this.storyAnchor(p)?.seatId;
    const anchorSeat = anchorSeatId ? this.seats.get(anchorSeatId) : undefined;
    if (anchorSeat) {
      const dist = (s: Seat) =>
        Math.abs(s.seatCol - anchorSeat.seatCol) + Math.abs(s.seatRow - anchorSeat.seatRow);
      return free.sort((a, b) => dist(a) - dist(b))[0].uid;
    }
    // Often head for the lounge sofa, where patrons chat
    const sofa = free.filter((s) => this.isSofaSeat(s.uid));
    const pool = sofa.length > 0 && Math.random() < SOFA_SEAT_PREFERENCE ? sofa : free;
    return pool[Math.floor(Math.random() * pool.length)].uid;
  }

  /** Seat uids are the chair uid, or `uid:N` for the extra seats of a multi-seat piece. */
  private isSofaSeat(seatUid: string): boolean {
    return this.sofaUids.has(seatUid.split(':')[0]);
  }

  /** Lounge table setting: a round tray of water glasses in the middle of each
   *  lounge table, a plate of fruit on either side. World pixels; the glasses
   *  stand on the tray, the tray and plates on the table. */
  private rebuildTableSetting(): void {
    this.tableDecor = [];
    this.glassSlots = [];
    for (const item of this.layout.furniture) {
      if (item.type !== LOUNGE_TABLE_FURNITURE_TYPE) continue;
      const entry = getCatalogEntry(item.type);
      const centerX = item.col * TILE_SIZE + ((entry?.footprintW ?? 1) * TILE_SIZE) / 2;
      const topY = item.row * TILE_SIZE + LOUNGE_TABLE_TOP_PX;
      const zY = (item.row + (entry?.footprintH ?? 1)) * TILE_SIZE;
      const trayW = ROUND_TRAY[0].length;
      const trayX = Math.round(centerX - trayW / 2);
      const trayY = topY + 1;
      this.tableDecor.push({ sprite: ROUND_TRAY, x: trayX, y: trayY, zY: zY + 0.1 });
      const plateW = FRUIT_PLATE_LEFT[0].length;
      const plateY = topY + 2;
      this.tableDecor.push(
        {
          sprite: FRUIT_PLATE_LEFT,
          x: trayX - LOUNGE_PLATE_GAP_PX - plateW,
          y: plateY,
          zY: zY + 0.1,
        },
        {
          sprite: FRUIT_PLATE_RIGHT,
          x: trayX + trayW + LOUNGE_PLATE_GAP_PX,
          y: plateY,
          zY: zY + 0.1,
        },
      );
      // Two glasses at the back of the tray, two in front (drawn over the back pair)
      const glassH = TABLE_GLASS.length;
      for (const [dx, dy, dz] of TRAY_GLASS_OFFSETS) {
        this.glassSlots.push({ x: trayX + dx, y: trayY + dy - glassH, zY: zY + dz });
      }
    }
  }

  /** The table setting, minus the glasses someone is holding. */
  private glassInstances(): FurnitureInstance[] {
    const held = new Set<number>();
    for (const ch of this.getDrawnCharacters()) {
      if (ch.glassSlot !== null && ch.glassSlot !== undefined) held.add(ch.glassSlot);
    }
    return [
      ...this.tableDecor,
      ...this.glassSlots
        .filter((_, i) => !held.has(i))
        .map((spot) => ({ sprite: TABLE_GLASS, ...spot })),
    ];
  }

  /** Sofa sitters drink no beer: they sit, and every so often take a free glass
   *  off the tray, sip, and put it back. All glasses out — wait a moment. */
  private updateSofaSitting(dt: number): void {
    let glassesMoved = false;
    const drawn = this.getDrawnCharacters();
    for (const ch of drawn) {
      ch.noBeer = !this.beerFloors.has(this.tileMap[ch.tileRow]?.[ch.tileCol]);
      const seat = ch.seatId ? this.seats.get(ch.seatId) : undefined;
      const seated =
        ch.state === CharacterState.TYPE &&
        seat !== undefined &&
        this.isSofaSeat(seat.uid) &&
        ch.tileCol === seat.seatCol &&
        ch.tileRow === seat.seatRow;
      if (!seated) {
        if (ch.sipping) glassesMoved = true; // stood up: the glass goes back first
        ch.onSofa = false;
        ch.sipping = false;
        ch.glassSlot = null;
        continue;
      }
      if (!ch.onSofa) {
        ch.onSofa = true;
        ch.sipTimer = randomBetween(SOFA_SIP_GAP_MIN_SEC, SOFA_SIP_GAP_MAX_SEC);
      }
      ch.sipTimer = (ch.sipTimer ?? 0) - dt;
      if (ch.sipTimer > 0) continue;
      if (ch.sipping) {
        ch.sipping = false;
        ch.glassSlot = null;
        ch.sipTimer = randomBetween(SOFA_SIP_GAP_MIN_SEC, SOFA_SIP_GAP_MAX_SEC);
      } else {
        const held = new Set(drawn.map((o) => o.glassSlot));
        const free = this.glassSlots.findIndex((_, i) => !held.has(i));
        if (free === -1) {
          ch.sipTimer = SOFA_GLASS_RETRY_SEC;
          continue;
        }
        ch.sipping = true;
        ch.glassSlot = free;
        ch.sipTimer = SOFA_SIP_SEC;
      }
      ch.frame = 0;
      ch.frameTimer = 0;
      glassesMoved = true;
    }
    if (glassesMoved) this.rebuildFurnitureInstances();
  }

  /** Patrons close together anywhere on the map talk in pairs (speech lines
   *  over their heads). The user's avatar is busy while in League. */
  private updateChat(dt: number): void {
    if (this.exercise) {
      updateExerciseChatter(this.exercise, dt);
      return;
    }
    const talkers = [
      ...[...this.characters.values()].filter((ch) => !ch.matrixEffect),
      ...this.getVisiblePatrons().filter((p) => this.gameTitle(p) === null),
    ];
    // The waiter only talks while serving (see updateWaiter)
    this.chats = updateChats(
      this.chats,
      talkers,
      characterNameOf,
      dt,
      (a, b) => !this.isWaiter(a) && !this.isWaiter(b),
      (a, b) => this.chatPlace(a, b),
    );
    const talking = new Set(talkers);
    for (const ch of [...this.characters.values(), ...this.patrons]) {
      if (!talking.has(ch)) ch.speech = null;
    }
  }

  /** Where a pair is chatting: the sofa or the game room if either is there, else the bar. */
  private chatPlace(a: Character, b: Character): ChatPlace {
    const places = [this.placeOfOne(a), this.placeOfOne(b)];
    if (places.includes('sofa')) return 'sofa';
    if (places.includes('game')) return 'game';
    return 'bar';
  }

  private placeOfOne(ch: Character): ChatPlace {
    if (ch.onSofa) return 'sofa';
    if (ch.state === CharacterState.GAME) return 'game';
    const floor = this.tileMap[ch.tileRow]?.[ch.tileCol];
    const gameRoom = this.restSpots.some(
      (s) => s.kind === 'game' && this.tileMap[s.row]?.[s.col] === floor,
    );
    return gameRoom ? 'game' : 'bar';
  }

  /** Walkers who bumped into someone stop for the hello (see barChat 'street'
   *  chats): partner by walker, for this frame. */
  private heldForHello(): Map<Character, Character> {
    const held = new Map<Character, Character>();
    for (const chat of this.chats) {
      if (chat.place !== 'street') continue;
      const [a, b] = chat.speakers;
      if (a.state === CharacterState.WALK) held.set(a, b);
      if (b.state === CharacterState.WALK) held.set(b, a);
    }
    return held;
  }

  /** Stand still mid-way, turned to the one being greeted. */
  private holdForHello(ch: Character, partner: Character): void {
    ch.frame = 1;
    ch.frameTimer = 0;
    const dx = partner.x - ch.x;
    const dy = partner.y - ch.y;
    if (Math.abs(dx) >= Math.abs(dy)) ch.dir = dx >= 0 ? Direction.RIGHT : Direction.LEFT;
    else ch.dir = dy >= 0 ? Direction.DOWN : Direction.UP;
  }

  /** A drawn character (visible patron or agent) by storyline name. */
  private characterNamed(name: string | null): Character | null {
    if (!name) return null;
    const all = [...this.characters.values(), ...this.getVisiblePatrons()];
    return all.find((c) => !c.isSubagent && characterNameOf(c) === name) ?? null;
  }

  private storyAnchor(ch: Character): Character | null {
    return this.characterNamed(storyAnchorName(storyTiesOf(characterNameOf(ch))));
  }

  /** Storyline wanderer: a few wrong turns on the way to the next destination. */
  private getLost(ch: Character): void {
    ch.lostDetours =
      STORY_WANDERER_DETOURS_MIN +
      Math.floor(Math.random() * (STORY_WANDERER_DETOURS_MAX - STORY_WANDERER_DETOURS_MIN + 1));
  }

  /** Storyline extras for one patron each frame: follow, sync, hearts, wrong turns. */
  private updateStory(p: Character, dt: number, wasActive: boolean): void {
    const ties = storyTiesOf(characterNameOf(p));

    // Followers wander near their leader
    const leader = this.characterNamed(ties.leader);
    p.wanderAnchor = leader ? { col: leader.tileCol, row: leader.tileRow } : null;

    if (p.isActive !== wasActive) {
      if (p.isActive && ties.wanderer) this.getLost(p);
      // Partner / buddy follows suit shortly (only if it isn't doing the same already)
      const mate = this.characterNamed(storySyncName(ties));
      if (mate && isPatron(mate) && mate.isActive !== p.isActive) {
        mate.patronTimer = Math.min(mate.patronTimer ?? 0, STORY_SYNC_DELAY_SEC);
      }
    }

    // Couples close together show a heart now and then
    p.heartTimer = Math.max(0, (p.heartTimer ?? 0) - dt);
    p.heartCooldown = Math.max(0, (p.heartCooldown ?? 0) - dt);
    const partner = this.characterNamed(ties.partner);
    if (
      partner &&
      p.heartCooldown === 0 &&
      Math.abs(partner.tileCol - p.tileCol) + Math.abs(partner.tileRow - p.tileRow) <=
        STORY_HEART_RANGE_TILES
    ) {
      p.heartTimer = STORY_HEART_SHOW_SEC;
      p.heartCooldown =
        STORY_HEART_COOLDOWN_MIN_SEC +
        Math.random() * (STORY_HEART_COOLDOWN_MAX_SEC - STORY_HEART_COOLDOWN_MIN_SEC);
    }
  }

  /** Keep one patron per loaded character sprite (the count grows once PNGs load). */
  private ensurePatrons(): void {
    if (!BAR_PATRONS_ENABLED || this.walkableTiles.length === 0) return;
    const count = getLoadedCharacterCount();
    if (this.patrons.length === count) return;
    this.patrons = [];
    for (let i = 0; i < count; i++) {
      const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
      this.patrons.push(createPatron(i, i, spawn.col, spawn.row));
    }
  }

  private updatePatron(p: Character, dt: number): void {
    // An agent took this patron's seat — give it up
    if (p.seatId) {
      const seat = this.seats.get(p.seatId);
      if (!seat || seat.assigned) sendPatronToRest(p, PATRON_SEAT_RETRY_SEC);
    }
    if (this.isUserAvatar(p)) this.steerUserAvatar(p);
    const wasActive = p.isActive;
    tickPatronSchedule(p, dt, () => this.pickPatronSeat(p));
    this.updateStory(p, dt, wasActive);
    if (this.isUserAvatar(p)) this.steerBossRounds(p, dt);
    this.updateRestAssignment(p);
    this.withOwnRestSpotUnblocked(p, () =>
      this.withOwnSeatUnblocked(p, () =>
        updateCharacter(p, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles),
      ),
    );
  }

  /** Temporarily unblock a character's own rest tile, run fn, then re-block */
  private withOwnRestSpotUnblocked<T>(ch: Character, fn: () => T): T {
    const key = ch.restSpot ? `${ch.restSpot.col},${ch.restSpot.row}` : null;
    const wasBlocked = key ? this.blockedTiles.delete(key) : false;
    const result = fn();
    if (key && wasBlocked) this.blockedTiles.add(key);
    return result;
  }

  /** Collect every tile occupied by electronics furniture (PCs, monitors, etc.). */
  private buildElectronicsTileSet(): Set<string> {
    const out = new Set<string>();
    for (const item of this.layout.furniture) {
      const entry = getCatalogEntry(item.type);
      if (!entry || entry.category !== 'electronics') continue;
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          out.add(`${item.col + dc},${item.row + dr}`);
        }
      }
    }
    return out;
  }

  /** Find the area label assigned to a seat's tile, or null. Public for e2e
   *  observability (getAgentSeats hook reads a seated agent's area). */
  seatZone(uid: string): string | null {
    const seat = this.seats.get(uid);
    if (!seat) return null;
    const tiles = this.layout.areaTiles;
    if (!tiles || tiles.length === 0) return null;
    const idx = seat.seatRow * this.layout.cols + seat.seatCol;
    if (idx < 0 || idx >= tiles.length) return null;
    return tiles[idx] ?? null;
  }

  /**
   * Does this seat face an electronics tile (PC, monitor)? Mirrors the
   * forward-and-flanking scan used by furniture auto-state.
   */
  private isSeatFacingElectronics(seat: Seat, electronicsTiles: Set<string>): boolean {
    const { dCol, dRow } = seatFacingOffset(seat.facingDir);
    for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
      const tileCol = seat.seatCol + dCol * d;
      const tileRow = seat.seatRow + dRow * d;
      if (electronicsTiles.has(`${tileCol},${tileRow}`)) return true;
      if (dCol !== 0) {
        if (
          electronicsTiles.has(`${tileCol},${tileRow - 1}`) ||
          electronicsTiles.has(`${tileCol},${tileRow + 1}`)
        ) {
          return true;
        }
      } else if (
        electronicsTiles.has(`${tileCol - 1},${tileRow}`) ||
        electronicsTiles.has(`${tileCol + 1},${tileRow}`)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Random-pick a seat from a candidate list, biased toward seats that face an
   * electronics tile. Returns null when the candidate list is empty.
   */
  private pickFromSeats(seatUids: string[], electronicsTiles: Set<string>): string | null {
    if (seatUids.length === 0) return null;
    const pcSeats: string[] = [];
    const otherSeats: string[] = [];
    for (const uid of seatUids) {
      const seat = this.seats.get(uid);
      if (!seat) continue;
      if (this.isSeatFacingElectronics(seat, electronicsTiles)) {
        pcSeats.push(uid);
      } else {
        otherSeats.push(uid);
      }
    }
    if (pcSeats.length > 0) return pcSeats[Math.floor(Math.random() * pcSeats.length)];
    if (otherSeats.length > 0) return otherSeats[Math.floor(Math.random() * otherSeats.length)];
    return null;
  }

  /**
   * 3-stage seat picker for top-level agents.
   *
   *   Stage 1: If `directoryName` is given and `areaMappings[directoryName]` lists
   *            Area labels, prefer free seats whose tile is labeled with one
   *            of those areas.
   *   Stage 2: Prefer free seats whose tile has NO area label (unzoned).
   *   Stage 3: Any free seat.
   *
   * Each stage routes through `pickFromSeats` for the PC-bias rule. Returns
   * null only when every seat is already occupied. Passing `undefined`
   * preserves pre-Areas single-stage behavior (skips Stage 1; Stage 2 picks
   * unzoned seats from a layout without `areaTiles`, which is every seat).
   */
  private findFreeSeat(directoryName?: string): string | null {
    const electronicsTiles = this.buildElectronicsTileSet();
    const freeSeats: string[] = [];
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) freeSeats.push(uid);
    }
    if (freeSeats.length === 0) return null;

    const areaLabels = directoryName ? this.areaMappings[directoryName] : undefined;

    // Stage 1 — in-area seats for the Directory's mapped Area labels.
    if (areaLabels && areaLabels.length > 0) {
      const wanted = new Set(areaLabels);
      const inArea = freeSeats.filter((uid) => {
        const label = this.seatZone(uid);
        return label !== null && wanted.has(label);
      });
      const pick = this.pickFromSeats(inArea, electronicsTiles);
      if (pick) return pick;
    }

    // Stage 2 — unzoned seats (no area label, or layout has no areas at all).
    const unzoned = freeSeats.filter((uid) => this.seatZone(uid) === null);
    const pick2 = this.pickFromSeats(unzoned, electronicsTiles);
    if (pick2) return pick2;

    // Stage 3 — any free seat.
    return this.pickFromSeats(freeSeats, electronicsTiles);
  }

  /** Closest walkable tile to (col,row) not occupied by another character, or null. */
  private closestFreeWalkableTile(col: number, row: number): { col: number; row: number } | null {
    const occupied = new Set<string>();
    for (const ch of this.characters.values()) {
      occupied.add(`${ch.tileCol},${ch.tileRow}`);
    }
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (const tile of this.walkableTiles) {
      if (occupied.has(`${tile.col},${tile.row}`)) continue;
      const d = Math.abs(tile.col - col) + Math.abs(tile.row - row);
      if (d < bestDist) {
        best = tile;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const paletteCount = getLoadedCharacterCount();
    const counts = new Array(paletteCount).fill(0) as number[];
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      if (ch.palette < paletteCount) counts[ch.palette]++;
    }
    // Staff skins are theirs alone: never handed to an agent
    for (const i of STAFF_PALETTES) {
      if (i < paletteCount && STAFF_PALETTES.size < paletteCount) counts[i] = Infinity;
    }
    return pickDiversePalette(paletteCount, counts);
  }

  addAgent(
    id: number,
    preferredPalette?: number,
    preferredHueShift?: number,
    preferredSeatId?: string,
    skipSpawnEffect?: boolean,
    directoryName?: string,
    nearAgentId?: number,
  ): void {
    if (this.characters.has(id)) return;

    let palette: number;
    let hueShift: number;
    // A saved skin that now belongs to the staff is re-picked
    if (preferredPalette !== undefined && !STAFF_PALETTES.has(preferredPalette)) {
      palette = preferredPalette;
      hueShift = preferredHueShift ?? 0;
    } else {
      const pick = this.pickDiversePalette();
      palette = pick.palette;
      hueShift = pick.hueShift;
    }

    // Try preferred seat first, then (for teammates) the seat closest to the
    // anchor agent, then any free seat. anchorTile resolves to the anchor's SEAT
    // (stable from creation) rather than its live tile, so a teammate placed while
    // the lead is still walking to its seat still clusters around the final seat.
    const anchor = nearAgentId !== undefined ? this.characters.get(nearAgentId) : undefined;
    const anchorAt = anchorTile(anchor, this.seats);
    let seatId: string | null = null;
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!;
      if (!seat.assigned) {
        seatId = preferredSeatId;
      }
    }
    if (!seatId && anchorAt) {
      seatId = closestFreeSeat(this.seats, anchorAt.col, anchorAt.row);
    }
    if (!seatId) {
      seatId = this.findFreeSeat(directoryName);
    }

    let ch: Character;
    if (seatId) {
      const seat = this.seats.get(seatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, seatId, seat, hueShift);
    } else {
      // No seats — teammates spawn beside their anchor, others at a random walkable tile
      let spawn = anchorAt ? this.closestFreeWalkableTile(anchorAt.col, anchorAt.row) : null;
      if (!spawn) {
        spawn =
          this.walkableTiles.length > 0
            ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
            : { col: 1, row: 1 };
      }
      ch = createCharacter(id, palette, null, null, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
    }

    if (directoryName) {
      ch.directoryName = directoryName;
    }
    if (!skipSpawnEffect) {
      startMatrixEffect(ch, 'spawn');
    }
    this.characters.set(id, ch);
  }

  // ── Greeter ───────────────────────────────────────────────────
  // The Intro is diegetic: a char_0 character stands near the office's
  // bottom-left corner and "speaks" the tour through a DOM bubble
  // (IntroBubble). It is not an agent — see the `greeter` field.

  /** Spawn the greeter near the office's bottom-left corner: target tile
   *  GREETER_TILE_MARGIN in from the left and bottom edges, falling
   *  back to the closest walkable tile when the target is a seat, furniture,
   *  a wall, or VOID (seat tiles are in blockedTiles, so closestFreeWalkableTile
   *  covers every one of those). Idempotent; a remount mid-despawn (StrictMode)
   *  revives it. */
  spawnGreeter(): void {
    this.greeterCameraCancelled = false;
    if (this.greeter) {
      if (this.greeter.matrixEffect === 'despawn') startMatrixEffect(this.greeter, 'spawn');
      return;
    }
    const spawn = this.closestFreeWalkableTile(
      GREETER_TILE_MARGIN,
      this.layout.rows - 1 - GREETER_TILE_MARGIN,
    );
    if (!spawn) return; // no walkable tile — IntroBubble falls back to a fixed panel
    const ch = createCharacter(GREETER_ID, 0, null, null, 0);
    ch.isGreeter = true;
    ch.state = CharacterState.IDLE;
    ch.isActive = false;
    ch.dir = Direction.DOWN;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    startMatrixEffect(ch, 'spawn');
    this.greeter = ch;
  }

  /** Start the greeter's despawn effect and release the greeter camera. The
   *  character is dropped once the effect finishes (see update()).
   *  Idempotent — every close path (answer, Escape, hooksStatus) funnels here. */
  despawnGreeter(): void {
    this.greeterCameraTarget = null;
    this.greeterCameraCancelled = false;
    if (!this.greeter || this.greeter.matrixEffect === 'despawn') return;
    startMatrixEffect(this.greeter, 'despawn');
  }

  /** Per-frame update from the bubble overlay; ignored once the user panned. */
  setGreeterCameraTarget(p: { x: number; y: number }): void {
    if (!this.greeterCameraCancelled) this.greeterCameraTarget = p;
  }

  /** Manual pan during the ask: stop re-centering until the next spawn. */
  cancelGreeterCamera(): void {
    this.greeterCameraTarget = null;
    this.greeterCameraCancelled = true;
  }

  /** Every manual pan (mouse, wheel, touch) takes the camera back from both
   *  automatic drivers: character follow and the greeter's ask. */
  breakCameraFollow(): void {
    this.cameraFollowId = null;
    this.cancelGreeterCamera();
  }

  /** Select an agent's character and have the camera follow it — what a card
   *  tap does to the office. No-op for an agent with no character. */
  selectAndFollow(id: number): void {
    if (!this.characters.has(id)) return;
    this.selectedAgentId = id;
    this.cameraFollowId = id;
  }

  /** The agent that owns `id`'s terminal: a sub-agent's parent, else itself. */
  terminalOwnerOf(id: number): number {
    return this.subagentMeta.get(id)?.parentAgentId ?? id;
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (ch.matrixEffect === 'despawn') return; // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
    // Start despawn animation instead of immediate delete
    startMatrixEffect(ch, 'despawn');
    ch.bubbleType = null;
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid;
    }
    return null;
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId);
    if (!ch) return;
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId);
      if (old) old.assigned = false;
    }
    // Assign new seat
    const seat = this.seats.get(seatId);
    if (!seat || seat.assigned) return;
    seat.assigned = true;
    ch.seatId = seatId;
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
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
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /**
   * Move a just-linked teammate to the free seat closest to its lead, so teams
   * cluster. Only moves when that seat is strictly closer than the teammate's
   * current one — a teammate created as a plain external agent (seated by an
   * arbitrary findFreeSeat) and tagged as a teammate only after tag discovery
   * would otherwise keep its arbitrary seat, unlike an inline teammate seated
   * next to the lead at creation.
   */
  private reseatNextToLead(teammateId: number, leadId: number): void {
    const teammate = this.characters.get(teammateId);
    const lead = this.characters.get(leadId);
    if (!teammate || !lead) return;
    const anchorAt = anchorTile(lead, this.seats);
    if (!anchorAt) return;
    const target = closestFreeSeat(this.seats, anchorAt.col, anchorAt.row);
    if (!target || target === teammate.seatId) return;
    const targetSeat = this.seats.get(target)!;
    const targetDist =
      Math.abs(targetSeat.seatCol - anchorAt.col) + Math.abs(targetSeat.seatRow - anchorAt.row);
    const currentSeat = teammate.seatId ? this.seats.get(teammate.seatId) : undefined;
    const currentDist = currentSeat
      ? Math.abs(currentSeat.seatCol - anchorAt.col) + Math.abs(currentSeat.seatRow - anchorAt.row)
      : Infinity;
    if (targetDist < currentDist) {
      this.reassignSeat(teammateId, target);
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId) return;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return;
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId);
    if (!ch || ch.isSubagent) return false;
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch);
      if (!key || key !== `${col},${row}`) return false;
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles),
    );
    if (path.length === 0) return false;
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
    return true;
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`;
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!;

    const id = this.nextSubagentId--;
    const parentCh = this.characters.get(parentAgentId);
    const palette = parentCh ? parentCh.palette : 0;
    const hueShift = parentCh ? parentCh.hueShift : 0;

    // Find the closest walkable tile to the parent, avoiding tiles occupied by other characters
    const parentCol = parentCh ? parentCh.tileCol : 0;
    const parentRow = parentCh ? parentCh.tileRow : 0;
    let spawn = { col: parentCol, row: parentRow };
    if (this.walkableTiles.length > 0) {
      spawn = this.closestFreeWalkableTile(parentCol, parentRow) ?? this.walkableTiles[0];
    }

    const ch = createCharacter(id, palette, null, null, hueShift);
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    // Face the same direction as the parent agent
    if (parentCh) ch.dir = parentCh.dir;
    ch.isSubagent = true;
    ch.parentAgentId = parentAgentId;
    startMatrixEffect(ch, 'spawn');
    this.characters.set(id, ch);

    this.subagentIdMap.set(key, id);
    this.subagentMeta.set(id, { parentAgentId, parentToolId });
    return id;
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`;
    const id = this.subagentIdMap.get(key);
    if (id === undefined) return;

    const ch = this.characters.get(id);
    if (ch) {
      if (ch.matrixEffect === 'despawn') {
        // Already despawning — just clean up maps
        this.subagentIdMap.delete(key);
        this.subagentMeta.delete(id);
        return;
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId);
        if (seat) seat.assigned = false;
      }
      // Start despawn animation — keep character in map for rendering
      startMatrixEffect(ch, 'despawn');
      ch.bubbleType = null;
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key);
    this.subagentMeta.delete(id);
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = [];
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id);
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id);
        if (ch) {
          if (ch.matrixEffect === 'despawn') {
            // Already despawning — just clean up maps
            this.subagentMeta.delete(id);
            toRemove.push(key);
            continue;
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId);
            if (seat) seat.assigned = false;
          }
          // Start despawn animation
          startMatrixEffect(ch, 'despawn');
          ch.bubbleType = null;
        }
        this.subagentMeta.delete(id);
        if (this.selectedAgentId === id) this.selectedAgentId = null;
        if (this.cameraFollowId === id) this.cameraFollowId = null;
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key);
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null;
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.isActive = active;
      if (!active) {
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1;
        ch.path = [];
        ch.moveProgress = 0;
      }
      this.rebuildFurnitureInstances();
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>();
    // Gaming PCs light up while someone plays at them (the desk is above the chair)
    for (const ch of [...this.characters.values(), ...this.patrons]) {
      if (ch.state !== CharacterState.GAME || !ch.restSpot) continue;
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        autoOnTiles.add(`${ch.restSpot.col},${ch.restSpot.row - d}`);
      }
    }
    for (const ch of [...this.characters.values(), ...this.patrons]) {
      if (!ch.isActive || !ch.seatId) continue;
      const seat = this.seats.get(ch.seatId);
      if (!seat) continue;
      // Find the desk tile(s) the agent faces from their seat
      const dCol =
        seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0;
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0;
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d;
        const tileRow = seat.seatRow + dRow * d;
        autoOnTiles.add(`${tileCol},${tileRow}`);
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d;
        const baseRow = seat.seatRow + dRow * d;
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`);
          autoOnTiles.add(`${baseCol},${baseRow + 1}`);
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`);
          autoOnTiles.add(`${baseCol + 1},${baseRow}`);
        }
      }
    }

    if (autoOnTiles.size === 0) {
      this.furniture = [
        ...layoutToFurnitureInstances(this.layout.furniture),
        ...this.glassInstances(),
      ];
      return;
    }

    // Build modified furniture list with auto-state and animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type);
      if (!entry) return item;
      // Check if any tile of this furniture overlaps an auto-on tile
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            let onType = getOnStateType(item.type);
            if (onType !== item.type) {
              // Check if the on-state type has animation frames
              const frames = getAnimationFrames(onType);
              if (frames && frames.length > 1) {
                const frameIdx = animFrame % frames.length;
                onType = frames[frameIdx];
              }
              return { ...item, type: onType };
            }
            return item;
          }
        }
      }
      return item;
    });

    this.furniture = [...layoutToFurnitureInstances(modifiedFurniture), ...this.glassInstances()];
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.currentTool = tool;
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'permission';
      ch.bubbleTimer = 0;
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    }
  }

  showWaitingBubble(id: number, awaitingInput = false): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'waiting';
      ch.waitingAwaitingInput = awaitingInput;
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || !ch.bubbleType) return;
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    } else if (ch.bubbleType === 'waiting') {
      // Trigger immediate fade (0.3s remaining)
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
    }
  }

  // ── Pets ──────────────────────────────────────────────────────

  /**
   * Add a pet to the live runtime. Spawns at a uniformly-random walkable tile.
   * Mirror in `this.layout.pets` so debounced saveLayout serialises the roster.
   * Bounds-checks petType against the loaded sprite count to defend against stale layouts.
   */
  addPet(placedPet: PlacedPet): void {
    // Defensive guards (upstream 5e6c0a0)
    if (
      typeof placedPet.id !== 'string' ||
      placedPet.id.length === 0 ||
      placedPet.id.length > MAX_PET_ID_LENGTH
    ) {
      return;
    }
    if (
      !Number.isInteger(placedPet.petType) ||
      placedPet.petType < 0 ||
      placedPet.petType >= getPetCount()
    ) {
      return;
    }
    if (this.pets.some((p) => p.id === placedPet.id)) return; // de-dupe
    if (this.walkableTiles.length === 0) return; // no spawn space — silently drop

    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    const pet = createPet(placedPet.id, placedPet.petType, spawn.col, spawn.row);
    pet.name = getPetName(placedPet.petType);
    this.pets.push(pet);
    this.syncLayoutPets();
  }

  /** Remove a pet by id. Idempotent. */
  removePet(id: string): void {
    const before = this.pets.length;
    this.pets = this.pets.filter((p) => p.id !== id);
    if (this.pets.length !== before) {
      this.syncLayoutPets();
    }
  }

  /** Shallow snapshot for external consumers (renderer, hooks). */
  getPets(): Pet[] {
    return this.pets.slice();
  }

  /** Unique petType values currently placed. Used by the Pets toolbar to mark active rows. */
  getActivePetTypes(): number[] {
    const seen = new Set<number>();
    for (const p of this.pets) seen.add(p.petType);
    return Array.from(seen);
  }

  /**
   * Hit-test pets at a pixel world position. Sorts back-to-front (largest y wins on tie)
   * so the visually-frontmost pet receives the click.
   * Returns the pet id or null.
   */
  getPetAt(worldX: number, worldY: number): string | null {
    const ordered = this.pets.slice().sort((a, b) => b.y - a.y);
    for (const pet of ordered) {
      const left = pet.x - PET_HIT_HALF_WIDTH;
      const right = pet.x + PET_HIT_HALF_WIDTH;
      const top = pet.y - PET_HIT_HEIGHT;
      const bottom = pet.y;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return pet.id;
      }
    }
    return null;
  }

  /** Show the heart bubble on a pet for WAITING_BUBBLE_DURATION_SEC. */
  showPetBubble(petId: string): void {
    const pet = this.pets.find((p) => p.id === petId);
    if (!pet) return;
    pet.bubbleType = 'heart';
    pet.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
  }

  /** Dismiss the heart bubble on click; collapses timer to a fast fade. */
  dismissPetBubble(petId: string): void {
    const pet = this.pets.find((p) => p.id === petId);
    if (!pet || !pet.bubbleType) return;
    pet.bubbleTimer = Math.min(pet.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
  }

  /**
   * Reconcile `this.pets` to match the layout's placed-pet roster.
   * - Pets in layout but not in runtime → spawn via addPet().
   * - Pets in runtime but not in layout → remove.
   * - Pets in both → keep existing runtime state (position, FSM).
   *
   * Called from constructor and rebuildFromLayout. Always runs AFTER walkableTiles
   * is populated.
   */
  private rebuildPetsFromLayout(layout: OfficeLayout): void {
    const placed = layout.pets ?? [];
    const placedIds = new Set(placed.map((p) => p.id));

    // 1. Remove pets no longer in layout
    this.pets = this.pets.filter((p) => placedIds.has(p.id));

    // 2. Add pets that exist in layout but not in runtime
    const existingIds = new Set(this.pets.map((p) => p.id));
    for (const p of placed) {
      if (existingIds.has(p.id)) continue;
      this.addPet(p); // pushes onto this.pets, calls syncLayoutPets()
    }
    // syncLayoutPets() inside addPet keeps this.layout.pets coherent; one final
    // sync handles the removal-only branch where addPet was never called.
    this.syncLayoutPets();
  }

  /**
   * Re-export the current pet roster into `this.layout.pets`. Called only from
   * mutating methods (addPet / removePet / rebuildPetsFromLayout) — NEVER from
   * getLayout(), which runs on every render frame.
   */
  private syncLayoutPets(): void {
    this.layout.pets = this.pets.map((p) => ({ id: p.id, petType: p.petType }));
  }

  setTeamInfo(
    id: number,
    teamName?: string,
    agentName?: string,
    isTeamLead?: boolean,
    leadAgentId?: number,
    teamUsesTmux?: boolean,
  ): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    const wasUnlinked = ch.leadAgentId === undefined;
    ch.teamName = teamName;
    ch.agentName = agentName;
    ch.isTeamLead = isTeamLead;
    ch.leadAgentId = leadAgentId;
    if (teamUsesTmux !== undefined) {
      ch.teamUsesTmux = teamUsesTmux;
    }
    // A teammate is not a headless agent: clicking it focuses its lead's terminal.
    // Adopted sessions are marked headless at creation and only later discovered
    // to be teammates, so drop the mark once the link lands.
    if (leadAgentId !== undefined) {
      ch.isHeadless = false;
    }
    // A teammate discovered only after its plain external session was adopted is
    // linked here, not at creation, so it never went through the seat-next-to-lead
    // path addAgent runs for inline teammates. Cluster it now, once, on first link.
    if (wasUnlinked && leadAgentId !== undefined && !isTeamLead) {
      this.reseatNextToLead(id, leadAgentId);
    }
  }

  /** Mark an agent as headless (adopted, no terminal to focus). */
  setHeadless(id: number, headless: boolean): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.isHeadless = headless;
  }

  setAgentContext(id: number, contextTokens: number, maxContextTokens: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.contextTokens = contextTokens;
    ch.maxContextTokens = maxContextTokens;
  }

  /** Exercise break: every agent and visible patron walks to a line on the
   *  floor, then they all work out together. Fires on its own every
   *  EXERCISE_INTERVAL_MS; callable directly to start one now. */
  startExercise(): void {
    this.nextExerciseAt = Date.now() + EXERCISE_INTERVAL_MS;
    if (this.exercise) return;
    const members = [
      ...[...this.characters.values()].filter((ch) => !ch.matrixEffect),
      ...this.getVisiblePatrons(),
    ];
    if (members.length === 0) return;
    // End any chats: the break has its own lines
    for (const ch of members) ch.speech = null;
    this.chats = [];
    // The boss coaches from in front of the line rather than standing in it
    const coach = members.find((ch) => this.isUserAvatar(ch)) ?? null;
    if (coach) members.splice(members.indexOf(coach), 1);
    const near = {
      col: Math.round(members.reduce((s, ch) => s + ch.tileCol, 0) / members.length),
      row: Math.round(members.reduce((s, ch) => s + ch.tileRow, 0) / members.length),
    };
    const lineSlots = pickLineSlots(members.length, this.walkableTiles, near);
    if (coach) {
      const front = this.coachSpot(lineSlots);
      const path = front
        ? findPath(
            coach.tileCol,
            coach.tileRow,
            front.col,
            front.row,
            this.tileMap,
            this.blockedTiles,
          )
        : [];
      joinExercise(coach, path, front?.facing);
    }
    // Left-to-right into left-to-right slots, so paths cross as little as possible
    const slots = lineSlots.sort((a, b) => a.col - b.col || a.row - b.row);
    members.sort((a, b) => a.tileCol - b.tileCol || a.tileRow - b.tileRow);
    members.forEach((ch, i) => {
      const slot = slots[i];
      const path = slot
        ? findPath(ch.tileCol, ch.tileRow, slot.col, slot.row, this.tileMap, this.blockedTiles)
        : [];
      joinExercise(ch, path);
    });
    if (coach) members.push(coach);
    this.exercise = { phase: 'gather', timer: 0, members, coach, chatTimer: 0 };
  }

  /** Where the coach stands: centred in front of the first row (two tiles
   *  out, facing up at the line), else behind it facing the same way. */
  private coachSpot(
    slots: Array<{ col: number; row: number }>,
  ): { col: number; row: number; facing: Direction } | null {
    const first = slots[0];
    if (!first) return null;
    const row = slots.filter((s) => s.row === first.row);
    const col = row[Math.floor(row.length / 2)].col;
    const taken = new Set(slots.map((s) => `${s.col},${s.row}`));
    const open = (r: number) =>
      !taken.has(`${col},${r}`) && this.walkableTiles.some((t) => t.col === col && t.row === r);
    for (const dr of [2, 3, 1]) {
      if (open(first.row + dr)) return { col, row: first.row + dr, facing: Direction.UP };
    }
    for (const dr of [-2, -1]) {
      if (open(first.row + dr)) return { col, row: first.row + dr, facing: Direction.DOWN };
    }
    return null;
  }

  /** Gather → workout once the line has formed (or the wait ran out) → done. */
  private tickExercise(dt: number): void {
    const ex = this.exercise;
    if (!ex) return;
    ex.timer += dt;
    if (ex.phase === 'gather') {
      const formed = ex.members.every((ch) => ch.state !== CharacterState.WALK);
      if (!formed && ex.timer < EXERCISE_GATHER_MAX_SEC) return;
      for (const ch of ex.members) beginWorkout(ch);
      ex.phase = 'workout';
      ex.timer = 0;
      return;
    }
    if (ex.timer >= EXERCISE_WORKOUT_SEC) this.stopExercise();
  }

  /** Whether an exercise break is running right now. */
  isExercising(): boolean {
    return this.exercise !== null;
  }

  /** End the break now; everyone goes back to what they were doing. */
  stopExercise(): void {
    if (!this.exercise) return;
    for (const ch of this.exercise.members) endWorkout(ch);
    this.exercise = null;
    this.waiterRound = newWaiterRound(WAITER_PAUSE_MIN_SEC);
  }

  update(dt: number): void {
    this.clockSec += dt;
    // Furniture animation cycling
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    this.furnitureAnimTimer += dt;
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    if (newFrame !== prevFrame) {
      this.rebuildFurnitureInstances();
    }

    // The greeter materializes and dematerializes like anyone else, but runs
    // no FSM — it stands where it spawned for as long as the ask is up.
    if (this.greeter && advanceMatrixEffect(this.greeter, dt) === 'despawned') {
      this.greeter = null;
    }

    if (!this.exercise && Date.now() >= this.nextExerciseAt) this.startExercise();
    const inLine = new Set(this.exercise?.members);
    const held = this.heldForHello();

    const toDelete: number[] = [];
    for (const ch of this.characters.values()) {
      const effect = advanceMatrixEffect(ch, dt);
      if (effect !== 'none') {
        if (effect === 'despawned') toDelete.push(ch.id);
        continue; // skip normal FSM while the effect is (or just was) active
      }

      const partner = held.get(ch);
      if (inLine.has(ch)) {
        updateExerciser(ch, dt);
      } else if (partner) {
        this.holdForHello(ch, partner);
      } else {
        this.updateRestAssignment(ch);

        // Temporarily unblock own seat (and rest spot) so character can pathfind to it
        this.withOwnRestSpotUnblocked(ch, () =>
          this.withOwnSeatUnblocked(ch, () =>
            updateCharacter(
              ch,
              dt,
              this.walkableTiles,
              this.seats,
              this.tileMap,
              this.blockedTiles,
            ),
          ),
        );
      }

      // Tick bubble timer for waiting bubbles
      if (ch.bubbleType === 'waiting') {
        ch.bubbleTimer -= dt;
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null;
          ch.bubbleTimer = 0;
        }
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id);
    }

    // ── Bar patrons ────────────────────────────────────────────
    this.ensurePatrons();
    const twins = this.agentPaletteKeys();
    for (const p of this.patrons) {
      if (twins.has(p.palette)) {
        // Its agent twin is here — hold no seat or rest spot while hidden
        if (p.seatId || p.isActive) sendPatronToRest(p, PATRON_SEAT_RETRY_SEC);
        p.restSpot = null;
        continue;
      }
      const partner = held.get(p);
      if (inLine.has(p)) updateExerciser(p, dt);
      else if (partner) this.holdForHello(p, partner);
      else if (this.isWaiter(p)) this.updateWaiter(p, dt);
      else this.updatePatron(p, dt);
    }
    this.tickExercise(dt);
    this.updateSofaSitting(dt);
    this.updateChat(dt);

    // ── Pet FSM ────────────────────────────────────────────────
    for (const pet of this.pets) {
      updatePet(pet, dt, this.walkableTiles, this.characters, this.tileMap, this.blockedTiles);

      // Tick heart bubble timer (mirrors character waiting-bubble pattern)
      if (pet.bubbleType) {
        pet.bubbleTimer -= dt;
        if (pet.bubbleTimer <= 0) {
          pet.bubbleType = null;
          pet.bubbleTimer = 0;
        }
      }
    }
  }

  /** The `saveAgentSeats` payload: palette, hue and seat for every agent worth
   *  restoring. Sub-agents are excluded because they are derived state the
   *  runtime re-materializes, and the greeter never reaches here at all —
   *  it is not in `characters`. */
  getPersistableSeats(): Record<
    number,
    { palette: number; hueShift: number; seatId: string | null }
  > {
    const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
    }
    return seats;
  }

  /** Everything the renderer draws: the agents plus, while the first-run ask
   *  is up, the consent greeter. This is the ONE place the greeter joins the
   *  agents — every other consumer reads `characters` and gets agents only. */
  getCharacters(): Character[] {
    const chars = Array.from(this.characters.values());
    if (this.greeter) chars.push(this.greeter);
    return chars;
  }

  /** What the canvas draws: `getCharacters()` plus the bar patrons. Kept apart
   *  so agent-facing consumers (e2e hooks, overlays) never see patrons. */
  getDrawnCharacters(): Character[] {
    return [...this.getCharacters(), ...this.getVisiblePatrons()];
  }

  /** Patrons currently drawn (twins of an on-screen agent stay home). */
  getVisiblePatrons(): Character[] {
    const taken = this.agentPaletteKeys();
    return this.patrons.filter((p) => !taken.has(p.palette));
  }

  /** Palettes shown by agents as-is (no hue shift): their patron twin stays home. */
  private agentPaletteKeys(): Set<number> {
    const out = new Set<number>();
    for (const ch of this.characters.values()) {
      if (!ch.isSubagent && ch.hueShift === 0) out.add(ch.palette);
    }
    return out;
  }

  /** Get character at pixel position (for hit testing). Returns id or null.
   *  Agents only: clicks pass straight through the consent greeter, which is
   *  a prop, not something to select or follow. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = Array.from(this.characters.values()).sort((a, b) => b.y - a.y);
    for (const ch of chars) {
      // Skip characters that are despawning
      if (ch.matrixEffect === 'despawn') continue;
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting/sleeping offset to match visual position
      const anchorY = ch.y + characterDrawOffsetPx(ch);
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH;
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH;
      const top = anchorY - CHARACTER_HIT_HEIGHT;
      const bottom = anchorY;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id;
      }
    }
    return null;
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Same rest tile (kind is implied by the tile). */
function sameSpot(a: RestSpot, b: RestSpot): boolean {
  return a.col === b.col && a.row === b.row;
}
