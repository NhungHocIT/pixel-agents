import type { MouseEvent as ReactMouseEvent } from 'react';

import { shellTerminalId } from '../../../core/src/constants.js';
import { TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import type { AgentAppearance, TabStatus } from './AgentCard.js';
import { AgentCardBar } from './AgentCardBar.js';
import { TerminalPaneStack } from './TerminalPaneStack.js';
import { Button } from './ui/Button.js';

/** Which of an agent's terminals its tab shows: Claude, or the shell (cmd) beside it. */
export type TerminalView = 'claude' | 'shell';

interface TerminalDrawerProps {
  /** Agent ids with a terminal of either kind, in open order (the cards). */
  agentIds: number[];
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
  onSelectAgent: (agentId: number) => void;
  onCloseAgent: (agentId: number) => void;
  isOpen: boolean;
  /** Close the panel (the ">" in its top-right corner). Reopening happens in App:
   *  selecting an agent — by card or by character — shows its terminal. */
  onClosePanel: () => void;
  /** Open width in px (user-resizable). Ignored while collapsed. */
  widthPx: number;
  /** Mousedown on the left-edge drag handle; App owns the resize gesture. */
  onResizeStart: (e: ReactMouseEvent) => void;
  /** Look up an agent's character appearance for its tab mug shot. */
  getAppearance: (agentId: number) => AgentAppearance;
  /** An agent's tab status dot (null until first activity). */
  statusFor: (agentId: number) => TabStatus | null;
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
}

/**
 * Right-docked panel hosting each agent's terminals: its Claude terminal and,
 * on demand, a plain shell (cmd) in the same working directory.
 *
 * Standalone only — App gates rendering on terminalAvailable, which the server
 * only ever reports over the WebSocket transport. VS Code keeps using its own
 * terminal panel.
 *
 * The agent-card bar (AgentCardBar, shared with VS Code) is drawn on top of
 * the office space at its right edge at all times; the terminal panel opens to
 * the bar's right. Here the cards double as tabs — clicking one selects that
 * agent — and a Claude | cmd switch on top picks which of its terminals shows.
 */
export function TerminalDrawer({
  agentIds,
  claudeAgentIds,
  shellAgentIds,
  viewFor,
  onSelectView,
  onOpenShell,
  shownAgentId,
  onSelectAgent,
  onCloseAgent,
  isOpen,
  onClosePanel,
  widthPx,
  onResizeStart,
  getAppearance,
  statusFor,
  onStatusChange,
}: TerminalDrawerProps) {
  if (agentIds.length === 0) return null;

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
    <div className="h-full shrink-0 flex">
      {/* The cards are the panel's tabs — clicking one selects that agent's
          pane (App also reopens the panel if it's closed). */}
      <AgentCardBar
        agentIds={agentIds}
        activeAgentId={shownAgentId}
        getAppearance={getAppearance}
        statusFor={statusFor}
        onSelect={onSelectAgent}
        onClose={onCloseAgent}
      />

      {/* Terminal panel — opens to the right of the card bar. display:none
          (not unmount) while closed: the panes stay mounted so xterm buffers
          and sockets survive; unmounting would drop the scrollback and force a
          reconnect on every toggle. TerminalPane skips fit() at zero size, and
          the ResizeObserver re-fits on reopen. */}
      <div
        className={`relative h-full flex-col bg-bg border-l-2 border-border ${isOpen ? 'flex' : 'hidden'}`}
        style={{ width: widthPx }}
      >
        {/* Drag handle over the left edge. App owns the gesture so it can
            resize the office region in lockstep. */}
        <div
          className="absolute top-0 left-0 bottom-0 z-40 cursor-col-resize hover:bg-accent"
          style={{ width: TERMINAL_DRAWER_RESIZE_HANDLE_PX }}
          onMouseDown={onResizeStart}
          title="Drag to resize"
        />

        {/* Which of the agent's terminals shows, and closing the panel. */}
        <div className="flex items-center gap-4 pl-8 pr-4 pt-4 shrink-0">
          {tab('Claude', 'claude', hasClaude, 'Claude terminal')}
          {tab('cmd', 'shell', true, "cmd in the agent's working directory")}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClosePanel}
            className="ml-auto hover:bg-btn-hover"
            title="Close terminal"
          >
            {'>'}
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
    </div>
  );
}
