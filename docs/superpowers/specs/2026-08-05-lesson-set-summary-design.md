# Kết quả làm bài gần nhất ở màn hình học

Ngày: 2026-08-05

Mục cuối trong `requirement.md` phần backlog phiên này ("Hiển thị kết quả
làm bài gần nhất ở màn hình học"), ý tưởng đã duyệt từ đầu phiên brainstorm,
gác lại để làm [Spec A](./2026-08-05-exercise-set-status-badges-design.md)
trước.

## Bối cảnh

`LessonDetailPage.tsx` có 3 tab dẫn vào bài tập (nguphap ở tab "quiz", nghe,
đọc) — mỗi tab hiện chỉ có tiêu đề + mô tả + nút bắt đầu, không cho biết học
viên đã từng làm bài tập này chưa, làm bao nhiêu set, đạt bao nhiêu %.

## Phạm vi

Áp dụng cho cả 3 tab (nguphap/nghe/đọc), chỉ hiện khi học viên **đã từng nộp
bài** ở category đó — chưa từng làm thì giữ nguyên giao diện hiện tại.

## Data flow

Hook mới `useLessonSetSummary(lessonId, category)`
(`src/lib/hooks/useLessonSetSummary.ts`):

```ts
export interface LessonSetSummary {
  passedCount: number;
  totalCount: number;
  latestScore: number | null;
  latestSubmittedAt: string | null;
}

export function useLessonSetSummary(lessonId: string, category: QuizCategory): {
  summary: LessonSetSummary | null; // null lúc loading HOẶC chưa từng nộp bài
  loading: boolean;
}
```

1. `exercise_sets.select("id").eq("lesson_id", lessonId).eq("category", category).eq("status", "published")`.
2. Song song trên các id đó (không chờ nhau, giống pattern `useNonEmptySetIds`/`useExerciseSetAttempts` đã dùng trong Spec A):
   - `grammar_exercises_public.select("set_id").in("set_id", candidateIds)` — lọc set rỗng.
   - `exercise_set_attempts.select("set_id, is_passed, score, submitted_at").in("set_id", candidateIds)`.
3. Hàm thuần `summarizeAttempts(nonEmptySetIds, attempts)` gộp thành
   `LessonSetSummary`: `totalCount` = số set không rỗng; `passedCount` = số
   attempt (trong các set không rỗng) có `is_passed=true`; `latestScore`/
   `latestSubmittedAt` lấy từ attempt có `submitted_at` lớn nhất. Không có
   attempt nào → trả `null` (không phải object rỗng) để phân biệt rõ "chưa
   từng nộp" với "đã nộp nhưng 0/0".

## Hiển thị

`LessonDetailPage.tsx`, chèn vào đầu nội dung 3 tab hiện có (`quiz` dòng
~226, `nghe` dòng ~263, `doc` dòng ~291), chỉ render khi
`summary !== null`:

```
5/8 bài đã đạt · Lần gần nhất: 90% · 15:32 05/08/2026
```

- `text-xs text-slate-400`, nằm dưới tiêu đề, trên nút "Bắt đầu".
- Thời gian dùng `new Date(latestSubmittedAt).toLocaleString("vi-VN")` —
  khớp quy ước đã dùng ở `LessonDetailPage.tsx:419` (tab Viết).

## Cập nhật sau khi nộp bài, không cần reload

Không cần cơ chế realtime/live-update. `App.tsx` đã có
`key={effectivePage + (effectivePage === "lesson-detail" ? selectedLessonId : "")}`
trên phần render trang — điều hướng `quiz` → `lesson-detail` đổi giá trị
key, React remount toàn bộ `LessonDetailPage`, hook fetch lại dữ liệu mới.
Xác nhận bằng cách đọc code, không cần sửa gì ở `App.tsx`.

## Error handling

Lỗi fetch ở bất kỳ bước nào (1, 2, hoặc 3) → coi như chưa có dữ liệu
(`summary: null`), không hiện khối tóm tắt, không chặn nút "Bắt đầu" —
fail-open, không tệ hơn hành vi hiện tại (không có khối tóm tắt nào cả).

## Testing

- `summarizeAttempts` tách hàm thuần, test bằng `node:test`: không có
  attempt nào → `null`; có 1 số set đã pass/chưa pass → đúng
  `passedCount`/`totalCount`; nhiều attempt khác `submitted_at` → chọn đúng
  cái mới nhất cho `latestScore`.
- 3 query trong hook (Supabase thật) verify thủ công trên trình duyệt, theo
  đúng giới hạn effort các hook tương tự trong Spec A.

## Acceptance Criteria

- [ ] Học viên chưa từng nộp bài ở 1 category → tab category đó không đổi
      gì so với hiện tại.
- [ ] Học viên đã nộp ít nhất 1 set → hiện đúng số set đã Pass/tổng số set
      không rỗng, điểm % và thời gian của lần nộp gần nhất (theo
      `submitted_at`, không phải theo set nào được mở gần nhất).
- [ ] Set rỗng (0 câu hỏi) không tính vào `totalCount`.
- [ ] Nộp bài xong, bấm "Trở về bài học" → thấy số liệu mới ngay, không cần
      F5.
- [ ] Áp dụng đủ cả 3 tab: nguphap, nghe, đọc.
- [ ] Lỗi fetch không chặn nút "Bắt đầu bài tập".

## Out of scope

- Lịch sử nhiều lần nộp (chỉ lần gần nhất).
- Biểu đồ/trend tiến độ theo thời gian.
- Cập nhật khối tóm tắt real-time khi đang mở 1 tab khác (chỉ cập nhật khi
  remount qua điều hướng, xem mục "Cập nhật sau khi nộp bài" ở trên).
