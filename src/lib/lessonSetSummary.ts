export interface LessonSetSummary {
  passedCount: number;
  totalCount: number;
  latestScore: number;
  latestSubmittedAt: string;
}

interface AttemptRow {
  set_id: string;
  is_passed: boolean;
  score: number;
  submitted_at: string;
}

/**
 * Gộp attempt thô thành tóm tắt hiển thị ở màn hình học. Chỉ tính set nằm
 * trong nonEmptySetIds (set rỗng đã bị lọc trước đó) — nếu không có attempt
 * hợp lệ nào, trả null để phân biệt "chưa từng nộp" với "đã nộp nhưng 0/0".
 */
export function summarizeAttempts(
  nonEmptySetIds: string[],
  attempts: AttemptRow[],
): LessonSetSummary | null {
  const validSetIds = new Set(nonEmptySetIds);
  const validAttempts = attempts.filter((a) => validSetIds.has(a.set_id));
  if (validAttempts.length === 0) return null;

  const passedCount = validAttempts.filter((a) => a.is_passed).length;
  const latest = validAttempts.reduce((a, b) =>
    new Date(a.submitted_at) > new Date(b.submitted_at) ? a : b,
  );

  return {
    passedCount,
    totalCount: nonEmptySetIds.length,
    latestScore: latest.score,
    latestSubmittedAt: latest.submitted_at,
  };
}
