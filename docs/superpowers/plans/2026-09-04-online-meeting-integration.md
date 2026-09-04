# Online Meeting Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship production online support meetings — admin CRUD, learner register/cancel with server-enforced caps, Meet URL secrecy, `/meetings` page, and Weekly Meeting UI replacing streak on dashboard + sidebar.

**Architecture:** Postgres tables + RLS (admin full access; learners never `SELECT` `meet_url`). Learner list/register/cancel via Edge Functions with service role. React admin section + `MeetingPage` + nav/gating; dashboard/sidebar streak slots swapped for meeting widgets. UX follows `docs/mockups/meeting-*.html`; styling uses existing DesignSystem.

**Tech Stack:** Supabase (Postgres 15, RLS, Edge Functions/Deno), React 19 + TypeScript 5.8, Vite, Tailwind v4, existing `showToast` / DesignSystem.

**Spec:** `docs/superpowers/specs/2026-09-04-online-meeting-integration-design.md`  
**Worktree:** `/Users/thangnv/Documents/github/frontend-main-1/.worktrees/feat-online-meeting-schedule` · branch `feat/online-meeting-schedule`

## Global Constraints

- Code identifiers / comments: **English**. UI copy: **Tiếng Việt**.
- No `any`. Named exports only (except `App.tsx`).
- No `window.alert` / `window.confirm` — use `showToast` / in-page modal.
- No new npm packages without asking.
- Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend.
- Never hand-edit `src/lib/database.types.ts` — run `npm run gen:types` after schema push.
- `MAX_CAPACITY = 10`. Week = Monday–Sunday in **`Asia/Ho_Chi_Minh`**.
- Cancel frees weekly slot. Meet URL only after registration (or admin).
- Access: lock meetings when `isTrialBySubscription(subscription_end_date)`; **admin bypass**.
- No Google Meet API / no “Tạo Meet” button.
- Replace streak on dashboard banner + sidebar; **hide** mobile navbar streak badge.
- Prefer DesignSystem components; reuse support-ticket patterns (`src/lib/support.ts`, `AdminSupportSection.tsx`, `SupportPage.tsx`).
- Run `npm run lint` after TS changes. Impact-analyze symbols before editing (GitNexus) when required by repo rules.

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260904220000_meeting_sessions.sql` | Tables, indexes, RLS, learner view |
| `supabase/functions/list-learner-meetings/index.ts` | Learner DTO list + meet_url only if registered |
| `supabase/functions/register-meeting/index.ts` | Register with capacity + week + subscription checks |
| `supabase/functions/cancel-meeting/index.ts` | Cancel own registration |
| `src/lib/meetingWeek.ts` | Pure week-key helpers (VN TZ) + unit tests |
| `src/lib/meetings.ts` | Client API (admin PostgREST + Edge invokes) |
| `src/lib/appTypes.ts` | Meeting types |
| `src/lib/trialGating.ts` | Add `"meetings"` LockedFeature; gate via subscription helper |
| `src/lib/router.ts` / `App.tsx` / `Navigation.tsx` | `/meetings` route + sidebar + locks |
| `src/pages/admin/AdminPage.tsx` + `AdminMeetingSection.tsx` | Admin UI |
| `src/pages/MeetingPage.tsx` | Learner UI |
| `src/pages/DashboardPage.tsx` | Weekly Meeting card replaces streak |
| `src/components/Navigation.tsx` | Sidebar teaser; hide mobile streak |

---

### Task 1: Migration — tables, view, RLS

**Files:**
- Create: `supabase/migrations/20260904220000_meeting_sessions.sql`

**Interfaces:**
- Produces: tables `meeting_sessions`, `meeting_registrations`; view `meeting_sessions_for_learners`; RLS policies as below

- [ ] **Step 1: Write migration SQL**

```sql
-- meeting_sessions + meeting_registrations + RLS + learner view (no meet_url)
CREATE TABLE meeting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2')),
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  meet_url TEXT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_sessions_time_check CHECK (end_time > start_time)
);

CREATE TABLE meeting_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX meeting_registrations_session_idx ON meeting_registrations (session_id);
CREATE INDEX meeting_registrations_user_idx ON meeting_registrations (user_id, registered_at DESC);

ALTER TABLE meeting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_registrations ENABLE ROW LEVEL SECURITY;

-- Admin full access (JWT app_metadata.role = admin) — mirror support_tickets
CREATE POLICY "meeting_sessions: admin all"
  ON meeting_sessions FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- No SELECT policy on meeting_sessions for plain authenticated
-- (learners use view + Edge). Service role bypasses RLS.

CREATE POLICY "meeting_registrations: own read"
  ON meeting_registrations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "meeting_registrations: admin all"
  ON meeting_registrations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- No INSERT/DELETE policies for authenticated (Edge/service only)

CREATE OR REPLACE VIEW meeting_sessions_for_learners
WITH (security_invoker = true) AS
SELECT
  s.id, s.title, s.level, s.session_date, s.start_time, s.end_time, s.note,
  s.created_at,
  (SELECT COUNT(*)::int FROM meeting_registrations r WHERE r.session_id = s.id) AS registration_count
FROM meeting_sessions s;

GRANT SELECT ON meeting_sessions_for_learners TO authenticated;
```

Note: if `security_invoker = true` blocks learners because base table has no SELECT policy, switch to `security_barrier` view owned by postgres with `security_invoker = false` (definer) **or** drop learner PostgREST access entirely and rely only on Edge `list-learner-meetings` (preferred if view fights RLS). **Preferred fallback:** skip granting the view to authenticated; Edge reads base tables with service role and strips `meet_url`. Keep the view in migration only if it works under RLS; otherwise document Edge-only list in a migration comment and omit the GRANT.

**Decision locked for implementers:** Use **Edge-only learner list** (service role). Still create the view for optional admin tooling / future, but do not depend on client selecting it. Simpler RLS: admin-only on `meeting_sessions`.

- [ ] **Step 2: Apply migration**

Prefer linked project (Deutsch) via Supabase MCP `apply_migration` or `supabase db push` after `supabase link`. Do **not** use local Docker unless the team already does.

- [ ] **Step 3: Verify RLS**

With SQL editor / MCP: as authenticated non-admin, `SELECT * FROM meeting_sessions` fails or returns 0; admin can insert a row; `meeting_registrations` insert as authenticated fails.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904220000_meeting_sessions.sql
git commit -m "$(cat <<'EOF'
feat(db): add meeting_sessions and meeting_registrations with RLS

Admin-only session access; registrations readable by owner; mutations reserved for Edge Functions.
EOF
)"
```

---

### Task 2: Pure week helpers + unit tests

**Files:**
- Create: `src/lib/meetingWeek.ts`
- Create: `src/lib/meetingWeek.test.ts`

**Interfaces:**
- Produces:
  - `MEETING_TZ = "Asia/Ho_Chi_Minh"`
  - `MAX_MEETING_CAPACITY = 10`
  - `vnCalendarDate(d: Date): string` → `YYYY-MM-DD` in VN
  - `weekKeyFromSessionDate(sessionDate: string): string` → stable key for Mon–Sun week containing that date in VN
  - `sameMeetingWeek(a: string, b: string): boolean`
  - `capacityStatus(count: number): "open" | "almost" | "full"`

- [ ] **Step 1: Write failing tests** in `meetingWeek.test.ts` (node:test / project’s existing assert style like `isTrialBySubscription.test.ts`):

```ts
// sameMeetingWeek("2026-09-04","2026-09-06") === true  // Fri–Sun
// sameMeetingWeek("2026-09-04","2026-09-07") === false // next Mon
// capacityStatus(7)==="open"; capacityStatus(8)==="almost"; capacityStatus(10)==="full"
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `meetingWeek.ts`**

Use `Intl` / explicit offset logic for VN (+07, no DST). Do not use UTC date alone for week boundaries.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/meetingWeek.ts src/lib/meetingWeek.test.ts
git commit -m "feat(meetings): add VN calendar week and capacity helpers"
```

---

### Task 3: Edge Functions — list / register / cancel

**Files:**
- Create: `supabase/functions/list-learner-meetings/index.ts`
- Create: `supabase/functions/register-meeting/index.ts`
- Create: `supabase/functions/cancel-meeting/index.ts`

**Interfaces:**
- Consumes: DB tables from Task 1; week rules mirrored from Task 2 (duplicate pure logic in Deno or inline equivalent — keep behavior identical)
- Produces HTTP JSON APIs below

Shared bootstrap (copy pattern from `lesson-complete/index.ts`): CORS, JWT via `auth.getUser`, service-role client.

- [ ] **Step 1: `list-learner-meetings`**

`GET` or `POST` empty body. Auth required.

Response:

```ts
{
  sessions: Array<{
    id: string;
    title: string;
    level: "A1"|"A2"|"B1"|"B2";
    sessionDate: string; // YYYY-MM-DD
    startTime: string;   // HH:mm:ss or HH:mm
    endTime: string;
    note: string | null;
    registrationCount: number;
    isRegistered: boolean;
    meetUrl: string | null; // non-null only if isRegistered
  }>;
  myRegistrationSessionId: string | null; // this VN week, if any
}
```

Filter: `session_date >= vnToday` (or include ongoing day). Sort by date+start.

Subscription: still return list if trial? Spec gates page client-side; Edge may still 403 trial on list for defense — **403 when `isTrialBySubscription`** (admin JWT role in app_metadata may bypass).

- [ ] **Step 2: `register-meeting`**

Body: `{ sessionId: string }`.

Enforce: auth, subscription, session exists, count `< 10`, no other registration in same VN week, then insert. Return session including `meetUrl`. Errors: `403 subscription`, `404`, `409 full`, `409 week_limit`, `409 already`.

Use transaction-safe pattern: recount inside conflict handling; unique violation → already.

- [ ] **Step 3: `cancel-meeting`**

Body: `{ sessionId: string }`. Delete where `user_id` + `session_id`. `404` if none.

- [ ] **Step 4: Deploy functions** to linked project (`supabase functions deploy …`) when credentials available; otherwise commit sources and note deploy in report.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/list-learner-meetings supabase/functions/register-meeting supabase/functions/cancel-meeting
git commit -m "feat(meetings): add Edge Functions for list, register, cancel"
```

---

### Task 4: Client lib + types + gen:types

**Files:**
- Modify: `src/lib/appTypes.ts`
- Create: `src/lib/meetings.ts`
- Regenerate: `src/lib/database.types.ts` via `npm run gen:types`

**Interfaces:**
- Produces:
  - Types `MeetingSessionAdmin`, `LearnerMeetingSession`, `MeetingRegistrationRow`
  - `listLearnerMeetings()`, `registerMeeting(sessionId)`, `cancelMeeting(sessionId)`
  - Admin: `adminListSessions()`, `adminUpsertSession(...)`, `adminDeleteSession(id)`, `adminListRegistrations(sessionId)`

- [ ] **Step 1: Add types to `appTypes.ts`** matching Edge DTO + admin row shape.

- [ ] **Step 2: Implement `meetings.ts`** using `supabase.functions.invoke` for learner ops and `.from("meeting_sessions")` / `.from("meeting_registrations")` for admin (admin JWT).

- [ ] **Step 3: `npm run gen:types`** after remote schema exists; commit generated types.

- [ ] **Step 4: `npm run lint`**

- [ ] **Step 5: Commit**

```bash
git add src/lib/appTypes.ts src/lib/meetings.ts src/lib/database.types.ts
git commit -m "feat(meetings): add client meetings API and generated DB types"
```

---

### Task 5: Gating + routing + navigation shell

**Files:**
- Modify: `src/lib/trialGating.ts`
- Modify: `src/lib/router.ts`
- Modify: `src/lib/appTypes.ts` (`AppState.currentPage` if mirrored)
- Modify: `src/App.tsx`
- Modify: `src/components/Navigation.tsx`
- Test: extend trial gating tests if present

**Interfaces:**
- Consumes: `isTrialBySubscription`
- Produces: page `"meetings"`, route `/meetings`, locked feature `"meetings"`

- [ ] **Step 1: Update `LockedFeature`**

```ts
export type LockedFeature = "leaderboard" | "help" | "packages" | "meetings";
```

Change `isFeatureLocked` so **`meetings`** uses `role !== "admin" && isTrialBySubscription(subscriptionEndDate)`. Keep existing behavior for other features (`isEffectivelyTrial`) unless tests require a shared path — do **not** silently change help/leaderboard semantics.

- [ ] **Step 2: Router** — add `"meetings"` to `AppPage`, `AppRoute`, `PROTECTED_PAGES`, `parseRoute` / `serializeRoute` (`/meetings`).

- [ ] **Step 3: `App.tsx`** — include `"meetings"` in `lockedPages` **using subscription rule** (or rely on `isFeatureLocked`); `showSidebar`; render `<MeetingPage />` placeholder empty div OK if Task 6 not done yet — prefer stub component exporting `MeetingPage` that says “Đang tải…” only if Task 6 immediately follows; otherwise create minimal stub file.

- [ ] **Step 4: Sidebar** — insert nav item after lesson / before packages: `{ id: "meetings", label: "Lịch học trực tuyến", desc: "Đăng ký buổi hỗ trợ", icon: Video or Calendar }`. Map `featureMap.meetings = "meetings"`.

- [ ] **Step 5: Lint + commit**

```bash
git commit -m "feat(meetings): add /meetings route and subscription gate"
```

---

### Task 6: AdminMeetingSection

**Files:**
- Create: `src/pages/admin/AdminMeetingSection.tsx`
- Modify: `src/pages/admin/AdminPage.tsx`

**Interfaces:**
- Consumes: `meetings.ts` admin helpers
- Produces: full admin UI (no Tạo Meet)

- [ ] **Step 1: Extend `AdminSection` + `NAV_ITEMS`** with `{ id: "meetings", label: "Lịch meeting", Icon: … }` and render branch.

- [ ] **Step 2: Build `AdminMeetingSection`** — layout from mockup (stats, form, list, registrant modal, delete modal). Paste Meet URL field required. Use DesignSystem buttons/inputs. Vietnamese labels.

- [ ] **Step 3: Manual / lint verify** — create session as admin; list updates; delete cascades registrations.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): add online meeting session management section"
```

---

### Task 7: MeetingPage (learner)

**Files:**
- Create: `src/pages/MeetingPage.tsx`
- Modify: `src/App.tsx` (wire real page if stubbed)

**Interfaces:**
- Consumes: `listLearnerMeetings`, `registerMeeting`, `cancelMeeting`
- Produces: learner UI matching mockup IA

- [ ] **Step 1: Implement page** — summary cards, filter, session cards (date block, capacity bar, CTAs), toast on success/error. FULL → dim + disabled. `week_limit` → disable with hint. Registered → Join + Cancel. Join opens `meetUrl` with `noopener`.

- [ ] **Step 2: Lint + smoke**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(meetings): add learner MeetingPage with register and cancel"
```

---

### Task 8: Replace streak with Weekly Meeting

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/components/Navigation.tsx` (`Sidebar`, `Navbar`)
- Modify: `src/App.tsx` (props: pass meeting teaser data or let children fetch)

**Interfaces:**
- Consumes: `listLearnerMeetings` (or lightweight subset)
- Produces: Weekly Meeting card + sidebar teaser; no mobile streak badge

- [ ] **Step 1: Dashboard hero right card** — replace streak block with Weekly Meeting (empty → CTA to `/meetings`; filled → date/time + Tham gia). Prefer fetching inside `DashboardPage` via `listLearnerMeetings` once.

- [ ] **Step 2: Sidebar bottom** — replace streak card with compact meeting teaser (same data; optional prop from App to avoid double fetch — if double fetch is OK for MVP, fetch in Sidebar too YAGNI: **lift fetch in App** or pass `weeklyMeeting` prop from App after one invoke).

Recommended: App calls `listLearnerMeetings` when user logs in / on dashboard+meetings focus and passes:

```ts
weeklyMeeting: { sessionDate, startTime, meetUrl } | null
```

to `DashboardPage` + `Sidebar`.

- [ ] **Step 3: Navbar** — remove mobile `🔥 {streak} Ngày` badge (leave XP if present).

- [ ] **Step 4: Lint + commit**

```bash
git commit -m "feat(meetings): replace streak widgets with Weekly Meeting"
```

---

### Task 9: Acceptance pass + polish

**Files:** touch only if gaps

- [ ] **Step 1: Run through spec acceptance checklist** (capacity, week, cancel, gate, meet_url secrecy, lint).

- [ ] **Step 2: Fix gaps; commit if needed**

```bash
git commit -m "fix(meetings): close integration acceptance gaps"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Tables + RLS + no learner meet_url via PostgREST | 1, 3 |
| register/cancel/list Edge | 3 |
| MAX 10 + VN week | 2, 3 |
| Cancel frees week | 3, 7 |
| Subscription gate + admin bypass | 5 |
| Admin CRUD paste URL | 6 |
| MeetingPage | 7 |
| Streak → Weekly Meeting; hide mobile streak | 8 |
| gen:types / meetings.ts | 4 |
| No Google Meet API | Global |

**Placeholders:** none intentional.  
**Type names:** `sessionDate` camelCase in DTOs; DB `session_date` snake_case.
