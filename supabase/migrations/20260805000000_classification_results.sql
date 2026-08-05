-- =============================================================================
-- DeutschPath — exercise_set_attempts.classification_results: đúng/sai từng
-- câu con của bài "Phân loại" (classification), song song blank_results đã
-- có cho "Điền vào ô trống". Trước đây chỉ có exercise_results (đạt/không
-- đạt cả bài), nên frontend không có cách nào hiện đúng/sai từng câu con
-- trước khi revealed=true mà không tự suy luận sai từ dữ liệu đáp án đúng
-- (vốn chỉ gửi khi đã revealed) — xem requirement.md mục "Câu con không
-- hiển thị đúng/sai khi bài chưa Pass".
-- =============================================================================

ALTER TABLE exercise_set_attempts
  ADD COLUMN classification_results JSONB NOT NULL DEFAULT '{}'::jsonb;
