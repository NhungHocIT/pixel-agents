/**
 * Shared constants used across server, extension, and webview.
 * Only constants needed by core interfaces live here.
 * Server-specific timing constants stay in server/src/constants.ts.
 * Webview-specific rendering constants stay in webview-ui/src/constants.ts.
 * Provider-specific constants stay in their provider directory.
 */

// ── Hook API ─────────────────────────────────────────────────

export const HOOK_API_PREFIX = '/api/hooks';
export const SERVER_JSON_DIR = '.pixel-agents';
export const SERVER_JSON_NAME = 'server.json';
export const HOOK_SCRIPTS_DIR = '.pixel-agents/hooks';

// ── Display ──────────────────────────────────────────────────

export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── Terminal (standalone embedded terminal) ──────────────────
// The raw PTY byte stream deliberately lives OUTSIDE the AsyncAPI contract --
// it is a data plane (unstructured, high-frequency), not a control plane.
// Only the terminal's control-plane facts (availability, session open/close)
// are AsyncAPI ServerMessages. See docs/design/standalone-terminal.md.

/** Path prefix for the per-agent terminal WebSocket: `/terminal/:agentId`. The
 *  handshake carries the server token as `?token=`, exactly like `/ws` (see
 *  server/src/wsAuth.ts); the frame shapes are in terminalFrames.ts. */
export const TERMINAL_WS_PREFIX = '/terminal';
/** Each agent can have a plain shell (cmd.exe on Windows) beside its Claude
 *  terminal. It is a PTY session like any other, keyed agentId + this offset,
 *  so it attaches over the same /terminal/:id route. Agent ids stay far below. */
export const SHELL_TERMINAL_ID_OFFSET = 1_000_000;

/** The office's own shell: a cmd tied to no agent, open as soon as the app is,
 *  like VS Code's terminal. Keyed like an agent shell under this id (agent ids
 *  start at 1, so 0 is never an agent). */
export const OFFICE_SHELL_ID = 0;
/** More office shells (the terminal panel's "+") take ids from here up — far
 *  above any agent id, below the shell offset. */
export const OFFICE_SHELL_EXTRA_BASE = 900_000;

/** Whether the id is one of the office's own shells, not an agent. */
export function isOfficeShellId(id: number): boolean {
  return id === OFFICE_SHELL_ID || (id >= OFFICE_SHELL_EXTRA_BASE && id < SHELL_TERMINAL_ID_OFFSET);
}

/** The PTY session id of an agent's shell terminal. */
export function shellTerminalId(agentId: number): number {
  return agentId + SHELL_TERMINAL_ID_OFFSET;
}

// ── Transport ────────────────────────────────────────────────
// Connection-state names for the MessageTransport state machine.

export const TRANSPORT_STATE_CONNECTING = 'connecting';
export const TRANSPORT_STATE_CONNECTED = 'connected';
export const TRANSPORT_STATE_RECONNECTING = 'reconnecting';
export const TRANSPORT_STATE_DISCONNECTED = 'disconnected';
