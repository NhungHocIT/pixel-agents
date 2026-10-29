/**
 * Background music for what's going on in the office: a hidden YouTube player
 * (the official IFrame API) plays the scene's tracks on loop — League music
 * while TNhunn plays LoL — and pauses when nothing is on. Each scene picks up where it left off. Respects the sound
 * setting. Nothing loads until music is first wanted.
 */
import type { MusicScene } from './constants.js';
import { BACKGROUND_MUSIC_VOLUME, MUSIC_PLAYLISTS } from './constants.js';
import { isSoundEnabled } from './notificationSound.js';
import { isE2E } from './runtime.js';

/** The slice of the IFrame API player used here. */
interface YtPlayer {
  loadPlaylist(playlist: {
    list: string;
    listType: 'playlist';
    index?: number;
    startSeconds?: number;
  }): void;
  setLoop(loop: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getPlaylistIndex(): number;
  nextVideo(): void;
}

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      events: { onReady: () => void; onError: () => void };
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
/** What should play now; applied once the player is ready. */
let wanted: MusicScene | null = null;
/** The scene loaded in the player, and whether it is playing. */
let loaded: MusicScene | null = null;
let playing = false;
/** Where each scene was left: track and second. */
const leftAt = new Map<MusicScene, { index: number; time: number }>();

/** The volume (0-100), remembered in this browser between sessions. */
const VOLUME_KEY = 'pixelAgents.musicVolume';

function readVolume(): number {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    const value = Number(saved);
    if (saved !== null && value >= 0 && value <= 100) return value;
  } catch {
    // No storage here (private window, blocked site data): the default it is
  }
  return BACKGROUND_MUSIC_VOLUME;
}

let volume = readVolume();
/** For the volume control: the scene actually playing (null: none) and who listens. */
let shownScene: MusicScene | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function apply(): void {
  const scene = isSoundEnabled() ? wanted : null;
  if (scene !== shownScene) {
    shownScene = scene;
    notify();
  }
  if (!player || !ready) return;
  if (scene === null) {
    if (playing) player.pauseVideo();
    playing = false;
    return;
  }
  if (scene !== loaded) {
    if (loaded) {
      leftAt.set(loaded, { index: player.getPlaylistIndex(), time: player.getCurrentTime() });
    }
    const from = leftAt.get(scene) ?? { index: 0, time: 0 };
    player.loadPlaylist({
      list: MUSIC_PLAYLISTS[scene],
      listType: 'playlist',
      index: Math.max(0, from.index),
      startSeconds: from.time,
    });
    player.setLoop(true); // round the playlist (a single track repeats)
    loaded = scene;
    playing = true;
    return;
  }
  if (!playing) player.playVideo();
  playing = true;
}

function createPlayer(yt: YtNamespace): void {
  // YouTube needs a real (≥200px) player to play; keep it off-screen
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:200px;height:200px;opacity:0;pointer-events:none;';
  // Our own iframe: the page sends no Referer (index.html, the URL carries the
  // token), but YouTube refuses embeds without one. Send just the origin.
  const el = document.createElement('iframe');
  el.width = el.height = '200';
  el.allow = 'autoplay; encrypted-media';
  el.referrerPolicy = 'strict-origin';
  el.src =
    'https://www.youtube.com/embed/?enablejsapi=1&controls=0&playsinline=1&origin=' +
    encodeURIComponent(location.origin);
  host.appendChild(el);
  document.body.appendChild(host);
  player = new yt.Player(el, {
    events: {
      onReady: () => {
        ready = true;
        player!.setVolume(volume);
        apply();
      },
      // A track that can't play here (embedding off, removed): on to the next
      onError: () => {
        if (playing) player!.nextVideo();
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

/** Called every frame with the scene that wants music (null: none); cheap
 *  when nothing changes. */
export function setBackgroundMusic(scene: MusicScene | null): void {
  if (isE2E || typeof document === 'undefined') return;
  wanted = scene;
  if (scene !== null && isSoundEnabled()) load();
  apply();
}

/** For the volume control: subscribe to changes of what plays and how loud. */
export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The scene playing now (null: no music, or sound is off). */
export function getMusicScene(): MusicScene | null {
  return shownScene;
}

export function getMusicVolume(): number {
  return volume;
}

/** Set the music volume (0-100); remembered for next time. */
export function setMusicVolume(next: number): void {
  volume = Math.max(0, Math.min(100, Math.round(next)));
  player?.setVolume(volume);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Not remembered without storage; still applies now
  }
  notify();
}
