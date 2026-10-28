/**
 * League of Legends status for the user's avatar (TNhunn).
 *
 * Polls the local League Client API (LCU, credentials from the client's
 * `lockfile`) for the gameflow phase, plus the in-game Live Client Data API
 * for the match clock, and broadcasts `{ type: 'lolStatus', ... }` to every
 * webview. `phase: null` means League is not running.
 */
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

import type { AgentStateStore } from './agentStateStore.js';

const POLL_INTERVAL_MS = 2000;
/** Re-send an unchanged status this often so freshly opened webviews catch up. */
const HEARTBEAT_MS = 6000;
const REQUEST_TIMEOUT_MS = 1500;
const LIVE_CLIENT_PORT = 2999;
const RIOT_INSTALLS = 'C:/ProgramData/Riot Games/RiotClientInstalls.json';
const DEFAULT_INSTALL_DIRS = ['C:/Riot Games/League of Legends', 'D:/Riot Games/League of Legends'];

/** Short Vietnamese names for the common queues (LCU queueId). */
const QUEUE_NAMES: Record<number, string> = {
  400: 'Thường',
  420: 'Đơn/Đôi',
  430: 'Thường',
  440: 'Linh hoạt',
  450: 'ARAM',
  490: 'Nhanh',
  700: 'Clash',
  830: 'Đấu máy',
  840: 'Đấu máy',
  850: 'Đấu máy',
  900: 'URF',
  1700: 'Đấu trường',
  1900: 'URF',
};

export interface LolStatus {
  /** LCU gameflow phase (None = client open on the home screen, Lobby,
   *  Matchmaking, ChampSelect, InProgress, ...), or null when League is closed. */
  phase: string | null;
  /** Lobby onwards: the queue, e.g. "Đơn/Đôi", "ARAM". */
  queue?: string;
  lobbyMembers?: number;
  lobbyMax?: number;
  /** Matchmaking: seconds in queue. */
  queueSec?: number;
  /** Champion select / in game: the user's champion. */
  champion?: string;
  /** In game: kills / deaths / assists. */
  kda?: string;
  /** In game: match clock in seconds. */
  gameSec?: number;
}

interface Lockfile {
  port: number;
  password: string;
}

/** League install folders: whatever the Riot Client registered, then the defaults. */
function installDirs(): string[] {
  const dirs: string[] = [];
  try {
    const installs = JSON.parse(fs.readFileSync(RIOT_INSTALLS, 'utf8')) as {
      associated_client?: Record<string, string>;
    };
    for (const dir of Object.keys(installs.associated_client ?? {})) {
      if (/league of legends/i.test(dir)) dirs.push(dir);
    }
  } catch {
    // Riot Client not installed here
  }
  return [...dirs, ...DEFAULT_INSTALL_DIRS];
}

/** `LeagueClient:pid:port:password:https`, present only while the client runs. */
function readLockfile(): Lockfile | null {
  for (const dir of installDirs()) {
    try {
      const [, , port, password] = fs.readFileSync(path.join(dir, 'lockfile'), 'utf8').split(':');
      if (port && password) return { port: Number(port), password };
    } catch {
      // not this folder
    }
  }
  return null;
}

/** GET a JSON endpoint on 127.0.0.1 (both Riot APIs use self-signed certs). */
function getJson(port: number, urlPath: string, password?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT_MS,
        auth: password ? `riot:${password}` : undefined,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function liveGameSec(): Promise<number | undefined> {
  const stats = (await getJson(LIVE_CLIENT_PORT, '/liveclientdata/gamestats')) as {
    gameTime?: number;
  } | null;
  return typeof stats?.gameTime === 'number' ? Math.floor(stats.gameTime) : undefined;
}

/** The user's champion and score in the running match (Live Client Data API). */
async function liveChampion(): Promise<Pick<LolStatus, 'champion' | 'kda'>> {
  const me = await getJson(LIVE_CLIENT_PORT, '/liveclientdata/activeplayername');
  const players = (await getJson(LIVE_CLIENT_PORT, '/liveclientdata/playerlist')) as Array<{
    championName?: string;
    riotId?: string;
    summonerName?: string;
    scores?: { kills?: number; deaths?: number; assists?: number };
  }> | null;
  const player =
    typeof me === 'string' && Array.isArray(players)
      ? players.find((p) => p.riotId === me || p.summonerName === me)
      : undefined;
  if (!player) return {};
  const s = player.scores ?? {};
  return {
    champion: player.championName,
    kda: `${s.kills ?? 0}/${s.deaths ?? 0}/${s.assists ?? 0}`,
  };
}

/** Champion id → localized name, fetched once per client session (port). */
let championNames: { port: number; names: Map<number, string> } | null = null;

async function championName(lock: Lockfile, id: number): Promise<string | undefined> {
  if (championNames?.port !== lock.port) {
    const list = (await getJson(
      lock.port,
      '/lol-game-data/assets/v1/champion-summary.json',
      lock.password,
    )) as Array<{ id: number; name: string }> | null;
    if (!Array.isArray(list)) return undefined;
    championNames = { port: lock.port, names: new Map(list.map((c) => [c.id, c.name])) };
  }
  return championNames.names.get(id);
}

async function queueName(lock: Lockfile): Promise<string | undefined> {
  const session = (await getJson(lock.port, '/lol-gameflow/v1/session', lock.password)) as {
    gameData?: { queue?: { id?: number; shortName?: string } };
  } | null;
  const queue = session?.gameData?.queue;
  return (queue?.id !== undefined ? QUEUE_NAMES[queue.id] : undefined) ?? queue?.shortName;
}

export async function readLolStatus(): Promise<LolStatus> {
  const lock = readLockfile();
  if (!lock) {
    // Client closed but a match still running (e.g. client crashed mid-game)
    const gameSec = await liveGameSec();
    return gameSec === undefined
      ? { phase: null }
      : { phase: 'InProgress', gameSec, ...(await liveChampion()) };
  }
  const phase = await getJson(lock.port, '/lol-gameflow/v1/gameflow-phase', lock.password);
  // A stale lockfile (client gone) answers nothing: League is closed
  if (typeof phase !== 'string') return { phase: null };
  const status: LolStatus = { phase };
  if (phase === 'None') return status;
  status.queue = await queueName(lock);
  if (phase === 'Lobby') {
    const lobby = (await getJson(lock.port, '/lol-lobby/v2/lobby', lock.password)) as {
      members?: unknown[];
      gameConfig?: { maxLobbySize?: number };
    } | null;
    if (lobby) {
      status.lobbyMembers = lobby.members?.length ?? 1;
      status.lobbyMax = lobby.gameConfig?.maxLobbySize;
    }
  } else if (phase === 'Matchmaking' || phase === 'ReadyCheck') {
    const search = (await getJson(lock.port, '/lol-matchmaking/v1/search', lock.password)) as {
      timeInQueue?: number;
    } | null;
    if (typeof search?.timeInQueue === 'number') status.queueSec = Math.floor(search.timeInQueue);
  } else if (phase === 'ChampSelect') {
    const id = await getJson(lock.port, '/lol-champ-select/v1/current-champion', lock.password);
    if (typeof id === 'number' && id > 0) status.champion = await championName(lock, id);
  } else if (phase === 'InProgress' || phase === 'Reconnect') {
    status.gameSec = await liveGameSec();
    Object.assign(status, await liveChampion());
  }
  return status;
}

/** Poll forever, broadcasting on change (and as a heartbeat). Returns a stop function. */
export function startLolStatusPoller(store: AgentStateStore): () => void {
  let last = '';
  let lastSentAt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    try {
      const status = await readLolStatus();
      const json = JSON.stringify(status);
      const now = Date.now();
      // The match clock ticks every poll; only phase/lobby changes count as news
      const key = JSON.stringify({ ...status, gameSec: undefined, queueSec: undefined });
      if (key !== last || now - lastSentAt >= HEARTBEAT_MS) {
        if (key !== last) console.log(`[Pixel Agents] LoL status: ${json}`);
        last = key;
        lastSentAt = now;
        store.broadcast({ type: 'lolStatus', ...status });
      }
    } catch {
      // never let a League hiccup take the server down
    }
    if (!stopped) timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
