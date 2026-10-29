import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useEffect, useState } from 'react';

import { CHAT_HEADER_REFRESH_MS, TERMINAL_DRAWER_RESIZE_HANDLE_PX } from '../constants.js';
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
  /** The agent whose conversation shows (the terminal panel's agent). */
  shownAgentId: number | null;
  isOpen: boolean;
  widthPx: number;
  onResizeStart: (e: ReactMouseEvent) => void;
  onClose: () => void;
  onSelectAgent: (agentId: number) => void;
  infoFor: (agentId: number) => ChatAgentInfo;
  statusFor: (agentId: number) => TabStatus | null;
  /** The agents' Claude terminal inputs, filled by the terminal panel's panes. */
  inputsRef: RefObject<Map<number, TerminalInputHandle>>;
}

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`;

/**
 * Right of the office: the selected agent's conversation as chat — a tab per
 * agent along the top, its name, directory and context gauge, then the
 * bubbles and the reply box (ChatPane). Sending types into the agent's Claude
 * terminal in the panel on the left, so both show one session.
 */
export function ChatPanel({
  agentIds,
  sendableAgentIds,
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

  if (agentIds.length === 0) return null;
  const info =
    shownAgentId !== null && agentIds.includes(shownAgentId) ? infoFor(shownAgentId) : null;
  const ratio = info && info.maxContextTokens > 0 ? info.contextTokens / info.maxContextTokens : 0;

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

      {/* One tab per agent: status dot + name. */}
      <div className="flex items-center gap-2 px-8 pt-6 shrink-0 border-b-2 border-border">
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
          {agentIds.map((id) => {
            const status = statusFor(id);
            const active = id === shownAgentId;
            return (
              <button
                key={id}
                onClick={() => onSelectAgent(id)}
                title={infoFor(id).directoryName ?? `Agent ${id}`}
                className={`shrink-0 flex items-center gap-5 px-8 py-4 cursor-pointer border-2 border-b-0 whitespace-nowrap ${
                  active
                    ? 'bg-active-bg border-accent text-text'
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

      {/* The shown agent: name · directory, and how full its context is. */}
      {info && (
        <div className="shrink-0 px-12 pt-6 pb-4 flex flex-col gap-4">
          <div className="flex items-baseline gap-6 min-w-0">
            <span className="text-text shrink-0">{info.name}</span>
            {info.directoryName && (
              <span className="text-sm text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                {info.directoryName}
              </span>
            )}
          </div>
          {info.contextTokens > 0 && (
            <div
              className="flex items-center gap-8 text-xs text-text-muted"
              title={`${Math.round(ratio * 100)}% context used`}
            >
              <span className="shrink-0">
                Context {formatTokens(info.contextTokens)} / {formatTokens(info.maxContextTokens)} ·{' '}
                {Math.round(ratio * 100)}%
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
      )}

      <div className="relative flex-1 min-h-0">
        {/* Mounted per agent, so a half-typed draft survives a tab switch;
            only the shown one polls. */}
        {agentIds.map((id) => (
          <div key={id} className={id === shownAgentId ? '' : 'hidden'}>
            <ChatPane
              agentId={id}
              isActive={id === shownAgentId && isOpen}
              getInput={(agentId) => inputsRef.current?.get(agentId)}
              canSend={sendableAgentIds.includes(id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
