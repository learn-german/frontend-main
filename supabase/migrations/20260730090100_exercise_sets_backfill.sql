-- =============================================================================
-- DeutschPath — backfill exercise_sets từ group_id hiện có, xóa câu mồ côi
-- (group_id IS NULL — di sản trước khi có cột group_id), khóa set_id NOT
-- NULL, xóa cột status khỏi grammar_exercises (chuyển hẳn lên exercise_sets).
--
-- An toàn theo giả định nền: hệ thống chưa có user thật dùng grammar_attempts
-- gắn với các câu bị xóa — grammar_attempts không tham chiếu khóa ngoại tới
-- grammar_exercises nên không bị ảnh hưởng bởi DELETE dưới đây.
-- =============================================================================

WITH group_to_set AS (
  INSERT INTO exercise_sets (lesson_id, category, title, order_index, status)
  SELECT
    lesson_id,
    'nguphap',
    'Bài tập ' || row_number() OVER (PARTITION BY lesson_id ORDER BY min(order_index)),
    min(order_index),
    CASE WHEN bool_and(status = 'published') THEN 'published' ELSE 'draft' END
  FROM grammar_exercises
  WHERE group_id IS NOT NULL
  GROUP BY lesson_id, group_id
  RETURNING id, lesson_id, title, order_index
),
group_key AS (
  SELECT lesson_id, group_id, min(order_index) AS min_order
  FROM grammar_exercises
  WHERE group_id IS NOT NULL
  GROUP BY lesson_id, group_id
)
UPDATE grammar_exercises g
SET set_id = gts.id
FROM group_key gk
JOIN group_to_set gts ON gts.lesson_id = gk.lesson_id AND gts.order_index = gk.min_order
WHERE g.group_id = gk.group_id AND g.lesson_id = gk.lesson_id;

DELETE FROM grammar_exercises WHERE group_id IS NULL;

ALTER TABLE grammar_exercises ALTER COLUMN set_id SET NOT NULL;
ALTER TABLE grammar_exercises DROP COLUMN status;
