export function hasAnyAnswer(answers: Record<string, string>): boolean {
  return Object.values(answers).some((value) => value.trim() !== "");
}

export type HydrateSource = "draft" | "attempt" | "blank";

// Draft luôn thắng nếu tồn tại — học viên đang làm dở quan trọng hơn kết
// quả đã nộp trước đó, kể cả khi cả hai cùng tồn tại (nộp bài, bấm Làm lại,
// gõ vài câu rồi rời trang không nộp — quay lại phải thấy draft, không
// phải kết quả cũ).
export function pickHydrateSource(hasDraft: boolean, hasAttempt: boolean): HydrateSource {
  if (hasDraft) return "draft";
  if (hasAttempt) return "attempt";
  return "blank";
}
