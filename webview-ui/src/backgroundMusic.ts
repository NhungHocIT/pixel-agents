/**
 * Background music while a pickleball game is on: a hidden YouTube player
 * (the official IFrame API) plays the track on loop and pauses between games,
 * picking up where it left off. Respects the sound setting. Nothing loads
 * until the first game.
 */
import { PICKLEBALL_MUSIC_VIDEO_ID, PICKLEBALL_MUSIC_VOLUME } from './constants.js';
import { isSoundEnabled } from './notificationSound.js';
import { isE2E } from './runtime.js';

/** The slice of the IFrame API player used here. */
interface YtPlayer {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(volume: number): void;
}

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: { onReady: () => void };
    },
  ) => YtPlayer;
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let player: YtPlayer | null = null;
let ready = false;
let loading = false;
/** What the game wants right now; applied once the player is ready. */
let wanted = false;
let playing = false;

function apply(): void {
  if (!player || !ready) return;
  const on = wanted && isSoundEnabled();
  if (on === playing) return;
  playing = on;
  if (on) player.playVideo();
  else player.pauseVideo();
}

function createPlayer(yt: YtNamespace): void {
  // YouTube needs a real (≥200px) player to play; keep it off-screen
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:200px;height:200px;opacity:0;pointer-events:none;';
  const el = document.createElement('div');
  host.appendChild(el);
  document.body.appendChild(host);
  player = new yt.Player(el, {
    videoId: PICKLEBALL_MUSIC_VIDEO_ID,
    playerVars: {
      autoplay: 0,
      controls: 0,
      loop: 1,
      playlist: PICKLEBALL_MUSIC_VIDEO_ID, // loop needs the playlist set to itself
      playsinline: 1,
    },
    events: {
      onReady: () => {
        ready = true;
        player!.setVolume(PICKLEBALL_MUSIC_VOLUME);
        apply();
      },
    },
  });
}

function load(): void {
  if (loading) return;
  loading = true;
  if (window.YT?.Player) {
    createPlayer(window.YT);
    return;
  }
  const previous = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    previous?.();
    if (window.YT) createPlayer(window.YT);
  };
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  document.head.appendChild(script);
}

/** Called every frame with whether a game is on; cheap when nothing changes. */
export function setPickleballMusic(on: boolean): void {
  if (isE2E || typeof document === 'undefined') return;
  wanted = on;
  if (on && isSoundEnabled()) load();
  apply();
}
