# Admin Trial Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a read-only Trial checkbox in Admin > Người dùng (Cấp độ mở column) derived from `subscription_end_date`, and stop using `is_premium` in admin edit + daily-progress-report batch.

**Architecture:** Pure helper `isTrialBySubscription` (null/empty/past date → trial). Admin table renders a disabled checkbox. Edit modal and profile fetch drop `is_premium`. Batch eligibility uses only `subscription_end_date >= reportDate`. No DB migration.

**Tech Stack:** React 19, TypeScript, Supabase PostgREST + Edge Function (`daily-progress-report`), Node test runner (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-04-admin-trial-indicator-design.md`

## Global Constraints

- UI labels in Vietnamese where user-facing; code identifiers in English.
- No `any` in TypeScript.
- Do not drop `profiles.is_premium` column.
- Do not add learner-side trial gating (out of scope).
- Do not add Trial to admin filters.
- No new npm packages.
- After code edits: `npm run lint`. Before editing symbols: GitNexus `impact` upstream; before commit: `detect_changes()`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/isTrialBySubscription.ts` | Pure date → trial boolean |
| `src/lib/isTrialBySubscription.test.ts` | Unit tests for helper |
| `src/pages/admin/AdminUsersSection.tsx` | Trial UI + remove is_premium from edit/fetch |
| `supabase/functions/daily-progress-report/index.ts` | Batch filter without `is_premium` |

---

### Task 1: `isTrialBySubscription` helper (TDD)

**Files:**
- Create: `src/lib/isTrialBySubscription.ts`
- Test: `src/lib/isTrialBySubscription.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `isTrialBySubscription(subscriptionEndDate: string | null, today?: string): boolean`
  - `today` optional ISO date `YYYY-MM-DD` for tests; default = local calendar today as `YYYY-MM-DD`
  - Returns `true` when `subscriptionEndDate` is `null`, empty/whitespace, or calendar date `< today`
  - Returns `false` when end date `>= today` (same day = not trial)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/isTrialBySubscription.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { isTrialBySubscription } from "./isTrialBySubscription";

const TODAY = "2026-09-04";

test("null → trial", () => {
  assert.equal(isTrialBySubscription(null, TODAY), true);
});

test("empty / whitespace → trial", () => {
  assert.equal(isTrialBySubscription("", TODAY), true);
  assert.equal(isTrialBySubscription("   ", TODAY), true);
});

test("past date → trial", () => {
  assert.equal(isTrialBySubscription("2026-09-03", TODAY), true);
});

test("today → not trial", () => {
  assert.equal(isTrialBySubscription("2026-09-04", TODAY), false);
});

test("future date → not trial", () => {
  assert.equal(isTrialBySubscription("2026-12-31", TODAY), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/isTrialBySubscription.test.ts`  
Expected: FAIL — module / export not found

- [ ] **Step 3: Implement helper**

Create `src/lib/isTrialBySubscription.ts`:

```typescript
function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Trial when subscription_end_date is missing or strictly before today (calendar day). */
export function isTrialBySubscription(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): boolean {
  if (subscriptionEndDate == null) return true;
  const end = subscriptionEndDate.trim().slice(0, 10);
  if (!end) return true;
  return end < today;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/isTrialBySubscription.test.ts`  
Expected: all 5 tests PASS

- [ ] **Step 5: Lint**

Run: `npm run lint`  
Expected: no new errors

- [ ] **Step 6: Commit** (only if user asked to commit)

```bash
git add src/lib/isTrialBySubscription.ts src/lib/isTrialBySubscription.test.ts
git commit -m "$(cat <<'EOF'
feat: add isTrialBySubscription helper for admin trial indicator

EOF
)"
```

---

### Task 2: Admin table Trial checkbox + remove `is_premium` from edit

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Consumes: `isTrialBySubscription(subscriptionEndDate: string | null, today?: string): boolean`
- Produces: read-only Trial checkbox in Cấp độ mở; EditForm without `is_premium`

Before editing exported/local symbols that GitNexus tracks (`handleSaveEdit`, etc.), run impact upstream and report blast radius if HIGH/CRITICAL.

- [ ] **Step 1: Import helper**

At top of `AdminUsersSection.tsx`, add:

```typescript
import { isTrialBySubscription } from "../../lib/isTrialBySubscription";
```

- [ ] **Step 2: Strip `isPremium` from types and fetch**

Change `AdminUser` — remove `isPremium`:

```typescript
interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
  role: string;
  unlockedLevels: string[];
  subscriptionEndDate: string | null;
}
```

Change `EditForm`:

```typescript
interface EditForm { full_name: string; role: string; subscription_end_date: string; }
```

Initial `editForm` state:

```typescript
const [editForm, setEditForm] = useState<EditForm>({ full_name: "", role: "user", subscription_end_date: "" });
```

In `fetchUsers` `.select(...)`, remove `is_premium`:

```typescript
.select("id, email, full_name, created_at, role, unlocked_levels, subscription_end_date, user_stats(xp, streak)")
```

In the map, remove `isPremium` line; keep:

```typescript
subscriptionEndDate: (p as unknown as { subscription_end_date?: string | null }).subscription_end_date ?? null,
```

- [ ] **Step 3: `handleSaveEdit` — stop writing `is_premium`**

Update payload:

```typescript
const { error: profileError } = await supabase
  .from("profiles")
  .update({
    full_name: editForm.full_name,
    role: editForm.role,
    subscription_end_date: editForm.subscription_end_date || null,
  })
  .eq("id", editUser.id);
```

- [ ] **Step 4: Pencil onClick — EditForm without `is_premium`**

```typescript
onClick={() => { setEditUser(u); setEditForm({
  full_name: u.full_name ?? "",
  role: u.role,
  subscription_end_date: u.subscriptionEndDate ?? "",
}); }}
```

- [ ] **Step 5: Remove “Gói đang active” checkbox block from Edit modal**

Delete the entire block:

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
```

Keep the “Ngày hết hạn gói” date input.

- [ ] **Step 6: Add Trial checkbox after A1–B2 in the table cell**

Replace the Cấp độ mở cell inner `div` with:

```tsx
<div className="flex items-center justify-center gap-2">
  {(["A1", "A2", "B1", "B2"] as const).map((level) => (
    <label key={level} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
      <input
        type="checkbox"
        checked={u.unlockedLevels.includes(level)}
        onChange={() => handleToggleLevel(u, level)}
        className="w-3.5 h-3.5 accent-orange-600 cursor-pointer"
      />
      {level}
    </label>
  ))}
  <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
    <input
      type="checkbox"
      checked={isTrialBySubscription(u.subscriptionEndDate)}
      disabled
      readOnly
      className="w-3.5 h-3.5 accent-orange-600"
      title="Trial khi chưa có hoặc đã hết hạn subscription_end_date"
    />
    Trial
  </label>
</div>
```

- [ ] **Step 7: Lint**

Run: `npm run lint`  
Expected: clean (no references to `isPremium` / `editForm.is_premium` left in this file)

- [ ] **Step 8: Manual smoke (browser)**

1. Open Admin > Người dùng.
2. User with null / past `subscription_end_date` → Trial checked, not clickable.
3. User with future end date → Trial unchecked.
4. Edit modal: no “Gói đang active”; can still set “Ngày hết hạn gói” and save.
5. After save with future date → Trial unchecked on refresh; clear date → Trial checked.

- [ ] **Step 9: Commit** (only if user asked)

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "$(cat <<'EOF'
feat(admin): show read-only Trial from subscription_end_date; drop is_premium edit

EOF
)"
```

---

### Task 3: daily-progress-report batch — drop `is_premium` filter

**Files:**
- Modify: `supabase/functions/daily-progress-report/index.ts`

**Interfaces:**
- Consumes: `profiles.subscription_end_date`
- Produces: batch selects users with `subscription_end_date >= reportDate` only (no `is_premium`)

- [ ] **Step 1: Update `handleBatch` query**

Find:

```typescript
const { data: eligible } = await supabase
  .from("profiles")
  .select("id")
  .eq("is_premium", true)
  .gte("subscription_end_date", reportDate);
```

Replace with:

```typescript
const { data: eligible } = await supabase
  .from("profiles")
  .select("id")
  .gte("subscription_end_date", reportDate);
```

- [ ] **Step 2: Drop unused `is_premium` from profile select in `computeAndUpsertReport`**

Find:

```typescript
.select("is_premium, subscription_end_date, unlocked_levels")
```

Replace with:

```typescript
.select("subscription_end_date, unlocked_levels")
```

- [ ] **Step 3: Grep residual `is_premium` in this function folder**

Run: `rg is_premium supabase/functions/daily-progress-report`  
Expected: no matches (or only comments — remove those too if they claim is_premium is required)

- [ ] **Step 4: Commit** (only if user asked; deploy Edge Function separately when ready)

```bash
git add supabase/functions/daily-progress-report/index.ts
git commit -m "$(cat <<'EOF'
fix(daily-progress-report): eligible batch users by subscription_end_date only

EOF
)"
```

Note: After merge, deploy `daily-progress-report` so production batch matches. Not part of frontend `npm run build`.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Helper + unit tests | Task 1 |
| Read-only Trial in Cấp độ mở | Task 2 Step 6 |
| Rule: null / past → trial; today+ → not | Task 1 |
| Remove is_premium from Edit modal / save / fetch | Task 2 |
| Keep subscription_end_date picker | Task 2 Step 5 |
| Batch without is_premium | Task 3 |
| No DB migration / no learner gating / no filter | Explicit non-goals — no tasks |

No placeholders. Types consistent: `isTrialBySubscription(string \| null, today?: string): boolean`.
