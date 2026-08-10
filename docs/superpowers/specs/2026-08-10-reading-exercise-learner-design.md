# Phase 6b — Học viên làm bài đọc + chấm điểm

## Bối cảnh

Tiếp nối [2026-08-10-reading-exercise-admin-design.md](2026-08-10-reading-exercise-admin-design.md) (Phase 6a, đã xong): Admin đã tạo được văn bản (`reading_passages`) + nhóm câu hỏi (`reading_question_groups`, admin-only RLS). Phase 6b mở đường cho học viên **đọc + làm bài + được chấm điểm**, thay `QuizSetListPage` (đường cũ dựa `grammar_exercises`, nay rỗng cho category `doc`) bằng một trang riêng cho Đọc.

## Quyết định kiến trúc

**Không sửa `grammar-submit`.** Tạo Edge Function riêng `reading-submit` — cấu trúc dữ liệu (JSONB `statements`/`sub_questions` lồng nhau) khác hẳn shape phẳng của `grammar_exercises`, sửa chung sẽ làm phức tạp cả 2 đường. Tái dùng **nguyên logic** (không phải nguyên file — Supabase Edge Function không có cơ chế share code giữa các function trong repo này) của `computeSetAttemptUpdate` (pass 80%, reveal khi đúng hết hoặc đủ 5 lần, `attempt_count`/`bestScore` chỉ tăng không giảm, idempotency qua `submission_id`) — copy nguyên file `setAttemptUpdate.ts`, không viết lại rule.

**Đơn vị chấm điểm = 1 statement hoặc 1 sub_question**, khoá bằng `${group.id}:${index}`. Tổng điểm 1 set = tổng số statement/sub_question của mọi nhóm câu hỏi trong set.

**Tái dùng nguyên bảng `exercise_set_attempts`/`exercise_set_drafts`** — không thêm cột. Cột `exercise_results: Record<string, boolean>` (đã có, generic "examId -> đúng/sai") dùng luôn cho reading (`itemKey -> đúng/sai`); `blank_results`/`choice_results`/`classification_results` để rỗng `{}` (không dùng, vô hại).

**View mới `reading_question_groups_public`** — bắt buộc, vì `reading_question_groups` hiện admin-only cả đọc lẫn ghi (chứa đáp án). View strip `correct_answer` khỏi từng phần tử `statements[]` và `correct_option_id` khỏi từng phần tử `sub_questions[]` bằng toán tử JSONB `-` (xoá key), join `exercise_sets`/`lessons` lọc `published` — đúng khuôn `grammar_exercises_public` đang có. Grant `authenticated`.

## Việc phải sửa ở phần "đã có câu hỏi chưa" (hasDocQuestions)

`useModules.ts` và `AdminUsersSection.tsx` đang suy ra cờ `hasDocQuestions` **chỉ** từ `grammar_exercises_public` (category='doc') — nay luôn rỗng. Cả 2 nơi cần thêm 1 query vào `reading_question_groups_public` (chỉ cần cột `lesson_id`) và gộp vào cùng `quizCategoriesByLesson` map đang có — không đổi cấu trúc map, chỉ thêm nguồn dữ liệu thứ 2. Thiếu bước này thì tab "Đọc" và nút "Bắt đầu bài tập đọc" biến mất vĩnh viễn dù đã có bài.

## Data flow học viên

```
ReadingSetListPage (mới, thay QuizSetListPage cho category="doc")
 └─ useNonEmptyReadingSetIds  → lọc set rỗng (query reading_question_groups_public)
 └─ useExerciseSetAttempts / useExerciseSetDrafts / computeSetStatus  → TÁI DÙNG NGUYÊN (đã category-agnostic)
 └─ ReadingSetBody (mới)
      └─ useReadingQuestionGroups(setId)  → fetch reading_question_groups_public + reading_passages liên quan
      └─ render: mỗi nhóm câu hỏi → passage (MarkdownBlock) + statements (Richtig/Falsch) hoặc sub_questions (option A/B/C)
      └─ useExerciseSetDraft / useExerciseSetAttempt  → TÁI DÙNG NGUYÊN
      └─ submit → invoke("reading-submit", {set_id, submission_id, answers})
```

`answers: Record<string,string>` — key `${groupId}:${index}`, value `"richtig"|"falsch"` hoặc index option dạng chuỗi (y hệt cách `multiple_choice` hiện có lưu `correct_answer`).

## Testing

- `supabase/functions/reading-submit/scoring.test.ts` (`node:test`, theo đúng style `grammar-submit/scoring.test.ts`): `computeReadingScore`, `deriveCorrectAnswers`, `projectAnswers`.
- `src/lib/readingAnswerCodec.test.ts`: encode/decode key, round-trip.
- `npm run lint` + full suite sau mỗi bước.
- Test thủ công (browser, cần user tự làm — sandbox không đăng nhập được): làm 1 bài richtig_falsch + 1 bài multiple_choice, nộp bài, xác nhận điểm/pass/reveal đúng luật 80%, XP cộng đúng 1 lần, làm lại không tăng attempt khi trùng `submission_id`, tab Đọc hiện đúng khi đã có câu hỏi.

## Không đổi

- Không sửa `grammar-submit`, `grammar_exercises`, `exercise_set_attempts`/`exercise_set_drafts` schema.
- Không đổi `QuizSetListPage.tsx` (vẫn phục vụ category `nghe`).
- Không xử lý Phase 5a-style gói cước/kế hoạch — ngoài phạm vi.

## Rủi ro

- 2 nơi tính `hasDocQuestions` (`useModules.ts`, `AdminUsersSection.tsx`) đã trùng lặp sẵn từ trước (không có helper chung) — sửa đúng cả 2 nơi, thiếu 1 nơi thì tab Đọc/dashboard admin lệch nhau.
- View JSONB-strip cần đúng cú pháp `jsonb_agg(elem - 'correct_answer')` — sai sẽ rò `correct_answer`/`correct_option_id` ra client qua PostgREST, vi phạm nguyên tắc bảo mật cốt lõi của dự án. Kiểm tra kỹ bằng cách select thử qua anon/authenticated trước khi coi là xong.
