export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  blanks: { acceptedAnswers: string[] }[] | null;
  options: string[] | null;
  prompt_text: string | null;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
}

// Generous cap: the longest realistic answer is a fill_in_the_blank JSON array
// of several German words/phrases (e.g. `["...", "...", "..."]`), which comes
// nowhere near this. Anything past it is not a legitimate answer being
// truncated — it's abuse (a learner POSTing megabytes of garbage under their
// own row) being contained.
const MAX_ANSWER_LENGTH = 2000;

/**
 * Projects a caller-supplied answers payload down to exactly the exercises
 * that were actually loaded from the database for this lesson, coercing each
 * value to a string and capping its length. This must run before the answers
 * are used for scoring AND before they are persisted, so the stored snapshot
 * is exactly the set the hydrate path iterates — no unknown exercise ids, no
 * non-string values reaching normalizeWord/JSON.parse, no unbounded payloads
 * landing in the grammar_attempts row.
 */
export function projectAnswers(
  exercises: { id: string }[],
  rawAnswers: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const source = rawAnswers ?? {};
  const projected: Record<string, string> = {};
  for (const ex of exercises) {
    const raw = source[ex.id];
    const value = typeof raw === "string" ? raw : "";
    projected[ex.id] = value.slice(0, MAX_ANSWER_LENGTH);
  }
  return projected;
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, "").trim();
}

function normalizeBlank(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

const BLANK_PATTERN = /\{\{([^}]*)\}\}/g;

/** Trích danh sách biến thể đáp án theo thứ tự từ prompt_text, ví dụ
 * "Ich {{bin|Bin}} Student." -> [["bin", "Bin"]]. */
function extractBlanks(promptText: string): string[][] {
  const matches = [...promptText.matchAll(BLANK_PATTERN)];
  return matches.map((m) => m[1].split("|").map((v) => v.trim()));
}

function normalizeMatching(s: string): string {
  return s
    .split("|")
    .map((p) => p.trim())
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function isChoiceCorrect(ex: ScorableGrammarExercise, rawAnswer: string): boolean {
  const options = Array.isArray(ex.options) ? ex.options : [];
  const answer = String(rawAnswer ?? "").trim();
  const expected = (ex.correct_answer ?? "").trim();
  if (options.length === 0) return false;
  if (!/^\d+$/.test(answer) || !/^\d+$/.test(expected)) return false;
  const answerIndex = Number(answer);
  const expectedIndex = Number(expected);
  if (answerIndex >= options.length || expectedIndex >= options.length) return false;
  return answerIndex === expectedIndex;
}

export function computeGrammarScore(
  exercises: ScorableGrammarExercise[],
  answers: Record<string, string>,
): ScoreResult {
  let correct = 0;
  let total = 0;
  const blankResults: Record<string, boolean[]> = {};
  const choiceResults: Record<string, boolean> = {};
  const exerciseResults: Record<string, boolean> = {};

  for (const ex of exercises) {
    if (ex.type === "multiple_choice") {
      const isCorrect = isChoiceCorrect(ex, answers[ex.id] ?? "");
      choiceResults[ex.id] = isCorrect;
      exerciseResults[ex.id] = isCorrect;
      total += 1;
      if (isCorrect) correct++;
      continue;
    }

    if (ex.type === "fill_in_the_blank") {
      const blanks = Array.isArray(ex.blanks) ? ex.blanks : [];
      let parsedAnswers: unknown = [];
      try {
        parsedAnswers = JSON.parse(answers[ex.id] ?? "");
      } catch {
        parsedAnswers = [];
      }
      const userAnswers = Array.isArray(parsedAnswers) ? parsedAnswers : [];
      const results = blanks.map((blank, index) => {
        if (
          !blank
          || typeof blank !== "object"
          || !Array.isArray((blank as { acceptedAnswers?: unknown }).acceptedAnswers)
          || typeof userAnswers[index] !== "string"
        ) {
          return false;
        }
        const accepted = (blank as { acceptedAnswers: unknown[] }).acceptedAnswers
          .filter((answer): answer is string => typeof answer === "string")
          .map(normalizeBlank)
          .filter(Boolean);
        return accepted.includes(normalizeBlank(userAnswers[index]));
      });
      blankResults[ex.id] = results;
      total += results.length;
      correct += results.filter(Boolean).length;
      exerciseResults[ex.id] = results.length > 0 && results.every(Boolean);
      continue;
    }

    if (ex.type === "text_fill_blank") {
      const blanks = extractBlanks(ex.prompt_text ?? "");
      const userParts = (answers[ex.id] ?? "").split("|").map((s) => s.trim().toLowerCase());
      const results = blanks.map((variants, index) => {
        const userPart = userParts[index] ?? "";
        return variants.some((v) => v.toLowerCase() === userPart);
      });
      blankResults[ex.id] = results;
      total += results.length;
      correct += results.filter(Boolean).length;
      exerciseResults[ex.id] = results.length > 0 && results.every(Boolean);
      continue;
    }

    if (ex.type === "matching") {
      total += 1;
      const isCorrect = normalizeMatching(answers[ex.id] ?? "") === normalizeMatching(ex.correct_answer ?? "");
      exerciseResults[ex.id] = isCorrect;
      if (isCorrect) correct++;
      continue;
    }

    if (ex.type === "classification") {
      const items = ex.classification_items ?? [];
      total += items.length;
      const userPairs = (answers[ex.id] ?? "")
        .split("|")
        .map((pair) => pair.split(":").map((s) => s.trim()));
      const userMap = new Map(userPairs.map(([item, group]) => [item, group ?? ""]));
      let itemsCorrect = 0;
      for (const it of items) {
        if (normalizeWord(userMap.get(it.item) ?? "") === normalizeWord(it.group)) itemsCorrect++;
      }
      correct += itemsCorrect;
      exerciseResults[ex.id] = items.length > 0 && itemsCorrect === items.length;
      continue;
    }

    total += 1;
    const userAnswer = normalizeWord(answers[ex.id] ?? "");
    let isCorrect: boolean;
    if (ex.type === "translation") {
      const accepted = [ex.correct_answer ?? "", ...(ex.acceptable_answers ?? [])]
        .map(normalizeWord)
        .filter((s) => s.length > 0);
      isCorrect = accepted.includes(userAnswer);
    } else {
      isCorrect = userAnswer === normalizeWord(ex.correct_answer ?? "");
    }
    exerciseResults[ex.id] = isCorrect;
    if (isCorrect) correct++;
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, blankResults, choiceResults, exerciseResults };
}
