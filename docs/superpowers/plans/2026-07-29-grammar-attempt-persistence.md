# Grammar Attempt Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lưu snapshot attempt bài tập ngữ pháp xuống DB và hydrate lại card kết quả khi học viên mở lại trang, thay vì mất sạch sau refresh.

**Architecture:** Thêm bảng `grammar_attempts` (1 row/(user, lesson), snapshot lần gần nhất + `best_score` + `attempt_count`), chỉ ghi được bằng service_role trong Edge Function `grammar-submit`. Mở rộng `computeGrammarScore` trả kết quả đúng/sai cho từng bài ở cả 8 loại. Frontend đọc bảng qua PostgREST bằng hook mới, parse `answers` bằng một codec dùng chung với đường serialize lúc nộp bài.

**Tech Stack:** React 19 + TypeScript 5.8 + Vite 6, Supabase (PostgREST + RLS + Edge Functions/Deno), test bằng `node:test` chạy qua `tsx`.

## Global Constraints

- Ngôn ngữ code: **English** (biến, hàm, type, comment kỹ thuật). Nội dung hiển thị cho user: **Tiếng Việt**.
- Không dùng `any` — dùng type cụ thể hoặc `unknown`.
- Named exports, không default export.
- Không sửa tay `src/lib/database.types.ts` — chạy `npm run gen:types`.
- `correct_answer` **không bao giờ** gửi về client.
- Mọi bảng phải bật RLS.
- Không thêm npm package mới.
- Không dùng `window.alert()` / `window.confirm()`.
- Chạy test: `npx tsx --test <đường/dẫn/file.test.ts>`
- Type check: `npm run lint` (tức `tsc --noEmit`)
- Hằng số đã có trong `supabase/functions/grammar-submit/index.ts`: `XP_REWARD = 30`, `PASS_THRESHOLD = 80`.
- Commit message tiếng Việt, kết thúc bằng:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

---

### Task 1: Migration bảng `grammar_attempts`

**Files:**
- Create: `supabase/migrations/20260729000004_grammar_attempts.sql`
- Modify: `src/lib/database.types.ts` (chỉ qua `npm run gen:types`, không sửa tay)

**Interfaces:**
- Consumes: bảng `lessons(id)`, `profiles(id)` đã có.
- Produces: bảng `grammar_attempts` với các cột `id, lesson_id, user_id, answers, blank_results, choice_results, exercise_results, score, total, best_score, attempt_count, submitted_at` và `UNIQUE (lesson_id, user_id)`. Task 4 ghi vào bảng này, Task 7 đọc ra.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/20260729000004_grammar_attempts.sql`:

```sql
-- =============================================================================
-- DeutschPath — grammar_attempts: snapshot lần nộp gần nhất của mỗi
-- (lesson_id, user_id), kèm best_score và attempt_count để card kết quả và
-- Roadmap truy xuất lại được sau khi refresh.
--
-- Chỉ Edge Function grammar-submit (service_role) được ghi: không có policy
-- INSERT/UPDATE cho authenticated, nếu không học viên tự đặt best_score = 100.
-- Bảng không chứa correct_answer nên client đọc trực tiếp qua PostgREST là an toàn.
-- =============================================================================

CREATE TABLE grammar_attempts (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id        TEXT        NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers          JSONB       NOT NULL,
  blank_results    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  choice_results   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  exercise_results JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score            INTEGER     NOT NULL,
  total            INTEGER     NOT NULL,
  best_score       INTEGER     NOT NULL,
  attempt_count    INTEGER     NOT NULL DEFAULT 1,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);

ALTER TABLE grammar_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grammar_attempts: own read"
  ON grammar_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "grammar_attempts: admin all"
  ON grammar_attempts FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Áp migration vào Supabase local**

Run: `supabase db reset` (hoặc `supabase migration up` nếu đã có dữ liệu local muốn giữ)
Expected: migration chạy không lỗi, bảng `grammar_attempts` xuất hiện.

Nếu Supabase local không chạy được trong môi trường này, dừng lại và báo cho người dùng — các Task 7-9 cần `database.types.ts` đã cập nhật thì `npm run lint` mới pass.

- [ ] **Step 3: Regenerate types**

Run: `npm run gen:types`
Expected: `src/lib/database.types.ts` có thêm entry `grammar_attempts`.

Kiểm tra: `grep -c "grammar_attempts" src/lib/database.types.ts` trả về số > 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260729000004_grammar_attempts.sql src/lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(db): bảng grammar_attempts lưu snapshot bài tập ngữ pháp

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `computeGrammarScore` trả `exerciseResults` cho cả 8 loại

**Files:**
- Modify: `supabase/functions/grammar-submit/scoring.ts`
- Test: `supabase/functions/grammar-submit/scoring.test.ts`

**Interfaces:**
- Consumes: `ScorableGrammarExercise` (đã có trong `scoring.ts`).
- Produces: `ScoreResult` có thêm field `exerciseResults: Record<string, boolean>` — key là `exercise.id`, value là "bài này đúng hoàn toàn". Task 4 lưu xuống DB, Task 9 dùng để tô màu.

**Ngữ cảnh:** `scoring.ts` hiện chỉ sinh `blankResults` (mảng boolean theo từng blank) và `choiceResults` (boolean theo từng bài multiple_choice). Sáu loại còn lại không có boolean nào, nên card kết quả không tô được màu. Task này bổ sung một map phủ cả 8 loại, **không thay đổi** `correct` / `total` / `score` hiện có.

- [ ] **Step 1: Viết các test thất bại**

Thêm vào cuối `supabase/functions/grammar-submit/scoring.test.ts`:

```ts
const reorder = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "w1",
  type: "word_reorder",
  correct_answer: "Ich lerne Deutsch",
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: null,
  ...over,
});

const classify = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "c1",
  type: "classification",
  correct_answer: null,
  acceptable_answers: null,
  classification_items: [
    { item: "der Tisch", group: "maskulin" },
    { item: "die Lampe", group: "feminin" },
  ],
  blanks: null,
  options: null,
  ...over,
});

test("exerciseResults: loại text được chấm đúng/sai theo từng bài", () => {
  const r = computeGrammarScore([reorder()], { w1: "Ich lerne Deutsch" });
  assert.equal(r.exerciseResults.w1, true);

  const wrong = computeGrammarScore([reorder()], { w1: "Deutsch lerne Ich" });
  assert.equal(wrong.exerciseResults.w1, false);
});

test("exerciseResults: translation chấp nhận acceptable_answers", () => {
  const ex = translation({ acceptable_answers: ["Ich studiere Deutsch"] });
  const r = computeGrammarScore([ex], { t1: "Ich studiere Deutsch" });
  assert.equal(r.exerciseResults.t1, true);
});

test("exerciseResults: classification chỉ true khi mọi item đúng", () => {
  const allRight = computeGrammarScore([classify()], {
    c1: "der Tisch:maskulin|die Lampe:feminin",
  });
  assert.equal(allRight.exerciseResults.c1, true);
  assert.equal(allRight.correct, 2);

  const partial = computeGrammarScore([classify()], {
    c1: "der Tisch:maskulin|die Lampe:maskulin",
  });
  assert.equal(partial.exerciseResults.c1, false);
  assert.equal(partial.correct, 1);
});

test("exerciseResults: fill_in_the_blank chỉ true khi mọi blank đúng", () => {
  const ex = fill();
  const results = computeGrammarScore([ex], { f1: JSON.stringify(["ein", "eine"]) });
  assert.equal(results.exerciseResults.f1, results.blankResults.f1.every(Boolean));
});

test("exerciseResults: multiple_choice khớp choiceResults", () => {
  const ex: ScorableGrammarExercise = {
    id: "m1",
    type: "multiple_choice",
    correct_answer: "1",
    acceptable_answers: null,
    classification_items: null,
    blanks: null,
    options: ["a", "b", "c"],
  };
  const r = computeGrammarScore([ex], { m1: "1" });
  assert.equal(r.exerciseResults.m1, true);
  assert.equal(r.exerciseResults.m1, r.choiceResults.m1);
});

test("exerciseResults: có key cho mọi bài được chấm", () => {
  const r = computeGrammarScore([translation(), reorder(), classify()], {});
  assert.deepEqual(Object.keys(r.exerciseResults).sort(), ["c1", "t1", "w1"]);
});
```

Lưu ý: helper `translation` và `fill` đã tồn tại sẵn ở đầu file — không định nghĩa lại.

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: FAIL — `r.exerciseResults` là `undefined`, lỗi kiểu "Cannot read properties of undefined".

- [ ] **Step 3: Sửa `scoring.ts`**

Thêm field vào interface:

```ts
export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
}
```

Trong `computeGrammarScore`, khai báo cùng chỗ với `blankResults`:

```ts
const exerciseResults: Record<string, boolean> = {};
```

Nhánh `multiple_choice` — sau `choiceResults[ex.id] = isCorrect;` thêm:

```ts
    exerciseResults[ex.id] = isCorrect;
```

Nhánh `fill_in_the_blank` — sau `blankResults[ex.id] = results;` thêm:

```ts
    exerciseResults[ex.id] = results.length > 0 && results.every(Boolean);
```

Nhánh `classification` — thay hai dòng cuối của nhánh (vòng `for` cộng điểm và `continue;`) bằng đoạn dưới. **Giữ nguyên** `total += items.length;` và phần dựng `userMap` ở trên nó:

```ts
      let itemsCorrect = 0;
      for (const it of items) {
        if (normalizeWord(userMap.get(it.item) ?? "") === normalizeWord(it.group)) itemsCorrect++;
      }
      correct += itemsCorrect;
      exerciseResults[ex.id] = items.length > 0 && itemsCorrect === items.length;
      continue;
```

Nhánh cuối (các loại text) — thay bằng:

```ts
    total += 1;
    const userAnswer = normalizeWord(answers[ex.id] ?? "");
    let isCorrect: boolean;
    if (ex.type === "translation") {
      const accepted = [ex.correct_answer ?? "", ...(ex.acceptable_answers ?? [])]
        .map(normalizeWord)
        .filter((s) => s.length > 0);
      isCorrect = accepted.includes(userAnswer);
    } else {
      isCorrect = userAnswer === normalizeWord(ex.correct_answer ?? "");
    }
    exerciseResults[ex.id] = isCorrect;
    if (isCorrect) correct++;
```

Cuối hàm, trả thêm field:

```ts
  return { correct, total, score, blankResults, choiceResults, exerciseResults };
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: PASS toàn bộ, kể cả 18 test cũ (số `correct`/`total` không được đổi).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit/scoring.ts supabase/functions/grammar-submit/scoring.test.ts
git commit -m "$(cat <<'EOF'
feat(grammar): scoring trả exerciseResults cho cả 8 loại bài

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hàm thuần `computeAttemptUpdate`

**Files:**
- Create: `supabase/functions/grammar-submit/attemptUpdate.ts`
- Test: `supabase/functions/grammar-submit/attemptUpdate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ExistingAttempt { best_score: number; attempt_count: number }
  export interface AttemptUpdate { best_score: number; attempt_count: number; xp_earned: number }
  export function computeAttemptUpdate(
    existing: ExistingAttempt | null,
    score: number,
    xpReward: number,
    passThreshold: number,
  ): AttemptUpdate
  ```
  Task 4 gọi hàm này.

**Ngữ cảnh:** `index.ts` hiện cấp XP theo điều kiện `passed && !existing` — nếu attempt 1 fail (row đã tạo trong `lesson_progress`) thì attempt 2 pass sẽ không được XP. Tách quyết định ra hàm thuần để test được bảng trường hợp.

- [ ] **Step 1: Viết test thất bại**

Tạo `supabase/functions/grammar-submit/attemptUpdate.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeAttemptUpdate } from "./attemptUpdate.ts";

const XP = 30;
const PASS = 80;

test("lần đầu pass thì được XP", () => {
  const r = computeAttemptUpdate(null, 90, XP, PASS);
  assert.deepEqual(r, { best_score: 90, attempt_count: 1, xp_earned: XP });
});

test("lần đầu fail thì không XP", () => {
  const r = computeAttemptUpdate(null, 50, XP, PASS);
  assert.deepEqual(r, { best_score: 50, attempt_count: 1, xp_earned: 0 });
});

test("fail lần 1 rồi pass lần 2 vẫn được XP", () => {
  const r = computeAttemptUpdate({ best_score: 50, attempt_count: 1 }, 90, XP, PASS);
  assert.deepEqual(r, { best_score: 90, attempt_count: 2, xp_earned: XP });
});

test("đã pass rồi thì pass lại không được XP nữa", () => {
  const r = computeAttemptUpdate({ best_score: 90, attempt_count: 1 }, 100, XP, PASS);
  assert.deepEqual(r, { best_score: 100, attempt_count: 2, xp_earned: 0 });
});

test("làm lại điểm thấp hơn không hạ best_score và không mất XP", () => {
  const r = computeAttemptUpdate({ best_score: 90, attempt_count: 1 }, 50, XP, PASS);
  assert.deepEqual(r, { best_score: 90, attempt_count: 2, xp_earned: 0 });
});

test("đúng ngưỡng pass được tính là pass", () => {
  const r = computeAttemptUpdate(null, PASS, XP, PASS);
  assert.equal(r.xp_earned, XP);
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx tsx --test supabase/functions/grammar-submit/attemptUpdate.test.ts`
Expected: FAIL — không tìm thấy module `./attemptUpdate.ts`.

- [ ] **Step 3: Viết implementation**

Tạo `supabase/functions/grammar-submit/attemptUpdate.ts`:

```ts
export interface ExistingAttempt {
  best_score: number;
  attempt_count: number;
}

export interface AttemptUpdate {
  best_score: number;
  attempt_count: number;
  xp_earned: number;
}

/**
 * Decides the persisted state after one submission. XP is awarded the first
 * time the learner reaches the pass threshold, regardless of how many failed
 * attempts came before, and best_score never goes down.
 */
export function computeAttemptUpdate(
  existing: ExistingAttempt | null,
  score: number,
  xpReward: number,
  passThreshold: number,
): AttemptUpdate {
  const previousBest = existing?.best_score ?? 0;
  const reachedPassNow = score >= passThreshold && previousBest < passThreshold;

  return {
    best_score: Math.max(score, previousBest),
    attempt_count: (existing?.attempt_count ?? 0) + 1,
    xp_earned: reachedPassNow ? xpReward : 0,
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx tsx --test supabase/functions/grammar-submit/attemptUpdate.test.ts`
Expected: PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit/attemptUpdate.ts supabase/functions/grammar-submit/attemptUpdate.test.ts
git commit -m "$(cat <<'EOF'
feat(grammar): hàm thuần computeAttemptUpdate cho best_score và XP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `grammar-submit` lưu snapshot attempt

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts:65-91`

**Interfaces:**
- Consumes: `computeGrammarScore` (Task 2, có `exerciseResults`), `computeAttemptUpdate` (Task 3), bảng `grammar_attempts` (Task 1).
- Produces: response JSON có thêm `best_score: number`, `attempt_count: number`, `exerciseResults: Record<string, boolean>`. Task 8 và 9 đọc các field này.

**Ngữ cảnh:** hàm hiện tại tính xong `blankResults`/`choiceResults` rồi trả về client và vứt đi, chỉ upsert `lesson_progress.quiz_score = score`. Đây là nguyên nhân gốc của bug.

- [ ] **Step 1: Thêm import**

Ngay dưới dòng `import { computeGrammarScore } from "./scoring.ts";` thêm:

```ts
import { computeAttemptUpdate } from "./attemptUpdate.ts";
```

- [ ] **Step 2: Thay toàn bộ khối từ dòng 65 đến dòng 91**

Thay khối hiện tại (từ `const { total, score, blankResults, choiceResults } = ...` đến hết `return new Response(...)`) bằng:

```ts
    const { total, score, blankResults, choiceResults, exerciseResults } = computeGrammarScore(
      exercises,
      answers,
    );
    const passed = score >= PASS_THRESHOLD;

    const { data: existingAttempt } = await supabase
      .from("grammar_attempts")
      .select("best_score, attempt_count")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson_id)
      .maybeSingle();

    const update = computeAttemptUpdate(existingAttempt, score, XP_REWARD, PASS_THRESHOLD);

    await supabase.from("grammar_attempts").upsert(
      {
        lesson_id,
        user_id: user.id,
        answers,
        blank_results: blankResults,
        choice_results: choiceResults,
        exercise_results: exerciseResults,
        score,
        total,
        best_score: update.best_score,
        attempt_count: update.attempt_count,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,user_id" },
    );

    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id, category: "nguphap", quiz_score: update.best_score },
      { onConflict: "user_id,lesson_id,category" },
    );

    if (update.xp_earned > 0) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: update.xp_earned });
    }

    return new Response(
      JSON.stringify({
        score,
        total,
        passed,
        xp_earned: update.xp_earned,
        best_score: update.best_score,
        attempt_count: update.attempt_count,
        blankResults,
        choiceResults,
        exerciseResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
```

Ba thay đổi hành vi so với bản cũ, đều có chủ đích:
1. `lesson_progress.quiz_score` giờ nhận `best_score` thay vì `score` — làm lại điểm thấp không xóa trạng thái pass ở Roadmap.
2. XP cấp theo `computeAttemptUpdate` — fail rồi pass vẫn được XP.
3. Truy vấn `lesson_progress` để kiểm tra `existing` bị bỏ, thay bằng truy vấn `grammar_attempts` (nguồn sự thật mới cho attempt).

- [ ] **Step 3: Type check**

Run: `npm run lint`
Expected: PASS. Edge Function nằm ngoài `tsconfig` của app nên bước này chủ yếu xác nhận không làm hỏng phía frontend; kiểm tra bằng mắt rằng `index.ts` không còn tham chiếu biến `existing` cũ.

Run: `grep -n "existing" supabase/functions/grammar-submit/index.ts`
Expected: chỉ còn `existingAttempt`.

- [ ] **Step 4: Chạy lại test scoring và attemptUpdate**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts supabase/functions/grammar-submit/attemptUpdate.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts
git commit -m "$(cat <<'EOF'
fix(grammar): lưu snapshot attempt, dùng best_score và sửa điều kiện cấp XP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Codec `grammarAnswerCodec`

**Files:**
- Create: `src/lib/grammarAnswerCodec.ts`
- Test: `src/lib/grammarAnswerCodec.test.ts`

**Interfaces:**
- Consumes: `GrammarExercise` từ `src/lib/appTypes.ts`, `countBlankMarkers` từ `src/lib/grammarFillInBlank.ts`.
- Produces:
  ```ts
  export type ParsedAnswer =
    | { kind: "text"; value: string }
    | { kind: "blanks"; values: string[] }
    | { kind: "choice"; index: number | undefined }
    | { kind: "groups"; values: Record<string, string> };

  export function emptyAnswer(exercise: GrammarExercise): ParsedAnswer
  export function serializeAnswer(exercise: GrammarExercise, answer: ParsedAnswer): string
  export function parseAnswer(exercise: GrammarExercise, raw: string): ParsedAnswer
  ```
  Task 6 dùng `serializeAnswer`, Task 8 dùng `parseAnswer` + `emptyAnswer`.

**Ngữ cảnh:** logic serialize hiện nằm nội tuyến trong `GrammarExercisePage.getAnswerStringFor` (dòng 307-329). Task này trích ra và bổ sung chiều ngược lại. Đây là module quan trọng nhất của plan: codec sai thì đáp án hydrate ra sai, đúng cái bug đang sửa.

Quy ước chuỗi (phải giữ nguyên, vì `scoring.ts` phía server đã chấm theo đúng format này):
- `word_reorder`: các từ nối bằng dấu cách, **không trim**.
- `error_correction` / `translation` / `sentence_transformation` / `guided_sentence_writing`: chuỗi đã trim.
- `classification`: `"item:group|item:group"`; rỗng nếu thiếu bất kỳ item nào.
- `fill_in_the_blank`: `JSON.stringify(string[])`; rỗng nếu có blank nào trống.
- `multiple_choice`: index dạng chuỗi (`"0"`, `"1"`, ...); rỗng nếu chưa chọn.

Chuỗi rỗng `""` mang nghĩa "chưa trả lời" — page dùng nó để bật/tắt nút Nộp bài.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/grammarAnswerCodec.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { emptyAnswer, parseAnswer, serializeAnswer } from "./grammarAnswerCodec";
import type { GrammarExercise } from "./appTypes";

const base = (over: Partial<GrammarExercise>): GrammarExercise => ({
  id: "e1",
  lessonId: "l1",
  orderIndex: 0,
  type: "translation",
  explanation: "",
  ...over,
});

test("translation: round-trip giữ nguyên chuỗi đã trim", () => {
  const ex = base({ type: "translation" });
  const raw = "Ich lerne Deutsch";
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("translation: serialize trim khoảng trắng thừa", () => {
  const ex = base({ type: "translation" });
  assert.equal(serializeAnswer(ex, { kind: "text", value: "  Ich lerne  " }), "Ich lerne");
});

test("word_reorder: round-trip không trim", () => {
  const ex = base({ type: "word_reorder", tokens: ["Ich", "lerne"] });
  const raw = "Ich lerne";
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("multiple_choice: round-trip index", () => {
  const ex = base({ type: "multiple_choice", options: ["a", "b", "c"] });
  assert.deepEqual(parseAnswer(ex, "2"), { kind: "choice", index: 2 });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, "2")), "2");
});

test("multiple_choice: chưa chọn thì serialize ra chuỗi rỗng", () => {
  const ex = base({ type: "multiple_choice", options: ["a", "b"] });
  assert.equal(serializeAnswer(ex, { kind: "choice", index: undefined }), "");
});

test("multiple_choice: giá trị hỏng parse ra undefined thay vì NaN", () => {
  const ex = base({ type: "multiple_choice", options: ["a", "b"] });
  assert.deepEqual(parseAnswer(ex, "abc"), { kind: "choice", index: undefined });
  assert.deepEqual(parseAnswer(ex, ""), { kind: "choice", index: undefined });
  assert.deepEqual(parseAnswer(ex, "-1"), { kind: "choice", index: undefined });
});

test("fill_in_the_blank: round-trip mảng đáp án", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  const raw = JSON.stringify(["ein", "eine"]);
  assert.deepEqual(parseAnswer(ex, raw), { kind: "blanks", values: ["ein", "eine"] });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("fill_in_the_blank: thiếu một blank thì serialize ra chuỗi rỗng", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.equal(serializeAnswer(ex, { kind: "blanks", values: ["ein", "  "] }), "");
});

test("fill_in_the_blank: JSON hỏng parse ra mảng rỗng đúng số blank", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.deepEqual(parseAnswer(ex, "{not json"), { kind: "blanks", values: ["", ""] });
  assert.deepEqual(parseAnswer(ex, JSON.stringify([1, 2])), { kind: "blanks", values: ["", ""] });
});

test("classification: round-trip cặp item:group", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch", "die Lampe"],
    classificationGroups: ["maskulin", "feminin"],
  });
  const raw = "der Tisch:maskulin|die Lampe:feminin";
  assert.deepEqual(parseAnswer(ex, raw), {
    kind: "groups",
    values: { "der Tisch": "maskulin", "die Lampe": "feminin" },
  });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("classification: thiếu một item thì serialize ra chuỗi rỗng", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch", "die Lampe"],
    classificationGroups: ["maskulin", "feminin"],
  });
  assert.equal(serializeAnswer(ex, { kind: "groups", values: { "der Tisch": "maskulin" } }), "");
});

test("classification: chuỗi hỏng parse ra map rỗng thay vì crash", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch"],
    classificationGroups: ["maskulin"],
  });
  assert.deepEqual(parseAnswer(ex, "khong-co-dau-hai-cham"), { kind: "groups", values: {} });
});

test("emptyAnswer trả đúng kind cho từng loại", () => {
  assert.deepEqual(emptyAnswer(base({ type: "translation" })), { kind: "text", value: "" });
  assert.deepEqual(emptyAnswer(base({ type: "multiple_choice", options: ["a", "b"] })), {
    kind: "choice",
    index: undefined,
  });
  assert.deepEqual(
    emptyAnswer(base({ type: "fill_in_the_blank", promptText: "a ___ b ___" })),
    { kind: "blanks", values: ["", ""] },
  );
  assert.deepEqual(
    emptyAnswer(base({ type: "classification", classificationItems: ["x"] })),
    { kind: "groups", values: {} },
  );
});

test("mọi loại: serialize(emptyAnswer) là chuỗi rỗng", () => {
  const types: GrammarExercise["type"][] = [
    "word_reorder",
    "error_correction",
    "translation",
    "sentence_transformation",
    "guided_sentence_writing",
    "classification",
    "fill_in_the_blank",
    "multiple_choice",
  ];
  for (const type of types) {
    const ex = base({
      type,
      promptText: type === "fill_in_the_blank" ? "a ___ b" : "prompt",
      classificationItems: type === "classification" ? ["x"] : undefined,
      options: type === "multiple_choice" ? ["a", "b"] : undefined,
    });
    assert.equal(serializeAnswer(ex, emptyAnswer(ex)), "", `type ${type}`);
  }
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx tsx --test src/lib/grammarAnswerCodec.test.ts`
Expected: FAIL — không tìm thấy module `./grammarAnswerCodec`.

- [ ] **Step 3: Viết implementation**

Tạo `src/lib/grammarAnswerCodec.ts`:

```ts
import { GrammarExercise } from "./appTypes";
import { countBlankMarkers } from "./grammarFillInBlank";

/**
 * The wire format for one exercise answer, shared by the submit path and the
 * hydrate path. An empty string always means "not answered yet" — the page
 * uses that to gate the submit button, and the Edge Function grades it as wrong.
 */
export type ParsedAnswer =
  | { kind: "text"; value: string }
  | { kind: "blanks"; values: string[] }
  | { kind: "choice"; index: number | undefined }
  | { kind: "groups"; values: Record<string, string> };

export function emptyAnswer(exercise: GrammarExercise): ParsedAnswer {
  if (exercise.type === "fill_in_the_blank") {
    return { kind: "blanks", values: Array(countBlankMarkers(exercise.promptText ?? "")).fill("") };
  }
  if (exercise.type === "multiple_choice") return { kind: "choice", index: undefined };
  if (exercise.type === "classification") return { kind: "groups", values: {} };
  return { kind: "text", value: "" };
}

export function serializeAnswer(exercise: GrammarExercise, answer: ParsedAnswer): string {
  if (exercise.type === "fill_in_the_blank") {
    if (answer.kind !== "blanks") return "";
    const blankCount = countBlankMarkers(exercise.promptText ?? "");
    if (blankCount === 0 || answer.values.length !== blankCount) return "";
    if (answer.values.some((value) => !value.trim())) return "";
    return JSON.stringify(answer.values);
  }

  if (exercise.type === "multiple_choice") {
    if (answer.kind !== "choice" || answer.index === undefined) return "";
    return String(answer.index);
  }

  if (exercise.type === "classification") {
    if (answer.kind !== "groups") return "";
    const items = exercise.classificationItems ?? [];
    if (items.length === 0 || items.some((item) => !answer.values[item])) return "";
    return items.map((item) => `${item}:${answer.values[item]}`).join("|");
  }

  if (answer.kind !== "text") return "";
  // word_reorder is already a space-joined sentence; trimming it would not
  // change grading, but keeping it verbatim makes the round-trip exact.
  return exercise.type === "word_reorder" ? answer.value : answer.value.trim();
}

export function parseAnswer(exercise: GrammarExercise, raw: string): ParsedAnswer {
  if (exercise.type === "fill_in_the_blank") {
    const blankCount = countBlankMarkers(exercise.promptText ?? "");
    const fallback: ParsedAnswer = { kind: "blanks", values: Array(blankCount).fill("") };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback;
    }
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
      return fallback;
    }
    return { kind: "blanks", values: parsed as string[] };
  }

  if (exercise.type === "multiple_choice") {
    if (!/^\d+$/.test(raw)) return { kind: "choice", index: undefined };
    return { kind: "choice", index: Number(raw) };
  }

  if (exercise.type === "classification") {
    const values: Record<string, string> = {};
    for (const pair of raw.split("|")) {
      const separator = pair.indexOf(":");
      if (separator <= 0) continue;
      const item = pair.slice(0, separator).trim();
      const group = pair.slice(separator + 1).trim();
      if (item && group) values[item] = group;
    }
    return { kind: "groups", values };
  }

  return { kind: "text", value: raw };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx tsx --test src/lib/grammarAnswerCodec.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Type check và commit**

Run: `npm run lint`
Expected: PASS.

```bash
git add src/lib/grammarAnswerCodec.ts src/lib/grammarAnswerCodec.test.ts
git commit -m "$(cat <<'EOF'
feat(grammar): codec serialize/parse đáp án dùng chung cho 8 loại bài

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `GrammarExercisePage` dùng `serializeAnswer`

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx:307-334`

**Interfaces:**
- Consumes: `serializeAnswer`, `ParsedAnswer` (Task 5).
- Produces: không đổi API của page. `getAnswerStringFor` giữ nguyên chữ ký `(exercise: GrammarExercise) => string`.

**Ngữ cảnh:** đây là bước refactor thuần, **không đổi hành vi**. Mục đích là để đường serialize (lúc nộp) và đường parse (lúc hydrate ở Task 8) dùng chung một nguồn sự thật.

- [ ] **Step 1: Thêm import**

Thêm vào khối import ở đầu file:

```ts
import { serializeAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
```

- [ ] **Step 2: Thay `getAnswerStringFor`**

Thay toàn bộ hàm hiện tại (dòng 307-329) bằng:

```ts
  const getParsedAnswerFor = (exercise: GrammarExercise): ParsedAnswer => {
    if (exercise.type === "word_reorder") {
      const tokens = selectedTokensByExercise[exercise.id] ?? [];
      return { kind: "text", value: tokens.map((t) => t.split(":").slice(1).join(":")).join(" ") };
    }
    if (exercise.type === "classification") {
      return { kind: "groups", values: itemGroupsByExercise[exercise.id] ?? {} };
    }
    if (exercise.type === "fill_in_the_blank") {
      const blankCount = countBlankMarkers(exercise.promptText ?? "");
      return {
        kind: "blanks",
        values: blankAnswersByExercise[exercise.id] ?? Array(blankCount).fill(""),
      };
    }
    if (exercise.type === "multiple_choice") {
      return { kind: "choice", index: choiceByExercise[exercise.id] };
    }
    return { kind: "text", value: textAnswerByExercise[exercise.id] ?? "" };
  };

  const getAnswerStringFor = (exercise: GrammarExercise): string =>
    serializeAnswer(exercise, getParsedAnswerFor(exercise));
```

- [ ] **Step 3: Type check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Kiểm tra thủ công không đổi hành vi**

Run: `npm run dev`, mở một lesson có bài tập ngữ pháp.
Expected: nút "Nộp bài" vẫn bị khóa cho tới khi trả lời hết; nộp bài vẫn ra điểm như trước.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "$(cat <<'EOF'
refactor(grammar): page dùng serializeAnswer thay logic nội tuyến

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Hook `useGrammarAttempt`

**Files:**
- Create: `src/lib/hooks/useGrammarAttempt.ts`

**Interfaces:**
- Consumes: bảng `grammar_attempts` (Task 1), `supabase` client.
- Produces:
  ```ts
  export interface GrammarAttempt {
    answers: Record<string, string>;
    blankResults: Record<string, boolean[]>;
    choiceResults: Record<string, boolean>;
    exerciseResults: Record<string, boolean>;
    score: number;
    total: number;
    bestScore: number;
    attemptCount: number;
  }
  export function useGrammarAttempt(lessonId: string): {
    attempt: GrammarAttempt | null;
    loading: boolean;
  }
  ```
  Task 8 dùng hook này.

**Ngữ cảnh:** mirror `src/lib/hooks/useGrammarExercises.ts` — cùng cấu trúc `useState` + `useEffect` + `.then()`, cùng cách map snake_case của DB sang camelCase của app. RLS `own read` đã lọc theo user nên không cần điều kiện `user_id` trong query.

- [ ] **Step 1: Viết hook**

Tạo `src/lib/hooks/useGrammarAttempt.ts`:

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface GrammarAttempt {
  answers: Record<string, string>;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  score: number;
  total: number;
  bestScore: number;
  attemptCount: number;
}

/**
 * Loads the learner's saved grammar attempt for a lesson. RLS restricts the
 * table to the caller's own rows, so no user_id filter is needed here.
 */
export function useGrammarAttempt(lessonId: string): {
  attempt: GrammarAttempt | null;
  loading: boolean;
} {
  const [attempt, setAttempt] = useState<GrammarAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("grammar_attempts")
      .select("answers, blank_results, choice_results, exercise_results, score, total, best_score, attempt_count")
      .eq("lesson_id", lessonId)
      .maybeSingle()
      .then(({ data }) => {
        setAttempt(
          data
            ? {
                answers: (data.answers as Record<string, string> | null) ?? {},
                blankResults: (data.blank_results as Record<string, boolean[]> | null) ?? {},
                choiceResults: (data.choice_results as Record<string, boolean> | null) ?? {},
                exerciseResults: (data.exercise_results as Record<string, boolean> | null) ?? {},
                score: data.score as number,
                total: data.total as number,
                bestScore: data.best_score as number,
                attemptCount: data.attempt_count as number,
              }
            : null,
        );
        setLoading(false);
      });
  }, [lessonId]);

  return { attempt, loading };
}
```

- [ ] **Step 2: Type check**

Run: `npm run lint`
Expected: PASS. Nếu báo `grammar_attempts` không tồn tại trong type của `supabase.from(...)`, nghĩa là Task 1 Step 3 (`npm run gen:types`) chưa chạy — quay lại chạy nó, không sửa tay `database.types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useGrammarAttempt.ts
git commit -m "$(cat <<'EOF'
feat(grammar): hook useGrammarAttempt đọc lại attempt đã lưu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Hydrate card kết quả khi mở lại trang

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx` (khối state 286-296, `handleSubmit` 336-356, `handleRetry` 358-369, khối loading 371-380, card kết quả 393-444)

**Interfaces:**
- Consumes: `useGrammarAttempt` (Task 7), `parseAnswer` + `emptyAnswer` (Task 5), response mở rộng của `grammar-submit` (Task 4).
- Produces: `GrammarResult` có thêm `best_score: number` và `attempt_count: number` và `exerciseResults: Record<string, boolean>`. Task 9 dùng `exerciseResults`.

**Ngữ cảnh:** đây là task đóng bug chính. Hiện `result` khởi tạo `null` và chỉ được set trong `handleSubmit`, nên refresh là mất sạch.

- [ ] **Step 1: Mở rộng interface `GrammarResult`**

Thay interface ở dòng 29-36 bằng:

```ts
interface GrammarResult {
  score: number;
  total: number;
  passed: boolean;
  xp_earned: number;
  best_score: number;
  attempt_count: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
}
```

- [ ] **Step 2: Thêm import và hook**

**Thay** dòng import codec mà Task 6 đã thêm bằng dòng đầy đủ dưới đây, và thêm dòng import hook:

```ts
import { emptyAnswer, parseAnswer, serializeAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
import { useGrammarAttempt } from "../lib/hooks/useGrammarAttempt";
```

Ngay dưới dòng `const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);` thêm:

```ts
  const { attempt, loading: attemptLoading } = useGrammarAttempt(lesson.id);
```

- [ ] **Step 3: Thêm cờ `retrying` và effect hydrate**

Ngay dưới dòng `const [result, setResult] = useState<GrammarResult | null>(null);` thêm:

```ts
  // Set when the learner hits "Làm lại": keeps the hydrate effect from pouring
  // the saved attempt back into the form they just cleared.
  const [retrying, setRetrying] = useState(false);
```

Sau các khai báo state, thêm effect (đặt ngay trước `const toggleToken = ...`):

```ts
  React.useEffect(() => {
    if (!attempt || retrying || exercises.length === 0) return;

    setResult({
      score: attempt.score,
      total: attempt.total,
      passed: attempt.score >= 80,
      xp_earned: 0,
      best_score: attempt.bestScore,
      attempt_count: attempt.attemptCount,
      blankResults: attempt.blankResults,
      choiceResults: attempt.choiceResults,
      exerciseResults: attempt.exerciseResults,
    });

    const textAnswers: Record<string, string> = {};
    const blankAnswers: Record<string, string[]> = {};
    const itemGroups: Record<string, Record<string, string>> = {};
    const choices: Record<string, number> = {};

    for (const exercise of exercises) {
      const raw = attempt.answers[exercise.id];
      const parsed: ParsedAnswer =
        raw === undefined ? emptyAnswer(exercise) : parseAnswer(exercise, raw);
      if (parsed.kind === "text") textAnswers[exercise.id] = parsed.value;
      else if (parsed.kind === "blanks") blankAnswers[exercise.id] = parsed.values;
      else if (parsed.kind === "groups") itemGroups[exercise.id] = parsed.values;
      else if (parsed.index !== undefined) choices[exercise.id] = parsed.index;
    }

    setTextAnswerByExercise(textAnswers);
    setBlankAnswersByExercise(blankAnswers);
    setItemGroupsByExercise(itemGroups);
    setChoiceByExercise(choices);
  }, [attempt, retrying, exercises]);
```

Lưu ý về `word_reorder`: `parsed.kind` là `"text"` nên câu đã ghép vào `textAnswerByExercise`, dùng để hiển thị ở Task 9. `selectedTokensByExercise` **cố ý không** khôi phục vì index token gốc đã mất trong chuỗi đã ghép — không ảnh hưởng card kết quả, và bấm "Làm lại" thì form vốn phải trắng.

`passed` tính lại bằng `attempt.score >= 80` thay vì đọc từ DB: ngưỡng 80 đã cố định trong `PASS_THRESHOLD` phía server và trong copy tiếng Việt của trang.

- [ ] **Step 4: Cập nhật `handleSubmit` và `handleRetry`**

Trong `handleSubmit`, sau `setResult(res);` thêm:

```ts
    setRetrying(false);
```

Trong `handleRetry`, thêm vào cùng khối reset:

```ts
    setRetrying(true);
```

- [ ] **Step 5: Chặn nháy form trắng lúc đang tải**

Thay điều kiện loading ở dòng 371 từ `if (exercisesLoading) {` thành:

```ts
  if (exercisesLoading || attemptLoading) {
```

Không có bước này, trang hiện form trắng một nhịp rồi mới nhảy sang card kết quả — trông y hệt bug đang sửa.

- [ ] **Step 6: Thêm dòng best score vào card kết quả**

Trong khối `<div className="p-6 bg-slate-50/50 ...">`, ngay sau `<div className="flex items-baseline justify-center gap-1.5 mt-1">...</div>`, thêm:

```tsx
          <p className="text-[11px] text-slate-500 mt-1.5">
            Điểm cao nhất: <b className="text-slate-700">{result.best_score}%</b> · Đã làm{" "}
            <b className="text-slate-700">{result.attempt_count}</b> lần
          </p>
```

Giữ nguyên mặt 😟 và badge "Chưa đạt chuẩn 80%" khi lần gần nhất fail dù `best_score` đã pass — phản ánh trung thực lần vừa nộp, còn dòng vừa thêm cho biết bài vẫn đã pass.

- [ ] **Step 7: Type check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8: Kiểm tra thủ công theo đúng bug report**

Run: `npm run dev`

1. Làm bài, nộp đạt ≥ 80% → thấy card kết quả, có dòng "Điểm cao nhất: X% · Đã làm 1 lần".
2. Refresh trang → **vẫn thấy card kết quả**, không về form trắng. Đây là điều kiện nghiệm thu chính.
3. Bấm "Làm lại bài Test" → form trắng, không bị nạp đè.
4. Nộp lần 2 điểm thấp hơn → refresh → thấy điểm lần 2, "Điểm cao nhất" vẫn là điểm cũ, "Đã làm 2 lần".
5. Mở Roadmap → lesson vẫn hiển thị đã hoàn thành.

- [ ] **Step 9: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "$(cat <<'EOF'
fix(grammar): hydrate card kết quả từ attempt đã lưu sau khi refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Hiện đáp án đã nhập cho cả 8 loại trong card kết quả

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx:456-494` (khối render từng bài trong card kết quả)

**Interfaces:**
- Consumes: `result.exerciseResults` (Task 8), `textAnswerByExercise` / `itemGroupsByExercise` đã hydrate (Task 8).
- Produces: không có interface mới.

**Ngữ cảnh:** card kết quả hiện chỉ render đáp án đã nhập cho `fill_in_the_blank` và `multiple_choice`. Sáu loại còn lại chỉ hiện đề bài + giải thích, nên khi pass 100% một lesson toàn bài dịch, học viên không thấy "kết quả đúng" như bug report yêu cầu.

- [ ] **Step 1: Thêm component hiển thị đáp án**

Thêm ngay trên `export const GrammarExercisePage`:

```tsx
/** Read-only echo of what the learner typed, tinted by whether it was graded correct. */
const SubmittedAnswer: React.FC<{ value: string; correct: boolean | undefined }> = ({
  value,
  correct,
}) => (
  <div
    className={`mb-2 rounded-lg border px-2.5 py-2 text-xs font-medium whitespace-pre-wrap ${
      correct === true
        ? "border-green-300 bg-green-50 text-green-800"
        : correct === false
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
    }`}
  >
    <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
      Bài làm của bạn
    </span>
    {value.trim() ? value : "— chưa trả lời —"}
  </div>
);
```

- [ ] **Step 2: Render cho 5 loại text**

Trong card kết quả, ngay trước nhánh `{ex.type === "fill_in_the_blank" && (`, thêm:

```tsx
                    {(ex.type === "word_reorder"
                      || ex.type === "error_correction"
                      || ex.type === "translation"
                      || ex.type === "sentence_transformation"
                      || ex.type === "guided_sentence_writing") && (
                      <SubmittedAnswer
                        value={textAnswerByExercise[ex.id] ?? ""}
                        correct={result.exerciseResults?.[ex.id]}
                      />
                    )}
```

- [ ] **Step 3: Render cho classification**

Ngay sau khối vừa thêm:

```tsx
                    {ex.type === "classification" && (
                      <div className="mb-2 space-y-1">
                        {(ex.classificationItems ?? []).map((item) => (
                          <div key={item} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-slate-700">{item}</span>
                            <span
                              className={`rounded-md border px-2 py-1 font-bold ${
                                result.exerciseResults?.[ex.id]
                                  ? "border-green-300 bg-green-50 text-green-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {itemGroupsByExercise[ex.id]?.[item] ?? "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
```

Màu ở đây theo `exerciseResults` (đúng cả bài), không theo từng item: `scoring.ts` chấm từng item để tính điểm nhưng chỉ trả boolean cho cả bài. Khi sai một item, toàn khối để màu trung tính thay vì tô đỏ hết — không chỉ đích danh item nào sai, giữ đúng nguyên tắc không lộ đáp án.

- [ ] **Step 4: Type check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Kiểm tra thủ công**

Run: `npm run dev`

Mở một lesson có bài dịch hoặc sắp xếp từ, nộp bài với vài câu đúng vài câu sai, xem card kết quả:
- Câu đúng: khối "Bài làm của bạn" nền xanh.
- Câu sai: nền đỏ, và **không** hiện đáp án đúng ở bất kỳ đâu.
- Refresh trang: các khối này vẫn hiện đầy đủ.

- [ ] **Step 6: Chạy toàn bộ test và commit**

Run:
```bash
npx tsx --test src/lib/grammarAnswerCodec.test.ts src/lib/grammarExerciseGroups.test.ts src/lib/grammarFillInBlank.test.ts src/lib/grammarMultipleChoice.test.ts supabase/functions/grammar-submit/scoring.test.ts supabase/functions/grammar-submit/attemptUpdate.test.ts
```
Expected: PASS toàn bộ.

Run: `npm run lint`
Expected: PASS.

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "$(cat <<'EOF'
feat(grammar): card kết quả hiện bài làm đã nộp cho cả 8 loại

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Ngoài scope

- `useUserStats`, `completion.ts`, Roadmap, Dashboard — đọc `lesson_progress.quiz_score`, giờ chứa `best_score`, nên tự đúng.
- View `grammar_exercises_public`, bảng `writing_submissions`.
- `quiz-submit` (category `nghe` / `doc`) có đúng cùng bug — việc nối tiếp, không làm lần này.
