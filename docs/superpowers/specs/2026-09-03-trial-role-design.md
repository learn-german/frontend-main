# Trial Role — Design Spec

**Date**: 2026-09-03
**Status**: Approved

## Overview

Thêm role "Trial" cho user mới đăng ký. Trial user chỉ truy cập được bài học đầu tiên, các tính năng khác (bảng xếp hạng, trợ giúp, lộ trình mở rộng) bị khóa. Chuyển sang role "User" + điền ngày hết hạn bởi Admin để mở toàn bộ.

## Approach

Frontend-only gating. DB fields có sẵn (`role`, `is_premium`, `subscription_end_date` trong `profiles`). RLS + Edge Functions vẫn protect server-side data (quiz scoring).

## Data Model

Không cần migration. Sử dụng fields có sẵn trong `profiles`:

| Field | Type | Mô tả |
|-------|------|-------|
| `role` | text | `"trial"` \| `"user"` \| `"admin"` |
| `is_premium` | bool | `true` khi role = user + subscription active |
| `subscription_end_date` | timestamptz | Ngày hết hạn gói, null = chưa có gói |

### Role Assignment

- **Signup**: Default role = `"trial"` (set via Edge Function hoặc DB trigger).
- **Upgrade**: Admin chuyển role → `"user"` + set `subscription_end_date` trong Admin Panel.
- **Expiry**: Khi `subscription_end_date < now()`, frontend treat user as trial (auto-revert UI).

## Type Changes

### `AppUser` (App.tsx)

```typescript
type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: "trial" | "user" | "admin";
  subscriptionEndDate: string | null;
};
```

### `UserRole` type (appTypes.ts)

```typescript
type UserRole = "trial" | "user" | "admin";
```

## New Module: `src/lib/trialGating.ts`

```typescript
function isTrialUser(user: AppUser): boolean;
function isSubscriptionExpired(user: AppUser): boolean;
function isEffectivelyTrial(user: AppUser): boolean; // trial OR expired
function isFeatureLocked(user: AppUser, feature: LockedFeature): boolean;
function getMaxAccessibleLessonIndex(user: AppUser): number; // 0 = first only, Infinity = all
```

`LockedFeature` = `"leaderboard" | "help" | "roadmap-advanced" | "packages"`

## Component Changes

### App.tsx

- Fetch `subscription_end_date` from `profiles` after auth.
- Include in `AppUser` object.
- Check expiry on app load: if expired, show toast warning.
- Pass `isEffectivelyTrial` state to child components.

### Navigation (sidebar/bottom nav)

- Trial: disable links to leaderboard, help, packages.
- Show lock icon + tooltip "Nâng cấp gói để mở tính năng này".
- Clicking locked item → toast "Bạn cần nâng cấp gói để sử dụng tính năng này".

### RoadmapPage

- Trial: lesson 1 = `"current"`, all others = `"locked"`.
- Override `computeLessonStatuses()` result for trial users.
- Locked lessons show "🔒 Nâng cấp gói" badge.

### Lesson Deep-link Guard (App.tsx)

- Existing guard checks lesson lock status.
- For trial users, any lesson index > 0 → redirect to roadmap + toast.

### DashboardPage

- Trial: show upgrade banner at top.
- "Bạn đang dùng gói Trial. Liên hệ admin để nâng cấp."

### Admin Panel (AdminUsersSection)

- Add role dropdown: trial / user / admin.
- Add date picker for `subscription_end_date`.
- Save via Supabase update to `profiles` + Edge Function for `app_metadata.role`.

## UX Summary

| State | Lesson Access | Features | UI Indicator |
|-------|--------------|----------|-------------|
| Trial | Lesson 1 only | Locked | Banner + lock icons |
| User (active) | All lessons | All | Normal |
| User (expired) | Lesson 1 only | Locked | Expiry warning + lock icons |
| Admin | All | All | Normal |

## Security Notes

- Frontend gating only — không phải security boundary.
- Quiz scoring vẫn server-side (Edge Function `submit-quiz`).
- Lesson content không sensitive → frontend lock đủ.
- `app_metadata.role` chỉ set được qua Edge Function (service_role).

## Out of Scope

- Payment flow (tương lai).
- Server-side lesson content gating.
- Email notification khi sắp hết hạn.
