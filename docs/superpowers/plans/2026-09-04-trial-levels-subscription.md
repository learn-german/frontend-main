# Trial / Levels / Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three learner states (Trial / Active / Expired) from `subscription_end_date` + `unlocked_levels`: interactive admin Trial/levels with +90-day unlock, remaining-days column, and learner gating that preserves progress.

**Architecture:** Pure helpers own calendar rules (`isTrialBySubscription` = null/empty only; separate expired/remaining helpers). Admin `AdminUsersSection` writes the state transitions. `trialGating` + `App`/`Dashboard`/`Roadmap` split Trial (1 lesson) from Expired (lock all). Never delete progress rows.

**Tech Stack:** React 19, TypeScript, Supabase PostgREST + `set-admin-role` Edge Function, Node test runner (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-04-trial-levels-subscription-design.md`

**Worktree:** `.worktrees/feat-trial-clear-levels` on branch `feat/trial-clear-levels`

## Global Constraints

- UI labels Vietnamese; code identifiers English.
- No `any` in TypeScript.
- No new npm packages.
- Never delete `lesson_progress`, `level_enrollments`, or `user_stats` on Trial/Expired transitions.
- No bulk migration clearing existing users’ `unlocked_levels`.
- No `window.alert` / `window.confirm` — use `showToast()`.
- After code edits: `npm run lint`. Before editing symbols: GitNexus `impact` upstream; before commit: `detect_changes()`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/isTrialBySubscription.ts` | Trial = null/empty only; export `isExpiredBySubscription`, `subscriptionDaysRemaining`, `addCalendarDaysIso` |
| `src/lib/isTrialBySubscription.test.ts` | Unit tests for those helpers |
| `src/lib/trialGating.ts` | Split Trial vs Expired access helpers |
| `src/lib/trialGating.test.ts` | Unit tests for gating helpers |
| `src/pages/admin/AdminUsersSection.tsx` | Interactive Trial, +90 unlock, remaining column, edit-modal clear |
| `src/App.tsx` | Wire trial vs expired; new profile `unlocked_levels: []` |
| `src/pages/DashboardPage.tsx` | Separate Trial vs Expired banners |
| `src/pages/RoadmapPage.tsx` | Expired locks all; Trial still first-lesson override |

---

### Task 1: Subscription date helpers (TDD)

**Files:**
- Modify: `src/lib/isTrialBySubscription.ts`
- Modify: `src/lib/isTrialBySubscription.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `isTrialBySubscription(subscriptionEndDate: string | null, today?: string): boolean` — **only** null/empty/whitespace → `true` (past date → `false`)
  - `isExpiredBySubscription(subscriptionEndDate: string | null, today?: string): boolean` — non-empty end `< today`
  - `subscriptionDaysRemaining(subscriptionEndDate: string | null, today?: string): number | null` — Active → non-negative day diff; Trial/Expired → `null`
  - `addCalendarDaysIso(startIso: string, days: number): string` — `YYYY-MM-DD` + N calendar days (UTC-noon or date-parts only; must be deterministic in tests)

- [ ] **Step 1: Update failing tests for Trial definition**

Replace contents of `src/lib/isTrialBySubscription.test.ts` with:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDaysIso,
  isExpiredBySubscription,
  isTrialBySubscription,
  subscriptionDaysRemaining,
} from "./isTrialBySubscription";

const TODAY = "2026-09-04";

test("null → trial", () => {
  assert.equal(isTrialBySubscription(null, TODAY), true);
});

test("empty / whitespace → trial", () => {
  assert.equal(isTrialBySubscription("", TODAY), true);
  assert.equal(isTrialBySubscription("   ", TODAY), true);
});

test("past date → NOT trial", () => {
  assert.equal(isTrialBySubscription("2026-09-03", TODAY), false);
});

test("today → not trial", () => {
  assert.equal(isTrialBySubscription("2026-09-04", TODAY), false);
});

test("future date → not trial", () => {
  assert.equal(isTrialBySubscription("2026-12-31", TODAY), false);
});

test("past date → expired", () => {
  assert.equal(isExpiredBySubscription("2026-09-03", TODAY), true);
});

test("null → not expired", () => {
  assert.equal(isExpiredBySubscription(null, TODAY), false);
});

test("today → not expired", () => {
  assert.equal(isExpiredBySubscription("2026-09-04", TODAY), false);
});

test("days remaining: active", () => {
  assert.equal(subscriptionDaysRemaining("2026-09-14", TODAY), 10);
});

test("days remaining: trial / expired → null", () => {
  assert.equal(subscriptionDaysRemaining(null, TODAY), null);
  assert.equal(subscriptionDaysRemaining("2026-09-03", TODAY), null);
});

test("addCalendarDaysIso +90", () => {
  assert.equal(addCalendarDaysIso("2026-09-04", 90), "2026-12-03");
});
```

- [ ] **Step 2: Run tests — expect FAIL on past-date trial + missing exports**

Run: `npm test -- src/lib/isTrialBySubscription.test.ts`  
Expected: FAIL (`past date → NOT trial` still expects old behavior and/or missing exports)

- [ ] **Step 3: Implement helpers**

Replace `src/lib/isTrialBySubscription.ts` with:

```typescript
function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeEndDate(subscriptionEndDate: string | null): string | null {
  if (subscriptionEndDate == null) return null;
  const end = subscriptionEndDate.trim().slice(0, 10);
  return end || null;
}

/** Trial when subscription_end_date is missing (not when expired). */
export function isTrialBySubscription(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): boolean {
  return normalizeEndDate(subscriptionEndDate) == null;
}

export function isExpiredBySubscription(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): boolean {
  const end = normalizeEndDate(subscriptionEndDate);
  if (end == null) return false;
  return end < today;
}

/** Days left when active; null for trial or expired. */
export function subscriptionDaysRemaining(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): number | null {
  const end = normalizeEndDate(subscriptionEndDate);
  if (end == null || end < today) return null;
  const start = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const finish = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  return Math.round((finish - start) / 86_400_000);
}

export function addCalendarDaysIso(startIso: string, days: number): string {
  const base = startIso.trim().slice(0, 10);
  const d = new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/isTrialBySubscription.test.ts`  
Expected: all PASS

- [ ] **Step 5: Lint + commit**

Run: `npm run lint`  
```bash
git add src/lib/isTrialBySubscription.ts src/lib/isTrialBySubscription.test.ts
git commit -m "fix(trial): trial is null end-date only; add expired/remaining helpers"
```

---

### Task 2: Split Trial vs Expired in `trialGating` (TDD)

**Files:**
- Modify: `src/lib/trialGating.ts`
- Create: `src/lib/trialGating.test.ts`

**Interfaces:**
- Consumes: `isTrialBySubscription`, `isExpiredBySubscription` from `./isTrialBySubscription`
- Produces:
  - Keep: `UserRole`, `LockedFeature`, `isTrialUser`, `getTrialLessonLimit`
  - Change: `isSubscriptionExpired(end)` → delegate to calendar `isExpiredBySubscription` (no `new Date()` compare)
  - `isTrialAccess(role, end): boolean` — admin false; else `role === "trial"` **or** `isTrialBySubscription(end)`
  - `isExpiredAccess(role, end): boolean` — admin false; else `isExpiredBySubscription(end)` (and not trial)
  - `isEffectivelyTrial(role, end)` — **deprecate behavior**: make it alias of `isTrialAccess` only (do **not** include expired). Update call sites in Task 5.
  - `isFeatureLocked(role, end, feature)` — true when `isTrialAccess || isExpiredAccess` (both restricted)

- [ ] **Step 1: Write failing tests**

Create `src/lib/trialGating.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  isEffectivelyTrial,
  isExpiredAccess,
  isFeatureLocked,
  isSubscriptionExpired,
  isTrialAccess,
} from "./trialGating";

const TODAY = "2026-09-04";

test("admin never trial/expired/locked", () => {
  assert.equal(isTrialAccess("admin", null), false);
  assert.equal(isExpiredAccess("admin", "2026-09-01"), false);
  assert.equal(isFeatureLocked("admin", null, "leaderboard"), false);
});

test("null end → trial access", () => {
  assert.equal(isTrialAccess("user", null), true);
  assert.equal(isTrialAccess("trial", null), true);
  assert.equal(isExpiredAccess("user", null), false);
});

test("past end → expired, not trial", () => {
  assert.equal(isTrialAccess("user", "2026-09-01"), false);
  assert.equal(isExpiredAccess("user", "2026-09-01"), true);
  assert.equal(isEffectivelyTrial("user", "2026-09-01"), false);
  assert.equal(isFeatureLocked("user", "2026-09-01", "help"), true);
});

test("future end → neither", () => {
  assert.equal(isTrialAccess("user", "2026-12-31"), false);
  assert.equal(isExpiredAccess("user", "2026-12-31"), false);
  assert.equal(isFeatureLocked("user", "2026-12-31", "packages"), false);
});

test("isSubscriptionExpired calendar past", () => {
  assert.equal(isSubscriptionExpired("2026-09-03", TODAY), true);
  assert.equal(isSubscriptionExpired(null, TODAY), false);
});
```

Pass `TODAY` into every access helper call above (add third arg). Prefer optional `today` on `isTrialAccess` / `isExpiredAccess` / `isFeatureLocked` / `isEffectivelyTrial` / `isSubscriptionExpired` for testability.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/trialGating.test.ts`  
Expected: FAIL — missing exports / wrong expired=trial behavior

- [ ] **Step 3: Implement `trialGating.ts`**

```typescript
import {
  isExpiredBySubscription,
  isTrialBySubscription,
} from "./isTrialBySubscription";

export type UserRole = "trial" | "user" | "admin";
export type LockedFeature = "leaderboard" | "help" | "packages";

const TRIAL_LESSON_LIMIT = 1;

export function isTrialUser(role: UserRole): boolean {
  return role === "trial";
}

export function isSubscriptionExpired(
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  return isExpiredBySubscription(subscriptionEndDate, today);
}

export function isTrialAccess(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  if (role === "admin") return false;
  if (role === "trial") return true;
  return isTrialBySubscription(subscriptionEndDate, today);
}

export function isExpiredAccess(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  if (role === "admin") return false;
  if (isTrialAccess(role, subscriptionEndDate, today)) return false;
  return isExpiredBySubscription(subscriptionEndDate, today);
}

/** Trial only — does NOT include expired. */
export function isEffectivelyTrial(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  return isTrialAccess(role, subscriptionEndDate, today);
}

export function isFeatureLocked(
  role: UserRole,
  subscriptionEndDate: string | null,
  feature: LockedFeature,
  today?: string,
): boolean {
  void feature;
  return (
    isTrialAccess(role, subscriptionEndDate, today) ||
    isExpiredAccess(role, subscriptionEndDate, today)
  );
}

export function getTrialLessonLimit(): number {
  return TRIAL_LESSON_LIMIT;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/trialGating.test.ts`  
Expected: all PASS

- [ ] **Step 5: Lint + commit**

```bash
git add src/lib/trialGating.ts src/lib/trialGating.test.ts
git commit -m "feat(trial): split trial access from expired lock-all"
```

---

### Task 3: Admin level/Trial transitions

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx` (`handleToggleLevel`, new `handleToggleTrial`, `handleSaveEdit`)

**Interfaces:**
- Consumes: `isTrialBySubscription`, `addCalendarDaysIso` from `../../lib/isTrialBySubscription`
- Produces: UI handlers that persist transitions from the spec

Before editing, run GitNexus impact on `handleToggleLevel` / `handleSaveEdit`.

- [ ] **Step 1: Add local today helper + extend `handleToggleLevel`**

Near `PLANNED_LEVEL_DAYS`, ensure imports include `addCalendarDaysIso` and keep `isTrialBySubscription`.

Replace `handleToggleLevel` body logic with:

```typescript
const handleToggleLevel = async (user: AdminUser, level: string) => {
  const previousLevels = user.unlockedLevels;
  const previousEnd = user.subscriptionEndDate;
  const previousRole = user.role;
  const wasTrial = isTrialBySubscription(user.subscriptionEndDate);
  const isUnlocking = !previousLevels.includes(level);

  if (wasTrial && !isUnlocking) return; // nothing to remove while trial/empty

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let newLevels: string[];
  let newEnd: string | null = previousEnd;
  let newRole = previousRole;

  if (wasTrial && isUnlocking) {
    newLevels = [level];
    newEnd = addCalendarDaysIso(todayIso, 90);
    if (previousRole === "trial") newRole = "user";
  } else {
    newLevels = isUnlocking
      ? [...previousLevels, level]
      : previousLevels.filter((l) => l !== level);
  }

  setUsers((prev) =>
    prev.map((u) =>
      u.id === user.id
        ? { ...u, unlockedLevels: newLevels, subscriptionEndDate: newEnd, role: newRole }
        : u,
    ),
  );

  const { error } = await supabase
    .from("profiles")
    .update({
      unlocked_levels: newLevels,
      ...(wasTrial && isUnlocking
        ? { subscription_end_date: newEnd, role: newRole }
        : {}),
    })
    .eq("id", user.id);

  if (error) {
    showToast("Cập nhật cấp độ thất bại: " + error.message, "warning");
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, unlockedLevels: previousLevels, subscriptionEndDate: previousEnd, role: previousRole }
          : u,
      ),
    );
    return;
  }

  if (wasTrial && isUnlocking && previousRole === "trial") {
    const { data, error: roleErr } = await supabase.functions.invoke("set-admin-role", {
      body: { user_id: user.id, role: "user" },
    });
    if (roleErr || data?.error) {
      showToast("Đã mở cấp nhưng đồng bộ role thất bại: " + (data?.error ?? roleErr?.message), "warning");
    }
  }

  if (!isUnlocking) return;

  // existing level_enrollments upsert block unchanged (startedAt / plannedCompletionDate)
};
```

Keep the existing enrollment upsert after successful unlock (same as current file after `if (!isUnlocking) return`).

- [ ] **Step 2: Add `handleToggleTrial`**

```typescript
const handleToggleTrial = async (user: AdminUser) => {
  if (user.role === "admin") return;
  const currentlyTrial = isTrialBySubscription(user.subscriptionEndDate);
  if (currentlyTrial) return; // already trial; checkbox stays checked

  const previousLevels = user.unlockedLevels;
  const previousEnd = user.subscriptionEndDate;
  const previousRole = user.role;

  setUsers((prev) =>
    prev.map((u) =>
      u.id === user.id
        ? { ...u, unlockedLevels: [], subscriptionEndDate: null, role: "trial" }
        : u,
    ),
  );

  const { error } = await supabase
    .from("profiles")
    .update({ unlocked_levels: [], subscription_end_date: null, role: "trial" })
    .eq("id", user.id);

  if (error) {
    showToast("Chuyển Trial thất bại: " + error.message, "warning");
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, unlockedLevels: previousLevels, subscriptionEndDate: previousEnd, role: previousRole }
          : u,
      ),
    );
    return;
  }

  const { data, error: roleErr } = await supabase.functions.invoke("set-admin-role", {
    body: { user_id: user.id, role: "trial" },
  });
  if (roleErr || data?.error) {
    showToast("Đã clear cấp nhưng đồng bộ role thất bại: " + (data?.error ?? roleErr?.message), "warning");
  } else {
    showToast("Đã chuyển về Trial. Tiến trình học vẫn được giữ.", "success");
  }
};
```

- [ ] **Step 3: Edit modal — clear levels when saving as Trial**

In `handleSaveEdit`, after computing `subscriptionEndDate`:

```typescript
const becomingTrial = editForm.role === "trial" || !subscriptionEndDate;
const profileUpdate: {
  full_name: string;
  role: string;
  subscription_end_date: string | null;
  unlocked_levels?: string[];
} = {
  full_name: editForm.full_name,
  role: editForm.role,
  subscription_end_date: subscriptionEndDate,
};
if (becomingTrial) {
  profileUpdate.role = "trial";
  profileUpdate.subscription_end_date = null;
  profileUpdate.unlocked_levels = [];
}
```

Use `profileUpdate` in `.update(profileUpdate)`. When `becomingTrial` and role changed, invoke `set-admin-role` with `"trial"`. Do **not** clear levels when saving a future date (extend).

- [ ] **Step 4: Lint**

Run: `npm run lint`  
Expected: clean for touched file

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat(admin): trial/level transitions with +90 days and clear on Trial"
```

---

### Task 4: Admin UI — interactive Trial + “Còn lại” column

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx` (table header + row cells)

**Interfaces:**
- Consumes: `isTrialBySubscription`, `isExpiredBySubscription`, `subscriptionDaysRemaining`

- [ ] **Step 1: Import remaining helpers**

```typescript
import {
  isExpiredBySubscription,
  isTrialBySubscription,
  subscriptionDaysRemaining,
} from "../../lib/isTrialBySubscription";
```

- [ ] **Step 2: Add table header “Còn lại”** after “Cấp độ mở”

```tsx
<th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Còn lại</th>
```

- [ ] **Step 3: Make Trial checkbox interactive + red when checked**

Replace Trial label block:

```tsx
<label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
  <input
    type="checkbox"
    checked={isTrialBySubscription(u.subscriptionEndDate)}
    disabled={u.role === "admin"}
    onChange={() => handleToggleTrial(u)}
    className={`w-3.5 h-3.5 cursor-pointer ${
      isTrialBySubscription(u.subscriptionEndDate) ? "accent-red-600" : "accent-orange-600"
    }`}
    title="Bật Trial: xoá cấp độ và ngày hết hạn. Tiến trình học được giữ."
  />
  <span className={isTrialBySubscription(u.subscriptionEndDate) ? "text-red-600" : undefined}>
    Trial
  </span>
</label>
```

- [ ] **Step 4: Add “Còn lại” cell**

```tsx
<td className="px-4 py-3 text-center text-xs">
  {isTrialBySubscription(u.subscriptionEndDate) ? (
    <span className="text-slate-400">—</span>
  ) : isExpiredBySubscription(u.subscriptionEndDate) ? (
    <span className="font-bold text-red-600">Hết hạn</span>
  ) : (
    <span className="text-slate-600">
      {subscriptionDaysRemaining(u.subscriptionEndDate)} ngày
    </span>
  )}
</td>
```

Place this `<td>` after the levels `<td>`, before “Ngày tạo”.

- [ ] **Step 5: Lint + commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat(admin): interactive Trial checkbox and remaining-days column"
```

---

### Task 5: Learner gating — Trial vs Expired

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/RoadmapPage.tsx`

**Interfaces:**
- Consumes: `isTrialAccess`, `isExpiredAccess`, `isFeatureLocked`, `getTrialLessonLimit` from `./lib/trialGating`
- Produces: Correct redirects/banners; Trial roadmap uses effective `["A1"]` when levels empty

- [ ] **Step 1: Update `App.tsx` derived flags**

Replace `effectivelyTrial` usage with:

```typescript
const isTrial = user ? isTrialAccess(user.role, user.subscriptionEndDate) : false;
const isExpired = user ? isExpiredAccess(user.role, user.subscriptionEndDate) : false;
```

Roadmap unlock levels for building:

```typescript
const roadmapUnlockLevels: Level[] = isTrial
  ? (["A1"] as Level[])
  : stats.unlockedLevels;
```

Use `roadmapUnlockLevels` in `buildRoadmapItems(...)` instead of raw `stats.unlockedLevels` when trial (so empty `[]` still shows A1 path). When not trial, keep `stats.unlockedLevels`.

Lesson guard effect:

```typescript
if (isExpired) {
  showToast("Gói học của bạn đã hết hạn. Liên hệ admin để gia hạn.", "warning");
  setCurrentPage("roadmap");
  return;
}
if (isTrial) {
  const lessonIndex = orderedLessons.findIndex((l) => l.id === selectedLessonId);
  if (lessonIndex !== 0) {
    showToast("Nâng cấp gói để truy cập bài học này.", "warning");
    setCurrentPage("roadmap");
    return;
  }
}
```

Feature lock effect: use `isFeatureLocked(user.role, user.subscriptionEndDate, ...)` or `isTrial || isExpired`.

Pass props:

```typescript
isTrialRestricted={isTrial}
isExpiredRestricted={isExpired}
```

Keep existing one-shot expired toast on user load for expired users.

- [ ] **Step 2: Dashboard banners**

Extend props:

```typescript
isTrialRestricted?: boolean;
isExpiredRestricted?: boolean;
```

Render:

```tsx
{isExpiredRestricted && (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 mb-4">
    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
    <div>
      <p className="text-sm font-display font-bold text-red-900">Gói học đã hết hạn</p>
      <p className="text-xs text-red-700 mt-0.5">Toàn bộ bài học đang bị khoá. Liên hệ admin để gia hạn — tiến trình của bạn vẫn được giữ.</p>
    </div>
  </div>
)}
{isTrialRestricted && !isExpiredRestricted && (
  /* existing trial amber banner */
)}
```

- [ ] **Step 3: Roadmap expired lock-all**

Add prop `isExpiredRestricted?: boolean`.

In `effectiveStatuses`:

```typescript
if (isExpiredRestricted) {
  const overridden: Record<string, LessonStatus> = {};
  orderedLessons.forEach((lesson) => {
    overridden[lesson.id] = "locked";
  });
  return overridden;
}
if (!isTrialRestricted) return lessonStatuses;
// existing trial index-0 override
```

Also accept optional `unlockedLevelsOverride` **or** rely on App passing stats already adjusted — prefer App adjusting `buildRoadmapItems` input via a copied stats or separate prop. Simplest: in `App`, when rendering Roadmap/Dashboard, pass:

```typescript
stats={isTrial ? { ...stats, unlockedLevels: ["A1"] } : stats}
```

so Roadmap’s existing `buildRoadmapItems(..., stats.unlockedLevels)` works for Trial with DB `[]`.

- [ ] **Step 4: New profile insert defaults**

In `App.tsx` profile insert:

```typescript
.insert({
  id: identity.id,
  email: identity.email,
  full_name: null,
  role: "trial",
  unlocked_levels: [],
  subscription_end_date: null,
})
```

(Explicit `[]` overrides DB default `['A1']`.)

- [ ] **Step 5: Lint + full unit tests + commit**

Run: `npm run lint && npm test`  
```bash
git add src/App.tsx src/pages/DashboardPage.tsx src/pages/RoadmapPage.tsx
git commit -m "feat(learner): gate trial one-lesson vs expired lock-all"
```

---

### Task 6: Manual verification checklist

**Files:** none (manual)

- [ ] **Step 1: Admin Trial user**
  - User with `subscription_end_date` null: Trial checked (red), levels empty, Còn lại `—`
  - Tick A2: A2 on, Trial off, end ≈ today+90, Còn lại ~90, role User
  - Tick Trial: levels empty, end null, role Trial; progress rows still in DB
  - Edit end to yesterday: levels stay; Còn lại **Hết hạn**; Trial unchecked
  - Extend end to future: access restored

- [ ] **Step 2: Learner**
  - Trial: only first A1 lesson; amber banner
  - Expired: all locked; red banner; no first-lesson free
  - Active: levels as checked

- [ ] **Step 3: Final lint/test**

Run: `npm run lint && npm test`  
Expected: pass

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Trial = null end only | Task 1 |
| Expired ≠ Trial; days remaining / Hết hạn column | Task 1 + 4 |
| Tick level from Trial → +90 + unlock + role user | Task 3 |
| Tick Trial → clear levels + null end + role trial | Task 3 |
| Edit modal clear on trial | Task 3 |
| Progress never deleted | Task 3 (no deletes) |
| Learner Trial 1 lesson / Expired lock all | Task 2 + 5 |
| New user `unlocked_levels: []` | Task 5 |
| Interactive red Trial checkbox | Task 4 |

## Placeholder scan

No TBD / “implement later” / vague steps remaining after write.
