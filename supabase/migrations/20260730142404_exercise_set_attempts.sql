-- =============================================================================
-- DeutschPath — exercise_set_attempts: thay grammar_attempts, attempt tính
-- theo từng exercise_set thay vì cả lesson. Thêm is_passed/revealed tách
-- biệt (revealed mở vĩnh viễn, không tự tắt) và last_submission_id cho
-- idempotency (double-click/retry không tăng attempt_count).
--
-- Chỉ 1 policy own-read — KHÔNG có admin-all. grammar_attempts từng có
-- policy "admin all" (FOR ALL, chỉ check app_metadata.role) khiến mọi tài
-- khoản admin đọc được kết quả của user khác ngay trên trang học viên bình
-- thường (đã vá migration 20260730000001_grammar_attempts_drop_admin_read_policy.sql).
-- Không lặp lại lỗi đó ở bảng thay thế.
-- =============================================================================

DROP TABLE grammar_attempts;

CREATE TABLE exercise_set_attempts (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  set_id             UUID        NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  category           TEXT        NOT NULL,
  answers            JSONB       NOT NULL,
  blank_results      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  choice_results     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  exercise_results   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score              INTEGER     NOT NULL,
  total              INTEGER     NOT NULL,
  best_score         INTEGER     NOT NULL,
  attempt_count      INTEGER     NOT NULL DEFAULT 1,
  is_passed          BOOLEAN     NOT NULL,
  revealed           BOOLEAN     NOT NULL DEFAULT FALSE,
  last_submission_id TEXT        NOT NULL,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, set_id)
);

ALTER TABLE exercise_set_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_set_attempts: own read"
  ON exercise_set_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Gỡ explanation khỏi view public — giải thích chỉ đi ra từ response của
-- grammar-submit, chỉ khi revealed = true.
DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.set_id,
    g.type,
    g.group_id,
    g.hint,
    g.prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.word_bank,
    g.options,
    g.order_index
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
