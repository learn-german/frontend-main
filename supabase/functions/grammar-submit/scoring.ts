export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, "").trim();
}

export function computeGrammarScore(
  exercises: ScorableGrammarExercise[],
  answers: Record<string, string>,
): ScoreResult {
  let correct = 0;
  let total = 0;

  for (const ex of exercises) {
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
  return { correct, total, score };
}
