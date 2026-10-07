export interface ScorableReadingFillBlank {
  accepted_answers?: string[];
  blanks?: { acceptedAnswers?: string[]; accepted_answers?: string[] }[];
  explanation?: string | null;
}

export interface ScorableReadingGroup {
  id: string;
  question_type: string;
  statements: { correct_answer: string; explanation?: string | null }[] | null;
  sub_questions: ({ correct_option_id?: string; explanation?: string | null } & ScorableReadingFillBlank)[] | null;
}

export interface ReadingScoreResult {
  correct: number;
  total: number;
  score: number;
  itemResults: Record<string, boolean>;
}

const CHOICE_ANSWER_MAX = 20;
const FILL_ANSWER_MAX = 200;

function normalizeBlank(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function answerMaxLength(questionType: string): number {
  return questionType === "fill_in_the_blank" ? FILL_ANSWER_MAX : CHOICE_ANSWER_MAX;
}

function resolveFillBlanks(q: ScorableReadingFillBlank): string[][] {
  if (Array.isArray(q.blanks) && q.blanks.length > 0) {
    return q.blanks.map((blank) => {
      const answers = blank?.acceptedAnswers ?? blank?.accepted_answers ?? [];
      return answers
        .filter((answer): answer is string => typeof answer === "string")
        .map((answer) => answer.trim())
        .filter(Boolean);
    });
  }
  const legacy = (q.accepted_answers ?? [])
    .filter((answer): answer is string => typeof answer === "string")
    .map((answer) => answer.trim())
    .filter((answer) => answer.length > 0);
  return legacy.length > 0 ? [legacy] : [];
}

function parseFillUserAnswers(raw: string, blankCount: number): string[] {
  if (blankCount <= 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
      return Array.from({ length: blankCount }, (_, index) => String(parsed[index] ?? ""));
    }
  } catch {
    // legacy plain string for single blank
  }
  if (blankCount === 1) return [raw];
  return Array.from({ length: blankCount }, () => "");
}

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
      projected[key] = value.slice(0, answerMaxLength(group.question_type));
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
    } else if (group.question_type === "fill_in_the_blank") {
      (group.sub_questions ?? []).forEach((q, i) => {
        const key = `${group.id}:${i}`;
        const blanks = resolveFillBlanks(q);
        const userAnswers = parseFillUserAnswers(answers[key] ?? "", blanks.length);
        const blankResults = blanks.map((accepted, blankIndex) =>
          accepted.map(normalizeBlank).includes(normalizeBlank(userAnswers[blankIndex] ?? "")),
        );
        const isCorrect = blanks.length > 0 && blankResults.every(Boolean);
        itemResults[key] = isCorrect;
        total += Math.max(blanks.length, 1);
        correct += blankResults.filter(Boolean).length;
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
    } else if (group.question_type === "fill_in_the_blank") {
      (group.sub_questions ?? []).forEach((q, i) => {
        const blanks = resolveFillBlanks(q);
        if (blanks.length <= 1) {
          result[`${group.id}:${i}`] = blanks[0]?.[0] ?? "";
        } else {
          result[`${group.id}:${i}`] = JSON.stringify(blanks.map((accepted) => accepted[0] ?? ""));
        }
      });
    } else {
      (group.sub_questions ?? []).forEach((q, i) => { result[`${group.id}:${i}`] = q.correct_option_id ?? ""; });
    }
  }
  return result;
}

/** Giải thích theo từng câu, cùng khoá `${group.id}:${index}`. Bỏ câu không có lời giải. */
export function deriveExplanations(groups: ScorableReadingGroup[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of groups) {
    if (group.question_type === "richtig_falsch") {
      (group.statements ?? []).forEach((statement, index) => {
        const text = statement.explanation?.trim() ?? "";
        if (text) result[`${group.id}:${index}`] = text;
      });
    } else {
      (group.sub_questions ?? []).forEach((question, index) => {
        const text = question.explanation?.trim() ?? "";
        if (text) result[`${group.id}:${index}`] = text;
      });
    }
  }
  return result;
}
