# Phase 4 (data model + submit logic) — gộp Nghe/Đọc vào grammar_exercises — Spec

## Bối cảnh

Quyết định lại hướng Phase 4 (thay cho 4a đã làm trước đó — bảng
`quiz_questions` riêng với `set_id` — hướng đó bị huỷ): **không xây module
song song cho Nghe/Đọc, mà gộp thẳng vào bảng/Edge Function/logic đã có
cho Ngữ pháp** (`grammar_exercises`, `grammar-submit`). UI (cả học viên lẫn
admin) vẫn là trang riêng cho Nghe/Đọc vì loại câu hỏi khác hẳn về hiển thị
(audio player, đoạn văn, ghép cặp) — nhưng đọc/ghi chung 1 bảng, 1 Edge
Function.

Xoá hẳn: bảng `quiz_questions`, view `quiz_questions_public`, Edge Function
`quiz-submit`, `src/pages/QuizPage.tsx`, `src/lib/hooks/useQuizQuestions.ts`,
`src/pages/admin/AdminQuizSection.tsx`.

Spec này chỉ phủ **data model + submit logic** (phần Edge Function/DB) —
UI học viên và UI admin cho Nghe/Đọc là 2 spec riêng sau, viết khi tới lượt.

## Loại câu hỏi mới trong `grammar_exercises`

| Type mới | Tái dùng cột nào | Ghi chú |
|---|---|---|
| `multiple_choice` (đã có) | `options`, `correct_answer` (index dạng chuỗi) | Tái dùng nguyên — trắc nghiệm Nghe/Đọc dùng lại y hệt cơ chế đã có. Không cần type mới. |
| `text_fill_blank` (mới) | `prompt_text` chứa pattern `{{đáp_án|biến_thể}}` | Khác `fill_in_the_blank` hiện tại (word bank kéo-thả) — đây là gõ tự do, nhiều biến thể chấp nhận, port nguyên `extractBlanks`/scoring từ `quiz-submit/scoring.ts` cũ. |
| `matching` (mới) | `matching_pairs` (cột mới, JSONB `{de, vi}[]`) + `correct_answer` (chuỗi `"de1:vi1\|de2:vi2"` để chấm) | Giữ nguyên format cũ từ `quiz_questions`/`AdminQuizSection` — `matching_pairs` để hiển thị UI ghép, `correct_answer` để chấm (port `normalizeMatching`). |

Mọi type (kể cả các type Ngữ pháp cũ) có thể gắn thêm `audio_clip_id`
và/hoặc `reading_passage_id` — không giới hạn theo category, đơn giản hoá
schema (không cần CHECK ràng buộc audio chỉ cho nghe/reading chỉ cho đọc,
admin UI tự giới hạn theo category khi tạo).

## Migration

```sql
-- Xoá hẳn nhánh quiz_questions — không còn dùng, dữ liệu đã trống từ 4a.
DROP VIEW IF EXISTS quiz_questions_public;
DROP TABLE IF EXISTS quiz_questions;

ALTER TABLE grammar_exercises
  ADD COLUMN audio_clip_id UUID REFERENCES listening_clips(id) ON DELETE SET NULL,
  ADD COLUMN reading_passage_id UUID REFERENCES reading_passages(id) ON DELETE SET NULL,
  ADD COLUMN matching_pairs JSONB,
  DROP CONSTRAINT grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder', 'error_correction', 'translation', 'sentence_transformation',
    'guided_sentence_writing', 'classification', 'fill_in_the_blank', 'multiple_choice',
    'text_fill_blank', 'matching'
  )),
  ADD CONSTRAINT grammar_exercises_matching_pairs_shape
    CHECK (
      matching_pairs IS NULL
      OR (jsonb_typeof(matching_pairs) = 'array' AND jsonb_array_length(matching_pairs) >= 1)
    );

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.set_id,
    g.type,
    g.group_id,
    g.hint,
    -- Che biến thể đáp án nhúng trong prompt_text của text_fill_blank
    -- ({{đáp_án|biến_thể}} -> {{blank}}) — vô hại với type khác vì chúng
    -- không dùng cú pháp {{...}}, giống cách quiz_questions_public cũ đã
    -- che question_text.
    regexp_replace(g.prompt_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.word_bank,
    g.options,
    g.matching_pairs,
    g.audio_clip_id,
    g.reading_passage_id,
    g.order_index,
    es.category
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
```

`explanation` tiếp tục **không** có trong view (giữ nguyên rule hiện tại —
chỉ trả về qua response của `grammar-submit` khi `revealed=true`, không
bao giờ qua PostgREST). `matching_pairs`/`correct_answer` của type
`matching` — `matching_pairs` an toàn hiển thị (không phải đáp án đúng, chỉ
là danh sách cặp để học viên ghép), `correct_answer` (chuỗi chấm điểm)
**không** được thêm vào view, giống `correct_answer` của mọi type khác.

## Submit logic — `grammar-submit/scoring.ts`

Thêm 2 nhánh vào `computeGrammarScore`, port trực tiếp từ
`quiz-submit/scoring.ts` (xoá file đó sau khi port xong):

- **`text_fill_blank`**: port `extractBlanks()` (regex `\{\{([^}]*)\}\}`,
  tách biến thể bằng `|`) áp lên `ex.prompt_text` (không có
  `answer_text` riêng như quiz cũ — `grammar_exercises` không có cột này,
  dùng thẳng `prompt_text`). Đáp án học viên tách bằng `|` theo vị trí,
  so khớp case-insensitive từng biến thể — y hệt logic cũ. Ghi vào
  `blankResults[ex.id]` (tái dùng đúng field đã có, cùng shape với
  `fill_in_the_blank`), cộng dồn `total`/`correct` theo số blank.
- **`matching`**: port `normalizeMatching()` (tách `|`, trim, sort, join
  lại) so sánh `answers[ex.id]` với `ex.correct_answer`. 1 exercise = 1 đơn
  vị điểm (giống `classification`/`translation`), ghi `exerciseResults[ex.id]`.

`ScorableGrammarExercise` interface thêm `matching_pairs` **không cần** (chỉ
`correct_answer` được dùng để chấm `matching`, `matching_pairs` chỉ phục vụ
hiển thị UI, không cần gửi lên Edge Function).

`grammar-submit/index.ts` — câu SELECT từ bảng gốc thêm `matching_pairs`
**không cần** (lý do trên); phần rollup `lesson_progress`
(`.eq("category", "nguphap")` hard-code ở 3 chỗ) đổi thành dùng
`set.category` (biến đã có sẵn từ query `exercise_sets`, chỉ đang bị bỏ
qua) — để Nghe/Đọc rollup đúng theo category của chính nó thay vì luôn
ghi cứng `"nguphap"`.

## Xoá module cũ

- `supabase/functions/quiz-submit/` (toàn bộ thư mục, kể cả
  `scoring.ts`/`scoring.test.ts` — logic đã port sang `grammar-submit`).
- `src/pages/QuizPage.tsx`, `src/lib/hooks/useQuizQuestions.ts`,
  `src/pages/admin/AdminQuizSection.tsx`.
- Chỗ gọi `QuizPage`/`AdminQuizSection` trong `App.tsx`/`AdminPage.tsx` —
  tạm thời **không xoá** ở spec này (sẽ trỏ sang UI mới ở spec kế tiếp) —
  nếu route "nghe"/"doc" bị gọi trước khi UI mới xong, tạm hiện trạng thái
  lỗi/rỗng, chấp nhận được (giống Phase 1, chưa có user thật dùng Nghe/Đọc).

## Testing

- `grammar-submit/scoring.test.ts` (file hiện có, không tạo mới) — thêm
  test case cho `text_fill_blank` và `matching`, port trực tiếp các case
  đã có trong `quiz-submit/scoring.test.ts` cũ trước khi xoá file đó.
- Verify SQL sau khi apply: `quiz_questions` không còn tồn tại,
  `grammar_exercises` có `audio_clip_id`/`reading_passage_id`/
  `matching_pairs`, `grammar_exercises_public` trả đúng cột mới không lỗi.
