-- =============================================================================
-- DeutschPath — grammar_exercises.group_id: đánh dấu các câu con được tạo
-- cùng 1 lần (1 lần bấm "+ Thêm câu cùng loại" trong admin) là cùng 1 "câu"
-- cha khi hiển thị cho học viên. NULL cho các bản ghi cũ — phía client coi
-- mỗi bản ghi group_id = NULL như 1 nhóm riêng của chính nó.
-- =============================================================================

ALTER TABLE grammar_exercises
  ADD COLUMN group_id UUID;
