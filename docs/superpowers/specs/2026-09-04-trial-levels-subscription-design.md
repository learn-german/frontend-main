# Trial / Levels / Subscription — Design Spec

**Date:** 2026-09-04  
**Status:** Approved in brainstorming (pending user review of this file)  
**Branch / worktree:** `feat/trial-clear-levels`  
**Related:** `2026-09-04-admin-trial-indicator-design.md` (Trial checkbox was read-only; this spec supersedes that UX), `2026-09-03-trial-role-design.md` (learner gating alignment)

## Overview

Chuẩn hoá ba trạng thái học viên từ `profiles.subscription_end_date` + `profiles.unlocked_levels`, không thêm cột/flag mới:

| State | Condition | Levels | Learner access | Admin |
|-------|-----------|--------|----------------|-------|
| **Trial** | `subscription_end_date` null/rỗng | `[]` | Chỉ bài A1 đầu tiên | Ô Trial tick (đỏ), bấm được |
| **Active** | `end_date >= today` (local calendar) | Có A1/A2/B1/B2 | Theo `unlocked_levels` | Trial tắt; cột còn lại = `N ngày` |
| **Expired** | `end_date < today` | **Giữ nguyên** | Khoá **hết** bài | Chữ **Hết hạn**; không bật Trial, không xoá cấp |

Progress học (`lesson_progress`, enrollments, XP/streak) **không bao giờ xoá** khi đổi trạng thái.

## Goals

- Admin bấm được ô **Trial** và các ô cấp độ; hành vi ghi DB rõ ràng.
- User mới mặc định Trial: chỉ học bài đầu A1.
- Tick bất kỳ cấp khi đang Trial → +90 ngày từ hôm nay, mở cấp đó, tắt Trial.
- Tick Trial khi đang Active → `unlocked_levels = []`, `subscription_end_date = null`.
- Hết hạn ≠ Trial: giữ checkbox cấp độ, khoá bài, admin extend ngày thì học tiếp.
- Cột admin mới: số ngày còn lại / **Hết hạn**.

## Non-goals

- Migration drop/rename `is_premium`.
- Filter admin theo Trial / Hết hạn (có thể làm sau).
- Tự động gia hạn hoặc thanh toán.
- Xoá hoặc archive progress khi về Trial / hết hạn.

## Data model (source of truth)

```
isTrial(end)    = end is null OR trim(end) === ""
isExpired(end)  = end is non-empty AND calendar(end) < calendar(today local)
isActive(end)   = end is non-empty AND calendar(end) >= calendar(today local)
daysRemaining   = max(0, calendar(end) - calendar(today)) when isActive; else N/A
```

**Breaking change vs prior helper:** `isTrialBySubscription` **không** còn coi ngày quá khứ là Trial. Past date → Expired, not Trial. Update unit tests accordingly.

No new DB columns. Optional: new profiles default `unlocked_levels = []` only for **new** inserts via app/auth path — do **not** bulk-clear existing Active users’ levels via migration.

## State transitions (admin)

### 1. Trial → Active (tick A1 / A2 / B1 / B2)

When `isTrial(user.subscriptionEndDate)`:

1. `unlocked_levels = [clickedLevel]`
2. `subscription_end_date = today + 90 days` (ISO date `YYYY-MM-DD`)
3. Prefer syncing `role` from `trial` → `user` if currently `trial` (profiles + `set-admin-role` if that path already exists for role edits)
4. Keep existing level-enrollment upsert behavior for the unlocked level
5. Do not touch progress tables

When **not** Trial (Active or Expired): toggling a level only updates `unlocked_levels` (and enrollment on unlock). **Do not** reset `subscription_end_date` to +90.

### 2. Active / Expired → Trial (tick Trial on)

1. `unlocked_levels = []`
2. `subscription_end_date = null`
3. Optionally set `role` → `trial`
4. Do not delete progress / enrollments / stats

Trial checkbox is **interactive** (remove `disabled` / `readOnly`).

### 3. Expired → Active (extend)

Admin sets a future `subscription_end_date` via edit modal (existing date picker). Levels stay as stored. Learner access unlocks again for those levels.

### 4. Mutual exclusivity (UI)

- Trial checked ⇔ `isTrial(end)` ⇔ levels checkboxes unchecked in UI (DB `[]`)
- Any level checked ⇔ not Trial (`end` non-null)
- Expired users: levels may remain checked; Trial unchecked; remaining column shows **Hết hạn**

## Admin UI (`AdminUsersSection`)

### Levels column

- A1–B2 checkboxes: existing pattern; Trial toggle enabled.
- Trial checked styling: **red / accent** (same visual weight as an unlocked level checkbox), not gray-disabled look.
- Handlers implement transitions above (single profile update or small sequence; rollback UI state on error with toast).

### New column: “Còn lại” (or “Thời hạn”)

Place near levels / before “Ngày tạo”:

| State | Display |
|-------|---------|
| Trial | `—` |
| Active | `N ngày` |
| Expired | **Hết hạn** (warning color) |

### Edit modal

- Saving with cleared date / role trial: apply same clear-levels rule as ticking Trial.
- Saving a future end date: do not clear levels.
- Role `user` still requires an end date (existing validation).

## Learner gating

Align `trialGating` / `App.tsx` / Roadmap / Dashboard with three states:

| State | Access |
|-------|--------|
| Trial | Exactly first ordered A1 lesson (`getTrialLessonLimit()` = 1), even if `unlocked_levels` is `[]` |
| Active | Filter roadmap/lessons by `unlocked_levels` as today |
| Expired | Lock **all** lessons (including previously completed). Not “first lesson free”. Show expired messaging (reuse/adapt trial banner copy to “hết hạn”) |
| Admin | Full access |

**Important:** Current `isEffectivelyTrial(role, end)` treats expired subscription like trial. **Split** into Trial vs Expired so expired users do not get the one-lesson trial allowance.

New-user profile insert: `role: "trial"`, `subscription_end_date: null`, `unlocked_levels: []` when the insert path sets levels.

## Progress preservation

Never delete on Trial/Expired transitions:

- `lesson_progress` (and related quiz progress)
- `level_enrollments`
- `user_stats` (xp, streak)

Clearing `unlocked_levels` only restricts **access**, not history. When levels / end date return, progress reappears.

## Files likely touched

| File | Change |
|------|--------|
| `src/lib/isTrialBySubscription.ts` (+ test) | Trial = null/empty only |
| `src/lib/trialGating.ts` (+ tests if present) | Split Trial vs Expired access |
| `src/pages/admin/AdminUsersSection.tsx` | Interactive Trial, +90 on unlock-from-trial, remaining column, styles |
| `src/App.tsx` / Dashboard / Roadmap | Wire expired lock-all vs trial one-lesson |
| Profile create path in `App.tsx` (or admin create) | Default `unlocked_levels: []` for new trial users |

## Testing

1. Unit: `isTrialBySubscription` — past date → false; null/empty → true; today/future → false.
2. Unit: days remaining / expired helpers if extracted.
3. Manual admin:
   - New/trial user: Trial red checked, levels empty, còn lại `—`.
   - Tick A2 → A2 on, Trial off, end ≈ today+90, còn lại ~90.
   - Tick Trial again → levels empty, end null, progress rows still in DB.
   - Set end to yesterday via edit → levels stay; column **Hết hạn**; learner fully locked.
   - Extend end to future → access restored for checked levels.
4. Manual learner: Trial only first A1 lesson; Active per levels; Expired none.

## Relationship to prior specs

- **2026-09-04-admin-trial-indicator:** Trial checkbox becomes interactive; definition of Trial no longer includes expired dates; remaining/expired column added.
- **2026-09-03-trial-role:** Learner gating must distinguish expired (lock all) from trial (one lesson).
