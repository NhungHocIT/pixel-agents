import { describe, expect, it } from 'vitest';

import { chatMessageFromLine } from '../src/chatTranscript.js';

const line = (entry: Record<string, unknown>) => JSON.stringify({ uuid: 'u1', ...entry });

describe('chatMessageFromLine', () => {
  it('keeps a typed prompt and an assistant text answer', () => {
    expect(
      chatMessageFromLine(line({ type: 'user', message: { content: 'hello' } })),
    ).toMatchObject({ role: 'user', text: 'hello' });
    const answer = line({
      type: 'assistant',
      message: { content: [{ type: 'thinking' }, { type: 'text', text: 'hi there' }] },
    });
    expect(chatMessageFromLine(answer)).toMatchObject({ role: 'assistant', text: 'hi there' });
  });

  it('drops tool calls, tool results, meta, sub-agent and slash-command lines', () => {
    const dropped = [
      line({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }),
      line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } }),
      line({ type: 'user', isMeta: true, message: { content: 'caveat' } }),
      line({ type: 'user', isSidechain: true, message: { content: 'sub' } }),
      line({ type: 'user', message: { content: '<command-name>/clear</command-name>' } }),
      line({ type: 'system', message: { content: 'x' } }),
      'not json',
    ];
    for (const l of dropped) expect(chatMessageFromLine(l)).toBeNull();
  });
});
