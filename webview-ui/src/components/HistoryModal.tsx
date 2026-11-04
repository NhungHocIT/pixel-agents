import { useEffect, useMemo, useState } from 'react';

import type { SessionHistoryEntry } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The host can open a terminal here, so a session can be resumed. */
  canResume: boolean;
  /** A session that is open in the office right now: show its agent. */
  onShowAgent: (agentId: number) => void;
}

/** Everything a session sent and received, cache included. */
function totalTokens(s: SessionHistoryEntry): number {
  return s.inputTokens + s.outputTokens + s.cacheCreationTokens + s.cacheReadTokens;
}

/** 1234 → "1.2K", 22539789 → "22.5M". */
function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  return usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(3)}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/**
 * History tab: every past Claude session on the host, newest first, with the
 * tokens it spent. A row's "Tiếp tục" reopens the session in a new terminal
 * (`claude --resume`) in the directory it ran in; a session already open in the
 * office shows its agent instead.
 */
export function HistoryModal({ isOpen, onClose, canResume, onShowAgent }: HistoryModalProps) {
  const [sessions, setSessions] = useState<SessionHistoryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return transport.onMessage((msg) => {
      if (msg.type === 'sessionHistory') {
        setSessions(msg.sessions);
      } else if (msg.type === 'sessionResumeRejected') {
        setPending(null);
        setError(msg.reason);
      } else if (msg.type === 'terminalSessionOpened') {
        // The resumed session's terminal is up: get out of its way.
        setPending((p) => {
          if (p !== null) onClose();
          return null;
        });
      }
    });
  }, [onClose]);

  // Fresh list on every open: sessions keep spending tokens while it's closed.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPending(null);
    transport.send({ type: 'requestSessionHistory' });
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q),
    );
  }, [sessions, query]);

  const grand = useMemo(() => {
    let tokens = 0;
    let cost = 0;
    for (const s of filtered) {
      tokens += totalTokens(s);
      cost += s.costUSD ?? 0;
    }
    return { tokens, cost };
  }, [filtered]);

  const resume = (s: SessionHistoryEntry) => {
    if (s.runningAgentId !== undefined) {
      onClose();
      onShowAgent(s.runningAgentId);
      return;
    }
    setError(null);
    setPending(s.sessionId);
    transport.send({ type: 'resumeSession', sessionId: s.sessionId });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="History" className="w-[720px]">
      <div data-testid="history-modal" className="flex flex-col gap-6 px-10 pb-8">
        <div className="flex flex-wrap items-center gap-8">
          <input
            type="text"
            value={query}
            placeholder="Tìm theo tên phiên hoặc thư mục…"
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 text-sm py-2 px-4 bg-bg border-2 border-border rounded-none text-text"
          />
          <Button
            size="sm"
            onClick={() => {
              setSessions(null);
              transport.send({ type: 'requestSessionHistory' });
            }}
            title="Tải lại"
          >
            ↻
          </Button>
        </div>

        {sessions !== null && (
          <div className="text-sm text-text-muted">
            {filtered.length} phiên · tổng{' '}
            <span className="text-text">{formatTokens(grand.tokens)} token</span>
            {grand.cost > 0 && <> · ~{formatCost(grand.cost)}</>}
          </div>
        )}

        {error && <div className="text-sm text-danger">{error}</div>}

        {sessions === null ? (
          <div className="text-sm text-text-muted py-8">Đang đọc lịch sử phiên…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-text-muted py-8">Chưa có phiên nào.</div>
        ) : (
          <ul className="flex flex-col gap-4 m-0 p-0 list-none">
            {filtered.map((s) => {
              const running = s.runningAgentId !== undefined;
              const isPending = pending === s.sessionId;
              return (
                <li
                  key={s.sessionId}
                  data-testid="history-row"
                  className="flex items-start gap-8 border-2 border-border p-6"
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span
                      className="text-base text-text overflow-hidden text-ellipsis whitespace-nowrap"
                      title={s.title}
                    >
                      {s.title}
                    </span>
                    <span
                      className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
                      title={s.cwd}
                    >
                      {baseName(s.cwd)} · {formatWhen(s.lastActiveAt)} · {s.promptCount} lượt hỏi
                      {s.model ? ` · ${s.model}` : ''}
                    </span>
                    <span className="text-xs text-text-muted">
                      <span className="text-accent-bright">
                        {formatTokens(totalTokens(s))} token
                      </span>
                      {s.costUSD !== undefined && <> · ~{formatCost(s.costUSD)}</>}
                      {' — '}vào {formatTokens(s.inputTokens)} · ra {formatTokens(s.outputTokens)} ·
                      cache ghi {formatTokens(s.cacheCreationTokens)} · cache đọc{' '}
                      {formatTokens(s.cacheReadTokens)}
                    </span>
                  </div>
                  {(running || canResume) && (
                    <Button
                      size="sm"
                      variant={running ? 'default' : isPending ? 'disabled' : 'accent'}
                      disabled={isPending}
                      onClick={() => resume(s)}
                      className="shrink-0 self-center"
                      title={running ? 'Phiên đang mở — xem agent' : 'Mở lại phiên này để làm tiếp'}
                    >
                      {running ? 'Đang mở' : isPending ? 'Đang mở…' : 'Tiếp tục'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
