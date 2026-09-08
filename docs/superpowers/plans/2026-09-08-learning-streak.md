# Learning Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sidebar “CHUỖI HỌC LIÊN TỤC” with server-side grace-day streak rules and a per-day activity log updated from every learning submit.

**Architecture:** Postgres table `learning_activity_days` + RPC `record_learning_activity` (Asia/Ho_Chi_Minh) own streak math. Edge Functions `lesson-complete`, `grammar-submit`, and `reading-submit` call the RPC after successful learning writes (best-effort). Frontend pure helpers build Mon–Sun week bits; `LearningStreakCard` sits under the existing weekly meeting card in `Sidebar`.

**Tech Stack:** React 19, TypeScript, Supabase (Postgres RLS + RPC + Edge Functions), Node test runner (`npm test`), Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-08-learning-streak-design.md`

**Worktree:** `.worktrees/feat-learning-streak` on branch `feat/learning-streak`

## Global Constraints

- UI copy in Vietnamese; code identifiers in English.
- No `any` in TypeScript; named exports only (except `App.tsx`).
- No new npm packages.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend.
- Do not disable RLS; client may only `SELECT` own `learning_activity_days`.
- Do not replace/remove the sidebar weekly meeting card.
- No mobile navbar streak badge; no history backfill.
- Timezone for “today / week” is **Asia/Ho_Chi_Minh**.
- Streak grace: miss 1 day → keep and +1 on return; miss ≥2 full days → reset to 1.
- After code edits: `npm run lint`. Before editing symbols: GitNexus `impact` upstream; before commit: `detect_changes()`.
- Do not hand-edit `src/lib/database.types.ts` — run `npm run gen:types` after migration is applied.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/learningStreak.ts` | Pure streak math + week Mon–Sun boolean builder + VN calendar helpers |
| `src/lib/learningStreak.test.ts` | Unit tests for helpers |
| `supabase/migrations/20260908160000_learning_activity_days.sql` | Table, RLS, `record_learning_activity` RPC |
| `supabase/functions/lesson-complete/index.ts` | Replace inline UTC streak with RPC |
| `supabase/functions/grammar-submit/index.ts` | Call RPC after successful attempt; return `newStreak` |
| `supabase/functions/reading-submit/index.ts` | Same as grammar-submit |
| `src/components/LearningStreakCard.tsx` | Presentational streak widget |
| `src/components/LearningStreakCard.test.ts` | Source/contract assertions for labels + copy |
| `src/components/Navigation.tsx` | Sidebar props + render card under meeting |
| `src/lib/hooks/useUserStats.ts` | Fetch week activity; sync streak/week on rewards |
| `src/App.tsx` | Pass streak + weekActivity into Sidebar |
| `src/lib/database.types.ts` | Regenerated via `npm run gen:types` |

---

### Task 1: Pure streak helpers (TDD)

**Files:**
- Create: `src/lib/learningStreak.ts`
- Test: `src/lib/learningStreak.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `vnCalendarDateIso(now?: Date): string` — `YYYY-MM-DD` in `Asia/Ho_Chi_Minh`
  - `daysBetween(earlierIso: string, laterIso: string): number` — whole calendar days (`later - earlier`)
  - `computeNewStreak(lastActivityDate: string | null, today: string, currentStreak: number): number`
  - `mondayOfWeekContaining(isoDate: string): string` — Monday of that ISO week (Mon–Sun), `YYYY-MM-DD`
  - `buildWeekActivity(activityDates: string[], weekMonday: string): boolean[]` — length 7, Mon→Sun

Streak rules (must match SQL RPC):

| `daysBetween(last, today)` | Result |
| --- | --- |
| no last | `1` |
| `0` | keep `currentStreak` |
| `1` or `2` | `currentStreak + 1` |
| `≥ 3` | `1` |

- [ ] **Step 1: Write the failing tests**

Create `src/lib/learningStreak.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeekActivity,
  computeNewStreak,
  daysBetween,
  mondayOfWeekContaining,
  vnCalendarDateIso,
} from "./learningStreak";

test("daysBetween: same day is 0", () => {
  assert.equal(daysBetween("2026-09-08", "2026-09-08"), 0);
});

test("daysBetween: consecutive days is 1", () => {
  assert.equal(daysBetween("2026-09-07", "2026-09-08"), 1);
});

test("computeNewStreak: first activity → 1", () => {
  assert.equal(computeNewStreak(null, "2026-09-08", 0), 1);
});

test("computeNewStreak: same day keeps streak", () => {
  assert.equal(computeNewStreak("2026-09-08", "2026-09-08", 5), 5);
});

test("computeNewStreak: yesterday → +1", () => {
  assert.equal(computeNewStreak("2026-09-07", "2026-09-08", 5), 6);
});

test("computeNewStreak: one missed day (last = 2 days ago) → +1", () => {
  assert.equal(computeNewStreak("2026-09-06", "2026-09-08", 5), 6);
});

test("computeNewStreak: two missed days (last = 3 days ago) → reset to 1", () => {
  assert.equal(computeNewStreak("2026-09-05", "2026-09-08", 5), 1);
});

test("mondayOfWeekContaining: Wednesday maps to Monday", () => {
  assert.equal(mondayOfWeekContaining("2026-09-09"), "2026-09-07");
});

test("mondayOfWeekContaining: Sunday maps to prior Monday", () => {
  assert.equal(mondayOfWeekContaining("2026-09-13"), "2026-09-07");
});

test("buildWeekActivity: marks Mon–Fri and Sun, leaves Sat empty", () => {
  const weekMonday = "2026-09-07";
  const bits = buildWeekActivity(
    ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-13"],
    weekMonday,
  );
  assert.deepEqual(bits, [true, true, true, true, true, false, true]);
});

test("vnCalendarDateIso: returns YYYY-MM-DD", () => {
  assert.match(vnCalendarDateIso(new Date("2026-09-08T10:00:00+07:00")), /^\d{4}-\d{2}-\d{2}$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/learningStreak.test.ts`  
Expected: FAIL — module / export not found

- [ ] **Step 3: Implement helpers**

Create `src/lib/learningStreak.ts`:

```typescript
const VN_TZ = "Asia/Ho_Chi_Minh";

/** Calendar YYYY-MM-DD in Vietnam time. */
export function vnCalendarDateIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole calendar days between two ISO dates (`later - earlier`). */
export function daysBetween(earlierIso: string, laterIso: string): number {
  const a = Date.UTC(
    Number(earlierIso.slice(0, 4)),
    Number(earlierIso.slice(5, 7)) - 1,
    Number(earlierIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(laterIso.slice(0, 4)),
    Number(laterIso.slice(5, 7)) - 1,
    Number(laterIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Authoritative client mirror of record_learning_activity streak math.
 * gap 0 → keep; gap 1|2 → +1; gap ≥3 → 1; no last → 1.
 */
export function computeNewStreak(
  lastActivityDate: string | null,
  today: string,
  currentStreak: number,
): number {
  if (!lastActivityDate) return 1;
  const gap = daysBetween(lastActivityDate, today);
  if (gap === 0) return currentStreak;
  if (gap === 1 || gap === 2) return currentStreak + 1;
  return 1;
}

/** Monday (YYYY-MM-DD) of the Mon–Sun week containing `isoDate`. */
export function mondayOfWeekContaining(isoDate: string): string {
  const utc = new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ),
  );
  const day = utc.getUTCDay(); // 0=Sun … 6=Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offsetToMonday);
  return utc.toISOString().slice(0, 10);
}

/** Length-7 Mon→Sun activity flags for the week starting at `weekMonday`. */
export function buildWeekActivity(activityDates: string[], weekMonday: string): boolean[] {
  const set = new Set(activityDates);
  const out: boolean[] = [];
  const base = new Date(
    Date.UTC(
      Number(weekMonday.slice(0, 4)),
      Number(weekMonday.slice(5, 7)) - 1,
      Number(weekMonday.slice(8, 10)),
    ),
  );
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    out.push(set.has(d.toISOString().slice(0, 10)));
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/learningStreak.test.ts`  
Expected: all tests PASS

- [ ] **Step 5: Lint + commit**

Run: `npm run lint`  
Expected: clean

```bash
git add src/lib/learningStreak.ts src/lib/learningStreak.test.ts
git commit -m "$(cat <<'EOF'
feat(streak): add pure learning streak helpers

Encode grace-day streak math and Mon–Sun week activity builder for the sidebar widget.
EOF
)"
```

---

### Task 2: Migration — table, RLS, RPC

**Files:**
- Create: `supabase/migrations/20260908160000_learning_activity_days.sql`

**Interfaces:**
- Consumes: existing `user_stats(user_id, streak, last_activity_date)`
- Produces:
  - Table `learning_activity_days(user_id uuid, activity_date date, PRIMARY KEY (user_id, activity_date))`
  - RLS: `SELECT` for `auth.uid() = user_id`; no client insert/update/delete policies
  - RPC `record_learning_activity(p_user_id uuid) RETURNS integer` — service_role only; upserts today (VN); updates streak; returns `new_streak`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/20260908160000_learning_activity_days.sql`:

```sql
-- Learning activity days + streak recorder (Asia/Ho_Chi_Minh)

CREATE TABLE IF NOT EXISTS learning_activity_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS learning_activity_days_user_date_idx
  ON learning_activity_days (user_id, activity_date);

ALTER TABLE learning_activity_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_activity_days_select_own
  ON learning_activity_days
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated — only service_role via RPC.

CREATE OR REPLACE FUNCTION record_learning_activity(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_last date;
  v_streak integer;
  v_new_streak integer;
  v_gap integer;
BEGIN
  INSERT INTO learning_activity_days (user_id, activity_date)
  VALUES (p_user_id, v_today)
  ON CONFLICT (user_id, activity_date) DO NOTHING;

  SELECT streak, last_activity_date
    INTO v_streak, v_last
  FROM user_stats
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id, xp, streak, last_activity_date, updated_at)
    VALUES (p_user_id, 0, 1, v_today, now())
    ON CONFLICT (user_id) DO NOTHING;
    RETURN 1;
  END IF;

  v_streak := COALESCE(v_streak, 0);

  IF v_last IS NULL THEN
    v_new_streak := 1;
  ELSE
    v_gap := (v_today - v_last);
    IF v_gap = 0 THEN
      v_new_streak := v_streak;
    ELSIF v_gap IN (1, 2) THEN
      v_new_streak := v_streak + 1;
    ELSE
      v_new_streak := 1;
    END IF;
  END IF;

  UPDATE user_stats
  SET streak = v_new_streak,
      last_activity_date = v_today,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_new_streak;
END;
$$;

REVOKE ALL ON FUNCTION record_learning_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_learning_activity(uuid) TO service_role;
```

- [ ] **Step 2: Apply migration locally / linked**

Run (project convention): apply via Supabase CLI against the linked project, e.g.  
`supabase db push`  
or the team’s usual migration apply path.  
Expected: migration applied without error.

- [ ] **Step 3: Regenerate types**

Run: `npm run gen:types`  
Expected: `src/lib/database.types.ts` includes `learning_activity_days` and `record_learning_activity`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260908160000_learning_activity_days.sql src/lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(streak): add learning_activity_days and record RPC

Persist per-day learning activity and centralize grace-day streak updates for Edge Functions.
EOF
)"
```

---

### Task 3: Wire `lesson-complete` to RPC

**Files:**
- Modify: `supabase/functions/lesson-complete/index.ts`

**Interfaces:**
- Consumes: `supabase.rpc("record_learning_activity", { p_user_id })` → `number`
- Produces: response still `{ xpAwarded, newStreak, alreadyCompleted }`; streak comes from RPC after XP write

Pattern (spec): core learning write first; streak RPC best-effort — if RPC fails after progress+XP succeed, still return success with previous streak (or `stats.streak`) and do not fail the request.

- [ ] **Step 1: Replace inline streak block**

In `lesson-complete/index.ts`, after confirming not `alreadyCompleted`:

1. Keep fetching `user_stats` for current `xp` (and fallback streak).
2. Insert `lesson_progress` as today.
3. Update XP only (remove inline streak/`last_activity_date` assignment), e.g.:

```typescript
    await supabase.from("user_stats").update({
      xp: (stats?.xp ?? 0) + XP_REWARD,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    let newStreak = stats?.streak ?? 0;
    const { data: streakVal, error: streakErr } = await supabase.rpc(
      "record_learning_activity",
      { p_user_id: user.id },
    );
    if (!streakErr && typeof streakVal === "number") {
      newStreak = streakVal;
    } else if (streakErr) {
      console.error("record_learning_activity failed", streakErr);
    }

    return new Response(
      JSON.stringify({ xpAwarded: XP_REWARD, newStreak, alreadyCompleted: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
```

4. Delete the old UTC streak calculation (`today` / `yesterdayStr` block).

- [ ] **Step 2: Sanity check**

Read the file end-to-end: no leftover UTC streak math; `alreadyCompleted` path unchanged (no RPC).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/lesson-complete/index.ts
git commit -m "$(cat <<'EOF'
feat(streak): record learning activity from lesson-complete

Delegate streak updates to record_learning_activity after awarding lesson XP.
EOF
)"
```

---

### Task 4: Wire `grammar-submit` and `reading-submit`

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts`
- Modify: `supabase/functions/reading-submit/index.ts`

**Interfaces:**
- Consumes: `record_learning_activity`
- Produces: add `newStreak?: number` to successful JSON responses (paths that represent a real learning submit for the day). Skip RPC on early auth/validation errors. On idempotent “same submission_id” short-circuit responses, still call RPC so a retry same day marks activity (upsert is cheap) **or** skip if that path returns before auth user is known — only call when `user.id` is available and attempt was accepted.

Recommended placement: immediately before the final successful `return new Response(JSON.stringify({...}))` for the main scoring path (after `lesson_progress` upsert), best-effort:

```typescript
    let newStreak: number | undefined;
    const { data: streakVal, error: streakErr } = await supabase.rpc(
      "record_learning_activity",
      { p_user_id: user.id },
    );
    if (!streakErr && typeof streakVal === "number") {
      newStreak = streakVal;
    } else if (streakErr) {
      console.error("record_learning_activity failed", streakErr);
    }

    return new Response(
      JSON.stringify({
        // ...existing fields...
        newStreak,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
```

Apply the same pattern to **both** `grammar-submit` and `reading-submit` main success returns (including any secondary success branch that already returns score payload — if a branch is “already submitted identical payload”, still invoke RPC once when user is authenticated).

- [ ] **Step 1: Patch grammar-submit**

- [ ] **Step 2: Patch reading-submit** (mirror grammar)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts supabase/functions/reading-submit/index.ts
git commit -m "$(cat <<'EOF'
feat(streak): record activity on grammar and reading submit

Count any successful exercise submit toward the daily learning streak.
EOF
)"
```

---

### Task 5: `LearningStreakCard` UI

**Files:**
- Create: `src/components/LearningStreakCard.tsx`
- Test: `src/components/LearningStreakCard.test.ts`

**Interfaces:**
- Consumes: props only
- Produces:

```typescript
export interface LearningStreakCardProps {
  streak: number;
  weekActivity: boolean[]; // length 7, Mon→Sun; pad/truncate defensively
}

export function LearningStreakCard(props: LearningStreakCardProps): React.ReactElement;
```

Copy:
- Title: `CHUỖI HỌC LIÊN TỤC`
- Count: `{streak} ngày`
- Subcopy: streak === 0 → `Hãy học hôm nay để bắt đầu chuỗi!`; else → `Bạn đang duy trì thói quen học rất tốt!`
- Day labels: `["T2","T3","T4","T5","T6","T7","CN"]`
- Active day: red filled circle + white check (`Check` from lucide-react)
- Inactive: empty circle light grey border
- Container: light bg, light red border, rounded; flame via `Flame` from lucide-react

- [ ] **Step 1: Write source-level contract test**

Create `src/components/LearningStreakCard.test.ts` (same style as `Navigation.test.tsx` — read source file):

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () =>
  readFileSync(new URL("./LearningStreakCard.tsx", import.meta.url), "utf8");

test("LearningStreakCard includes Vietnamese title and day labels", () => {
  const s = source();
  assert.match(s, /CHUỖI HỌC LIÊN TỤC/);
  for (const label of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]) {
    assert.match(s, new RegExp(`"${label}"`));
  }
  assert.match(s, /Hãy học hôm nay để bắt đầu chuỗi!/);
  assert.match(s, /Bạn đang duy trì thói quen học rất tốt!/);
});
```

- [ ] **Step 2: Run test — expect FAIL (file missing)**

Run: `npm test -- src/components/LearningStreakCard.test.ts`

- [ ] **Step 3: Implement component**

Create `src/components/LearningStreakCard.tsx` with the props/UI above. Defensive:

```typescript
const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
const days = Array.from({ length: 7 }, (_, i) => weekActivity[i] === true);
```

Use Tailwind classes consistent with brand red (`red-600` / `red-50` / `red-200` border) — match mock, not purple.

- [ ] **Step 4: Run tests + lint**

Run: `npm test -- src/components/LearningStreakCard.test.ts` && `npm run lint`  
Expected: PASS / clean

- [ ] **Step 5: Commit**

```bash
git add src/components/LearningStreakCard.tsx src/components/LearningStreakCard.test.ts
git commit -m "$(cat <<'EOF'
feat(streak): add LearningStreakCard sidebar widget

Present streak count and Mon–Sun activity circles with Vietnamese copy from the mock.
EOF
)"
```

---

### Task 6: Wire Sidebar + `useUserStats` + App

**Files:**
- Modify: `src/lib/hooks/useUserStats.ts`
- Modify: `src/components/Navigation.tsx` (`Sidebar`)
- Modify: `src/App.tsx`

**Interfaces:**
- `useUserStats` also returns `weekActivity: boolean[]` (length 7)
- Extend `applyLessonCompleteReward` to also mark today active in local week bits
- Extend `applyQuizResult` signature with optional `newStreak?: number`; when provided, update `base.streak` and mark today
- `SidebarProps` add `streak: number` and `weekActivity: boolean[]`
- `App` passes `stats.streak` and `weekActivity` into `Sidebar`

Fetch in `fetchStats` (parallel with existing queries):

```typescript
      supabase
        .from("learning_activity_days")
        .select("activity_date")
        .eq("user_id", userId)
        .gte("activity_date", mondayOfWeekContaining(vnCalendarDateIso()))
        .lte("activity_date", /* sunday = monday + 6 days */),
```

Then:

```typescript
setWeekActivity(buildWeekActivity(dates, monday));
```

When `applyLessonCompleteReward(xp, newStreak)` runs, also set today’s index in `weekActivity` to `true`.

Sidebar layout: wrap meeting button + streak in a footer stack:

```tsx
      <div className="mt-auto flex flex-col gap-3 pt-4">
        {/* existing meeting button — remove its mt-4 if moved here */}
        <LearningStreakCard streak={streak} weekActivity={weekActivity} />
      </div>
```

Nav list stays at top; footer uses `mt-auto` so streak sits at bottom under meeting.

- [ ] **Step 1: Impact analysis**

Run GitNexus impact upstream on `Sidebar`, `useUserStats`, `applyLessonCompleteReward` before editing; report blast radius. If HIGH/CRITICAL, stop and warn.

- [ ] **Step 2: Update `useUserStats`**

Import helpers from `learningStreak.ts`. Add `weekActivity` state default `Array(7).fill(false)`. Fetch + build as above. Update reward helpers to sync streak/today.

- [ ] **Step 3: Update `Sidebar` + `App`**

Pass props; render `LearningStreakCard`.

- [ ] **Step 4: Propagate `newStreak` from grammar/reading client if already available**

If `App` / quiz pages call `applyQuizResult` after submit, pass `data.newStreak` when present. If not wired today, at minimum lesson-complete path updates streak (existing). Prefer a small follow-up in the same task: grep `applyQuizResult(` and add optional streak arg where submit responses are handled.

- [ ] **Step 5: Lint + tests**

Run: `npm run lint` && `npm test -- src/lib/learningStreak.test.ts src/components/LearningStreakCard.test.ts src/components/Navigation.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useUserStats.ts src/components/Navigation.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat(streak): show learning streak card in sidebar

Load week activity days and render the streak widget under the weekly meeting teaser.
EOF
)"
```

---

### Task 7: Manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Dev server**

Run: `npm run dev`  
Open an authenticated portal page with sidebar (`lg` viewport).

- [ ] **Step 2: UI**

- [ ] Meeting card still present  
- [ ] Streak card below it with title + 7 day labels  
- [ ] streak 0 shows start copy; after activity shows “duy trì…”  

- [ ] **Step 3: Activity**

Complete a lesson or submit grammar/reading once:

- [ ] Today’s circle fills  
- [ ] `user_stats.streak` / UI count increments per grace rules  

- [ ] **Step 4: detect_changes before any PR**

Run GitNexus `detect_changes()` and confirm scope matches streak files + migration + three EFs.

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Grace-day streak math | Task 1 + Task 2 RPC |
| `learning_activity_days` + RLS | Task 2 |
| Call from lesson / grammar / reading | Tasks 3–4 |
| Sidebar-only widget under meeting | Tasks 5–6 |
| VN timezone | Task 1 helpers + Task 2 SQL |
| Best-effort RPC after core write | Tasks 3–4 |
| No mobile badge / no backfill / keep meeting | Global constraints + Task 6 |
| Types regen | Task 2 |

## Placeholder scan

No TBD / “implement later” / “similar to Task N” left unresolved.

## Type consistency

- `weekActivity: boolean[]` length 7 Mon→Sun everywhere  
- RPC name `record_learning_activity` / arg `p_user_id`  
- Response field `newStreak`  
- Helpers: `computeNewStreak`, `buildWeekActivity`, `mondayOfWeekContaining`, `vnCalendarDateIso`
`)