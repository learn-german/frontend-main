// Sao chép nguyên vẹn từ grammar-submit/setAttemptUpdate.ts — logic chấm
// pass/reveal/XP không phụ thuộc loại câu hỏi, dùng chung được cho cả
// grammar_exercises lẫn reading_question_groups. Supabase Edge Functions
// deploy độc lập theo từng thư mục function (không có convention `_shared/`
// trong repo này), nên trùng lặp file nhỏ này thay vì thêm cơ chế share mới.

export interface ExistingSetAttempt {
  bestScore: number;
  attemptCount: number;
  isPassed: boolean;
  revealed: boolean;
}

export interface SetAttemptUpdate {
  score: number;
  bestScore: number;
  attemptCount: number;
  isPassed: boolean;
  revealed: boolean;
  xpEarned: number;
}

/**
 * Quyết định trạng thái lưu sau 1 lần nộp. isPassed tính từ correct*100 >=
 * total*80 (chưa làm tròn) — không dùng score đã làm tròn, tránh sai số
 * BR-02 cảnh báo (77.78% có thể vô tình làm tròn qua ngưỡng 80%).
 *
 * isPassed mở vĩnh viễn, cùng kiểu "chỉ tăng không giảm" như bestScore và
 * revealed: một khi đã đạt ≥80% ở bất kỳ lần nào, giữ true dù lần nộp sau
 * điểm thấp hơn.
 *
 * revealed mở vĩnh viễn: một khi true (đúng hết hoặc đủ 5 lần), giữ true dù
 * các lần nộp sau điểm thấp hơn. isPassed và revealed độc lập nhau.
 *
 * XP chỉ thưởng lần đầu tiên isPassed chuyển từ false sang true.
 */
export function computeSetAttemptUpdate(
  existing: ExistingSetAttempt | null,
  correct: number,
  total: number,
  xpReward: number,
): SetAttemptUpdate {
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passedNow = total > 0 && correct * 100 >= total * 80;
  const isPassed = (existing?.isPassed ?? false) || passedNow;
  const previousBest = existing?.bestScore ?? 0;
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const revealed = (existing?.revealed ?? false) || correct === total || attemptCount >= 5;
  const reachedPassNow = isPassed && !(existing?.isPassed ?? false);

  return {
    score,
    bestScore: Math.max(score, previousBest),
    attemptCount,
    isPassed,
    revealed,
    xpEarned: reachedPassNow ? xpReward : 0,
  };
}
