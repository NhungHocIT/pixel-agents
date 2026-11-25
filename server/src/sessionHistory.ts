/**
 * Session History: every Claude session on this machine, with what it cost.
 *
 * The office's History tab lists past sessions so one can be picked up again
 * (`claude --resume <id>` in its own working directory) and shows the tokens
 * each spent. Both come straight from the transcripts the CLI already writes
 * under the provider's session roots — nothing extra is recorded.
 *
 * Tokens: every assistant record carries `message.usage`. Claude Code writes
 * one record per content block of the same API message, all repeating that
 * message's usage, so usage is keyed by `message.id` (last wins) before being
 * summed. A session's sub-agents (`<projectDir>/<sessionId>/subagents/*.jsonl`)
 * spend tokens on the session's behalf, so they are counted into it.
 *
 * Cost: the CLI records `cost-state` snapshots, cumulative per CLI run
 * (`startTime`). The last snapshot of each run is summed. Absent on old
 * transcripts, so the cost is optional.
 *
 * Parsing a few hundred MB of transcripts is not free, so each file's summary
 * is cached by (mtime, size): after the first scan only the files that changed
 * are read again.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { HookProvider } from '../../core/src/provider.js';
import {
  SESSION_DELETE_ACTIVE_GRACE_MS,
  SESSION_HISTORY_LIMIT,
  SESSION_HISTORY_TITLE_MAX,
} from './constants.js';

export type HistoryProvider = Pick<HookProvider, 'getAllSessionRoots'>;

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface SessionHistoryEntry extends TokenTotals {
  sessionId: string;
  /** Working directory the session ran in (where a resume must run too). */
  cwd: string;
  title: string;
  /** ISO timestamp of the first record, or of the file's mtime when none. */
  startedAt: string;
  /** ISO timestamp of the transcript's last write. */
  lastActiveAt: string;
  /** Prompts the user typed (not tool results, not commands). */
  promptCount: number;
  /** Model of the last assistant reply. */
  model?: string;
  /** Sum of the CLI's own cost snapshots, when the transcript has any. */
  costUSD?: number;
  /** Absolute path of the main transcript. */
  transcriptPath: string;
}

interface FileSummary extends TokenTotals {
  sessionId?: string;
  cwd?: string;
  customTitle?: string;
  aiTitle?: string;
  firstPrompt?: string;
  startedAt?: string;
  promptCount: number;
  model?: string;
  costUSD?: number;
  assistantMessages: number;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  summary: FileSummary;
}

const cache = new Map<string, CacheEntry>();

/** For tests: forget every cached file summary. */
export function clearSessionHistoryCache(): void {
  cache.clear();
}

function emptyTotals(): TokenTotals {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** First line of a typed prompt, or undefined for anything that isn't one
 *  (tool results, slash-command wrappers, injected meta messages). */
function promptText(record: Record<string, unknown>): string | undefined {
  if (record.isMeta === true || record.isSidechain === true) return undefined;
  const message = record.message as { content?: unknown } | undefined;
  let text: string | undefined;
  if (typeof message?.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message?.content)) {
    // Arrays carrying a tool_result are the CLI answering a tool, not the user.
    const blocks = message.content as Array<Record<string, unknown>>;
    if (blocks.some((b) => b?.type === 'tool_result')) return undefined;
    const first = blocks.find((b) => b?.type === 'text' && typeof b.text === 'string');
    text = first?.text as string | undefined;
  }
  if (!text) return undefined;
  const trimmed = text.trim();
  // Slash commands, their output and hook/system injections are wrapped in tags.
  if (!trimmed || trimmed.startsWith('<')) return undefined;
  return trimmed;
}

/** Parse one transcript into a summary. Exported for tests. */
export function summarizeTranscript(content: string): FileSummary {
  const usageById = new Map<string, TokenTotals>();
  const anonymousUsage = emptyTotals();
  const costByRun = new Map<string, number>();
  const summary: FileSummary = { ...emptyTotals(), promptCount: 0, assistantMessages: 0 };

  for (const line of content.split('\n')) {
    if (!line) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // a torn last line while the CLI is still writing
    }
    if (!summary.sessionId && typeof record.sessionId === 'string') {
      summary.sessionId = record.sessionId;
    }
    if (!summary.cwd && typeof record.cwd === 'string') summary.cwd = record.cwd;
    if (!summary.startedAt && typeof record.timestamp === 'string') {
      summary.startedAt = record.timestamp;
    }

    switch (record.type) {
      case 'assistant': {
        const message = record.message as
          { id?: unknown; model?: unknown; usage?: Record<string, unknown> } | undefined;
        if (!message?.usage) break;
        const u = message.usage;
        const totals: TokenTotals = {
          inputTokens: num(u.input_tokens),
          outputTokens: num(u.output_tokens),
          cacheCreationTokens: num(u.cache_creation_input_tokens),
          cacheReadTokens: num(u.cache_read_input_tokens),
        };
        if (typeof message.id === 'string') {
          usageById.set(message.id, totals);
        } else {
          anonymousUsage.inputTokens += totals.inputTokens;
          anonymousUsage.outputTokens += totals.outputTokens;
          anonymousUsage.cacheCreationTokens += totals.cacheCreationTokens;
          anonymousUsage.cacheReadTokens += totals.cacheReadTokens;
        }
        // '<synthetic>' marks CLI-made placeholder replies, not a real model.
        if (typeof message.model === 'string' && message.model !== '<synthetic>') {
          summary.model = message.model;
        }
        break;
      }
      case 'user': {
        const text = promptText(record);
        if (text) {
          summary.promptCount++;
          if (!summary.firstPrompt) summary.firstPrompt = text;
        }
        break;
      }
      case 'custom-title':
        if (typeof record.customTitle === 'string') summary.customTitle = record.customTitle;
        break;
      case 'ai-title':
        if (typeof record.aiTitle === 'string') summary.aiTitle = record.aiTitle;
        break;
      case 'cost-state':
        if (typeof record.totalCostUSD === 'number') {
          costByRun.set(String(record.startTime ?? ''), record.totalCostUSD);
        }
        break;
    }
  }

  summary.assistantMessages = usageById.size;
  for (const t of [...usageById.values(), anonymousUsage]) {
    summary.inputTokens += t.inputTokens;
    summary.outputTokens += t.outputTokens;
    summary.cacheCreationTokens += t.cacheCreationTokens;
    summary.cacheReadTokens += t.cacheReadTokens;
  }
  if (costByRun.size > 0) {
    summary.costUSD = [...costByRun.values()].reduce((a, b) => a + b, 0);
  }
  return summary;
}

async function summarizeFile(filePath: string): Promise<FileSummary | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return null;
  }
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.summary;
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  const summary = summarizeTranscript(content);
  cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, summary });
  return summary;
}

async function listJsonl(dir: string): Promise<string[]> {
  try {
    const names = await fs.promises.readdir(dir);
    return names.filter((n) => n.endsWith('.jsonl')).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > SESSION_HISTORY_TITLE_MAX
    ? `${oneLine.slice(0, SESSION_HISTORY_TITLE_MAX - 1)}…`
    : oneLine;
}

/** Every session under the provider's roots that ever got a reply, most
 *  recently active first. */
export async function collectSessionHistory(
  provider: HistoryProvider,
): Promise<SessionHistoryEntry[]> {
  const roots = provider.getAllSessionRoots?.() ?? [];
  const entries: SessionHistoryEntry[] = [];

  for (const root of roots) {
    let projectDirs: string[];
    try {
      projectDirs = (await fs.promises.readdir(root, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => path.join(root, d.name));
    } catch {
      continue;
    }
    for (const projectDir of projectDirs) {
      for (const file of await listJsonl(projectDir)) {
        const main = await summarizeFile(file);
        if (!main || main.assistantMessages === 0 || !main.cwd) continue;
        const sessionId = path.basename(file, '.jsonl');

        const totals: TokenTotals = {
          inputTokens: main.inputTokens,
          outputTokens: main.outputTokens,
          cacheCreationTokens: main.cacheCreationTokens,
          cacheReadTokens: main.cacheReadTokens,
        };
        for (const sub of await listJsonl(path.join(projectDir, sessionId, 'subagents'))) {
          const s = await summarizeFile(sub);
          if (!s) continue;
          totals.inputTokens += s.inputTokens;
          totals.outputTokens += s.outputTokens;
          totals.cacheCreationTokens += s.cacheCreationTokens;
          totals.cacheReadTokens += s.cacheReadTokens;
        }

        let mtime: Date;
        try {
          mtime = (await fs.promises.stat(file)).mtime;
        } catch {
          continue;
        }
        entries.push({
          sessionId,
          cwd: main.cwd,
          title: clip(main.customTitle ?? main.aiTitle ?? main.firstPrompt ?? sessionId),
          startedAt: main.startedAt ?? mtime.toISOString(),
          lastActiveAt: mtime.toISOString(),
          promptCount: main.promptCount,
          model: main.model,
          costUSD: main.costUSD,
          transcriptPath: file,
          ...totals,
        });
      }
    }
  }

  entries.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  return entries.slice(0, SESSION_HISTORY_LIMIT);
}

/** One session by id, read fresh — the resume path's source of truth for
 *  where the session ran (never the client's say-so). */
export async function findSessionInHistory(
  provider: HistoryProvider,
  sessionId: string,
): Promise<SessionHistoryEntry | undefined> {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) return undefined;
  const all = await collectSessionHistory(provider);
  return all.find((e) => e.sessionId === sessionId);
}

export interface DeleteSessionsResult {
  deleted: string[];
  skipped: Array<{ sessionId: string; reason: string }>;
}

/**
 * Permanently delete sessions: each one's transcript and the folder beside it
 * (`<projectDir>/<sessionId>/` — sub-agents, tool results), then what the CLI
 * keeps about it elsewhere (see pruneSessionLeftovers). Paths come from the
 * host's own index, never the client. Left alone: a session the office is
 * running (`isOpen`), and one written to within the grace period, whose CLI
 * may be running in a window the office doesn't own.
 */
export async function deleteSessions(
  provider: HistoryProvider,
  sessionIds: readonly string[],
  isOpen: (sessionId: string) => boolean,
  now: number = Date.now(),
): Promise<DeleteSessionsResult> {
  const result: DeleteSessionsResult = { deleted: [], skipped: [] };
  const byId = new Map((await collectSessionHistory(provider)).map((e) => [e.sessionId, e]));
  const deletedByConfigDir = new Map<string, Set<string>>();

  for (const sessionId of new Set(sessionIds)) {
    const skip = (reason: string) => result.skipped.push({ sessionId, reason });
    const entry = byId.get(sessionId);
    if (!entry) {
      skip('Session not found.');
      continue;
    }
    if (isOpen(sessionId)) {
      skip('This session is open in the office.');
      continue;
    }
    if (now - Date.parse(entry.lastActiveAt) < SESSION_DELETE_ACTIVE_GRACE_MS) {
      skip('This session was active a moment ago and may still be running.');
      continue;
    }
    const sideDir = path.join(path.dirname(entry.transcriptPath), sessionId);
    try {
      await fs.promises.rm(entry.transcriptPath, { force: true });
      await fs.promises.rm(sideDir, { recursive: true, force: true });
    } catch (err) {
      skip(`Could not delete: ${String(err)}`);
      continue;
    }
    for (const key of [...cache.keys()]) {
      if (key === entry.transcriptPath || key.startsWith(sideDir + path.sep)) cache.delete(key);
    }
    // <configDir>/projects/<projectDir>/<sessionId>.jsonl
    const configDir = path.dirname(path.dirname(path.dirname(entry.transcriptPath)));
    const ids = deletedByConfigDir.get(configDir) ?? new Set<string>();
    ids.add(sessionId);
    deletedByConfigDir.set(configDir, ids);
    result.deleted.push(sessionId);
  }

  for (const [configDir, ids] of deletedByConfigDir) {
    await pruneSessionLeftovers(configDir, ids);
  }
  return result;
}

/**
 * What the CLI keeps about a session outside its transcript: the prompts typed
 * in it (`history.jsonl` — the ↑ / Ctrl+R recall, which would otherwise bring a
 * deleted session's questions back the next day), its edit snapshots
 * (`file-history/<id>`) and its env dump (`session-env/<id>`). Best effort: a
 * leftover never fails the delete.
 */
export async function pruneSessionLeftovers(
  configDir: string,
  sessionIds: ReadonlySet<string>,
): Promise<void> {
  for (const sessionId of sessionIds) {
    for (const sub of ['file-history', 'session-env']) {
      await fs.promises
        .rm(path.join(configDir, sub, sessionId), { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  const historyFile = path.join(configDir, 'history.jsonl');
  let content: string;
  try {
    content = await fs.promises.readFile(historyFile, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  const kept = lines.filter((line) => {
    if (!line) return true;
    try {
      const id = (JSON.parse(line) as { sessionId?: unknown }).sessionId;
      return typeof id !== 'string' || !sessionIds.has(id);
    } catch {
      return true;
    }
  });
  if (kept.length === lines.length) return;
  // Live CLIs append to this file. Read-filter-write is one tick of async I/O,
  // and the write goes through a temp file so a crash never leaves half a file.
  const tmp = `${historyFile}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(tmp, kept.join('\n'), 'utf8');
    await fs.promises.rename(tmp, historyFile);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true }).catch(() => undefined);
    console.warn(`[Pixel Agents] Session delete: history.jsonl not pruned: ${String(err)}`);
  }
}
