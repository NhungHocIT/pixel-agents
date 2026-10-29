import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  OFFICE_SHELL_EXTRA_BASE,
  OFFICE_SHELL_ID,
  shellTerminalId,
} from '../../../core/src/constants.js';
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
  /** The office region, laid out right of the panel. */
  children: ReactNode;
  /** Agent ids with a live Claude PTY — mounted hidden, for the chat to type into. */
  claudeAgentIds: number[];
  /** The office's own shells (cmd) that are running, by office shell id. */
  officeShellIds: number[];
  /** Start an office shell — OFFICE_SHELL_ID opens with the app; "+" adds more. */
  onOpenOfficeShell: (id: number) => void;
  /** Kill an office shell (its tab's ×). */
  onCloseOfficeShell: (id: number) => void;
  /** The agent the user picked last (card, character or chat tab). */
  selectedAgentId: number | null;
  isOpen: boolean;
  /** Close the panel (the "<" in its top-right corner). */
  onClosePanel: () => void;
  /** Open width in px (user-resizable). Ignored while collapsed. */
  widthPx: number;
  /** Mousedown on the inner-edge drag handle; the hook owns the resize gesture. */
  onResizeStart: (e: ReactMouseEvent) => void;
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
  /** Every agent in the office — the Chat view's tabs. */
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
 * The office with one panel on its left, showing one of two views: the
 * agents' chats, several open at once (ChatPanel), or a plain terminal (the
 * office's own cmd, tied to no agent) to run commands and start other agents
 * from. Both views stay mounted, so drafts and xterm buffers survive a switch.
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
  officeShellIds,
  onOpenOfficeShell,
  onCloseOfficeShell,
  selectedAgentId,
  isOpen,
  onClosePanel,
  widthPx,
  onResizeStart,
  onStatusChange,
  chatAgentIds,
  focusedAgentId,
  onResumeAgent,
  onSelectAgent,
  infoFor,
  statusFor,
}: TerminalDrawerProps) {
  const inputs = useRef(new Map<number, TerminalInputHandle>());
  const [view, setView] = useState<'chat' | 'terminal'>('chat');

  // The office's cmds, one tab each in open order; the first stays "cmd".
  const shellIds = [...officeShellIds].sort((a, b) => a - b);
  const [pickedShellId, setPickedShellId] = useState<number | null>(null);
  // A "+" picks its cmd once the server announces it.
  const [pendingShellId, setPendingShellId] = useState<number | null>(null);
  useEffect(() => {
    if (pendingShellId !== null && officeShellIds.includes(pendingShellId)) {
      setPickedShellId(pendingShellId);
      setPendingShellId(null);
    }
  }, [officeShellIds, pendingShellId]);
  const shownShellId =
    pickedShellId !== null && shellIds.includes(pickedShellId)
      ? pickedShellId
      : (shellIds[shellIds.length - 1] ?? null);
  const addShell = () => {
    const id = Math.max(OFFICE_SHELL_EXTRA_BASE - 1, ...shellIds) + 1;
    setPendingShellId(id);
    onOpenOfficeShell(id);
  };
  const shellLabel = (id: number, i: number) => (id === OFFICE_SHELL_ID ? 'cmd' : `cmd ${i + 1}`);

  const paneIds = [...claudeAgentIds, ...shellIds.map(shellTerminalId)];
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
      {/* The panel — left of the office. display:none (not unmount) while
          closed: the panes stay mounted so xterm buffers and sockets survive;
          unmounting would drop the scrollback and force a reconnect on every
          toggle. TerminalPane skips fit() at zero size, and the
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

        {/* Chat | Terminal, and "<" to close the panel. */}
        <div className="flex items-center gap-2 px-8 pt-6 shrink-0 border-b-2 border-border">
          <button
            onClick={() => setView('chat')}
            className={`shrink-0 px-10 py-4 cursor-pointer border-2 border-b-0 whitespace-nowrap ${
              view === 'chat'
                ? 'bg-active-bg border-accent text-text'
                : 'bg-transparent border-transparent text-text-muted hover:text-text hover:bg-btn-hover'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setView('terminal')}
            className={`shrink-0 px-10 py-4 cursor-pointer border-2 border-b-0 whitespace-nowrap ${
              view === 'terminal'
                ? 'bg-active-bg border-accent text-text'
                : 'bg-transparent border-transparent text-text-muted hover:text-text hover:bg-btn-hover'
            }`}
          >
            Terminal
          </button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClosePanel}
            className="shrink-0 hover:bg-btn-hover"
            title="Close panel"
          >
            {'<'}
          </Button>
        </div>

        <ChatPanel
          agentIds={chatAgentIds}
          sendableAgentIds={claudeAgentIds}
          onTakeOver={onResumeAgent}
          shownAgentId={chatAgentId}
          isOpen={isOpen && view === 'chat'}
          onSelectAgent={onSelectAgent}
          infoFor={infoFor}
          statusFor={statusFor}
          inputsRef={inputs}
        />
        {view === 'chat' && chatAgentIds.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
            Chưa có agent nào
          </div>
        )}

        <div className={`flex-1 min-h-0 flex-col ${view === 'terminal' ? 'flex' : 'hidden'}`}>
          {/* One tab per cmd, "+" for another. */}
          <div className="flex items-center gap-2 px-8 pt-6 shrink-0 border-b-2 border-border">
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
              {shellIds.map((id, i) => (
                <div
                  key={id}
                  onClick={() => setPickedShellId(id)}
                  className={`shrink-0 flex items-center gap-4 pl-8 pr-2 py-2 cursor-pointer border-2 border-b-0 whitespace-nowrap ${
                    id === shownShellId
                      ? 'bg-active-bg border-accent text-text'
                      : 'bg-transparent border-transparent text-text-muted hover:text-text hover:bg-btn-hover'
                  }`}
                >
                  {shellLabel(id, i)}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseOfficeShell(id);
                    }}
                    className="hover:bg-btn-hover"
                    title="Đóng cmd này"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="icon"
                onClick={addShell}
                className="shrink-0 hover:bg-btn-hover"
                title="Mở cmd mới"
              >
                +
              </Button>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 p-4">
            {shownShellId === null && (
              <div className="absolute inset-4 flex flex-col gap-8 items-center justify-center text-sm text-text-muted">
                <span>Terminal chưa chạy</span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onOpenOfficeShell(OFFICE_SHELL_ID)}
                >
                  Mở terminal
                </Button>
              </div>
            )}
            <TerminalPaneStack
              agentIds={paneIds}
              shownAgentId={shownShellId !== null ? shellTerminalId(shownShellId) : null}
              autoFocus={view === 'terminal'}
              onStatusChange={(id, status) => {
                // Card dots follow the agent's Claude socket
                if (claudeAgentIds.includes(id)) onStatusChange(id, status);
              }}
              paneClassName="inset-4"
              inputsRef={inputs}
            />
          </div>
        </div>
      </div>

      {/* Right: the office, flexing to fill what the panel leaves. */}
      <div className="flex-1 min-w-0 flex overflow-hidden">{children}</div>
    </div>
  );
}
