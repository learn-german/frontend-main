# Daily Progress Report — Phase A (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend đầy đủ cho Daily Progress Report — schema, edge function tính report (recompute-on-read + batch cho cron), scheduled job, wiring Admin để có dữ liệu `level_enrollments`/`is_premium`/`subscription_end_date`.

**Architecture:** Migration thêm `profiles.subscription_end_date` + 2 bảng mới (`level_enrollments`, `daily_progress_reports`), RLS own-read-only (không lặp lại lỗi `grammar_attempts` cũ). Port `completion.ts` sang bản Deno-local cho edge function `daily-progress-report` (theo đúng pattern mỗi edge function tự chứa code riêng). `GET` tính report tươi tại thời điểm gọi + upsert (đây là cơ chế "cập nhật khi hoàn thành lesson" — không hook vào `grammar-submit`/`lesson-complete`). Cron chỉ pre-warm cho user không mở dashboard.

**Tech Stack:** Deno Edge Functions (Supabase), TypeScript. Test bằng `node:test`/plain script qua `npx tsx`, theo đúng style file gốc.

## Global Constraints

- Không dùng `any`.
- RLS mọi bảng mới: chỉ own-read (`user_id = auth.uid()`), KHÔNG có policy `FOR ALL`/admin-all — theo đúng bài học đã ghi trong `20260730142404_exercise_set_attempts.sql`.
- Không cross-import giữa `src/lib` và `supabase/functions` — mỗi edge function tự chứa code (theo pattern có sẵn: `grammar-submit/scoring.ts`).
- Không hardcode `SUPABASE_SERVICE_ROLE_KEY` vào bất kỳ file nào (migration SQL, code) — cron dùng Vault secret tham chiếu theo tên.
- `npm run lint` sau mỗi task đụng TypeScript phía frontend/admin.

---

### Task 1: Migration — schema (không gồm cron)

**Files:**
- Create: `supabase/migrations/20260807000000_daily_progress_reports.sql`

**Interfaces:**
- Produces: cột `profiles.subscription_end_date DATE`; bảng `level_enrollments (user_id, level, started_at, planned_completion_date)` unique `(user_id, level)`; bảng `daily_progress_reports` theo đúng field trong `requirement.md`, unique `(user_id, level_id, report_date)`.

- [ ] **Step 1: Viết migration**

```sql
-- =============================================================================
-- DeutschPath — Daily Progress Report (Phase A): thêm subscription_end_date
-- vào profiles, bảng level_enrollments (mốc thời gian mở từng level) và
-- daily_progress_reports (snapshot tiến độ mỗi ngày).
--
-- RLS: chỉ own-read, KHÔNG có policy admin-all — xem bài học từ
-- grammar_attempts cũ (20260730142404_exercise_set_attempts.sql): 1 policy
-- FOR ALL chỉ check app_metadata.role từng lộ dữ liệu user khác qua trang
-- học viên bình thường. Admin đọc/ghi qua edge function dùng service_role,
-- tự check role trong code (không qua RLS).
-- =============================================================================

ALTER TABLE profiles ADD COLUMN subscription_end_date DATE;

CREATE TABLE level_enrollments (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level                    TEXT NOT NULL,
  started_at               DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_completion_date  DATE NOT NULL,
  UNIQUE (user_id, level)
);

ALTER TABLE level_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "level_enrollments: own read"
  ON level_enrollments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE daily_progress_reports (
  id                              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level_id                        TEXT NOT NULL,
  current_lesson_id               TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  report_date                     DATE NOT NULL,
  completed_required_lessons      INTEGER NOT NULL,
  total_required_lessons          INTEGER NOT NULL,
  actual_progress_percentage      NUMERIC NOT NULL,
  expected_progress_percentage    NUMERIC,
  progress_gap_percentage_point   NUMERIC,
  progress_status                 TEXT,
  package_remaining_days          INTEGER,
  generation_status               TEXT NOT NULL DEFAULT 'success',
  error_message                   TEXT,
  generated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, level_id, report_date)
);

CREATE INDEX daily_progress_reports_user_date_idx ON daily_progress_reports (user_id, report_date);

ALTER TABLE daily_progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_progress_reports: own read"
  ON daily_progress_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

- [ ] **Step 2: Áp migration lên Supabase production (`awdhqlgxnjwymwgxltlw`)** dùng MCP tool `apply_migration` (project_id: `awdhqlgxnjwymwgxltlw`, name: `daily_progress_reports`, đúng nội dung SQL ở Step 1). Xác nhận không lỗi.

- [ ] **Step 3: Chạy `get_advisors` (type: security) để xác nhận RLS không bị cảnh báo thiếu policy trên 2 bảng mới.**

- [ ] **Step 4: Chạy `npm run gen:types`** để cập nhật `src/lib/database.types.ts` (cần `.env.local`/kết nối project thật — nếu sandbox không chạy được, dùng MCP tool `generate_typescript_types` rồi ghi thủ công vào file).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260807000000_daily_progress_reports.sql src/lib/database.types.ts
git commit -m "feat(db): thêm schema Daily Progress Report — level_enrollments, daily_progress_reports, profiles.subscription_end_date"
```

---

### Task 2: Port `completion.ts` sang Deno-local

**Files:**
- Create: `supabase/functions/daily-progress-report/completion.ts`
- Create: `supabase/functions/daily-progress-report/completion.test.ts`

**Interfaces:**
- Produces: `applicableCategories`, `isLessonComplete`, `computeCompletedLessons`, `computeLessonStatuses`, `buildScoresByLesson`, `type LessonQuizFlags`, `type LessonProgressRow`, `type LessonStatus` — copy nguyên signature từ `src/lib/completion.ts`, dùng ở Task 4.

- [ ] **Step 1: Copy nguyên nội dung `src/lib/completion.ts` vào `supabase/functions/daily-progress-report/completion.ts`** — không đổi 1 dòng code (file nguồn không có import nào, thuần TypeScript, copy verbatim an toàn).

- [ ] **Step 2: Copy nguyên nội dung `src/lib/completion.test.ts` vào `supabase/functions/daily-progress-report/completion.test.ts`**, chỉ đổi dòng import đầu (đường dẫn tương đối vẫn là `./completion` nên không cần đổi gì thêm).

- [ ] **Step 3: Chạy test, xác nhận PASS**

Run: `npx tsx supabase/functions/daily-progress-report/completion.test.ts`
Expected: in ra `completion.test.ts OK`, không throw lỗi assert nào (file này không dùng `node:test`, là script assert thuần — chạy trực tiếp bằng `tsx`, không phải `--test`).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/daily-progress-report/completion.ts supabase/functions/daily-progress-report/completion.test.ts
git commit -m "feat: port completion.ts sang bản Deno-local cho daily-progress-report"
```

---

### Task 3: Hàm thuần `computeDailyProgressReport`

**Files:**
- Create: `supabase/functions/daily-progress-report/report.ts`
- Create: `supabase/functions/daily-progress-report/report.test.ts`

**Interfaces:**
- Produces:
```ts
export interface DailyProgressReportInput {
  reportDate: string; // "YYYY-MM-DD"
  completedRequiredLessons: number;
  totalRequiredLessons: number;
  levelStartedAt: string | null; // "YYYY-MM-DD"
  plannedCompletionDate: string | null; // "YYYY-MM-DD"
  subscriptionEndDate: string | null; // "YYYY-MM-DD"
}

export interface DailyProgressReportResult {
  actualProgressPercentage: number;
  expectedProgressPercentage: number | null;
  progressGapPercentagePoint: number | null;
  progressStatus: "on_track" | "attention" | "behind" | null;
  packageRemainingDays: number | null;
  generationStatus: "success" | "insufficient_data";
}

export function computeDailyProgressReport(input: DailyProgressReportInput): DailyProgressReportResult;
```
Dùng ở Task 4.

- [ ] **Step 1: Viết test trước — `supabase/functions/daily-progress-report/report.test.ts`:**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeDailyProgressReport, type DailyProgressReportInput } from "./report.ts";

const MS_PER_DAY = 86400000;
/** Ngày ISO N ngày sau `iso`, tính bằng cộng mốc thời gian thay vì cộng tay
 * theo lịch — tránh sai số khi N vắt qua ranh giới tháng. */
const daysAfter = (iso: string, n: number): string =>
  new Date(new Date(iso).getTime() + n * MS_PER_DAY).toISOString().slice(0, 10);

const baseInput = (overrides: Partial<DailyProgressReportInput> = {}): DailyProgressReportInput => ({
  reportDate: "2026-08-07",
  completedRequiredLessons: 40,
  totalRequiredLessons: 100, // actual = 40% chẵn — tránh số lẻ khi test biên chính xác
  levelStartedAt: "2026-06-08",
  plannedCompletionDate: daysAfter("2026-06-08", 60),
  subscriptionEndDate: "2026-08-17",
  ...overrides,
});

test("actual_progress tính đúng công thức completed/total", () => {
  const result = computeDailyProgressReport(baseInput());
  assert.equal(result.actualProgressPercentage, 40);
});

test("expected_progress tính đúng theo elapsed/planned days", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 60), // elapsed 60/100 ngày -> 60%
  }));
  assert.equal(result.expectedProgressPercentage, 60);
});

test("progress_gap = 5 chính xác -> attention (biên dưới)", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 45), // expected 45%, actual 40% -> gap 5
  }));
  assert.equal(result.expectedProgressPercentage, 45);
  assert.equal(result.progressGapPercentagePoint, 5);
  assert.equal(result.progressStatus, "attention");
});

test("progress_gap ngay dưới 5 -> on_track", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 44), // expected 44%, actual 40% -> gap 4
  }));
  assert.equal(result.progressGapPercentagePoint, 4);
  assert.equal(result.progressStatus, "on_track");
});

test("progress_gap = 10 chính xác -> behind (biên dưới)", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 50), // expected 50%, actual 40% -> gap 10
  }));
  assert.equal(result.progressGapPercentagePoint, 10);
  assert.equal(result.progressStatus, "behind");
});

test("progress_gap ngay dưới 10 -> attention", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 49), // expected 49%, actual 40% -> gap 9
  }));
  assert.equal(result.progressGapPercentagePoint, 9);
  assert.equal(result.progressStatus, "attention");
});

test("insufficient_data khi total_required_lessons = 0", () => {
  const result = computeDailyProgressReport(baseInput({ completedRequiredLessons: 0, totalRequiredLessons: 0 }));
  assert.equal(result.generationStatus, "insufficient_data");
  assert.equal(result.progressStatus, null);
});

test("insufficient_data khi thiếu levelStartedAt/plannedCompletionDate", () => {
  const result = computeDailyProgressReport(baseInput({ levelStartedAt: null, plannedCompletionDate: null }));
  assert.equal(result.generationStatus, "insufficient_data");
  assert.equal(result.expectedProgressPercentage, null);
  // actual_progress vẫn tính được vì có completed/total
  assert.equal(result.actualProgressPercentage, 40);
});

test("insufficient_data khi planned_level_days <= 0", () => {
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: "2026-08-07",
    plannedCompletionDate: "2026-08-07", // 0 ngày
  }));
  assert.equal(result.generationStatus, "insufficient_data");
});

test("package_remaining_days không âm khi subscription đã hết hạn", () => {
  const result = computeDailyProgressReport(baseInput({ subscriptionEndDate: "2026-01-01" }));
  assert.equal(result.packageRemainingDays, 0);
});

test("package_remaining_days null khi không có subscriptionEndDate", () => {
  const result = computeDailyProgressReport(baseInput({ subscriptionEndDate: null }));
  assert.equal(result.packageRemainingDays, null);
});

test("package_remaining_days tính đúng số ngày còn lại", () => {
  const result = computeDailyProgressReport(baseInput({ reportDate: "2026-08-07", subscriptionEndDate: "2026-08-17" }));
  assert.equal(result.packageRemainingDays, 10);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx tsx --test supabase/functions/daily-progress-report/report.test.ts`
Expected: FAIL — "Cannot find module './report.ts'"

- [ ] **Step 3: Tạo `supabase/functions/daily-progress-report/report.ts`:**

```ts
export interface DailyProgressReportInput {
  reportDate: string;
  completedRequiredLessons: number;
  totalRequiredLessons: number;
  levelStartedAt: string | null;
  plannedCompletionDate: string | null;
  subscriptionEndDate: string | null;
}

export interface DailyProgressReportResult {
  actualProgressPercentage: number;
  expectedProgressPercentage: number | null;
  progressGapPercentagePoint: number | null;
  progressStatus: "on_track" | "attention" | "behind" | null;
  packageRemainingDays: number | null;
  generationStatus: "success" | "insufficient_data";
}

const MS_PER_DAY = 86400000;
const clamp = (n: number): number => Math.max(0, Math.min(100, n));

function computeRemainingDays(subscriptionEndDate: string | null, reportDate: string): number | null {
  if (!subscriptionEndDate) return null;
  const diffDays = (new Date(subscriptionEndDate).getTime() - new Date(reportDate).getTime()) / MS_PER_DAY;
  return Math.max(0, Math.round(diffDays));
}

export function computeDailyProgressReport(input: DailyProgressReportInput): DailyProgressReportResult {
  const packageRemainingDays = computeRemainingDays(input.subscriptionEndDate, input.reportDate);

  if (input.totalRequiredLessons <= 0) {
    return {
      actualProgressPercentage: 0,
      expectedProgressPercentage: null,
      progressGapPercentagePoint: null,
      progressStatus: null,
      packageRemainingDays,
      generationStatus: "insufficient_data",
    };
  }

  const actualProgressPercentage = clamp((input.completedRequiredLessons / input.totalRequiredLessons) * 100);

  if (!input.levelStartedAt || !input.plannedCompletionDate) {
    return {
      actualProgressPercentage,
      expectedProgressPercentage: null,
      progressGapPercentagePoint: null,
      progressStatus: null,
      packageRemainingDays,
      generationStatus: "insufficient_data",
    };
  }

  const startedAtMs = new Date(input.levelStartedAt).getTime();
  const plannedCompletionMs = new Date(input.plannedCompletionDate).getTime();
  const reportDateMs = new Date(input.reportDate).getTime();
  const plannedLevelDays = (plannedCompletionMs - startedAtMs) / MS_PER_DAY;

  if (plannedLevelDays <= 0) {
    return {
      actualProgressPercentage,
      expectedProgressPercentage: null,
      progressGapPercentagePoint: null,
      progressStatus: null,
      packageRemainingDays,
      generationStatus: "insufficient_data",
    };
  }

  const elapsedDays = (reportDateMs - startedAtMs) / MS_PER_DAY;
  const expectedProgressPercentage = clamp((elapsedDays / plannedLevelDays) * 100);
  const progressGapPercentagePoint = expectedProgressPercentage - actualProgressPercentage;
  const progressStatus: "on_track" | "attention" | "behind" =
    progressGapPercentagePoint < 5 ? "on_track" : progressGapPercentagePoint < 10 ? "attention" : "behind";

  return {
    actualProgressPercentage,
    expectedProgressPercentage,
    progressGapPercentagePoint,
    progressStatus,
    packageRemainingDays,
    generationStatus: "success",
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx tsx --test supabase/functions/daily-progress-report/report.test.ts`
Expected: PASS toàn bộ 12 test.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/daily-progress-report/report.ts supabase/functions/daily-progress-report/report.test.ts
git commit -m "feat: hàm thuần computeDailyProgressReport — công thức + ngưỡng trạng thái"
```

---

### Task 4: Edge function `daily-progress-report`

**Files:**
- Create: `supabase/functions/daily-progress-report/index.ts`

**Interfaces:**
- Consumes: `computeCompletedLessons`, `computeLessonStatuses`, `type LessonQuizFlags`, `type LessonProgressRow` (Task 2); `computeDailyProgressReport`, `type DailyProgressReportInput` (Task 3).

- [ ] **Step 1: Viết `supabase/functions/daily-progress-report/index.ts`:**

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCompletedLessons, computeLessonStatuses, type LessonQuizFlags, type LessonProgressRow } from "./completion.ts";
import { computeDailyProgressReport } from "./report.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEVEL_ORDER = ["A1", "A2", "B1", "B2"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const todayIso = () => new Date().toISOString().slice(0, 10);

interface LessonRow extends LessonQuizFlags {
  level: string;
  order_index: number;
}

/** Tính report tươi cho 1 user tại report_date, upsert vào daily_progress_reports.
 * Trả về { generationStatus: "empty" } (không upsert) nếu user không đủ điều
 * kiện (chưa mở level nào, hoặc gói không active) — đúng rule "chỉ tạo report
 * cho user có package active và level đang học". */
async function computeAndUpsertReport(supabase: SupabaseClient, userId: string, reportDate: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, subscription_end_date, unlocked_levels")
    .eq("id", userId)
    .single();

  const unlockedLevels: string[] = profile?.unlocked_levels ?? [];
  const packageActive = !!profile?.is_premium
    && !!profile?.subscription_end_date
    && profile.subscription_end_date >= reportDate;

  if (!packageActive || unlockedLevels.length === 0) {
    return { generationStatus: "empty" as const };
  }

  const { data: modulesRes } = await supabase
    .from("modules")
    .select("level, order_index, lessons(id, order_index, status)")
    .in("level", unlockedLevels)
    .order("order_index")
    .order("order_index", { referencedTable: "lessons" });

  const { data: exercisesRes } = await supabase.from("grammar_exercises_public").select("lesson_id, category");
  const quizCategoriesByLesson = new Map<string, Set<string>>();
  for (const row of (exercisesRes ?? []) as { lesson_id: string; category: string }[]) {
    const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
    categories.add(row.category);
    quizCategoriesByLesson.set(row.lesson_id, categories);
  }

  const lessonsByLevel = new Map<string, LessonRow[]>();
  for (const m of modulesRes ?? []) {
    const lessons = ((m.lessons ?? []) as { id: string; order_index: number; status: string }[])
      .filter((l) => l.status === "published")
      .map((l) => ({
        id: l.id,
        order_index: l.order_index,
        hasNguphapQuestions: quizCategoriesByLesson.get(l.id)?.has("nguphap") ?? false,
        hasNgheQuestions: quizCategoriesByLesson.get(l.id)?.has("nghe") ?? false,
        hasDocQuestions: quizCategoriesByLesson.get(l.id)?.has("doc") ?? false,
        level: m.level as string,
      }));
    const existing = lessonsByLevel.get(m.level as string) ?? [];
    lessonsByLevel.set(m.level as string, [...existing, ...lessons]);
  }

  const { data: progressRows } = await supabase
    .from("lesson_progress")
    .select("lesson_id, category, quiz_score, completed_at")
    .eq("user_id", userId);
  const progress = (progressRows ?? []) as LessonProgressRow[];

  // Level hiện tại: level đầu tiên (A1→A2→B1→B2) trong unlocked_levels có ít
  // nhất 1 lesson "current"; nếu mọi level unlock đều xong 100%, dùng level
  // cuối cùng trong unlocked_levels.
  let chosenLevel: string | null = null;
  let chosenLessons: LessonRow[] = [];
  let chosenStatuses: Record<string, "completed" | "current" | "locked"> = {};
  for (const level of LEVEL_ORDER) {
    if (!unlockedLevels.includes(level)) continue;
    const lessons = (lessonsByLevel.get(level) ?? []).sort((a, b) => a.order_index - b.order_index);
    if (lessons.length === 0) continue;
    const completed = computeCompletedLessons(lessons, progress);
    const statuses = computeLessonStatuses(lessons, completed);
    chosenLevel = level;
    chosenLessons = lessons;
    chosenStatuses = statuses;
    if (Object.values(statuses).some((s) => s === "current")) break;
  }

  if (!chosenLevel || chosenLessons.length === 0) {
    return { generationStatus: "empty" as const };
  }

  const completedIds = computeCompletedLessons(chosenLessons, progress);
  const currentLesson = chosenLessons.find((l) => chosenStatuses[l.id] === "current");

  const { data: enrollment } = await supabase
    .from("level_enrollments")
    .select("started_at, planned_completion_date")
    .eq("user_id", userId)
    .eq("level", chosenLevel)
    .maybeSingle();

  const computed = computeDailyProgressReport({
    reportDate,
    completedRequiredLessons: completedIds.length,
    totalRequiredLessons: chosenLessons.length,
    levelStartedAt: enrollment?.started_at ?? null,
    plannedCompletionDate: enrollment?.planned_completion_date ?? null,
    subscriptionEndDate: profile.subscription_end_date,
  });

  const row = {
    user_id: userId,
    level_id: chosenLevel,
    current_lesson_id: currentLesson?.id ?? null,
    report_date: reportDate,
    completed_required_lessons: completedIds.length,
    total_required_lessons: chosenLessons.length,
    actual_progress_percentage: computed.actualProgressPercentage,
    expected_progress_percentage: computed.expectedProgressPercentage,
    progress_gap_percentage_point: computed.progressGapPercentagePoint,
    progress_status: computed.progressStatus,
    package_remaining_days: computed.packageRemainingDays,
    generation_status: computed.generationStatus,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await supabase
    .from("daily_progress_reports")
    .upsert(row, { onConflict: "user_id,level_id,report_date" })
    .select()
    .single();

  if (error) {
    return { generationStatus: "error" as const, errorMessage: error.message };
  }
  return upserted;
}

async function handleBatch(supabase: SupabaseClient) {
  const reportDate = todayIso();
  const { data: eligible } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_premium", true)
    .gte("subscription_end_date", reportDate);

  const results = [];
  for (const p of eligible ?? []) {
    results.push(await computeAndUpsertReport(supabase, p.id, reportDate));
  }
  return json({ processed: results.length });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (req.method === "POST") {
      const body = await req.json();

      if (body.mode === "batch") {
        return await handleBatch(supabase);
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) return json({ error: "Unauthorized" }, 401);
      if (user.app_metadata?.role !== "admin") return json({ error: "Forbidden" }, 403);
      if (!body.user_id) return json({ error: "user_id required" }, 400);

      const result = await computeAndUpsertReport(supabase, body.user_id, todayIso());
      return json(result);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    if (url.searchParams.get("history") === "1") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let query = supabase
        .from("daily_progress_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("report_date", { ascending: false });
      if (from) query = query.gte("report_date", from);
      if (to) query = query.lte("report_date", to);
      const { data, error } = await query;
      if (error) return json({ error: "Internal server error" }, 500);
      return json({ reports: data ?? [] });
    }

    const result = await computeAndUpsertReport(supabase, user.id, todayIso());
    return json(result);
  } catch (_err) {
    return json({ error: "Internal server error" }, 500);
  }
});
```

- [ ] **Step 2: `npm run lint` phải pass** (file Deno nằm ngoài `tsconfig.json`'s `exclude: ["supabase/functions", "api"]` — không bị `tsc --noEmit` check, chỉ cần đảm bảo không phá vỡ phần frontend).

- [ ] **Step 3: Chạy lại toàn bộ test suite hiện có**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (137 test cũ + test mới Task 2/3 — lưu ý `completion.test.ts` ở `daily-progress-report/` không dùng `node:test` nên không nằm trong glob `--test`, chạy riêng như Task 2 Step 3 đã làm).

- [ ] **Step 4: Deploy edge function lên Supabase production** dùng MCP tool `deploy_edge_function` (project_id: `awdhqlgxnjwymwgxltlw`, name: `daily-progress-report`, đọc nội dung 3 file `index.ts`/`completion.ts`/`report.ts` làm files param).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/daily-progress-report/index.ts
git commit -m "feat: edge function daily-progress-report — GET tươi/lịch sử, POST admin regenerate/batch"
```

---

### Task 5: Wiring Admin — `level_enrollments` + `is_premium`/`subscription_end_date`

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Không tạo interface mới cho task khác dùng — chỉ mở rộng `AdminUser`/`EditForm` nội bộ file này.

- [ ] **Step 1: Thêm hằng số `PLANNED_LEVEL_DAYS`** — ngay sau `const PAGE_SIZE = 15;`:

```ts
const PLANNED_LEVEL_DAYS: Record<string, number> = { A1: 60, A2: 60, B1: 90, B2: 90 };
```

- [ ] **Step 2: Mở rộng `AdminUser`/`EditForm` interface** — thêm field vào `AdminUser` (dòng 26-35 gốc):

```ts
interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
  role: string;
  unlockedLevels: string[];
  isPremium: boolean;
  subscriptionEndDate: string | null;
}
```

Và `EditForm` (dòng 38 gốc):

```ts
interface EditForm { full_name: string; role: string; is_premium: boolean; subscription_end_date: string; }
```

- [ ] **Step 3: Cập nhật `fetchUsers()` select + map** — dòng 66-82 gốc, đổi `select`:

```ts
      .select("id, email, full_name, created_at, role, unlocked_levels, is_premium, subscription_end_date, user_stats(xp, streak)")
```

và thêm 2 field vào object map (sau `unlockedLevels: ...`):

```ts
              unlockedLevels: (p as unknown as { unlocked_levels?: string[] }).unlocked_levels ?? [],
              isPremium: (p as unknown as { is_premium?: boolean }).is_premium ?? false,
              subscriptionEndDate: (p as unknown as { subscription_end_date?: string | null }).subscription_end_date ?? null,
```

- [ ] **Step 4: Sửa `handleToggleLevel` để tạo `level_enrollments` khi mở level mới** — thay toàn bộ hàm (dòng 220-234 gốc):

```ts
  const handleToggleLevel = async (user: AdminUser, level: string) => {
    const previousLevels = user.unlockedLevels;
    const isUnlocking = !previousLevels.includes(level);
    const newLevels = isUnlocking
      ? [...previousLevels, level]
      : previousLevels.filter((l) => l !== level);

    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, unlockedLevels: newLevels } : u)));

    const { error } = await supabase.from("profiles").update({ unlocked_levels: newLevels }).eq("id", user.id);

    if (error) {
      showToast("Cập nhật cấp độ thất bại: " + error.message, "warning");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, unlockedLevels: previousLevels } : u)));
      return;
    }

    if (!isUnlocking) return;

    const plannedDays = PLANNED_LEVEL_DAYS[level] ?? 60;
    const startedAt = new Date().toISOString().slice(0, 10);
    const plannedCompletionDate = new Date(Date.now() + plannedDays * 86400000).toISOString().slice(0, 10);
    // ignoreDuplicates: bật/tắt/bật lại level không reset started_at đã có.
    const { error: enrollError } = await supabase
      .from("level_enrollments")
      .upsert(
        { user_id: user.id, level, started_at: startedAt, planned_completion_date: plannedCompletionDate },
        { onConflict: "user_id,level", ignoreDuplicates: true },
      );
    if (enrollError) {
      showToast("Không tạo được mốc thời gian cho cấp độ: " + enrollError.message, "warning");
    }
  };
```

- [ ] **Step 5: Thêm 2 field vào Edit modal** — trong `handleSaveEdit` (dòng 173-201 gốc), sửa update:

```ts
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: editForm.full_name,
        role: editForm.role,
        is_premium: editForm.is_premium,
        subscription_end_date: editForm.subscription_end_date || null,
      })
      .eq("id", editUser.id);
```

Sửa nơi khởi tạo `editForm` khi mở modal sửa (dòng 407 gốc):

```tsx
                      onClick={() => { setEditUser(u); setEditForm({
                        full_name: u.full_name ?? "",
                        role: u.role,
                        is_premium: u.isPremium,
                        subscription_end_date: u.subscriptionEndDate ?? "",
                      }); }}
```

Sửa giá trị khởi tạo mặc định của state (dòng 58 gốc):

```ts
  const [editForm, setEditForm] = useState<EditForm>({ full_name: "", role: "user", is_premium: false, subscription_end_date: "" });
```

Thêm JSX 2 field mới trong Edit modal — ngay sau khối `<select>` Role (dòng 524-534 gốc), trước `<div className="flex gap-3 pt-2">`:

```tsx
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Gói học</label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_premium}
                  onChange={e => setEditForm(prev => ({ ...prev, is_premium: e.target.checked }))}
                  className="w-4 h-4 accent-orange-600 cursor-pointer"
                />
                Gói đang active
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Ngày hết hạn gói</label>
              <input
                type="date"
                value={editForm.subscription_end_date}
                onChange={e => setEditForm(prev => ({ ...prev, subscription_end_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
```

- [ ] **Step 6: `npm run lint` phải pass.**

- [ ] **Step 7: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat(admin): tạo level_enrollments khi unlock level, thêm field gói học (is_premium/subscription_end_date)"
```

---

### Task 6: Migration — scheduled job (pg_cron)

**Files:**
- Create: `supabase/migrations/20260807000001_daily_progress_report_cron.sql`

**Interfaces:** Không sản xuất interface code — chỉ hạ tầng DB.

- [ ] **Step 1: Viết migration**

```sql
-- =============================================================================
-- DeutschPath — Daily Progress Report: scheduled job pre-warm báo cáo cho
-- user không mở Dashboard trong ngày (GET của edge function đã tự cập nhật
-- report tươi mỗi khi user mở Dashboard — cron này chỉ đảm bảo vẫn có
-- snapshot lịch sử cho user không ghé qua hôm đó).
--
-- QUAN TRỌNG: cron gọi edge function bằng Bearer token lấy từ Vault secret
-- tên "service_role_key" — secret này KHÔNG được tạo bởi migration này
-- (không được phép biết/hardcode giá trị SUPABASE_SERVICE_ROLE_KEY thật vào
-- bất kỳ file nào commit lên git). Người vận hành cần tự chạy 1 lần trong
-- SQL Editor của Supabase dashboard (không qua migration):
--   select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY thật>', 'service_role_key');
-- Nếu secret chưa tồn tại, cron job vẫn tạo được nhưng lần chạy sẽ lỗi
-- 401/Unauthorized ở phía edge function — không phá gì khác, chỉ cần tạo
-- secret rồi job sẽ tự chạy đúng ở lần kế tiếp.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'daily-progress-report-batch',
  '5 17 * * *', -- 00:05 giờ Việt Nam (ICT = UTC+7)
  $$
  SELECT net.http_post(
    url := 'https://awdhqlgxnjwymwgxltlw.supabase.co/functions/v1/daily-progress-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('mode', 'batch')
  );
  $$
);
```

- [ ] **Step 2: Áp migration lên Supabase production** dùng MCP tool `apply_migration` (project_id: `awdhqlgxnjwymwgxltlw`, name: `daily_progress_report_cron`).

- [ ] **Step 3: Xác nhận với người dùng đã tạo Vault secret `service_role_key` chưa** — nếu chưa, báo rõ cần chạy `select vault.create_secret(...)` thủ công trong SQL Editor (không tự làm thay vì không có giá trị thật của key).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260807000001_daily_progress_report_cron.sql
git commit -m "feat(db): scheduled job pre-warm Daily Progress Report qua pg_cron"
```

---

### Task 7: Xác minh thủ công + cập nhật roadmap

**Files:** `requirement.md` (cập nhật trạng thái), không sửa code khác.

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Chạy lại toàn bộ test suite lần cuối** (bao gồm cả `completion.test.ts` chạy riêng bằng `tsx` không qua `--test`) — PASS.
- [ ] **Step 3: `detect_changes` (GitNexus) trước khi push cuối cùng** — xác nhận đúng phạm vi đã đổi, không có symbol ngoài dự kiến.
- [ ] **Step 4: Test thủ công qua curl/Postman** (cần JWT thật của 1 tài khoản test — sandbox không có `.env.local` nên không tự chạy được, ghi checklist cho người vận hành):
  - Set `is_premium=true` + `subscription_end_date` tương lai + unlock 1 level cho user test qua Admin.
  - Gọi `GET https://awdhqlgxnjwymwgxltlw.supabase.co/functions/v1/daily-progress-report` với `Authorization: Bearer <JWT user test>` — xác nhận trả về report đúng, có row mới trong `daily_progress_reports`.
  - Gọi lại `GET ?history=1` — xác nhận đọc đúng lịch sử.
  - Gọi `POST` với JWT admin + `{user_id, regenerate: true}` — xác nhận admin-only (403 nếu dùng JWT user thường).
- [ ] **Step 5: Cập nhật `requirement.md`** — đánh dấu phần Backend trong "[Report] Thêm tính năng tạo Daily Progress Report" đã xong (migration/scheduled job/service/API), ghi rõ Phase B (frontend `DailyProgressReportCard`) còn lại, và ghi chú cần tạo Vault secret `service_role_key` thủ công nếu chưa có (Task 6 Step 3).

```bash
git add requirement.md
git commit -m "docs: đánh dấu xong Daily Progress Report Phase A (backend)"
```

## Self-Review

**Spec coverage:** Data model (spec §1) → Task 1, 5. Logic tính report (spec §2) → Task 2, 3. Edge function (spec §3) → Task 4. Scheduled job (spec §4) → Task 6. Testing/verification → Task 7.

**Placeholder scan:** không còn TBD — kể cả phần Vault secret (không thể tự tạo vì không có giá trị thật của service_role_key) đã ghi rõ lý do và bước thủ công cụ thể, không phải chỗ thiếu code.

**Type consistency:** `DailyProgressReportInput`/`DailyProgressReportResult`/`computeDailyProgressReport` định nghĩa ở Task 3, dùng đúng tên ở Task 4. `computeCompletedLessons`/`computeLessonStatuses`/`LessonQuizFlags`/`LessonProgressRow` port ở Task 2, dùng đúng ở Task 4. `AdminUser.isPremium`/`subscriptionEndDate` (camelCase, khớp convention file) định nghĩa và dùng nhất quán trong Task 5.
