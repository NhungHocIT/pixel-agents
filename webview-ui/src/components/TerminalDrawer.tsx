import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useRef } from 'react';

import { OFFICE_SHELL_ID, shellTerminalId } from '../../../core/src/constants.js';
import { TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import type { TabStatus } from './AgentCard.js';
import type { ChatAgentInfo } from './ChatPanel.js';
import { ChatPanel } from './ChatPanel.js';
import type { TerminalInputHandle } from './TerminalPane.js';
import { TerminalPaneStack } from './TerminalPaneStack.js';
import { Button } from './ui/Button.js';

/** Which of an agent's terminals the left panel shows: the Claude terminal
 *  itself, or the shell (cmd) beside it. Its chat always shows on the right. */
export type TerminalView = 'claude' | 'shell';

interface TerminalDrawerProps {
  /** The office region, laid out between the two panels. */
  children: ReactNode;
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
  /** Close the terminal panel (the "<" in its top-right corner). Reopening
   *  happens in App: selecting an agent — by card or by character — shows its
   *  terminal. */
  onClosePanel: () => void;
  /** Open width in px (user-resizable). Ignored while collapsed. */
  widthPx: number;
  /** Mousedown on the inner-edge drag handle; the hook owns the resize gesture. */
  onResizeStart: (e: ReactMouseEvent) => void;
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
  isChatOpen: boolean;
  chatWidthPx: number;
  onChatResizeStart: (e: ReactMouseEvent) => void;
  onCloseChat: () => void;
  /** Every agent in the office — the chat panel's tabs. */
  chatAgentIds: number[];
  /** The agent whose character is selected in the office. */
  focusedAgentId: number | null;
  /** Resume an external agent's session in a Claude terminal here. */
  onResumeAgent: (agentId: number) => void;
  /** A chat tab click — the same as a card click. */
  onSelectAgent: (agentId: number) => void;
  infoFor: (agentId: number) => ChatAgentInfo;
  statusFor: (agentId: number) => TabStatus | null;
}

/**
 * The office flanked by the selected agent's terminals: on the left its Claude
 * terminal or a plain shell (cmd) in the same working directory, on the right
 * its conversation as chat (ChatPanel) — sending there types into the Claude
 * terminal on the left, so both show one session.
 *
 * Standalone only — App gates rendering on terminalAvailable, which the server
 * only ever reports over the WebSocket transport. VS Code keeps using its own
 * terminal panel.
 *
 * The agent-card bar (AgentCardBar, shared with VS Code) stays drawn on top of
 * the office space at its right edge; App passes it in with the office. The
 * cards double as tabs — clicking one selects that agent — and a Claude | cmd
 * switch on top of the left panel picks which of its terminals shows.
 */
export function TerminalDrawer({
  children,
  claudeAgentIds,
  shellAgentIds,
  viewFor,
  onSelectView,
  onOpenShell,
  shownAgentId,
  isOpen,
  onClosePanel,
  widthPx,
  onResizeStart,
  onStatusChange,
  isChatOpen,
  chatWidthPx,
  onChatResizeStart,
  onCloseChat,
  chatAgentIds,
  focusedAgentId,
  onResumeAgent,
  onSelectAgent,
  infoFor,
  statusFor,
}: TerminalDrawerProps) {
  const inputs = useRef(new Map<number, TerminalInputHandle>());
  const hasPanes = claudeAgentIds.length > 0 || shellAgentIds.length > 0;

  const isOfficeShell = shownAgentId === OFFICE_SHELL_ID;
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
  // The chat follows the terminal's agent; the office's own cmd has no chat,
  // so it then follows the character selected in the office, else the first.
  const chatAgentId =
    shownAgentId !== null && chatAgentIds.includes(shownAgentId)
      ? shownAgentId
      : focusedAgentId !== null && chatAgentIds.includes(focusedAgentId)
        ? focusedAgentId
        : (chatAgentIds[0] ?? null);

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
    <div className="flex-1 min-h-0 flex">
      {/* Terminal panel — left of the office. display:none (not unmount)
          while closed: the panes stay mounted so xterm buffers and sockets
          survive; unmounting would drop the scrollback and force a reconnect
          on every toggle. TerminalPane skips fit() at zero size, and the
          ResizeObserver re-fits on reopen. */}
      {hasPanes && (
        <div
          className={`relative h-full shrink-0 flex-col bg-bg border-r-2 border-border ${isOpen ? 'flex' : 'hidden'}`}
          style={{ width: widthPx }}
        >
          {/* Drag handle over the inner (right) edge. */}
          <div
            className="absolute top-0 bottom-0 right-0 z-40 cursor-col-resize hover:bg-accent"
            style={{ width: TERMINAL_DRAWER_RESIZE_HANDLE_PX }}
            onMouseDown={onResizeStart}
            title="Drag to resize"
          />

          {/* The office's own cmd (no agent), then which of the selected
              agent's terminals shows, and closing the panel. */}
          <div className="flex items-center gap-4 px-8 pt-6 pb-4 shrink-0 border-b-2 border-border">
            <Button
              variant={isOfficeShell ? 'active' : 'ghost'}
              size="sm"
              onClick={() => onOpenShell(OFFICE_SHELL_ID)}
              title="cmd of its own, not tied to any agent"
            >
              Terminal
            </Button>
            {!isOfficeShell && shownAgentId !== null && (
              <>
                {tab(
                  hasClaude ? `Claude: ${infoFor(shownAgentId).name}` : 'Claude',
                  'claude',
                  hasClaude,
                  'Claude terminal',
                )}
                {tab('cmd', 'shell', true, "cmd in the agent's working directory")}
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClosePanel}
              className="ml-auto hover:bg-btn-hover"
              title="Close terminal"
            >
              {'<'}
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
              inputsRef={inputs}
            />
          </div>
        </div>
      )}

      {/* Middle: the office, flexing to fill what the panels leave. */}
      <div className="flex-1 min-w-0 flex overflow-hidden">{children}</div>

      <ChatPanel
        agentIds={chatAgentIds}
        sendableAgentIds={claudeAgentIds}
        onTakeOver={onResumeAgent}
        shownAgentId={chatAgentId}
        isOpen={isChatOpen}
        widthPx={chatWidthPx}
        onResizeStart={onChatResizeStart}
        onClose={onCloseChat}
        onSelectAgent={onSelectAgent}
        infoFor={infoFor}
        statusFor={statusFor}
        inputsRef={inputs}
      />
    </div>
  );
}
