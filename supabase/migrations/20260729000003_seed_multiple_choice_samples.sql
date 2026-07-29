-- =============================================================================
-- DeutschPath — seed 4 câu trắc nghiệm mẫu (multiple_choice) cho lesson a1-l1.
-- Một nhóm (group_id) = một bài tập; số phương án cố tình khác nhau (2/3/4/5)
-- để kiểm chứng label A/B/C/D/E sinh theo vị trí, không hard-code 3 phương án.
-- correct_answer lưu index của phương án đúng dưới dạng chuỗi.
-- =============================================================================

INSERT INTO grammar_exercises (
  lesson_id, type, status, group_id, hint, prompt_text, options, correct_answer, explanation, order_index
) VALUES
('a1-l1', 'multiple_choice', 'published', '3b7c1e64-9a45-4a1f-8f2d-5c0e7a1b4d21',
  'Chú ý đuôi động từ chia theo chủ ngữ.',
  'Wie ___ du?',
  '["heiße", "heißt", "heißen"]'::jsonb, '1',
  'Chủ ngữ "du" đi với đuôi -st: heißt. "heiße" dùng cho "ich", "heißen" dùng cho "sie/Sie/wir".', 28),

('a1-l1', 'multiple_choice', 'published', '3b7c1e64-9a45-4a1f-8f2d-5c0e7a1b4d21',
  'Chú ý đuôi động từ chia theo chủ ngữ.',
  '___ Tag!',
  '["Guten", "Gute"]'::jsonb, '0',
  '"Tag" là danh từ giống đực ở cách 4 (Akkusativ) trong lời chào, nên tính từ lấy đuôi -en: Guten Tag!', 29),

('a1-l1', 'multiple_choice', 'published', '3b7c1e64-9a45-4a1f-8f2d-5c0e7a1b4d21',
  'Chú ý đuôi động từ chia theo chủ ngữ.',
  'Ich komme ___ Vietnam.',
  '["aus", "von", "nach", "in"]'::jsonb, '0',
  'Nói về quê quán / nơi xuất thân dùng "aus": Ich komme aus Vietnam.', 30),

('a1-l1', 'multiple_choice', 'published', '3b7c1e64-9a45-4a1f-8f2d-5c0e7a1b4d21',
  'Chú ý đuôi động từ chia theo chủ ngữ.',
  'Ich ___ 20 Jahre alt.',
  '["bin", "bist", "ist", "sind", "seid"]'::jsonb, '0',
  'Động từ "sein" chia với "ich" là "bin". "bist" đi với du, "ist" với er/sie/es, "sind" với wir/sie/Sie, "seid" với ihr.', 31);
