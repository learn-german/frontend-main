# Online Meeting Schedule — HTML Mockup Design

**Date:** 2026-09-04  
**Status:** Approved (pending user review of this file)  
**Branch / worktree:** `feat/online-meeting-schedule`  
**Scope:** Static HTML mockups only — no React / Supabase integration in this pass.

## Overview

Thêm mockup cho tính năng **chọn lịch học meeting online**: admin tạo buổi hỗ trợ (ngày, giờ, link Meet); học viên đăng ký. Mỗi lịch tối đa 10 người; mỗi học viên tối đa 1 đăng ký active / tuần lịch (Thứ 2 → Chủ nhật). Sau khi đăng ký, thông tin buổi học thay chỗ streak trên banner/sidebar user.

## Goal

- Hai file HTML mở được trên browser, demo đủ flow admin ↔ user.
- UI bám ảnh tham chiếu (admin form + list; user list + weekly meeting card thay streak).
- Rule 10 chỗ / lịch và 1 lần / tuần hoạt động đúng trong mockup (client-side).

## Non-goals

- Supabase schema, RLS, Edge Functions, auth thật.
- Tích hợp vào `DashboardPage` / Navigation / admin React.
- Google Meet API thật; multi-user thật; email / push notification.
- Đổi style app production sang palette mockup.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Deliverable | HTML mockups only (`meeting-admin.html` / `meeting-user.html`) |
| Structure | Two standalone HTML files + shared `localStorage` |
| Weekly limit | Calendar week Monday → Sunday |
| Cancel registration | Frees weekly slot — user may register another session same week |
| Capacity | Hard max **10** registrations per session |
| Meet link visibility | Only after user registered for that session |
| Location | `docs/mockups/` (same pattern as support mockups) |

## Files

```
docs/mockups/meeting-admin.html
docs/mockups/meeting-user.html
```

Each file is self-contained (HTML + CSS + JS), similar to `support-admin-mockup.html` / `support-user-mockup.html`. Prefer existing mockup CSS tokens (red accent, slate neutrals, Inter) so shell looks familiar; layout follows the reference screenshots more closely than production Tailwind components.

## Data model (`localStorage`)

**Key:** `deutschpath_meeting_mockup_v1`

```ts
type MeetingStore = {
  sessions: MeetingSession[];
  registrations: MeetingRegistration[];
};

type MeetingSession = {
  id: string;
  title: string;
  level: "A1" | "A2" | "B1" | "B2";
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  meetUrl: string;
  note: string;
  createdAt: string;  // ISO
};

type MeetingRegistration = {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  registeredAt: string; // ISO
};
```

- Demo learner (fixed): `userId: "demo-user"`, `userName: "Nguyen Thang"`.
- Seed data on first load (and via admin “Khôi phục dữ liệu mẫu”): mix of available / almost full / full sessions plus optional one registration for demo user so banner states are visible.
- Both pages read/write the same key so opening admin + user in two tabs stays in sync after reload (same-tab updates via write; cross-tab via `storage` event optional but recommended).

## Capacity & status helpers

```
count(session) = registrations.filter(r => r.sessionId === session.id).length
remaining = 10 - count

status:
  count >= 10          → FULL      ("ĐÃ ĐỦ CHỖ") — card dimmed, register disabled
  count >= 8           → ALMOST    ("SẮP ĐẦY")
  else                 → OPEN      ("CÒN CHỖ")

userRegistered(session) → badge "ĐÃ ĐĂNG KÝ" on that card
```

## Weekly rule

```
weekKey(d) = ISO calendar week starting Monday (local timezone)
activeRegistrationThisWeek(userId) =
  registrations where userId matches
  AND session.date falls in current calendar week (Mon–Sun)
```

- Register allowed only if: `count < 10` AND no active registration this week for demo user (or the target session is already theirs — N/A).
- Cancel deletes that registration → weekly slot freed → may register another session same week.
- Deleting a session (admin) also deletes its registrations.

## Admin UI (`meeting-admin.html`)

1. **Header** — title “Lịch hỗ trợ học viên”, short subtitle, three stats: upcoming sessions / total registrations / full sessions.
2. **Left: create/edit form** — title, level, date, start/end time, meet URL + “Tạo Meet” (fills sample `https://meet.google.com/xxx-xxxx-xxx`), student note, fixed copy “Giới hạn đăng ký: 10 học viên”, primary “Tạo lịch học” / “Lưu”, secondary “Hủy sửa”.
3. **Right: session list** — search by title, filter All / Còn chỗ / Đã đủ chỗ, restore sample data.
4. **Row actions** — “Danh sách (n)” opens registrant panel/modal; Sửa loads form; Xóa confirms then removes; “Mở link meeting”; capacity badge + progress `n/10`.

Admin is always permitted (no auth mock).

## User UI (`meeting-user.html`)

1. **Sidebar shell** (static nav mock) — highlight “Lịch học trực tuyến”; bottom streak widget replaced by compact next-meeting teaser if useful, primary replacement is the dashboard banner card.
2. **Hero banner** — keep greeting left; **right card replaces streak** with Weekly Meeting design (calendar icon, “WEEKLY MEETING”, date/time pill, “Tham gia →”). Empty state when no registration this week (short CTA to scroll/register).
3. **Summary cards** — available schedules count / registered count (0 or 1 for demo user).
4. **Upcoming list** — date column, title+level badge, description/note, time + “Online qua Google Meet”, status + progress + remaining text, action column:
   - Available → “Đăng ký lịch này”
   - Full → dimmed card, disabled “Đã đủ 10/10”
   - Registered for this session → “Vào phòng học” + “Hủy đăng ký”
   - Has another registration this week → register disabled with hint đã dùng slot tuần

“Vào phòng học” / “Tham gia” open `meetUrl` in a new tab.

## Interactions summary

| Action | Effect |
|--------|--------|
| Admin create/update/delete session | Persist store; refresh list + stats |
| Admin “Tạo Meet” | Fill placeholder Meet URL only |
| Admin restore sample | Reset store to seed |
| User register | Add registration if rules pass; update banner |
| User cancel | Remove registration; free capacity + weekly slot |
| User open Meet | `window.open(meetUrl)` only if registered |

## Out of scope follow-ups (future)

- React pages + Supabase tables (`meeting_sessions`, `meeting_registrations`) with RLS and server-enforced caps.
- Real Google Meet creation.
- Replace production streak widget on `DashboardPage` / `Navigation` with live meeting data.

## Acceptance criteria

- [ ] Both HTML files open without a build step.
- [ ] Admin can create a session with date, times, and Meet link; it appears on the user page after reload (same `localStorage`).
- [ ] Tenth registration disables/dims that session on user page.
- [ ] Second registration in the same Mon–Sun week is blocked until cancel.
- [ ] Cancel allows registering a different session the same week.
- [ ] After register, Weekly Meeting card shows date/time and Join works.
- [ ] Seed + restore sample data work on admin.
