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

/** Which of an agent's terminals the mobile terminal page shows: the Claude
 *  terminal itself, or the shell (cmd) beside it. */
export type TerminalView = 'claude' | 'shell';

interface TerminalDrawerProps {
  /** The office region, laid out between the two panels. */
  children: ReactNode;
  /** Agent ids with a live Claude PTY — mounted hidden, for the chat to type into. */
  claudeAgentIds: number[];
  /** Whether the office's own shell (cmd) is running. */
  hasOfficeShell: boolean;
  /** Start the office's shell (it opens with the app; this restarts an exited one). */
  onOpenOfficeShell: () => void;
  /** The agent the user picked last (card, character or chat tab). */
  selectedAgentId: number | null;
  isOpen: boolean;
  /** Close the terminal panel (the "<" in its top-right corner). */
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
 * The office flanked by two panels: on the left a plain terminal (the office's
 * own cmd, tied to no agent) to run commands and start other agents from; on
 * the right the selected agent's conversation as chat (ChatPanel).
 *
 * Each agent's Claude terminal stays mounted, hidden: sending a chat message
 * types into it, and its socket state feeds the card dots.
 *
 * Standalone only — App gates rendering on terminalAvailable, which the server
 * only ever reports over the WebSocket transport. VS Code keeps using its own
 * terminal panel.
 */
export function TerminalDrawer({
  children,
  claudeAgentIds,
  hasOfficeShell,
  onOpenOfficeShell,
  selectedAgentId,
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

  const officeShellPaneId = shellTerminalId(OFFICE_SHELL_ID);
  const paneIds = hasOfficeShell ? [...claudeAgentIds, officeShellPaneId] : claudeAgentIds;
  // The chat follows the agent picked last, else the character selected in
  // the office, else the first agent.
  const chatAgentId =
    selectedAgentId !== null && chatAgentIds.includes(selectedAgentId)
      ? selectedAgentId
      : focusedAgentId !== null && chatAgentIds.includes(focusedAgentId)
        ? focusedAgentId
        : (chatAgentIds[0] ?? null);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Terminal panel — left of the office. display:none (not unmount)
          while closed: the panes stay mounted so xterm buffers and sockets
          survive; unmounting would drop the scrollback and force a reconnect
          on every toggle. TerminalPane skips fit() at zero size, and the
          ResizeObserver re-fits on reopen. */}
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

        <div className="flex items-center gap-4 px-8 pt-6 pb-4 shrink-0 border-b-2 border-border">
          <span className="px-8 text-text">Terminal</span>
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
          {!hasOfficeShell && (
            <div className="absolute inset-4 flex flex-col gap-8 items-center justify-center text-sm text-text-muted">
              <span>Terminal chưa chạy</span>
              <Button variant="default" size="sm" onClick={onOpenOfficeShell}>
                Mở terminal
              </Button>
            </div>
          )}
          <TerminalPaneStack
            agentIds={paneIds}
            shownAgentId={hasOfficeShell ? officeShellPaneId : null}
            onStatusChange={(id, status) => {
              // Card dots follow the agent's Claude socket
              if (claudeAgentIds.includes(id)) onStatusChange(id, status);
            }}
            paneClassName="inset-4"
            inputsRef={inputs}
          />
        </div>
      </div>

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
