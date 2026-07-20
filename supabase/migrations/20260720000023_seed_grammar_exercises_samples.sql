-- =============================================================================
-- DeutschPath — seed 6 dòng grammar_exercises mẫu (1 dòng/loại) cho lesson
-- a1-l1, dùng làm dữ liệu demo cho Admin + trang học viên mới.
-- =============================================================================

INSERT INTO grammar_exercises (lesson_id, type, status, prompt_text, transformation_hint, correct_answer, tokens, classification_groups, classification_items, explanation, order_index) VALUES
('a1-l1', 'word_reorder', 'published', NULL, NULL, 'Ich höre am Abend Musik.',
  '["am Abend", "ich", "Musik", "höre"]'::jsonb, NULL, NULL,
  'Động từ chia ở vị trí thứ 2, trạng ngữ thời gian "am Abend" có thể đứng đầu hoặc sau động từ.', 1),
('a1-l1', 'error_correction', 'published', 'Ich stehe auf um 7 Uhr.', NULL, 'Ich stehe um 7 Uhr auf.',
  NULL, NULL, NULL,
  'Động từ tách "aufstehen" — phần "auf" phải đứng cuối câu, không đứng ngay sau "stehe".', 1),
('a1-l1', 'translation', 'published', 'Tôi học tiếng Đức.', NULL, 'Ich lerne Deutsch.',
  NULL, NULL, NULL,
  'Chủ ngữ "ich" + động từ chia ngôi 1 số ít "lerne" + tân ngữ.', 1),
('a1-l1', 'sentence_transformation', 'published', 'Du kommst heute.', 'Ja/Nein-Frage', 'Kommst du heute?',
  NULL, NULL, NULL,
  'Câu hỏi Ja/Nein đảo động từ lên đầu câu.', 1),
('a1-l1', 'guided_sentence_writing', 'published', 'Ich bin müde. Ich arbeite. + aber', NULL, 'Ich bin müde, aber ich arbeite.',
  NULL, NULL, NULL,
  'Liên từ "aber" nối 2 mệnh đề độc lập, có dấu phẩy trước "aber".', 1),
('a1-l1', 'classification', 'published', NULL, NULL, NULL,
  NULL, '["der", "die", "das"]'::jsonb,
  '[{"item":"Tisch","group":"der"},{"item":"Lampe","group":"die"},{"item":"Buch","group":"das"}]'::jsonb,
  'Giống đực (der), giống cái (die), giống trung (das) trong tiếng Đức phải học thuộc theo từng danh từ.', 1);
