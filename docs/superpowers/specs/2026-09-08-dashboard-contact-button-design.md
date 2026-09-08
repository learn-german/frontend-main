# Dashboard Contact Button (Trial & Expired) — Design Spec

**Date**: 2026-09-08  
**Status**: Approved  
**Scope**: Nút “Liên hệ” trên banner Trial và banner hết hạn ở `DashboardPage`, mở fanpage Facebook.

## Problem

User Trial / hết hạn thấy banner nhắc “Liên hệ admin” nhưng không có CTA rõ ràng để liên hệ. Cần nút **Liên hệ** dẫn thẳng tới fanpage.

## Decision

- Thêm nút **Liên hệ** vào **cả hai** banner: Trial (amber) và hết hạn (red).
- Link: `https://web.facebook.com/share/1C9YswkzTN/?mibextid=wwXIfr&_rdc=1&_rdr`
- Mở tab mới (`target="_blank"`, `rel="noopener noreferrer"`).
- Approach **minimal**: chỉ sửa `DashboardPage.tsx`, không extract component mới.

## Behavior

| Điều kiện | Before | After |
|---|---|---|
| `isTrialRestricted && !isExpiredRestricted` | Banner amber, chỉ text | Banner amber + nút “Liên hệ” bên phải |
| `isExpiredRestricted` | Banner red, chỉ text | Banner red + nút “Liên hệ” bên phải |
| User không trial / không hết hạn | Không banner | Không đổi |

Click nút → mở fanpage trong tab mới. Không đổi logic gating trial/expired.

## UI

- Layout banner: `flex items-center gap-3`; khối text `flex-1 min-w-0`; nút `shrink-0` bên phải.
- Dùng `Button` từ DesignSystem: `variant="primary"` `size="sm"` (cam / chữ trắng — khớp mockup).
- Label: `Liên hệ`.

## Implementation

### Code

- File duy nhất: `src/pages/DashboardPage.tsx`
- Constant gần đầu file, ví dụ:

```ts
const CONTACT_FANPAGE_URL =
  "https://web.facebook.com/share/1C9YswkzTN/?mibextid=wwXIfr&_rdc=1&_rdr";
```

- Mỗi banner: thêm `<a href={CONTACT_FANPAGE_URL} target="_blank" rel="noopener noreferrer">` bọc `Button`, hoặc pattern tương đương đã dùng trong repo nếu có.
- `Button` đã được import sẵn — không thêm dependency.

### Out of scope

- Không đổi copy text banner.
- Không thêm nút ở Landing / Roadmap / Navigation.
- Không đổi `trialGating` / App props.
- Không thêm npm package.

## Test plan

- [ ] Đăng nhập user Trial → dashboard hiện banner amber + nút “Liên hệ”
- [ ] Click nút → mở đúng URL fanpage (tab mới)
- [ ] User hết hạn → banner red + cùng nút / cùng URL
- [ ] User còn hạn (role user/admin) → không hiện hai banner này
- [ ] `npm run lint` pass

## Worktree

- Branch: `feat/dashboard-contact-button`
- Path: `.worktrees/feat-dashboard-contact-button`
