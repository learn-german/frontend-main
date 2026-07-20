-- =============================================================================
-- DeutschPath — dọn dữ liệu category 'nguphap' cũ trong quiz_questions/
-- lesson_progress. Category 'nguphap' được thay thế hoàn toàn bởi
-- grammar_exercises (6 dạng bài mới). Môi trường dev — không cần bảo toàn
-- điểm/tiến độ học viên cũ.
--
-- Lưu ý: lesson_progress.category='nguphap' cũng được 2 Edge Function
-- lesson-complete và leaderboard dùng làm dấu hiệu chung "đã hoàn thành bài
-- học" (không riêng gì điểm ngữ pháp) — xóa các dòng này reset trạng thái
-- đó cho các lesson tương ứng. Đây là hành vi được xác nhận chấp nhận.
-- =============================================================================

DELETE FROM quiz_questions WHERE category = 'nguphap';
DELETE FROM lesson_progress WHERE category = 'nguphap';
