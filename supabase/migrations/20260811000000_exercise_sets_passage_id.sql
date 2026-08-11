-- =============================================================================
-- Mỗi "bài đọc" (exercise_sets category=doc) giờ mang đúng 1 văn bản riêng,
-- tạo cùng lúc với bài đọc thay vì chọn từ danh sách văn bản dùng chung —
-- khớp đúng thiết kế admin mới (thẻ bài đọc = văn bản + các loại câu hỏi).
-- Nullable vì nguphap/nghe không dùng cột này.
-- =============================================================================

ALTER TABLE exercise_sets
  ADD COLUMN passage_id UUID REFERENCES reading_passages(id) ON DELETE SET NULL;
