-- =============================================================================
-- DeutschPath — exercise_set_drafts: lưu đáp án học viên đang làm dở, chưa
-- nộp. Khác exercise_set_attempts (chỉ service_role ghi vì liên quan chấm
-- điểm/đáp án đúng) — draft không chứa gì nhạy cảm, học viên tự đọc/ghi
-- trực tiếp qua PostgREST.
--
-- user_id DEFAULT auth.uid(): GrammarExercisePage không nhận user.id qua
-- prop (đúng pattern mọi hook bài tập khác — chỉ dựa RLS lọc hàng của
-- chính mình), nên client không có gì đưa vào payload insert nếu cột
-- không tự điền qua default.
-- =============================================================================

CREATE TABLE exercise_set_drafts (
  user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  set_id     UUID        NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  answers    JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_id)
);

ALTER TABLE exercise_set_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_set_drafts: own read/write"
  ON exercise_set_drafts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
