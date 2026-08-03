# Phase 4 (data model + submit logic) — gộp Nghe/Đọc vào grammar_exercises — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `grammar_exercises`/`grammar-submit` chấm được cả 2 loại câu hỏi mới (`text_fill_blank`, `matching`) dùng cho Nghe/Đọc; xoá hẳn nhánh `quiz_questions`/`quiz-submit` phía backend.

**Architecture:** Migration mở rộng `grammar_exercises` + viết lại `grammar_exercises_public`. `scoring.ts` thêm 2 nhánh chấm điểm port từ `quiz-submit/scoring.ts` cũ. `index.ts` sửa bug rollup category hard-code.

**Tech Stack:** Supabase Postgres + Deno Edge Function — không có thay đổi frontend ở sub-phase này.

## Global Constraints

- **KHÔNG xoá `src/pages/QuizPage.tsx`, `src/lib/hooks/useQuizQuestions.ts`, `src/pages/admin/AdminQuizSection.tsx`** ở plan này — xoá các file này sẽ làm `App.tsx`/`AdminPage.tsx` gãy import ngay lập tức (khác với backend, các file này được TypeScript compile-time kiểm tra qua import trực tiếp). Việc xoá 3 file này dời sang spec UI kế tiếp, khi call site được viết lại.
- Áp migration trực tiếp lên production (app chưa có user thật dùng Nghe/Đọc).
- `explanation`/`correct_answer` không bao giờ vào `grammar_exercises_public` — giữ nguyên rule bảo mật đã có.

---

### Task 1: Migration — xoá quiz_questions, mở rộng grammar_exercises, viết lại view

**Files:**
- Create: `supabase/migrations/20260731110000_merge_quiz_into_grammar_exercises.sql`
- Modify: `src/lib/database.types.ts` (regenerate sau khi apply)

- [ ] **Step 1: Viết migration**

```sql
-- =============================================================================
-- Gộp Nghe/Đọc vào grammar_exercises thay vì module quiz_questions riêng —
-- tái dùng nguyên grammar-submit/GrammarExercisePage thay vì xây song song.
-- Xoá hẳn quiz_questions (dữ liệu đã trống từ migration trước).
-- =============================================================================

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

- [ ] **Step 2: Apply migration lên production**

Dùng Supabase MCP `apply_migration`, tên `merge_quiz_into_grammar_exercises`.

- [ ] **Step 3: Verify bằng SQL** (tách riêng từng câu)

```sql
select table_name from information_schema.tables where table_name = 'quiz_questions';
```
Kỳ vọng: rỗng (bảng không còn tồn tại).

```sql
select column_name from information_schema.columns where table_name = 'grammar_exercises' and column_name in ('audio_clip_id', 'reading_passage_id', 'matching_pairs');
```
Kỳ vọng: đủ 3 dòng.

```sql
select * from grammar_exercises_public limit 1;
```
Kỳ vọng: không lỗi.

- [ ] **Step 4: Regenerate `database.types.ts`**

Dùng Supabase MCP `generate_typescript_types`, ghi đè `src/lib/database.types.ts`. Xác nhận: không còn `quiz_questions`/`quiz_questions_public`; `grammar_exercises.Row` có `audio_clip_id`/`reading_passage_id`/`matching_pairs`; `grammar_exercises_public.Row` có thêm `category`/`matching_pairs`/`audio_clip_id`/`reading_passage_id`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731110000_merge_quiz_into_grammar_exercises.sql src/lib/database.types.ts
git commit -m "feat(db): gộp Nghe/Đọc vào grammar_exercises, xoá quiz_questions"
```

---

### Task 2: `scoring.ts` — thêm chấm điểm text_fill_blank + matching (TDD)

**Files:**
- Modify: `supabase/functions/grammar-submit/scoring.ts`
- Modify: `supabase/functions/grammar-submit/scoring.test.ts`

**Interfaces:**
- Consumes: không đổi.
- Produces: `ScorableGrammarExercise` thêm field `prompt_text: string | null`, `matching_pairs` KHÔNG thêm (không cần cho chấm điểm — chỉ `correct_answer` được dùng). `computeGrammarScore` xử lý thêm 2 nhánh `type === "text_fill_blank"` và `type === "matching"`.

- [ ] **Step 1: Thêm `prompt_text` vào interface + fixture, viết test thất bại cho `text_fill_blank`**

Thêm vào `ScorableGrammarExercise` (đầu file `scoring.ts`):

```ts
export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  blanks: { acceptedAnswers: string[] }[] | null;
  options: string[] | null;
  prompt_text: string | null;
}
```

Thêm vào `scoring.test.ts`, cập nhật đúng 5 fixture hiện có trong file (`translation`, `fill`, `choice`, `reorder`, `classify`) để thêm `prompt_text: null` vào object mặc định — nếu không sẽ lỗi thiếu property bắt buộc. Sau đó thêm:

```ts
const textFillBlank = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "tfb1",
  type: "text_fill_blank",
  correct_answer: null,
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: null,
  prompt_text: "Ich {{bin|Bin}} Student.",
  ...over,
});

test("text_fill_blank: chấp nhận đáp án đúng theo từng ô trống", () => {
  const r = computeGrammarScore([textFillBlank()], { tfb1: "bin" });
  assert.equal(r.correct, 1);
  assert.equal(r.total, 1);
  assert.deepEqual(r.blankResults.tfb1, [true]);
});

test("text_fill_blank: chấp nhận biến thể viết hoa", () => {
  const r = computeGrammarScore([textFillBlank()], { tfb1: "Bin" });
  assert.equal(r.correct, 1);
});

test("text_fill_blank: nhiều ô trống, chấm từng ô độc lập", () => {
  const ex = textFillBlank({ id: "tfb2", prompt_text: "Ich {{bin}} und du {{bist}}." });
  const r = computeGrammarScore([ex], { tfb2: "bin|falsch" });
  assert.equal(r.correct, 1);
  assert.equal(r.total, 2);
  assert.deepEqual(r.blankResults.tfb2, [true, false]);
});

test("text_fill_blank: prompt_text không có {{...}} thì total = 0, không throw", () => {
  const ex = textFillBlank({ id: "tfb3", prompt_text: "Không có blank." });
  const r = computeGrammarScore([ex], { tfb3: "bất kỳ" });
  assert.equal(r.total, 0);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

```bash
npx tsx --test supabase/functions/grammar-submit/scoring.test.ts
```
Kỳ vọng: FAIL (branch `text_fill_blank` chưa tồn tại, `total`/`correct` sẽ tính sai vì rơi vào nhánh `else` mặc định).

- [ ] **Step 3: Cài `extractBlanks` + nhánh `text_fill_blank` trong `computeGrammarScore`**

Thêm hàm helper (đặt trước `computeGrammarScore`, sau `normalizeBlank`):

```ts
const BLANK_PATTERN = /\{\{([^}]*)\}\}/g;

/** Trích danh sách biến thể đáp án theo thứ tự từ prompt_text, ví dụ
 * "Ich {{bin|Bin}} Student." -> [["bin", "Bin"]]. */
function extractBlanks(promptText: string): string[][] {
  const matches = [...promptText.matchAll(BLANK_PATTERN)];
  return matches.map((m) => m[1].split("|").map((v) => v.trim()));
}
```

Thêm nhánh trong `computeGrammarScore`, ngay sau nhánh `fill_in_the_blank`:

```ts
    if (ex.type === "text_fill_blank") {
      const blanks = extractBlanks(ex.prompt_text ?? "");
      const userParts = (answers[ex.id] ?? "").split("|").map((s) => s.trim().toLowerCase());
      const results = blanks.map((variants, index) => {
        const userPart = userParts[index] ?? "";
        return variants.some((v) => v.toLowerCase() === userPart);
      });
      blankResults[ex.id] = results;
      total += results.length;
      correct += results.filter(Boolean).length;
      exerciseResults[ex.id] = results.length > 0 && results.every(Boolean);
      continue;
    }
```

- [ ] **Step 4: Chạy lại test, xác nhận pass**

```bash
npx tsx --test supabase/functions/grammar-submit/scoring.test.ts
```
Kỳ vọng: PASS toàn bộ (kể cả các test `translation`/`fill`/... cũ, sau khi đã thêm `prompt_text: null` vào fixture của chúng ở Step 1).

- [ ] **Step 5: Viết test thất bại cho `matching`**

```ts
const matching = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "m1",
  type: "matching",
  correct_answer: "der Tisch:cái bàn|die Lampe:cái đèn",
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: null,
  prompt_text: null,
  ...over,
});

test("matching: đúng toàn bộ cặp, không phân biệt thứ tự", () => {
  const r = computeGrammarScore([matching()], { m1: "die Lampe:cái đèn|der Tisch:cái bàn" });
  assert.equal(r.correct, 1);
  assert.equal(r.total, 1);
  assert.equal(r.exerciseResults.m1, true);
});

test("matching: sai 1 cặp thì cả câu sai", () => {
  const r = computeGrammarScore([matching()], { m1: "der Tisch:cái ghế|die Lampe:cái đèn" });
  assert.equal(r.exerciseResults.m1, false);
});
```

- [ ] **Step 6: Chạy test, xác nhận fail**

```bash
npx tsx --test supabase/functions/grammar-submit/scoring.test.ts
```
Kỳ vọng: FAIL trên 2 test `matching` mới.

- [ ] **Step 7: Cài `normalizeMatching` + nhánh `matching`**

Thêm hàm helper (cạnh `normalizeBlank`):

```ts
function normalizeMatching(s: string): string {
  return s
    .split("|")
    .map((p) => p.trim())
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}
```

Thêm nhánh trong `computeGrammarScore`, ngay sau nhánh `classification`:

```ts
    if (ex.type === "matching") {
      total += 1;
      const isCorrect = normalizeMatching(answers[ex.id] ?? "") === normalizeMatching(ex.correct_answer ?? "");
      exerciseResults[ex.id] = isCorrect;
      if (isCorrect) correct++;
      continue;
    }
```

- [ ] **Step 8: Chạy lại toàn bộ test file, xác nhận pass**

```bash
npx tsx --test supabase/functions/grammar-submit/scoring.test.ts
```
Kỳ vọng: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/grammar-submit/scoring.ts supabase/functions/grammar-submit/scoring.test.ts
git commit -m "feat(grammar-submit): chấm điểm text_fill_blank + matching, port từ quiz-submit cũ"
```

---

### Task 3: `index.ts` — sửa rollup lesson_progress dùng đúng category của set

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts`

- [ ] **Step 1: Đổi 3 chỗ hard-code `"nguphap"` thành `set.category`**

Tìm:

```ts
    const { data: lessonSets } = await supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", set.lesson_id)
      .eq("category", "nguphap")
      .eq("status", "published");
```

Thay bằng:

```ts
    const { data: lessonSets } = await supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", set.lesson_id)
      .eq("category", set.category)
      .eq("status", "published");
```

Tìm:

```ts
    const { data: previousProgress } = await supabase
      .from("lesson_progress")
      .select("quiz_score")
      .eq("user_id", user.id)
      .eq("lesson_id", set.lesson_id)
      .eq("category", "nguphap")
      .maybeSingle();
```

Thay bằng:

```ts
    const { data: previousProgress } = await supabase
      .from("lesson_progress")
      .select("quiz_score")
      .eq("user_id", user.id)
      .eq("lesson_id", set.lesson_id)
      .eq("category", set.category)
      .maybeSingle();
```

Tìm:

```ts
    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id: set.lesson_id, category: "nguphap", quiz_score: lessonQuizScore },
      { onConflict: "user_id,lesson_id,category" },
    );
```

Thay bằng:

```ts
    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id: set.lesson_id, category: set.category, quiz_score: lessonQuizScore },
      { onConflict: "user_id,lesson_id,category" },
    );
```

- [ ] **Step 2: Kiểm tra không còn `"nguphap"` hard-code nào trong file**

```bash
grep -n '"nguphap"' supabase/functions/grammar-submit/index.ts
```
Kỳ vọng: không có kết quả nào.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts
git commit -m "fix(grammar-submit): rollup lesson_progress theo đúng category của set, không hard-code nguphap"
```

---

### Task 4: Xoá `supabase/functions/quiz-submit/`

**Files:**
- Delete: `supabase/functions/quiz-submit/` (toàn bộ thư mục)

Thư mục Edge Function độc lập, không được import bởi bất kỳ file frontend nào (Deno function, deploy riêng) — xoá an toàn, không ảnh hưởng build frontend.

- [ ] **Step 1: Xoá thư mục**

```bash
git rm -r supabase/functions/quiz-submit
```

- [ ] **Step 2: Kiểm tra không còn tham chiếu**

```bash
grep -rn "quiz-submit" src/ supabase/ --include="*.ts" --include="*.tsx"
```
Kỳ vọng: không có kết quả nào (frontend chưa gọi `quiz-submit` ở code hiện tại theo rà soát trước đó — `QuizPage.tsx` gọi `useQuizQuestions`/query trực tiếp, không gọi tên function này qua chuỗi literal "quiz-submit"; nếu grep ra kết quả, dừng lại báo cáo trước khi xoá tiếp).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: xoá Edge Function quiz-submit, logic đã port sang grammar-submit"
```

---

### Task 5: Regression toàn bộ

**Files:** không tạo/sửa file mới.

- [ ] **Step 1: Type check**

```bash
npm run lint
```
Kỳ vọng: sạch (không đổi gì ở frontend TypeScript, chỉ backend + migration).

- [ ] **Step 2: Chạy toàn bộ test suite**

```bash
npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts
```
Kỳ vọng: pass toàn bộ, bao gồm các test mới ở Task 2.

- [ ] **Step 3: Build**

```bash
npm run build
```
Kỳ vọng: thành công.

- [ ] **Step 4: Ghi chú bàn giao cho spec UI kế tiếp**

Xác nhận lại (không sửa gì): `QuizPage.tsx`/`useQuizQuestions.ts`/`AdminQuizSection.tsx` hiện đang gọi bảng/view đã xoá (`quiz_questions`/`quiz_questions_public`) — sẽ lỗi runtime khi thực sự điều hướng tới, đúng dự kiến. Spec UI kế tiếp sẽ thay 3 file này bằng UI mới đọc từ `grammar_exercises_public`.
