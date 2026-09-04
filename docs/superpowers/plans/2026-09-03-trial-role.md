# Trial Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Trial" role that restricts new users to lesson 1 only, locking leaderboard, help, packages, and advanced roadmap. Admin can upgrade to "User" role with subscription end date.

**Architecture:** Frontend-only gating using existing DB fields (`role`, `subscription_end_date` in `profiles`). New `trialGating.ts` helper centralizes all trial logic. Navigation, Roadmap, and deep-link guard consume this helper. Admin Panel gets role dropdown + date picker.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Supabase PostgREST

## Global Constraints

- No new npm packages
- Code in English, UI text in Vietnamese
- No `any` — use specific types
- Named exports only
- Use `showToast()` for notifications, never `window.alert()`
- Don't modify `database.types.ts` manually
- Run `npm run lint` after changes

---

### Task 1: Trial Gating Helper + AppUser Type Changes

**Files:**
- Create: `src/lib/trialGating.ts`
- Modify: `src/App.tsx:39` (AppUser type)
- Modify: `src/App.tsx:186-196` (hydrate user with subscription data)

**Interfaces:**
- Consumes: nothing (foundational task)
- Produces:
  - `UserRole` type: `"trial" | "user" | "admin"`
  - `LockedFeature` type: `"leaderboard" | "help" | "packages"`
  - `isEffectivelyTrial(user: AppUser): boolean`
  - `isFeatureLocked(user: AppUser, feature: LockedFeature): boolean`
  - `getTrialLessonLimit(): number` → returns `1`
  - Updated `AppUser` with `role: UserRole` and `subscriptionEndDate: string | null`

- [ ] **Step 1: Create `src/lib/trialGating.ts`**

```typescript
export type UserRole = "trial" | "user" | "admin";

export type LockedFeature = "leaderboard" | "help" | "packages";

const TRIAL_LESSON_LIMIT = 1;

export function isTrialUser(role: UserRole): boolean {
  return role === "trial";
}

export function isSubscriptionExpired(subscriptionEndDate: string | null): boolean {
  if (!subscriptionEndDate) return false;
  return new Date(subscriptionEndDate) < new Date();
}

export function isEffectivelyTrial(role: UserRole, subscriptionEndDate: string | null): boolean {
  if (role === "admin") return false;
  if (role === "trial") return true;
  return isSubscriptionExpired(subscriptionEndDate);
}

export function isFeatureLocked(role: UserRole, subscriptionEndDate: string | null, feature: LockedFeature): boolean {
  return isEffectivelyTrial(role, subscriptionEndDate);
}

export function getTrialLessonLimit(): number {
  return TRIAL_LESSON_LIMIT;
}
```

- [ ] **Step 2: Update `AppUser` type in `src/App.tsx`**

Change line 39 from:
```typescript
type AppUser = { id: string; email: string; fullName: string; role: string };
```
To:
```typescript
import type { UserRole } from "./lib/trialGating";

type AppUser = { id: string; email: string; fullName: string; role: UserRole; subscriptionEndDate: string | null };
```

- [ ] **Step 3: Fetch `subscription_end_date` during hydration in `src/App.tsx`**

In `hydrateSessionUser`, change the profiles query (around line 192):
```typescript
const { data: profile, error } = await supabase
  .from("profiles")
  .select("full_name, subscription_end_date")
  .eq("id", authUser.id)
  .maybeSingle();
```

And where `AppUser` is constructed (search for where `setUser` is called with fullName), add `subscriptionEndDate`:
```typescript
setUser({
  ...identity,
  fullName: profile.full_name,
  subscriptionEndDate: profile.subscription_end_date ?? null,
});
```

The `identity` object (line 184-187) also needs `subscriptionEndDate: null` as default:
```typescript
const identity: PendingUser = {
  id: authUser.id,
  email: authUser.email ?? "",
  role: (authUser.app_metadata?.role as UserRole) ?? "trial",
};
```

Also update `PendingUser` type to use `UserRole`:
```typescript
type PendingUser = Omit<AppUser, "fullName" | "subscriptionEndDate">;
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add src/lib/trialGating.ts src/App.tsx
git commit -m "feat: add trial gating helper and update AppUser type"
```

---

### Task 2: Navigation Gating (Sidebar + Mobile Menu)

**Files:**
- Modify: `src/components/Navigation.tsx:280-338` (Sidebar)
- Modify: `src/components/Navigation.tsx:232-270` (Mobile menu logged-in nav)

**Interfaces:**
- Consumes: `isFeatureLocked(role, subscriptionEndDate, feature)` from `trialGating.ts`, `AppUser.role`, `AppUser.subscriptionEndDate`
- Produces: Sidebar and mobile nav that show lock icons and disable navigation for trial users on locked features

- [ ] **Step 1: Add `userRole` and `subscriptionEndDate` props to `SidebarProps`**

In `src/components/Navigation.tsx`, update the interface (around line 279):
```typescript
import type { UserRole, LockedFeature, isFeatureLocked } from "../lib/trialGating";
import { Lock } from "lucide-react";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: AppPage) => void;
  streak: number;
  currentLessonTitle?: string;
  userRole: UserRole;
  subscriptionEndDate: string | null;
}
```

- [ ] **Step 2: Add lock logic to Sidebar links**

Add a mapping from page id to LockedFeature, and disable locked items:

```typescript
const featureMap: Partial<Record<AppPage, LockedFeature>> = {
  leaderboard: "leaderboard",
  help: "help",
  packages: "packages",
};

// Inside the links.map() callback:
const locked = featureMap[link.id] ? isFeatureLocked(userRole, subscriptionEndDate, featureMap[link.id]!) : false;
```

For locked items: add `opacity-50 cursor-not-allowed` classes, show `<Lock>` icon, and on click show toast instead of navigating:
```typescript
onClick={() => {
  if (locked) {
    showToast("Nâng cấp gói để mở tính năng này.", "warning");
    return;
  }
  onNavigate(link.id);
}}
```

Add lock icon next to the label for locked items:
```typescript
{locked && <Lock className="w-3.5 h-3.5 text-slate-400 ml-auto" />}
```

- [ ] **Step 3: Update mobile menu nav buttons similarly**

For the mobile menu logged-in section (lines 232-270), add the same lock check for leaderboard, help buttons. Wrap onClick with the same guard and add visual lock indicator.

- [ ] **Step 4: Update `NavigationProps` to include role info**

```typescript
interface NavigationProps {
  currentPage: string;
  onNavigate: (page: AppPage) => void;
  user: { email: string; fullName: string; role?: UserRole; subscriptionEndDate?: string | null } | null;
  onLogout: () => void;
  streak: number;
  xp: number;
  onNotificationNavigate?: (n: AppNotification) => void;
}
```

Pass role info from Navbar to mobile menu items with same lock logic.

- [ ] **Step 5: Update Sidebar usage in `App.tsx`**

Find where `<Sidebar>` is rendered and add the new props:
```typescript
<Sidebar
  currentPage={currentPage}
  onNavigate={handleNavigate}
  streak={stats.streak}
  currentLessonTitle={activeLessonObject?.title}
  userRole={user.role}
  subscriptionEndDate={user.subscriptionEndDate}
/>
```

- [ ] **Step 6: Run lint**

```bash
npm run lint
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/Navigation.tsx src/App.tsx
git commit -m "feat: lock nav items for trial users"
```

---

### Task 3: Roadmap Gating for Trial Users

**Files:**
- Modify: `src/App.tsx` (deep-link guard + pass trial state to RoadmapPage)
- Modify: `src/pages/RoadmapPage.tsx` (override lesson statuses for trial)

**Interfaces:**
- Consumes: `isEffectivelyTrial(role, subscriptionEndDate)`, `getTrialLessonLimit()` from `trialGating.ts`
- Produces: Roadmap that locks all lessons except #1 for trial users; deep-link guard blocks trial access to lesson index > 0

- [ ] **Step 1: Pass `isEffectivelyTrial` flag to RoadmapPage**

In `App.tsx`, compute and pass:
```typescript
import { isEffectivelyTrial } from "./lib/trialGating";

// In the render section where RoadmapPage is used:
const effectivelyTrial = user ? isEffectivelyTrial(user.role, user.subscriptionEndDate) : false;
```

Add `isTrialRestricted` prop to `<RoadmapPage>`:
```typescript
<RoadmapPage
  // ...existing props
  isTrialRestricted={effectivelyTrial}
/>
```

- [ ] **Step 2: Override lesson statuses in RoadmapPage for trial users**

In `src/pages/RoadmapPage.tsx`, accept `isTrialRestricted` prop. When true, override `lessonStatuses`: only index 0 = `"current"`, all others = `"locked"`.

```typescript
interface RoadmapPageProps {
  // ...existing
  isTrialRestricted?: boolean;
}

// Inside the component, after receiving lessonStatuses:
const effectiveStatuses = useMemo(() => {
  if (!isTrialRestricted) return lessonStatuses;
  const overridden: Record<string, LessonStatus> = {};
  orderedLessons.forEach((lesson, idx) => {
    overridden[lesson.id] = idx === 0 ? "current" : "locked";
  });
  return overridden;
}, [isTrialRestricted, lessonStatuses, orderedLessons]);
```

Use `effectiveStatuses` instead of `lessonStatuses` in rendering.

- [ ] **Step 3: Add trial badge to locked lessons**

For locked lessons when `isTrialRestricted`, show a small "🔒 Nâng cấp gói" text next to the lock status.

- [ ] **Step 4: Enhance deep-link guard in App.tsx**

Update the existing deep-link guard (around line 92-106) to also block trial users from lessons beyond index 0:

```typescript
useEffect(() => {
  if (!user || modulesLoading || statsLoading) return;
  if (currentPage !== "lesson-detail" && currentPage !== "quiz") return;

  // Trial restriction: only lesson at index 0 allowed
  if (effectivelyTrial) {
    const lessonIndex = orderedLessons.findIndex((l) => l.id === selectedLessonId);
    if (lessonIndex !== 0) {
      showToast("Nâng cấp gói để truy cập bài học này.", "warning");
      setCurrentPage("roadmap");
      return;
    }
  }

  // Existing lock check
  const status = lessonStatuses[selectedLessonId];
  const existsInFlatLessons = flatLessons.some((l) => l.id === selectedLessonId);
  const isLocked = status === "locked" || (status === undefined && existsInFlatLessons);
  if (!isLocked) return;
  showToast("Hãy hoàn thành bài học trước để mở bài này.", "warning");
  setCurrentPage("roadmap");
}, [user, modulesLoading, statsLoading, currentPage, selectedLessonId, lessonStatuses, flatLessons, effectivelyTrial, orderedLessons]);
```

- [ ] **Step 5: Run lint**

```bash
npm run lint
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/RoadmapPage.tsx
git commit -m "feat: lock roadmap lessons for trial users"
```

---

### Task 4: Dashboard Trial Banner + Expiry Warning

**Files:**
- Modify: `src/pages/DashboardPage.tsx` (add upgrade banner)
- Modify: `src/App.tsx` (show expiry toast on load)

**Interfaces:**
- Consumes: `isEffectivelyTrial(role, subscriptionEndDate)`, `isSubscriptionExpired(subscriptionEndDate)` from `trialGating.ts`
- Produces: Banner on dashboard for trial users; toast warning when subscription expires

- [ ] **Step 1: Add trial banner to DashboardPage**

Add `isTrialRestricted` prop to DashboardPage. When true, render a banner at the top:

```typescript
{isTrialRestricted && (
  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
    <div>
      <p className="text-sm font-display font-bold text-amber-900">Bạn đang dùng gói Trial</p>
      <p className="text-xs text-amber-700 mt-0.5">Chỉ bài học đầu tiên khả dụng. Liên hệ admin để nâng cấp gói và mở toàn bộ nội dung.</p>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add expiry toast in App.tsx**

After user is hydrated, check if subscription just expired:

```typescript
useEffect(() => {
  if (!user) return;
  if (user.role === "user" && isSubscriptionExpired(user.subscriptionEndDate)) {
    showToast("Gói học của bạn đã hết hạn. Liên hệ admin để gia hạn.", "warning");
  }
}, [user]);
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx src/App.tsx
git commit -m "feat: add trial banner and expiry warning"
```

---

### Task 5: Admin Panel — Role Dropdown + Subscription Date

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx` (add role dropdown + date picker)

**Interfaces:**
- Consumes: `UserRole` type from `trialGating.ts`
- Produces: Admin can change user role and set subscription end date via UI

- [ ] **Step 1: Explore AdminUsersSection current structure**

Read the file to understand the current user editing UI.

- [ ] **Step 2: Add role dropdown to user edit form**

Add a `<select>` with options `trial`, `user`, `admin`:

```typescript
<label className="text-xs font-display font-semibold text-slate-600">Role</label>
<select
  value={editingUser.role}
  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
>
  <option value="trial">Trial</option>
  <option value="user">User</option>
  <option value="admin">Admin</option>
</select>
```

- [ ] **Step 3: Add subscription end date picker**

Only show when role = "user":

```typescript
{editingUser.role === "user" && (
  <div>
    <label className="text-xs font-display font-semibold text-slate-600">Ngày hết hạn gói</label>
    <input
      type="date"
      value={editingUser.subscriptionEndDate ?? ""}
      onChange={(e) => setEditingUser({ ...editingUser, subscriptionEndDate: e.target.value || null })}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
    />
  </div>
)}
```

- [ ] **Step 4: Save role + subscription_end_date to profiles**

On save, update both fields:
```typescript
const { error } = await supabase
  .from("profiles")
  .update({
    role: editingUser.role,
    subscription_end_date: editingUser.subscriptionEndDate,
  })
  .eq("id", editingUser.id);
```

For `app_metadata.role`, call the existing `set-admin-role` Edge Function (or create a new `set-user-role` function if the existing one only handles admin). This ensures JWT claims are updated.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: admin role dropdown and subscription date picker"
```

---

### Task 6: Default Trial Role on Signup

**Files:**
- Modify: Supabase DB trigger or Edge Function (set default role = "trial" for new users)

**Interfaces:**
- Consumes: Supabase auth signup flow
- Produces: New users get `app_metadata.role = "trial"` and `profiles.role = "trial"` by default

- [ ] **Step 1: Check current signup default**

The current default in App.tsx line 186 is:
```typescript
role: (authUser.app_metadata?.role as string) ?? "user",
```

Change the fallback to `"trial"`:
```typescript
role: (authUser.app_metadata?.role as UserRole) ?? "trial",
```

- [ ] **Step 2: Update profiles insert default**

When a new profile is created (in hydrateSessionUser), ensure `role: "trial"` is inserted:
```typescript
const { error: insertError } = await supabase
  .from("profiles")
  .insert({ id: identity.id, email: identity.email, full_name: null, role: "trial" });
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: default new users to trial role"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full lint check**

```bash
npm run lint
```

- [ ] **Step 2: Manual testing checklist**

1. New signup → role = trial → only lesson 1 accessible
2. Nav: leaderboard, help, packages show lock icon + toast on click
3. Roadmap: only lesson 1 = current, rest = locked with upgrade badge
4. Deep-link to lesson 2 → redirected to roadmap with warning
5. Admin changes role to "user" + sets date → all features unlock
6. Set expired date → user reverts to trial-like restrictions
7. Admin role → no restrictions

- [ ] **Step 3: Final commit with any fixes**

```bash
git add -A
git commit -m "feat: trial role - final polish"
```
