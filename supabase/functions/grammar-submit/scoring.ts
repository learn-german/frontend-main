export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  blanks: { acceptedAnswers: string[] }[] | null;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
  blankResults: Record<string, boolean[]>;
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, "").trim();
}

function normalizeBlank(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export function computeGrammarScore(
  exercises: ScorableGrammarExercise[],
  answers: Record<string, string>,
): ScoreResult {
  let correct = 0;
  let total = 0;
  const blankResults: Record<string, boolean[]> = {};

  for (const ex of exercises) {
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
      continue;
    }

    if (ex.type === "classification") {
      const items = ex.classification_items ?? [];
      total += items.length;
      const userPairs = (answers[ex.id] ?? "")
        .split("|")
        .map((pair) => pair.split(":").map((s) => s.trim()));
      const userMap = new Map(userPairs.map(([item, group]) => [item, group ?? ""]));
      for (const it of items) {
        if (normalizeWord(userMap.get(it.item) ?? "") === normalizeWord(it.group)) correct++;
      }
      continue;
    }

    total += 1;
    const userAnswer = normalizeWord(answers[ex.id] ?? "");
    if (ex.type === "translation") {
      const accepted = [ex.correct_answer ?? "", ...(ex.acceptable_answers ?? [])]
        .map(normalizeWord)
        .filter((s) => s.length > 0);
      if (accepted.includes(userAnswer)) correct++;
    } else {
      const correctAnswer = normalizeWord(ex.correct_answer ?? "");
      if (userAnswer === correctAnswer) correct++;
    }
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, blankResults };
}
