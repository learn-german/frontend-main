# Online Meeting HTML Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two openable HTML mockups (`meeting-admin.html`, `meeting-user.html`) that demo online support-session CRUD, capacity 10, and one registration per calendar week (Mon–Sun), with the streak slot replaced by a Weekly Meeting card.

**Architecture:** Two self-contained HTML files under `docs/mockups/` share one `localStorage` key. Each file duplicates a small store helper block (no shared JS file — matches existing support mockups). Admin writes sessions; user reads sessions and writes registrations. Capacity and weekly rules are enforced only in client JS.

**Tech Stack:** Vanilla HTML/CSS/JS, `localStorage`, Inter + JetBrains Mono (same tokens as `docs/mockups/support-*-mockup.html`).

**Spec:** `docs/superpowers/specs/2026-09-04-online-meeting-mockup-design.md`  
**Worktree:** `/Users/thangnv/Documents/github/frontend-main-1/.worktrees/feat-online-meeting-schedule` on branch `feat/online-meeting-schedule`

## Global Constraints

- Code identifiers / technical comments: **English**. UI copy: **Tiếng Việt**.
- Files: `docs/mockups/meeting-admin.html`, `docs/mockups/meeting-user.html` only (no React, no Supabase, no new npm packages).
- Storage key exactly: `deutschpath_meeting_mockup_v1`.
- `MAX_CAPACITY = 10`. Status: `< 8` OPEN, `8–9` ALMOST, `>= 10` FULL.
- Weekly window: **Monday 00:00 – Sunday 23:59** local time (calendar week, not rolling 7 days).
- Cancel registration **frees** the weekly slot.
- Demo user fixed: `userId: "demo-user"`, `userName: "Nguyen Thang"`.
- Do not use `window.alert` / `window.confirm` for happy-path UX — use inline modal or toast-like banner in the mockup page itself. Delete may use an in-page confirm modal.
- Prefer CSS tokens from support mockups (`--red` / slate scale). Layout follows the reference screenshots in the brainstorm thread.
- Work only inside the feature worktree path above.

## File map

| File | Responsibility |
|------|----------------|
| `docs/mockups/meeting-admin.html` | Admin shell, create/edit form, session list, registrant modal, seed restore, stats |
| `docs/mockups/meeting-user.html` | Learner shell + sidebar, banner Weekly Meeting card (replaces streak), session list, register/cancel/join |

Both embed identical store helpers (copy-paste block). Keep helper function names identical across files so behavior stays in sync.

## Shared store API (both files)

Duplicate this contract in each file’s `<script>`:

```js
const STORAGE_KEY = "deutschpath_meeting_mockup_v1";
const MAX_CAPACITY = 10;
const DEMO_USER = { userId: "demo-user", userName: "Nguyen Thang" };

/** @returns {{ sessions: Session[], registrations: Registration[] }} */
function loadStore() { /* parse JSON or return createSeedStore() */ }

/** @param {{ sessions: Session[], registrations: Registration[] }} store */
function saveStore(store) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

function createSeedStore() { /* 4 sessions: 4/10, 9/10, 10/10, 3/10 + fake other users */ }

/** Monday-start week key "YYYY-Www" from Date or YYYY-MM-DD */
function weekKeyFromDate(dateInput) { /* ... */ }

function countForSession(store, sessionId) { /* ... */ }

/** "open" | "almost" | "full" */
function capacityStatus(count) {
  if (count >= MAX_CAPACITY) return "full";
  if (count >= 8) return "almost";
  return "open";
}

function getUserRegistrationThisWeek(store, userId, refDate = new Date()) { /* ... */ }

function canRegister(store, sessionId, userId) {
  // false if full, or already registered this week for another session
}

function registerUser(store, sessionId) { /* mutate copy, return new store or { ok:false, reason } */ }
function cancelRegistration(store, sessionId, userId) { /* ... */ }
```

Seed sessions (use dates in the **current** calendar week so weekly rules are demoable):

| id | title | level | count (fake regs) | purpose |
|----|-------|-------|-------------------|---------|
| `s1` | Testing | A1 | 4 | OPEN |
| `s2` | Luyện nói giao tiếp | A2 | 9 | ALMOST |
| `s3` | Giải đáp ngữ pháp A1 | A1 | 10 | FULL |
| `s4` | Office hours B1 | B1 | 3 | OPEN (second option after cancel) |

Fake registrations use `userId` like `seed-user-1` … so they do not consume the demo user’s weekly slot. Initially **no** registration for `demo-user` (empty Weekly Meeting card → register flow visible).

---

### Task 1: Admin page — store + shell + create form + list CRUD

**Files:**
- Create: `docs/mockups/meeting-admin.html`

**Interfaces:**
- Produces: `loadStore`, `saveStore`, `createSeedStore`, `weekKeyFromDate`, `countForSession`, `capacityStatus`, session CRUD writing `STORAGE_KEY`
- Consumes: none

- [ ] **Step 1: Scaffold `meeting-admin.html`**

Create the file with:
- `<!DOCTYPE html lang="vi">`, Inter + JetBrains Mono links
- `:root` tokens copied from `docs/mockups/support-user-mockup.html` (add `--red: #dc2626`, green/amber for capacity)
- Sticky admin topbar (SelbstDeutsch / Admin) + page title **“Lịch hỗ trợ học viên”** and subtitle about creating date/time/Meet with max 10
- Three stat cards placeholders: `#statUpcoming`, `#statRegs`, `#statFull`
- Two-column layout: `#formPanel` (left ~360px) + `#listPanel` (right flex)

- [ ] **Step 2: Implement shared store helpers + seed**

In a `<script>` at the bottom, implement the Shared store API above (full working code, not stubs). `createSeedStore()` must produce the four sessions and enough seed registrations to reach counts 4, 9, 10, 3.

On first load:

```js
function ensureStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createSeedStore();
    saveStore(seed);
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const seed = createSeedStore();
    saveStore(seed);
    return seed;
  }
}
```

- [ ] **Step 3: Wire create/edit form**

Form fields (Vietnamese labels):
- Nội dung buổi học → `#title`
- Trình độ → `#level` select A1–B2
- Ngày học → `#date` type=date
- Bắt đầu / Kết thúc → `#startTime` `#endTime` type=time
- Link phòng học → `#meetUrl` + button **Tạo Meet** sets  
  `https://meet.google.com/abc-defg-hij`
- Ghi chú → `#note` textarea
- Static note: `Giới hạn đăng ký: **10** học viên`
- Buttons: **Tạo lịch học** (`#submitBtn`), **Hủy sửa** (`#cancelEditBtn`, hidden unless editing)

Submit handler:
- Validate title, date, start &lt; end, meetUrl non-empty
- If `editingId`: update session; else push new `{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ... }`
- `saveStore` + `renderAll()`
- Show inline `#formError` for validation failures (no `alert`)

- [ ] **Step 4: Render list, stats, filters, modal**

`renderAll()`:
1. Update stats: upcoming = sessions with `date >= today`; total regs; full = sessions with count ≥ 10
2. Filter by `#search` (title includes) and `#statusFilter` (`all` | `open` | `full` where open means count &lt; 10)
3. Each row: weekday+date · title+level badge · time · note snippet · buttons **Danh sách (n)** / **Sửa** / **Xóa** · **Mở link meeting** · status label + `n/10` + progress bar colored by status

Actions:
- **Sửa** → fill form, set `editingId`, show Hủy sửa, submit label → “Lưu”
- **Xóa** → open in-page confirm modal; on confirm delete session + its registrations
- **Danh sách (n)** → modal listing `userName` + `registeredAt` for that session
- **Khôi phục dữ liệu mẫu** → `saveStore(createSeedStore()); renderAll();`

- [ ] **Step 5: Manual verify admin**

Open file in browser (`open docs/mockups/meeting-admin.html` or drag into Chrome):
1. Seed list shows 4 rows with 4/10, 9/10, 10/10, 3/10
2. Create a new session → appears in list; stats change
3. Edit + save works; delete removes row
4. Restore sample resets data
5. DevTools → Application → Local Storage shows key `deutschpath_meeting_mockup_v1`

- [ ] **Step 6: Commit**

```bash
cd /Users/thangnv/Documents/github/frontend-main-1/.worktrees/feat-online-meeting-schedule
git add docs/mockups/meeting-admin.html
git commit -m "$(cat <<'EOF'
feat(mockup): add meeting admin HTML with shared localStorage store

Admin can create, edit, delete support sessions and restore seed data for the online meeting mockup.
EOF
)"
```

---

### Task 2: User page — shell, Weekly Meeting card, list + register rules

**Files:**
- Create: `docs/mockups/meeting-user.html`

**Interfaces:**
- Consumes: same `STORAGE_KEY` / store shape written by Task 1
- Produces: `registerUser`, `cancelRegistration`, `canRegister`, banner + list UI for demo user

- [ ] **Step 1: Scaffold learner shell**

Create `meeting-user.html` with:
- Same font/token base as Task 1
- Left sidebar nav (static): Dashboard, Lộ trình, Bài học, **Lịch học trực tuyến** (active), Gói học, Bảng xếp hạng, Trợ giúp
- Sidebar bottom: compact **next meeting** teaser (or empty hint) — replaces streak widget
- Main: eyebrow `HỖ TRỢ TRỰC TUYẾN HÀNG TUẦN`, title **Chọn lịch hỗ trợ trực tuyến**, short description
- Summary cards `#sumAvailable` / `#sumRegistered`

- [ ] **Step 2: Copy store helpers from admin**

Paste the identical helper block from `meeting-admin.html` (including `createSeedStore` / `ensureStore`). Add user-only functions if not already present:

```js
function canRegister(store, sessionId, userId) {
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: false, reason: "missing" };
  if (countForSession(store, sessionId) >= MAX_CAPACITY) {
    return { ok: false, reason: "full" };
  }
  const mine = store.registrations.find(
    (r) => r.userId === userId && r.sessionId === sessionId
  );
  if (mine) return { ok: false, reason: "already" };
  const weekReg = getUserRegistrationThisWeek(store, userId);
  if (weekReg) return { ok: false, reason: "week_limit" };
  return { ok: true };
}

function registerUser(store, sessionId) {
  const check = canRegister(store, sessionId, DEMO_USER.userId);
  if (!check.ok) return check;
  return {
    ok: true,
    store: {
      ...store,
      registrations: [
        ...store.registrations,
        {
          id: crypto.randomUUID(),
          sessionId,
          userId: DEMO_USER.userId,
          userName: DEMO_USER.userName,
          registeredAt: new Date().toISOString(),
        },
      ],
    },
  };
}

function cancelRegistration(store, sessionId, userId) {
  return {
    ...store,
    registrations: store.registrations.filter(
      (r) => !(r.userId === userId && r.sessionId === sessionId)
    ),
  };
}
```

Listen for `window.addEventListener("storage", ...)` to re-render when admin tab writes.

- [ ] **Step 3: Banner Weekly Meeting card (replaces streak)**

Inside dark gradient hero (left greeting “CHÀO NGÀY MỚI!” / “Hallo, Nguyen Thang!”):
- Right card `#weeklyMeetingCard`:
  - **Has registration this week:** icon + `WEEKLY MEETING`, pill with `DD/M/YYYY • HH:mm`, button **Tham gia →** opens `meetUrl`
  - **Empty:** same chrome, text “Chưa đăng ký lịch tuần này”, secondary “Chọn lịch bên dưới”

Also update sidebar bottom teaser from the same registration.

- [ ] **Step 4: Session cards + actions**

For each upcoming session (sort by date+startTime), render four columns matching screenshots:
1. Date block (THỨ X / day number / tháng MM, YYYY)
2. Title + level badge, note, `start–end` + “Online qua Google Meet”
3. Status badge + bar + `n/10` + “X chỗ còn lại…”
4. Actions:
   - Registered for this session → primary **Vào phòng học** + secondary **Hủy đăng ký**
   - Full → opacity 0.55, disabled **Đã đủ 10/10**, caption “Lịch đã đóng đăng ký”
   - `week_limit` (other session) → disabled register, caption “Bạn đã dùng slot tuần này”
   - Else → red **Đăng ký lịch này**

On register/cancel: `saveStore` + `renderAll()` + optional brief `#toast` (“Đăng ký thành công” / “Đã hủy đăng ký”).

Optional filter `#userFilter`: Tất cả lịch / Còn chỗ / Đã đăng ký.

- [ ] **Step 5: Manual verify rules (acceptance)**

With admin + user open (same browser profile):
1. User sees seed sessions; FULL card dimmed
2. Register on `s1` → banner shows date/time; Join opens Meet URL; summary registered = 1
3. Try register `s4` → blocked (week limit)
4. Cancel `s1` → can register `s4`
5. On admin, set a session’s fake regs to 10 (or use seed `s3`) → user cannot register
6. Admin creates new session → after refresh or `storage` event, user list updates

- [ ] **Step 6: Commit**

```bash
cd /Users/thangnv/Documents/github/frontend-main-1/.worktrees/feat-online-meeting-schedule
git add docs/mockups/meeting-user.html
git commit -m "$(cat <<'EOF'
feat(mockup): add meeting user HTML with weekly register rules

Learner mockup replaces streak with Weekly Meeting card and enforces max 10 seats plus one registration per calendar week.
EOF
)"
```

---

### Task 3: Cross-check polish + acceptance pass

**Files:**
- Modify: `docs/mockups/meeting-admin.html` (only if gaps found)
- Modify: `docs/mockups/meeting-user.html` (only if gaps found)

**Interfaces:**
- Consumes: Task 1–2 pages
- Produces: acceptance checklist all green

- [ ] **Step 1: Diff helpers**

Confirm both files use the same `STORAGE_KEY`, `MAX_CAPACITY`, seed IDs, and `weekKeyFromDate` algorithm (Monday start). If drifted, copy the canonical block from admin into user (or vice versa).

- [ ] **Step 2: Full acceptance checklist**

Mark each from the spec:

- [ ] Both HTML files open without a build step
- [ ] Admin create → visible on user after reload / storage event
- [ ] 10/10 dims and disables register
- [ ] Second register same week blocked until cancel
- [ ] Cancel frees weekly slot
- [ ] Weekly Meeting card shows date/time; Join works
- [ ] Seed + restore sample on admin

- [ ] **Step 3: Commit only if fixes were needed**

```bash
git add docs/mockups/meeting-admin.html docs/mockups/meeting-user.html
git commit -m "$(cat <<'EOF'
fix(mockup): align meeting admin/user store helpers and polish UX

Keep shared localStorage contract identical and close remaining acceptance gaps.
EOF
)"
```

If no changes, skip commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `meeting-admin.html` / `meeting-user.html` in `docs/mockups/` | 1, 2 |
| Shared `deutschpath_meeting_mockup_v1` | 1, 2 |
| Admin form + list + stats + restore | 1 |
| Capacity 10 + OPEN/ALMOST/FULL UI | 1, 2 |
| User list + register/cancel/join | 2 |
| Weekly Mon–Sun limit; cancel frees slot | 2 |
| Meet link only after register (user actions) | 2 |
| Streak replaced by Weekly Meeting card | 2 |
| Seed data | 1 (shared seed) |
| No React/Supabase | Global constraints |

**Placeholders:** none intentional.  
**Type consistency:** `sessions` / `registrations` field names match the spec verbatim.
