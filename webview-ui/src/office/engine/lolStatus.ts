/**
 * League of Legends status of the user (server `lolStatus` message) and the
 * title shown over their avatar while it plays at a gaming PC.
 */

export interface LolStatus {
  /** LCU gameflow phase (None = client open on the home screen), or null
   *  when League is not running. */
  phase: string | null;
  /** Lobby onwards: the queue, e.g. "Đơn/Đôi", "ARAM". */
  queue?: string;
  lobbyMembers?: number;
  lobbyMax?: number;
  queueSec?: number;
  /** Champion select / in game: the user's champion. */
  champion?: string;
  /** In game: kills/deaths/assists. */
  kda?: string;
  gameSec?: number;
}

/** m:ss, or h:mm:ss past the hour. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Title for the user's avatar. `sinceSec` is how long ago the status arrived,
 *  so the clocks keep running between polls. */
export function lolTitle(status: LolStatus, sinceSec: number): string | null {
  const queue = status.queue ? ` · ${status.queue}` : '';
  switch (status.phase) {
    case null:
      return null;
    case 'None':
      return 'Trang chủ LMHT';
    case 'Lobby':
      return status.lobbyMembers && status.lobbyMax
        ? `Sảnh chờ ${status.lobbyMembers}/${status.lobbyMax}${queue}`
        : `Sảnh chờ${queue}`;
    case 'Matchmaking':
      return status.queueSec !== undefined
        ? `Tìm trận ${formatClock(status.queueSec + sinceSec)}${queue}`
        : `Tìm trận...${queue}`;
    case 'ReadyCheck':
      return 'Có trận!';
    case 'ChampSelect':
      return status.champion ? `Chọn ${status.champion}` : 'Chọn tướng';
    case 'GameStart':
    case 'InProgress':
    case 'Reconnect': {
      if (status.gameSec === undefined) return 'Vào trận...';
      const clock = formatClock(status.gameSec + sinceSec);
      if (!status.champion) return `Trong trận ${clock}`;
      return status.kda
        ? `${status.champion} ${status.kda} · ${clock}`
        : `${status.champion} · ${clock}`;
    }
    case 'WaitingForStats':
    case 'PreEndOfGame':
    case 'EndOfGame':
      return 'Hết trận';
    default:
      return 'Mở LMHT';
  }
}
