export type WordBankMode = "single_use" | "multiple_use";

export interface WordBank {
  words: string[];
  mode: WordBankMode;
}

export interface BlankDefinition {
  acceptedAnswers: string[];
}

export interface BlankFocus {
  exerciseId: string;
  blankIndex: number;
}

export type BlankAnswersByExercise = Record<string, string[]>;
export type BlankAssignments = Record<string, number>;

const blankKey = ({ exerciseId, blankIndex }: BlankFocus): string => `${exerciseId}:${blankIndex}`;

export const countBlankMarkers = (promptText: string): number => promptText.split("___").length - 1;

export function syncBlankDefinitions(promptText: string, current: BlankDefinition[]): BlankDefinition[] {
  return Array.from(
    { length: countBlankMarkers(promptText) },
    (_, index) => current[index] ?? { acceptedAnswers: [] },
  );
}

export function normalizeBlankDefinitions(blanks: BlankDefinition[]): BlankDefinition[] | null {
  const normalized = blanks.map((blank) => ({
    acceptedAnswers: blank.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean),
  }));
  return normalized.length > 0 && normalized.every((blank) => blank.acceptedAnswers.length > 0)
    ? normalized
    : null;
}

export function normalizeWordBank(
  enabled: boolean,
  words: string[],
  mode: WordBankMode,
): WordBank | null {
  if (!enabled) return null;
  const normalizedWords = words.map((word) => word.trim()).filter(Boolean);
  return normalizedWords.length > 0 ? { words: normalizedWords, mode } : null;
}

export function findBlankTarget(
  exerciseIds: readonly string[],
  answers: BlankAnswersByExercise,
  focused: BlankFocus | null,
): BlankFocus | null {
  if (focused && answers[focused.exerciseId]?.[focused.blankIndex] !== undefined) return focused;
  for (const exerciseId of exerciseIds) {
    const blankIndex = (answers[exerciseId] ?? []).findIndex((answer) => !answer.trim());
    if (blankIndex >= 0) return { exerciseId, blankIndex };
  }
  return null;
}

export function getUsedWordIndexes(assignments: BlankAssignments): Set<number> {
  return new Set(Object.values(assignments));
}

export function applyChipToBlank(
  answers: BlankAnswersByExercise,
  assignments: BlankAssignments,
  target: BlankFocus,
  wordIndex: number,
  word: string,
  mode: WordBankMode,
): { answers: BlankAnswersByExercise; assignments: BlankAssignments } {
  const key = blankKey(target);
  if (
    mode === "single_use"
    && Object.entries(assignments).some(([assignedKey, assignedIndex]) => assignedKey !== key && assignedIndex === wordIndex)
  ) {
    return { answers, assignments };
  }
  const current = answers[target.exerciseId] ?? [];
  if (current[target.blankIndex] === undefined) return { answers, assignments };
  return {
    answers: {
      ...answers,
      [target.exerciseId]: current.map((answer, index) => index === target.blankIndex ? word : answer),
    },
    assignments: { ...assignments, [key]: wordIndex },
  };
}

export function applyTypedBlankAnswer(
  answers: BlankAnswersByExercise,
  assignments: BlankAssignments,
  target: BlankFocus,
  value: string,
): { answers: BlankAnswersByExercise; assignments: BlankAssignments } {
  const current = answers[target.exerciseId] ?? [];
  if (current[target.blankIndex] === undefined) return { answers, assignments };
  const nextAssignments = { ...assignments };
  delete nextAssignments[blankKey(target)];
  return {
    answers: {
      ...answers,
      [target.exerciseId]: current.map((answer, index) => index === target.blankIndex ? value : answer),
    },
    assignments: nextAssignments,
  };
}
