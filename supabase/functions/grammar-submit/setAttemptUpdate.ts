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
 * revealed mở vĩnh viễn: một khi true (đúng hết hoặc đủ 5 lần), giữ true dù
 * các lần nộp sau điểm thấp hơn. isPassed và revealed độc lập nhau — Pass ở
 * 80-99% không tự mở lời giải, đúng theo spec gốc (requirement.md, bước 9-10
 * và bảng Test cases chính).
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
  const isPassed = total > 0 && correct * 100 >= total * 80;
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
