/**
 * Trạng thái hiển thị cho 1 exercise set trong danh sách bài tập của học
 * viên. Draft thắng attempt cũ khi cả hai cùng tồn tại — nhất quán với
 * pickHydrateSource() trong exerciseSetDraftLogic.ts (học viên đang sửa
 * lại bài quan trọng hơn kết quả đã nộp trước đó).
 */
export type SetStatus = "not_started" | "in_progress" | "failed" | "passed";

export function computeSetStatus(
  attempt: { isPassed: boolean } | undefined,
  hasDraft: boolean,
): SetStatus {
  if (attempt?.isPassed) return "passed";
  if (hasDraft) return "in_progress";
  if (attempt) return "failed";
  return "not_started";
}

export const SET_STATUS_LABEL: Record<SetStatus, string> = {
  passed: "Đã đạt",
  in_progress: "Đang làm",
  failed: "Chưa đạt",
  not_started: "Chưa làm",
};

export const SET_STATUS_BADGE_CLASS: Record<SetStatus, string> = {
  passed: "bg-green-50 text-green-700",
  in_progress: "bg-blue-50 text-blue-700",
  failed: "bg-orange-50 text-orange-700",
  not_started: "bg-slate-100 text-slate-500",
};
