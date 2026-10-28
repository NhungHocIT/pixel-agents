import { useSyncExternalStore } from 'react';

import {
  getMusicScene,
  getMusicVolume,
  setMusicVolume,
  subscribeMusic,
} from '../backgroundMusic.js';
import type { MusicScene } from '../constants.js';

const LABEL: Record<MusicScene, string> = {
  lol: 'LoL',
  pickleball: 'Pickleball',
};

/** Music volume, shown only while background music plays (bottom-left,
 *  above the toolbar). Drag to set it; the speaker mutes / unmutes. */
export function MusicVolume() {
  const scene = useSyncExternalStore(subscribeMusic, getMusicScene);
  const volume = useSyncExternalStore(subscribeMusic, getMusicVolume);
  if (scene === null) return null;
  return (
    <div
      className="absolute left-10 bottom-56 z-20 flex items-center gap-6 pixel-panel px-8 py-4 text-sm"
      data-testid="music-volume"
    >
      <button
        type="button"
        className="cursor-pointer leading-none"
        onClick={() => setMusicVolume(volume === 0 ? 40 : 0)}
        title={volume === 0 ? 'Bật nhạc' : 'Tắt nhạc'}
      >
        {volume === 0 ? '🔇' : '🎵'}
      </button>
      <span className="whitespace-nowrap">{LABEL[scene]}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => setMusicVolume(Number(e.target.value))}
        className="w-96 accent-accent cursor-pointer"
        aria-label="Âm lượng nhạc nền"
      />
      <span className="w-24 text-right tabular-nums">{volume}</span>
    </div>
  );
}
