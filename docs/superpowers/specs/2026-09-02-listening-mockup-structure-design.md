# Bài tập Nghe — cấu trúc theo mockup (3 loại câu)

## Bối cảnh

6 mockup (3 học viên + 3 admin) mô tả cấu trúc thông tin cho bài tập Nghe:

1. **Học viên — Điền vào ô trống**
2. **Admin — Điền vào ô trống**
3. **Admin — Richtig / Falsch**
4. **Admin — Trắc nghiệm**
5. **Học viên — Richtig / Falsch**
6. **Học viên — Trắc nghiệm**

**Nguyên tắc đã chốt:**

- Chỉ lấy **cấu trúc/layout** từ mockup; **giữ style hiện tại** (orange, `DesignSystem`, Tailwind, font-display).
- Tab Nghe chỉ hỗ trợ **3 loại câu** mockup; **ẩn 6 loại ngữ pháp còn lại** khỏi admin và học viên.
- Backend vẫn dùng `grammar_exercises` + `grammar-submit` (không tách bảng riêng như Reading).

## Quyết định thiết kế

### Loại câu hỏi Nghe (chỉ 3)

| Mockup | DB type | Ghi chú |
|--------|---------|---------|
| Điền vào ô trống | `fill_in_the_blank` | Tái dùng type hiện có |
| Trắc nghiệm | `multiple_choice` | 4 đáp án A–D |
| Richtig / Falsch | `richtig_falsch` | **Type mới** trên `grammar_exercises` |

**Lý do thêm `richtig_falsch`:** UI mockup khác hẳn trắc nghiệm (2 nút Richtig/Falsch, không phải A/B). Dùng `multiple_choice` 2 option sẽ lẫn label và khó filter trong admin.

**Model `richtig_falsch` (1 câu = 1 row):**

- `prompt_text`: nhận định tiếng Đức (vd. "Anna kommt aus Deutschland.")
- `correct_answer`: `"richtig"` | `"falsch"`
- Payload học viên gửi: chuỗi `"richtig"` hoặc `"falsch"`

**6 loại bị ẩn khỏi tab Nghe** (vẫn dùng cho Ngữ pháp):

`word_reorder`, `error_correction`, `translation`, `sentence_transformation`, `guided_sentence_writing`, `classification`, `matching`

Dữ liệu nghe cũ thuộc 6 loại này (nếu có) **không migrate** — admin xóa/sửa thủ công hoặc script one-off nếu cần.

### Mô hình 1 bộ bài (exercise_set)

```
exercise_set (category = 'nghe')
├── general_instruction     ← mới: "Yêu cầu chung"
├── listening_clip          ← 1 file audio / set (audio_clip_id trên group)
└── grammar_exercises[]     ← N câu cùng loại (1 group_id + 1 type)
```

- Mỗi set nghe = **1 audio + 1 hướng dẫn chung + 1 loại câu + N câu**.
- Không hỗ trợ trộn nhiều loại câu trong cùng 1 set (khác Ngữ pháp).
- Nhiều set / lesson → học viên vẫn thấy accordion "Bài 1, Bài 2..." như hiện tại; **bên trong mỗi set** layout theo mockup.

---

## Thay đổi dữ liệu

### Migration 1: `exercise_sets.general_instruction`

```sql
ALTER TABLE exercise_sets
  ADD COLUMN general_instruction TEXT;
```

- Nullable; chỉ dùng cho `category = 'nghe'` (có thể dùng cho nguphap/doc sau).
- Admin §2 "Yêu cầu chung" đọc/ghi cột này.

### Migration 2: type `richtig_falsch`

- Mở rộng CHECK constraint trên `grammar_exercises.type`.
- `correct_answer` CHECK: thêm nhánh cho `richtig_falsch` → chỉ `"richtig"` | `"falsch"`.
- Cập nhật view `grammar_exercises_public` nếu filter theo type.

### Scoring — `grammar-submit/scoring.ts`

Thêm nhánh:

```typescript
if (ex.type === "richtig_falsch") {
  // so sánh answer (string) với correct_answer ("richtig" | "falsch")
}
```

`deriveCorrectAnswers` / `projectAnswers`: trả `"richtig"` | `"falsch"` cho review sau nộp bài.

### Types

- Chạy `npm run gen:types` sau migration.
- Cập nhật `GrammarExercise.type` trong `appTypes.ts` và `grammarExerciseForm.ts`.

---

## Admin UI — `AdminListeningExerciseSection` (mới)

Tách khỏi `AdminGrammarExerciseSection` khi `category = "nghe"`. Pattern tham chiếu: `AdminReadingExerciseSection`.

### Màn danh sách (giữ)

- Tab Nghe trong `AdminQuizSection.tsx` → render section mới.
- Header: **"Bài tập nghe"** + search "Tìm bài học...".
- Nhóm theo module (`AdminModuleGroup`) → lesson row (tên, "X bài - Y câu").
- Nút **"+ Thêm bài tập"** → tạo `exercise_set` mới (`category='nghe'`, `status='draft'`) + chọn loại câu (3 option).

### Màn editor set (mới — theo mockup §1–§3)

Vào khi click 1 set (hoặc sau khi tạo mới).

**Breadcrumb bar**

- `{level} ({n} bài học) › {lesson_title} ({x} bài - {y} câu)`
- Badge trạng thái: `LessonStatusBadge` (Đã public / Nháp)
- Menu `⋯` (tuỳ chọn phase 2: xóa set)

**§1 — File nghe (audio)**

- Subtext: "Bài tập này sử dụng 1 file nghe"
- `ClipRow` + player (tái dùng `AdminExerciseSetMedia`)
- Nút **"Thay đổi file"** → chọn clip có sẵn của lesson hoặc upload mới → gán `audio_clip_id` cho exercises trong set
- Nếu chưa có clip: upload bắt buộc trước publish

**§2 — Yêu cầu chung**

- Subtext: "Hướng dẫn chung cho toàn bộ bài tập"
- Textarea hiển thị `general_instruction`
- Nút **"Sửa"** → inline edit → Lưu vào `exercise_sets`

**§3 — Câu hỏi**

- Subtext: "Các câu hỏi trong bài tập (kéo thả để sắp xếp thứ tự)"
- Nút **"+ Thêm câu"**
- Bảng (DnD + checkbox bulk delete):

| fill_in_the_blank | multiple_choice | richtig_falsch |
|-------------------|-----------------|----------------|
| Câu có `{{blank}}` inline | Câu hỏi + 4 input A–D + radio đáp án đúng | Nhận định + radio Richtig/Falsch |
| Edit / Delete mỗi row | | |

- Loại câu **cố định theo set** — khi tạo set chọn 1 trong 3; không đổi loại sau khi có câu (hoặc cảnh báo xóa hết câu mới đổi).

**Footer sticky**

| Nút | Hành vi |
|-----|---------|
| Xem trước | Modal preview giống layout học viên (tái dùng pattern preview reading) |
| Lưu nháp | `exercise_sets.status = 'draft'` |
| Xuất bản | `exercise_sets.status = 'published'` — validate: có audio, ≥1 câu, mọi câu hợp lệ |

### Admin form helpers

- `src/lib/listeningExerciseForm.ts` (mới): validate/build payload cho 3 loại; RF helpers tham chiếu `readingExerciseForm` (statement pattern).
- Giới hạn type picker: constant `LISTENING_QUESTION_TYPES = ['fill_in_the_blank', 'multiple_choice', 'richtig_falsch']`.

---

## Học viên UI — refactor `QuizSetListPage` (chỉ `category="nghe"`)

Ngữ pháp (`GrammarSetListPage`) **không đổi**. Chỉ nhánh `category === "nghe"`.

### Header — mở rộng `ExercisePageHeader`

Props thêm (chỉ truyền từ QuizSetListPage):

- `levelBadge`: `lesson.level` (vd. "A1")
- `lessonTitle`: `lesson.title`
- `progress`: `{ current: number; total: number }` — set đã pass / tổng set published (từ attempts + `lessonSets.length`)

Giữ nút "Trở về bài học".

### Body mỗi set (khi expanded)

Thứ tự vertical (mockup):

1. **Audio** — label "File nghe {n}" (n = order_index clip + 1). Giữ `<audio controls>` HTML5 phase 1; waveform/-10s **ngoài phạm vi**.
2. **Yêu cầu chung** — khối `bg-slate-50 border rounded-xl` nếu `general_instruction` có nội dung.
3. **Bài header** — "Bài {n}" + badge loại (ĐIỀN VÀO Ô TRỐNG / TRẮC NGHIỆM / RICHTIG FALSCH) + "{m} câu". Collapse toggle giữ nếu 1 set nhiều group (thực tế 1 set = 1 group).
4. **Danh sách câu dọc** — `flex-col gap-3`, **không** grid 2–3 cột.
   - Fill blank: câu Đức + input inline (giữ `ExerciseAnswerInput`, wrapper đổi)
   - MC: 4 option **ngang** trên desktop (mockup #6)
   - RF: nhận định trái + 2 pill Richtig/Falsch phải (mockup #5)
5. **Footer** — "Làm lại" (secondary) + **"Kiểm tra đáp án"** (primary, thay "Nộp bài"). Nút "Lưu" draft **ẩn** trên nghe (mockup không có); logic draft vẫn chạy ngầm nếu cần giữ tương thích.

### `ExerciseAnswerInput`

- Thêm variant/layout prop hoặc component con `ListeningRichtigFalschInput`.
- MC layout ngang: prop `optionLayout: "horizontal" | "vertical"` (nghe = horizontal).

### Set list ngoài

- Accordion "Bài 1, Bài 2..." **giữ** — mockup #1 là 1 set đang mở, không phải bỏ accordion.

---

## Luồng end-to-end

```
Admin
  Upload clip → listening_clips
  Tạo set nghe (chọn loại) → exercise_sets + general_instruction
  Gán audio + thêm câu → grammar_exercises (audio_clip_id, group_id)
  Xuất bản

Học viên
  LessonDetailPage (Nghe) → "Bắt đầu bài tập nghe"
  QuizSetListPage → expand set → audio + yêu cầu + câu hỏi
  Kiểm tra đáp án → grammar-submit → exercise_set_attempts
```

**Không đổi:** `grammar-submit` entrypoint, RLS, completion (`hasNgheQuestions`), routing App.tsx.

---

## Ngoài phạm vi

- Custom audio player (waveform, rewind 10s, volume slider custom) — phase 2
- Carousel / 1 câu 1 màn như Reading
- Tách `listening-submit` edge function
- Migrate tự động câu nghe loại cũ (6 loại ngữ pháp)
- Đổi style sang màu đỏ mockup
- Tab Ngữ pháp / Đọc

---

## Testing / verification

- `npm run lint` pass sau mọi thay đổi TS
- Migration apply + `npm run gen:types`
- Unit test `grammar-submit/scoring.ts`: `richtig_falsch` đúng/sai/thiếu đáp án
- Admin manual:
  - Tạo set fill_blank + MC + RF; publish; preview
  - Tab Nghe **không** hiện 6 loại ngữ pháp
  - §2 lưu/load `general_instruction`
- Học viên manual:
  - Header có A1 + tiến độ
  - 3 layout câu khớp mockup (dọc, RF pills, MC ngang)
  - "Kiểm tra đáp án" chấm đúng; "Làm lại" reset form
- Regression: tab Ngữ pháp admin + học viên không đổi

---

## Thứ tự triển khai đề xuất

1. Migration (`general_instruction` + `richtig_falsch`) + scoring + types
2. `listeningExerciseForm.ts` + constants
3. `AdminListeningExerciseSection` (list + set editor)
4. `AdminQuizSection` routing
5. `ExerciseAnswerInput` variants (RF + MC horizontal)
6. `QuizSetListPage` layout nghe + `ExercisePageHeader` props
7. Test + dọn code nghe khỏi `AdminGrammarExerciseSection` (category branch)
