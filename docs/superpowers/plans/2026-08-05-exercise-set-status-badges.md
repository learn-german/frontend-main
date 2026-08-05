# Badge trạng thái bài tập + ẩn set rỗng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Badge trạng thái bài tập có 4 giá trị (Chưa làm/Đang làm/Chưa đạt/Đã đạt) thay vì 2, có toast xác nhận khi Lưu, và set không còn câu hỏi nào không hiển thị cho học viên.

**Architecture:** 2 hook batched mới (`useNonEmptySetIds`, `useExerciseSetDrafts`) theo đúng pattern `useExerciseSetAttempts` đã có; 1 hàm thuần `computeSetStatus` dùng chung giữa `GrammarSetListPage.tsx` và `QuizSetListPage.tsx`; `saveDraft` đổi để trả `{error}` ra ngoài thay vì nuốt lỗi.

**Tech Stack:** React 19 + TypeScript 5.8, Supabase JS client, Tailwind v4. Test bằng `node:test` chạy qua `npx tsx --test <path>`.

## Global Constraints

- Không dùng `any` — dùng type cụ thể.
- Không dùng `window.alert()`/`window.confirm()` — dùng `showToast()` từ `src/lib/toast.ts`.
- Không sửa `src/lib/database.types.ts` bằng tay.
- Không đổi Admin (`AdminGrammarExerciseSection.tsx` và tương tự) — set rỗng vẫn phải hiện ở đó.
- Không đổi schema DB, không đổi cách tính điểm ở `grammar-submit`.
- Chạy `npm run lint` (tsc --noEmit) sau mỗi task đụng TypeScript.

---

### Task 1: Hàm thuần `computeSetStatus` + nhãn/màu badge

**Files:**
- Create: `src/lib/exerciseSetStatus.ts`
- Test: `src/lib/exerciseSetStatus.test.ts`

**Interfaces:**
- Produces: `type SetStatus = "not_started" | "in_progress" | "failed" | "passed"`; `computeSetStatus(attempt: { isPassed: boolean } | undefined, hasDraft: boolean): SetStatus`; `SET_STATUS_LABEL: Record<SetStatus, string>`; `SET_STATUS_BADGE_CLASS: Record<SetStatus, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/exerciseSetStatus.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeSetStatus } from "./exerciseSetStatus";

test("chưa có draft, chưa có attempt → not_started", () => {
  assert.equal(computeSetStatus(undefined, false), "not_started");
});

test("có draft, chưa có attempt → in_progress", () => {
  assert.equal(computeSetStatus(undefined, true), "in_progress");
});

test("có attempt chưa đạt, không draft → failed", () => {
  assert.equal(computeSetStatus({ isPassed: false }, false), "failed");
});

test("có attempt chưa đạt VÀ có draft → in_progress (draft thắng)", () => {
  assert.equal(computeSetStatus({ isPassed: false }, true), "in_progress");
});

test("có attempt đã đạt → passed, bất kể draft", () => {
  assert.equal(computeSetStatus({ isPassed: true }, false), "passed");
  assert.equal(computeSetStatus({ isPassed: true }, true), "passed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/exerciseSetStatus.test.ts`
Expected: FAIL — `Cannot find module './exerciseSetStatus'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/exerciseSetStatus.ts

/**
 * Trạng thái hiển thị cho 1 exercise set trong danh sách bài tập của học
 * viên. Draft thắng attempt cũ khi cả hai cùng tồn tại — nhất quán với
 * pickHydrateSource() trong exerciseSetDraftLogic.ts (học viên đang sửa
 * lại bài quan trọng hơn kết quả đã nộp trước đó).
 */
export type SetStatus = "not_started" | "in_progress" | "failed" | "passed";

export function computeSetStatus(
  attempt: { isPassed: boolean } | undefined,
  hasDraft: boolean,
): SetStatus {
  if (attempt?.isPassed) return "passed";
  if (hasDraft) return "in_progress";
  if (attempt) return "failed";
  return "not_started";
}

export const SET_STATUS_LABEL: Record<SetStatus, string> = {
  passed: "Đã đạt",
  in_progress: "Đang làm",
  failed: "Chưa đạt",
  not_started: "Chưa làm",
};

export const SET_STATUS_BADGE_CLASS: Record<SetStatus, string> = {
  passed: "bg-green-50 text-green-700",
  in_progress: "bg-blue-50 text-blue-700",
  failed: "bg-orange-50 text-orange-700",
  not_started: "bg-slate-100 text-slate-500",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/exerciseSetStatus.test.ts`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exerciseSetStatus.ts src/lib/exerciseSetStatus.test.ts
git commit -m "feat: add computeSetStatus for 4-state exercise set badge"
```

---

### Task 2: Hook `useNonEmptySetIds`

**Files:**
- Create: `src/lib/hooks/useNonEmptySetIds.ts`

**Interfaces:**
- Consumes: `supabase` client từ `../supabase` (đã có, xem `useExerciseSetAttempt.ts`).
- Produces: `useNonEmptySetIds(setIds: string[]): { nonEmptySetIds: Set<string>; loading: boolean }`.

- [ ] **Step 1: Viết implementation** (hook gọi Supabase — không có test tự động, theo đúng giới hạn effort đã áp dụng cho các hook tương tự như `useExerciseSetAttempts`; verify ở Task 9 bằng trình duyệt)

```ts
// src/lib/hooks/useNonEmptySetIds.ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

/**
 * Set nào có ít nhất 1 câu hỏi trong grammar_exercises_public — dùng để ẩn
 * set đã bị xoá hết câu hỏi (nhưng chưa xoá chính set) khỏi danh sách bài
 * tập của học viên. Cùng bảng câu hỏi dùng chung cho cả 3 category, xem
 * useGrammarExercises.ts.
 */
export function useNonEmptySetIds(setIds: string[]): {
  nonEmptySetIds: Set<string>;
  loading: boolean;
} {
  const [nonEmptySetIds, setNonEmptySetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setNonEmptySetIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("grammar_exercises_public")
      .select("set_id")
      .in("set_id", setIds)
      .then(({ data }) => {
        setNonEmptySetIds(new Set((data ?? []).map((row) => row.set_id as string)));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { nonEmptySetIds, loading };
}
```

- [ ] **Step 2: `npm run lint` phải pass, không lỗi TypeScript mới**

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useNonEmptySetIds.ts
git commit -m "feat: add useNonEmptySetIds hook to detect sets with 0 questions"
```

---

### Task 3: Hook `useExerciseSetDrafts`

**Files:**
- Create: `src/lib/hooks/useExerciseSetDrafts.ts`

**Interfaces:**
- Produces: `useExerciseSetDrafts(setIds: string[]): { draftSetIds: Set<string>; loading: boolean; markDraftSaved: (setId: string, hasDraft: boolean) => void }`.

- [ ] **Step 1: Viết implementation** (mirror `useExerciseSetAttempts` trong `useExerciseSetAttempt.ts:79-122`, không có test tự động — lý do như Task 2)

```ts
// src/lib/hooks/useExerciseSetDrafts.ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

/**
 * Set nào đang có draft (đã lưu, chưa nộp) — cho badge "Đang làm" ở danh
 * sách set. Mirror useExerciseSetAttempts trong useExerciseSetAttempt.ts.
 */
export function useExerciseSetDrafts(setIds: string[]): {
  draftSetIds: Set<string>;
  loading: boolean;
  markDraftSaved: (setId: string, hasDraft: boolean) => void;
} {
  const [draftSetIds, setDraftSetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setDraftSetIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("exercise_set_drafts")
      .select("set_id")
      .in("set_id", setIds)
      .then(({ data }) => {
        setDraftSetIds(new Set((data ?? []).map((row) => row.set_id as string)));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cập nhật lạc quan ngay sau khi Lưu/Nộp bài — fetch ở trên chỉ chạy 1
  // lần theo setIds nên không tự phản ánh thay đổi trong cùng phiên.
  const markDraftSaved = (setId: string, hasDraft: boolean) => {
    setDraftSetIds((prev) => {
      const next = new Set(prev);
      if (hasDraft) next.add(setId);
      else next.delete(setId);
      return next;
    });
  };

  return { draftSetIds, loading, markDraftSaved };
}
```

- [ ] **Step 2: `npm run lint` phải pass**

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useExerciseSetDrafts.ts
git commit -m "feat: add useExerciseSetDrafts hook for in-progress badge"
```

---

### Task 4: `saveDraft` trả lỗi thay vì nuốt

**Files:**
- Modify: `src/lib/hooks/useExerciseSetDraft.ts:14-53`

**Interfaces:**
- Produces: `saveDraft(answers: Record<string, string>): Promise<{ error: string | null }>` (đổi từ `Promise<void>`).
- Note cho task sau: callers hiện có gọi fire-and-forget (không await, không đọc return) trong autosave debounce — vẫn compile được, không cần sửa. Chỉ nút "Lưu" tường minh (Task 6, Task 8) cần đọc `{error}`.

- [ ] **Step 1: Sửa `saveDraft` để trả `{error}`**

Trong `src/lib/hooks/useExerciseSetDraft.ts`, đổi khai báo kiểu trả về của hook (dòng 14-19) và thân `saveDraft` (dòng 43-53):

```ts
export function useExerciseSetDraft(setId: string): {
  draft: SetDraft | null;
  loading: boolean;
  saveDraft: (answers: Record<string, string>) => Promise<{ error: string | null }>;
  deleteDraft: () => Promise<void>;
} {
```

```ts
  const saveDraft = useCallback(
    async (answers: Record<string, string>): Promise<{ error: string | null }> => {
      if (!setId || !hasAnyAnswer(answers)) return { error: null };
      const { error } = await supabase.from("exercise_set_drafts").upsert(
        { set_id: setId, answers, updated_at: new Date().toISOString() },
        { onConflict: "user_id,set_id" },
      );
      if (!error) setDraft({ answers });
      return { error: error ? error.message : null };
    },
    [setId],
  );
```

- [ ] **Step 2: `npm run lint`** — phải pass. Các call site hiện có (`GrammarExercisePage.tsx:464`, `QuizSetListPage.tsx:213`) gọi `saveDraft(...)` không await/không đọc kết quả trong `useEffect` debounce — TypeScript không báo lỗi vì bỏ qua Promise trả về là hợp lệ.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useExerciseSetDraft.ts
git commit -m "fix: saveDraft returns {error} instead of swallowing it"
```

---

### Task 5: Wire vào `GrammarSetListPage.tsx` — ẩn set rỗng + badge 4 trạng thái

**Files:**
- Modify: `src/pages/GrammarSetListPage.tsx`

**Interfaces:**
- Consumes: `computeSetStatus`, `SET_STATUS_LABEL`, `SET_STATUS_BADGE_CLASS` (Task 1); `useNonEmptySetIds` (Task 2); `useExerciseSetDrafts` (Task 3).
- Produces: `SetRow` nhận `status: SetStatus` (thay `isPassed: boolean`) và `onDraftSaved: (hasDraft: boolean) => void`.

- [ ] **Step 1: Import hook/hàm mới**

Thêm vào đầu file (sau dòng 7):

```ts
import { useNonEmptySetIds } from "../lib/hooks/useNonEmptySetIds";
import { useExerciseSetDrafts } from "../lib/hooks/useExerciseSetDrafts";
import { computeSetStatus, SET_STATUS_LABEL, SET_STATUS_BADGE_CLASS, type SetStatus } from "../lib/exerciseSetStatus";
```

- [ ] **Step 2: Đổi prop `SetRow` từ `isPassed` sang `status` + thêm `onDraftSaved`**

Thay dòng 22-30:

```ts
const SetRow: React.FC<{
  set: ExerciseSet;
  orderNumber: number;
  status: SetStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ set, orderNumber, status, isExpanded, onToggle, onSetFinished, onAttemptUpdate, onDraftSaved }) => {
```

Thay badge JSX dòng 60-69:

```tsx
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {status === "passed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          <span
            className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${SET_STATUS_BADGE_CLASS[status]}`}
          >
            {SET_STATUS_LABEL[status]}
          </span>
        </span>
```

Thêm `onDraftSaved={onDraftSaved}` vào props của `GrammarExerciseSetBody` (dòng 73-78):

```tsx
          <GrammarExerciseSetBody
            set={{ id: set.id, title: set.title }}
            onSetFinished={onSetFinished}
            onCollapse={onToggle}
            onAttemptUpdate={onAttemptUpdate}
            onDraftSaved={onDraftSaved}
          />
```

- [ ] **Step 3: Lọc set rỗng trước khi đánh số, fetch attempts+drafts song song (không waterfall)**

Thay thân `GrammarSetListPage` (dòng 90-102):

```ts
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const candidateSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lessonId && s.category === "nguphap" && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lessonId],
  );
  const candidateSetIds = useMemo(() => candidateSets.map((s) => s.id), [candidateSets]);
  const { attemptsBySetId, loading: attemptsLoading, updateAttempt } = useExerciseSetAttempts(candidateSetIds);
  const { draftSetIds, loading: draftsLoading, markDraftSaved } = useExerciseSetDrafts(candidateSetIds);
  const { nonEmptySetIds, loading: nonEmptyLoading } = useNonEmptySetIds(candidateSetIds);
  const lessonSets = useMemo(
    () => candidateSets.filter((s) => nonEmptySetIds.has(s.id)),
    [candidateSets, nonEmptySetIds],
  );
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  if (setsLoading || attemptsLoading || draftsLoading || nonEmptyLoading) {
```

(3 hook mới đều nhận `candidateSetIds` — chạy song song với nhau, không chờ nhau — `lessonSets` chỉ lọc phần hiển thị, không ảnh hưởng thời điểm fetch.)

- [ ] **Step 4: Cập nhật render list (dòng 128-139) để truyền `status`/`onDraftSaved`**

```tsx
        {lessonSets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            orderNumber={index + 1}
            status={computeSetStatus(attemptsBySetId[set.id], draftSetIds.has(set.id))}
            isExpanded={expandedSetId === set.id}
            onToggle={() => setExpandedSetId((prev) => (prev === set.id ? null : set.id))}
            onSetFinished={onSetFinished}
            onAttemptUpdate={(status) => updateAttempt(set.id, status)}
            onDraftSaved={(hasDraft) => markDraftSaved(set.id, hasDraft)}
          />
        ))}
```

- [ ] **Step 5: `npm run lint`** — phải pass, không còn tham chiếu `isPassed` cũ trong file này.

- [ ] **Step 6: Commit**

```bash
git add src/pages/GrammarSetListPage.tsx
git commit -m "feat: 4-state badge + hide empty sets in GrammarSetListPage"
```

---

### Task 6: Wire vào `GrammarExercisePage.tsx` — toast khi Lưu + xoá draft khi nộp bài

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: `showToast` từ `../lib/toast`; `saveDraft` kiểu mới từ Task 4.
- Produces: `GrammarExerciseSetBodyProps` thêm `onDraftSaved?: (hasDraft: boolean) => void`.

- [ ] **Step 1: Import `showToast`**

Thêm sau dòng 3:

```ts
import { showToast } from "../lib/toast";
```

- [ ] **Step 2: Thêm prop `onDraftSaved` vào interface (dòng 24-30) và destructure (dòng 310-315)**

```ts
interface GrammarExerciseSetBodyProps {
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
  /** Cập nhật badge "Đã đạt"/"Chưa làm" ở danh sách set ngay sau khi nộp bài. */
  onAttemptUpdate?: (status: { isPassed: boolean; attemptCount: number }) => void;
  /** Cập nhật badge "Đang làm" ở danh sách set ngay sau khi Lưu/Nộp bài. */
  onDraftSaved?: (hasDraft: boolean) => void;
}
```

```ts
export const GrammarExerciseSetBody: React.FC<GrammarExerciseSetBodyProps> = ({
  set,
  onSetFinished,
  onCollapse,
  onAttemptUpdate,
  onDraftSaved,
}) => {
```

- [ ] **Step 3: `handleSubmit` báo badge hết "Đang làm" sau khi nộp (sau dòng 491 `deleteDraft();`)**

```ts
    onAttemptUpdate?.({ isPassed: res.isPassed, attemptCount: res.attemptCount });
    deleteDraft();
    onDraftSaved?.(false);
```

- [ ] **Step 4: Đổi nút "Lưu" (dòng 860-863) thành async + toast + `onDraftSaved`**

```tsx
        <Button
          variant="secondary"
          onClick={async () => {
            const { error } = await saveDraft(collectAllAnswers());
            if (error) {
              showToast("Không thể lưu, vui lòng thử lại.", "warning");
              return;
            }
            showToast("Đã lưu bài làm dở.", "success");
            onDraftSaved?.(true);
          }}
        >
          Lưu
        </Button>
```

- [ ] **Step 5: `npm run lint`** — phải pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "feat: toast + badge feedback when saving grammar draft"
```

---

### Task 7: Wire vào `QuizSetListPage.tsx` (list) — ẩn set rỗng + badge 4 trạng thái

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: giống Task 5 — `computeSetStatus`, `SET_STATUS_LABEL`, `SET_STATUS_BADGE_CLASS`, `useNonEmptySetIds`, `useExerciseSetDrafts`.
- Produces: `SetRow` (định nghĩa dòng 522-531 trong file này) nhận `status: SetStatus` thay `isPassed`, thêm `onDraftSaved`.

- [ ] **Step 1: Import hook/hàm mới** — thêm sau dòng 9 (`import { useExerciseSetDraft } ...`):

```ts
import { useNonEmptySetIds } from "../lib/hooks/useNonEmptySetIds";
import { useExerciseSetDrafts } from "../lib/hooks/useExerciseSetDrafts";
import { computeSetStatus, SET_STATUS_LABEL, SET_STATUS_BADGE_CLASS, type SetStatus } from "../lib/exerciseSetStatus";
```

- [ ] **Step 2: Đổi prop `SetRow` (dòng 522-531) từ `isPassed` sang `status` + `onDraftSaved`**

```ts
const SetRow: React.FC<{
  lesson: Lesson;
  set: ExerciseSet;
  orderNumber: number;
  status: SetStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ lesson, set, orderNumber, status, isExpanded, onToggle, onSetFinished, onAttemptUpdate, onDraftSaved }) => (
```

Thay badge JSX (dòng 544-553):

```tsx
    <span className="ml-auto flex items-center gap-2 shrink-0">
      {status === "passed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
      <span
        className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${SET_STATUS_BADGE_CLASS[status]}`}
      >
        {SET_STATUS_LABEL[status]}
      </span>
    </span>
```

Thêm `onDraftSaved={onDraftSaved}` vào props của `QuizExerciseSetBody` (dòng 559-563):

```tsx
        <QuizExerciseSetBody
          lesson={lesson}
          set={{ id: set.id, title: set.title }}
          onSetFinished={onSetFinished}
          onCollapse={onToggle}
          onAttemptUpdate={onAttemptUpdate}
          onDraftSaved={onDraftSaved}
        />
```

- [ ] **Step 3: Lọc set rỗng trước khi đánh số trong `QuizSetListPage` (dòng 575-585)**

```ts
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const candidateSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lesson.id && s.category === category && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lesson.id, category],
  );
  const candidateSetIds = useMemo(() => candidateSets.map((s) => s.id), [candidateSets]);
  const { attemptsBySetId, loading: attemptsLoading, updateAttempt } = useExerciseSetAttempts(candidateSetIds);
  const { draftSetIds, loading: draftsLoading, markDraftSaved } = useExerciseSetDrafts(candidateSetIds);
  const { nonEmptySetIds, loading: nonEmptyLoading } = useNonEmptySetIds(candidateSetIds);
  const lessonSets = useMemo(
    () => candidateSets.filter((s) => nonEmptySetIds.has(s.id)),
    [candidateSets, nonEmptySetIds],
  );
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const title = category === "nghe" ? "Bài tập nghe" : "Bài tập đọc";

  if (setsLoading || attemptsLoading || draftsLoading || nonEmptyLoading) {
```

- [ ] **Step 4: Cập nhật render list (dòng 614-626)**

```tsx
        {lessonSets.map((set, index) => (
          <SetRow
            key={set.id}
            lesson={lesson}
            set={set}
            orderNumber={index + 1}
            status={computeSetStatus(attemptsBySetId[set.id], draftSetIds.has(set.id))}
            isExpanded={expandedSetId === set.id}
            onToggle={() => setExpandedSetId((prev) => (prev === set.id ? null : set.id))}
            onSetFinished={onSetFinished}
            onAttemptUpdate={(status) => updateAttempt(set.id, status)}
            onDraftSaved={(hasDraft) => markDraftSaved(set.id, hasDraft)}
          />
        ))}
```

- [ ] **Step 5: `npm run lint`** — phải pass (sẽ vẫn báo lỗi cho đến khi Task 8 thêm `onDraftSaved` vào `QuizExerciseSetBodyProps` — 2 task này đụng cùng file, chạy liền nhau trước khi commit riêng Task 7 là ổn vì `QuizExerciseSetBody` đã nhận object props mở — xem Task 8 Step 1 áp dụng ngay sau, gộp lint 1 lần cuối Task 8).

- [ ] **Step 6: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat: 4-state badge + hide empty sets in QuizSetListPage list"
```

---

### Task 8: Wire vào `QuizSetListPage.tsx` (`QuizExerciseSetBody`) — toast khi Lưu + xoá draft khi nộp bài

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: `showToast` từ `../lib/toast`.
- Produces: `QuizExerciseSetBody` nhận `onDraftSaved: (hasDraft: boolean) => void` (không optional — parent luôn truyền, giống `onAttemptUpdate` trong file này).

- [ ] **Step 1: Import `showToast`** — thêm sau dòng 14 (`import { supabase } from "../lib/supabase";`):

```ts
import { showToast } from "../lib/toast";
```

- [ ] **Step 2: Thêm prop `onDraftSaved` vào `QuizExerciseSetBody` (dòng 119-125)**

```ts
const QuizExerciseSetBody: React.FC<{
  lesson: Lesson;
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ lesson, set, onSetFinished, onCollapse, onAttemptUpdate, onDraftSaved }) => {
```

- [ ] **Step 3: `handleSubmit` báo hết "Đang làm" sau khi nộp (sau dòng 233 `deleteDraft();`)**

```ts
    onAttemptUpdate({ isPassed: res.isPassed, attemptCount: res.attemptCount });
    deleteDraft();
    onDraftSaved(false);
    onSetFinished(res.lessonQuizScore, res.xpEarned);
```

- [ ] **Step 4: Đổi nút "Lưu" (dòng 510-512) thành async + toast + `onDraftSaved`**

```tsx
        <Button
          variant="secondary"
          onClick={async () => {
            const { error } = await saveDraft(collectAllAnswers());
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
```

- [ ] **Step 5: `npm run lint`** — phải pass, 0 lỗi TypeScript trong toàn bộ file (bao gồm Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat: toast + badge feedback when saving quiz draft"
```

---

### Task 9: Xác minh thủ công trên trình duyệt

**Files:** không sửa code — chỉ chạy `npm run dev` và test tay.

- [ ] **Step 1: Chạy `npm run lint` lần cuối trên toàn repo** — 0 lỗi.

- [ ] **Step 2: Mở 1 lesson có bài tập ngữ pháp, vào tab bài tập, mở 1 set "Chưa làm"** — điền 1 phần đáp án, bấm "Lưu" → thấy toast "Đã lưu bài làm dở." và badge của set đó đổi thành "Đang làm" ngay, không cần reload.

- [ ] **Step 3: Reload trang, mở lại set đó** — đáp án đã gõ vẫn còn (hydrate từ draft, không đổi ở phase này), badge vẫn "Đang làm".

- [ ] **Step 4: Trả lời hết, nộp bài với điểm dưới 80%** — badge đổi thành "Chưa đạt" (không phải "Chưa làm"), không còn "Đang làm".

- [ ] **Step 5: Làm lại, trả lời đúng hết, nộp bài đạt ≥80%** — badge đổi thành "Đã đạt".

- [ ] **Step 6: Trong Supabase Studio (hoặc `execute_sql` qua MCP), xoá hết câu hỏi của 1 set đang "published"** (`DELETE FROM grammar_exercises WHERE set_id = '<id>'`) — reload trang danh sách bài tập, set đó biến mất, số "Bài N" của các set còn lại liền mạch 1,2,3...

- [ ] **Step 7: Vào trang Admin, xác nhận set rỗng ở Step 6 vẫn hiện và sửa được** (không bị ảnh hưởng bởi thay đổi này).

- [ ] **Step 8: Lặp lại Step 2-6 cho tab Nghe và tab Đọc** (dùng chung code path qua `category` prop).

- [ ] **Step 9: Test lỗi lưu** — tắt mạng (DevTools → Network → Offline), bấm "Lưu" → thấy toast "Không thể lưu, vui lòng thử lại.", badge không đổi thành "Đang làm". Bật lại mạng.

## Self-Review

**Spec coverage:**
- Badge 4 trạng thái + toast khi Lưu → Task 1, 4, 6, 8.
- Ẩn set rỗng + đánh số liền mạch → Task 2, 5, 7.
- Admin không đổi → không task nào chạm file Admin, ghi rõ trong Global Constraints.
- Lỗi khi lưu (`error handling` trong spec) → Task 4 (đổi contract) + Task 6/8 (dùng contract) + Task 9 Step 9 (verify tay).

**Placeholder scan:** không còn "TBD"/"tương tự Task N" — mọi step có code đầy đủ.

**Type consistency:** `SetStatus` định nghĩa 1 lần ở Task 1, dùng nguyên văn ở Task 5/7 (không đổi tên). `saveDraft` đổi kiểu trả về ở Task 4, Task 6/8 dùng đúng `{ error }` đã định nghĩa. `onDraftSaved` cùng chữ ký `(hasDraft: boolean) => void` xuyên suốt Task 5-8.
