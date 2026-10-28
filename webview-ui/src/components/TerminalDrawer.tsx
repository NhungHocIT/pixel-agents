import type { MouseEvent as ReactMouseEvent } from 'react';

import { shellTerminalId } from '../../../core/src/constants.js';
import { TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import { TerminalPaneStack } from './TerminalPaneStack.js';
import { Button } from './ui/Button.js';

/** Which of an agent's terminals its tab shows: Claude, or the shell (cmd) beside it. */
export type TerminalView = 'claude' | 'shell';

interface TerminalDrawerProps {
  /** Agent ids with a live Claude PTY. */
  claudeAgentIds: number[];
  /** Agent ids with a live shell (cmd) terminal. */
  shellAgentIds: number[];
  /** The view the user picked for an agent (default 'claude'). */
  viewFor: (agentId: number) => TerminalView;
  onSelectView: (agentId: number, view: TerminalView) => void;
  /** Start the agent's shell (the cmd tab with no shell yet). */
  onOpenShell: (agentId: number) => void;
  /** The pane showing (useTerminalDrawer's resolution); its card is the active tab. */
  shownAgentId: number | null;
  isOpen: boolean;
  /** Close the panel (the "v" in its top-right corner). Reopening happens in App:
   *  selecting an agent — by card or by character — shows its terminal. */
  onClosePanel: () => void;
  /** Open height in px (user-resizable). Ignored while collapsed. */
  heightPx: number;
  /** Mousedown on the top-edge drag handle; App owns the resize gesture. */
  onResizeStart: (e: ReactMouseEvent) => void;
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
}

/**
 * Bottom-docked panel hosting each agent's terminals: its Claude terminal and
 * a plain shell (cmd) in the same working directory — the office with its
 * agents above, the selected agent's terminal below.
 *
 * Standalone only — App gates rendering on terminalAvailable, which the server
 * only ever reports over the WebSocket transport. VS Code keeps using its own
 * terminal panel.
 *
 * The agent-card bar (AgentCardBar, shared with VS Code) stays drawn on top of
 * the office space at its right edge; App renders it. The cards double as tabs
 * — clicking one selects that agent and opens its cmd — and a Claude | cmd
 * switch on top picks which of its terminals shows.
 */
export function TerminalDrawer({
  claudeAgentIds,
  shellAgentIds,
  viewFor,
  onSelectView,
  onOpenShell,
  shownAgentId,
  isOpen,
  onClosePanel,
  heightPx,
  onResizeStart,
  onStatusChange,
}: TerminalDrawerProps) {
  if (claudeAgentIds.length === 0 && shellAgentIds.length === 0) return null;

  const hasClaude = shownAgentId !== null && claudeAgentIds.includes(shownAgentId);
  const hasShell = shownAgentId !== null && shellAgentIds.includes(shownAgentId);
  // An agent with only a shell (an adopted session) shows that
  const view: TerminalView =
    shownAgentId === null ? 'claude' : hasClaude ? viewFor(shownAgentId) : 'shell';
  // The pane on screen: the Claude PTY, or the shell's own session id. While a
  // just-requested shell is starting, nothing shows until the server announces it.
  let shownPaneId: number | null = null;
  if (shownAgentId !== null) {
    if (view === 'claude') shownPaneId = shownAgentId;
    else if (hasShell) shownPaneId = shellTerminalId(shownAgentId);
  }
  const paneIds = [...claudeAgentIds, ...shellAgentIds.map(shellTerminalId)];

  const pickView = (next: TerminalView) => {
    if (shownAgentId === null) return;
    onSelectView(shownAgentId, next);
    if (next === 'shell' && !hasShell) onOpenShell(shownAgentId);
  };
  const tab = (label: string, target: TerminalView, enabled: boolean, title: string) => (
    <Button
      variant={!enabled ? 'disabled' : view === target ? 'active' : 'ghost'}
      size="sm"
      disabled={!enabled}
      onClick={() => pickView(target)}
      title={title}
    >
      {label}
    </Button>
  );

  return (
    // Terminal panel — below the office. display:none (not unmount) while
    // closed: the panes stay mounted so xterm buffers and sockets survive;
    // unmounting would drop the scrollback and force a reconnect on every
    // toggle. TerminalPane skips fit() at zero size, and the ResizeObserver
    // re-fits on reopen.
    <div
      className={`relative w-full shrink-0 flex-col bg-bg border-t-2 border-border ${isOpen ? 'flex' : 'hidden'}`}
      style={{ height: heightPx }}
    >
      {/* Drag handle over the top edge. App owns the gesture so it can
          resize the office region in lockstep. */}
      <div
        className="absolute top-0 left-0 right-0 z-40 cursor-row-resize hover:bg-accent"
        style={{ height: TERMINAL_DRAWER_RESIZE_HANDLE_PX }}
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      {/* Which of the agent's terminals shows, and closing the panel. */}
      <div className="flex items-center gap-4 px-8 pt-8 shrink-0">
        {tab('Claude', 'claude', hasClaude, 'Claude terminal')}
        {tab('cmd', 'shell', true, "cmd in the agent's working directory")}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClosePanel}
          className="ml-auto hover:bg-btn-hover"
          title="Close terminal"
        >
          {'v'}
        </Button>
      </div>

      <div className="relative flex-1 min-h-0 p-4">
        {shownPaneId === null && (
          <div className="absolute inset-4 flex items-center justify-center text-sm text-text-muted">
            Opening cmd…
          </div>
        )}
        <TerminalPaneStack
          agentIds={paneIds}
          shownAgentId={shownPaneId}
          onStatusChange={(id, status) => {
            // Card dots follow the agent's Claude socket; shells report under their own id
            if (claudeAgentIds.includes(id)) onStatusChange(id, status);
          }}
          paneClassName="inset-4"
        />
      </div>
    </div>
  );
}
