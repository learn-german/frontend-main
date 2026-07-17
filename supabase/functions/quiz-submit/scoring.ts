export interface ScorableQuestion {
  id: string;
  type: string;
  question_text: string;
  correct_answer: string;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
}

const BLANK_PATTERN = /\{\{([^}]*)\}\}/g;

/**
 * Extracts ordered blank-answer variant lists from raw question_text, e.g.
 * "Ich {{bin|Bin}} Student." -> [["bin", "Bin"]]. Returns null when the
 * text has no {{...}} markers — signals "legacy single-answer question,
 * use correct_answer instead."
 */
export function extractBlanks(questionText: string): string[][] | null {
  const matches = [...questionText.matchAll(BLANK_PATTERN)];
  if (matches.length === 0) return null;
  return matches.map((m) => m[1].split("|").map((v) => v.trim()));
}

function normalizeMatching(s: string): string {
  return s
    .split("|")
    .map((p) => p.trim())
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

/**
 * Multi-blank fill-blank questions (question_text contains {{...}})
 * contribute one scoring unit PER BLANK, matched positionally against the
 * learner's answer split by "|". Every other question type — including
 * legacy single-answer fill-blank — contributes exactly one unit, matched
 * as before.
 */
export function computeQuizScore(
  questions: ScorableQuestion[],
  answers: Record<string, string>,
): ScoreResult {
  let correct = 0;
  let total = 0;

  for (const q of questions) {
    const blanks = q.type === "fill-blank" ? extractBlanks(q.question_text) : null;

    if (blanks && blanks.length > 0) {
      const userParts = (answers[q.id] ?? "").split("|").map((s) => s.trim().toLowerCase());
      total += blanks.length;
      blanks.forEach((variants, i) => {
        const userPart = userParts[i] ?? "";
        if (variants.some((v) => v.toLowerCase() === userPart)) correct++;
      });
      continue;
    }

    const userAnswer = (answers[q.id] ?? "").trim();
    const correctAnswer = (q.correct_answer ?? "").trim();
    total += 1;

    if (q.type === "matching") {
      if (normalizeMatching(userAnswer) === normalizeMatching(correctAnswer)) correct++;
    } else {
      if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) correct++;
    }
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score };
}
