import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  CHAT_COLUMN_MIN_WIDTH_PX,
  CHAT_HEADER_REFRESH_MS,
  TERMINAL_DRAWER_RESIZE_HANDLE_PX,
} from '../constants.js';
import type { TabStatus } from './AgentCard.js';
import { STATUS_DOT } from './cardBar.js';
import { ChatPane } from './ChatPane.js';
import type { TerminalInputHandle } from './TerminalPane.js';
import { Button } from './ui/Button.js';

/** What the chat header shows about an agent, read from the office. */
export interface ChatAgentInfo {
  name: string;
  directoryName?: string;
  contextTokens: number;
  maxContextTokens: number;
}

interface ChatPanelProps {
  /** Every agent in the office — one tab each; external sessions read too. */
  agentIds: number[];
  /** Agents with a Claude PTY here — the only ones a reply can be sent to. */
  sendableAgentIds: number[];
  /** Resume an external agent's session in a terminal here. */
  onTakeOver: (agentId: number) => void;
  /** The agent picked last — its chat is open and takes the keyboard. */
  shownAgentId: number | null;
  isOpen: boolean;
  widthPx: number;
  onResizeStart: (e: ReactMouseEvent) => void;
  onClose: () => void;
  onSelectAgent: (agentId: number) => void;
  infoFor: (agentId: number) => ChatAgentInfo;
  statusFor: (agentId: number) => TabStatus | null;
  /** The agents' Claude terminal inputs, mounted hidden by the terminal panel. */
  inputsRef: RefObject<Map<number, TerminalInputHandle>>;
}

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`;

/**
 * Right of the office: the agents' conversations as chat, several open at
 * once — one column each (name, directory, context gauge, then the bubbles and
 * the reply box of ChatPane), side by side while the panel is wide enough,
 * stacked when it is not. Every Claude started here opens its chat; a tab
 * along the top opens any other agent's, and a column's × closes it. Sending
 * types into the agent's own Claude terminal, so both are one session.
 */
export function ChatPanel({
  agentIds,
  sendableAgentIds,
  onTakeOver,
  shownAgentId,
  isOpen,
  widthPx,
  onResizeStart,
  onClose,
  onSelectAgent,
  infoFor,
  statusFor,
  inputsRef,
}: ChatPanelProps) {
  // The context gauge lives in the office's imperative state, not React's —
  // re-read it on a timer while the panel shows.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), CHAT_HEADER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // The open chats. A Claude started here opens once — closing it is then the
  // user's call — and the agent picked last is always open.
  const [openIds, setOpenIds] = useState<number[]>([]);
  const autoOpened = useRef(new Set<number>());
  useEffect(() => {
    const fresh = sendableAgentIds.filter((id) => !autoOpened.current.has(id));
    for (const id of fresh) autoOpened.current.add(id);
    const wanted = shownAgentId !== null ? [...fresh, shownAgentId] : fresh;
    if (wanted.length === 0) return;
    setOpenIds((prev) => {
      const added = wanted.filter((id, i) => !prev.includes(id) && wanted.indexOf(id) === i);
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [sendableAgentIds, shownAgentId]);

  if (agentIds.length === 0) return null;
  // In office order; an agent that left drops out.
  const visibleIds = agentIds.filter((id) => openIds.includes(id));

  const openChat = (id: number) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    onSelectAgent(id);
  };
  const closeChat = (id: number) => {
    const rest = visibleIds.filter((other) => other !== id);
    if (rest.length === 0) return;
    setOpenIds((prev) => prev.filter((other) => other !== id));
    // The picked agent is kept open — hand the pick to a chat still open.
    if (id === shownAgentId) onSelectAgent(rest[0]);
  };

  return (
    // display:none (not unmount) while closed, so each agent's half-typed
    // draft survives.
    <div
      className={`relative h-full shrink-0 flex-col bg-bg border-l-2 border-border ${isOpen ? 'flex' : 'hidden'}`}
      style={{ width: widthPx }}
    >
      {/* Drag handle over the inner (left) edge. */}
      <div
        className="absolute top-0 bottom-0 left-0 z-40 cursor-col-resize hover:bg-accent"
        style={{ width: TERMINAL_DRAWER_RESIZE_HANDLE_PX }}
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      {/* One tab per agent: status dot + name. An open chat's tab is lit. */}
      <div className="flex items-center gap-2 px-8 pt-6 shrink-0 border-b-2 border-border">
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
          {agentIds.map((id) => {
            const status = statusFor(id);
            const open = visibleIds.includes(id);
            return (
              <button
                key={id}
                onClick={() => openChat(id)}
                title={infoFor(id).directoryName ?? `Agent ${id}`}
                className={`shrink-0 flex items-center gap-5 px-8 py-4 cursor-pointer border-2 border-b-0 whitespace-nowrap ${
                  open
                    ? `bg-active-bg text-text ${id === shownAgentId ? 'border-accent' : 'border-border'}`
                    : 'bg-transparent border-transparent text-text-muted hover:text-text hover:bg-btn-hover'
                }`}
              >
                <span className={`size-6 shrink-0 ${status ? STATUS_DOT[status] : 'bg-border'}`} />
                {infoFor(id).name}
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="shrink-0 hover:bg-btn-hover"
          title="Close chat"
        >
          {'>'}
        </Button>
      </div>

      {/* The open chats: columns while they fit, rows sharing the height
          when they don't. Every agent's column stays mounted (hidden when
          closed) so its draft survives; only the open ones poll. */}
      <div
        className="flex-1 min-h-0 grid gap-4 p-4"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${CHAT_COLUMN_MIN_WIDTH_PX}px), 1fr))`,
          gridAutoRows: 'minmax(0, 1fr)',
        }}
      >
        {agentIds.map((id) => {
          const open = visibleIds.includes(id);
          const picked = id === shownAgentId;
          const info = infoFor(id);
          const status = statusFor(id);
          const ratio = info.maxContextTokens > 0 ? info.contextTokens / info.maxContextTokens : 0;
          return (
            <div
              key={id}
              className={`min-w-0 min-h-0 flex-col border-2 ${picked ? 'border-accent' : 'border-border'} ${open ? 'flex' : 'hidden'}`}
            >
              {/* Name · directory, how full its context is, and × to close. */}
              <div
                className="shrink-0 px-12 pt-6 pb-4 flex flex-col gap-4 cursor-pointer"
                onClick={() => onSelectAgent(id)}
              >
                <div className="flex items-center gap-6 min-w-0">
                  <span
                    className={`size-6 shrink-0 ${status ? STATUS_DOT[status] : 'bg-border'}`}
                  />
                  <span className="text-text shrink-0">{info.name}</span>
                  {info.directoryName && (
                    <span className="text-sm text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                      {info.directoryName}
                    </span>
                  )}
                  {visibleIds.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeChat(id);
                      }}
                      className="ml-auto shrink-0 hover:bg-btn-hover"
                      title="Đóng khung chat này"
                    >
                      ×
                    </Button>
                  )}
                </div>
                {info.contextTokens > 0 && (
                  <div
                    className="flex items-center gap-8 text-xs text-text-muted"
                    title={`${Math.round(ratio * 100)}% context used`}
                  >
                    <span className="shrink-0">
                      Context {formatTokens(info.contextTokens)} /{' '}
                      {formatTokens(info.maxContextTokens)} · {Math.round(ratio * 100)}%
                    </span>
                    <div className="flex-1 h-4 bg-btn-bg">
                      <div
                        className={`h-full ${ratio > 0.8 ? 'bg-status-error' : ratio > 0.6 ? 'bg-status-permission' : 'bg-accent'}`}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="relative flex-1 min-h-0">
                <ChatPane
                  agentId={id}
                  isActive={open && isOpen}
                  isFocused={picked}
                  getInput={(agentId) => inputsRef.current?.get(agentId)}
                  canSend={sendableAgentIds.includes(id)}
                  onTakeOver={() => onTakeOver(id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
