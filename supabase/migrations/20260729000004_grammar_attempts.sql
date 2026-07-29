-- =============================================================================
-- DeutschPath — grammar_attempts: snapshot lần nộp gần nhất của mỗi
-- (lesson_id, user_id), kèm best_score và attempt_count để card kết quả và
-- Roadmap truy xuất lại được sau khi refresh.
--
-- Chỉ Edge Function grammar-submit (service_role) được ghi: không có policy
-- INSERT/UPDATE cho authenticated, nếu không học viên tự đặt best_score = 100.
-- Bảng không chứa correct_answer nên client đọc trực tiếp qua PostgREST là an toàn.
-- =============================================================================

CREATE TABLE grammar_attempts (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id        TEXT        NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers          JSONB       NOT NULL,
  blank_results    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  choice_results   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  exercise_results JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score            INTEGER     NOT NULL,
  total            INTEGER     NOT NULL,
  best_score       INTEGER     NOT NULL,
  attempt_count    INTEGER     NOT NULL DEFAULT 1,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);

ALTER TABLE grammar_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grammar_attempts: own read"
  ON grammar_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "grammar_attempts: admin all"
  ON grammar_attempts FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
