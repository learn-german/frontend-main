# Kết quả làm bài gần nhất ở màn hình học Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 dòng tóm tắt "N/M bài đã đạt · Lần gần nhất: X% · <thời gian>" ở đầu tab quiz/nghe/đọc trong `LessonDetailPage.tsx`, chỉ hiện khi học viên đã từng nộp bài category đó.

**Architecture:** 1 hàm thuần `summarizeAttempts` gộp dữ liệu thô thành `LessonSetSummary`; 1 hook `useLessonSetSummary` gọi 3 query Supabase (sets → non-empty check + attempts song song) rồi gọi hàm thuần; render 1 dòng text ở 3 chỗ trong `LessonDetailPage.tsx`.

**Tech Stack:** React 19 + TypeScript 5.8, Supabase JS client. Test bằng `node:test` qua `npx tsx --test <path>`.

## Global Constraints

- Không dùng `any`.
- Không hiện gì thêm khi chưa từng nộp bài (giữ nguyên UI hiện tại).
- Lỗi fetch → fail-open, không chặn nút "Bắt đầu".
- Thời gian hiển thị bằng `toLocaleString("vi-VN")`, khớp `LessonDetailPage.tsx:419`.
- Chạy `npm run lint` sau mỗi task đụng TypeScript.

---

### Task 1: Hàm thuần `summarizeAttempts`

**Files:**
- Create: `src/lib/lessonSetSummary.ts`
- Test: `src/lib/lessonSetSummary.test.ts`

**Interfaces:**
- Produces: `interface LessonSetSummary { passedCount: number; totalCount: number; latestScore: number; latestSubmittedAt: string }`; `function summarizeAttempts(nonEmptySetIds: string[], attempts: { set_id: string; is_passed: boolean; score: number; submitted_at: string }[]): LessonSetSummary | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/lessonSetSummary.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAttempts } from "./lessonSetSummary";

test("chưa có attempt nào -> null", () => {
  assert.equal(summarizeAttempts(["s1", "s2"], []), null);
});

test("đếm đúng passedCount/totalCount theo set không rỗng", () => {
  const r = summarizeAttempts(
    ["s1", "s2", "s3"],
    [
      { set_id: "s1", is_passed: true, score: 100, submitted_at: "2026-08-01T10:00:00Z" },
      { set_id: "s2", is_passed: false, score: 60, submitted_at: "2026-08-02T10:00:00Z" },
    ],
  );
  assert.equal(r?.passedCount, 1);
  assert.equal(r?.totalCount, 3);
});

test("attempt của set không nằm trong nonEmptySetIds bị bỏ qua", () => {
  const r = summarizeAttempts(
    ["s1"],
    [
      { set_id: "s1", is_passed: true, score: 100, submitted_at: "2026-08-01T10:00:00Z" },
      { set_id: "phantom", is_passed: true, score: 100, submitted_at: "2026-08-03T10:00:00Z" },
    ],
  );
  assert.equal(r?.totalCount, 1);
  assert.equal(r?.latestScore, 100);
  assert.equal(r?.latestSubmittedAt, "2026-08-01T10:00:00Z");
});

test("latestScore/latestSubmittedAt lấy từ attempt có submitted_at lớn nhất, không phải phần tử cuối mảng", () => {
  const r = summarizeAttempts(
    ["s1", "s2"],
    [
      { set_id: "s2", is_passed: true, score: 100, submitted_at: "2026-08-05T09:00:00Z" },
      { set_id: "s1", is_passed: false, score: 40, submitted_at: "2026-08-05T15:00:00Z" },
    ],
  );
  assert.equal(r?.latestScore, 40);
  assert.equal(r?.latestSubmittedAt, "2026-08-05T15:00:00Z");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/lessonSetSummary.test.ts`
Expected: FAIL — `Cannot find module './lessonSetSummary'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/lessonSetSummary.ts

export interface LessonSetSummary {
  passedCount: number;
  totalCount: number;
  latestScore: number;
  latestSubmittedAt: string;
}

interface AttemptRow {
  set_id: string;
  is_passed: boolean;
  score: number;
  submitted_at: string;
}

/**
 * Gộp attempt thô thành tóm tắt hiển thị ở màn hình học. Chỉ tính set nằm
 * trong nonEmptySetIds (set rỗng đã bị lọc trước đó) — nếu không có attempt
 * hợp lệ nào, trả null để phân biệt "chưa từng nộp" với "đã nộp nhưng 0/0".
 */
export function summarizeAttempts(
  nonEmptySetIds: string[],
  attempts: AttemptRow[],
): LessonSetSummary | null {
  const validSetIds = new Set(nonEmptySetIds);
  const validAttempts = attempts.filter((a) => validSetIds.has(a.set_id));
  if (validAttempts.length === 0) return null;

  const passedCount = validAttempts.filter((a) => a.is_passed).length;
  const latest = validAttempts.reduce((a, b) =>
    new Date(a.submitted_at) > new Date(b.submitted_at) ? a : b,
  );

  return {
    passedCount,
    totalCount: nonEmptySetIds.length,
    latestScore: latest.score,
    latestSubmittedAt: latest.submitted_at,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/lessonSetSummary.test.ts`
Expected: PASS — 4/4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lessonSetSummary.ts src/lib/lessonSetSummary.test.ts
git commit -m "feat: add summarizeAttempts for lesson set summary"
```

---

### Task 2: Hook `useLessonSetSummary`

**Files:**
- Create: `src/lib/hooks/useLessonSetSummary.ts`

**Interfaces:**
- Consumes: `summarizeAttempts`, `LessonSetSummary` (Task 1); `QuizCategory` từ `../completion`; `supabase` từ `../supabase`.
- Produces: `useLessonSetSummary(lessonId: string, category: QuizCategory): { summary: LessonSetSummary | null; loading: boolean }`.

- [ ] **Step 1: Viết implementation** (hook gọi Supabase — không test tự động, theo đúng giới hạn effort các hook tương tự đã làm trong Spec A; verify ở Task 4 bằng trình duyệt)

```ts
// src/lib/hooks/useLessonSetSummary.ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { QuizCategory } from "../completion";
import { summarizeAttempts, type LessonSetSummary } from "../lessonSetSummary";

/**
 * Tóm tắt kết quả làm bài gần nhất của 1 lesson+category cho học viên hiện
 * tại — dùng cho khối "N/M bài đã đạt" ở LessonDetailPage. null nghĩa là
 * đang tải HOẶC chưa từng nộp bài category này (component cha không hiện
 * gì thêm trong cả 2 trường hợp, không cần phân biệt).
 */
export function useLessonSetSummary(
  lessonId: string,
  category: QuizCategory,
): { summary: LessonSetSummary | null; loading: boolean } {
  const [summary, setSummary] = useState<LessonSetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", lessonId)
      .eq("category", category)
      .eq("status", "published")
      .then(async ({ data: sets }) => {
        const candidateIds = (sets ?? []).map((s) => s.id as string);
        if (candidateIds.length === 0) {
          if (!cancelled) { setSummary(null); setLoading(false); }
          return;
        }

        const [exercisesRes, attemptsRes] = await Promise.all([
          supabase.from("grammar_exercises_public").select("set_id").in("set_id", candidateIds),
          supabase.from("exercise_set_attempts")
            .select("set_id, is_passed, score, submitted_at")
            .in("set_id", candidateIds),
        ]);
        if (cancelled) return;

        const nonEmptySetIds = [...new Set((exercisesRes.data ?? []).map((r) => r.set_id as string))];
        setSummary(summarizeAttempts(nonEmptySetIds, attemptsRes.data ?? []));
        setLoading(false);
      }, () => {
        if (!cancelled) { setSummary(null); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [lessonId, category]);

  return { summary, loading };
}
```

- [ ] **Step 2: `npm run lint` phải pass**

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useLessonSetSummary.ts
git commit -m "feat: add useLessonSetSummary hook"
```

---

### Task 3: Wire vào `LessonDetailPage.tsx`

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: `useLessonSetSummary` (Task 2).

- [ ] **Step 1: Import hook** — thêm sau dòng 19 (`import { useWritingSubmission, ... } from "../lib/hooks/useWritingSubmission";`):

```ts
import { useLessonSetSummary } from "../lib/hooks/useLessonSetSummary";
```

- [ ] **Step 2: Gọi hook 3 lần trong component** (sau dòng 44, `const [marked, setMarked] = useState(isCompleted);`):

```ts
  const { summary: nguphapSummary } = useLessonSetSummary(lesson.id, "nguphap");
  const { summary: ngheSummary } = useLessonSetSummary(lesson.id, "nghe");
  const { summary: docSummary } = useLessonSetSummary(lesson.id, "doc");
```

- [ ] **Step 3: Component dòng tóm tắt dùng chung** — thêm ngay trên `export const LessonDetailPage`:

```tsx
const SetSummaryLine: React.FC<{ summary: { passedCount: number; totalCount: number; latestScore: number; latestSubmittedAt: string } }> = ({ summary }) => (
  <p className="text-xs text-slate-400 font-sans">
    {summary.passedCount}/{summary.totalCount} bài đã đạt · Lần gần nhất: {summary.latestScore}% ·{" "}
    {new Date(summary.latestSubmittedAt).toLocaleString("vi-VN")}
  </p>
);
```

- [ ] **Step 4: Chèn vào tab "quiz"** (dòng 226-231, ngay dưới `<h3>`):

```tsx
          {bottomTab === "quiz" && (
            <div className="text-center space-y-4">
              <h3 className="text-sm font-display font-extrabold text-slate-800">Bạn đã hoàn tất bài giảng lý thuyết chứ?</h3>
              {nguphapSummary && <SetSummaryLine summary={nguphapSummary} />}
              <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
```
(chỉ thêm dòng `{nguphapSummary && ...}`, giữ nguyên phần còn lại của block)

- [ ] **Step 5: Chèn vào tab "nghe"** (trong nhánh `hasNgheQuestions === true`, dòng 270-271, ngay dưới `<h3>Sẵn sàng luyện nghe chưa?</h3>`):

```tsx
                <>
                  <h3 className="text-sm font-display font-extrabold text-slate-800">Sẵn sàng luyện nghe chưa?</h3>
                  {ngheSummary && <SetSummaryLine summary={ngheSummary} />}
                  <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
```

- [ ] **Step 6: Chèn vào tab "doc"** (trong nhánh `hasDocQuestions === true`, dòng 307-309, ngay dưới `<h3>Đã đọc kỹ đoạn văn bên trên chưa?</h3>`):

```tsx
                  <div className="text-center space-y-2 pt-1">
                    <h3 className="text-sm font-display font-extrabold text-slate-800">Đã đọc kỹ đoạn văn bên trên chưa?</h3>
                    {docSummary && <SetSummaryLine summary={docSummary} />}
                    <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
```

- [ ] **Step 7: `npm run lint` phải pass**

- [ ] **Step 8: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: show latest exercise result summary on lesson screen"
```

---

### Task 4: Xác minh thủ công trên trình duyệt

**Files:** không sửa code.

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Mở 1 lesson chưa từng làm bài ngữ pháp** — tab quiz không hiện dòng tóm tắt nào (giữ nguyên UI cũ).
- [ ] **Step 3: Nộp bài 1 set bất kỳ, bấm "Trở về bài học"** — tab quiz hiện đúng "N/M bài đã đạt · Lần gần nhất: X% · <giờ vừa nộp>", không cần F5.
- [ ] **Step 4: Nộp thêm 1 set khác cùng category** — quay lại lesson, số liệu cập nhật đúng theo lần nộp mới nhất.
- [ ] **Step 5: Lặp lại Step 2-4 cho tab Nghe và Đọc** (lesson nào có `hasNgheQuestions`/`hasDocQuestions` = true).

## Self-Review

**Spec coverage:** không hiện gì khi chưa nộp bài (Step 2, Task 3 Step 4/6 gate bằng `summary &&`) → Task 3+4. Số liệu đúng N/M, %, thời gian → Task 1 test + Task 4 Step 3. Set rỗng không tính vào totalCount → Task 1 test "attempt của set không nằm trong nonEmptySetIds bị bỏ qua" + hook lọc qua `grammar_exercises_public`. Cập nhật không cần reload → đã xác nhận cơ chế remount qua `key` ở `App.tsx` trong spec, không cần task riêng, verify ở Task 4 Step 3. Đủ 3 tab → Task 3 Step 4-6. Lỗi fetch không chặn nút → hook fail-open (catch branch trả `summary: null`, không throw).

**Placeholder scan:** không còn TBD/"tương tự Task N" — mọi step có code đầy đủ.

**Type consistency:** `LessonSetSummary` định nghĩa 1 lần ở Task 1 (`passedCount`, `totalCount`, `latestScore`, `latestSubmittedAt`), dùng nguyên văn ở Task 2 (hook) và Task 3 (`SetSummaryLine` props, khớp tên field).
