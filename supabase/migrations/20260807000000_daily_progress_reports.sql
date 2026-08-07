-- =============================================================================
-- DeutschPath — Daily Progress Report (Phase A): thêm subscription_end_date
-- vào profiles, bảng level_enrollments (mốc thời gian mở từng level) và
-- daily_progress_reports (snapshot tiến độ mỗi ngày).
--
-- RLS: chỉ own-read, KHÔNG có policy admin-all — xem bài học từ
-- grammar_attempts cũ (20260730142404_exercise_set_attempts.sql): 1 policy
-- FOR ALL chỉ check app_metadata.role từng lộ dữ liệu user khác qua trang
-- học viên bình thường. Admin đọc/ghi qua edge function dùng service_role,
-- tự check role trong code (không qua RLS).
-- =============================================================================

ALTER TABLE profiles ADD COLUMN subscription_end_date DATE;

CREATE TABLE level_enrollments (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level                    TEXT NOT NULL,
  started_at               DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_completion_date  DATE NOT NULL,
  UNIQUE (user_id, level)
);

ALTER TABLE level_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "level_enrollments: own read"
  ON level_enrollments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE daily_progress_reports (
  id                              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level_id                        TEXT NOT NULL,
  current_lesson_id               TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  report_date                     DATE NOT NULL,
  completed_required_lessons      INTEGER NOT NULL,
  total_required_lessons          INTEGER NOT NULL,
  actual_progress_percentage      NUMERIC NOT NULL,
  expected_progress_percentage    NUMERIC,
  progress_gap_percentage_point   NUMERIC,
  progress_status                 TEXT,
  package_remaining_days          INTEGER,
  generation_status               TEXT NOT NULL DEFAULT 'success',
  error_message                   TEXT,
  generated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, level_id, report_date)
);

CREATE INDEX daily_progress_reports_user_date_idx ON daily_progress_reports (user_id, report_date);

ALTER TABLE daily_progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_progress_reports: own read"
  ON daily_progress_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
