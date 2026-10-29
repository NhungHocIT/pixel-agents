import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import {
  OFFICE_SHELL_EXTRA_BASE,
  OFFICE_SHELL_ID,
  shellTerminalId,
} from '../../../core/src/constants.js';
import { TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
import type { TerminalConnectionStatus } from '../terminal/terminalClient.js';
import type { TabStatus } from './AgentCard.js';
import { STATUS_DOT } from './cardBar.js';
import { TerminalPaneStack } from './TerminalPaneStack.js';
import { Button } from './ui/Button.js';

/** Which of an agent's terminals the mobile terminal page shows: the Claude
 *  terminal itself, or the shell (cmd) beside it. */
export type TerminalView = 'claude' | 'shell';

interface TerminalDrawerProps {
  /** The office region, laid out right of the panel. */
  children: ReactNode;
  /** Agent ids with a live Claude PTY here — one tab each. */
  claudeAgentIds: number[];
  /** The office's own shells (cmd) that are running, by office shell id. */
  officeShellIds: number[];
  /** Start an office shell — OFFICE_SHELL_ID opens with the app; "+" adds more. */
  onOpenOfficeShell: (id: number) => void;
  /** Kill an office shell (its tab's ×). */
  onCloseOfficeShell: (id: number) => void;
  /** The agent the user picked last (card or character) — its tab shows. */
  selectedAgentId: number | null;
  isOpen: boolean;
  /** Close the panel (the "<" in its top-right corner). */
  onClosePanel: () => void;
  /** Open width in px (user-resizable). Ignored while collapsed. */
  widthPx: number;
  /** Mousedown on the inner-edge drag handle; the hook owns the resize gesture. */
  onResizeStart: (e: ReactMouseEvent) => void;
  onStatusChange: (agentId: number, status: TerminalConnectionStatus) => void;
  /** A Claude tab click — the same as a card click. */
  onSelectAgent: (agentId: number) => void;
  /** End an agent (its Claude tab's ×). */
  onCloseAgent: (agentId: number) => void;
  /** The name an agent's character shows in the office. */
  nameFor: (agentId: number) => string;
  statusFor: (agentId: number) => TabStatus | null;
}

const tabClass = (shown: boolean) =>
  `shrink-0 flex items-center gap-4 pl-8 pr-2 py-2 cursor-pointer border-2 border-b-0 whitespace-nowrap ${
    shown
      ? 'bg-active-bg border-accent text-text'
      : 'bg-transparent border-transparent text-text-muted hover:text-text hover:bg-btn-hover'
  }`;

/**
 * The office with a terminal panel on its left: one tab per Claude started
 * here, then the office's own cmds (tied to no agent) to run commands and
 * start other agents from. Every pane stays mounted, hidden when another tab
 * shows, so xterm buffers and sockets survive a switch; the Claude sockets
 * also feed the card dots.
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
  onSelectAgent,
  onCloseAgent,
  nameFor,
  statusFor,
}: TerminalDrawerProps) {
  // The office's cmds, one tab each in open order; the first stays "cmd".
  const shellIds = [...officeShellIds].sort((a, b) => a - b);
  const shellPaneIds = shellIds.map(shellTerminalId);
  const paneIds = [...claudeAgentIds, ...shellPaneIds];

  // The tab showing, by pane id. A picked agent (card, character, a Claude
  // just launched) shows its Claude tab.
  const [pickedPaneId, setPickedPaneId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedAgentId !== null && claudeAgentIds.includes(selectedAgentId)) {
      setPickedPaneId(selectedAgentId);
    }
  }, [selectedAgentId, claudeAgentIds]);
  // A "+" picks its cmd once the server announces it.
  const [pendingShellId, setPendingShellId] = useState<number | null>(null);
  useEffect(() => {
    if (pendingShellId !== null && officeShellIds.includes(pendingShellId)) {
      setPickedPaneId(shellTerminalId(pendingShellId));
      setPendingShellId(null);
    }
  }, [officeShellIds, pendingShellId]);
  const shownPaneId =
    pickedPaneId !== null && paneIds.includes(pickedPaneId)
      ? pickedPaneId
      : (shellPaneIds[shellPaneIds.length - 1] ?? claudeAgentIds[0] ?? null);

  const addShell = () => {
    const id = Math.max(OFFICE_SHELL_EXTRA_BASE - 1, ...shellIds) + 1;
    setPendingShellId(id);
    onOpenOfficeShell(id);
  };
  const shellLabel = (id: number, i: number) => (id === OFFICE_SHELL_ID ? 'cmd' : `cmd ${i + 1}`);

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

        {/* One tab per Claude (status dot + name), then one per cmd, "+" for
            another cmd. */}
        <div className="flex items-center gap-2 px-8 pt-6 shrink-0 border-b-2 border-border">
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
            {claudeAgentIds.map((id) => {
              const status = statusFor(id);
              return (
                <div
                  key={id}
                  onClick={() => {
                    setPickedPaneId(id);
                    onSelectAgent(id);
                  }}
                  className={tabClass(id === shownPaneId)}
                >
                  <span
                    className={`size-6 shrink-0 ${status ? STATUS_DOT[status] : 'bg-border'}`}
                  />
                  {nameFor(id)}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseAgent(id);
                    }}
                    className="hover:bg-btn-hover"
                    title="Đóng agent này"
                  >
                    ×
                  </Button>
                </div>
              );
            })}
            {shellIds.map((id, i) => (
              <div
                key={id}
                onClick={() => setPickedPaneId(shellTerminalId(id))}
                className={tabClass(shellTerminalId(id) === shownPaneId)}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={onClosePanel}
            className="shrink-0 hover:bg-btn-hover"
            title="Close terminal"
          >
            {'<'}
          </Button>
        </div>

        <div className="relative flex-1 min-h-0 p-4">
          {shownPaneId === null && (
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
            shownAgentId={shownPaneId}
            autoFocus
            onStatusChange={(id, status) => {
              // Card dots follow the agent's Claude socket
              if (claudeAgentIds.includes(id)) onStatusChange(id, status);
            }}
            paneClassName="inset-4"
          />
        </div>
      </div>

      {/* Right: the office, flexing to fill what the panel leaves. */}
      <div className="flex-1 min-w-0 flex overflow-hidden">{children}</div>
    </div>
  );
}
