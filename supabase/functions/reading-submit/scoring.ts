export interface ScorableReadingGroup {
  id: string;
  question_type: string;
  statements: { correct_answer: string }[] | null;
  sub_questions: { correct_option_id: string }[] | null;
}

export interface ReadingScoreResult {
  correct: number;
  total: number;
  score: number;
  itemResults: Record<string, boolean>;
}

// Longest legitimate answer is "richtig"/"falsch" or a small option index —
// generous cap, anything past it is abuse rather than a real answer.
const MAX_ANSWER_LENGTH = 20;

/** Đơn vị chấm điểm của 1 nhóm câu hỏi: statement (richtig_falsch) hoặc
 * sub_question (multiple_choice), khoá `${group.id}:${index}`. */
export function itemKeys(group: ScorableReadingGroup): string[] {
  const count = group.question_type === "richtig_falsch"
    ? (group.statements ?? []).length
    : (group.sub_questions ?? []).length;
  return Array.from({ length: count }, (_, i) => `${group.id}:${i}`);
}

/**
 * Chiếu answers do client gửi xuống đúng tập key hợp lệ (suy từ các nhóm câu
 * hỏi đã load từ DB), ép mỗi giá trị thành string và giới hạn độ dài — chạy
 * trước cả lúc chấm điểm lẫn lúc lưu, để snapshot lưu lại khớp đúng tập key
 * phía hydrate sẽ đọc lại, không có key lạ, không giá trị khổng lồ.
 */
export function projectAnswers(
  groups: ScorableReadingGroup[],
  rawAnswers: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const source = rawAnswers ?? {};
  const projected: Record<string, string> = {};
  for (const group of groups) {
    for (const key of itemKeys(group)) {
      const raw = source[key];
      const value = typeof raw === "string" ? raw : "";
      projected[key] = value.slice(0, MAX_ANSWER_LENGTH);
    }
  }
  return projected;
}

export function computeReadingScore(
  groups: ScorableReadingGroup[],
  answers: Record<string, string>,
): ReadingScoreResult {
  const itemResults: Record<string, boolean> = {};
  let correct = 0;
  let total = 0;
  for (const group of groups) {
    if (group.question_type === "richtig_falsch") {
      (group.statements ?? []).forEach((s, i) => {
        const key = `${group.id}:${i}`;
        const isCorrect = answers[key] === s.correct_answer;
        itemResults[key] = isCorrect;
        total++;
        if (isCorrect) correct++;
      });
    } else {
      (group.sub_questions ?? []).forEach((q, i) => {
        const key = `${group.id}:${i}`;
        const isCorrect = answers[key] === q.correct_option_id;
        itemResults[key] = isCorrect;
        total++;
        if (isCorrect) correct++;
      });
    }
  }
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, itemResults };
}

/** Đáp án đúng theo cùng khoá `${group.id}:${index}` — chỉ trả ra khi đã mở
 * lời giải (revealed), giống cách grammar-submit trả correct_answer. */
export function deriveCorrectAnswers(groups: ScorableReadingGroup[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of groups) {
    if (group.question_type === "richtig_falsch") {
      (group.statements ?? []).forEach((s, i) => { result[`${group.id}:${i}`] = s.correct_answer; });
    } else {
      (group.sub_questions ?? []).forEach((q, i) => { result[`${group.id}:${i}`] = q.correct_option_id; });
    }
  }
  return result;
}

/** Giải thích theo từng nhóm câu hỏi (không phải từng item) — khớp cấp lưu
 * `explanation` trong schema (1 explanation/nhóm, không phải 1/statement). */
export function deriveExplanations(groups: { id: string; explanation: string | null }[]): Record<string, string> {
  return Object.fromEntries(groups.map((g) => [g.id, g.explanation ?? ""]));
}
