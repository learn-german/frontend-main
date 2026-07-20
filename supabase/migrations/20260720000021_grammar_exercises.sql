-- =============================================================================
-- DeutschPath — grammar_exercises: 6 dạng bài tập ngữ pháp mới
-- (word_reorder, error_correction, translation, sentence_transformation,
-- guided_sentence_writing, classification), tách biệt với quiz_questions.
-- Scope hiện tại: chỉ Admin CRUD, chưa có consumer phía học viên nên chưa
-- cần view public / SELECT policy cho authenticated.
-- =============================================================================

CREATE TABLE grammar_exercises (
  id                     UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id              TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type                   TEXT    NOT NULL CHECK (type IN (
                            'word_reorder', 'error_correction', 'translation',
                            'sentence_transformation', 'guided_sentence_writing', 'classification'
                          )),
  status                 TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  prompt_text            TEXT,
  transformation_hint    TEXT,
  correct_answer         TEXT,
  tokens                 JSONB,
  classification_groups  JSONB,
  classification_items   JSONB,
  explanation            TEXT    NOT NULL DEFAULT '',
  order_index            INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE grammar_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grammar_exercises: admin write"
  ON grammar_exercises FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
