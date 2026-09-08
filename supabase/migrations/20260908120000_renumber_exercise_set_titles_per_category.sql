-- One-time fix: exercise set default titles were numbered across all
-- categories in a lesson (createSet counted every set). Renumber per
-- (lesson_id, category) so Nghe/Đọc/Ngữ pháp each start at Bài tập 1.
-- Overwrites custom titles — product uses default "Bài tập N" as display index.

WITH ranked AS (
  SELECT
    id,
    (row_number() OVER (
      PARTITION BY lesson_id, category
      ORDER BY order_index ASC, id ASC
    ) - 1) AS new_order_index
  FROM exercise_sets
)
UPDATE exercise_sets e
SET
  order_index = r.new_order_index,
  title = 'Bài tập ' || (r.new_order_index + 1)
FROM ranked r
WHERE e.id = r.id
  AND (
    e.order_index IS DISTINCT FROM r.new_order_index
    OR e.title IS DISTINCT FROM ('Bài tập ' || (r.new_order_index + 1))
  );
