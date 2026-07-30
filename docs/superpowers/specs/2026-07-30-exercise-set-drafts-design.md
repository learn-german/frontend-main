# Phase 3 — Lưu đáp án đang làm dở

Ngày: 2026-07-30

Yêu cầu #3 trong `requirement.md`. Phase 3 trong
[roadmap nền tảng bài tập](./2026-07-30-exercise-platform-roadmap.md). Đứng
trên nền `exercise_sets`/`exercise_set_attempts` từ Phase 1-2
([PR #76](https://github.com/learn-german/frontend-main/pull/76),
[PR #77](https://github.com/learn-german/frontend-main/pull/77), chưa merge
nhưng migration đã áp production, đã test trên trình duyệt xác nhận hoạt
động đúng).

## Bối cảnh

```
Situation:
- User vào phần bài tập ngữ pháp/nghe/đọc
- User điền đáp án.
- User có thể lưu lại đáp án đang làm, chưa ấn submit.
- User navigate sang trang khác/ logout ra.
- User quay lại và làm tiếp.
```

## Phạm vi

**Chỉ Ngữ pháp (`GrammarExercisePage`) trong phase này.** Nghe/Đọc
(`QuizPage`) hiện dùng hẳn mô hình dữ liệu khác (`quiz_questions`
/`useQuizQuestions`), chưa chuyển sang `exercise_sets` — đó là việc của
Phase 4. Schema/RLS ở phase này category-agnostic (không có gì ràng buộc
riêng Ngữ pháp), nên khi Phase 4 port Nghe/Đọc sang dùng chung
`exercise_sets`, draft tự động hoạt động được mà không cần sửa lại.

## Data model

```sql
CREATE TABLE exercise_set_drafts (
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  set_id     UUID        NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  answers    JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_id)
);

ALTER TABLE exercise_set_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_set_drafts: own read/write"
  ON exercise_set_drafts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Draft không chứa `correct_answer`/`explanation`/điểm số — chỉ là chuỗi đáp
án học viên đang gõ. An toàn để học viên tự đọc/ghi trực tiếp qua PostgREST,
không cần qua Edge Function (khác `exercise_set_attempts`, vốn phải qua
`grammar-submit` vì liên quan chấm điểm và đáp án đúng).

`FOR ALL` ở đây **an toàn**, khác với lỗ hổng đã vá ở `grammar_attempts` —
vì điều kiện là `user_id = auth.uid()` (không phải kiểm tra role admin
không kèm điều kiện owner), nên không có đường nào một user đọc/ghi được
draft của user khác.

## Quy tắc ưu tiên hiển thị

Yêu cầu gốc: "đang có kết quả chưa bấm Làm lại → hiện snapshot đã nộp; đang
ở trạng thái làm bài → hiện draft." Cụ thể hoá tín hiệu quyết định:

**Không dùng cờ `retrying`** (state cục bộ trong `GrammarExercisePage`, mất
khi F5/rời trang quay lại) để quyết định qua các lần mount khác nhau. Thay
bằng: **sự tồn tại của row trong `exercise_set_drafts`**.

- Có draft → hydrate form từ draft, hiển thị đang làm bài, **không** hiện
  card kết quả dù `exercise_set_attempts` vẫn còn attempt cũ.
- Không có draft, có attempt → hiện card kết quả đã nộp (đúng hành vi
  Phase 2, không đổi).
- Không có gì → form trắng.

`retrying` giữ nguyên vai trò hiện có trong Phase 2 (chặn effect
hydrate-từ-attempt tự chạy lại ngay trong cùng phiên render sau khi bấm
"Làm lại") — đây là cơ chế trong-phiên, độc lập với cơ chế xuyên-phiên ở
trên. Kịch bản cụ thể chứng minh cần cả hai: học viên nộp bài, xem kết quả,
bấm "Làm lại", gõ vài câu rồi rời trang không nộp — quay lại sau đó, `attempt`
cũ vẫn còn trong DB nhưng phải hiện draft đang gõ dở, không phải kết quả cũ.

## Autosave + nút Lưu tường minh

- 1 `useEffect` debounce ~1000ms sau lần thay đổi đáp án gần nhất, phụ thuộc
  `collectAllAnswers()` (hàm gộp đáp án đã có sẵn trong
  `GrammarExercisePage.tsx`).
- **Không autosave khi đang hiện card kết quả** (`result !== null`) — draft
  chỉ có ý nghĩa lúc đang làm bài, không phải lúc xem lại kết quả đã nộp.
- Nút "Lưu" tường minh cạnh nút "Nộp bài" — gọi thẳng hàm lưu, hủy timer
  debounce đang chờ để tránh ghi trùng ngay sau đó.
- Ghi bằng `upsert`, `onConflict: "user_id,set_id"`.
- Không lưu nếu mọi đáp án đều rỗng (tránh ghi rác ngay khi vừa mở trang
  chưa gõ gì).

## Xóa draft

Ngay sau khi `handleSubmit` nhận response thành công từ `grammar-submit`
(nhánh code hiện có, sau `if (error || !data) return;`) — draft không còn ý
nghĩa một khi đã có snapshot đã nộp chính thức.

## Testing

- Logic ưu tiên hiển thị (có draft/có attempt/không có gì → nhánh nào) tách
  thành hàm thuần, test bằng `node:test` không cần import `supabase`.
- Logic "không lưu nếu mọi đáp án rỗng" tách thành hàm thuần, test riêng.
- Còn lại (debounce, gọi Supabase thật) là hành vi hook/effect — không có
  test tự động trong phase này (giống Phase 2, giới hạn effort của phiên
  làm việc, verify bằng test thủ công trên trình duyệt).

## Acceptance Criteria

- [ ] Học viên gõ đáp án, không bấm Nộp bài, rời trang — quay lại thấy đúng
      đáp án đã gõ.
- [ ] Autosave chạy nền, không cần bấm nút mới lưu được.
- [ ] Có nút "Lưu" tường minh, hoạt động ngay cả khi chưa đủ 1 giây debounce.
- [ ] Nộp bài thành công thì draft bị xóa — lần vào lại không còn thấy draft
      cũ đè lên kết quả mới.
- [ ] Draft của user A không đọc/ghi được bởi user B (RLS).
- [ ] Sau khi có draft, mount lại trang hiện đúng draft, không hiện kết quả
      cũ dù còn attempt trong DB.

## Out of scope

- Nghe/Đọc — tự động có sau Phase 4, không làm UI riêng ở phase này.
- Đồng bộ draft real-time giữa nhiều tab/thiết bị đang mở cùng lúc.
- Giới hạn số lượng draft lưu trữ hay dọn dẹp draft cũ tự động.
