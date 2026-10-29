import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OFFICE_SHELL_EXTRA_BASE,
  OFFICE_SHELL_ID,
  shellTerminalId,
} from '../../core/src/constants.js';
import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  agentCwd,
  closeAgentShell,
  hasAgentShell,
  openAgentShell,
  shellCommand,
} from '../src/terminal/agentShell.js';
import type { IPty, PtyModule, PtySpawnOptions } from '../src/terminal/ptyModule.js';
import { PtySessionManager } from '../src/terminal/ptySessionManager.js';

/**
 * Agent shells: a plain shell beside an agent, in its working directory, on the
 * same PTY session manager as the Claude terminal (keyed shellTerminalId).
 * Driven with a fake PTY module like standaloneAgentLauncher.test.ts.
 */

class FakePty implements IPty {
  readonly pid = 777;
  private exitListener: ((e: { exitCode: number; signal?: number }) => void) | null = null;
  onData(): void {}
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): void {
    this.exitListener = listener;
  }
  write(): void {}
  resize(): void {}
  kill(): void {
    this.exitListener?.({ exitCode: 0 });
  }
}

function fakeManager(spawns: Array<{ file: string; options: PtySpawnOptions }>): PtySessionManager {
  const module: PtyModule = {
    spawn: (file, _args, options) => {
      spawns.push({ file, options });
      return new FakePty();
    },
  };
  return new PtySessionManager(() => ({ module, moduleId: 'fake-pty', reason: null }));
}

describe('agent shells', () => {
  let tempDir: string;
  let store: AgentStateStore;
  let broadcasts: Array<Record<string, unknown>>;

  function addAgent(id: number, init: { cwd?: string; transcriptCwd?: string } = {}): void {
    const jsonlFile = path.join(tempDir, `${id}.jsonl`);
    if (init.transcriptCwd) {
      fs.writeFileSync(
        jsonlFile,
        `{"type":"user","cwd":${JSON.stringify(init.transcriptCwd)},"message":{}}\n`,
      );
    }
    store.set(
      id,
      createAgentState({
        id,
        sessionId: `s${id}`,
        projectDir: tempDir,
        jsonlFile,
        isExternal: !init.cwd,
        cwd: init.cwd,
      }),
    );
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-shell-test-'));
    store = new AgentStateStore();
    broadcasts = [];
    store.on('broadcast', (message) => broadcasts.push(message));
  });

  afterEach(() => {
    store.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('opens the shell in the launched agent cwd, keyed apart from its Claude PTY', () => {
    const spawns: Array<{ file: string; options: PtySpawnOptions }> = [];
    const manager = fakeManager(spawns);
    const work = path.join(tempDir, 'work');
    fs.mkdirSync(work);
    addAgent(1, { cwd: work });

    expect(openAgentShell({ store, ptyManager: manager }, 1)).toBe(true);

    expect(spawns).toHaveLength(1);
    expect(spawns[0].options.cwd).toBe(work);
    expect(manager.has(shellTerminalId(1))).toBe(true);
    expect(manager.has(1)).toBe(false);
    expect(broadcasts).toContainEqual({ type: 'shellSessionOpened', agentId: 1 });
  });

  it('reuses a running shell instead of spawning a second one', () => {
    const spawns: Array<{ file: string; options: PtySpawnOptions }> = [];
    const manager = fakeManager(spawns);
    addAgent(1, { cwd: tempDir });
    openAgentShell({ store, ptyManager: manager }, 1);
    openAgentShell({ store, ptyManager: manager }, 1);
    expect(spawns).toHaveLength(1);
  });

  it("reads an adopted agent's cwd from its transcript, else home", () => {
    const work = path.join(tempDir, 'adopted');
    fs.mkdirSync(work);
    addAgent(2, { transcriptCwd: work });
    addAgent(3);
    expect(agentCwd(store.get(2)!)).toBe(work);
    expect(agentCwd(store.get(3)!)).toBe(os.homedir());
  });

  it('closing the shell kills it and announces the close', () => {
    const manager = fakeManager([]);
    addAgent(1, { cwd: tempDir });
    openAgentShell({ store, ptyManager: manager }, 1);
    closeAgentShell(manager, 1);
    expect(hasAgentShell(manager, 1)).toBe(false);
    expect(broadcasts).toContainEqual({ type: 'shellSessionClosed', agentId: 1 });
  });

  it('opens several office shells, each in home, with no agent', () => {
    const spawns: Array<{ file: string; options: PtySpawnOptions }> = [];
    const manager = fakeManager(spawns);
    for (const id of [OFFICE_SHELL_ID, OFFICE_SHELL_EXTRA_BASE, OFFICE_SHELL_EXTRA_BASE + 1]) {
      expect(openAgentShell({ store, ptyManager: manager }, id)).toBe(true);
    }
    expect(spawns).toHaveLength(3);
    expect(spawns.every((s) => s.options.cwd === os.homedir())).toBe(true);
    closeAgentShell(manager, OFFICE_SHELL_EXTRA_BASE);
    expect(hasAgentShell(manager, OFFICE_SHELL_EXTRA_BASE)).toBe(false);
    expect(hasAgentShell(manager, OFFICE_SHELL_EXTRA_BASE + 1)).toBe(true);
  });

  it('refuses an unknown agent', () => {
    const spawns: Array<{ file: string; options: PtySpawnOptions }> = [];
    expect(openAgentShell({ store, ptyManager: fakeManager(spawns) }, 99)).toBe(false);
    expect(spawns).toHaveLength(0);
  });

  it('runs cmd.exe on Windows', () => {
    if (process.platform !== 'win32') return;
    expect(shellCommand().command.toLowerCase()).toMatch(/cmd\.exe$/);
  });
});
