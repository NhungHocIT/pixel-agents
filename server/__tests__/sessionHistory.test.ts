import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearSessionHistoryCache,
  collectSessionHistory,
  summarizeTranscript,
} from '../src/sessionHistory.js';

const line = (r: Record<string, unknown>) => JSON.stringify(r);

const assistant = (id: string, usage: Record<string, number>, model = 'claude-opus-5-5') =>
  line({
    type: 'assistant',
    sessionId: 's1',
    cwd: '/work/app',
    timestamp: '2026-11-01T10:00:01.000Z',
    message: { id, model, usage },
  });

const usage = {
  input_tokens: 10,
  output_tokens: 20,
  cache_creation_input_tokens: 30,
  cache_read_input_tokens: 40,
};

describe('summarizeTranscript', () => {
  it('counts each API message once even when it spans several records', () => {
    const content = [
      line({
        type: 'user',
        cwd: '/work/app',
        timestamp: '2026-11-01T10:00:00.000Z',
        message: { content: 'fix the bug' },
      }),
      assistant('msg_1', usage),
      assistant('msg_1', usage), // same message, second content block
      assistant('msg_2', { ...usage, output_tokens: 5 }),
    ].join('\n');
    const s = summarizeTranscript(content);
    expect(s.inputTokens).toBe(20);
    expect(s.outputTokens).toBe(25);
    expect(s.cacheCreationTokens).toBe(60);
    expect(s.cacheReadTokens).toBe(80);
    expect(s.assistantMessages).toBe(2);
    expect(s.firstPrompt).toBe('fix the bug');
    expect(s.promptCount).toBe(1);
    expect(s.startedAt).toBe('2026-11-01T10:00:00.000Z');
  });

  it('skips tool results and command wrappers when counting prompts', () => {
    const content = [
      line({ type: 'user', message: { content: '<command-name>/clear</command-name>' } }),
      line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
      line({ type: 'user', isMeta: true, message: { content: 'meta' } }),
      line({ type: 'user', message: { content: [{ type: 'text', text: 'real question' }] } }),
    ].join('\n');
    const s = summarizeTranscript(content);
    expect(s.promptCount).toBe(1);
    expect(s.firstPrompt).toBe('real question');
  });

  it('prefers the custom title, then the AI title', () => {
    const base = [line({ type: 'user', message: { content: 'hello' } })];
    expect(
      summarizeTranscript([...base, line({ type: 'ai-title', aiTitle: 'AI' })].join('\n')).aiTitle,
    ).toBe('AI');
    const s = summarizeTranscript(
      [
        ...base,
        line({ type: 'ai-title', aiTitle: 'AI' }),
        line({ type: 'custom-title', customTitle: 'Mine' }),
      ].join('\n'),
    );
    expect(s.customTitle).toBe('Mine');
  });

  it('sums the last cost snapshot of each CLI run', () => {
    const content = [
      line({ type: 'cost-state', startTime: 1, totalCostUSD: 0.1 }),
      line({ type: 'cost-state', startTime: 1, totalCostUSD: 0.5 }),
      line({ type: 'cost-state', startTime: 2, totalCostUSD: 0.25 }),
    ].join('\n');
    expect(summarizeTranscript(content).costUSD).toBeCloseTo(0.75);
  });

  it('tolerates a torn last line', () => {
    const content = `${assistant('msg_1', usage)}\n{"type":"assist`;
    expect(summarizeTranscript(content).outputTokens).toBe(20);
  });
});

describe('collectSessionHistory', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-history-test-'));
    clearSessionHistoryCache();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists sessions newest first and folds sub-agent tokens into their session', () => {
    const projectDir = path.join(root, 'proj');
    fs.mkdirSync(path.join(projectDir, 'old', 'subagents'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'old.jsonl'),
      [
        line({ type: 'user', cwd: '/work/app', message: { content: 'first' } }),
        assistant('a', usage),
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(projectDir, 'old', 'subagents', 'agent-1.jsonl'),
      assistant('sub', usage),
    );
    fs.writeFileSync(
      path.join(projectDir, 'new.jsonl'),
      [
        line({ type: 'user', cwd: '/work/app', message: { content: 'second' } }),
        assistant('b', usage),
      ].join('\n'),
    );
    // Never answered: not a session worth listing.
    fs.writeFileSync(
      path.join(projectDir, 'empty.jsonl'),
      line({ type: 'user', cwd: '/x', message: { content: 'hi' } }),
    );
    const past = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(path.join(projectDir, 'old.jsonl'), past, past);

    return collectSessionHistory({ getAllSessionRoots: () => [root] }).then((sessions) => {
      expect(sessions.map((s) => s.sessionId)).toEqual(['new', 'old']);
      const old = sessions[1];
      expect(old.title).toBe('first');
      expect(old.outputTokens).toBe(40);
      expect(old.cwd).toBe('/work/app');
    });
  });
});
