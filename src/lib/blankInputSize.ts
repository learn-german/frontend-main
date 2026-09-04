export const BLANK_INPUT_MIN_CHARS = 6;
export const BLANK_INPUT_MAX_CHARS = 40;

/** Character-based width for fill-in-the-blank inputs (for CSS `ch` units). */
export function blankInputCharWidth(value: string): number {
  const len = value.length;
  const padded = (len === 0 ? 1 : len) + 1;
  return Math.min(Math.max(padded, BLANK_INPUT_MIN_CHARS), BLANK_INPUT_MAX_CHARS);
}
