# Dashboard Redesign (Rebrand DeutschSelbst + Daily Progress Report) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Dashboard page and app shell (Header/Sidebar) to match the new mockup — rebrand to "DeutschSelbst", simplify the Header, add the 3 missing Sidebar links, and wire the Dashboard's "Tổng quan" and "Kế hoạch học tập" cards to real data instead of hardcoded content.

**Architecture:** Pure frontend change. No new database migration — the backend edge function `daily-progress-report` (already deployed) supplies all progress/pace numbers; the frontend just needs to call it for the first time. Two new small pure-logic helpers in `src/lib/dashboardProgress.ts` carry the only genuinely new logic (derived "lessons needed to catch up" and "next 4 planned lessons"), each unit tested. Everything else is JSX/text restructuring in existing files, following existing patterns (`supabase.functions.invoke`, `computeLessonStatuses`, `ProgressBar`/`LevelBadge` from `DesignSystem.tsx`).

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4, Supabase JS client, lucide-react icons, Node's built-in `node:test`/`node:assert` run via `npx tsx`.

## Global Constraints

- Ngôn ngữ code: English (biến/hàm/type). Nội dung hiển thị cho user: Tiếng Việt.
- Không dùng `window.alert()`/`window.confirm()`.
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay.
- Không thêm migration DB mới — dữ liệu cần đã có sẵn qua edge function `daily-progress-report`.
- Không hardcode secret/API key.
- Sau mỗi task: chạy `npm run lint` (== `tsc --noEmit`) và phải pass trước khi commit.
- Test file dùng `node:assert/strict` (+ `node:test` khi cần nhiều case độc lập), chạy bằng `npx tsx` — theo đúng convention có sẵn trong repo (`src/lib/adminUserFilter.test.ts`, `src/lib/router.test.ts`).

---

### Task 1: Rebrand "DeutschPath" → "DeutschSelbst"

**Files:**
- Modify: `src/App.tsx:265`
- Modify: `src/components/Navigation.tsx:67`
- Modify: `src/data/mockData.ts:414,420`
- Modify: `src/pages/LoginPage.tsx:111,122,248`
- Modify: `src/pages/LeaderboardPage.tsx:40`
- Modify: `src/pages/LandingPage.tsx:195,405,520,533`
- Modify: `src/pages/RoadmapPage.tsx:72`
- Modify: `src/pages/admin/AdminApp.tsx:138,196`

**Interfaces:** None — pure text substitution, no function signatures touched.

- [ ] **Step 1: Confirm the exact set of occurrences**

Run:
```bash
grep -rn "DeutschPath" src --include="*.ts" --include="*.tsx"
```
Expected: exactly the 14 occurrences across the 8 files listed above (App.tsx, Navigation.tsx, mockData.ts ×2, LoginPage.tsx ×3, LeaderboardPage.tsx, LandingPage.tsx ×4, RoadmapPage.tsx, AdminApp.tsx ×2).

- [ ] **Step 2: Replace every occurrence**

Run:
```bash
sed -i '' 's/DeutschPath/DeutschSelbst/g' \
  src/App.tsx \
  src/components/Navigation.tsx \
  src/data/mockData.ts \
  src/pages/LoginPage.tsx \
  src/pages/LeaderboardPage.tsx \
  src/pages/LandingPage.tsx \
  src/pages/RoadmapPage.tsx \
  src/pages/admin/AdminApp.tsx
```

- [ ] **Step 3: Verify no occurrence remains**

Run:
```bash
grep -rn "DeutschPath" src --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no errors (pure string literal changes, cannot break types).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Navigation.tsx src/data/mockData.ts src/pages/LoginPage.tsx src/pages/LeaderboardPage.tsx src/pages/LandingPage.tsx src/pages/RoadmapPage.tsx src/pages/admin/AdminApp.tsx
git commit -m "rebrand: DeutschPath -> DeutschSelbst"
```

---

### Task 2: Route types for "Gói học" / "Trợ giúp học tập"

**Files:**
- Modify: `src/lib/router.ts`
- Modify: `src/lib/appTypes.ts:112`
- Test: `src/lib/router.test.ts`

**Interfaces:**
- Produces: `AppPage` and `AppRoute` (in `src/lib/router.ts`) gain `"packages"` and `"help"`; `AppState["currentPage"]` (in `src/lib/appTypes.ts`) gains the same two values. `isProtectedPage("packages")` / `isProtectedPage("help")` return `true`. Consumed by Task 3 (routing) and Task 4 (sidebar links).

- [ ] **Step 1: Extend the test file first (will fail against current router.ts)**

Edit `src/lib/router.test.ts`: after the line `assert.deepEqual(parseRoute("/leaderboard"), { page: "leaderboard" });`, add:
```ts
assert.deepEqual(parseRoute("/packages"), { page: "packages" });
assert.deepEqual(parseRoute("/help"), { page: "help" });
```

After the line `assert.equal(serializeRoute({ page: "leaderboard" }), "/leaderboard");`, add:
```ts
assert.equal(serializeRoute({ page: "packages" }), "/packages");
assert.equal(serializeRoute({ page: "help" }), "/help");
```

In the `routes` round-trip array, after `{ page: "leaderboard" },`, add:
```ts
  { page: "packages" },
  { page: "help" },
```

After the line `assert.equal(isProtectedPage("leaderboard"), true);`, add:
```ts
assert.equal(isProtectedPage("packages"), true);
assert.equal(isProtectedPage("help"), true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx src/lib/router.test.ts`
Expected: throws `AssertionError` (parsing `/packages` currently falls through to `{ page: "landing" }`, and the `AppRoute`/`AppPage` types don't even have `"packages"`/`"help"` yet — this step will also surface as a TypeScript error if you run `npm run lint` first; running the test still executes via `tsx`'s transpile-only mode).

- [ ] **Step 3: Implement the type + route changes**

In `src/lib/router.ts`, replace:
```ts
export type AppPage =
  | "landing"
  | "login"
  | "dashboard"
  | "roadmap"
  | "leaderboard"
  | "lesson-detail"
  | "quiz";
```
with:
```ts
export type AppPage =
  | "landing"
  | "login"
  | "dashboard"
  | "roadmap"
  | "leaderboard"
  | "packages"
  | "help"
  | "lesson-detail"
  | "quiz";
```

Replace:
```ts
export type AppRoute =
  | { page: "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" }
  | { page: "lesson-detail"; lessonId: string; tab?: BottomTab }
  | { page: "quiz"; lessonId: string; category: QuizCategory };
```
with:
```ts
export type AppRoute =
  | { page: "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" | "packages" | "help" }
  | { page: "lesson-detail"; lessonId: string; tab?: BottomTab }
  | { page: "quiz"; lessonId: string; category: QuizCategory };
```

Replace:
```ts
const PROTECTED_PAGES: AppPage[] = [
  "dashboard",
  "roadmap",
  "leaderboard",
  "lesson-detail",
  "quiz",
];
```
with:
```ts
const PROTECTED_PAGES: AppPage[] = [
  "dashboard",
  "roadmap",
  "leaderboard",
  "packages",
  "help",
  "lesson-detail",
  "quiz",
];
```

In `parseRoute`, replace:
```ts
    case "leaderboard":
      return { page: "leaderboard" };
```
with:
```ts
    case "leaderboard":
      return { page: "leaderboard" };
    case "packages":
      return { page: "packages" };
    case "help":
      return { page: "help" };
```

(`serializeRoute`'s `default: return \`/${route.page}\`;` branch already covers `"packages"`/`"help"` — no change needed there.)

In `src/lib/appTypes.ts`, replace:
```ts
export interface AppState {
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz" | "leaderboard";
}
```
with:
```ts
export interface AppState {
  currentPage: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz" | "leaderboard" | "packages" | "help";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx src/lib/router.test.ts`
Expected: prints `router.test.ts OK`, no error, exit code 0.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/router.ts src/lib/appTypes.ts src/lib/router.test.ts
git commit -m "feat(router): add packages/help routes"
```

---

### Task 3: Placeholder pages "Gói học" / "Trợ giúp học tập"

**Files:**
- Create: `src/pages/ComingSoonPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AppPage`/`AppState["currentPage"]` values `"packages"`/`"help"` from Task 2.
- Produces: `ComingSoonPage: React.FC<{ title: string }>`, used only inside `App.tsx`.

- [ ] **Step 1: Create the placeholder component**

Create `src/pages/ComingSoonPage.tsx`:
```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface ComingSoonPageProps {
  title: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ title }) => (
  <div className="max-w-2xl mx-auto text-center py-20 space-y-3">
    <h1 className="text-2xl font-display font-black text-slate-900">{title}</h1>
    <p className="text-sm text-slate-500">Tính năng đang được phát triển, quay lại sau nhé!</p>
  </div>
);
```

- [ ] **Step 2: Wire the routes into App.tsx**

In `src/App.tsx`, add the import next to the other page imports (after `import { LeaderboardPage } from "./pages/LeaderboardPage";`):
```ts
import { ComingSoonPage } from "./pages/ComingSoonPage";
```

Replace:
```tsx
              {effectivePage === "leaderboard" && user && (
                <LeaderboardPage currentUserId={user.id} />
              )}
```
with:
```tsx
              {effectivePage === "leaderboard" && user && (
                <LeaderboardPage currentUserId={user.id} />
              )}
              {effectivePage === "packages" && user && (
                <ComingSoonPage title="Gói học" />
              )}
              {effectivePage === "help" && user && (
                <ComingSoonPage title="Trợ giúp học tập" />
              )}
```

Replace:
```ts
  const showSidebar = user && (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail");
```
with:
```ts
  const showSidebar = user && (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail" || effectivePage === "packages" || effectivePage === "help");
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`), log in, navigate the browser to `/packages` and `/help` directly. Expected: both render the "Đang được phát triển" placeholder with the correct title, sidebar still visible, no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ComingSoonPage.tsx src/App.tsx
git commit -m "feat: add placeholder pages for packages/help routes"
```

---

### Task 4: Sidebar — 6 nav links

**Files:**
- Modify: `src/components/Navigation.tsx` (icon imports + `SidebarProps` + `Sidebar`)
- Modify: `src/App.tsx` (Sidebar call site + `showSidebar`)

**Interfaces:**
- Consumes: `orderedLessons`/`lessonStatuses` (already computed at the top of `App.tsx`, lines 45-53 — no change needed there).
- Produces: `SidebarProps` gains optional `currentLessonTitle?: string`.

- [ ] **Step 1: Add the two new icons to the lucide-react import**

In `src/components/Navigation.tsx`, replace:
```tsx
import {
  BookOpen,
  Map,
  Compass,
  GraduationCap,
  User,
  Menu,
  X,
  LogOut,
  TrendingUp,
  Award,
  Globe,
  Trophy
} from "lucide-react";
```
with:
```tsx
import {
  BookOpen,
  Map,
  Compass,
  GraduationCap,
  User,
  Menu,
  X,
  LogOut,
  TrendingUp,
  Award,
  Globe,
  Trophy,
  Gift,
  HelpCircle
} from "lucide-react";
```

- [ ] **Step 2: Extend SidebarProps and the links array**

Replace:
```tsx
interface SidebarProps {
  currentPage: string;
  onNavigate: (page: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz") => void;
  streak: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, streak }) => {
  const links = [
    { id: "dashboard", label: "Dashboard", desc: "Bảng tổng quan", icon: Compass },
    { id: "roadmap", label: "Lộ trình", desc: "Sơ đồ bài học A1-B1", icon: Map },
    { id: "lesson-detail", label: "Bài học hiện tại", desc: "Bài học đang xem", icon: BookOpen },
  ];
```
with:
```tsx
interface SidebarProps {
  currentPage: string;
  onNavigate: (page: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz") => void;
  streak: number;
  currentLessonTitle?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, streak, currentLessonTitle }) => {
  const links = [
    { id: "dashboard", label: "Dashboard", desc: "Bảng tổng quan", icon: Compass },
    { id: "roadmap", label: "Lộ trình", desc: "Sơ đồ khóa học", icon: Map },
    { id: "lesson-detail", label: "Bài học hiện tại", desc: currentLessonTitle ? `Đang học: ${currentLessonTitle}` : "Bài học đang xem", icon: BookOpen },
    { id: "packages", label: "Gói học", desc: "Xem gói & quyền lợi", icon: Gift },
    { id: "leaderboard", label: "Bảng xếp hạng", desc: "Thành tích học tập", icon: Trophy },
    { id: "help", label: "Trợ giúp học tập", desc: "Giải đáp thắc mắc", icon: HelpCircle },
  ];
```

(`onNavigate(link.id as any)` at the bottom of `Sidebar` already casts away the type, so the new ids `"packages"`/`"leaderboard"`/`"help"` don't need `SidebarProps.onNavigate`'s union widened.)

- [ ] **Step 3: Pass currentLessonTitle from App.tsx and include leaderboard in showSidebar**

In `src/App.tsx`, replace:
```tsx
        {showSidebar && (
          <Sidebar
            currentPage={effectivePage}
            onNavigate={handleNavigate}
            streak={stats.streak}
          />
        )}
```
with:
```tsx
        {showSidebar && (
          <Sidebar
            currentPage={effectivePage}
            onNavigate={handleNavigate}
            streak={stats.streak}
            currentLessonTitle={orderedLessons.find(l => lessonStatuses[l.id] === "current")?.titleVi}
          />
        )}
```

Replace (this is the same line already touched in Task 3 — apply on top of that result):
```ts
  const showSidebar = user && (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail" || effectivePage === "packages" || effectivePage === "help");
```
with:
```ts
  const showSidebar = user && (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail" || effectivePage === "packages" || effectivePage === "help" || effectivePage === "leaderboard");
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

In the browser, log in and check the Sidebar on `/dashboard`: all 6 links present (Dashboard, Lộ trình, Bài học hiện tại, Gói học, Bảng xếp hạng, Trợ giúp học tập) with the subtitles above, "Bài học hiện tại" shows "Đang học: <tên bài>". Click each link, confirm navigation works and the Sidebar stays visible on `/leaderboard` too.

- [ ] **Step 6: Commit**

```bash
git add src/components/Navigation.tsx src/App.tsx
git commit -m "feat(sidebar): add Goi hoc, Bang xep hang, Tro giup links"
```

---

### Task 5: Header — logo + notification + user only

**Files:**
- Modify: `src/components/Navigation.tsx` (`Navbar`)
- Modify: `src/App.tsx` (Navbar call site)

**Interfaces:**
- Produces: `NavigationProps` loses `streak`/`xp`. `Navbar`'s logged-in desktop nav renders only brand + `NotificationBell` + user/logout. The `DE | VI` indicator now only renders when `!user`.

- [ ] **Step 1: Leave `NavigationProps` as-is (mobile drawer still needs streak/xp)**

No edit needed here — `streak`/`xp` stay in `NavigationProps` and in `Navbar`'s destructured params unchanged, because the mobile drawer further down in the same file (`#mob-dash`/`#mob-road`/`#mob-leaderboard` block) still displays them and is out of scope for this task. Only the **desktop logged-in nav block** (Step 2) and the **DE|VI indicator** (Step 3) change. Proceed to Step 2.

- [ ] **Step 2: Simplify the desktop logged-in nav block**

Replace:
```tsx
          /* Desktop Menu - For logged in */
          <nav className="hidden md:flex items-center gap-6">
            {/* Daily Streak Indicator */}
            <div 
              id="nav-streak"
              className="flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-amber-600 border border-yellow-200/60 rounded-full cursor-help"
              title="Chuỗi hằng ngày của bạn"
            >
              <span className="text-sm">🔥</span>
              <span className="text-xs font-display font-bold">{streak} Ngày</span>
            </div>

            {/* XP Indicator */}
            <div 
              id="nav-xp"
              className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-200/50 rounded-full"
              title="Điểm kinh nghiệm"
            >
              <Award className="w-3.5 h-3.5" />
              <span className="text-xs font-display font-bold">{xp} XP</span>
            </div>

            <NotificationBell onNavigate={onNotificationNavigate} />

            <div className="h-4 w-[1px] bg-slate-200" />

            {/* Quick Nav Links */}
            <button 
              id="nav-dashboard"
              onClick={() => onNavigate("dashboard")}
              className={`flex items-center gap-1.5 text-sm font-display font-medium transition cursor-pointer ${
                currentPage === "dashboard" ? "text-orange-600 font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Compass className="w-4 h-4" />
              Bảng điều khiển
            </button>

            <button
              id="nav-roadmap"
              onClick={() => onNavigate("roadmap")}
              className={`flex items-center gap-1.5 text-sm font-display font-medium transition cursor-pointer ${
                currentPage === "roadmap" ? "text-orange-600 font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Map className="w-4 h-4" />
              Lộ trình học
            </button>

            <button
              id="nav-leaderboard"
              onClick={() => onNavigate("leaderboard")}
              className={`flex items-center gap-1.5 text-sm font-display font-medium transition cursor-pointer ${
                currentPage === "leaderboard" ? "text-orange-600 font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Trophy className="w-4 h-4" />
              Bảng xếp hạng
            </button>

            {/* User profile dropdown snippet */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full pl-2 pr-3.5 py-1">
```
with:
```tsx
          /* Desktop Menu - For logged in */
          <nav className="hidden md:flex items-center gap-6">
            <NotificationBell onNavigate={onNotificationNavigate} />

            <div className="h-4 w-[1px] bg-slate-200" />

            {/* User profile dropdown snippet */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full pl-2 pr-3.5 py-1">
```

- [ ] **Step 3: Hide the DE|VI indicator for logged-in users**

Replace:
```tsx
      {/* Flag decoration & Mobile Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[13px] bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-full font-sans select-none text-gray-500">
          <Globe className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
          <span>DE</span>
          <span className="text-gray-300">|</span>
          <span>VI</span>
        </div>
        
        {/* Mobile menu button */}
```
with:
```tsx
      {/* Flag decoration & Mobile Toggle */}
      <div className="flex items-center gap-3">
        {!user && (
          <div className="flex items-center gap-1 text-[13px] bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-full font-sans select-none text-gray-500">
            <Globe className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
            <span>DE</span>
            <span className="text-gray-300">|</span>
            <span>VI</span>
          </div>
        )}

        {/* Mobile menu button */}
```

- [ ] **Step 4: Remove the now-unused `Award` icon import**

`Award` was only used by the XP pill removed in Step 2 — it's not used anywhere else in `Navigation.tsx` (`Compass`/`Map`/`Trophy` stay imported: they're still used by the mobile drawer and by `Sidebar`'s `links` array in the same file; `Globe` stays too, since Step 3 kept its usage, just wrapped in `{!user && (...)}`).

Replace:
```tsx
import {
  BookOpen,
  Map,
  Compass,
  GraduationCap,
  User,
  Menu,
  X,
  LogOut,
  TrendingUp,
  Award,
  Globe,
  Trophy,
  Gift,
  HelpCircle
} from "lucide-react";
```
with:
```tsx
import {
  BookOpen,
  Map,
  Compass,
  GraduationCap,
  User,
  Menu,
  X,
  LogOut,
  TrendingUp,
  Globe,
  Trophy,
  Gift,
  HelpCircle
} from "lucide-react";
```

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification**

In the browser, log in, check the desktop Header on `/dashboard`: only the "DeutschSelbst" logo on the left, and on the right only the notification bell + user avatar/name + logout button — no streak pill, no XP pill, no nav links, no DE|VI box. Log out and check the landing page Header still shows the DE|VI box as before (unaffected). Resize to mobile width and confirm the hamburger menu still opens the drawer with streak/XP/nav links intact (unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/components/Navigation.tsx
git commit -m "feat(header): simplify desktop nav to logo + notifications + user"
```

---

### Task 6: `dashboardProgress.ts` helpers (TDD)

**Files:**
- Create: `src/lib/dashboardProgress.ts`
- Test: `src/lib/dashboardProgress.test.ts`

**Interfaces:**
- Produces:
  - `lessonsNeededToCatchUp(gapPercentagePoint: number | null, totalRequiredLessons: number): number`
  - `selectPlannedLessons<T extends { id: string }>(orderedLessons: T[], lessonStatuses: Record<string, LessonStatus>, completedLessons: string[]): T[]`
  - Both consumed by Task 7/8 (`DashboardPage.tsx`).
- Consumes: `LessonStatus` type from `src/lib/completion.ts` (already exists: `"completed" | "current" | "locked"`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/dashboardProgress.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { lessonsNeededToCatchUp, selectPlannedLessons } from "./dashboardProgress";
import type { LessonStatus } from "./completion";

test("lessonsNeededToCatchUp: gap 0 hoặc âm trả về 0", () => {
  assert.equal(lessonsNeededToCatchUp(0, 21), 0);
  assert.equal(lessonsNeededToCatchUp(-5, 21), 0);
});

test("lessonsNeededToCatchUp: null trả về 0", () => {
  assert.equal(lessonsNeededToCatchUp(null, 21), 0);
});

test("lessonsNeededToCatchUp: làm tròn lên đúng", () => {
  assert.equal(lessonsNeededToCatchUp(7, 21), 2); // 7% của 21 bài = 1.47 -> 2
  assert.equal(lessonsNeededToCatchUp(100 / 21, 21), 1); // đúng 1 bài
});

test("lessonsNeededToCatchUp: totalRequiredLessons = 0 trả về 0", () => {
  assert.equal(lessonsNeededToCatchUp(10, 0), 0);
});

const lesson = (id: string) => ({ id });

test("selectPlannedLessons: lấy bài current + 3 bài kế tiếp theo thứ tự", () => {
  const lessons = [lesson("a"), lesson("b"), lesson("c"), lesson("d"), lesson("e")];
  const statuses: Record<string, LessonStatus> = {
    a: "completed", b: "current", c: "locked", d: "locked", e: "locked",
  };
  const result = selectPlannedLessons(lessons, statuses, ["a"]);
  assert.deepEqual(result.map((l) => l.id), ["b", "c", "d", "e"]);
});

test("selectPlannedLessons: không đủ 4 bài sau current thì lấy hết phần còn lại", () => {
  const lessons = [lesson("a"), lesson("b")];
  const statuses: Record<string, LessonStatus> = { a: "completed", b: "current" };
  const result = selectPlannedLessons(lessons, statuses, ["a"]);
  assert.deepEqual(result.map((l) => l.id), ["b"]);
});

test("selectPlannedLessons: không có bài current (đã hoàn thành hết) -> mảng rỗng", () => {
  const lessons = [lesson("a"), lesson("b"), lesson("c")];
  const statuses: Record<string, LessonStatus> = { a: "completed", b: "completed", c: "completed" };
  const result = selectPlannedLessons(lessons, statuses, ["a", "b", "c"]);
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/lib/dashboardProgress.test.ts`
Expected: FAIL — `Cannot find module './dashboardProgress'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/dashboardProgress.ts`:
```ts
import { LessonStatus } from "./completion";

export function lessonsNeededToCatchUp(
  gapPercentagePoint: number | null,
  totalRequiredLessons: number,
): number {
  if (!gapPercentagePoint || gapPercentagePoint <= 0) return 0;
  return Math.ceil((gapPercentagePoint / 100) * totalRequiredLessons);
}

export function selectPlannedLessons<T extends { id: string }>(
  orderedLessons: T[],
  lessonStatuses: Record<string, LessonStatus>,
  completedLessons: string[],
): T[] {
  const currentIdx = orderedLessons.findIndex((l) => lessonStatuses[l.id] === "current");
  if (currentIdx === -1) {
    return orderedLessons.filter((l) => !completedLessons.includes(l.id)).slice(0, 4);
  }
  return orderedLessons.slice(currentIdx, currentIdx + 4);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/dashboardProgress.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboardProgress.ts src/lib/dashboardProgress.test.ts
git commit -m "feat: add dashboardProgress helpers (catch-up count, planned lessons)"
```

---

### Task 7: Wire `orderedLessons`/`lessonStatuses` into DashboardPage + real "Kế hoạch học tập" + banner slogan

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `selectPlannedLessons` from Task 6; `orderedLessons: Lesson[]` and `lessonStatuses: Record<string, LessonStatus>` (already computed at the top of `App.tsx` via `buildRoadmapItems`/`computeLessonStatuses` — no new computation needed, just pass them down).
- Produces: `DashboardPageProps` gains `orderedLessons: Lesson[]` and `lessonStatuses: Record<string, LessonStatus>` (still keeps `onNavigateRoadmap` for now — removed in Task 8).

- [ ] **Step 1: Add imports**

In `src/pages/DashboardPage.tsx`, replace:
```tsx
import { UserStats, Lesson, Module } from "../lib/appTypes";
```
with:
```tsx
import { UserStats, Lesson, Module } from "../lib/appTypes";
import { LessonStatus } from "../lib/completion";
import { selectPlannedLessons } from "../lib/dashboardProgress";
```

- [ ] **Step 2: Extend props**

Replace:
```tsx
interface DashboardPageProps {
  user: { email: string; fullName: string };
  stats: UserStats;
  modules: Module[];
  onNavigateLesson: (lessonId: string) => void;
  onNavigateRoadmap: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  stats,
  modules,
  onNavigateLesson,
  onNavigateRoadmap
}) => {
```
with:
```tsx
interface DashboardPageProps {
  user: { email: string; fullName: string };
  stats: UserStats;
  modules: Module[];
  orderedLessons: Lesson[];
  lessonStatuses: Record<string, LessonStatus>;
  onNavigateLesson: (lessonId: string) => void;
  onNavigateRoadmap: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  stats,
  modules,
  orderedLessons,
  lessonStatuses,
  onNavigateLesson,
  onNavigateRoadmap
}) => {
```

- [ ] **Step 3: Derive the planned-lessons list**

Replace:
```tsx
  // Check recent scores list
  const recentScores = Object.entries(stats.quizScores).map(([lessonId, score]) => {
```
with:
```tsx
  const planLessons = selectPlannedLessons(orderedLessons, lessonStatuses, stats.completedLessons);

  const planStatusLabel = (index: number): string => {
    if (index === 0) return "Đang học";
    if (index === 1) return "Tiếp theo";
    return "Sắp học";
  };

  // Check recent scores list
  const recentScores = Object.entries(stats.quizScores).map(([lessonId, score]) => {
```

- [ ] **Step 4: Update the banner slogan**

Replace:
```tsx
          <p className="text-slate-400 text-xs sm:text-sm font-sans max-w-md">
            Hôm nay là một ngày tuyệt vời để học từ mới tiếng Đức. Mục tiêu hàng ngày của bạn đã đạt 40%!
          </p>
```
with:
```tsx
          <p className="text-slate-400 text-xs sm:text-sm font-sans max-w-md">
            Hôm nay là một ngày tuyệt vời để chinh phục tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!
          </p>
```

- [ ] **Step 5: Replace the hardcoded "upcoming lessons" list with real data**

Replace:
```tsx
          {/* Upcoming lessons list */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-indigo-505" /> Kế hoạch bài học nổi bật
            </h3>

            <div className="space-y-3">
              {[
                { de: "Das deutsche Alphabet", vi: "Bảng chữ cái & Số đếm", level: "A1", desc: "Bài kế của Nhập môn" },
                { de: "Einkaufen im Supermarkt", vi: "Mua đồ trong siêu thị Đức", level: "A2", desc: "Mẫu câu đàm thoại mua thực phẩm" },
                { de: "Meinung äußern", vi: "Bày tỏ quan điểm cá nhân", level: "B1", desc: "Kỹ năng phản xạ tranh luận" }
              ].map((item, i) => (
                <div key={i} className="flex gap-3 items-start border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-display font-bold text-[10px] flex items-center justify-center shrink-0">
                    {item.level}
                  </div>
                  <div>
                    <h4 className="text-xs font-display font-bold text-slate-800 leading-snug">{item.de}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-none">{item.vi}</p>
                    <p className="text-[9px] text-green-600 italic mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
```
with:
```tsx
          {/* Kế hoạch học tập: 4 bài gần nhất theo thứ tự thật của roadmap */}
          {planLessons.length > 0 && (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-indigo-505" /> Kế hoạch học tập
              </h3>

              <div className="space-y-3">
                {planLessons.map((lesson, i) => (
                  <div key={lesson.id} className="flex gap-3 items-start border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-display font-bold text-[10px] flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-display font-bold text-slate-800 leading-snug truncate">{lesson.title}</h4>
                        <span className={`text-[9px] font-display font-bold shrink-0 ${i === 0 ? "text-orange-600" : "text-slate-400"}`}>
                          {planStatusLabel(i)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-none truncate">{lesson.titleVi}</p>
                      <p className="text-[9px] text-slate-400 mt-1">{lesson.duration} phút</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 6: Pass the new props from App.tsx**

In `src/App.tsx`, replace:
```tsx
              {effectivePage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  modules={modules}
                  onNavigateLesson={handleSelectLesson}
                  onNavigateRoadmap={() => handleNavigate("roadmap")}
                />
              )}
```
with:
```tsx
              {effectivePage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  modules={modules}
                  orderedLessons={orderedLessons}
                  lessonStatuses={lessonStatuses}
                  onNavigateLesson={handleSelectLesson}
                  onNavigateRoadmap={() => handleNavigate("roadmap")}
                />
              )}
```

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Manual verification**

In the browser, log in, open `/dashboard`. Confirm: banner text reads "Hôm nay là một ngày tuyệt vời để chinh phục tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!". The "Kế hoạch học tập" card on the right shows up to 4 real upcoming lessons (matching the order seen on `/roadmap`) with badges "Đang học" / "Tiếp theo" / "Sắp học", not the old hardcoded German-alphabet/supermarket/opinion items.

- [ ] **Step 9: Commit**

```bash
git add src/pages/DashboardPage.tsx src/App.tsx
git commit -m "feat(dashboard): wire real upcoming lessons + update banner slogan"
```

---

### Task 8: Card "Tổng quan" backed by `daily-progress-report` + split "Bài học hiện tại" + XP restyle

**Files:**
- Modify: `src/pages/DashboardPage.tsx` (full-file rewrite of the two left-column cards + imports/props)
- Modify: `src/App.tsx` (drop the now-unused `onNavigateRoadmap` prop)

**Interfaces:**
- Consumes: `lessonsNeededToCatchUp` from Task 6; `supabase` client from `src/lib/supabase.ts`; the `daily-progress-report` edge function's JSON response shape (`supabase/functions/daily-progress-report/report.ts` field names, snake_case as stored in `daily_progress_reports`).
- Produces: `DashboardPageProps` drops `onNavigateRoadmap` (the "Mở bản đồ" link it powered is removed — Sidebar's "Lộ trình" link already covers that navigation).

- [ ] **Step 1: Read the current file**

Run: Read `src/pages/DashboardPage.tsx` (post Task 7) to confirm its exact current content before overwriting.

- [ ] **Step 2: Overwrite DashboardPage.tsx with the final content**

Write `src/pages/DashboardPage.tsx`:
```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Trophy,
  Flame,
  BookOpen,
  PlayCircle,
  CheckCircle,
  TrendingUp,
  Plus,
  ListRestart,
  HeartCrack,
  Award
} from "lucide-react";
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
import { UserStats, Lesson, Module } from "../lib/appTypes";
import { LessonStatus } from "../lib/completion";
import { selectPlannedLessons, lessonsNeededToCatchUp } from "../lib/dashboardProgress";
import { supabase } from "../lib/supabase";

interface DashboardPageProps {
  user: { email: string; fullName: string };
  stats: UserStats;
  modules: Module[];
  orderedLessons: Lesson[];
  lessonStatuses: Record<string, LessonStatus>;
  onNavigateLesson: (lessonId: string) => void;
}

interface DailyProgressReport {
  report_date: string;
  level_id: string;
  current_lesson_id: string | null;
  completed_required_lessons: number;
  total_required_lessons: number;
  actual_progress_percentage: number;
  expected_progress_percentage: number | null;
  progress_gap_percentage_point: number | null;
  progress_status: "on_track" | "attention" | "behind" | null;
  package_remaining_days: number | null;
  generation_status: "success" | "insufficient_data" | "empty";
}

const PROGRESS_STATUS_BADGE: Record<"on_track" | "attention" | "behind", { label: string; className: string }> = {
  on_track: { label: "✓ Đúng tiến độ", className: "bg-green-50 text-green-700 border border-green-200" },
  attention: { label: "⚠ Cần chú ý", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  behind: { label: "⚠ Chậm tiến độ", className: "bg-red-50 text-red-700 border border-red-200" },
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  stats,
  modules,
  orderedLessons,
  lessonStatuses,
  onNavigateLesson
}) => {
  const allLessons = modules.flatMap(m => m.lessons);

  // Find current next lesson to suggest
  const nextSuggestedLesson: Lesson | undefined = allLessons.find(l => !stats.completedLessons.includes(l.id)) ?? allLessons[0];

  const [report, setReport] = useState<DailyProgressReport | null>(null);

  useEffect(() => {
    supabase.functions.invoke("daily-progress-report", { method: "GET" }).then(({ data }) => {
      setReport(data ?? null);
    });
  }, []);

  const catchUpLessons = report
    ? lessonsNeededToCatchUp(report.progress_gap_percentage_point, report.total_required_lessons)
    : 0;

  const planLessons = selectPlannedLessons(orderedLessons, lessonStatuses, stats.completedLessons);

  const planStatusLabel = (index: number): string => {
    if (index === 0) return "Đang học";
    if (index === 1) return "Tiếp theo";
    return "Sắp học";
  };

  // Check recent scores list
  const recentScores = Object.entries(stats.quizScores).map(([lessonId, score]) => {
    const match = allLessons.find(l => l.id === lessonId);
    return { lessonId, title: match?.titleVi ?? "Bài kiểm tra", score: score as number };
  });

  if (!nextSuggestedLesson) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Welcome Title section with Streak banner */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 sm:p-8 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 select-none relative overflow-hidden animate-in fade-in">
        {/* Abstract vector shape */}
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-orange-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-1.5 z-10">
          <p className="text-yellow-400 font-display font-bold text-xs uppercase tracking-wider font-sans">Chào ngày mới!</p>
          <h1 className="text-2xl sm:text-3xl font-display font-black leading-tight text-white font-sans">
            Hallo, {user.fullName}! 👋
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm font-sans max-w-md">
            Hôm nay là một ngày tuyệt vời để chinh phục tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!
          </p>
        </div>

        {/* Big fire streak badge */}
        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-slate-700/60 flex items-center gap-4 z-10 self-stretch sm:self-auto min-w-[180px]">
          <div className="w-12 h-12 rounded-xl bg-orange-600/10 text-orange-500 flex items-center justify-center text-2xl border border-orange-500/20">
            🔥
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-display font-semibold block leading-tight">STREAK HÀNG NGÀY</span>
            <span className="text-xl font-display font-extrabold text-white">{stats.streak} ngày</span>
            <span className="text-[10px] text-amber-500 block mt-0.5 font-sans">• Đã an toàn hôm nay</span>
          </div>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column (Main widgets) */}
        <div className="lg:col-span-8 space-y-8">

          {/* Tổng quan: tiến độ thực tế so với kế hoạch (daily-progress-report) */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1.5 w-full bg-orange-600" />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">Tổng quan</h3>
              {report && (
                <span className="text-[11px] text-slate-400">
                  Ngày báo cáo: {new Date(report.report_date).toLocaleDateString("vi-VN")}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <LevelBadge level={nextSuggestedLesson.level} />
              <span className="text-sm font-display font-bold text-slate-800">{nextSuggestedLesson.title}</span>
            </div>

            {!report ? (
              <div className="h-16 flex items-center">
                <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline flex-wrap gap-2">
                    <span className="text-xs text-slate-500">
                      Tiến độ hiện tại: <b className="text-slate-800">{Math.round(report.actual_progress_percentage)}%</b>
                    </span>
                    {report.generation_status === "success" && report.expected_progress_percentage !== null && (
                      <span className="text-xs text-slate-500">
                        Kỳ vọng: <b className="text-slate-800">{Math.round(report.expected_progress_percentage)}%</b>
                      </span>
                    )}
                  </div>
                  <ProgressBar value={report.actual_progress_percentage} />
                </div>

                {report.generation_status === "success" && report.progress_status && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className={`text-xs font-display font-bold px-2.5 py-1 rounded-lg ${PROGRESS_STATUS_BADGE[report.progress_status].className}`}>
                      {PROGRESS_STATUS_BADGE[report.progress_status].label}
                    </span>
                    {report.progress_gap_percentage_point !== null && report.progress_gap_percentage_point > 0 && (
                      <span className="text-xs text-red-600 font-display font-bold">
                        -{Math.round(report.progress_gap_percentage_point)} điểm %
                      </span>
                    )}
                    {report.package_remaining_days !== null && (
                      <span className="text-xs text-slate-500">
                        Còn lại: <b className="text-slate-800">{report.package_remaining_days} ngày</b>
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100/80 text-xs text-slate-500">
                  <span>Bài học hoàn tất: <b className="text-slate-800">{report.completed_required_lessons}/{report.total_required_lessons}</b></span>
                  {catchUpLessons > 0 && (
                    <span>Cần hoàn thành thêm <b className="text-slate-800">{catchUpLessons}</b> bài để bắt kịp kế hoạch</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Bài học hiện tại */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <LevelBadge level={nextSuggestedLesson.level} />
              <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Bài học hiện tại</span>
            </div>
            <div>
              <h3 className="text-lg font-display font-extrabold text-slate-900 leading-tight">{nextSuggestedLesson.title}</h3>
              <p className="text-slate-500 text-xs font-sans mt-1">
                Thuộc module {nextSuggestedLesson.moduleTitle} • ⏰ {nextSuggestedLesson.duration} phút học
              </p>
            </div>
            <Button
              id="btn-dash-continue-learn"
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
            >
              <PlayCircle className="w-4.5 h-4.5 mr-2" /> Tiếp tục học
            </Button>
          </div>

          {/* Total XP Score card */}
          <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Tổng điểm tích lũy</span>
              <h4 className="text-3xl font-display font-black text-slate-800 mt-1">{stats.xp} <span className="text-base text-slate-400 font-bold">XP</span></h4>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-sm">
                Tích đủ <b>500 XP</b> để nhận danh hiệu <b>"Bảo bối nói tiếng Đức"</b> và mở khóa biểu tượng lửa độc quyền!
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center text-lg shadow-sm shrink-0">
              🏆
            </div>
          </div>

        </div>

        {/* Right Column (Test history, upcoming lists) */}
        <div className="lg:col-span-4 space-y-8">

          {/* Recent Quiz Scores */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" /> Kết quả kiểm tra gần đây
            </h3>

            {recentScores.length === 0 ? (
              <div className="text-center py-6 px-4 space-y-2">
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  📊
                </div>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Bạn chưa thực hiện bài kiểm tra nào. Sau mỗi bài học, hãy click "Bắt đầu Test" để ghi tên tại đây!
                </p>
                <Button
                  id="btn-start-test-first"
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
                >
                  Học bài đầu ngay
                </Button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {recentScores.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100/60">
                    <div className="space-y-0.5 max-w-[170px]">
                      <h4 className="text-xs font-display font-bold text-slate-800 truncate">{item.title}</h4>
                      <span className="text-[10px] text-slate-400 font-sans">Đã hoàn thành</span>
                    </div>
                    {/* Score badge with conditional colors */}
                    <span className={`text-xs font-display font-black px-2.5 py-1 rounded-lg ${
                      item.score >= 80 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {item.score}%
                    </span>
                  </div>
                ))}

                <p className="text-[10px] text-center text-slate-400 font-sans mt-2">
                  *Điểm số được đồng bộ hóa tức thì từ bài viết quiz của từng bài học.
                </p>
              </div>
            )}
          </div>

          {/* Kế hoạch học tập: 4 bài gần nhất theo thứ tự thật của roadmap */}
          {planLessons.length > 0 && (
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-indigo-505" /> Kế hoạch học tập
              </h3>

              <div className="space-y-3">
                {planLessons.map((lesson, i) => (
                  <div key={lesson.id} className="flex gap-3 items-start border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-display font-bold text-[10px] flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-display font-bold text-slate-800 leading-snug truncate">{lesson.title}</h4>
                        <span className={`text-[9px] font-display font-bold shrink-0 ${i === 0 ? "text-orange-600" : "text-slate-400"}`}>
                          {planStatusLabel(i)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-none truncate">{lesson.titleVi}</p>
                      <p className="text-[9px] text-slate-400 mt-1">{lesson.duration} phút</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
```

- [ ] **Step 3: Drop the now-unused prop from App.tsx**

Replace:
```tsx
              {effectivePage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  modules={modules}
                  orderedLessons={orderedLessons}
                  lessonStatuses={lessonStatuses}
                  onNavigateLesson={handleSelectLesson}
                  onNavigateRoadmap={() => handleNavigate("roadmap")}
                />
              )}
```
with:
```tsx
              {effectivePage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  modules={modules}
                  orderedLessons={orderedLessons}
                  lessonStatuses={lessonStatuses}
                  onNavigateLesson={handleSelectLesson}
                />
              )}
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification — both report states**

Start the dev server, log in as a normal test user (no `level_enrollments`/`is_premium` set by admin — the common case today):
- Confirm the "Tổng quan" card shows level + lesson title, a brief loading spinner, then falls back to just "Tiến độ hiện tại: N%" + "Bài học hoàn tất: N/M" with no "Kỳ vọng"/badge/"Còn lại" line (since `generation_status` will be `"insufficient_data"` or `"empty"`).
- Confirm "Bài học hiện tại" card below it still shows the right lesson + working "Tiếp tục học" button.
- Confirm XP card and "Kết quả kiểm tra gần đây" are unchanged in behavior.

If a test user with `is_premium=true` + `level_enrollments` row is available (set via Admin, per `2026-08-07-daily-progress-report-backend-design.md`), also verify: the card shows "Ngày báo cáo", both "Tiến độ hiện tại"/"Kỳ vọng" percentages, the correct colored status badge (`✓ Đúng tiến độ` / `⚠ Cần chú ý` / `⚠ Chậm tiến độ`), "Còn lại: N ngày", and (when behind) "Cần hoàn thành thêm N bài để bắt kịp kế hoạch". Check the Network tab: `daily-progress-report` is called once per Dashboard load, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx src/App.tsx
git commit -m "feat(dashboard): wire daily-progress-report into Tong quan card, split Bai hoc hien tai"
```

---

## Self-Review Notes

- **Spec coverage:** rebrand → Task 1; Header → Task 5; Sidebar 6 links + subtitle → Task 4; banner slogan → Task 7; card Tổng quan (progress/kỳ vọng/cảnh báo) → Task 8; card Bài học hiện tại (dưới Tổng quan, nút full-width) → Task 8; card XP → Task 8; Kết quả kiểm tra gần đây (không đổi) → verified in Task 8; Kế hoạch học tập (4 bài thật, trạng thái) → Task 7; "Gói học"/"Trợ giúp học tập" placeholder → Task 3; no-hardcode data → Tasks 7/8 (all values come from `stats`, `orderedLessons`, `report`, never literals).
- **Type consistency check:** `LessonStatus` (Task 6's `dashboardProgress.ts`, Task 7/8's `DashboardPage.tsx`) always imported from `../lib/completion`, never redefined. `orderedLessons`/`lessonStatuses` names match exactly what already exists in `App.tsx` (no renaming). `DailyProgressReport` field names match `daily_progress_reports` table columns / `report.ts` output exactly (snake_case, verified against `supabase/functions/daily-progress-report/report.ts` and `index.ts`).
- **No placeholders:** every step has full code, no "TBD"/"similar to Task N".
