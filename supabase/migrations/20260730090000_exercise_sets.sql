-- =============================================================================
-- DeutschPath — exercise_sets: đơn vị "bộ bài tập" — chấm điểm/pass/attempt
-- và published/draft chuyển hẳn lên cấp này (thay vì từng câu hỏi). Mỗi
-- group_id hiện có trong grammar_exercises sẽ ứng đúng 1 exercise_sets row
-- (backfill ở migration kế tiếp).
-- =============================================================================

CREATE TABLE exercise_sets (
  id           UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id    TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL DEFAULT 'nguphap' CHECK (category IN ('nguphap', 'nghe', 'doc')),
  title        TEXT    NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
);

ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_sets: admin write"
  ON exercise_sets FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

ALTER TABLE grammar_exercises
  ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;
