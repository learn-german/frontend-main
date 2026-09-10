# Learning Streak (Chuỗi học liên tục) — Design

**Date:** 2026-09-08  
**Branch / worktree:** `feat/learning-streak` @ `.worktrees/feat-learning-streak`  
**Status:** Approved in brainstorming; awaiting spec review before implementation plan

## Goal

Add a sidebar “CHUỖI HỌC LIÊN TỤC” widget matching the product mock, backed by server-side streak rules and a per-day activity log. Any learning activity counts toward today’s streak.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Placement | Desktop sidebar bottom only (below existing weekly meeting card) |
| Missed days | Miss **1** calendar day → streak kept; miss **≥2** consecutive days → reset |
| Increment after grace | Study again after 1 missed day → **+1 only** (grace day does not increment) |
| What counts as learning | Any learning activity: lesson complete, grammar submit, reading submit (and listening if it uses the same submit path) |
| Approach | Server streak update + `learning_activity_days` log; UI reads streak + current week booleans |
| Timezone | All “today / yesterday / week” use **Asia/Ho_Chi_Minh** |
| Mobile | No streak badge on mobile navbar in this scope |
| Meeting card | Keep “Buổi học tuần này”; do **not** replace it |
| History backfill | No backfill from old progress; week dots start empty until new activity after deploy |

## Architecture

```text
lesson-complete / grammar-submit / reading-submit
        │
        ▼
 record_learning_activity(user_id)   ← Postgres RPC (service_role)
        │
        ├─ upsert learning_activity_days(user_id, today VN)
        └─ update user_stats.streak + last_activity_date

Sidebar
  ├─ weekly meeting card (existing)
  └─ LearningStreakCard(streak, weekActivity[7])
        ▲
        │
 useUserStats / dashboard query
   streak from user_stats
   weekActivity from learning_activity_days (Mon–Sun this week, VN)
```

## Data model

### Table `learning_activity_days`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` | FK → `auth.users`, part of PK |
| `activity_date` | `date` | Calendar day in VN sense (stored as date); part of PK |

- Primary key: `(user_id, activity_date)` — at most one row per user per day.
- RLS: authenticated users may `SELECT` only their own rows; `INSERT`/`UPDATE`/`DELETE` only via `service_role` (Edge Functions calling the RPC).

### RPC `record_learning_activity(p_user_id uuid)`

Security: callable only by `service_role` (Edge Functions).

Algorithm:

1. `today` = current date in `Asia/Ho_Chi_Minh`.
2. Upsert `(p_user_id, today)` into `learning_activity_days`.
3. Read `user_stats.streak` and `last_activity_date` for `p_user_id`.
4. Compute `new_streak`:
   - No `last_activity_date` → `1`
   - `last_activity_date = today` → keep current streak
   - `last_activity_date` is **yesterday** or **day before yesterday** (exactly 1 or 2 calendar days before `today`) → `streak + 1`
     - Gap of 1 day means “yesterday”; gap of 2 days means “studied, missed one full day, studying again” — both continue with +1 for today only.
   - Otherwise (gap ≥ 3 calendar days between last activity and today, i.e. ≥2 full missed days) → `1`
5. Update `user_stats`: `streak = new_streak`, `last_activity_date = today`, `updated_at = now()`.

Clarifying the gap math (inclusive of approved examples):

| Last activity | Today | Missed full days | Result |
| --- | --- | --- | --- |
| same day | today | 0 | keep |
| yesterday | today | 0 | streak + 1 |
| 2 days ago | today | 1 | streak + 1 |
| 3+ days ago | today | ≥2 | streak = 1 |

Example: streak was 5; miss one day; study again → **6**.

### Call sites

Invoke `record_learning_activity` from:

- `lesson-complete` (replace inline streak logic)
- `grammar-submit` (on successful learning submit that represents activity for the day)
- `reading-submit` (same; covers reading and listening flows that use this function)

Call even when XP awarded is 0 for that request (e.g. retry), as long as the request is an authenticated successful learning action for that day — upsert makes repeats cheap.

Do **not** call from admin-only or non-learning endpoints.

## Frontend

### `LearningStreakCard`

Presentational component:

- Title: `CHUỖI HỌC LIÊN TỤC` (red, uppercase)
- Flame icon
- Large count: `{streak} ngày`
- Subcopy:
  - `streak === 0`: `Hãy học hôm nay để bắt đầu chuỗi!`
  - `streak >= 1`: `Bạn đang duy trì thói quen học rất tốt!`
- Row of 7 day cells: labels `T2 T3 T4 T5 T6 T7 CN`
  - Active: solid red circle + white check
  - Inactive: empty circle, light grey border
- Visual language aligned with mock (light background, light red border)

### `Sidebar` integration

- New props: `streak: number`, `weekActivity: boolean[]` (length 7, Monday→Sunday).
- Render meeting card as today; place `LearningStreakCard` **below** it, pushed toward the bottom (`mt-auto` on the streak block or a footer stack).
- Desktop only (`aside` already `hidden lg:flex`).

### Data wiring

- Extend stats loading (e.g. `useUserStats` and/or `dashboard` Edge Function) to expose:
  - `streak` (existing)
  - `weekActivity` for current VN week Mon–Sun from `learning_activity_days`
- After lesson-complete (and optionally after grammar/reading submit if client already refreshes stats), keep local streak in sync when the response includes `newStreak` — prefer returning `newStreak` from EFs that already return XP payloads; otherwise refetch stats.

## Error handling

- RPC failure in an EF: log; do not fail the whole submit solely because streak recording failed **if** the primary learning write (progress / XP) already succeeded — prefer best-effort streak after core write, or transactional order that keeps learning progress primary. Implementation plan should pick one consistent pattern (recommended: run RPC after successful core writes; on RPC error still return success for learning with streak unchanged this request).
- Missing `user_stats` row: create/ensure row as existing EFs already do, or no-op safely.
- Client with empty `weekActivity`: show seven empty circles; do not crash.

## Testing

- Pure/SQL tests for streak gap cases (same day, +1 day, +2 days grace, +3 days reset, first activity).
- Upsert idempotency: two calls same day → one row, streak unchanged on second call.
- UI smoke: Sidebar shows card; checked vs empty circles match fixture week bits.

## Out of scope

- Mobile navbar streak badge
- Replacing or removing the weekly meeting sidebar card
- Admin/leaderboard UI redesign around streak
- Backfilling `learning_activity_days` from historical `lesson_progress` / submit timestamps
- Changing XP amounts

## Success criteria

1. Completing a lesson or submitting grammar/reading on a day marks that weekday circle and updates streak per the grace rule.
2. Missing one day then studying again continues the streak with +1 only.
3. Missing two or more full days then studying again resets streak to 1.
4. Sidebar shows the streak widget under the meeting card on desktop portal pages.
`)