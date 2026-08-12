# Reading Exercise Per-Passage Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reading-exercise-taking screen step through one passage at a time (grade + reveal each passage on submit, final aggregate score at the end), remove the passage-text preview from the pre-exercise "Lesen" tab, and reorganize the Admin "Đọc" section into the same Level → Lesson accordion used by "Ngữ pháp"/"Nghe".

**Architecture:** Frontend-only stepper state in `ReadingExerciseSetBody` (React), one new optional-`passage_id` branch in the existing `reading-submit` Edge Function for side-effect-free partial grading, and a straight reuse of the existing `AdminModuleGroup` component for the Admin reorg. No schema changes, no new dependencies.

**Tech Stack:** React 19 + TypeScript, Supabase Edge Functions (Deno), `node:test` for pure-function unit tests, Supabase MCP for edge function deploy.

## Global Constraints

- Ngôn ngữ code: English (biến/hàm/type); nội dung hiển thị cho user: Tiếng Việt.
- Không dùng `any` trong TypeScript.
- Toast qua `showToast()`, không dùng `window.alert()`.
- `correctAnswer`/`correct_option_id` không bao giờ gửi về client ngoài lúc `revealed` — quiz scoring luôn chạy trong Edge Function, không ở frontend.
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay (không cần đổi schema trong plan này).
- Điểm tổng cuối cùng của 1 set = tổng số câu đúng / tổng số câu của cả set (đã xác nhận với người dùng — không phải trung bình cộng % từng đoạn).
- Spec gốc: [docs/superpowers/specs/2026-08-12-reading-exercise-per-passage-flow-design.md](../specs/2026-08-12-reading-exercise-per-passage-flow-design.md).

---

## Task 1: `reading-submit` Edge Function — nhánh chấm điểm tạm theo từng đoạn

**Files:**
- Modify: `supabase/functions/reading-submit/index.ts:27-79`
- Test: không có test mới (nhánh routing trong `index.ts` vốn không có test riêng trong repo này — chỉ `scoring.ts`/`setAttemptUpdate.ts` có `node:test`; nhánh mới tái dùng nguyên các hàm đã test).

**Interfaces:**
- Consumes: `computeReadingScore`, `projectAnswers`, `deriveCorrectAnswers`, `deriveExplanations` từ `./scoring.ts` (đã tồn tại, không đổi chữ ký).
- Produces: request body mới `{ set_id, submission_id, answers, passage_id?: string }`. Khi có `passage_id`, response là `{ itemResults: Record<string,boolean>, correctAnswers: Record<string,string>, explanations: Record<string,string> }` (không có `score/total/correct/isPassed/...`). Task 3 gọi API này.

- [ ] **Step 1: Đọc lại file hiện tại để xác nhận vị trí chèn**

Không cần chạy lệnh — đã đọc `supabase/functions/reading-submit/index.ts` đầy đủ trong phiên làm việc, dòng 27-79 là nơi parse body và fetch `groups`.

- [ ] **Step 2: Thêm field `passage_id` vào phần parse body**

Sửa dòng 27-30 từ:

```ts
    const body = await req.json();
    const set_id: string = body.set_id;
    const submission_id: string = body.submission_id;
    const rawAnswers: Record<string, unknown> | undefined = body.answers;
```

thành:

```ts
    const body = await req.json();
    const set_id: string = body.set_id;
    const submission_id: string = body.submission_id;
    const rawAnswers: Record<string, unknown> | undefined = body.answers;
    const passage_id: string | undefined = body.passage_id;
```

- [ ] **Step 3: Thêm `passage_id` vào câu `select` groups**

Sửa dòng 67-70 từ:

```ts
    const { data: groups, error: groupsErr } = await supabase
      .from("reading_question_groups")
      .select("id, question_type, statements, sub_questions, explanation")
      .eq("set_id", set_id);
```

thành:

```ts
    const { data: groups, error: groupsErr } = await supabase
      .from("reading_question_groups")
      .select("id, passage_id, question_type, statements, sub_questions, explanation")
      .eq("set_id", set_id);
```

- [ ] **Step 4: Chèn nhánh chấm điểm tạm ngay sau khi có `groups`, trước dòng `projectAnswers(groups, rawAnswers)`**

Chèn khối sau ngay sau đoạn kiểm tra lỗi `groupsErr`/`groups.length === 0` (dòng 72-77), trước dòng 79 (`const answers = projectAnswers(groups, rawAnswers);`):

```ts
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

Nhánh này chạy **sau** bước auth (`authHeader`/`supabase.auth.getUser`, dòng 19-51) và **sau** bước xác nhận `set` tồn tại + `published` (dòng 53-65) — không bỏ qua 2 bước đó. Nhánh này **không** đụng `exercise_set_attempts`, không cộng XP, không rollup `lesson_progress` — trả kết quả rồi return ngay, phần code phía dưới (submit thật) giữ nguyên y hệt.

- [ ] **Step 5: Kiểm tra bằng mắt — diff không đụng gì phía dưới dòng 79**

Chạy:

```bash
git diff supabase/functions/reading-submit/index.ts
```

Kỳ vọng: chỉ 3 vùng đổi (Step 2/3/4), phần còn lại của file (idempotency check, DB upsert, XP, rollup `lesson_progress`) không đổi 1 ký tự.

- [ ] **Step 6: Deploy Edge Function lên Supabase**

Dùng Supabase MCP tool `deploy_edge_function` với `project_id: "awdhqlgxnjwymwgxltlw"`, `name: "reading-submit"`, `entrypoint_path: "index.ts"`, `verify_jwt: true`, và `files` là nội dung hiện tại của cả 3 file runtime (đọc từng file bằng Read trước khi deploy, không đoán nội dung):
- `supabase/functions/reading-submit/index.ts` (vừa sửa)
- `supabase/functions/reading-submit/scoring.ts` (không đổi)
- `supabase/functions/reading-submit/setAttemptUpdate.ts` (không đổi)

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/reading-submit/index.ts
git commit -m "feat(reading-submit): thêm nhánh chấm điểm tạm theo từng đoạn (passage_id)"
```

---

## Task 2: `useReadingQuestionGroups.ts` — thêm `orderIndex` cho văn bản

**Files:**
- Modify: `src/lib/hooks/useReadingQuestionGroups.ts:26-29, 88-100`

**Interfaces:**
- Produces: `ReadingPassageLite` có thêm field `orderIndex: number`. Task 3 dùng field này để sắp thứ tự đoạn.

- [ ] **Step 1: Thêm field vào interface**

Sửa dòng 26-29 từ:

```ts
export interface ReadingPassageLite {
  id: string;
  textDe: string;
}
```

thành:

```ts
export interface ReadingPassageLite {
  id: string;
  textDe: string;
  orderIndex: number;
}
```

- [ ] **Step 2: Fetch thêm `order_index`, map vào `orderIndex`**

Sửa dòng 88-91 (câu select passages) từ:

```ts
          const { data: passages, error: passagesError } = await supabase
            .from("reading_passages")
            .select("id, text_de")
            .in("id", passageIds);
```

thành:

```ts
          const { data: passages, error: passagesError } = await supabase
            .from("reading_passages")
            .select("id, text_de, order_index")
            .in("id", passageIds);
```

Sửa dòng 98-100 (map vào `passageMap`) từ:

```ts
          for (const p of passages ?? []) {
            passageMap[p.id as string] = { id: p.id as string, textDe: p.text_de as string };
          }
```

thành:

```ts
          for (const p of passages ?? []) {
            passageMap[p.id as string] = { id: p.id as string, textDe: p.text_de as string, orderIndex: p.order_index as number };
          }
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: không lỗi (hook này chưa có test riêng trong repo, đúng convention hiện có — không thêm test mới cho hook gọi Supabase trực tiếp).

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useReadingQuestionGroups.ts
git commit -m "feat(reading): thêm orderIndex cho ReadingPassageLite"
```

---

## Task 3: `ReadingSetListPage.tsx` — làm bài từng đoạn (stepper)

**Files:**
- Modify: `src/pages/ReadingSetListPage.tsx:1-2, 156-236, 338-379`

**Interfaces:**
- Consumes: `ReadingGroupBody` (đã có, không đổi props), `ReadingPassageLite.orderIndex` (Task 2), Edge Function `reading-submit` với `passage_id` (Task 1, đã deploy).
- Produces: không export gì mới ra ngoài file này — `ReadingExerciseSetBody` vẫn export nguyên chữ ký cũ.

- [ ] **Step 1: Thêm import `ArrowRight`**

Sửa dòng 2 từ:

```tsx
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
```

thành:

```tsx
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, RotateCcw, ArrowRight } from "lucide-react";
```

- [ ] **Step 2: Thêm state stepper + thay `allKeys`/`allAnswered` bằng bản scoped theo đoạn hiện tại**

Trong `ReadingExerciseSetBody`, ngay sau khai báo state hiện có (sau dòng `const submissionIdRef = React.useRef(crypto.randomUUID());`, dòng 166), thêm:

```tsx
  const [currentPassageIndex, setCurrentPassageIndex] = useState(0);
  const [passageSubmitting, setPassageSubmitting] = useState(false);
  const [passageReveal, setPassageReveal] = useState<{
    itemResults: Record<string, boolean>;
    correctAnswers: Record<string, string>;
    explanations: Record<string, string>;
  } | null>(null);
```

Xoá khối `allKeys`/`allAnswered` hiện tại (dòng 194-198):

```tsx
  const allKeys = useMemo(
    () => groups.flatMap((g) => (g.questionType === "richtig_falsch" ? g.statements : g.subQuestions).map((_, i) => itemKey(g.id, i))),
    [groups],
  );
  const allAnswered = allKeys.length > 0 && allKeys.every((key) => !!answersByKey[key]);
```

Thay bằng:

```tsx
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
```

- [ ] **Step 3: Thêm `handleSubmitPassage`, sửa `handleRetry`**

Ngay trước `const handleSubmit = async () => {` (dòng 211), thêm:

```tsx
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

Sửa `handleRetry` (dòng 230-236) từ:

```tsx
  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setAnswersByKey({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
  };
```

thành:

```tsx
  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setAnswersByKey({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
    setCurrentPassageIndex(0);
    setPassageReveal(null);
  };
```

- [ ] **Step 4: Thay khối render "làm bài" (chưa có `result`) — chỉ hiện đoạn hiện tại + nút theo trạng thái**

Sửa toàn bộ khối từ dòng 338 (`return (`) đến dòng 379 (kết thúc component, trước dấu `};`):

```tsx
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="space-y-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Đoạn {currentPassageIndex + 1}/{passageOrder.length}
        </span>
        {currentGroups.map((group, groupIndex) => (
          <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider mb-2">Bài {groupIndex + 1}</p>
            <ReadingGroupBody
              lesson={lesson}
              group={group}
              passageText={passagesById[group.passageId]?.textDe ?? ""}
              answersByKey={answersByKey}
              onAnswer={(key, value) => setAnswersByKey((prev) => ({ ...prev, [key]: value }))}
              itemResults={passageReveal?.itemResults}
              revealed={passageReveal !== null}
              correctAnswers={passageReveal?.correctAnswers}
              explanation={passageReveal?.explanations[group.id]}
            />
          </div>
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={async () => {
            const { error } = await saveDraft(answersByKey);
            if (error) {
              showToast("Không thể lưu, vui lòng thử lại.", "warning");
              return;
            }
            showToast("Đã lưu bài làm dở.", "success");
            onDraftSaved(true);
          }}
        >
          Lưu
        </Button>
        {passageReveal === null ? (
          <Button variant="primary" disabled={!currentAnswered || passageSubmitting} onClick={handleSubmitPassage}>
            {passageSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Nộp đoạn này
          </Button>
        ) : isLastPassage ? (
          <Button variant="primary" disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Xem kết quả
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setCurrentPassageIndex((i) => i + 1)}>
            Đoạn tiếp theo <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
```

Màn kết quả cuối (`if (result) { ... }`, dòng 256-336) **không đổi** — vẫn nằm nguyên phía trên khối vừa sửa.

- [ ] **Step 5: Typecheck**

```bash
npm run lint
```

Expected: không lỗi. Nếu báo `allKeys`/`allAnswered` không tồn tại ở đâu khác trong file — xác nhận đã xoá sạch, không còn tham chiếu.

- [ ] **Step 6: Test thủ công trên browser (cần set có ≥ 2 đoạn — tạo qua Admin trước, xem Task 5)**

Mở app, vào 1 bài học có set đọc ≥ 2 đoạn, bấm "Bắt đầu bài tập đọc":
- Thấy "Đoạn 1/2", chỉ 1 đoạn văn + câu hỏi của đoạn đó.
- "Nộp đoạn này" disabled khi chưa trả lời hết.
- Trả lời hết, bấm "Nộp đoạn này" → thấy đáp án đúng/sai ngay, nút đổi thành "Đoạn tiếp theo".
- Bấm "Đoạn tiếp theo" → chỉ thấy đoạn 2 (không còn đoạn 1), nút submit đổi thành "Nộp đoạn này" cho đoạn 2.
- Nộp xong đoạn 2 (đoạn cuối) → nút thành "Xem kết quả", bấm vào thấy màn kết quả tổng (điểm = tổng đúng/tổng câu 2 đoạn), giống hệt UI cũ.
- "Làm lại bài Test" → quay về Đoạn 1/2, câu trả lời rỗng.
- Set chỉ có 1 đoạn (dữ liệu "Bài 1 check" có sẵn) → luồng vẫn chạy: "Nộp đoạn này" → "Xem kết quả" ngay, không có bước "Đoạn tiếp theo".

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReadingSetListPage.tsx
git commit -m "feat(reading): làm bài đọc từng đoạn, chấm điểm + hiện đáp án ngay sau mỗi đoạn"
```

---

## Task 4: `LessonDetailPage.tsx` — bỏ preview văn bản ở tab Lesen

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:305-340`

**Interfaces:**
- Không đổi props/exports của `LessonDetailPage`.

- [ ] **Step 1: Thay khối tab "doc"**

Sửa toàn bộ khối từ dòng 305 đến 340 từ:

```tsx
          {bottomTab === "doc" && lesson.readingPassages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
              </div>
              <div className="space-y-4">
                {lesson.readingPassages.map((passage, idx) => (
                  <div key={passage.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đoạn {idx + 1}</span>
                    <MarkdownBlock content={passage.textDe} lessonId={lesson.id} />
                  </div>
                ))}
              </div>
              {lesson.hasDocQuestions === true ? (
                <>
                  <div className="text-center space-y-2 pt-1">
                    <h3 className="text-sm font-display font-extrabold text-slate-800">Đã đọc kỹ đoạn văn bên trên chưa?</h3>
                    {docSummary && <SetSummaryLine summary={docSummary} />}
                    <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                      Trả lời câu hỏi trắc nghiệm để kiểm tra khả năng đọc hiểu của bạn.
                    </p>
                  </div>
                  <div className="flex justify-center pt-2">
                    <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                      Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 text-center font-sans leading-relaxed pt-1">
                  Bài tập đọc đang được cập nhật. Mục này không ảnh hưởng tới việc hoàn thành bài học.
                </p>
              )}
            </div>
          )}
```

thành:

```tsx
          {bottomTab === "doc" && lesson.readingPassages.length > 0 && (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
              </div>
              {lesson.hasDocQuestions === true ? (
                <>
                  <h3 className="text-sm font-display font-extrabold text-slate-800">Sẵn sàng luyện đọc chưa?</h3>
                  {docSummary && <SetSummaryLine summary={docSummary} />}
                  <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                    Bấm bắt đầu để đọc từng đoạn văn và trả lời câu hỏi trắc nghiệm đi kèm.
                  </p>
                  <div className="flex justify-center pt-2">
                    <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                      Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                  Bài tập đọc đang được cập nhật. Mục này không ảnh hưởng tới việc hoàn thành bài học.
                </p>
              )}
            </div>
          )}
```

`MarkdownBlock` import ở đầu file **giữ nguyên** (vẫn dùng cho tab Ngữ pháp/Nói). `lesson.readingPassages` vẫn dùng để gate `visibleTabs` (dòng 68), không đổi.

- [ ] **Step 2: Typecheck**

```bash
npm run lint
```

- [ ] **Step 3: Test thủ công trên browser**

Vào 1 bài học có bài đọc, mở tab "Đọc": xác nhận không còn thấy đoạn văn, chỉ thấy "Sẵn sàng luyện đọc chưa?" + mô tả + nút "Bắt đầu bài tập đọc" — giống hệt bố cục tab "Nghe".

- [ ] **Step 4: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat(lesson): bỏ preview văn bản ở tab Lesen, chỉ còn CTA giống tab Nghe"
```

---

## Task 5: `AdminReadingExerciseSection.tsx` — nhóm bài đọc theo Level giống Ngữ pháp

**Files:**
- Modify: `src/pages/admin/AdminReadingExerciseSection.tsx:1-2, 110-121, 352-548`

**Interfaces:**
- Consumes: `AdminModuleGroup` (đã có, `src/pages/admin/AdminModuleGroup.tsx`, props `{title, subtitle, expanded, onToggle, children}` — không đổi).
- Không đổi export `AdminReadingExerciseSection` (vẫn `React.FC` không props, dùng nguyên trong `AdminQuizSection.tsx`).

Admin "Ngữ pháp"/"Nghe" (`AdminGrammarExerciseSection.tsx`) đã hiện danh sách bài học bọc trong `AdminModuleGroup` theo Level (A1/A2/B1/B2), có ô tìm kiếm, và dòng tiêu đề mỗi bài học dạng "X bài - Y câu". `AdminReadingExerciseSection.tsx` hiện chỉ render 1 danh sách bài học phẳng (`orderedLessons.map(...)`, không nhóm theo Level, không có ô tìm kiếm). Task này bọc lại đúng cấu trúc đó, tái dùng nguyên `AdminModuleGroup` — không đổi bất kỳ logic CRUD nào bên trong (thêm/sửa/xoá văn bản, câu hỏi, set).

- [ ] **Step 1: Thêm import `AdminModuleGroup` + icon `Search`**

Sửa dòng 1-2 từ:

```tsx
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2, Pencil, X, Eye, FileText } from "lucide-react";
```

thành:

```tsx
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2, Pencil, X, Eye, FileText, Search } from "lucide-react";
import { AdminModuleGroup } from "./AdminModuleGroup";
```

- [ ] **Step 2: Thêm state `search` + `moduleExpanded`**

Trong `AdminReadingExerciseSection`, ngay sau `const [expanded, setExpanded] = useState<Record<string, boolean>>({});` (dòng 114), thêm:

```tsx
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
```

- [ ] **Step 3: Tính `moduleSections` từ `moduleOrder` + `search`, đặt cạnh `orderedLessons`**

Sửa đoạn tính `orderedLessons` (dòng 347-350) từ:

```tsx
  const orderedLessons = moduleOrder
    .flatMap((mod) => mod.lessonIds)
    .map((lid) => lessons.find((l) => l.lesson_id === lid))
    .filter((l): l is LessonGroup => !!l);
```

thành:

```tsx
  const filteredLessons = lessons.filter(
    (l) =>
      l.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      l.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  const moduleSections = moduleOrder
    .map((mod) => ({
      id: mod.id,
      level: mod.level,
      lessonGroups: mod.lessonIds
        .map((lid) => filteredLessons.find((l) => l.lesson_id === lid))
        .filter((l): l is LessonGroup => !!l),
    }))
    .filter((mod) => mod.lessonGroups.length > 0);
```

(`orderedLessons` không còn dùng ở đâu khác trong file — xoá hẳn, không giữ lại biến chết.)

- [ ] **Step 4: Bọc phần render bài học trong `AdminModuleGroup`, thêm header + ô tìm kiếm**

Sửa dòng 352-548 (từ `return (` đến hết `orderedLessons.map(...)` trước khối `{deleteSetTarget && (`) — đổi nguyên khối mở đầu:

```tsx
  return (
    <div className="space-y-3">
      {orderedLessons.map((lesson) => {
```

thành:

```tsx
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Bài tập đọc</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm bài học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        {moduleSections.map((mod) => (
          <AdminModuleGroup
            key={mod.id}
            title={mod.level}
            subtitle={`${mod.lessonGroups.length} bài học`}
            expanded={!!moduleExpanded[mod.id]}
            onToggle={() => setModuleExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
          >
      {mod.lessonGroups.map((lesson) => {
```

Vì phần thân bên trong (`lessonSets`, `isExpanded`, JSX của từng lesson card...) giữ nguyên logic — chỉ đổi tên biến vòng lặp ngoài cùng (từ `orderedLessons.map((lesson) =>` sang `mod.lessonGroups.map((lesson) =>` bên trong `AdminModuleGroup`), **thụt lề toàn bộ khối thân JSX bên trong thêm 2 cấp** (khớp với 2 lớp bọc mới: `<div className="space-y-3">` ngoài `moduleSections.map` + `<AdminModuleGroup>`). Nội dung JSX bên trong (từ dòng 358 `<div key={lesson.lesson_id} ...>` đến hết map callback ở dòng 546 `);`) **không đổi 1 ký tự nào ngoài thụt lề**.

Sau khi hết `{lessonSets.map((set) => {...})}` và đóng div bài học (nguyên bản kết thúc ở dòng 546 `);` rồi dòng 547 `})}` đóng `orderedLessons.map`), đóng thêm 2 tầng mới:

```tsx
      })}
          </AdminModuleGroup>
        ))}
        {moduleSections.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>
```

thay cho dòng đóng gốc (`})}` một mình, dòng 547 cũ).

Các modal xác nhận xoá (`deleteSetTarget`, `deletePassageTarget`, `itemModal`, `deleteItemTarget`, `previewTarget` — dòng 549-721 bản gốc) **giữ nguyên vị trí, giữ nguyên thụt lề gốc** — chúng nằm ngoài `<div className="space-y-5">` bọc phần list, là sibling của nó trong cùng return, không bị ảnh hưởng bởi việc bọc thêm 2 tầng ở phần list.

- [ ] **Step 5: Typecheck**

```bash
npm run lint
```

Expected: không lỗi. Nếu lỗi thụt lề/đóng ngoặc JSX — đối chiếu lại số lượng `<div>`/`</div>`/`(`/`)` mở-đóng khớp với 2 tầng bọc mới (`<div className="space-y-3">` bên trong `moduleSections.map` + `<AdminModuleGroup>`).

- [ ] **Step 6: Test thủ công trên browser**

Vào Admin → tab "Đọc": xác nhận thấy bố cục giống hệt tab "Ngữ pháp" — nhóm theo Level (A1/A2/B1/B2), mỗi Level có subtitle "N bài học", click mở ra danh sách bài học y hệt trước (mỗi bài học vẫn hiện đúng số "bài đọc", các nút Thêm bài đọc/Thêm văn bản/Thêm loại câu hỏi/Thêm câu hỏi, xoá, sửa, preview đều hoạt động như cũ). Gõ vào ô tìm kiếm, xác nhận lọc đúng theo tên bài học/module.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminReadingExerciseSection.tsx
git commit -m "feat(admin): nhóm bài đọc theo Level giống Ngữ pháp, thêm ô tìm kiếm"
```

---

## Task 6: Push lên `main`

- [ ] **Step 1: Chạy lại toàn bộ test thuần + lint 1 lần cuối**

```bash
node --import tsx --test src/lib/readingSetView.test.ts src/lib/readingExerciseForm.test.ts
npm run lint
```

Expected: tất cả pass, không lỗi.

- [ ] **Step 2: `git log` xác nhận đủ 5 commit của Task 1-5 (cộng thêm commit preview-label đã làm trước đó)**

```bash
git log --oneline -8
```

- [ ] **Step 3: Push**

```bash
git push origin main
```
