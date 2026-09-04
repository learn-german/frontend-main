# Online Meeting Schedule — Product Integration Design

**Date:** 2026-09-04  
**Status:** Approved (pending user review of this file)  
**Branch / worktree:** `feat/online-meeting-schedule`  
**UI reference:** `docs/mockups/meeting-admin.html`, `docs/mockups/meeting-user.html`  
**Prior mockup spec:** `docs/superpowers/specs/2026-09-04-online-meeting-mockup-design.md` (HTML-only; still valid as UX reference)

## Overview

Ship the online support-meeting feature in the production React + Supabase app: admin CRUD for sessions, learner registration with hard caps, Meet link secrecy, and Weekly Meeting UI replacing the streak slot on dashboard banner and sidebar.

## Goal

- Admin creates/edits/deletes support sessions (date, time, pasted Meet URL, notes, level).
- Eligible learners browse upcoming sessions, register/cancel, and join Meet only after registering.
- Enforce **max 10** registrations per session and **at most one active registration per calendar week (Mon–Sun, `Asia/Ho_Chi_Minh`)**.
- Cancel frees the weekly slot.
- Replace streak widgets (dashboard banner + sidebar) with Weekly Meeting card/teaser.
- Gate access using subscription validity (same calendar-day idea as trial-by-subscription).

## Non-goals

- Google Meet / Calendar API (admin pastes URL only; no “Tạo Meet” button).
- Email / push reminders.
- Keeping streak + meeting side-by-side on the banner (streak is replaced).
- Changing HTML mockups further.
- Multi-timezone beyond `Asia/Ho_Chi_Minh` week boundaries.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Full stack: DB + RLS + Edge Functions + admin UI + user UI + streak replacement |
| Architecture | Tables + RLS; **register/cancel (and learner meet_url access) via Edge Functions** |
| Capacity | Hard max **10** per session (server-enforced) |
| Weekly limit | Calendar week **Monday–Sunday** in **`Asia/Ho_Chi_Minh`** |
| Cancel | Frees weekly slot (may register another session same week) |
| Meet URL | Admin paste only; learners never receive URL until registered |
| Access gate | Locked when `isTrialBySubscription(subscription_end_date)` is true (null/empty/expired calendar day); **admin bypass**; nav visible but gated like `/help` |
| Meet create button | **Removed** (no placeholder helper in production) |
| Streak | Replaced on dashboard banner + sidebar; mobile navbar streak badge **hidden** (no meeting badge on mobile bar) |

## Data model

### `meeting_sessions`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | required |
| `level` | text | CHECK `IN ('A1','A2','B1','B2')` |
| `session_date` | date | required |
| `start_time` | time | required |
| `end_time` | time | required; CHECK `end_time > start_time` |
| `meet_url` | text | required; https URL expected |
| `note` | text | nullable |
| `created_by` | uuid | FK `auth.users`, nullable |
| `created_at` / `updated_at` | timestamptz | |

### `meeting_registrations`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `session_id` | uuid FK | ON DELETE CASCADE |
| `user_id` | uuid FK | `auth.users` / profiles |
| `registered_at` | timestamptz | default now() |
| | | **UNIQUE (`session_id`, `user_id`)** |

Index: `(user_id, registered_at)`; index on `session_id`.

### Learner-safe list view

`meeting_sessions_for_learners` (security_invoker / barrier view as appropriate):

- Exposes session fields **except `meet_url`**
- Exposes `registration_count` (subselect or maintained counter)
- Granted `SELECT` to `authenticated`

Base table `meeting_sessions`: direct `SELECT`/`INSERT`/`UPDATE`/`DELETE` only for **admin** JWT (`app_metadata.role = 'admin'`). Authenticated non-admins do **not** read `meet_url` via PostgREST.

### Registrations RLS

- Learners: `SELECT` own rows only (`user_id = auth.uid()`)
- Admin: `SELECT` all
- **No** direct `INSERT`/`DELETE` for `authenticated` — only Edge Functions using service role (or SECURITY DEFINER RPC called from Edge)

## Edge Functions

### `register-meeting`

Input: `{ sessionId: string }`  
Auth: required user JWT.

Steps (single logical transaction / advisory lock or `SELECT … FOR UPDATE` on session row):

1. Load profile; reject if admin bypass not applicable and `isTrialBySubscription(subscription_end_date)` (calendar day in `Asia/Ho_Chi_Minh`).
2. Load session; 404 if missing.
3. Count registrations for session; reject if `>= 10`.
4. Find any registration for this user whose session’s `session_date` falls in the **same Mon–Sun week** (TZ `Asia/Ho_Chi_Minh`) as the target session’s date; reject if found (unless same session already registered → idempotent OK or “already”).
5. Insert registration.
6. Return `{ registration, session: { …fields including meet_url } }`.

### `cancel-meeting`

Input: `{ sessionId: string }`  
Delete caller’s registration for that session; return success. Frees weekly slot.

### Meet URL thereafter

- After register, client stores returned `meet_url` for that session in page state.
- On reload: Edge **`list-my-meeting-week`** (or extend register flow) **or** a small `get-meeting-link` that returns `meet_url` only if `auth.uid()` has a registration for `sessionId`. Prefer one **`list-learner-meetings`** Edge that returns upcoming sessions (from view data + count) and attaches `meet_url` only on sessions the user registered for — avoids leaking URLs in PostgREST.

**Recommendation:** Learner-facing read path for the meetings page goes through **`list-learner-meetings`** Edge (service role assemble DTO). Admin continues PostgREST on base tables. Keeps `meet_url` off the wire for non-registrants.

If `list-learner-meetings` is used, `register-meeting` / `cancel-meeting` still perform mutations; client refreshes via list.

## Frontend

### Routing / nav

- Extend `AppPage` + `router.ts`: `/meetings` → `meetings`
- `MeetingPage.tsx` (learner UI from mockup; DesignSystem / existing tokens)
- Sidebar link **Lịch học trực tuyến**
- Extend `LockedFeature` with `"meetings"`; lock when `isTrialBySubscription(subscriptionEndDate)` (and keep admin unlocked). Align `isFeatureLocked` / App locked pages with this rule (prefer subscription helper over role-only trial for this feature, per product decision).

### Admin

- `AdminSection` += `"meetings"`
- `AdminMeetingSection.tsx`: form (title, level, date, start/end, meet URL paste, note) + list + search/filter + registrant modal + delete confirm (toast/modal, no `window.alert`)
- No “Tạo Meet” control

### Streak replacement

- `DashboardPage`: right hero card → Weekly Meeting (fetch user’s registration this week + session; Join opens `meet_url`; empty CTA → navigate `/meetings`)
- `Sidebar`: bottom streak card → compact next-meeting teaser
- `Navbar` mobile: remove streak badge display (do not add meeting chip)

### Client lib

- `src/lib/meetings.ts` — typed helpers calling Edge + admin PostgREST
- Types in `src/lib/appTypes.ts`
- `npm run gen:types` after migrations (do not hand-edit `database.types.ts`)

## Business rules (server source of truth)

```
MAX_CAPACITY = 10
week(session_date) = ISO-style week Mon–Sun in Asia/Ho_Chi_Minh
canRegister =
  authenticated
  AND NOT isTrialBySubscription(subscription_end_date)  -- admin may skip for tooling if needed; learners enforced
  AND count(session) < 10
  AND no other registration for same user in same week(session_date)
cancel → delete own registration → week slot free
meet_url → only if registered (or admin)
```

## Out of scope follow-ups

- Real Google Meet provisioning
- Notifications
- Analytics / attendance tracking
- Restoring streak UI elsewhere

## Acceptance criteria

- [ ] Migration applies; RLS enabled; learner cannot `SELECT` raw `meet_url` for sessions they did not register for
- [ ] Admin CRUD sessions + view registrants
- [ ] Tenth registration rejected server-side; UI shows FULL
- [ ] Second registration same VN calendar week rejected until cancel
- [ ] Cancel then register another session same week succeeds
- [ ] Expired/missing subscription cannot use `/meetings` (gated like help)
- [ ] Banner + sidebar show Weekly Meeting instead of streak
- [ ] `npm run lint` passes; manual browser smoke on admin + learner

## Relationship to mockups

Mockups remain the UX blueprint. Production uses app DesignSystem (orange/slate), not necessarily mockup-only red chrome, while preserving information architecture: stats, form+list admin, date-block cards, capacity bar, Weekly Meeting card.
