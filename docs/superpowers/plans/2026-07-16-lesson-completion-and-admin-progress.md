# Lesson Completion Criteria + Admin Progress Detail + Roadmap/Dashboard Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lesson is "completed" only when every quiz category it actually contains (Ngữ pháp always; Nghe if it has audio; Đọc if it has a reading passage) has a `lesson_progress.quiz_score >= 80`. Admins can see, per user, which lesson they've reached and drill into per-lesson/per-category scores. Roadmap/Dashboard get 3 small UX fixes.

**Architecture:** A new pure-logic module (`src/lib/completion.ts`) centralizes the completion/status computation so the learner-facing hook (`useUserStats`) and the new admin progress view derive identical results from the same `lesson_progress` rows. No new Edge Functions or DB migrations — this is entirely a client-side re-derivation of an already-server-computed quiz score (`quiz-submit`'s existing `PASS_THRESHOLD = 80`).

**Tech Stack:** React 19, TypeScript 5.8, Supabase (existing `lesson_progress`/`modules`/`lessons` tables, existing RLS), `tsx` (devDependency, used only to manually verify the pure logic module — no new dependency added).

## Global Constraints

- A category counts toward completion only if it has real content: Ngữ pháp is always required; Nghe is required only if `lesson.audioR2Key || lesson.listeningUrl`; Đọc is required only if `lesson.readingText`. A missing category is skipped, not treated as failed.
- Pass threshold is 80 (matches `quiz-submit`'s existing `PASS_THRESHOLD`), applied per category via `lesson_progress.quiz_score >= 80`.
- No new Edge Functions. No new npm dependencies. No DB migrations (no schema change needed — `lesson_progress.quiz_score`/`category`/`completed_at` already exist).
- Admin progress views must reuse the existing RLS ("lesson_progress: admin read", "lessons: authenticated read" admin branch) — no user_id filter needed when the caller has the admin role.
- The admin per-user detail modal shows only lessons in modules the user has unlocked (matches `unlockedLevels` on that user's profile), and only `status === "published"` lessons (drafts are never shown to admins-as-progress, matching how Roadmap treats them for learners).
- "Đánh dấu đã học" button on `LessonDetailPage` must only render once the lesson's completion criteria (above) is already met — it no longer marks a lesson complete on its own.
- No changes to `quiz-submit`/`lesson-complete` Edge Functions, to XP/streak award amounts, or to the quiz-taking flow itself.

---

### Task 1: Shared completion-logic module

**Files:**
- Create: `src/lib/completion.ts`

**Interfaces:**
- Produces (used by Tasks 3, 5, 8, 9):
  - `export type QuizCategory = "nguphap" | "nghe" | "doc";`
  - `export const PASS_THRESHOLD = 80;`
  - `export interface LessonProgressRow { lesson_id: string; category: string; quiz_score: number | null; completed_at?: string; }`
  - `export interface LessonContentFlags { id: string; audioR2Key?: string; listeningUrl?: string; readingText?: string; }`
  - `export function applicableCategories(lesson: LessonContentFlags): QuizCategory[]`
  - `export function isLessonComplete(lesson: LessonContentFlags, scoresByCategory: Partial<Record<QuizCategory, number>>): boolean`
  - `export function buildScoresByLesson(progressRows: LessonProgressRow[]): Record<string, Partial<Record<QuizCategory, number>>>`
  - `export function computeCompletedLessons(lessons: LessonContentFlags[], progressRows: LessonProgressRow[]): string[]`
  - `export type LessonStatus = "completed" | "current" | "locked";`
  - `export function computeLessonStatuses<T extends { id: string }>(orderedLessons: T[], completedIds: string[]): Record<string, LessonStatus>`
  - `export function furthestCompletedLesson<T extends { id: string }>(orderedLessons: T[], completedIds: string[]): T | undefined`
- This module has no dependency on React, Supabase, or `appTypes.ts` — every function takes plain data and returns plain data, so it's independently checkable with a throwaway script.

- [ ] **Step 1: Create the file**

Write `src/lib/completion.ts`:

```ts
export type QuizCategory = "nguphap" | "nghe" | "doc";

export const PASS_THRESHOLD = 80;

export interface LessonProgressRow {
  lesson_id: string;
  category: string;
  quiz_score: number | null;
  completed_at?: string;
}

export interface LessonContentFlags {
  id: string;
  audioR2Key?: string;
  listeningUrl?: string;
  readingText?: string;
}

/**
 * Which quiz categories actually apply to a lesson. Ngữ pháp always applies;
 * Nghe/Đọc only apply if the lesson has audio / a reading passage (mirrors
 * the content-gated "Bắt đầu bài tập" buttons on LessonDetailPage).
 */
export function applicableCategories(lesson: LessonContentFlags): QuizCategory[] {
  const categories: QuizCategory[] = ["nguphap"];
  if (lesson.audioR2Key || lesson.listeningUrl) categories.push("nghe");
  if (lesson.readingText) categories.push("doc");
  return categories;
}

export function isLessonComplete(
  lesson: LessonContentFlags,
  scoresByCategory: Partial<Record<QuizCategory, number>>,
): boolean {
  return applicableCategories(lesson).every(
    (cat) => (scoresByCategory[cat] ?? 0) >= PASS_THRESHOLD,
  );
}

/** Groups raw lesson_progress rows into { lessonId: { category: score } }. */
export function buildScoresByLesson(
  progressRows: LessonProgressRow[],
): Record<string, Partial<Record<QuizCategory, number>>> {
  const map: Record<string, Partial<Record<QuizCategory, number>>> = {};
  for (const row of progressRows) {
    if (row.quiz_score === null || row.quiz_score === undefined) continue;
    const cat = row.category as QuizCategory;
    const existing = map[row.lesson_id] ?? {};
    existing[cat] = row.quiz_score;
    map[row.lesson_id] = existing;
  }
  return map;
}

export function computeCompletedLessons(
  lessons: LessonContentFlags[],
  progressRows: LessonProgressRow[],
): string[] {
  const scoresByLesson = buildScoresByLesson(progressRows);
  return lessons
    .filter((lesson) => isLessonComplete(lesson, scoresByLesson[lesson.id] ?? {}))
    .map((lesson) => lesson.id);
}

export type LessonStatus = "completed" | "current" | "locked";

/**
 * Sequential status (mirrors RoadmapPage's getLessonStatus): a lesson is
 * "current" if it's the first lesson, or the immediately preceding lesson
 * (in the given order) is completed. Everything else not-yet-completed is
 * "locked". Caller must pass lessons already in the correct display order.
 */
export function computeLessonStatuses<T extends { id: string }>(
  orderedLessons: T[],
  completedIds: string[],
): Record<string, LessonStatus> {
  const completedSet = new Set(completedIds);
  const statuses: Record<string, LessonStatus> = {};
  orderedLessons.forEach((lesson, idx) => {
    if (completedSet.has(lesson.id)) {
      statuses[lesson.id] = "completed";
    } else if (idx === 0 || completedSet.has(orderedLessons[idx - 1].id)) {
      statuses[lesson.id] = "current";
    } else {
      statuses[lesson.id] = "locked";
    }
  });
  return statuses;
}

/** The highest-order lesson (in the given order) that is completed, if any. */
export function furthestCompletedLesson<T extends { id: string }>(
  orderedLessons: T[],
  completedIds: string[],
): T | undefined {
  const completedSet = new Set(completedIds);
  let result: T | undefined;
  for (const lesson of orderedLessons) {
    if (completedSet.has(lesson.id)) result = lesson;
  }
  return result;
}
```

- [ ] **Step 2: Verify manually with a throwaway script (no test runner in this project)**

Create a temporary file `/tmp/verify-completion.ts` (do NOT put this in the repo):

```ts
import {
  applicableCategories,
  isLessonComplete,
  computeCompletedLessons,
  computeLessonStatuses,
  furthestCompletedLesson,
} from "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/src/lib/completion";

// applicableCategories: nguphap-only lesson
console.assert(
  JSON.stringify(applicableCategories({ id: "l1" })) === JSON.stringify(["nguphap"]),
  "FAIL: nguphap-only lesson should only require nguphap",
);

// applicableCategories: all 3
console.assert(
  JSON.stringify(applicableCategories({ id: "l2", audioR2Key: "a.mp3", readingText: "text" })) ===
    JSON.stringify(["nguphap", "nghe", "doc"]),
  "FAIL: lesson with audio+reading should require all 3",
);

// isLessonComplete: passes when only applicable category is met
console.assert(
  isLessonComplete({ id: "l1" }, { nguphap: 80 }) === true,
  "FAIL: nguphap-only lesson at exactly 80 should be complete",
);
console.assert(
  isLessonComplete({ id: "l1" }, { nguphap: 79 }) === false,
  "FAIL: nguphap-only lesson at 79 should NOT be complete",
);

// isLessonComplete: nghe applicable but missing score -> incomplete
console.assert(
  isLessonComplete({ id: "l2", audioR2Key: "a.mp3" }, { nguphap: 100 }) === false,
  "FAIL: lesson with audio but no nghe score should NOT be complete",
);
console.assert(
  isLessonComplete({ id: "l2", audioR2Key: "a.mp3" }, { nguphap: 100, nghe: 80 }) === true,
  "FAIL: lesson with audio + nghe>=80 + nguphap>=80 should be complete",
);

// computeCompletedLessons end-to-end
const lessons = [
  { id: "l1" },
  { id: "l2", audioR2Key: "a.mp3" },
  { id: "l3", readingText: "text" },
];
const progress = [
  { lesson_id: "l1", category: "nguphap", quiz_score: 90 },
  { lesson_id: "l2", category: "nguphap", quiz_score: 100 },
  { lesson_id: "l2", category: "nghe", quiz_score: 50 }, // fails threshold
  { lesson_id: "l3", category: "nguphap", quiz_score: 100 },
  { lesson_id: "l3", category: "doc", quiz_score: 100 },
];
const completed = computeCompletedLessons(lessons, progress);
console.assert(
  JSON.stringify(completed) === JSON.stringify(["l1", "l3"]),
  `FAIL: expected [l1, l3], got ${JSON.stringify(completed)}`,
);

// computeLessonStatuses
const statuses = computeLessonStatuses(lessons, ["l1"]);
console.assert(statuses["l1"] === "completed", "FAIL: l1 should be completed");
console.assert(statuses["l2"] === "current", "FAIL: l2 should be current (follows completed l1)");
console.assert(statuses["l3"] === "locked", "FAIL: l3 should be locked");

// furthestCompletedLesson
const furthest = furthestCompletedLesson(lessons, ["l1", "l2"]);
console.assert(furthest?.id === "l2", `FAIL: expected l2, got ${furthest?.id}`);

console.log("All completion.ts assertions passed.");
```

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsx /tmp/verify-completion.ts`
Expected output: `All completion.ts assertions passed.` with no `FAIL:` lines. If any assertion fails, the console.assert call prints `Assertion failed: <message>` — fix `completion.ts` and re-run.

Delete `/tmp/verify-completion.ts` after it passes (it's scratch, not part of the repo).

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/completion.ts
git commit -m "feat: add shared lesson-completion logic module"
```

---

### Task 2: Add `quizScoresByCategory` to `UserStats`

**Files:**
- Modify: `src/lib/appTypes.ts:3-10`

**Interfaces:**
- Consumes: nothing new.
- Produces: `UserStats.quizScoresByCategory: Record<string, Partial<Record<"nguphap" | "nghe" | "doc", number>>>` — used by Task 3.

- [ ] **Step 1: Add the field**

Find in `src/lib/appTypes.ts`:

```ts
export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[];
  quizScores: Record<string, number>;
  unlockedLevels: Level[];
}
```

Replace with:

```ts
export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[];
  quizScores: Record<string, number>;
  quizScoresByCategory: Record<string, Partial<Record<"nguphap" | "nghe" | "doc", number>>>;
  unlockedLevels: Level[];
}
```

- [ ] **Step 2: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: type errors in `src/lib/hooks/useUserStats.ts` (missing `quizScoresByCategory` on the object literal it returns) — this is expected and fixed by Task 3. Confirm the error is ONLY in that file before moving on.

- [ ] **Step 3: Commit**

```bash
git add src/lib/appTypes.ts
git commit -m "feat: add quizScoresByCategory field to UserStats"
```

---

### Task 3: Rewrite `useUserStats` to derive completion from all 3 categories

**Files:**
- Modify: `src/lib/hooks/useUserStats.ts` (full rewrite)

**Interfaces:**
- Consumes: `computeCompletedLessons`, `buildScoresByLesson`, `LessonProgressRow`, `QuizCategory` from `../completion` (Task 1); `UserStats`, `Level` from `../appTypes` (Task 2's `UserStats`).
- Produces (used by Task 4):
  - `useUserStats(userId: string | null, lessons: LessonContentFlags[]): { stats: UserStats; statsLoading: boolean; applyLessonCompleteReward: (xpAwarded: number, newStreak: number) => void; applyQuizResult: (lessonId: string, category: QuizCategory, scorePercentage: number, xpEarned: number) => void }`
  - This REPLACES the old `setStats: Dispatch<SetStateAction<UserStats>>` return value — there is no more generic `setStats`. `completedLessons` is now always derived (never settable directly), which is what fixes both the "mark-complete button used to fake completion" bug and the pre-existing "any quiz_score counted as complete regardless of value" bug.

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `src/lib/hooks/useUserStats.ts` with:

```ts
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { UserStats, Level } from "../appTypes";
import {
  computeCompletedLessons,
  buildScoresByLesson,
  LessonProgressRow,
  LessonContentFlags,
  QuizCategory,
} from "../completion";

interface BaseStats {
  xp: number;
  streak: number;
  unlockedLevels: Level[];
}

const EMPTY_BASE: BaseStats = { xp: 0, streak: 0, unlockedLevels: [] };

export function useUserStats(
  userId: string | null,
  lessons: LessonContentFlags[],
): {
  stats: UserStats;
  statsLoading: boolean;
  applyLessonCompleteReward: (xpAwarded: number, newStreak: number) => void;
  applyQuizResult: (
    lessonId: string,
    category: QuizCategory,
    scorePercentage: number,
    xpEarned: number,
  ) => void;
} {
  const [base, setBase] = useState<BaseStats>(EMPTY_BASE);
  const [progressRows, setProgressRows] = useState<LessonProgressRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!userId) {
      setBase(EMPTY_BASE);
      setProgressRows([]);
      return;
    }

    setStatsLoading(true);

    const [statsRes, progressRes, profileRes] = await Promise.all([
      supabase.from("user_stats").select("xp, streak").eq("user_id", userId).single(),
      supabase.from("lesson_progress").select("lesson_id, category, quiz_score").eq("user_id", userId),
      supabase.from("profiles").select("unlocked_levels").eq("id", userId).single(),
    ]);

    setBase({
      xp: statsRes.data?.xp ?? 0,
      streak: statsRes.data?.streak ?? 0,
      unlockedLevels: (profileRes.data?.unlocked_levels ?? []) as Level[],
    });
    setProgressRows((progressRes.data ?? []) as LessonProgressRow[]);
    setStatsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const completedLessons = useMemo(
    () => computeCompletedLessons(lessons, progressRows),
    [lessons, progressRows],
  );

  const quizScoresByCategory = useMemo(() => buildScoresByLesson(progressRows), [progressRows]);

  const quizScores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [lessonId, byCat] of Object.entries(quizScoresByCategory)) {
      if (byCat.nguphap !== undefined) out[lessonId] = byCat.nguphap;
    }
    return out;
  }, [quizScoresByCategory]);

  const stats: UserStats = {
    xp: base.xp,
    streak: base.streak,
    completedLessons,
    quizScores,
    quizScoresByCategory,
    unlockedLevels: base.unlockedLevels,
  };

  const applyLessonCompleteReward = useCallback((xpAwarded: number, newStreak: number) => {
    setBase((prev) => ({ ...prev, xp: prev.xp + xpAwarded, streak: newStreak }));
  }, []);

  const applyQuizResult = useCallback(
    (lessonId: string, category: QuizCategory, scorePercentage: number, xpEarned: number) => {
      setBase((prev) => ({ ...prev, xp: prev.xp + xpEarned }));
      setProgressRows((prev) => {
        const idx = prev.findIndex((r) => r.lesson_id === lessonId && r.category === category);
        if (idx === -1) {
          return [...prev, { lesson_id: lessonId, category, quiz_score: scorePercentage }];
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quiz_score: scorePercentage };
        return copy;
      });
    },
    [],
  );

  return { stats, statsLoading, applyLessonCompleteReward, applyQuizResult };
}
```

- [ ] **Step 2: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: errors ONLY in `src/App.tsx` (still calling `useUserStats(user?.id ?? null)` with 1 arg, and still destructuring `setStats`) — fixed by Task 4. Confirm no errors in `useUserStats.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useUserStats.ts
git commit -m "feat: derive completedLessons from all 3 quiz categories in useUserStats"
```

---

### Task 4: Wire the new hook API into `App.tsx`

**Files:**
- Modify: `src/App.tsx:6-38` (imports + hook calls), `src/App.tsx:128-165` (handleMarkComplete, handleQuizFinished)

**Interfaces:**
- Consumes: `useUserStats(userId, lessons)` returning `{ stats, statsLoading, applyLessonCompleteReward, applyQuizResult }` (Task 3).
- Produces: nothing new for later tasks — `stats.completedLessons` semantics are now correct everywhere it's already consumed (`RoadmapPage`, `DashboardPage`, `LessonDetailPage`) with zero prop-shape changes to those components.

- [ ] **Step 1: Reorder hooks and memoize the lessons list**

Find in `src/App.tsx`:

```ts
import React, { useState, useEffect } from "react";
```

Replace with:

```ts
import React, { useState, useEffect, useMemo } from "react";
```

Find:

```ts
  const { stats, setStats } = useUserStats(user?.id ?? null);
  const { modules, loading: modulesLoading } = useModules(user?.id ?? null);
  const { positions } = useLessonPositions(user?.id ?? null);
```

Replace with:

```ts
  const { modules, loading: modulesLoading } = useModules(user?.id ?? null);
  const { positions } = useLessonPositions(user?.id ?? null);
  const flatLessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const { stats, applyLessonCompleteReward, applyQuizResult } = useUserStats(user?.id ?? null, flatLessons);
```

- [ ] **Step 2: Remove the now-duplicate `flatLessons` declaration further down**

Find (a few lines later, near `handleNextLesson`):

```ts
  // Find active Lesson detail item — no fallback to flatLessons[0]: if the
  // selected id isn't found (deleted, or just reverted to draft while the
  // learner was on it), we must show a "not available" message, not a
  // different lesson silently swapped in.
  const flatLessons = modules.flatMap(m => m.lessons);
  const activeLessonObject: Lesson | undefined = flatLessons.find(l => l.id === selectedLessonId);
```

Replace with (drop the duplicate `flatLessons` line — it's already defined above from Step 1):

```ts
  // Find active Lesson detail item — no fallback to flatLessons[0]: if the
  // selected id isn't found (deleted, or just reverted to draft while the
  // learner was on it), we must show a "not available" message, not a
  // different lesson silently swapped in.
  const activeLessonObject: Lesson | undefined = flatLessons.find(l => l.id === selectedLessonId);
```

- [ ] **Step 3: Rewrite `handleMarkComplete` and `handleQuizFinished`**

Find:

```ts
  // Marks a lesson completed via Edge Function (server-side XP + streak)
  const handleMarkComplete = async (lessonId: string) => {
    if (stats.completedLessons.includes(lessonId)) return;

    const { data, error } = await supabase.functions.invoke(`lesson-complete/${lessonId}`, {
      method: "POST",
    });

    if (error) {
      showToast("Không thể lưu tiến độ. Vui lòng thử lại.", "warning");
      return;
    }

    if (data?.alreadyCompleted) return;

    setStats((prev) => ({
      ...prev,
      completedLessons: [...prev.completedLessons, lessonId],
      xp: prev.xp + (data?.xpAwarded ?? 15),
      streak: data?.newStreak ?? prev.streak,
    }));
  };

  // Triggers after completing a quiz (XP is awarded server-side by quiz-submit EF)
  const handleQuizFinished = (scorePercentage: number, xpEarned: number) => {
    setStats((prev) => {
      const updatedCompleted = scorePercentage >= 80 && !prev.completedLessons.includes(selectedLessonId)
        ? [...prev.completedLessons, selectedLessonId]
        : prev.completedLessons;

      return {
        ...prev,
        completedLessons: updatedCompleted,
        quizScores: { ...prev.quizScores, [selectedLessonId]: scorePercentage },
        xp: prev.xp + xpEarned,
      };
    });
  };
```

Replace with:

```ts
  // Awards the "mark complete" bonus via Edge Function (server-side XP + streak).
  // completedLessons itself is no longer set here — it's fully derived from
  // quiz scores in useUserStats, so this only fires once that's already true
  // (see LessonDetailPage's gating on stats.completedLessons).
  const handleMarkComplete = async (lessonId: string) => {
    const { data, error } = await supabase.functions.invoke(`lesson-complete/${lessonId}`, {
      method: "POST",
    });

    if (error) {
      showToast("Không thể lưu tiến độ. Vui lòng thử lại.", "warning");
      return;
    }

    if (data?.alreadyCompleted) return;

    applyLessonCompleteReward(data?.xpAwarded ?? 15, data?.newStreak ?? stats.streak);
  };

  // Triggers after completing a quiz (XP is awarded server-side by quiz-submit EF).
  // Records the category-specific score; completedLessons re-derives automatically.
  const handleQuizFinished = (scorePercentage: number, xpEarned: number) => {
    applyQuizResult(selectedLessonId, activeExerciseCategory, scorePercentage, xpEarned);
  };
```

Note: `handleMarkComplete`'s old `if (stats.completedLessons.includes(lessonId)) return;` guard is dropped because it's no longer a meaningful pre-check here (the button calling this is now only rendered by `LessonDetailPage` when `stats.completedLessons` already includes the lesson — see Task 5); the Edge Function's own `alreadyCompleted` idempotency check (already present, unchanged) still prevents double-awarding.

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

Use a throwaway harness (`dbgtest.html` + `dbgtest.tsx` at repo root, delete before committing) since real login isn't available in this sandbox. Render `App` is impractical to stub fully; instead stub `useUserStats`/`useModules` at the module level (module-stub copy pattern used elsewhere in this session) OR verify at the unit level: import `applyQuizResult`/`applyLessonCompleteReward` behavior indirectly by rendering just `LessonDetailPage` + a local `useState`-backed mock of `UserStats`, simulating: (a) a lesson with only nguphap applicable, no score yet → confirm no "Đánh dấu đã học" button and no "Đã học xong" badge; (b) same lesson with a mock `stats.completedLessons` already including it → confirm the button DOES appear. This is really testing Task 5's UI, but since Task 4 has no UI of its own (it's pure wiring), defer the interactive browser check to Task 5 and just confirm here via `npm run lint` + a careful reading of the diff that `stats`, `applyLessonCompleteReward`, `applyQuizResult` are the only 3 things destructured and both handlers compile.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire useUserStats' new derived-completion API into App.tsx"
```

---

### Task 5: Gate "Đánh dấu đã học" button on `LessonDetailPage`

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:100-113` (top button), `src/pages/LessonDetailPage.tsx:198-207` (bottom "quiz" tab button)

**Interfaces:**
- Consumes: `stats.completedLessons` (now fully quiz-derived per Task 3/4) — no prop signature changes.

- [ ] **Step 1: Gate the top button**

Find:

```tsx
        <div className="flex gap-2 w-full sm:w-auto">
          {!marked ? (
            <Button id="btn-lesson-mark-complete-top" variant="secondary" className="flex-1 sm:flex-initial" onClick={handleCompleteClick}>
              Đánh dấu đã học
            </Button>
          ) : (
            <div className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-display font-bold">
              <CheckCircle className="w-4 h-4 text-green-600" /> Đã học xong
            </div>
          )}
          <Button id="btn-lesson-start-quiz-top" variant="primary" className="flex-1 sm:flex-initial" onClick={() => onStartQuiz(lesson.id)}>
            Kiểm tra ngay <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
```

Replace with:

```tsx
        <div className="flex gap-2 w-full sm:w-auto">
          {marked ? (
            <div className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-display font-bold">
              <CheckCircle className="w-4 h-4 text-green-600" /> Đã học xong
            </div>
          ) : isCompleted ? (
            <Button id="btn-lesson-mark-complete-top" variant="secondary" className="flex-1 sm:flex-initial" onClick={handleCompleteClick}>
              Đánh dấu đã học
            </Button>
          ) : null}
          <Button id="btn-lesson-start-quiz-top" variant="primary" className="flex-1 sm:flex-initial" onClick={() => onStartQuiz(lesson.id)}>
            Kiểm tra ngay <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
```

- [ ] **Step 2: Gate the bottom "quiz" tab button**

Find:

```tsx
              <div className="flex justify-center gap-3 pt-1">
                {!marked && (
                  <Button id="btn-lesson-mark-complete-bottom" variant="secondary" onClick={handleCompleteClick}>
                    Đánh dấu đã học
                  </Button>
                )}
                <Button id="btn-lesson-start-quiz-bottom" variant="primary" onClick={() => onStartQuiz(lesson.id)}>
                  Bắt đầu bài tập ngữ pháp <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
```

Replace with:

```tsx
              <div className="flex justify-center gap-3 pt-1">
                {!marked && isCompleted && (
                  <Button id="btn-lesson-mark-complete-bottom" variant="secondary" onClick={handleCompleteClick}>
                    Đánh dấu đã học
                  </Button>
                )}
                <Button id="btn-lesson-start-quiz-bottom" variant="primary" onClick={() => onStartQuiz(lesson.id)}>
                  Bắt đầu bài tập ngữ pháp <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
```

(`isCompleted` is already computed at the top of the component: `const isCompleted = stats.completedLessons.includes(lesson.id);` — no change needed there, it now automatically reflects the new derivation from Tasks 3/4.)

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

Build a throwaway harness `dbgtest.html` + `dbgtest.tsx` at repo root rendering `LessonDetailPage` directly with mock props (no auth needed — this component takes `lesson`/`stats` as plain props). Test 3 scenarios by passing different mock `Lesson`/`UserStats` combinations (toggle via a button in the harness, same pattern used earlier in this session for `LessonDetailPage`'s Nói tab):

1. Lesson `{ id: "l1" }` (nguphap-only), `stats.completedLessons = []` → confirm via `read_page`/`get_page_text` that NEITHER "Đánh dấu đã học" NOR "Đã học xong" appears (only "Kiểm tra ngay").
2. Same lesson, `stats.completedLessons = ["l1"]` → confirm "Đánh dấu đã học" now appears (both top and in the "quiz" bottom tab — switch tabs with `computer` clicks and re-check).
3. Click "Đánh dấu đã học" (mock `onMarkComplete` as a no-op that just logs) → confirm the local `marked` state flips and "Đã học xong" now shows instead.

Delete `dbgtest.html`/`dbgtest.tsx` before committing. Paste literal `read_page`/`get_page_text`/console output into the task report as evidence.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: gate mark-complete button on lesson meeting the 80% completion criteria"
```

---

### Task 6: Remove "Đề xuất rèn luyện nhanh" from Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.tsx:15` (import), `src/pages/DashboardPage.tsx:166-217` (block)

**Interfaces:** None — purely additive removal, no other file depends on this block.

- [ ] **Step 1: Remove the unused `Zap` import**

Find:

```ts
import { 
  Trophy, 
  Flame, 
  BookOpen, 
  PlayCircle, 
  CheckCircle, 
  TrendingUp, 
  Plus, 
  Zap,
  ArrowRight,
  ListRestart,
  HeartCrack,
  Award
} from "lucide-react";
```

Replace with (remove the `Zap,` line only — `ListRestart`/`HeartCrack` are pre-existing unused imports unrelated to this change, leave them as-is):

```ts
import { 
  Trophy, 
  Flame, 
  BookOpen, 
  PlayCircle, 
  CheckCircle, 
  TrendingUp, 
  Plus, 
  ArrowRight,
  ListRestart,
  HeartCrack,
  Award
} from "lucide-react";
```

- [ ] **Step 2: Remove the block**

Find (the entire "Recommended quick activities" block, from its wrapping `<div className="space-y-4">` through its closing `</div>`):

```tsx
          {/* Recommended quick activities / interactive card */}
          <div className="space-y-4">
            <h3 className="text-base font-display font-extrabold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500 animate-pulse" /> Đề xuất rèn luyện nhanh
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="bg-slate-50/50 border border-slate-200/60 hover:border-orange-100 p-5 rounded-2xl flex items-start gap-4 hover:bg-white duration-200 transition">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 font-display font-bold text-sm">
                  ⚡
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold text-slate-900 font-sans">Chiến dịch lướt từ vựng</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Học ngẫu nhiên 10 từ vựng cốt lõi thường gặp nhất trong các đề thi nói hội thoại của Goethe.
                  </p>
                  <Button 
                    id="btn-dash-vocab-quiz"
                    variant="ghost" 
                    size="sm" 
                    className="text-orange-600 p-0 hover:bg-transparent hover:underline mt-2 flex items-center text-xs font-bold whitespace-nowrap"
                    onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
                  >
                    Xem bài học liên quan <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 hover:border-amber-100 p-5 rounded-2xl flex items-start gap-4 hover:bg-white duration-200 transition">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-sm">
                  🎧
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold text-slate-900 font-sans">Luyện nghe hội thoại</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Rèn luyện thói quen phản xạ âm thanh qua 4 giọng đọc máy chuẩn bản xứ miền Tây nước Đức.
                  </p>
                  <Button 
                    id="btn-dash-listening-drill"
                    variant="ghost" 
                    size="sm" 
                    className="text-amber-600 p-0 hover:bg-transparent hover:underline mt-2 flex items-center text-xs font-bold whitespace-nowrap"
                    onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
                  >
                    Mở bài nghe mẫu <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>

            </div>
          </div>

        </div>
```

Replace with (keep the closing `</div>` that ends the "Left Column" — only the "Recommended quick activities" block itself is removed):

```tsx
        </div>
```

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors (confirms `Zap` is fully unused now and no other reference to the removed block remains).

- [ ] **Step 4: Manual browser verification**

Throwaway harness rendering `DashboardPage` with mock `user`/`stats`/`modules` props. Confirm via `get_page_text` that "Đề xuất rèn luyện nhanh" no longer appears anywhere on the page, and that the "Tiến độ cấp độ A1" / "Tổng điểm tích lũy" cards above it and "Kết quả kiểm tra gần đây" card to the right are both still present and visually unaffected (screenshot). Delete the harness before committing.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "fix: remove static 'Đề xuất rèn luyện nhanh' mock section from Dashboard"
```

---

### Task 7: Roadmap — whole-card click, "Đã xong" badge, auto-scroll to current lesson

**Files:**
- Modify: `src/pages/RoadmapPage.tsx:1-9` (imports), `src/pages/RoadmapPage.tsx:150-220` (lesson card)

**Interfaces:** None — uses only `stats.completedLessons`/existing `getLessonStatus`, both unaffected in shape by this task.

- [ ] **Step 1: Add `useEffect`/`useRef` import**

Find:

```tsx
import React from "react";
```

Replace with:

```tsx
import React, { useEffect } from "react";
```

- [ ] **Step 2: Make the whole card clickable and add the "Đã xong" badge**

Find:

```tsx
              return (
                <div
                  key={lesson.id}
                  id={`roadmap-lesson-card-${lesson.id}`}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[170px] relative overflow-hidden group ${cardStyles[status]}`}
                >
                  {/* Top section indicators */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                          Bài {indexInAll + 1}
                        </span>
                        {status === "current" && (
                          <span className="bg-orange-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            Đang học
                          </span>
                        )}
                      </div>
```

Replace with:

```tsx
              return (
                <div
                  key={lesson.id}
                  id={`roadmap-lesson-card-${lesson.id}`}
                  onClick={() => status !== "locked" && onSelectLesson(lesson.id)}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[170px] relative overflow-hidden group ${cardStyles[status]} ${status !== "locked" ? "cursor-pointer" : ""}`}
                >
                  {/* Top section indicators */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                          Bài {indexInAll + 1}
                        </span>
                        {status === "current" && (
                          <span className="bg-orange-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            Đang học
                          </span>
                        )}
                        {status === "completed" && (
                          <span className="bg-green-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            Đã xong
                          </span>
                        )}
                      </div>
```

- [ ] **Step 3: Auto-scroll to the current lesson on mount**

Find (right after the `getLessonStatus` function definition, before `const totalLessons = ...`):

```tsx
  const totalLessons = allLessons.length;
```

Replace with:

```tsx
  useEffect(() => {
    if (allLessons.length === 0) return;
    const current = allLessons.find(({ item, indexInAll }) => {
      if (item.kind !== "lesson") return false;
      return getLessonStatus(item.lesson.id, indexInAll) === "current";
    });
    if (!current) return;
    const id = idOf(current.item);
    document.getElementById(`roadmap-lesson-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Only run once per fresh lesson list (e.g. on mount / module unlock change) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLessons.length]);

  const totalLessons = allLessons.length;
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual browser verification (mandatory — use the real Browser pane tools)**

Throwaway harness rendering `RoadmapPage` with mock `stats`/`modules`/`positions` (at least 4 lessons: 1 completed, 1 current, 2 locked). Verify via `read_page` + `computer`:
1. Clicking anywhere on the "current" card's background (not the button) navigates (mock `onSelectLesson` logs the lessonId — confirm via `read_console_messages`).
2. Clicking anywhere on a "locked" card does NOT navigate (no console log).
3. The "completed" card shows a visible "Đã xong" badge (`get_page_text` includes it).
4. On page load, the viewport auto-scrolls so the "current" card is visible/centered — confirm by making the mock list long enough to require scrolling (e.g. 10 lessons, current lesson at index 5) and checking the current card's bounding box is within the visible viewport after load (`read_page` / a `computer` screenshot).

Delete the harness before committing. Paste literal tool output into the task report.

- [ ] **Step 6: Commit**

```bash
git add src/pages/RoadmapPage.tsx
git commit -m "feat: whole-card click, 'Đã xong' badge, and auto-scroll to current lesson on Roadmap"
```

---

### Task 8: Admin — "Đã học đến bài" column (sortable) on the users list

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx` (imports, new state/fetch, table header + row)

**Interfaces:**
- Consumes: `computeCompletedLessons`, `furthestCompletedLesson`, `LessonProgressRow`, `LessonContentFlags` from `../../lib/completion` (Task 1).
- Produces (used by Task 9): a `progressByUser: Record<string, LessonProgressRow[]>` map and `orderedLessons: (LessonContentFlags & { title: string; titleVi: string; level: string; moduleTitle: string })[]` held in this component's state — Task 9 reads both via the same component's state (same file, no new exported interface needed since Task 9 is added to the same file).

- [ ] **Step 1: Add imports and new state**

Find:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Search, Plus, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
```

Replace with:

```tsx
import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Search, Plus, Pencil, Trash2, X, ShieldCheck, ArrowUpDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { computeCompletedLessons, furthestCompletedLesson, LessonProgressRow } from "../../lib/completion";

interface ProgressLesson {
  id: string;
  title: string;
  titleVi: string;
  moduleTitle: string;
  level: string;
  audioR2Key?: string;
  listeningUrl?: string;
  readingText?: string;
}
```

- [ ] **Step 2: Add state for the ordered lesson list and all-users progress rows**

Find:

```tsx
export const AdminUsersSection: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
```

Replace with:

```tsx
export const AdminUsersSection: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [orderedLessons, setOrderedLessons] = useState<ProgressLesson[]>([]);
  const [allProgress, setAllProgress] = useState<(LessonProgressRow & { user_id: string })[]>([]);
  const [sortByProgress, setSortByProgress] = useState<"asc" | "desc" | null>(null);
```

- [ ] **Step 3: Fetch modules/lessons + all lesson_progress once on mount**

Find:

```tsx
  useEffect(() => { fetchUsers(); }, []);
```

Replace with:

```tsx
  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    supabase
      .from("modules")
      .select(`
        id, order_index, title_vi, level,
        lessons (id, title, title_vi, order_index, status, audio_r2_key, listening_url, reading_text)
      `)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        const flat: ProgressLesson[] = (data ?? []).flatMap((m) =>
          (m.lessons ?? [])
            .filter((l: { status: string }) => l.status === "published")
            .map((l: { id: string; title: string; title_vi: string; audio_r2_key: string | null; listening_url: string | null; reading_text: string | null }) => ({
              id: l.id,
              title: l.title,
              titleVi: l.title_vi,
              moduleTitle: m.title_vi,
              level: m.level,
              audioR2Key: l.audio_r2_key ?? undefined,
              listeningUrl: l.listening_url ?? undefined,
              readingText: l.reading_text ?? undefined,
            })),
        );
        setOrderedLessons(flat);
      });

    supabase
      .from("lesson_progress")
      .select("user_id, lesson_id, category, quiz_score, completed_at")
      .then(({ data }) => {
        setAllProgress((data ?? []) as (LessonProgressRow & { user_id: string })[]);
      });
  }, []);
```

- [ ] **Step 4: Compute per-user furthest-completed-lesson label and progress order**

Find:

```tsx
  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );
```

Replace with:

```tsx
  const progressByUser = useMemo(() => {
    const map: Record<string, LessonProgressRow[]> = {};
    for (const row of allProgress) {
      (map[row.user_id] ??= []).push(row);
    }
    return map;
  }, [allProgress]);

  const furthestLabelByUser = useMemo(() => {
    const labels: Record<string, string> = {};
    const orderIndexOf: Record<string, number> = {};
    orderedLessons.forEach((l, idx) => { orderIndexOf[l.id] = idx; });

    for (const u of users) {
      const unlockedLessons = orderedLessons.filter((l) => u.unlockedLevels.includes(l.level));
      const completed = computeCompletedLessons(unlockedLessons, progressByUser[u.id] ?? []);
      const furthest = furthestCompletedLesson(unlockedLessons, completed);
      labels[u.id] = furthest ? `${furthest.level} · Bài ${orderIndexOf[furthest.id] + 1}: ${furthest.titleVi}` : "Chưa học bài nào";
    }
    return labels;
  }, [users, orderedLessons, progressByUser]);

  const filtered = users
    .filter(
      (u) =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (!sortByProgress) return 0;
      const orderIndexOf: Record<string, number> = {};
      orderedLessons.forEach((l, idx) => { orderIndexOf[l.id] = idx; });
      const rank = (u: AdminUser) => {
        const unlockedLessons = orderedLessons.filter((l) => u.unlockedLevels.includes(l.level));
        const completed = computeCompletedLessons(unlockedLessons, progressByUser[u.id] ?? []);
        const furthest = furthestCompletedLesson(unlockedLessons, completed);
        return furthest ? orderIndexOf[furthest.id] : -1;
      };
      const diff = rank(a) - rank(b);
      return sortByProgress === "asc" ? diff : -diff;
    });
```

- [ ] **Step 5: Add the sortable column header and cell**

Find:

```tsx
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Cấp độ mở</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">XP</th>
```

Replace with:

```tsx
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Cấp độ mở</th>
              <th
                className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700"
                onClick={() => setSortByProgress((prev) => (prev === "asc" ? "desc" : "asc"))}
              >
                <span className="inline-flex items-center gap-1">
                  Đã học đến bài <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">XP</th>
```

Find:

```tsx
                <td className="px-4 py-3 text-right font-bold text-blue-600">{u.xp}</td>
```

Replace with:

```tsx
                <td className="px-4 py-3 text-slate-600 text-xs max-w-[220px] truncate" title={furthestLabelByUser[u.id]}>
                  {furthestLabelByUser[u.id]}
                </td>
                <td className="px-4 py-3 text-right font-bold text-blue-600">{u.xp}</td>
```

Find the `colSpan={8}` on the "no results" row and bump it to account for the new column:

```tsx
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Không tìm thấy người dùng.</td>
```

Replace with:

```tsx
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Không tìm thấy người dùng.</td>
```

- [ ] **Step 6: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual browser verification (mandatory — use the real Browser pane tools)**

This needs live data (admin RLS-gated tables) rather than a pure mock harness, since the component does its own `supabase.from(...)` calls internally (no props to inject test data through). Verify by:
1. Confirming via `read_network_requests`/`read_console_messages` that the two new queries (`modules` with nested `lessons`, `lesson_progress`) fire without RLS errors when authenticated as an admin (if no admin session is available in this sandbox, state that explicitly rather than faking it — this mirrors the precedent set earlier in this session where an equivalent check was blocked by RLS and that was accepted as expected/correct, not worked around).
2. If a session IS available: confirm the new "Đã học đến bài" column renders text (not blank/undefined) for at least one user, and clicking the column header re-sorts the row order (compare row order before/after click via `read_page`).
3. If NO session is available in this sandbox: verify at the code level instead — confirm via `npm run lint` (already done) and a careful reading of the diff that `furthestLabelByUser` cannot throw for a user with `unlockedLevels: []` (results in `"Chưa học bài nào"`, not a crash) and that `orderedLessons` defaulting to `[]` before the fetch resolves doesn't crash `furthestLabelByUser`'s computation (empty array in, empty/safe output). State clearly in the report which of these two paths was taken.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: add sortable 'Đã học đến bài' column to admin users list"
```

---

### Task 9: Admin — per-user progress detail modal

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx` (new state, click handler on user name, new modal JSX)

**Interfaces:**
- Consumes: `orderedLessons`, `progressByUser`, `buildScoresByLesson`, `computeLessonStatuses` (the last one newly imported from `../../lib/completion`, Task 1) — all already present in this file from Task 8.

- [ ] **Step 1: Add the import and modal state**

Find (this line was added in Task 8 — extend it):

```tsx
import { computeCompletedLessons, furthestCompletedLesson, LessonProgressRow } from "../../lib/completion";
```

Replace with:

```tsx
import {
  computeCompletedLessons,
  furthestCompletedLesson,
  computeLessonStatuses,
  buildScoresByLesson,
  LessonProgressRow,
} from "../../lib/completion";
```

Find:

```tsx
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
```

Replace with:

```tsx
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [progressUser, setProgressUser] = useState<AdminUser | null>(null);
```

- [ ] **Step 2: Make the user's name clickable to open the modal**

Find:

```tsx
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}
                </td>
```

Replace with:

```tsx
                <td className="px-4 py-3 font-medium text-slate-800">
                  <button
                    onClick={() => setProgressUser(u)}
                    className="hover:text-orange-600 hover:underline cursor-pointer text-left"
                  >
                    {u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}
                  </button>
                </td>
```

- [ ] **Step 3: Add the modal JSX**

Find (insert right before the final closing `</div>` of the component, i.e. right after the "Confirm delete modal" block's closing `)}`):

```tsx
      {/* Confirm delete modal */}
      {deleteTarget && (
```

Insert the new modal directly before that line (so it appears right after all existing modals, still inside the same wrapping `<div className="space-y-5">`):

```tsx
      {/* Per-user progress detail modal */}
      {progressUser && (() => {
        const unlockedLessons = orderedLessons.filter((l) => progressUser.unlockedLevels.includes(l.level));
        const userProgress = progressByUser[progressUser.id] ?? [];
        const completed = computeCompletedLessons(unlockedLessons, userProgress);
        const statuses = computeLessonStatuses(unlockedLessons, completed);
        const scoresByLesson = buildScoresByLesson(userProgress);
        const completedAtByLessonCategory: Record<string, string | undefined> = {};
        for (const row of userProgress) {
          if ((row.quiz_score ?? 0) >= 80 && row.completed_at) {
            completedAtByLessonCategory[`${row.lesson_id}:${row.category}`] = row.completed_at;
          }
        }
        const statusLabel: Record<string, string> = { completed: "Hoàn thành", current: "Đang học", locked: "Chưa học" };
        const statusColor: Record<string, string> = {
          completed: "bg-green-50 text-green-700 border-green-200",
          current: "bg-orange-50 text-orange-700 border-orange-200",
          locked: "bg-slate-100 text-slate-500 border-slate-200",
        };

        const scoreCell = (lessonId: string, category: "nguphap" | "nghe" | "doc", applicable: boolean) => {
          if (!applicable) return <span className="text-slate-300">—</span>;
          const score = scoresByLesson[lessonId]?.[category];
          if (score === undefined) return <span className="text-slate-400">Chưa làm</span>;
          return (
            <span className={score >= 80 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>{score}%</span>
          );
        };

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-900">
                    Tiến độ học tập — {progressUser.full_name || progressUser.email}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {completed.length}/{unlockedLessons.length} bài hoàn thành · {progressUser.xp} XP · {progressUser.streak} 🔥 streak
                  </p>
                </div>
                <button onClick={() => setProgressUser(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {unlockedLessons.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Người dùng chưa mở khóa cấp độ nào.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 sticky top-0">
                      <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase">Bài học</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Trạng thái</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Ngữ pháp</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Nghe</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Đọc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {unlockedLessons.map((l) => {
                      const hasNghe = !!(l.audioR2Key || l.listeningUrl);
                      const hasDoc = !!l.readingText;
                      return (
                        <tr key={l.id}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{l.titleVi}</p>
                            <p className="text-[10px] text-slate-400">{l.level} · {l.title}</p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColor[statuses[l.id]]}`}>
                              {statusLabel[statuses[l.id]]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">{scoreCell(l.id, "nguphap", true)}</td>
                          <td className="px-3 py-2 text-center">{scoreCell(l.id, "nghe", hasNghe)}</td>
                          <td className="px-3 py-2 text-center">{scoreCell(l.id, "doc", hasDoc)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      {/* Confirm delete modal */}
      {deleteTarget && (
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual browser verification (mandatory — use the real Browser pane tools)**

Same caveat as Task 8 (this component fetches its own data, no injectable mock props). If an admin session is available in this sandbox, click a user's name and confirm via `read_page`/`get_page_text`: the modal opens, shows the right lesson count/XP/streak header, one row per unlocked lesson with correct status badge and per-category score cells (including "—" for inapplicable categories and "Chưa làm" for applicable-but-not-attempted ones). If no admin session is available (expected, per this session's established precedent of RLS correctly blocking unauthenticated admin actions), state that explicitly and instead verify by code inspection: confirm the IIFE's `unlockedLessons.length === 0` branch prevents rendering an empty `<table>`, and that `scoresByLesson[lessonId]?.[category]` safely returns `undefined` (not a throw) for a lesson with no progress rows at all.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: add per-user lesson-by-lesson progress detail modal to admin users page"
```

---

## Final Notes

- Tasks 1-5 form the completion-criteria core (must land in order: 1 → 2 → 3 → 4 → 5).
- Task 6 and Task 7 are fully independent of Tasks 1-5 and of each other — can be done in any order, including in parallel by different reviewers, but this plan lists them sequentially for simplicity.
- Task 8 depends on Task 1 (completion.ts) but not on Tasks 2-5 (it does its own independent fetch of `lesson_progress`, not routed through `useUserStats`).
- Task 9 depends on Task 8 (same file, same fetched state).
- No task in this plan requires a new Supabase migration, Edge Function, or npm package.
