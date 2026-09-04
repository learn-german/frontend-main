# Admin Trial Indicator — Design Spec

**Date:** 2026-09-04  
**Status:** Approved (pending user review of this file)  
**Related:** Broader app gating in `2026-09-03-trial-role-design.md` is **out of scope** for this change.

## Overview

Trên Admin > Người dùng, cột **Cấp độ mở** thêm ô **Trial** (chỉ hiển thị) bên cạnh A1/A2/B1/B2. Trạng thái derive từ `profiles.subscription_end_date`. Đồng thời bỏ phụ thuộc `is_premium` khỏi luồng admin edit và batch daily-progress-report — gói active chỉ còn dựa vào ngày hết hạn.

## Goal

- Admin nhìn nhanh user nào đang Trial (không còn hạn / chưa có ngày hết hạn).
- Không tương tác: ô Trial read-only.
- Không ảnh hưởng quyền học trên app learner.

## Non-goals

- Frontend gating bài học / feature lock (xem spec 2026-09-03 nếu làm sau).
- Filter “Trial” trên thanh lọc admin.
- Drop cột DB `profiles.is_premium`.
- Role `"trial"` trong `profiles.role` / `app_metadata`.

## Data rule

```
isTrial(subscription_end_date) =
  subscription_end_date is null OR empty
  OR calendar date(subscription_end_date) < calendar date(today, local)
```

- Còn hạn hôm nay hoặc tương lai → không Trial.
- Không dùng `is_premium`.

## Approach

### 1. Helper thuần

File mới `src/lib/isTrialBySubscription.ts`:

- `isTrialBySubscription(subscriptionEndDate: string | null): boolean`
- Unit test các case: `null`, ngày quá khứ, hôm nay, tương lai, chuỗi rỗng nếu cần.

### 2. AdminUsersSection — bảng

- Cột Cấp độ mở: sau checkbox A1–B2, thêm label **Trial** + checkbox `checked={isTrialBySubscription(u.subscriptionEndDate)}` `disabled` (không `onChange`).
- Dùng `subscriptionEndDate` đã có trong fetch hiện tại — không thêm query.
- Style giữ pattern checkbox cấp độ (`accent-orange-600`); `disabled` để rõ chỉ xem.

### 3. AdminUsersSection — Edit modal

- Gỡ checkbox `is_premium` khỏi UI.
- `EditForm` / state / `handleSave` / map khi mở modal: không còn field `is_premium`.
- Giữ date picker `subscription_end_date`.
- `AdminUser` có thể bỏ `isPremium` nếu không còn chỗ đọc; fetch `select` bỏ `is_premium`.

### 4. daily-progress-report batch

Trong `supabase/functions/daily-progress-report/index.ts` `handleBatch`:

- Bỏ `.eq("is_premium", true)`.
- Giữ `.gte("subscription_end_date", reportDate)`.
- `select` profile trong `computeAndUpsertReport`: bỏ `is_premium` nếu không còn dùng.

Eligible user = có `subscription_end_date >= reportDate` (và các điều kiện khác sẵn có: unlock level, v.v. trong compute).

### 5. Database

- Không migration.
- Cột `is_premium` giữ nguyên trên DB (không ghi từ admin UI nữa).

## Files likely touched

| File | Change |
|------|--------|
| `src/lib/isTrialBySubscription.ts` | new helper |
| `src/lib/isTrialBySubscription.test.ts` | unit tests |
| `src/pages/admin/AdminUsersSection.tsx` | Trial checkbox + remove is_premium from edit |
| `supabase/functions/daily-progress-report/index.ts` | batch filter without is_premium |

## Testing

1. Unit: helper date cases như trên.
2. Manual admin:
   - User `subscription_end_date` null → Trial checked, disabled.
   - User hết hạn → Trial checked.
   - User còn hạn → Trial unchecked.
   - Không click được ô Trial.
   - Edit modal không còn ô premium; lưu ngày hết hạn vẫn được.
3. (Nếu deploy function) batch chỉ chọn user còn `subscription_end_date` hợp lệ, không cần `is_premium`.

## Relationship to 2026-09-03 trial-role

Spec 2026-09-03 mô tả role `trial` + khóa feature trên app. Spec này **chỉ** indicator admin + cắt `is_premium` khỏi edit/batch. Khi implement gating learner sau, nên align rule “effectively trial” với cùng định nghĩa ngày hết hạn ở đây.
