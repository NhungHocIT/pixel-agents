/**
 * ConPTY output, made to line up with an xterm.
 *
 * ConPTY re-renders conhost's screen buffer as VT. When a program writes SO or
 * SI (0x0E / 0x0F — Claude Code emits SI as part of resetting the character
 * set), conhost on Windows 10 doesn't treat it as a shift: it stores a printed
 * glyph in that cell and advances the cursor, and ConPTY then passes the raw
 * byte through followed by its own cursor moves (typically a backspace). An
 * xterm takes the byte as a zero-width shift, so every later relative move
 * lands one column off: in Claude Code's prompt, typed text sits one cell left
 * and the first character can never be erased.
 *
 * Rendering those bytes as a blank cell matches conhost's model exactly (one
 * column), with nothing visible where conhost would draw a ☼ or ♫.
 */

const SHIFT_OUT_IN = /[\x0e\x0f]/g;

export function normalizeConptyOutput(chunk: string): string {
  return chunk.includes('\x0e') || chunk.includes('\x0f')
    ? chunk.replace(SHIFT_OUT_IN, ' ')
    : chunk;
}
