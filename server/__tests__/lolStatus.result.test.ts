import { describe, expect, it } from 'vitest';

import { eogResult, gameEndResult } from '../src/lolStatus.js';

describe('League match result', () => {
  it('reads the Victory / Defeat screen from the live GameEnd event', () => {
    expect(gameEndResult([{ EventName: 'GameStart' }])).toBeUndefined();
    expect(
      gameEndResult([{ EventName: 'GameStart' }, { EventName: 'GameEnd', Result: 'Win' }]),
    ).toBe('win');
    expect(gameEndResult([{ EventName: 'GameEnd', Result: 'Lose' }])).toBe('lose');
    expect(gameEndResult(undefined)).toBeUndefined();
  });

  it("reads the end-of-game screen: the user's team, else the local player's stats", () => {
    expect(
      eogResult({
        teams: [
          { isPlayerTeam: false, isWinningTeam: false },
          { isPlayerTeam: true, isWinningTeam: true },
        ],
      }),
    ).toBe('win');
    expect(eogResult({ teams: [{ isPlayerTeam: true, isWinningTeam: false }] })).toBe('lose');
    expect(eogResult({ localPlayer: { stats: { WIN: 1 } } })).toBe('win');
    expect(eogResult({ localPlayer: { stats: { LOSE: 1 } } })).toBe('lose');
    expect(eogResult(null)).toBeUndefined();
  });
});
