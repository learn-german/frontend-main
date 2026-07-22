export const GRAMMAR_EXERCISE_HINT_MAX_LENGTH = 1000;

export const normalizeGrammarHint = (value: string): string | null =>
  value.trim() === "" ? null : value;

export const validateGrammarHint = (value: string): string | null =>
  value.length > GRAMMAR_EXERCISE_HINT_MAX_LENGTH
    ? "Gợi ý không được vượt quá 1.000 ký tự."
    : null;
