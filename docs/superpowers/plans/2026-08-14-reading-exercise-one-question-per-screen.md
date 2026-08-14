# Reading Exercise — One Question Per Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển màn làm bài đọc (`ReadingSetListPage.tsx`) từ "mỗi bước 1 đoạn văn, chấm điểm ngay khi nộp đoạn" sang "mỗi màn hình 1 câu hỏi", điều hướng Quay lại/Tiếp theo tự do xuyên suốt cả set, chỉ chấm điểm 1 lần ở "Nộp bài" cuối cùng.

**Architecture:** Trích xuất logic dựng danh sách câu hỏi phẳng thành hàm thuần `buildReadingScreens` trong `src/lib/readingScreens.ts` (test bằng `node:test`), dùng lại trong `ReadingSetListPage.tsx` để thay `currentPassageIndex` bằng `currentScreenIndex` chạy suốt toàn set. Thêm component `ReadingSingleQuestion` chỉ render 1 câu hỏi. Xoá nhánh chấm-điểm-tạm (`passage_id`) không còn ai gọi trong edge function `reading-submit`.

**Tech Stack:** React 19 + TypeScript 5.8, Tailwind v4, Supabase Edge Function (Deno). Test bằng `node:test` chạy qua `npx tsx --test <path>`. Type check: `npm run lint` (= `tsc --noEmit`).

## Global Constraints

- Ngôn ngữ code: English (biến/hàm/type); nội dung hiển thị cho user: Tiếng Việt/Đức theo dữ liệu gốc.
- Không dùng `any` — dùng type cụ thể.
- Không dùng `window.alert()`/`window.confirm()` — dùng `showToast()`.
- Export named exports (trừ `App.tsx`).
- `correctAnswer` không bao giờ gửi về client — giữ nguyên chấm điểm server-side trong edge function.
- Không sửa `src/lib/database.types.ts` bằng tay.
- Đây là spec [2026-08-14-reading-exercise-one-question-per-screen-design.md](../specs/2026-08-14-reading-exercise-one-question-per-screen-design.md) — tuân thủ đúng phạm vi trong/ngoài đã ghi ở đó.

---

## Task 1: Hàm thuần dựng danh sách câu hỏi phẳng (`buildReadingScreens`)

**Files:**
- Create: `src/lib/readingScreens.ts`
- Test: `src/lib/readingScreens.test.ts`

**Interfaces:**
- Consumes: `ReadingQuestionGroupPublic`, `ReadingPassageLite` (đã có sẵn ở `src/lib/hooks/useReadingQuestionGroups.ts` — import type, không sửa file này).
- Produces (dùng ở Task 2):
  ```ts
  export interface ReadingScreen {
    passageId: string;
    group: ReadingQuestionGroupPublic;
    questionIndex: number;
    questionCount: number;
    key: string;
  }
  export function itemKey(groupId: string, index: number): string;
  export function buildReadingScreens(
    groups: ReadingQuestionGroupPublic[],
    passagesById: Record<string, ReadingPassageLite>,
  ): ReadingScreen[];
  ```

- [ ] **Step 1: Viết test trước (failing)**

Tạo `src/lib/readingScreens.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { itemKey, buildReadingScreens } from "./readingScreens";
import type { ReadingQuestionGroupPublic, ReadingPassageLite } from "./hooks/useReadingQuestionGroups";

const passage = (id: string, orderIndex: number): ReadingPassageLite => ({ id, textDe: `text-${id}`, orderIndex });

const richtigFalschGroup = (
  id: string,
  passageId: string,
  statementCount: number,
): ReadingQuestionGroupPublic => ({
  id,
  passageId,
  title: `Teil ${id}`,
  questionIntro: null,
  questionType: "richtig_falsch",
  statements: Array.from({ length: statementCount }, (_, i) => ({ text: `statement-${id}-${i}` })),
  subQuestions: [],
  orderIndex: 0,
});

const multipleChoiceGroup = (
  id: string,
  passageId: string,
  subQuestionCount: number,
): ReadingQuestionGroupPublic => ({
  id,
  passageId,
  title: `Teil ${id}`,
  questionIntro: null,
  questionType: "multiple_choice",
  statements: [],
  subQuestions: Array.from({ length: subQuestionCount }, (_, i) => ({
    text_snippet: null,
    image_key: null,
    question: `q-${id}-${i}`,
    options: ["A", "B"],
  })),
  orderIndex: 0,
});

test("itemKey: ghép groupId và index bằng dấu hai chấm", () => {
  assert.equal(itemKey("g1", 0), "g1:0");
  assert.equal(itemKey("g1", 2), "g1:2");
});

test("buildReadingScreens: 1 nhóm richtig_falsch 2 câu -> 2 screen đúng thứ tự", () => {
  const groups = [richtigFalschGroup("g1", "p1", 2)];
  const passagesById = { p1: passage("p1", 0) };
  const screens = buildReadingScreens(groups, passagesById);
  assert.equal(screens.length, 2);
  assert.deepEqual(
    screens.map((s) => [s.questionIndex, s.questionCount, s.key]),
    [
      [0, 2, "g1:0"],
      [1, 2, "g1:1"],
    ],
  );
  assert.equal(screens[0].passageId, "p1");
  assert.equal(screens[0].group.id, "g1");
});

test("buildReadingScreens: multiple_choice đếm theo subQuestions", () => {
  const groups = [multipleChoiceGroup("g1", "p1", 3)];
  const passagesById = { p1: passage("p1", 0) };
  const screens = buildReadingScreens(groups, passagesById);
  assert.equal(screens.length, 3);
  assert.deepEqual(screens.map((s) => s.questionIndex), [0, 1, 2]);
});

test("buildReadingScreens: nhiều đoạn -> gộp phẳng theo thứ tự passage.orderIndex, giữ nguyên thứ tự nhóm trong cùng đoạn", () => {
  const groups = [
    richtigFalschGroup("g-p2", "p2", 1),
    richtigFalschGroup("g-p1-a", "p1", 1),
    richtigFalschGroup("g-p1-b", "p1", 1),
  ];
  const passagesById = { p1: passage("p1", 0), p2: passage("p2", 1) };
  const screens = buildReadingScreens(groups, passagesById);
  assert.deepEqual(
    screens.map((s) => s.group.id),
    ["g-p1-a", "g-p1-b", "g-p2"],
  );
});

test("buildReadingScreens: mảng groups rỗng -> mảng screens rỗng", () => {
  assert.deepEqual(buildReadingScreens([], {}), []);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail vì module chưa tồn tại**

Run: `npx tsx --test src/lib/readingScreens.test.ts`
Expected: FAIL — lỗi không tìm thấy module `./readingScreens`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/readingScreens.ts`:

```ts
import type { ReadingQuestionGroupPublic, ReadingPassageLite } from "./hooks/useReadingQuestionGroups";

export interface ReadingScreen {
  passageId: string;
  group: ReadingQuestionGroupPublic;
  questionIndex: number;
  questionCount: number;
  key: string;
}

export const itemKey = (groupId: string, index: number): string => `${groupId}:${index}`;

export function buildReadingScreens(
  groups: ReadingQuestionGroupPublic[],
  passagesById: Record<string, ReadingPassageLite>,
): ReadingScreen[] {
  const orderedGroups = [...groups].sort((a, b) => {
    const pa = passagesById[a.passageId]?.orderIndex ?? 0;
    const pb = passagesById[b.passageId]?.orderIndex ?? 0;
    return pa - pb;
  });

  return orderedGroups.flatMap((group) => {
    const count = group.questionType === "richtig_falsch" ? group.statements.length : group.subQuestions.length;
    return Array.from({ length: count }, (_, i) => ({
      passageId: group.passageId,
      group,
      questionIndex: i,
      questionCount: count,
      key: itemKey(group.id, i),
    }));
  });
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx tsx --test src/lib/readingScreens.test.ts`
Expected: PASS — 6 test đều pass (`itemKey` x2, `buildReadingScreens` x4).

- [ ] **Step 5: Type check**

Run: `npm run lint`
Expected: không lỗi mới liên quan đến `readingScreens.ts`/`readingScreens.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/readingScreens.ts src/lib/readingScreens.test.ts
git commit -m "feat(reading): thêm buildReadingScreens dựng danh sách câu hỏi phẳng"
```

---

## Task 2: Component `ReadingSingleQuestion` + thay state/render màn làm bài trong `ReadingSetListPage.tsx`

**Files:**
- Modify: `src/pages/ReadingSetListPage.tsx`

**Interfaces:**
- Consumes: `buildReadingScreens`, `itemKey`, `ReadingScreen` từ Task 1 (`src/lib/readingScreens.ts`). `Button` từ `src/components/DesignSystem.tsx`. `MarkdownBlock` từ `src/components/MarkdownBlock.tsx`. `SubQuestionImage` (đã có sẵn trong file, dòng 45-50 — không đổi).
- Produces: không có consumer khác trong codebase (component nội bộ file, không export).

- [ ] **Step 1: Xoá import `itemKey` cục bộ, import từ lib mới**

Trong `src/pages/ReadingSetListPage.tsx`, xoá dòng 43:
```ts
const itemKey = (groupId: string, index: number): string => `${groupId}:${index}`;
```
Thêm vào khối import ở đầu file (sau dòng import `useReadingQuestionGroups`):
```ts
import { buildReadingScreens, itemKey, type ReadingScreen } from "../lib/readingScreens";
```

- [ ] **Step 2: Thêm component `ReadingSingleQuestion`**

Chèn ngay sau `SubQuestionImage` (sau dòng 50, trước `ReadingGroupBody`):

```tsx
const ReadingSingleQuestion: React.FC<{
  lesson: Lesson;
  screen: ReadingScreen;
  answersByKey: Record<string, string>;
  onAnswer: (value: string) => void;
}> = ({ lesson, screen, answersByKey, onAnswer }) => {
  const picked = answersByKey[screen.key];

  if (screen.group.questionType === "richtig_falsch") {
    const statement = screen.group.statements[screen.questionIndex];
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">{statement.text}</p>
        {(["richtig", "falsch"] as const).map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => onAnswer(val)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl border transition-colors ${
              picked === val ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                picked === val ? "border-orange-500 bg-orange-500" : "border-slate-300"
              }`}
            />
            {val === "richtig" ? "Richtig" : "Falsch"}
          </button>
        ))}
      </div>
    );
  }

  const q = screen.group.subQuestions[screen.questionIndex];
  return (
    <div className="space-y-2">
      {q.text_snippet && <p className="text-xs text-slate-500">{q.text_snippet}</p>}
      {q.image_key && <SubQuestionImage lessonId={lesson.id} imageKey={q.image_key} />}
      <p className="text-sm font-medium text-slate-700">{q.question}</p>
      <div className="space-y-1">
        {q.options.map((opt, oi) => {
          const optKey = String(oi);
          return (
            <button
              key={oi}
              type="button"
              onClick={() => onAnswer(optKey)}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                picked === optKey ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              {String.fromCharCode(65 + oi)}. {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

`ReadingGroupBody` (dòng 52-147 hiện tại) giữ nguyên không đổi — vẫn dùng cho màn kết quả cuối.

- [ ] **Step 3: Thay state đoạn-văn bằng state câu-hỏi-phẳng trong `ReadingExerciseSetBody`**

Xoá các dòng sau (trong thân `ReadingExerciseSetBody`):
```ts
const [currentPassageIndex, setCurrentPassageIndex] = useState(0);
const [passageSubmitting, setPassageSubmitting] = useState(false);
const [passageReveal, setPassageReveal] = useState<{
  itemResults: Record<string, boolean>;
  correctAnswers: Record<string, string>;
  explanations: Record<string, string>;
} | null>(null);
```
Thay bằng:
```ts
const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
```

Xoá khối:
```ts
const passageOrder = useMemo(
  () =>
    [...new Set(groups.map((g) => g.passageId))].sort(
      (a, b) => (passagesById[a]?.orderIndex ?? 0) - (passagesById[b]?.orderIndex ?? 0),
    ),
  [groups, passagesById],
);
const currentPassageId = passageOrder[currentPassageIndex];
const currentGroups = useMemo(
  () => groups.filter((g) => g.passageId === currentPassageId),
  [groups, currentPassageId],
);
const isLastPassage = currentPassageIndex === passageOrder.length - 1;
const currentKeys = useMemo(
  () => currentGroups.flatMap((g) => (g.questionType === "richtig_falsch" ? g.statements : g.subQuestions).map((_, i) => itemKey(g.id, i))),
  [currentGroups],
);
const currentAnswered = currentKeys.length > 0 && currentKeys.every((key) => !!answersByKey[key]);

React.useEffect(() => {
  setPassageReveal(null);
}, [currentPassageIndex]);

const handleSubmitPassage = async () => {
  setPassageSubmitting(true);
  const { data, error } = await supabase.functions.invoke("reading-submit", {
    body: { set_id: set.id, submission_id: submissionIdRef.current, passage_id: currentPassageId, answers: answersByKey },
  });
  setPassageSubmitting(false);
  if (error || !data) {
    showToast("Không thể chấm điểm đoạn này. Vui lòng thử lại.", "warning");
    return;
  }
  setPassageReveal(
    data as { itemResults: Record<string, boolean>; correctAnswers: Record<string, string>; explanations: Record<string, string> },
  );
};
```

Thay bằng:
```ts
const screens = useMemo(() => buildReadingScreens(groups, passagesById), [groups, passagesById]);
const currentScreen = screens[currentScreenIndex];
const isLastScreen = currentScreenIndex === screens.length - 1;
const currentAnswered = !!currentScreen && !!answersByKey[currentScreen.key];
```

Trong `handleRetry`, thay `setCurrentPassageIndex(0);` và `setPassageReveal(null);` bằng `setCurrentScreenIndex(0);`.

- [ ] **Step 4: Thay render màn làm bài**

Thay toàn bộ khối JSX từ `return (` cuối cùng (bắt đầu `<div className="space-y-4 animate-in fade-in duration-300">`, dòng ~368) đến hết `</div>` khớp (dòng ~426, ngay trước `};` đóng `ReadingExerciseSetBody`) bằng:

```tsx
if (!currentScreen) {
  return (
    <div className="text-center py-8">
      <p className="text-slate-500">Bài tập cho phần này chưa được soạn.</p>
    </div>
  );
}

const handleSaveDraft = async () => {
  const { error } = await saveDraft(answersByKey);
  if (error) {
    showToast("Không thể lưu, vui lòng thử lại.", "warning");
    return;
  }
  showToast("Đã lưu bài làm dở.", "success");
  onDraftSaved(true);
};

return (
  <div className="space-y-4 animate-in fade-in duration-300">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <MarkdownBlock content={passagesById[currentScreen.passageId]?.textDe ?? ""} lessonId={lesson.id} />
      </div>

      <ReadingSingleQuestion
        lesson={lesson}
        screen={currentScreen}
        answersByKey={answersByKey}
        onAnswer={(value) => setAnswersByKey((prev) => ({ ...prev, [currentScreen.key]: value }))}
      />

      <div className="flex items-center justify-center gap-1.5 pt-1">
        {Array.from({ length: currentScreen.questionCount }, (_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${i === currentScreen.questionIndex ? "bg-red-500" : "bg-slate-200"}`}
          />
        ))}
      </div>
    </div>

    {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={handleSaveDraft}>
        Lưu
      </Button>
      <Button
        variant="secondary"
        disabled={currentScreenIndex === 0}
        onClick={() => setCurrentScreenIndex((i) => i - 1)}
      >
        Quay lại
      </Button>
      {isLastScreen ? (
        <Button variant="primary" disabled={!currentAnswered || submitting} onClick={handleSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nộp bài
        </Button>
      ) : (
        <Button variant="primary" disabled={!currentAnswered} onClick={() => setCurrentScreenIndex((i) => i + 1)}>
          Tiếp theo <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      )}
    </div>
  </div>
);
```

Lưu ý: khối `if (groupsError || groups.length === 0)` (dòng ~278-284, hiện có trước `if (result)`) đã xử lý case set rỗng hoàn toàn — khối `if (!currentScreen)` mới thêm ở trên chỉ là phòng hờ khi `groups` có dữ liệu nhưng mọi nhóm đều 0 câu hỏi (statements/subQuestions rỗng), giữ để tránh crash khi `screens` rỗng nhưng `groups.length > 0`.

- [ ] **Step 5: Type check**

Run: `npm run lint`
Expected: không còn lỗi. Nếu TypeScript báo `passageSubmitting`/`passageReveal`/`currentPassageIndex`/`currentGroups`/`isLastPassage`/`handleSubmitPassage`/`passageOrder` "not defined" ở đâu đó còn sót — tìm và xoá nốt tham chiếu đó (đối chiếu lại Step 3).

- [ ] **Step 6: Test thủ công trên browser**

Chạy `npm run dev`, mở 1 lesson có bài đọc (dùng set đã tạo từ Phase 6c, ≥ 2 đoạn văn/nhiều nhóm câu hỏi). Xác nhận:
- Vào bài: chỉ thấy đoạn văn + 1 câu hỏi (không có tiêu đề Teil/Yêu cầu, không có nhãn "Đoạn X/Y").
- Chấm tròn phân trang đúng số câu trong nhóm hiện tại, không có trạng thái xanh/đỏ.
- "Tiếp theo" bị disable khi chưa chọn đáp án; bấm được sau khi chọn.
- Qua hết câu của 1 nhóm, bấm Tiếp theo: đoạn văn tự đổi sang đoạn/nhóm kế mà không cần thao tác thêm.
- "Quay lại" ở câu đầu tiên của set bị disable; ở các câu sau thì lùi đúng 1 câu, giữ nguyên đáp án đã chọn.
- Câu cuối cùng của toàn set: nút thành "Nộp bài", bấm xong vào thẳng màn kết quả (không qua bước reveal trung gian).
- Màn kết quả cuối vẫn hiện đầy đủ như trước (không bị ảnh hưởng).
- "Lưu" hoạt động, F5 lại trang: đáp án khôi phục đúng (vị trí câu hỏi reset về đầu — chấp nhận được theo spec).

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReadingSetListPage.tsx
git commit -m "feat(reading): mỗi màn hình 1 câu hỏi, bỏ chấm điểm giữa chừng"
```

---

## Task 3: Xoá nhánh chấm-điểm-tạm theo đoạn trong edge function `reading-submit`

**Files:**
- Modify: `supabase/functions/reading-submit/index.ts`

**Interfaces:**
- Consumes: không đổi — vẫn dùng `computeReadingScore`, `deriveCorrectAnswers`, `deriveExplanations`, `projectAnswers` từ `./scoring.ts` (không đổi file đó).
- Produces: request body edge function không còn field `passage_id` được xử lý.

- [ ] **Step 1: Xoá biến `passage_id` và nhánh xử lý**

Trong `supabase/functions/reading-submit/index.ts`:

Xoá dòng 31:
```ts
const passage_id: string | undefined = body.passage_id;
```

Xoá khối dòng 80-101:
```ts
    // Chấm điểm tạm cho 1 đoạn văn — dùng khi học viên bấm "Nộp đoạn này"
    // giữa chừng luồng làm bài từng đoạn. Không ghi DB/XP/rollup, chỉ trả
    // đáp án + giải thích của riêng đoạn đó để hiện ngay tại chỗ.
    if (passage_id) {
      const passageGroups = groups.filter((g) => g.passage_id === passage_id);
      if (passageGroups.length === 0) {
        return new Response(JSON.stringify({ error: "Passage not found in set" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const passageAnswers = projectAnswers(passageGroups, rawAnswers);
      const { itemResults: passageItemResults } = computeReadingScore(passageGroups, passageAnswers);
      return new Response(
        JSON.stringify({
          itemResults: passageItemResults,
          correctAnswers: deriveCorrectAnswers(passageGroups),
          explanations: deriveExplanations(passageGroups),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

```

Toàn bộ phần còn lại của hàm (từ `const answers = projectAnswers(groups, rawAnswers);` trở xuống) giữ nguyên y hệt.

- [ ] **Step 2: Type check**

Run: `npm run lint`
Expected: không lỗi (edge function nằm ngoài phạm vi `tsc --noEmit` của frontend project nếu không được include trong `tsconfig.json` — nếu `npm run lint` không chạm tới file này thì bỏ qua bước type-check tự động, coi bước 3 dưới là bước xác minh chính).

- [ ] **Step 3: Xác minh bằng mắt không còn tham chiếu `passage_id` nào sót lại**

Run: `grep -n "passage_id" supabase/functions/reading-submit/index.ts`
Expected: chỉ còn 1 dòng — `.select("id, passage_id, question_type, ...")` (field `passage_id` vẫn cần trong SELECT để lọc `g.passage_id === body.passage_id` cũ đã bị xoá, nhưng field này không dùng chỗ nào khác nữa trong luồng còn lại → xoá luôn khỏi câu `select` cho gọn, xem Step 4).

- [ ] **Step 4: Dọn `passage_id` khỏi câu `select` groups (không còn dùng)**

Tìm dòng:
```ts
      .select("id, passage_id, question_type, statements, sub_questions, explanation")
```
Đổi thành:
```ts
      .select("id, question_type, statements, sub_questions, explanation")
```

Run lại: `grep -n "passage_id" supabase/functions/reading-submit/index.ts`
Expected: không còn dòng nào.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/reading-submit/index.ts
git commit -m "refactor(reading-submit): xoá nhánh chấm điểm tạm theo đoạn, không còn caller"
```

---

## Self-Review Notes (đã áp dụng khi viết plan)

- **Phủ spec:** mục 1-6 trong "Đã xác nhận với người dùng" đều có task tương ứng — mục 1,2,3,6 → Task 1+2; mục 4 (multiple_choice cùng kiểu) → `ReadingSingleQuestion` xử lý cả 2 loại; mục 5 (không thêm nhãn Nachricht) → không có bước nào thêm nhãn đó.
- **Không đổi:** `ReadingGroupBody`, màn kết quả cuối, `scoring.ts`, hooks khác — không task nào chạm vào các file/khối này, khớp mục "Không đổi" trong spec.
- **Type consistency:** `ReadingScreen`, `itemKey`, `buildReadingScreens` định nghĩa 1 lần ở Task 1, Task 2 chỉ import — không định nghĩa lại.
- **Thứ tự task:** Task 1 (lib thuần, test trước) → Task 2 (dùng lib đó trong component) → Task 3 (dọn backend không còn caller) — mỗi task chạy/test độc lập được, không phá app giữa chừng (Task 3 chỉ an toàn xoá sau khi Task 2 đã xoá caller phía frontend, đúng thứ tự).
