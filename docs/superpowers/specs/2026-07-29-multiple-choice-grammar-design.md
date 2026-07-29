# Trắc nghiệm một đáp án đúng — dạng bài Ngữ pháp thứ 8

**Ngày:** 2026-07-29
**Trạng thái:** Đã chốt thiết kế, chờ triển khai

## Mục tiêu

Thêm dạng bài tập **Trắc nghiệm một đáp án đúng (`multiple_choice`)** cho module Ngữ pháp.
Một bài tập gồm nhiều câu hỏi; mỗi câu hiển thị danh sách phương án và học viên chọn
đúng **một** phương án. Số lượng phương án **không hard-code là 3** — mỗi câu có thể có
2, 3, 4 hoặc nhiều hơn, do admin cấu hình.

Đây là dạng thứ 8 mở rộng trực tiếp trên bảng `grammar_exercises` (đã có 7 dạng:
word_reorder, error_correction, translation, sentence_transformation,
guided_sentence_writing, classification, fill_in_the_blank). **Không** dùng hệ
`quiz_questions` cũ (dạng `multiple-choice` ở đó là hệ thống riêng, không đụng tới).
Tái dùng toàn bộ: mô hình `group_id` (bài / câu con), edge function `grammar-submit`,
ngưỡng pass 80%, XP, attempt, explanation.

## Quyết định thiết kế đã chốt (Q&A với user)

1. **Mô hình dữ liệu:** mỗi câu hỏi = một row `grammar_exercises`, gộp thành bài bằng
   `group_id` (giống fill_in_the_blank). Không dùng cột JSONB chứa mảng câu hỏi.
2. **Đáp án đúng:** lưu theo **index phương án** (`correct_answer = "0" | "1" | ...`),
   client gửi lên index đã chọn. Bền với phương án trùng nội dung và với việc sửa chính tả.
3. **Phản hồi sau nộp:** chỉ **đúng/sai từng câu** — KHÔNG tiết lộ đáp án đúng.
4. **Chặn nộp bài:** giữ hành vi hiện tại của trang — nút **Nộp bài** disable đến khi
   mọi câu đã có đáp án (không đổi flow chung, không làm scroll-to-focus).
5. **Sắp xếp phương án trong admin:** **kéo thả bằng dnd-kit** (đã có sẵn trong dự án).
6. **Không xáo trộn (shuffle) phương án** khi hiển thị — nhãn A/B/C/D bám đúng thứ tự
   admin đã sắp.

## Mô hình dữ liệu

- **Nhóm (`group_id`)** = một bài tập trắc nghiệm.
- **Row `grammar_exercises`** = một câu hỏi, `prompt_text` chứa nội dung câu hỏi,
  thứ tự hiển thị theo `order_index`.
- **Phương án** nằm trong cột mới `options JSONB` = mảng chuỗi theo đúng thứ tự hiển thị.

### Cột mới trên `grammar_exercises`

- `options JSONB` — ví dụ `["der", "die", "das"]`.
  **Có** đưa vào view public (không chứa đáp án).
  CHECK: `options IS NULL OR (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2)`.
- Đáp án đúng dùng lại cột `correct_answer TEXT` sẵn có, lưu **index dạng chuỗi**
  (`"0"`, `"1"`, …). Server-only, không expose ra view public.

Nhãn `A`, `B`, `C`, `D`, … **không lưu DB** — client sinh từ index
(`String.fromCharCode(65 + index)`), nên số phương án không bị giới hạn cứng.

`type` CHECK constraint thêm giá trị `'multiple_choice'`.

### View public

`grammar_exercises_public` **thêm cột `options`**. Vẫn **không** expose `correct_answer`
và `blanks`.

## Chấm điểm (server — `supabase/functions/grammar-submit/scoring.ts`)

- `ScorableGrammarExercise` thêm field `options: string[] | null`.
- Với type `multiple_choice`:
  - `total += 1` cho mỗi câu.
  - Đáp án gửi lên: `answers[exerciseId] = String(selectedIndex)`.
  - Đúng khi index gửi lên (sau `trim`) là số nguyên hợp lệ, nằm trong biên
    `0 <= index < options.length`, và khớp `correct_answer` sau `trim`.
  - Index không parse được, rỗng, âm, ngoài biên, hoặc `correct_answer`/`options`
    malformed → tính là **sai**, không crash Edge Function.
- `ScoreResult` thêm `choiceResults: Record<exerciseId, boolean>` (chỉ populate cho các
  exercise `multiple_choice`). Không trả về đáp án đúng.
- Các field cũ (`score`, `total`, `passed`, `xp_earned`, `blankResults`) giữ nguyên;
  score tổng vẫn `round(correct / total * 100)`, pass ≥ 80%.

## UI học viên — `src/pages/GrammarExercisePage.tsx`

- Thêm nhãn/hướng dẫn cho type mới vào `GRAMMAR_TYPE_LABELS` và `GRAMMAR_TYPE_INSTRUCTIONS`.
- State mới `choiceByExercise: Record<exerciseId, number>`.
- Mỗi câu render `prompt_text` + danh sách phương án dạng nút radio, mỗi nút hiển thị
  nhãn `A`/`B`/`C`/… theo index và nội dung phương án. Chọn phương án mới thay thế
  phương án cũ (single-select), đổi tự do trước khi nộp.
- `getAnswerStringFor` cho type này trả `String(index)`; coi là đã trả lời khi đã có
  index cho câu đó. Nút **Nộp bài** disable đến khi mọi câu đã trả lời (hành vi sẵn có).
- **Màn kết quả:** với mỗi câu trắc nghiệm, hiện phương án học viên đã chọn (nhãn + nội dung),
  tô xanh nếu `choiceResults[id] === true`, đỏ nếu sai; kèm explanation sẵn có.
  Ngưỡng 80%, XP, nút retry/next giữ nguyên.
- `handleRetry` reset thêm `choiceByExercise`.

## UI Admin — `src/pages/admin/AdminGrammarExerciseSection.tsx`

- Thêm "Trắc nghiệm" vào `TYPE_LABELS`, màu badge, dropdown chọn type.
- `EditForm` thêm `options: string[]` và `correct_option_index: number` (`-1` = chưa chọn).
- Editor phương án cho type mới:
  - Mỗi dòng: nhãn `A`/`B`/… tự sinh theo vị trí, input nội dung, radio "đáp án đúng",
    nút xóa, handle kéo thả.
  - **Kéo thả bằng dnd-kit** để đổi thứ tự; khi kéo, `correct_option_index` được ánh xạ
    lại theo vị trí mới để đáp án đúng vẫn bám đúng phương án.
  - Nút "Thêm phương án"; form tạo mới mặc định 3 dòng trống.
  - Xóa một phương án: các index sau dịch lên; nếu xóa đúng phương án đang là đáp án đúng
    thì `correct_option_index` về `-1` (buộc chọn lại).
- **Validate** (`validateForm`) cho type `multiple_choice`: `prompt_text` không rỗng;
  ≥ 2 phương án; không phương án nào rỗng; `correct_option_index` phải trỏ tới một
  phương án hợp lệ. Chưa hợp lệ thì chặn cả lưu và publish.
- **Build payload** (`buildPayload`): set `options` (mảng đã trim) và
  `correct_answer = String(correct_option_index)`; null hóa các field không dùng của
  type khác (`tokens`, `classification_*`, `blanks`, `word_bank`, `transformation_hint`).
- **Load form từ row có sẵn:** map `options` → `options`, `correct_answer` → 
  `correct_option_index` (parse int, không hợp lệ → `-1`).
- **Preview modal:** thêm nhánh render `multiple_choice` giống view học viên
  (câu hỏi + danh sách phương án A/B/C/D, chọn được một).

## Types — `src/lib/appTypes.ts` & `src/lib/hooks/useGrammarExercises.ts`

- `GrammarExercise.type` thêm `"multiple_choice"`.
- `GrammarExercise` thêm `options?: string[]`. **Không** thêm đáp án đúng vào client type.
- `useGrammarExercises`: select thêm `options`, map sang `options`.

## Migrations & types

Một migration `20260729000001_grammar_multiple_choice.sql`:
1. `ALTER TABLE grammar_exercises DROP CONSTRAINT grammar_exercises_type_check` +
   thêm `'multiple_choice'` vào CHECK của `type`.
2. `ADD COLUMN options JSONB` + CHECK shape (array, `>= 2` phần tử).
3. `DROP VIEW IF EXISTS grammar_exercises_public` + `CREATE VIEW` lại, mirror view hiện tại
   và thêm cột `options`; `GRANT SELECT ... TO authenticated`.

Apply lên project Supabase, rồi `npm run gen:types`.

## Testing (TDD)

- **Unit `scoring.ts`:**
  - Chọn đúng index → đúng, `choiceResults[id] === true`.
  - Chọn sai index → sai.
  - Đáp án rỗng / không phải số / số âm / ngoài biên `options` → sai, không crash.
  - `options` là `null` hoặc `correct_answer` là `null`/không parse được → câu đó sai,
    không crash.
  - Bài trộn nhiều type (multiple_choice + fill_in_the_blank + translation) → `total`
    và `score` cộng dồn chính xác, `choiceResults` chỉ chứa câu trắc nghiệm.
- **Component `GrammarExercisePage`:**
  - Render bài 10 câu → hiển thị đủ 10 câu và phương án tương ứng.
  - Câu 2 / 3 / 4 phương án → hiển thị đúng số option, nhãn A/B, A/B/C, A/B/C/D theo thứ tự.
  - Chọn A rồi đổi sang B → chỉ B ở trạng thái selected.
  - Còn câu chưa trả lời → nút Nộp bài disabled; trả lời hết → enabled.
  - Payload submit gửi `String(index)` cho từng câu.
  - Sau submit, tô xanh/đỏ đáp án đã chọn theo `choiceResults`, gồm cả bài có câu đúng
    lẫn câu sai.
  - Retry reset toàn bộ lựa chọn.
- **Admin `AdminGrammarExerciseSection`:**
  - Tạo câu trắc nghiệm ghi đúng `options` + `correct_answer` là index.
  - Thêm/xóa phương án cập nhật đúng danh sách và nhãn A/B/C/D.
  - Xóa phương án đang là đáp án đúng → chặn lưu tới khi chọn lại đáp án đúng.
  - Xóa phương án đứng trước đáp án đúng → `correct_option_index` dịch theo, đáp án đúng
    không bị lệch.
  - Kéo thả đổi thứ tự → `options` đổi thứ tự và `correct_answer` vẫn trỏ đúng phương án cũ.
  - Validate chặn: < 2 phương án, phương án rỗng, chưa chọn đáp án đúng.
  - Mở lại (edit) một câu đã lưu → form hiển thị đúng phương án và đáp án đúng.

## Phạm vi loại trừ (YAGNI)

- Không hỗ trợ nhiều đáp án đúng (multi-select).
- Không xáo trộn thứ tự phương án.
- Không tiết lộ đáp án đúng ở màn kết quả.
- Không đổi cơ chế disable nút Nộp bài của trang.
- Không đụng hệ `quiz_questions` / dạng `multiple-choice` cũ.
- Không thêm npm package mới.

## Acceptance Criteria (map lại)

- [ ] Một bài tập chứa nhiều câu trắc nghiệm → nhóm `group_id`, mỗi câu một row.
- [ ] Số phương án linh hoạt, không cố định 3 → `options JSONB`, nhãn sinh từ index.
- [ ] Mỗi câu tối thiểu 2 phương án → CHECK DB + validate admin.
- [ ] Mỗi câu đúng một đáp án đúng → `correct_answer` = một index duy nhất.
- [ ] Học viên chỉ chọn được một đáp án → state single-select theo exercise.
- [ ] Học viên đổi đáp án trước khi submit → radio thay thế lựa chọn cũ.
- [ ] Admin thêm/xóa/sắp xếp phương án → editor + dnd-kit.
- [ ] Label A/B/C/D đúng thứ tự → sinh từ index hiển thị.
- [ ] Không submit khi còn câu chưa trả lời → nút Nộp bài disabled.
