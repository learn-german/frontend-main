# Phase 3a — Admin Shared Exercise Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin có thể tạo/sửa đủ 10 loại câu hỏi (kèm group/hint/word-bank/kéo-thả) cho nghe/đọc, dùng chung toàn bộ `AdminGrammarExerciseSection.tsx` thay vì form riêng trong `AdminQuizSection.tsx`.

**Architecture:** Trích `EditForm`/`validateForm`/`buildPayload`/helper thuần từ `AdminGrammarExerciseSection.tsx` sang `src/lib/grammarExerciseForm.ts`, mở rộng phủ `text_fill_blank`+`matching`. `AdminGrammarExerciseSection` nhận prop `category`, tự lọc dữ liệu theo category (sửa luôn bug lọc thiếu) và tự quản lý media (clip/đoạn văn) khi category khác `"nguphap"`. `AdminQuizSection.tsx` sau cùng chỉ còn tab switcher + mount component chung 3 lần.

**Tech Stack:** React 19 + TypeScript 5.8. Test bằng `node:test` qua `npx tsx --test <path>`.

## Global Constraints

- Không dùng `any`.
- Ngữ pháp (`category="nguphap"`) không đổi hành vi hiện có.
- Không đổi schema DB — `audio_clip_id`/`reading_passage_id` trên `grammar_exercises`, `category` trên `exercise_sets` đã có sẵn.
- Không đổi Phase 1/2 (`ExerciseAnswerInput.tsx`, `ExerciseResultReview.tsx`, `QuizSetListPage.tsx`, `GrammarExercisePage.tsx`, `grammar-submit` edge function) — thuộc phạm vi Phase 3b.
- Chạy `npm run lint` sau mỗi task đụng TypeScript.
- Dropdown chọn loại câu hỏi hiện đủ 10 loại cho cả 3 category, không lọc theo category.

---

### Task 1: Trích form logic sang `src/lib/grammarExerciseForm.ts`, mở rộng 10 loại

**Files:**
- Create: `src/lib/grammarExerciseForm.ts`
- Test: `src/lib/grammarExerciseForm.test.ts`

**Interfaces:**
- Consumes: `countBlankMarkers`, `normalizeBlankDefinitions`, `type BlankDefinition` từ `./grammarFillInBlank`; `buildMultipleChoicePayload`, `createEmptyChoiceForm`, `validateChoiceForm` từ `./grammarMultipleChoice`; `serializeMatching`, `countBlankTokens` từ `./quizAnswerCodec`.
- Produces: `type EditForm` (10 loại: `word_reorder | error_correction | translation | sentence_transformation | guided_sentence_writing | classification | fill_in_the_blank | multiple_choice | text_fill_blank | matching`, có field `matching_pairs: {de:string; vi:string}[]`), `EMPTY_FORM: EditForm`, `validateForm(f: EditForm): string | null`, `buildPayload(form: EditForm): object` (có field `matching_pairs`), `addGroupToForm/setGroupInForm/removeGroupFromForm/addItemToForm/setItemInForm/removeItemFromForm/addPairToForm/setPairInForm/removePairFromForm` (tất cả `(f: EditForm, ...) => EditForm`).

- [ ] **Step 1: Viết test trước (chỉ phần mới — text_fill_blank/matching) — `src/lib/grammarExerciseForm.test.ts`:**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FORM, validateForm, buildPayload, type EditForm } from "./grammarExerciseForm";

const textFillBlankForm = (overrides: Partial<EditForm> = {}): EditForm => ({
  ...EMPTY_FORM,
  type: "text_fill_blank",
  prompt_text: "Ich {{bin|Bin}} Student.",
  ...overrides,
});

const matchingForm = (overrides: Partial<EditForm> = {}): EditForm => ({
  ...EMPTY_FORM,
  type: "matching",
  prompt_text: "Ghép từ với nghĩa.",
  matching_pairs: [{ de: "der Tisch", vi: "cái bàn" }],
  ...overrides,
});

test("validateForm: text_fill_blank thiếu {{...}} thì báo lỗi", () => {
  assert.equal(
    validateForm(textFillBlankForm({ prompt_text: "Không có ô trống." })),
    "Cần ít nhất 1 ô trống {{...}}.",
  );
});

test("validateForm: text_fill_blank thiếu prompt_text thì báo lỗi", () => {
  assert.equal(
    validateForm(textFillBlankForm({ prompt_text: "" })),
    "Nội dung câu hỏi không được để trống.",
  );
});

test("validateForm: text_fill_blank có {{...}} thì hợp lệ", () => {
  assert.equal(validateForm(textFillBlankForm()), null);
});

test("validateForm: matching thiếu cặp hợp lệ thì báo lỗi", () => {
  assert.equal(
    validateForm(matchingForm({ matching_pairs: [{ de: "", vi: "" }] })),
    "Cần ít nhất 1 cặp ghép hợp lệ.",
  );
});

test("validateForm: matching có ít nhất 1 cặp hợp lệ thì hợp lệ", () => {
  assert.equal(validateForm(matchingForm()), null);
});

test("buildPayload: text_fill_blank lưu prompt_text, correct_answer null", () => {
  const payload = buildPayload(textFillBlankForm());
  assert.equal(payload.prompt_text, "Ich {{bin|Bin}} Student.");
  assert.equal(payload.correct_answer, null);
});

test("buildPayload: matching serialize matching_pairs vào correct_answer, bỏ cặp rỗng", () => {
  const payload = buildPayload(matchingForm({
    matching_pairs: [{ de: "der Tisch", vi: "cái bàn" }, { de: "", vi: "" }],
  }));
  assert.equal(payload.correct_answer, "der Tisch:cái bàn");
  assert.deepEqual(payload.matching_pairs, [{ de: "der Tisch", vi: "cái bàn" }]);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** (module `./grammarExerciseForm` chưa tồn tại)

Run: `npx tsx --test src/lib/grammarExerciseForm.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Tạo `src/lib/grammarExerciseForm.ts`** — nội dung đầy đủ (di chuyển nguyên logic từ `AdminGrammarExerciseSection.tsx` dòng 108-284, mở rộng 2 loại mới):

```ts
import {
  countBlankMarkers,
  normalizeBlankDefinitions,
  type BlankDefinition,
} from "./grammarFillInBlank";
import {
  buildMultipleChoicePayload,
  createEmptyChoiceForm,
  validateChoiceForm,
} from "./grammarMultipleChoice";
import { serializeMatching, countBlankTokens } from "./quizAnswerCodec";

export interface EditForm {
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank"
    | "multiple_choice"
    | "text_fill_blank"
    | "matching";
  prompt_text: string;
  transformation_hint: string;
  correct_answer: string;
  acceptable_answers: string[];
  tokens_input: string;
  classification_groups: string[];
  classification_items: { item: string; group: string }[];
  blanks: BlankDefinition[];
  options: string[];
  correct_option_index: number;
  matching_pairs: { de: string; vi: string }[];
  explanation: string;
  order_index: number;
}

export const EMPTY_FORM: EditForm = {
  type: "word_reorder",
  prompt_text: "",
  transformation_hint: "",
  correct_answer: "",
  acceptable_answers: [],
  tokens_input: "",
  classification_groups: [],
  classification_items: [],
  blanks: [],
  options: createEmptyChoiceForm().options,
  correct_option_index: -1,
  matching_pairs: [{ de: "", vi: "" }],
  explanation: "",
  order_index: 0,
};

const normalizeWord = (s: string): string => s.toLowerCase().replace(/[.,!?]/g, "").trim();

export const validateForm = (f: EditForm): string | null => {
  if (f.type === "word_reorder") {
    const tokens = f.tokens_input.split("/").map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) return "Cần ít nhất 2 từ.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    const answerWords = f.correct_answer.split(/\s+/).map(normalizeWord).filter(Boolean).sort();
    const tokenWords = tokens.flatMap((t) => t.split(/\s+/)).map(normalizeWord).filter(Boolean).sort();
    if (JSON.stringify(answerWords) !== JSON.stringify(tokenWords)) {
      return "Các từ cho sẵn không khớp với câu đúng — kiểm tra lại chính tả.";
    }
    return null;
  }
  if (f.type === "error_correction") {
    if (!f.prompt_text.trim()) return "Câu sai không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    if (f.prompt_text.trim() === f.correct_answer.trim()) return "Câu sai và câu đúng giống nhau — không có lỗi để sửa.";
    return null;
  }
  if (f.type === "translation") {
    if (!f.prompt_text.trim()) return "Câu tiếng Việt không được để trống.";
    if (!f.correct_answer.trim()) return "Câu tiếng Đức không được để trống.";
    return null;
  }
  if (f.type === "sentence_transformation") {
    if (!f.prompt_text.trim()) return "Câu gốc không được để trống.";
    if (!f.transformation_hint.trim()) return "Yêu cầu biến đổi không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng sau biến đổi không được để trống.";
    return null;
  }
  if (f.type === "guided_sentence_writing") {
    if (!f.prompt_text.trim()) return "Dữ liệu gợi ý không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    return null;
  }
  if (f.type === "multiple_choice") {
    return validateChoiceForm(f.prompt_text, { options: f.options, correctIndex: f.correct_option_index });
  }
  if (f.type === "fill_in_the_blank") {
    const blankCount = countBlankMarkers(f.prompt_text);
    if (blankCount < 1) return "Cần ít nhất 1 marker ___.";
    if (f.blanks.length !== blankCount) return "Số editor đáp án phải khớp số marker ___.";
    if (!normalizeBlankDefinitions(f.blanks)) return "Mỗi ô trống cần ít nhất 1 đáp án hợp lệ.";
    return null;
  }
  if (f.type === "text_fill_blank") {
    if (!f.prompt_text.trim()) return "Nội dung câu hỏi không được để trống.";
    if (countBlankTokens(f.prompt_text) < 1) return "Cần ít nhất 1 ô trống {{...}}.";
    return null;
  }
  if (f.type === "matching") {
    if (!f.prompt_text.trim()) return "Nội dung câu hỏi không được để trống.";
    const validPairs = f.matching_pairs.filter((p) => p.de.trim() && p.vi.trim());
    if (validPairs.length === 0) return "Cần ít nhất 1 cặp ghép hợp lệ.";
    return null;
  }
  // classification
  const groups = f.classification_groups.map((g) => g.trim()).filter(Boolean);
  const uniqueGroups = new Set(groups.map((g) => g.toLowerCase()));
  if (groups.length < 2 || uniqueGroups.size !== groups.length) {
    return "Cần ít nhất 2 nhóm phân loại, không trùng tên.";
  }
  if (f.classification_items.length === 0 || f.classification_items.some((it) => !it.item.trim())) {
    return "Cần ít nhất 1 item để phân loại.";
  }
  if (f.classification_items.some((it) => !groups.includes(it.group))) {
    return "Mỗi item phải thuộc một nhóm hợp lệ.";
  }
  return null;
};

export const buildPayload = (form: EditForm) => {
  const choicePayload = buildMultipleChoicePayload({
    options: form.options,
    correctIndex: form.correct_option_index,
  });
  const validMatchingPairs = form.matching_pairs.filter((p) => p.de.trim() && p.vi.trim());
  return {
    type: form.type,
    prompt_text: form.type === "word_reorder" || form.type === "classification" ? null : form.prompt_text,
    transformation_hint: form.type === "sentence_transformation" ? form.transformation_hint : null,
    correct_answer:
      form.type === "classification" || form.type === "fill_in_the_blank" || form.type === "text_fill_blank"
        ? null
        : form.type === "multiple_choice"
          ? choicePayload.correct_answer
          : form.type === "matching"
            ? serializeMatching(Object.fromEntries(validMatchingPairs.map((p) => [p.de, p.vi])))
            : form.correct_answer,
    acceptable_answers:
      form.type === "translation"
        ? form.acceptable_answers.map((a) => a.trim()).filter(Boolean)
        : null,
    tokens:
      form.type === "word_reorder"
        ? form.tokens_input.split("/").map((t) => t.trim()).filter(Boolean)
        : null,
    classification_groups:
      form.type === "classification" ? form.classification_groups.map((g) => g.trim()).filter(Boolean) : null,
    classification_items:
      form.type === "classification" ? form.classification_items.filter((it) => it.item.trim()) : null,
    blanks: form.type === "fill_in_the_blank" ? normalizeBlankDefinitions(form.blanks) : null,
    options: form.type === "multiple_choice" ? choicePayload.options : null,
    matching_pairs: form.type === "matching" ? validMatchingPairs : null,
    explanation: form.explanation,
    order_index: form.order_index,
  };
};

export const addGroupToForm = (f: EditForm): EditForm => ({ ...f, classification_groups: [...f.classification_groups, ""] });

export const setGroupInForm = (f: EditForm, i: number, val: string): EditForm => {
  const groups = [...f.classification_groups];
  const oldVal = groups[i];
  groups[i] = val;
  return {
    ...f,
    classification_groups: groups,
    classification_items: f.classification_items.map((it) => (it.group === oldVal ? { ...it, group: val } : it)),
  };
};

export const removeGroupFromForm = (f: EditForm, i: number): EditForm => {
  const removed = f.classification_groups[i];
  return {
    ...f,
    classification_groups: f.classification_groups.filter((_, idx) => idx !== i),
    classification_items: f.classification_items.map((it) => (it.group === removed ? { ...it, group: "" } : it)),
  };
};

export const addItemToForm = (f: EditForm): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group: f.classification_groups[0] ?? "" }],
});

export const setItemInForm = (f: EditForm, i: number, key: "item" | "group", val: string): EditForm => {
  const items = [...f.classification_items];
  items[i] = { ...items[i], [key]: val };
  return { ...f, classification_items: items };
};

export const removeItemFromForm = (f: EditForm, i: number): EditForm => ({
  ...f,
  classification_items: f.classification_items.filter((_, idx) => idx !== i),
});

export const addPairToForm = (f: EditForm): EditForm => ({
  ...f,
  matching_pairs: [...f.matching_pairs, { de: "", vi: "" }],
});

export const setPairInForm = (f: EditForm, i: number, key: "de" | "vi", val: string): EditForm => {
  const pairs = [...f.matching_pairs];
  pairs[i] = { ...pairs[i], [key]: val };
  return { ...f, matching_pairs: pairs };
};

export const removePairFromForm = (f: EditForm, i: number): EditForm => ({
  ...f,
  matching_pairs: f.matching_pairs.filter((_, idx) => idx !== i),
});
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx tsx --test src/lib/grammarExerciseForm.test.ts`
Expected: PASS toàn bộ 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grammarExerciseForm.ts src/lib/grammarExerciseForm.test.ts
git commit -m "feat: trích form logic sang lib dùng chung, mở rộng text_fill_blank/matching"
```

---

### Task 2: Wire `AdminGrammarExerciseSection.tsx` dùng lib mới + thêm 2 loại vào `ExerciseEntryFields`

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: mọi export từ `../../lib/grammarExerciseForm` (Task 1).
- Produces: `ExerciseEntryFields` render đủ 10 loại; `GrammarExercise` interface có field `matching_pairs`.

- [ ] **Step 1: Sửa import** — dòng 11-45, thay khối `grammarMultipleChoice` import và thêm import lib mới:

Xoá khỏi import `grammarFillInBlank` (dòng 26-34): `countBlankMarkers`, `normalizeBlankDefinitions` (giữ lại `normalizeWordBank`, `syncBlankDefinitions`, `type BlankDefinition`, `type WordBank`, `type WordBankMode`).

Xoá khỏi import `grammarMultipleChoice` (dòng 35-45): `buildMultipleChoicePayload`, `createEmptyChoiceForm`, `validateChoiceForm` (giữ lại `addOption`, `moveOption`, `optionLabel`, `parseCorrectIndex`, `removeOption`, `setOption`).

Thêm ngay sau import `grammarMultipleChoice`:

```ts
import {
  type EditForm,
  EMPTY_FORM,
  validateForm,
  buildPayload,
  addGroupToForm,
  setGroupInForm,
  removeGroupFromForm,
  addItemToForm,
  setItemInForm,
  removeItemFromForm,
  addPairToForm,
  setPairInForm,
  removePairFromForm,
} from "../../lib/grammarExerciseForm";
```

- [ ] **Step 2: Xoá định nghĩa cục bộ đã chuyển sang lib** — xoá nguyên khối dòng 108-284 của file gốc: `export interface EditForm {...}` (108-122), `export const EMPTY_FORM: EditForm = {...}` (132-146), `normalizeWord` (153), `validateForm` (155-212), `buildPayload` (214-246), `addGroupToForm`/`setGroupInForm`/`removeGroupFromForm`/`addItemToForm`/`setItemInForm`/`removeItemFromForm` (248-284). Giữ nguyên `ModalMode`/`AppendContext` interface (124-130) và `inputBaseCls`/`inputCls`/`labelCls` (148-151) — không thuộc khối bị xoá.

- [ ] **Step 3: Thêm `matching_pairs` vào `GrammarExercise` interface** (dòng 47-58) — thêm dòng sau `options: string[] | null;`:

```ts
  matching_pairs: { de: string; vi: string }[] | null;
```

Và mở rộng `type` union (dòng 50-58) thêm 2 giá trị:

```ts
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank"
    | "multiple_choice"
    | "text_fill_blank"
    | "matching";
```

- [ ] **Step 4: Thêm 2 entry vào `TYPE_LABELS`/`TYPE_COLORS`** (dòng 86-106):

```ts
const TYPE_LABELS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp từ",
  error_correction: "Sửa câu sai",
  translation: "Dịch",
  sentence_transformation: "Biến đổi câu",
  guided_sentence_writing: "Viết câu gợi ý",
  classification: "Phân loại",
  fill_in_the_blank: "Điền vào ô trống",
  multiple_choice: "Trắc nghiệm",
  text_fill_blank: "Điền vào chỗ trống",
  matching: "Ghép cặp",
};

const TYPE_COLORS: Record<GrammarExercise["type"], string> = {
  word_reorder: "bg-blue-50 text-blue-700",
  error_correction: "bg-rose-50 text-rose-700",
  translation: "bg-emerald-50 text-emerald-700",
  sentence_transformation: "bg-purple-50 text-purple-700",
  guided_sentence_writing: "bg-amber-50 text-amber-700",
  classification: "bg-teal-50 text-teal-700",
  fill_in_the_blank: "bg-orange-50 text-orange-700",
  multiple_choice: "bg-indigo-50 text-indigo-700",
  text_fill_blank: "bg-fuchsia-50 text-fuchsia-700",
  matching: "bg-cyan-50 text-cyan-700",
};
```

- [ ] **Step 5: Thêm 2 nhánh JSX vào `ExerciseEntryFields`** — chèn ngay trước khối `{entry.type === "classification" && (` (dòng 797 trong file gốc, nay dịch xuống do Step 2 xoá bớt code phía trên):

```tsx
    {entry.type === "text_fill_blank" && (
      <div>
        <label className={labelCls}>Nội dung câu (có chỗ trống) *</label>
        <textarea
          rows={4}
          value={entry.prompt_text}
          onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
          className={inputCls + " resize-none"}
          placeholder="Ich {{bin|Bin}} Student."
        />
        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
          Đánh dấu chỗ trống bằng <code className="bg-slate-100 px-1 rounded">{"{{đáp_án}}"}</code>, nhiều biến thể đúng cách nhau bởi <code className="bg-slate-100 px-1 rounded">|</code>.
        </p>
      </div>
    )}

    {entry.type === "matching" && (
      <>
        <div>
          <label className={labelCls}>Nội dung câu hỏi *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ghép từ tiếng Đức với nghĩa tiếng Việt"
          />
        </div>
        <div>
          <label className={labelCls}>Các cặp ghép đôi *</label>
          <div className="space-y-2">
            {entry.matching_pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={pair.de}
                  onChange={(e) => onChange((prev) => setPairInForm(prev, i, "de", e.target.value))}
                  className={inputCls + " flex-1"}
                  placeholder="Tiếng Đức"
                />
                <span className="text-slate-300">↔</span>
                <input
                  type="text"
                  value={pair.vi}
                  onChange={(e) => onChange((prev) => setPairInForm(prev, i, "vi", e.target.value))}
                  className={inputCls + " flex-1"}
                  placeholder="Tiếng Việt"
                />
                {entry.matching_pairs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange((prev) => removePairFromForm(prev, i))}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange(addPairToForm)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm cặp
            </button>
          </div>
        </div>
      </>
    )}

```

- [ ] **Step 6: Hydrate `matching_pairs` khi mở sửa câu hỏi có sẵn** — trong `openEdit` (khối `setEntries([{ ... }])`, gốc dòng 979-995), thêm dòng sau `options: ex.options ?? [],`:

```ts
        matching_pairs: ex.matching_pairs ?? [{ de: "", vi: "" }],
```

- [ ] **Step 7: `npm run lint` phải pass** — 0 lỗi TypeScript.

- [ ] **Step 8: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (124 test cũ + 7 test mới của Task 1 = 131).

- [ ] **Step 9: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat: AdminGrammarExerciseSection hỗ trợ đủ 10 loại câu hỏi"
```

---

### Task 3: `AdminGrammarExerciseSection` nhận prop `category`, sửa bug lọc + `createSet`

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Produces: `AdminGrammarExerciseSection: React.FC<{ category: "nguphap" | "nghe" | "doc" }>`.

- [ ] **Step 1: Đổi signature component** (dòng 889 gốc):

```ts
export const AdminGrammarExerciseSection: React.FC<{
  category: "nguphap" | "nghe" | "doc";
}> = ({ category }) => {
```

- [ ] **Step 2: Sửa `fetchExercises` lọc theo category** (dòng 920-948 gốc) — thay:

```ts
  const fetchExercises = async () => {
    const [exercisesRes, lessonsRes] = await Promise.all([
      supabase.from("grammar_exercises").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);
```

thành:

```ts
  const fetchExercises = async () => {
    const [setsRes, lessonsRes] = await Promise.all([
      supabase.from("exercise_sets").select("id").eq("category", category),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);
    const setIds = (setsRes.data ?? []).map((s) => s.id as string);
    const exercisesRes = setIds.length > 0
      ? await supabase
          .from("grammar_exercises")
          .select("*")
          .in("set_id", setIds)
          .order("lesson_id")
          .order("order_index")
      : { data: [] as unknown[] };
```

(phần còn lại của hàm — `exercisesByLesson`, `grouped`, `setGroups`, `setSelectedIds`, `setLoading(false)` — giữ nguyên, không đổi.)

- [ ] **Step 3: `createSet` dùng `category` thay vì hardcode** — trong `handleSave`, tìm dòng `const setResult = await createSet(editLessonId, "nguphap", createStartOrder);` (gốc dòng 1091), sửa thành:

```ts
      const setResult = await createSet(editLessonId, category, createStartOrder);
```

- [ ] **Step 4: Thêm `category` vào dependency của `useEffect` gọi `fetchExercises`** — tìm `useEffect(() => { fetchExercises(); }, []);` (gốc dòng 950-952), sửa thành:

```ts
  useEffect(() => {
    fetchExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);
```

- [ ] **Step 5: Cập nhật call site "Ngữ pháp" trong `AdminQuizSection.tsx`** — tìm `<AdminGrammarExerciseSection />` (dòng 536), sửa thành:

```tsx
        <AdminGrammarExerciseSection category="nguphap" />
```

- [ ] **Step 6: `npm run lint` phải pass.**

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx src/pages/admin/AdminQuizSection.tsx
git commit -m "fix: AdminGrammarExerciseSection lọc câu hỏi theo category, không còn lẫn nghe/đọc vào ngữ pháp"
```

---

### Task 4: Trích `ClipRow`/`PassageEditRow` sang file riêng

**Files:**
- Create: `src/pages/admin/AdminExerciseSetMedia.tsx`
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Produces: `export interface ListeningClip { id, lesson_id, r2_key, order_index }`, `export interface ReadingPassage { id, lesson_id, text_de, order_index }`, `export const ClipRow: React.FC<{lessonId, clip: ListeningClip, index: number, onDelete}>`, `export const PassageEditRow: React.FC<{passage: ReadingPassage, index: number, saving: boolean, onSave, onDelete}>`.

- [ ] **Step 1: Tạo `src/pages/admin/AdminExerciseSetMedia.tsx`** — di chuyển nguyên nội dung từ `AdminQuizSection.tsx` dòng 29-41 (2 interface) và dòng 133-188 (2 component):

```tsx
import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";

export interface ListeningClip {
  id: string;
  lesson_id: string;
  r2_key: string;
  order_index: number;
}

export interface ReadingPassage {
  id: string;
  lesson_id: string;
  text_de: string;
  order_index: number;
}

export const ClipRow: React.FC<{ lessonId: string; clip: ListeningClip; index: number; onDelete: (c: ListeningClip) => void }> = ({
  lessonId,
  clip,
  index,
  onDelete,
}) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2_key, clip.id);
  return (
    <div className="flex items-center gap-3 p-2.5 bg-slate-50/60 rounded-xl">
      <span className="text-xs font-display font-bold text-slate-600 shrink-0">File {index + 1}</span>
      <div className="flex-1 min-w-0">
        {playback.loading && <p className="text-[11px] text-slate-400">Đang tải...</p>}
        {playback.url && <audio controls src={playback.url} className="w-full h-8">Trình duyệt không hỗ trợ audio.</audio>}
        {playback.error && <p className="text-[11px] text-red-500">Không tải được: {playback.error}</p>}
      </div>
      <button onClick={() => onDelete(clip)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0" title="Xóa file mp3">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const PassageEditRow: React.FC<{
  passage: ReadingPassage;
  index: number;
  saving: boolean;
  onSave: (id: string, textDe: string) => void;
  onDelete: (p: ReadingPassage) => void;
}> = ({ passage, index, saving, onSave, onDelete }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const dirty = textDe !== passage.text_de;
  return (
    <div className="p-2.5 bg-slate-50/60 rounded-xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">Đoạn {index + 1}</span>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <button onClick={() => onSave(passage.id, textDe)} disabled={saving} className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50">
              {saving ? "Đang lưu..." : "Lưu đoạn văn"}
            </button>
          )}
          <button onClick={() => onDelete(passage)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Xóa đoạn văn">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <textarea
        rows={3}
        value={textDe}
        onChange={(e) => setTextDe(e.target.value)}
        placeholder="Nhập đoạn văn tiếng Đức..."
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y"
      />
    </div>
  );
};
```

- [ ] **Step 2: Xoá khối gốc trong `AdminQuizSection.tsx`** — xoá interface `ListeningClip`/`ReadingPassage` (dòng 29-41) và component `ClipRow`/`PassageEditRow` (dòng 133-188). Thêm import ở đầu file:

```ts
import { type ListeningClip, type ReadingPassage, ClipRow, PassageEditRow } from "./AdminExerciseSetMedia";
```

(Task 6 sẽ xoá tiếp phần dùng `ClipRow`/`PassageEditRow` còn lại trong `AdminQuizSection.tsx` khi UI media chuyển hẳn sang `AdminGrammarExerciseSection.tsx` — task này chỉ trích component, chưa đổi chỗ dùng.)

- [ ] **Step 3: `npm run lint` phải pass.**

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminExerciseSetMedia.tsx src/pages/admin/AdminQuizSection.tsx
git commit -m "refactor: trích ClipRow/PassageEditRow sang file riêng dùng chung"
```

---

### Task 5: Wire media (clip/đoạn văn) vào `AdminGrammarExerciseSection.tsx`

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `type ListeningClip, type ReadingPassage, ClipRow, PassageEditRow` từ `./AdminExerciseSetMedia` (Task 4); `uploadMedia` từ `../../lib/uploadMedia`.

**Ghi chú phạm vi:** Nhãn "Gắn với: File mp3 #N / đoạn văn ..." theo từng set (như `AdminQuizSection.tsx` cũ) KHÔNG làm ở task này — `AdminGrammarExerciseSection.tsx` hiển thị câu hỏi theo group phẳng (`ExerciseGroupList`), không có UI expand riêng từng set để gắn nhãn vào. audio_clip_id/reading_passage_id vẫn lưu đúng vào từng câu hỏi (dùng cho Phase 3b/chấm điểm), chỉ thiếu nhãn hiển thị trực quan theo set — bổ sung sau nếu cần.

- [ ] **Step 1: Thêm import** — thêm vào đầu `AdminGrammarExerciseSection.tsx`:

```ts
import { Headphones } from "lucide-react";
import { uploadMedia } from "../../lib/uploadMedia";
import { type ListeningClip, type ReadingPassage, ClipRow, PassageEditRow } from "./AdminExerciseSetMedia";
```

(gộp `Headphones` vào import `lucide-react` đã có ở dòng 2 thay vì import riêng.)

- [ ] **Step 2: Thêm state + fetch media** — thêm sau khai báo `const [previewTarget, setPreviewTarget] = useState<GrammarExercise | null>(null);` (gốc dòng 918):

```ts
  const [clips, setClips] = useState<ListeningClip[]>([]);
  const [passages, setPassages] = useState<ReadingPassage[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);
  const [deleteClipTarget, setDeleteClipTarget] = useState<ListeningClip | null>(null);
  const [deletingClip, setDeletingClip] = useState(false);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(null);

  const fetchMedia = async () => {
    if (category === "nghe") {
      const { data } = await supabase.from("listening_clips").select("*").order("lesson_id").order("order_index");
      setClips((data ?? []) as ListeningClip[]);
    } else if (category === "doc") {
      const { data } = await supabase.from("reading_passages").select("*").order("lesson_id").order("order_index");
      setPassages((data ?? []) as ReadingPassage[]);
    }
  };

  useEffect(() => {
    if (category !== "nguphap") fetchMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const handleUploadClip = async (lessonId: string, file: File) => {
    setUploadingFor(lessonId);
    setUploadPct(0);
    try {
      const clipId = crypto.randomUUID();
      const objectKey = await uploadMedia(file, lessonId, "audio", setUploadPct, clipId);
      const nextOrder = clips.filter((c) => c.lesson_id === lessonId).length;
      const { error } = await supabase
        .from("listening_clips")
        .insert({ id: clipId, lesson_id: lessonId, r2_key: objectKey, order_index: nextOrder });
      if (error) throw new Error(error.message);
      showToast("Đã tải file mp3 lên.", "success");
      fetchMedia();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải file mp3 thất bại", "warning");
    } finally {
      setUploadingFor(null);
      setUploadPct(null);
    }
  };

  const handleDeleteClip = async () => {
    if (!deleteClipTarget) return;
    setDeletingClip(true);
    const { error } = await supabase.from("listening_clips").delete().eq("id", deleteClipTarget.id);
    setDeletingClip(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa file mp3.", "success");
      setDeleteClipTarget(null);
      fetchMedia();
    }
  };

  const handleAddPassage = async (lessonId: string) => {
    const nextOrder = passages.filter((p) => p.lesson_id === lessonId).length;
    const { error } = await supabase
      .from("reading_passages")
      .insert({ lesson_id: lessonId, text_de: "", order_index: nextOrder });
    if (error) {
      showToast("Thêm đoạn văn thất bại: " + error.message, "warning");
    } else {
      fetchMedia();
    }
  };

  const handleSavePassage = async (passageId: string, textDe: string) => {
    setSavingPassageId(passageId);
    const { error } = await supabase.from("reading_passages").update({ text_de: textDe }).eq("id", passageId);
    setSavingPassageId(null);
    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu đoạn văn.", "success");
      fetchMedia();
    }
  };

  const handleDeletePassage = async () => {
    if (!deletePassageTarget) return;
    setDeletingPassage(true);
    const { error } = await supabase.from("reading_passages").delete().eq("id", deletePassageTarget.id);
    setDeletingPassage(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa đoạn văn.", "success");
      setDeletePassageTarget(null);
      fetchMedia();
    }
  };
```

- [ ] **Step 3: Reset `mediaId` khi mở modal tạo mới, validate bắt buộc chọn khi category khác nguphap** — trong `openCreate` (gốc dòng 954-967), thêm `setMediaId(null);` trước `setModalOpen(true);`. Trong `handleSave` (gốc dòng 1047 trở đi), ngay đầu hàm, thêm:

```ts
    if (category !== "nguphap" && modalMode === "create-group" && !mediaId) {
      showToast(category === "nghe" ? "Chưa chọn file mp3 cho bộ bài tập mới." : "Chưa chọn đoạn văn cho bộ bài tập mới.", "warning");
      return;
    }
```

- [ ] **Step 4: Merge `audio_clip_id`/`reading_passage_id` vào payload khi lưu** — trong `handleSave`, tìm 2 chỗ gọi `buildPayload(entries[0])`:
  1. Nhánh `modalMode === "edit"` (gốc dòng 1073-1088): giữ nguyên — không đổi `audio_clip_id`/`reading_passage_id` khi sửa câu đã có (media gắn từ lúc tạo set, không đổi qua form sửa từng câu).
  2. Nhánh `modalMode === "create-group"` (tạo mới) — nơi build payload cho từng `entries[i]` để insert, thêm merge:

```ts
      const mediaFields =
        category === "nghe"
          ? { audio_clip_id: mediaId, reading_passage_id: null }
          : category === "doc"
            ? { audio_clip_id: null, reading_passage_id: mediaId }
            : { audio_clip_id: null, reading_passage_id: null };
```

  Khai báo `mediaFields` ngay sau dòng tạo `groupId`/gọi `createSet`, rồi spread `...mediaFields` vào từng payload insert cho `entries` (chỗ hiện tại build `payloads` từ `entries.map(...)` — thêm `...mediaFields` vào object trả về của mỗi payload).

- [ ] **Step 5: Render UI clip/passage + media picker trong modal** — trong khối `{expanded[group.lesson_id] && (` (gốc dòng 1338), ngay sau `<div className="border-t border-slate-100 p-4 space-y-3">`, chèn trước `{group.exercises.length === 0 ? (`:

```tsx
                    {category === "nghe" && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition w-fit">
                          <Headphones className="w-4 h-4 text-orange-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-600">
                            {uploadingFor === group.lesson_id ? `Đang tải lên... ${uploadPct}%` : "Tải file mp3 mới"}
                          </span>
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"
                            className="hidden"
                            disabled={uploadingFor !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadClip(group.lesson_id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {clips.filter((c) => c.lesson_id === group.lesson_id).map((clip, idx) => (
                          <ClipRow key={clip.id} lessonId={group.lesson_id} clip={clip} index={idx} onDelete={setDeleteClipTarget} />
                        ))}
                      </div>
                    )}

                    {category === "doc" && (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleAddPassage(group.lesson_id)}
                          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors w-fit"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm đoạn văn
                        </button>
                        {passages.filter((p) => p.lesson_id === group.lesson_id).map((passage, idx) => (
                          <PassageEditRow
                            key={passage.id}
                            passage={passage}
                            index={idx}
                            saving={savingPassageId === passage.id}
                            onSave={handleSavePassage}
                            onDelete={setDeletePassageTarget}
                          />
                        ))}
                      </div>
                    )}
```

  Trong modal tạo mới (khối `{modalOpen && (`, gốc dòng 1378), ngay sau dòng đóng `</div>` của header (`</div>` đóng khối `flex items-center justify-between` chứa tiêu đề modal, trước phần chọn loại câu hỏi ở Step "Loại bài tập"), chèn (chỉ hiện khi tạo mới, category khác nguphap):

```tsx
            {category !== "nguphap" && modalMode === "create-group" && (
              <div>
                <label className={labelCls}>{category === "nghe" ? "Chọn file mp3 cho bộ bài tập mới" : "Chọn đoạn văn cho bộ bài tập mới"} *</label>
                {category === "nghe" ? (
                  <select value={mediaId ?? ""} onChange={(e) => setMediaId(e.target.value || null)} className={inputCls}>
                    <option value="">-- Chọn file mp3 --</option>
                    {clips.filter((c) => c.lesson_id === editLessonId).map((c, i) => (
                      <option key={c.id} value={c.id}>File {i + 1}</option>
                    ))}
                  </select>
                ) : (
                  <select value={mediaId ?? ""} onChange={(e) => setMediaId(e.target.value || null)} className={inputCls}>
                    <option value="">-- Chọn đoạn văn --</option>
                    {passages.filter((p) => p.lesson_id === editLessonId).map((p, i) => (
                      <option key={p.id} value={p.id}>Đoạn {i + 1}{p.text_de ? `: ${p.text_de.slice(0, 30)}...` : ""}</option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-400 mt-1">Chưa có file/đoạn văn? Đóng modal này, thêm ở khu vực phía trên trước.</p>
              </div>
            )}
```

- [ ] **Step 6: Modal xác nhận xoá clip/passage** — thêm cạnh modal xoá bài tập hiện có (`{deleteTarget && (`), 2 modal tương tự:

```tsx
      {deleteClipTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-display font-bold text-slate-900">Xóa file mp3?</h3>
            <p className="text-sm text-slate-500">Các câu hỏi đang gắn với file này sẽ không phát được audio nữa.</p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteClipTarget(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1 bg-red-500 hover:bg-red-600" onClick={handleDeleteClip} disabled={deletingClip}>
                {deletingClip ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-display font-bold text-slate-900">Xóa đoạn văn?</h3>
            <p className="text-sm text-slate-500">Các câu hỏi đang gắn với đoạn văn này sẽ mất ngữ cảnh.</p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeletePassageTarget(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1 bg-red-500 hover:bg-red-600" onClick={handleDeletePassage} disabled={deletingPassage}>
                {deletingPassage ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: `npm run lint` phải pass.**

- [ ] **Step 8: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat: AdminGrammarExerciseSection quản lý clip/đoạn văn cho nghe/đọc"
```

---

### Task 6: `AdminQuizSection.tsx` chỉ còn tab switcher, xoá code cũ

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: `AdminGrammarExerciseSection` (Task 3, đã nhận prop `category`).

- [ ] **Step 1: Viết lại toàn bộ `AdminQuizSection.tsx`** — component chỉ còn tab state + mount component chung, xoá hết: `QuizExercise`/`EditForm`/`LessonInfo` interface, `EMPTY_FORM`, `TYPE_LABELS`/`TYPE_COLORS`, `QuestionTable`, mọi state/handler liên quan clip/passage/modal/form (đã chuyển hết sang `AdminGrammarExerciseSection.tsx` ở Task 4-5), `inputCls`/`labelCls` cục bộ.

```tsx
import React, { useState } from "react";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";

export const AdminQuizSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(["nguphap", "nghe", "doc"] as const).map((val) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-2.5 text-sm font-display font-bold border-b-2 transition-colors ${
              activeTab === val ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {val === "nguphap" ? "Ngữ pháp" : val === "nghe" ? "Nghe" : "Đọc"}
          </button>
        ))}
      </div>

      <AdminGrammarExerciseSection category={activeTab} />
    </div>
  );
};
```

- [ ] **Step 2: Xoá file `AdminExerciseSetMedia.tsx` nếu không còn import nào ngoài `AdminGrammarExerciseSection.tsx`** — kiểm tra bằng grep, KHÔNG xoá file (vẫn dùng ở `AdminGrammarExerciseSection.tsx` từ Task 5), chỉ xác nhận `AdminQuizSection.tsx` sau khi viết lại không còn import gì từ `AdminExerciseSetMedia.tsx` nữa (đã bỏ theo Step 1).

Run: `grep -n "AdminExerciseSetMedia" src/pages/admin/AdminQuizSection.tsx`
Expected: không có kết quả.

- [ ] **Step 3: `npm run lint` phải pass** — chú ý: nếu còn export không dùng tới (unused) trong `AdminExerciseSetMedia.tsx` do TypeScript strict unused-locals, kiểm tra lại `AdminGrammarExerciseSection.tsx` (Task 5) đã import đủ `ClipRow`/`PassageEditRow`/`ListeningClip`/`ReadingPassage`.

- [ ] **Step 4: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "refactor: AdminQuizSection chỉ còn tab switcher, dùng chung AdminGrammarExerciseSection cho cả 3 category"
```

---

### Task 7: Xác minh thủ công + cập nhật roadmap

**Files:** `requirement.md` (cập nhật trạng thái), không sửa code khác.

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Chạy lại toàn bộ test suite lần cuối** — PASS.
- [ ] **Step 3: Ngữ pháp không đổi hành vi** — mở tab Ngữ pháp, xác nhận danh sách bài tập, tạo/sửa/xoá 1 câu, group/hint/word-bank hoạt động giống hệt trước Phase 3a.
- [ ] **Step 4: Tab Ngữ pháp không còn hiện lẫn câu nghe/đọc** — nếu đã có dữ liệu nghe/đọc thật, xác nhận không xuất hiện trong danh sách Ngữ pháp (xác nhận bug đã fix ở Task 3).
- [ ] **Step 5: Tạo đủ 10 loại câu hỏi cho 1 lesson ở tab Nghe** — tải 1 file mp3, tạo set mới chọn file đó, tạo lần lượt 10 loại câu hỏi (kể cả group nhiều câu chung hint/word-bank cho `fill_in_the_blank`), xác nhận lưu đúng, `audio_clip_id` đúng file đã chọn.
- [ ] **Step 6: Lặp lại Step 5 cho tab Đọc** với đoạn văn thay vì file mp3.
- [ ] **Step 7: Cập nhật `requirement.md`** — đánh dấu Phase 3a xong, ghi chú Phase 3b (học viên nhìn thấy group/hint/word-bank khi làm bài nghe/đọc) còn lại, theo đúng format các phase trước.

```bash
git add requirement.md
git commit -m "docs: đánh dấu Phase 3a (Admin dùng chung form) đã xong trong roadmap"
```

## Self-Review

**Spec coverage:** Type/field-rendering layer (spec §1) → Task 1-2. Category-aware + bug fix (spec §2) → Task 3. Media linking (spec §3, phiên bản "giữ nested UI") → Task 4-5. File organization (spec §5) → Task 4. `AdminQuizSection.tsx` thu gọn (spec §2-3) → Task 6. Testing/verification (spec) → Task 7.

**Placeholder scan:** không còn TBD — mọi step có code đầy đủ, kể cả phần ghi chú phạm vi bị cắt (nhãn "Gắn với" theo set) ở đầu Task 5, nói rõ lý do và không giả vờ đã làm.

**Type consistency:** `EditForm`/`matching_pairs`/`validateForm`/`buildPayload` định nghĩa 1 lần ở Task 1, dùng đúng tên xuyên suốt Task 2, 5. `category: "nguphap" | "nghe" | "doc"` định nghĩa ở Task 3, dùng đúng ở Task 5, 6. `ListeningClip`/`ReadingPassage`/`ClipRow`/`PassageEditRow` định nghĩa ở Task 4, dùng đúng ở Task 5, 6.
