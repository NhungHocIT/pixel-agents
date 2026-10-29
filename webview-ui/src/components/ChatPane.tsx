import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { CHAT_FONT_FAMILY } from '../constants.js';
import { writeClipboardText } from '../terminal/clipboard.js';
import { serverToken } from '../transport/serverToken.js';
import type { TerminalInputHandle } from './TerminalPane.js';

/** One bubble — the server's ChatMessage (server/src/chatTranscript.ts). */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
}

const CHAT_POLL_MS = 1500;

interface ChatPaneProps {
  agentId: number;
  /** Polls only while shown. */
  isActive: boolean;
  /** Takes the keyboard when it turns true — the chat picked last. */
  isFocused: boolean;
  /** The agent's Claude terminal input — a sent message is pasted there and submitted. */
  getInput: (agentId: number) => TerminalInputHandle | undefined;
  /** False for a session with no Claude terminal here (an external one): the
   *  conversation reads, but there is nothing to type a reply into. */
  canSend: boolean;
  /** Resume the external session in a terminal this app owns, after which
   *  canSend turns true. */
  onTakeOver: () => void;
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * The agent's conversation as chat bubbles — the user's prompts on the right,
 * Claude's answers on the left — with a box to send the next prompt. Read from
 * the transcript (GET /api/chat/:agentId); sending types into the agent's own
 * Claude terminal, so the Chat and Claude tabs are one session.
 */
export function ChatPane({
  agentId,
  isActive,
  isFocused,
  getInput,
  canSend,
  onTakeOver,
}: ChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Between the click and the terminal appearing (canSend turning true).
  const [takingOver, setTakingOver] = useState(false);
  useEffect(() => {
    if (!takingOver) return;
    // A refused or failed resume never opens a terminal — let it be retried.
    const timer = window.setTimeout(() => setTakingOver(false), 8000);
    return () => window.clearTimeout(timer);
  }, [takingOver]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat/${agentId}`, {
          headers: { Authorization: `Bearer ${serverToken ?? ''}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { messages: ChatMessage[] };
        if (cancelled) return;
        setMessages((prev) =>
          prev.length === body.messages.length &&
          prev[prev.length - 1]?.id === body.messages[body.messages.length - 1]?.id
            ? prev
            : body.messages,
        );
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const timer = window.setInterval(load, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentId, isActive]);

  // Follow new messages unless the user has scrolled up to read.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, isActive]);

  useEffect(() => {
    if (isActive && isFocused) inputRef.current?.focus();
  }, [isActive, isFocused]);

  const onScroll = () => {
    const list = listRef.current;
    if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };

  const send = () => {
    const text = draft.trim();
    const input = getInput(agentId);
    if (!text || !input) return;
    input.paste(text);
    // Submit after the paste lands — sent together, Claude Code can take the
    // Enter as part of the pasted text.
    window.setTimeout(() => input.send('\r'), 80);
    setDraft('');
    stickToBottom.current = true;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const copy = async (m: ChatMessage) => {
    if (await writeClipboardText(m.text)) {
      setCopiedId(m.id);
      window.setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1200);
    }
  };

  const quote = (m: ChatMessage) => {
    const quoted = m.text
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    setDraft((d) => `${quoted}\n\n${d}`);
    inputRef.current?.focus();
  };

  const shown = messages.filter((m) => !hidden.has(m.id));
  const iconBtn =
    'w-24 h-24 flex items-center justify-center text-text-muted hover:text-text cursor-pointer bg-transparent border-none';

  return (
    <div
      className="chat-text absolute inset-4 flex flex-col bg-bg-dark"
      // Consumed by the `.chat-text` rule in index.css to beat the global
      // `* { font-pixel }` base rule.
      style={{ '--font-chat': CHAT_FONT_FAMILY } as CSSProperties}
    >
      <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-24 py-16">
        {shown.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-text-muted">
            {error ? `Không đọc được hội thoại (${error})` : 'Chưa có tin nhắn'}
          </div>
        )}
        {shown.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end mb-16">
              <div className="max-w-[75%] px-14 py-8 rounded-2xl bg-btn-bg text-text whitespace-pre-wrap break-words select-text">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="mb-16 max-w-[90%]">
              <div className="text-text whitespace-pre-wrap break-words select-text leading-relaxed">
                {m.text}
              </div>
              <div className="flex gap-4 mt-6">
                <button className={iconBtn} title="Sao chép" onClick={() => void copy(m)}>
                  {copiedId === m.id ? (
                    <svg {...iconProps}>
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  ) : (
                    <svg {...iconProps}>
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
                    </svg>
                  )}
                </button>
                <button
                  className={iconBtn}
                  title="Trích dẫn vào ô trả lời"
                  onClick={() => quote(m)}
                >
                  <svg {...iconProps}>
                    <path d="M4 6h16M4 11h16M4 16h10M4 20h6" />
                  </svg>
                </button>
                <button
                  className={iconBtn}
                  title="Ẩn khỏi khung chat (không xoá trong phiên Claude)"
                  onClick={() => setHidden((s) => new Set(s).add(m.id))}
                >
                  <svg {...iconProps}>
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 px-16 pb-12 pt-4">
        {!canSend && (
          <div className="flex items-center gap-12 mb-8 px-14 py-8 rounded-2xl border border-border text-text-muted">
            <span className="flex-1">
              Phiên này đang chạy ở terminal khác. Mở nó trong app để chat từ đây, rồi gõ{' '}
              <code>/exit</code> ở terminal cũ để hai nơi không cùng ghi một phiên.
            </span>
            <button
              onClick={() => {
                setTakingOver(true);
                onTakeOver();
              }}
              disabled={takingOver}
              className="shrink-0 px-14 py-6 rounded-full bg-accent text-white cursor-pointer border-none disabled:opacity-40 disabled:cursor-default"
            >
              {takingOver ? 'Đang mở…' : 'Mở trong app'}
            </button>
          </div>
        )}
        <div className="flex items-end gap-8 rounded-2xl bg-btn-bg px-14 py-8 border border-border">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            disabled={!canSend}
            placeholder={
              canSend
                ? 'Nhắn cho Claude… (Enter gửi, Shift+Enter xuống dòng)'
                : 'Mở phiên trong app để gửi tin nhắn'
            }
            className="flex-1 resize-none bg-transparent text-text outline-none border-none placeholder:text-text-muted"
          />
          <button
            onClick={send}
            disabled={!canSend || !draft.trim()}
            title="Gửi"
            className="w-32 h-32 shrink-0 flex items-center justify-center rounded-full bg-accent text-white cursor-pointer border-none disabled:opacity-40 disabled:cursor-default"
          >
            <svg {...iconProps}>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
