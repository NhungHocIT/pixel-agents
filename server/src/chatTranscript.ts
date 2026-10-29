/**
 * Chat view of an agent's transcript: the prompts the user typed and the text
 * Claude answered with, nothing else (no tool calls, tool results, thinking,
 * slash-command echoes or sub-agent lines). Feeds the standalone Chat tab.
 */

import * as fs from 'fs';

export interface ChatMessage {
  /** The transcript entry's uuid — stable across reads. */
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
}

/** Newest messages kept per response; older ones stay in the terminal. */
export const CHAT_MESSAGE_LIMIT = 200;

interface ContentBlock {
  type?: string;
  text?: string;
}

/** Claude Code's own wrappers (slash commands, caveats, task notices) start with a tag. */
function isHarnessText(text: string): boolean {
  return text.trimStart().startsWith('<');
}

/** One JSONL line → a chat message, or null when it is not one. */
export function chatMessageFromLine(line: string): ChatMessage | null {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const role = entry.type;
  if (role !== 'user' && role !== 'assistant') return null;
  if (entry.isMeta || entry.isSidechain) return null;
  const content = (entry.message as { content?: unknown } | undefined)?.content;

  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    const blocks = content as ContentBlock[];
    if (blocks.some((b) => b.type === 'tool_result')) return null;
    text = blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  text = text.trim();
  if (!text || (role === 'user' && isHarnessText(text))) return null;

  return {
    id: typeof entry.uuid === 'string' ? entry.uuid : '',
    role,
    text,
    timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
  };
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  messages: ChatMessage[];
}

// The Chat tab polls; re-parse a transcript only when it has changed.
const cache = new Map<string, CacheEntry>();

/** The chat messages in a transcript file, oldest first (at most CHAT_MESSAGE_LIMIT). */
export function readChatMessages(jsonlFile: string): ChatMessage[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(jsonlFile);
  } catch {
    return [];
  }
  const hit = cache.get(jsonlFile);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.messages;

  const messages: ChatMessage[] = [];
  for (const line of fs.readFileSync(jsonlFile, 'utf8').split('\n')) {
    if (!line) continue;
    const message = chatMessageFromLine(line);
    if (message) messages.push(message);
  }
  const kept = messages.slice(-CHAT_MESSAGE_LIMIT);
  cache.set(jsonlFile, { size: stat.size, mtimeMs: stat.mtimeMs, messages: kept });
  return kept;
}
