# Fill in the Blank — dạng bài Ngữ pháp thứ 7

**Ngày:** 2026-07-26
**Trạng thái:** Đã duyệt thiết kế, chờ review spec

## Mục tiêu

Thêm dạng bài tập **Điền từ vào ô trống (`fill_in_the_blank`)** cho các module Ngữ pháp.
Hỗ trợ hai cách làm: có danh sách từ gợi ý (word bank) hoặc học viên tự nhập.
Hệ thống chấm được cả trường hợp học viên nhập một đáp án khác word bank ban đầu
nhưng vẫn đúng, thông qua danh sách `acceptedAnswers` cấu hình cho từng ô.

Đây là dạng thứ 7 mở rộng trực tiếp trên bảng `grammar_exercises` (đã có 6 dạng:
word_reorder, error_correction, translation, sentence_transformation,
guided_sentence_writing, classification). **Không** dùng hệ `quiz_questions` cũ.
Tái dùng toàn bộ: mô hình `group_id` (câu cha/câu con), edge function
`grammar-submit`, ngưỡng pass 80%, XP, explanation, attempt.

## Quyết định thiết kế đã chốt (Q&A với user)

1. **Tính điểm:** mỗi ô trống = 1 điểm (nhất quán với classification: mỗi item 1 điểm).
2. **Phản hồi sau nộp:** hiển thị đúng/sai cho **từng ô** (mở rộng response của `grammar-submit`).
3. **Hoa/thường:** **không** phân biệt hoa/thường — luôn chấm case-insensitive.
   Bỏ hẳn phần cấu hình case-sensitive (khác AC gốc, theo yêu cầu user).
4. **Word bank:** cấu hình ở **cấp nhóm** (dùng chung cho cả bài / mọi câu con trong nhóm).
5. **Marker ô trống:** dùng `___` (ba dấu gạch dưới) trong `prompt_text`.

## Mô hình dữ liệu

Ba khái niệm khớp mô hình group hiện tại:

- **Nhóm** = một bài, có thể nhiều câu con → dùng `group_id` sẵn có.
- **Câu con (một row `grammar_exercises`)** = một câu, có thể chứa **nhiều ô trống**.
- **Ô trống** đánh dấu bằng `___` trong `prompt_text`; ô thứ N ↔ blank thứ N (định vị theo thứ tự xuất hiện).

Ví dụ một row có nhiều ô: `Das ist ___ Computer. ___ Computer ist teuer.` → 2 ô.
Ví dụ biến đổi từ gợi ý: `Ich ___ Deutsch. (lernen)` → `prompt_text` giữ nguyên cả
`(lernen)` làm gợi ý hiển thị; `blanks[0].acceptedAnswers = ["lerne"]`.

### Cột mới trên `grammar_exercises`

- `blanks JSONB` — mảng theo thứ tự ô:
  `[{ "acceptedAnswers": ["lerne"] }, { "acceptedAnswers": ["der","Der"] }]`.
  **Chỉ server** — KHÔNG đưa vào view public (chứa đáp án, giống `correct_answer`).
- `word_bank JSONB` — cấp nhóm:
  `{ "words": ["heiße","bin",...], "mode": "single_use" | "multiple_use" }` hoặc `null`.
  Lưu **giá trị giống nhau trên mọi row của nhóm** (đúng pattern `hint` hiện tại).
  Client đọc word bank từ row đầu tiên của nhóm.

`type` CHECK constraint thêm giá trị `'fill_in_the_blank'`.

### View public

`grammar_exercises_public` **thêm cột `word_bank`**. **Không** expose `blanks`.
Client tự đếm số ô bằng cách đếm marker `___` trong `prompt_text` (đã có sẵn ở view).

## Chấm điểm (server — `supabase/functions/grammar-submit/scoring.ts`)

- `ScorableGrammarExercise` thêm field `blanks: { acceptedAnswers: string[] }[] | null`.
- Với type `fill_in_the_blank`:
  - `total += số ô` (N blanks).
  - Đáp án ô gửi lên dưới dạng `answers[exerciseId] = JSON.stringify(["ô1","ô2",...])`;
    scoring `JSON.parse` cho riêng type này. (Tránh xung đột ký tự phân tách như classification dùng `|`/`:`.)
    Nếu parse lỗi hoặc thiếu ô → coi ô đó sai.
  - Ô đúng khi `normalizeBlank(userAnswer)` khớp một phần tử trong `acceptedAnswers` (đã normalize).
  - `correct += số ô đúng`.
- `normalizeBlank(s)`: `s.trim().replace(/\s+/g, " ").toLowerCase()`.
  **KHÔNG** fold Unicode/umlaut (ü ≠ u, ß giữ nguyên) → khớp test "sai umlaut = sai".
  Gộp khoảng trắng thừa → khớp test "thừa khoảng trắng = vẫn đúng".
- Score tổng vẫn `round(correct / total * 100)`, pass ≥ 80%.

### Phản hồi từng ô

Response `grammar-submit` thêm field `blankResults: Record<exerciseId, boolean[]>`
(chỉ populate cho các exercise `fill_in_the_blank`). Các field cũ
(`score`, `total`, `passed`, `xp_earned`) giữ nguyên.

## UI học viên — `src/pages/GrammarExercisePage.tsx`

- Thêm nhãn/hướng dẫn cho type mới vào `GRAMMAR_TYPE_LABELS` và `GRAMMAR_TYPE_INSTRUCTIONS`.
- Nhóm fill hiển thị **word bank chips ở đầu nhóm** (trên grid câu con), nếu nhóm có word bank.
- Mỗi câu con: tách `prompt_text` theo `___` → render `<input>` xen kẽ các đoạn chữ.
- **Điền bằng chip:** theo dõi "ô đang focus" ở cấp nhóm `(exerciseId, blankIndex)`.
  Click chip → điền vào ô đang focus; nếu không có ô focus → ô trống đầu tiên trong nhóm.
- **Gõ tay:** nhập trực tiếp vào input. Xóa/sửa tự do trước khi nộp.
- **Word bank mode:**
  - `multiple_use`: chip đã dùng làm mờ (đánh dấu) nhưng vẫn bấm lại được.
  - `single_use`: mỗi chip dùng 1 lần; điền vào ô thì bị "tiêu"; xóa khỏi ô thì trả lại pool.
    Pool dùng chung cho cả nhóm (nhiều câu con chia sẻ).
- **State mới:** `blankAnswersByExercise: Record<exerciseId, string[]>` (mảng theo số ô).
- `getAnswerStringFor` cho type này trả `JSON.stringify(blankAnswers)`;
  coi là đã trả lời khi **mọi ô** đều khác rỗng.
- **Màn kết quả:** dùng `blankResults` tô xanh/đỏ từng ô của câu fill.
  Ngưỡng 80%, XP, explanation, nút retry/next giữ nguyên.

## UI Admin — `src/pages/admin/AdminGrammarExerciseSection.tsx`

- Thêm option "Điền vào ô trống" vào `TYPE_LABELS` / màu badge / dropdown chọn type.
- `EditForm` thêm: `blanks: { acceptedAnswers: string[] }[]`,
  `word_bank_enabled: boolean`, `word_bank_words: string[]`,
  `word_bank_mode: "single_use" | "multiple_use"`.
- Form fields cho type mới:
  - Textarea `prompt_text` (hướng dẫn: dùng `___` để đánh dấu ô trống).
  - Tự sinh danh sách editor đáp án theo số marker `___` đếm được; mỗi ô là tag input ≥1 accepted answer.
  - Editor word bank cấp nhóm: toggle bật/tắt, tag input danh sách từ, radio mode single/multiple.
- **Validate** (`validateForm`): ≥1 ô; mỗi ô ≥1 đáp án khác rỗng; nếu bật word bank thì ≥1 từ;
  số editor đáp án phải khớp số marker `___`.
- **Build payload** (`buildPayload`): set `blanks` (theo row), `word_bank` (theo nhóm, giống nhau mọi row),
  null hóa các field không dùng của type khác.
- **Group-level word bank:** khi lưu nhóm nhiều câu con, ghi cùng một `word_bank` lên mọi row
  (giống cách `hint` được nhân bản). Blanks thì riêng từng row.
- **Preview modal:** thêm nhánh render `fill_in_the_blank` y hệt view học viên (inputs + word bank chips).

## Types — `src/lib/appTypes.ts` & `src/lib/hooks/useGrammarExercises.ts`

- `GrammarExercise.type` thêm `"fill_in_the_blank"`.
- `GrammarExercise` thêm `wordBank?: { words: string[]; mode: "single_use" | "multiple_use" }`.
  **Không** thêm `blanks` vào client type (đáp án server-only); số ô suy ra từ `prompt_text`.
- `useGrammarExercises`: select thêm `word_bank`, map sang `wordBank`.

## Migrations & types

Một migration `2026072600000X_grammar_fill_in_the_blank.sql`:
1. `ALTER TABLE ... DROP CONSTRAINT`/thêm `'fill_in_the_blank'` vào CHECK của `type`.
2. `ADD COLUMN blanks JSONB`, `ADD COLUMN word_bank JSONB`.
3. `DROP VIEW` + `CREATE VIEW grammar_exercises_public` thêm cột `word_bank` (mirror view hiện tại, KHÔNG có `blanks`).

Apply thẳng prod (ref `awdhqlgxnjwymwgxltlw`), rồi `npm run gen:types`.

## Testing (TDD)

- **Unit `scoring.ts`:**
  - Không word bank, gõ đúng → ô đúng.
  - Tự gõ đáp án khác word bank nhưng thuộc `acceptedAnswers` → đúng.
  - Thừa khoảng trắng → đúng (normalize).
  - Sai umlaut (không có accepted answer tương ứng) → sai.
  - Nhiều ô, đúng một phần → điểm từng ô chính xác, `blankResults` khớp.
  - Đáp án thiếu ô / JSON lỗi → ô đó sai, không crash.
- **Component `GrammarExercisePage`:** render fill + word bank; click chip điền ô focus;
  single_use tiêu chip / trả lại pool; multiple_use tái dùng.

## Phạm vi loại trừ (YAGNI)

- Không thêm cấu hình case-sensitive (user chốt luôn case-insensitive).
- Không đụng hệ `quiz_questions` / dạng `fill-blank` cũ.
- Không thêm npm package mới.

## Acceptance Criteria (map lại)

- [x] Tạo `FILL_IN_THE_BLANK` trong Admin → mục Admin.
- [x] Một hoặc nhiều ô trống → `blanks` mảng theo marker `___`.
- [x] Click chip điền vào ô đang chọn → focus model + word bank.
- [x] Tự gõ đáp án khác word bank → input tự do + `acceptedAnswers`.
- [x] Đáp án ngoài word bank vẫn đúng nếu thuộc `acceptedAnswers` → scoring.
- [x] Nhiều đáp án hợp lệ cho từng ô → `acceptedAnswers: string[]`.
- [~] Cấu hình hoa/thường → **bỏ theo yêu cầu user** (luôn case-insensitive).
- [x] Xử lý khoảng trắng & Unicode Đức → `normalizeBlank` giữ umlaut, gộp space.
- [x] Trạng thái đúng/sai từng ô sau submit → `blankResults`.
- [x] Tích hợp rule 80% / attempt / explanation → tái dùng `grammar-submit`.
- [x] Word bank SINGLE_USE / MULTIPLE_USE → mode + client logic.
- [x] Preview trong Admin → preview modal.
