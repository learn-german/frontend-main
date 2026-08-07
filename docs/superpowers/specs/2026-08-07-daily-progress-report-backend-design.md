# Daily Progress Report — Phase A (Backend)

## Bối cảnh

`requirement.md` (dòng 109-335) đã có spec rất chi tiết cho tính năng Daily Progress Report: business rules, công thức `actual_progress`/`expected_progress`/`progress_gap`, rule trạng thái theo ngưỡng 5/10 điểm %, schema bảng `daily_progress_reports`, API đề xuất, acceptance criteria. Đây là mục lớn duy nhất còn lại trong roadmap.

Chia 2 phase độc lập:
- **Phase A (spec này)** — backend: schema, edge function tính report, scheduled job, wiring ở Admin để có dữ liệu package/level_enrollments.
- **Phase B (sau)** — frontend: hook + `DailyProgressReportCard` trên Dashboard, cần API thật từ Phase A để test.

## Gap phát hiện so với spec gốc

Spec gốc giả định có sẵn dữ liệu package/subscription và ngày bắt đầu/dự kiến hoàn thành level, nhưng schema hiện tại (`src/lib/database.types.ts`) **không có**:
- Không có bảng `subscriptions`/`packages`. `profiles.is_premium: boolean` tồn tại nhưng **không được đọc/ghi ở đâu trong code** — cột chết.
- Không có `level_started_at`/`planned_completion_date` ở bất kỳ đâu. Việc mở cấp độ hiện tại chỉ là admin tick tay vào `profiles.unlocked_levels: string[]` (`AdminUsersSection.tsx`), không có khái niệm thời hạn.

Xử lý (đã duyệt): thêm field còn thiếu trong migration của phase này, dùng lại `is_premium` làm cờ "package active", thêm bảng `level_enrollments` tự tạo khi admin unlock level.

Tìm được logic dùng lại được: `src/lib/completion.ts` (`computeCompletedLessons`, `computeLessonStatuses`) đã tính đúng "lesson bắt buộc đã hoàn thành"/"lesson hiện tại", và đã tự động loại Schreiben/Sprechen khỏi tiến độ (khớp đúng business rule "Schreiben và Sprechen là bài tập gợi ý, không ảnh hưởng trực tiếp đến tiến độ level" trong spec gốc) — không cần viết lại, chỉ cần port sang bản Deno-local cho edge function (theo đúng pattern hiện tại: mỗi edge function tự chứa code riêng, không cross-import từ `src/lib`, ví dụ `grammar-submit` có `scoring.ts` riêng).

## Kiến trúc

### 1. Data model (migration mới)

**`profiles.subscription_end_date`** — cột mới, `DATE NULL`. Admin set thủ công qua modal sửa user hiện có (`AdminUsersSection.tsx`) — không có hệ thống thanh toán thật nên không tự động được.

**`profiles.is_premium`** — dùng lại cột có sẵn làm cờ "gói đang active", thêm vào modal sửa user (toggle cạnh Role).

**Bảng mới `level_enrollments`**:
```sql
CREATE TABLE level_enrollments (
  id                     UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level                  TEXT NOT NULL,
  started_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_completion_date DATE NOT NULL,
  UNIQUE (user_id, level)
);
```
RLS: chỉ own-read (`user_id = auth.uid()`), không có admin-all policy (theo đúng bài học từ `grammar_attempts` cũ — xem comment trong `20260730142404_exercise_set_attempts.sql`: 1 policy `FOR ALL` admin từng lộ dữ liệu user khác qua trang thường). Admin đọc/ghi qua edge function dùng `service_role`, tự check `app_metadata.role === "admin"` trong code, không qua RLS.

`planned_completion_date = started_at + N ngày`, N cấu hình cứng theo level trong code (không phải bảng DB riêng — chưa cần runtime-configurable ở v1):
```ts
const PLANNED_LEVEL_DAYS: Record<string, number> = { A1: 60, A2: 60, B1: 90, B2: 90 };
```

**Wiring ở Admin**: `handleToggleLevel` (`AdminUsersSection.tsx`) khi BẬT 1 level cho user, upsert `level_enrollments` (`ON CONFLICT (user_id, level) DO NOTHING` — bật/tắt/bật lại không reset `started_at`). Khi TẮT level, không xoá row — giữ làm lịch sử.

**Bảng `daily_progress_reports`** — đúng schema đã có trong `requirement.md` (dòng 225-242): `id, user_id, level_id, current_lesson_id, report_date, completed_required_lessons, total_required_lessons, actual_progress_percentage, expected_progress_percentage, progress_gap_percentage_point, progress_status, package_remaining_days, generation_status, error_message, generated_at, updated_at`. Unique `(user_id, level_id, report_date)`. RLS own-read only (cùng lý do trên).

### 2. Logic tính report (pure function, test được)

Port `computeCompletedLessons`/`computeLessonStatuses` từ `src/lib/completion.ts` thành bản Deno-local trong `supabase/functions/daily-progress-report/completion.ts` (copy nguyên, không đổi hành vi).

Hàm mới `computeDailyProgressReport(input)` trong `supabase/functions/daily-progress-report/report.ts`, implement đúng công thức/ngưỡng đã có sẵn trong `requirement.md`:
- `actual_progress = completed_required_lessons / total_required_lessons × 100`, clamp 0-100.
- `expected_progress = elapsed_days_from_level_start / planned_level_days × 100`, clamp 0-100; `elapsed_days_from_level_start = report_date - level_started_at`, `planned_level_days = planned_completion_date - level_started_at`.
- Nếu `planned_level_days <= 0` hoặc thiếu `level_started_at`/`planned_completion_date` (chưa có `level_enrollments` row) → `generation_status = "insufficient_data"`, không gán `progress_status`.
- `progress_gap = expected_progress - actual_progress`.
- `progress_status`: `progress_gap < 5` → `on_track`; `5 <= progress_gap < 10` → `attention`; `>= 10` → `behind`.
- `package_remaining_days = max(subscription_end_date - report_date, 0)`.
- Không chia cho 0: `total_required_lessons === 0` → `insufficient_data` (lesson chưa soạn xong cho level đó).

### 3. Edge function `daily-progress-report`

Theo đúng pattern các edge function hiện có (1 file `index.ts`, service_role client, JWT qua `getUser()`):

- **`GET`** (learner, JWT thường): xác định "level hiện tại" bằng cách duyệt `unlocked_levels` của user theo thứ tự A1→A2→B1→B2, dùng `computeLessonStatuses` cho từng level — level đầu tiên (theo thứ tự đó) có ít nhất 1 lesson ở trạng thái `"current"` là level hiện tại; nếu mọi level unlock đều đã hoàn thành 100%, dùng level cuối cùng trong `unlocked_levels`. Tính report tươi cho user đó ngay lúc gọi, `upsert` vào `daily_progress_reports` cho `report_date = hôm nay`, trả về. Đây là cách "report của ngày hiện tại được cập nhật khi học viên hoàn thành lesson" — không cần hook vào `grammar-submit`/`lesson-complete`, chỉ cần học viên mở lại Dashboard là tính lại mới nhất.
  - User không có package active (`is_premium=false` hoặc `subscription_end_date` null/quá hạn) hoặc không có level nào unlock → trả về trạng thái tương ứng (`empty`/`insufficient_data`), KHÔNG ghi row vào `daily_progress_reports` (đúng rule "chỉ tạo report cho user có package active và level đang học").
- **`GET ?history=1&from=...&to=...`**: đọc thẳng `daily_progress_reports` đã lưu, không tính lại (lịch sử là snapshot, đúng rule "report của các ngày trước không tự thay đổi").
- **`POST { user_id, regenerate: true }`**: admin-only, check `user.app_metadata?.role === "admin"` (đúng pattern `set-admin-role/index.ts`) → 403 nếu không phải admin. Force tính lại report của `user_id` cho hôm nay.
- **`POST { mode: "batch" }`** (gọi từ cron, xem mục 4): loop toàn bộ user có package active + có level unlock, tính + upsert report hôm nay cho từng người. Mục đích: user không mở Dashboard hôm đó vẫn có snapshot lịch sử; nếu user có mở Dashboard, `GET` ở trên đã ghi đè bằng dữ liệu mới hơn — không xung đột vì cùng `upsert` theo unique key.

### 4. Scheduled job

Migration bật extension `pg_cron` + `pg_net`, tạo 1 cron job gọi `POST` tới edge function với `mode: "batch"` hàng ngày. Giờ chạy 00:05 giờ Việt Nam (ICT, UTC+7) = `17:05` UTC hôm trước → cron expression `5 17 * * *` (pg_cron chạy theo UTC mặc định). Auth bằng `service_role` key lưu trong Vault/cấu hình cron job (không hardcode secret vào SQL).

## Không đổi

- Không đổi `completion.ts`/`RoadmapPage`/`AdminUsersSection`'s hành vi hiện có ngoài phần wiring `level_enrollments` mới thêm vào `handleToggleLevel`.
- Không tự động hoá thanh toán/gia hạn gói — `subscription_end_date`/`is_premium` vẫn do admin set tay ở phase này.
- Không làm frontend (`DailyProgressReportCard`, hook) — thuộc Phase B.
- Không thêm npm package mới. `pg_cron`/`pg_net` là extension Postgres có sẵn trong Supabase, bật qua migration.

## Testing

- `computeDailyProgressReport`: unit test biên `progress_gap` = 5 và 10 (theo đúng yêu cầu Definition of Done trong `requirement.md`), test `insufficient_data` khi thiếu `level_enrollments`/`total_required_lessons = 0`, test `package_remaining_days` không âm.
- Port `completion.ts` sang Deno-local: test lại các case đã có trong `completion.test.ts` (copy nguyên, xác nhận hành vi giống hệt bản gốc).
- `npm run lint` sau khi sửa TypeScript phía admin (`handleToggleLevel`).
- Xác minh thủ công (sandbox không có `.env.local`, không tự chạy migration/cron được): áp migration lên project dev, tick unlock level cho 1 user test qua Admin, gọi `GET` bằng Postman/curl với JWT thật, xác nhận `level_enrollments` được tạo đúng và report tính đúng số.

## Rủi ro

- Áp migration lên **production Supabase** (`awdhqlgxnjwymwgxltlw`) — theo quy ước đã thống nhất trong phiên làm việc trước, được phép đè/backfill data cũ vì đang dev, nhưng migration DDL (tạo bảng/cột mới) là thay đổi schema thật, cần chạy cẩn thận, xác nhận trước khi áp.
- Bật `pg_cron` là thay đổi hạ tầng DB (extension), không tự rollback dễ dàng bằng 1 lệnh nếu có vấn đề — cần theo dõi sau khi deploy.
- RLS mới cho 2 bảng phải test kỹ own-read-only, tránh lặp lại lỗi rò rỉ dữ liệu qua policy `FOR ALL` như `grammar_attempts` cũ.
