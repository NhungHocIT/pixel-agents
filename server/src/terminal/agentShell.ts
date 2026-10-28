/**
 * Agent shells: a plain shell (cmd.exe on Windows, $SHELL elsewhere) beside an
 * agent's Claude terminal, opened in the agent's working directory so the user
 * can run commands by hand next to the agent.
 *
 * A shell is an ordinary PTY session keyed shellTerminalId(agentId), so it
 * attaches over the same privileged /terminal/:id route as the Claude terminal.
 * Works for adopted agents too (no Claude PTY of their own): the cwd comes from
 * their transcript.
 */

import * as fs from 'fs';
import * as os from 'os';

import { OFFICE_SHELL_ID, shellTerminalId } from '../../../core/src/constants.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { AgentState } from '../types.js';
import type { PtySessionManager } from './ptySessionManager.js';

/** How much of the transcript to scan for the session's cwd. */
const CWD_SCAN_BYTES = 256 * 1024;

export interface AgentShellDeps {
  store: AgentStateStore;
  ptyManager: PtySessionManager;
}

/** The shell to run: the user's own, as their OS terminal would start it. */
export function shellCommand(): { command: string; args: string[] } {
  if (process.platform === 'win32') return { command: process.env.ComSpec ?? 'cmd.exe', args: [] };
  return { command: process.env.SHELL ?? '/bin/sh', args: [] };
}

/** Where the agent works: its launch cwd, else the first `cwd` its transcript
 *  records, else the home directory. */
export function agentCwd(agent: AgentState): string {
  if (agent.cwd && isDirectory(agent.cwd)) return agent.cwd;
  try {
    const fd = fs.openSync(agent.jsonlFile, 'r');
    try {
      const buf = Buffer.alloc(CWD_SCAN_BYTES);
      const read = fs.readSync(fd, buf, 0, CWD_SCAN_BYTES, 0);
      const match = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(buf.toString('utf8', 0, read));
      if (match) {
        const cwd = JSON.parse(match[1]) as string;
        if (isDirectory(cwd)) return cwd;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // No transcript yet (a fresh launch) or unreadable: fall through.
  }
  return os.homedir();
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Open the agent's shell (or keep the one already running) and announce it.
 * OFFICE_SHELL_ID opens the office's own shell, in the home directory.
 * Returns false when there is no such agent or no working PTY.
 */
export function openAgentShell(deps: AgentShellDeps, agentId: number): boolean {
  const { store, ptyManager } = deps;
  const agent = store.get(agentId);
  if ((!agent && agentId !== OFFICE_SHELL_ID) || !ptyManager.isAvailable()) return false;
  const id = shellTerminalId(agentId);
  if (!ptyManager.has(id)) {
    const { command, args } = shellCommand();
    const cwd = agent ? agentCwd(agent) : os.homedir();
    let session;
    try {
      session = ptyManager.create({ agentId: id, command, args, cwd });
    } catch (err) {
      console.error(
        `[Pixel Agents] Terminal: Agent ${agentId} - shell spawn failed: ${String(err)}`,
      );
      return false;
    }
    console.log(
      `[Pixel Agents] Terminal: Agent ${agentId} - shell ${command} (pid ${session.pid}) in ${cwd}`,
    );
    session.onExit(() => store.broadcast({ type: 'shellSessionClosed', agentId }));
  }
  store.broadcast({ type: 'shellSessionOpened', agentId });
  return true;
}

/** Kill the agent's shell, if it has one (its exit announces the close). */
export function closeAgentShell(ptyManager: PtySessionManager, agentId: number): void {
  ptyManager.dispose(shellTerminalId(agentId));
}

/** Whether the agent has a live shell. */
export function hasAgentShell(ptyManager: PtySessionManager, agentId: number): boolean {
  return ptyManager.has(shellTerminalId(agentId));
}
