export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  blanks: { acceptedAnswers: string[] }[] | null;
  options: string[] | null;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, "").trim();
}

function normalizeBlank(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
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
