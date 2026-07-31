-- =============================================================================
-- Fix: exercise_sets bật RLS từ đầu nhưng chỉ có policy "admin write" (FOR ALL,
-- yêu cầu role='admin') — chưa từng có policy SELECT cho học viên thường. Hệ
-- quả: GrammarSetListPage/GrammarExerciseFlow đọc thẳng bảng này (không qua
-- view) luôn nhận về 0 dòng với user không phải admin, dù set đã published và
-- có bài tập, khiến trang luôn hiện "chưa được soạn".
-- =============================================================================

CREATE POLICY "exercise_sets: published read"
  ON exercise_sets FOR SELECT
  TO authenticated
  USING (status = 'published');
