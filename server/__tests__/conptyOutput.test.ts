import { Terminal } from '@xterm/headless';
import { describe, expect, it } from 'vitest';

import { normalizeConptyOutput } from '../src/terminal/conptyOutput.js';

/** Write `data` to a fresh 40x3 headless xterm and return row 0's text. */
function render(data: string): Promise<string> {
  const term = new Terminal({ cols: 40, rows: 3, allowProposedApi: true });
  return new Promise((resolve) => {
    term.write(data, () => resolve(term.buffer.active.getLine(0)!.translateToString(true)));
  });
}

// Captured from Claude Code under ConPTY on Windows 10: the prompt, the cursor
// put after "❯ ", typing "hello", then five backspaces back to the placeholder.
const PROMPT = '❯ Try "x"\x1b[K\x1b[1;3H';
const TYPED = '\x1b[?2004h\x0f\bh\x1b[Kello';
const DELETED = '\b\x1b[K\b\x1b[K\b\x1b[K\b\x1b[K\bTry "x"\x1b[1;3H';

describe('normalizeConptyOutput', () => {
  it('blanks SO and SI and leaves everything else alone', () => {
    expect(normalizeConptyOutput('a\x0fb\x0ec')).toBe('a b c');
    expect(normalizeConptyOutput('\x1b[31mplain\x1b[m\r\n')).toBe('\x1b[31mplain\x1b[m\r\n');
  });

  it('keeps typed text after the prompt, and deleting it leaves nothing behind', async () => {
    const typed = normalizeConptyOutput(PROMPT + TYPED);
    expect(await render(typed)).toBe('❯ hello');
    expect(await render(normalizeConptyOutput(PROMPT + TYPED + DELETED))).toBe('❯ Try "x"');
  });

  it('without it the same stream ends up a column off (the bug)', async () => {
    expect(await render(PROMPT + TYPED)).toBe('❯hello');
  });
});
